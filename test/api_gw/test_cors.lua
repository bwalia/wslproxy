-- Contract tests for per-tenant CORS and preflight handling.
-- Run: lua test/api_gw/test_cors.lua

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local Cors = require("api_gw.cors")

local function cfg_for(api_gw, server_name)
    return Config.resolve({ server_name = server_name or "api.example.com", api_gw = api_gw }, nil, "prod")
end

local function run(cfg, ctx)
    return Cors.run(cfg, ctx, Config.policy(cfg, Config.route_for(cfg, ctx.uri, ctx.method)))
end

-- ─── origin matching ────────────────────────────────────────────────────────

local origins = { "https://app.example.com", "https://*.partner.example", "http://localhost:3000" }

A.ok(Cors.origin_allowed(origins, "https://app.example.com"), "exact origin matches")
A.falsy(Cors.origin_allowed(origins, "https://App.example.com"), "origin comparison is case-sensitive, per spec")
A.falsy(Cors.origin_allowed(origins, "http://app.example.com"), "scheme must match")
A.ok(Cors.origin_allowed(origins, "https://a.partner.example"), "single-label wildcard matches")
A.ok(Cors.origin_allowed(origins, "https://deep.a.partner.example"), "wildcard matches deeper labels")
A.falsy(Cors.origin_allowed(origins, "https://partner.example"), "wildcard does not match the bare domain")
A.falsy(Cors.origin_allowed(origins, "https://evil-partner.example"),
    "wildcard does not match a lookalike suffix — this is the classic CORS bypass")
A.falsy(Cors.origin_allowed(origins, "https://partner.example.attacker.com"),
    "wildcard does not match when the allowed domain is a prefix")
A.falsy(Cors.origin_allowed(origins, ""), "empty origin never matches")
A.falsy(Cors.origin_allowed({}, "https://app.example.com"), "an empty allowlist matches nothing")

local allowed, wildcard = Cors.origin_allowed({ "*" }, "https://anything.example")
A.ok(allowed, "* matches any origin")
A.ok(wildcard, "and reports itself as a wildcard")

-- ─── simple (non-preflight) requests ────────────────────────────────────────

H.reset()
local cfg = cfg_for({ enabled = true, cors = { origins = origins, expose_headers = { "X-Correlation-ID" } } })

local ctx = Stub.context({ method = "GET", uri = "/v1/x", headers = { origin = "https://app.example.com" } })
A.is_nil(run(cfg, ctx), "a simple request is not terminated")
A.eq(ctx.response_headers["Access-Control-Allow-Origin"], "https://app.example.com", "the origin is echoed")
A.eq(ctx.response_headers["Vary"], "Origin", "a per-origin response is marked Vary: Origin")
A.eq(ctx.response_headers["Access-Control-Expose-Headers"], "X-Correlation-ID", "expose list is emitted")
A.is_nil(ctx.response_headers["Access-Control-Allow-Methods"], "a simple request gets no preflight headers")

ctx = Stub.context({ method = "GET", uri = "/v1/x", headers = { origin = "https://evil.example" } })
A.is_nil(run(cfg, ctx), "a disallowed origin is not blocked server-side")
A.is_nil(ctx.response_headers["Access-Control-Allow-Origin"],
    "but it gets no CORS headers, so the browser refuses the response")
A.eq(ctx.cors.allowed, false, "the verdict is recorded for the audit log")

ctx = Stub.context({ method = "GET", uri = "/v1/x" })
A.is_nil(run(cfg, ctx), "a request with no Origin is untouched")
A.is_nil(ctx.response_headers["Access-Control-Allow-Origin"], "and gets no CORS headers")
A.is_nil(ctx.cors, "and nothing is recorded")

-- ─── preflight ──────────────────────────────────────────────────────────────

