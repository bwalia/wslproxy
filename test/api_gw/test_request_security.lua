-- Contract tests for correlation IDs, content-type enforcement and body limits.
-- Run: lua test/api_gw/test_request_security.lua

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local RS = require("api_gw.request_security")

local function cfg_for(request_security, extra)
    local api_gw = { enabled = true, request_security = request_security }
    for k, v in pairs(extra or {}) do api_gw[k] = v end
    return Config.resolve({ server_name = "api.example.com", api_gw = api_gw }, nil, "prod")
end

local function enforce(cfg, ctx)
    return RS.enforce(cfg, ctx, Config.policy(cfg, Config.route_for(cfg, ctx.uri, ctx.method)))
end

-- ─── correlation id ─────────────────────────────────────────────────────────

A.ok(RS.valid_id("abc-123_x.y:z"), "the safe charset is accepted")
A.falsy(RS.valid_id("abc 123"), "a space is rejected")
A.falsy(RS.valid_id("abc\ndef"), "a newline is rejected — it would forge a log line")
A.falsy(RS.valid_id('abc"def'), "a quote is rejected — it would break the JSON audit line")
A.falsy(RS.valid_id(""), "an empty id is rejected")
A.falsy(RS.valid_id(nil), "a missing id is rejected")
A.falsy(RS.valid_id(string.rep("a", 200)), "an over-long id is rejected")
A.ok(RS.valid_id(string.rep("a", 200), 256), "the length cap is configurable")

H.reset()
local cfg = cfg_for({})
local ctx = Stub.context({})
RS.correlate(cfg, ctx)
A.ok(ctx.correlation_id, "an id is generated when none arrives")
A.eq(ctx.correlation_inbound, false, "and it is marked as generated")
A.eq(ctx.response_headers["X-Correlation-ID"], ctx.correlation_id, "it is echoed downstream")
A.eq(H.set_headers["X-Correlation-ID"], ctx.correlation_id, "and propagated upstream")

H.reset()
ctx = Stub.context({ headers = { ["x-correlation-id"] = "trace-abc-123" } })
RS.correlate(cfg, ctx)
A.eq(ctx.correlation_id, "trace-abc-123", "a valid inbound id is adopted")
A.eq(ctx.correlation_inbound, true, "and marked as inbound")

H.reset()
ctx = Stub.context({ headers = { ["x-correlation-id"] = "bad id\nwith newline" } })
RS.correlate(cfg, ctx)
A.ne(ctx.correlation_id, "bad id\nwith newline", "an unsafe inbound id is replaced, not sanitised in place")
A.ok(RS.valid_id(ctx.correlation_id), "the replacement is safe")
A.eq(H.set_headers["X-Correlation-ID"], ctx.correlation_id,
    "and upstream sees the replacement, never the original")

H.reset()
local custom = cfg_for({ correlation = { header = "X-Request-Id", echo_downstream = false } })
ctx = Stub.context({ headers = { ["x-request-id"] = "req-1" } })
RS.correlate(custom, ctx)
A.eq(ctx.correlation_id, "req-1", "the header name is configurable")
A.is_nil(ctx.response_headers["X-Request-Id"], "echoing downstream can be switched off")

H.reset()
local no_inbound = cfg_for({ correlation = { accept_inbound = false } })
ctx = Stub.context({ headers = { ["x-correlation-id"] = "client-supplied" } })
RS.correlate(no_inbound, ctx)
A.ne(ctx.correlation_id, "client-supplied", "a tenant can refuse client-supplied ids outright")

H.reset()
local off = cfg_for({ correlation = { enabled = false } })
ctx = Stub.context({})
RS.correlate(off, ctx)
A.is_nil(ctx.correlation_id, "correlation can be switched off")

-- Two requests must not share an id.
H.reset()
local a, b = Stub.context({}), Stub.context({})
ngx.var.connection = "1"; RS.correlate(cfg, a)
ngx.var.connection = "2"; RS.correlate(cfg, b)
A.ne(a.correlation_id, b.correlation_id, "generated ids differ between requests")

-- ─── content type ───────────────────────────────────────────────────────────

A.eq(RS.media_type("application/json; charset=utf-8"), "application/json", "parameters are stripped")
A.eq(RS.media_type("  APPLICATION/JSON  "), "application/json", "media types are lower-cased and trimmed")
A.is_nil(RS.media_type(nil), "a missing content type parses to nil")

local allow = { ["application/json"] = true }
A.ok(RS.content_type_allowed(allow, "application/json"), "an allowed type passes")
A.ok(RS.content_type_allowed(allow, "application/json;charset=utf-8"), "with parameters too")
A.falsy(RS.content_type_allowed(allow, "text/html"), "a disallowed type fails")
A.falsy(RS.content_type_allowed(allow, nil), "an absent type fails when enforcement is on")
A.ok(RS.content_type_allowed({ ["application/*"] = true }, "application/xml"), "a family wildcard works")
A.ok(RS.content_type_allowed({ ["*/*"] = true }, "anything/at-all"), "the full wildcard works")

H.reset()
local strict = cfg_for({
    content_type = { enforce = true, allow = { "application/json" }, exempt_paths = { "/v1/upload" } },
})