H.reset()
ctx = Stub.context({
    method = "OPTIONS", uri = "/v1/x",
    headers = { origin = "https://app.example.com", ["access-control-request-method"] = "POST" },
})
local decision = run(cfg, ctx)
A.ok(decision, "a preflight terminates the pipeline")
A.eq(decision.action, "finish", "it finishes rather than denying")
A.eq(decision.status, 204, "204 is the default preflight status")
A.eq(decision.headers["Access-Control-Allow-Methods"], "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "allowed methods are advertised")
A.eq(decision.headers["Access-Control-Allow-Headers"], "Authorization, Content-Type", "allowed headers are advertised")
A.eq(decision.headers["Access-Control-Max-Age"], "3600", "max-age is advertised")

-- OPTIONS without Access-Control-Request-Method is an ordinary OPTIONS call.
ctx = Stub.context({ method = "OPTIONS", uri = "/v1/x", headers = { origin = "https://app.example.com" } })
A.is_nil(run(cfg, ctx), "a bare OPTIONS is not treated as a preflight")

-- preflight_continue lets the origin answer OPTIONS itself.
H.reset()
local continue_cfg = cfg_for({ enabled = true,
    cors = { origins = origins, preflight_continue = true } })
ctx = Stub.context({ method = "OPTIONS", uri = "/v1/x",
    headers = { origin = "https://app.example.com", ["access-control-request-method"] = "POST" } })
A.is_nil(run(continue_cfg, ctx), "preflight_continue forwards the preflight upstream")
A.eq(ctx.response_headers["Access-Control-Allow-Methods"], "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    "and still attaches the negotiated headers")

-- A preflight from a disallowed origin still gets an answer, just a bare one:
-- a 403 would leak which origins are configured and gives a worse console error.
ctx = Stub.context({ method = "OPTIONS", uri = "/v1/x",
    headers = { origin = "https://evil.example", ["access-control-request-method"] = "POST" } })
decision = run(cfg, ctx)
A.ok(decision, "a disallowed preflight is still answered here")
A.eq(decision.action, "finish", "without a denial status")
A.is_nil(ctx.response_headers["Access-Control-Allow-Origin"], "and with no CORS headers")

-- ─── credentials ────────────────────────────────────────────────────────────

H.reset()
local cred = cfg_for({ enabled = true, cors = { origins = { "*" }, credentials = true } })
ctx = Stub.context({ method = "GET", uri = "/", headers = { origin = "https://app.example.com" } })
run(cred, ctx)
A.eq(ctx.response_headers["Access-Control-Allow-Origin"], "https://app.example.com",
    "a credentialed wildcard echoes the concrete origin — '*' with credentials is rejected by browsers")
A.eq(ctx.response_headers["Access-Control-Allow-Credentials"], "true", "credentials are advertised")
A.eq(ctx.response_headers["Vary"], "Origin", "and the response is marked Vary: Origin")

local plain_wildcard = cfg_for({ enabled = true, cors = { origins = { "*" } } })
ctx = Stub.context({ method = "GET", uri = "/", headers = { origin = "https://anything.example" } })
run(plain_wildcard, ctx)
A.eq(ctx.response_headers["Access-Control-Allow-Origin"], "*",
    "without credentials the literal wildcard is emitted, which caches better")

-- ─── per-tenant separation ──────────────────────────────────────────────────

H.reset()
local tenant_a = cfg_for({ enabled = true, cors = { origins = { "https://a-app.example" } } }, "a.example.com")
local tenant_b = cfg_for({ enabled = true, cors = { origins = { "https://b-app.example" } } }, "b.example.com")

local a_ctx = Stub.context({ method = "GET", uri = "/", headers = { origin = "https://a-app.example" } })
run(tenant_a, a_ctx)
A.eq(a_ctx.response_headers["Access-Control-Allow-Origin"], "https://a-app.example", "tenant A allows its own origin")

local cross = Stub.context({ method = "GET", uri = "/", headers = { origin = "https://a-app.example" } })
run(tenant_b, cross)
A.is_nil(cross.response_headers["Access-Control-Allow-Origin"],
    "tenant B does not inherit tenant A's allowlist")

-- ─── per-route override ─────────────────────────────────────────────────────

H.reset()
local per_route = cfg_for({
    enabled = true,
    cors = { origins = { "https://app.example.com" } },
    routes = { { path = "/v1/embed", cors = { origins = { "*" } } } },
})
ctx = Stub.context({ method = "GET", uri = "/v1/embed/widget", headers = { origin = "https://any.example" } })
run(per_route, ctx)
A.eq(ctx.response_headers["Access-Control-Allow-Origin"], "*", "a route can widen CORS for its own paths")

ctx = Stub.context({ method = "GET", uri = "/v1/private", headers = { origin = "https://any.example" } })
run(per_route, ctx)
A.is_nil(ctx.response_headers["Access-Control-Allow-Origin"], "other paths keep the server policy")

-- A route override must touch ONLY what it declares. Normalising the route's
-- table first would fill in every default and quietly reset the rest.
H.reset()
local partial = cfg_for({
    enabled = true,
    cors = { origins = { "https://app.example.com" }, credentials = true, max_age = 600,
             expose_headers = { "X-Correlation-ID" } },
    routes = { { path = "/v1/embed", cors = { origins = { "https://embed.example" } } } },
})
ctx = Stub.context({ method = "GET", uri = "/v1/embed/widget", headers = { origin = "https://embed.example" } })
run(partial, ctx)
A.eq(ctx.response_headers["Access-Control-Allow-Origin"], "https://embed.example", "the route widens origins")
A.eq(ctx.response_headers["Access-Control-Allow-Credentials"], "true",
    "and does NOT reset credentials, which it never mentioned")
A.eq(ctx.response_headers["Access-Control-Expose-Headers"], "X-Correlation-ID",
    "nor the server's expose list")

ctx = Stub.context({ method = "OPTIONS", uri = "/v1/embed/widget",
    headers = { origin = "https://embed.example", ["access-control-request-method"] = "POST" } })
local partial_pre = run(partial, ctx)
A.eq(partial_pre.headers["Access-Control-Max-Age"], "600", "nor the server's max-age")

-- ─── disabled ───────────────────────────────────────────────────────────────

H.reset()
local disabled = cfg_for({ enabled = true, cors = { enabled = false, origins = { "*" } } })
ctx = Stub.context({ method = "OPTIONS", uri = "/",
    headers = { origin = "https://app.example.com", ["access-control-request-method"] = "POST" } })
A.is_nil(run(disabled, ctx), "a disabled CORS module handles nothing")
A.is_nil(ctx.response_headers["Access-Control-Allow-Origin"], "and emits nothing")

A.done("test_cors")