A.is_nil(enforce(strict, Stub.context({ method = "GET", uri = "/v1/x" })),
    "GET is not in the enforced method set")
A.is_nil(enforce(strict, Stub.context({ method = "POST", uri = "/v1/x",
    headers = { ["content-type"] = "application/json" } })), "a JSON POST passes")

local bad = enforce(strict, Stub.context({ method = "POST", uri = "/v1/x",
    headers = { ["content-type"] = "text/html" } }))
A.ok(bad, "a non-JSON POST is rejected")
A.eq(bad.status, 415, "with 415")
A.eq(bad.code, "unsupported_media_type", "and a stable code")

A.ok(enforce(strict, Stub.context({ method = "POST", uri = "/v1/x" })),
    "a POST with no Content-Type at all is rejected")

A.is_nil(enforce(strict, Stub.context({ method = "POST", uri = "/v1/upload/file",
    headers = { ["content-type"] = "multipart/form-data; boundary=x" } })),
    "an exempt path accepts multipart")

A.is_nil(enforce(strict, Stub.context({ method = "POST", uri = "/v1/x",
    headers = { ["content-length"] = "0" } })), "a body-less POST has nothing to type-check")

-- ─── body size ──────────────────────────────────────────────────────────────

H.reset()
local sized = cfg_for({ max_body_bytes = 1024 })
A.is_nil(enforce(sized, Stub.context({ method = "POST", headers = { ["content-length"] = "512" } })),
    "a small body passes")
local big = enforce(sized, Stub.context({ method = "POST", headers = { ["content-length"] = "4096" } }))
A.ok(big, "an over-sized body is rejected")
A.eq(big.status, 413, "with 413")
A.eq(big.detail.limit, 1024, "and reports the limit")

A.is_nil(enforce(sized, Stub.context({ method = "POST" })),
    "a chunked body with no Content-Length passes by default — nginx's client_max_body_size is the backstop")

H.reset()
local demanding = cfg_for({ max_body_bytes = 1024, require_content_length = true })
local no_len = enforce(demanding, Stub.context({ method = "POST" }))
A.ok(no_len, "a tenant can require Content-Length")
A.eq(no_len.status, 411, "answered with 411")
A.is_nil(enforce(demanding, Stub.context({ method = "GET" })),
    "and GET is not affected")

-- Per-route body limits override the server default.
H.reset()
local per_route = cfg_for({ max_body_bytes = 1048576 },
    { routes = { { path = "/v1/login", max_body_bytes = 512 } } })
A.ok(enforce(per_route, Stub.context({ method = "POST", uri = "/v1/login",
    headers = { ["content-length"] = "2048" } })), "the tight route limit applies")
A.is_nil(enforce(per_route, Stub.context({ method = "POST", uri = "/v1/bulk",
    headers = { ["content-length"] = "2048" } })), "other routes keep the generous default")

-- ─── token typ ──────────────────────────────────────────────────────────────

local function jws(header_tbl, payload_tbl)
    return Stub.b64url(Cjson.encode(header_tbl)) .. "." ..
        Stub.b64url(Cjson.encode(payload_tbl or { sub = "u1" })) .. ".sig"
end

A.eq(RS.token_typ("Bearer " .. jws({ alg = "HS256", typ = "JWT" })), "JWT", "typ is read from the header segment")
A.eq(RS.token_typ(jws({ alg = "HS256", typ = "at+jwt" })), "at+jwt", "a bare token works too")
A.is_nil(RS.token_typ("Bearer not-a-jwt"), "a non-JWS parses to nil")
A.is_nil(RS.token_typ(nil), "an absent header parses to nil")
A.is_nil(RS.token_typ("Bearer " .. jws({ alg = "HS256" })), "a header with no typ parses to nil")

H.reset()
local typed = cfg_for({ token_typ = { enabled = true, expect = { "JWT" }, mode = "audit" } })
ctx = Stub.context({ headers = { authorization = "Bearer " .. jws({ alg = "HS256", typ = "JWT" }) } })
A.is_nil(enforce(typed, ctx), "an expected typ passes")
A.eq(#ctx.findings, 0, "and records nothing")

ctx = Stub.context({ headers = { authorization = "Bearer " .. jws({ alg = "HS256", typ = "OTHER" }) } })
A.is_nil(enforce(typed, ctx), "audit mode does not reject an unexpected typ")
A.eq(#ctx.findings, 1, "but it is recorded")
A.eq(ctx.findings[1].signal, "token_typ", "under the right signal name")

H.reset()
local typed_block = cfg_for({ token_typ = { enabled = true, expect = { "JWT" }, mode = "block" } })
local rejected = enforce(typed_block, Stub.context({
    headers = { authorization = "Bearer " .. jws({ alg = "HS256", typ = "OTHER" }) } }))
A.ok(rejected, "block mode rejects an unexpected typ")
A.eq(rejected.status, 400, "with 400")

A.is_nil(enforce(typed_block, Stub.context({})),
    "no Authorization header means nothing to check — auth decides whether that matters")

A.done("test_request_security")
