-- End-to-end contract tests for the staged pipeline and the package façade.
-- Run: lua test/api_gw/test_pipeline.lua
--
-- These are the acceptance tests from the feature brief:
--   * two tenants run different rate/auth/ivt modes with no crosstalk
--   * a demo host turns on rate_limit + cors + audit + IVT audit with JSON only
--   * the pipeline order is deterministic

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local Pipeline = require("api_gw.pipeline")
local ApiGw = require("api_gw")

local function server(name, api_gw)
    return { server_name = name, api_gw = api_gw }
end

local function run(cfg, ctx)
    return Pipeline.run(cfg, ctx)
end

-- ─── the order is fixed and deterministic ───────────────────────────────────

local order = Pipeline.order()
local names = {}
for _, s in ipairs(order) do names[#names + 1] = s.stage end
A.eq(table.concat(names, ","),
    "real_ip,correlation,cors,ivt,request_security,auth,rate_limit",
    "the documented pipeline order")

for i = 2, #order do
    A.ok(order[i - 1].priority > order[i].priority,
        "priorities strictly descend at position " .. i)
end
A.eq(table.concat(names, ","), table.concat((function()
    local n = {}
    for _, s in ipairs(ApiGw.pipeline_order()) do n[#n + 1] = s.stage end
    return n
end)(), ","), "the façade exposes the same order the runtime uses")

-- Auth must precede rate_limit, or per-consumer quotas cannot work.
local pos = {}
for i, s in ipairs(order) do pos[s.stage] = i end
A.ok(pos.auth < pos.rate_limit, "auth runs before rate_limit so quotas can key on the consumer")
A.ok(pos.real_ip < pos.rate_limit, "real_ip runs before rate_limit so per-IP quotas are honest")
A.ok(pos.correlation < pos.cors, "correlation runs before anything that can terminate a request")
A.ok(pos.cors < pos.auth, "a preflight is answered before auth, which it can never satisfy")
A.ok(pos.ivt < pos.auth, "cheap structural checks run before the verifier")

-- ─── ACCEPTANCE: a demo host with JSON config only ──────────────────────────
-- rate_limit + cors + audit + IVT in audit mode, nothing app-specific.

local DEMO = {
    enabled = true,
    modules = { "real_ip", "request_security", "cors", "ivt", "rate_limit", "audit" },
    cors = { origins = { "https://demo-app.example" }, expose_headers = { "X-Correlation-ID" } },
    ivt = { mode = "audit", path_denylist = { "/wp-admin" }, methods = { deny = { "TRACE" } } },
    rate_limit = {
        default_profile = "standard", algorithm = "fixed",
        profiles = { standard = { limit = 5, window_seconds = 60, key = "ip" } },
    },
}

H.reset()
local demo = Config.resolve(server("demo.example.com", DEMO), nil, "prod")
A.ok(demo, "the demo config resolves")

local ctx = Stub.context({ method = "GET", uri = "/v1/items", client_ip = "198.51.100.30",
    headers = { origin = "https://demo-app.example" } })
A.is_nil(run(demo, ctx), "ordinary traffic passes")
A.ok(ctx.correlation_id, "it gets a correlation id")
A.eq(ctx.response_headers["Access-Control-Allow-Origin"], "https://demo-app.example", "and CORS headers")
A.eq(ctx.response_headers["RateLimit-Limit"], "5", "and rate-limit headers")
A.eq(ctx.ivt.verdict, "clean", "and an IVT verdict")

-- IVT in audit mode observes without acting.
local scanner = Stub.context({ method = "TRACE", uri = "/wp-admin/setup.php", client_ip = "198.51.100.31" })
A.is_nil(run(demo, scanner), "audit mode lets a scanner through")
A.eq(scanner.ivt.verdict, "suspect", "while recording what it was")

-- But the rate limit still applies to it.
H.reset()
for _ = 1, 5 do run(demo, Stub.context({ uri = "/v1/items", client_ip = "198.51.100.32" })) end
local blocked = run(demo, Stub.context({ uri = "/v1/items", client_ip = "198.51.100.32" }))
A.ok(blocked, "the rate limit is enforced")
A.eq(blocked.status, 429, "with 429")
A.eq(blocked.stage, "rate_limit", "and the decision names the stage that produced it")

-- Auth was not in the module list, so it never ran.
A.is_nil(ctx.auth, "an unlisted module does not run at all")

-- ─── ACCEPTANCE: two tenants, different policies, no crosstalk ──────────────

local TENANT_A = {
    enabled = true,
    ivt = { mode = "block", methods = { deny = { "TRACE" } }, block_threshold = 1 },
    auth = { strategy = "api_key", api_key = { keys = { "key-for-a" } } },
    rate_limit = { default_profile = "p", algorithm = "fixed",
        profiles = { p = { limit = 2, window_seconds = 60, key = "ip" } } },
    cors = { origins = { "https://a-app.example" } },
}

local TENANT_B = {
    enabled = true,
    ivt = { mode = "audit" },
    auth = { strategy = "passthrough" },
    rate_limit = { default_profile = "p", algorithm = "fixed",
        profiles = { p = { limit = 100, window_seconds = 60, key = "ip" } } },
    cors = { origins = { "https://b-app.example" } },
}

H.reset()
local a = Config.resolve(server("a.example.com", TENANT_A), nil, "prod")
local b = Config.resolve(server("b.example.com", TENANT_B), nil, "prod")
local CLIENT = "203.0.113.90"

-- A blocks TRACE, B only notes it.
A.ok(run(a, Stub.context({ method = "TRACE", uri = "/", client_ip = CLIENT })),
    "tenant A blocks a denied method")
local b_trace = Stub.context({ method = "TRACE", uri = "/", client_ip = CLIENT })
A.is_nil(run(b, b_trace), "tenant B, in audit mode, does not")

-- A requires a key, B does not.
A.ok(run(a, Stub.context({ uri = "/v1/x", client_ip = CLIENT })), "tenant A requires a credential")
A.is_nil(run(b, Stub.context({ uri = "/v1/x", client_ip = CLIENT })), "tenant B does not")
A.ok(run(b, Stub.context({ uri = "/v1/x", client_ip = CLIENT,
    headers = { ["x-api-key"] = "key-for-a" } })) == nil, "and ignores tenant A's key entirely")

-- Exhausting A's tight quota leaves B's untouched.
H.reset()
local keyed = function() return { ["x-api-key"] = "key-for-a" } end
run(a, Stub.context({ uri = "/v1/x", client_ip = CLIENT, headers = keyed() }))
run(a, Stub.context({ uri = "/v1/x", client_ip = CLIENT, headers = keyed() }))
local a_limited = run(a, Stub.context({ uri = "/v1/x", client_ip = CLIENT, headers = keyed() }))
A.ok(a_limited, "tenant A hits its limit of 2")
A.eq(a_limited.status, 429, "with 429")

local b_ctx = Stub.context({ uri = "/v1/x", client_ip = CLIENT })
A.is_nil(run(b, b_ctx), "tenant B is unaffected")
A.eq(b_ctx.rate_limit.count, 1, "and its counter started from zero")

-- CORS allowlists do not leak between tenants.
H.reset()
local cross = Stub.context({ uri = "/v1/x", client_ip = CLIENT,
    headers = { origin = "https://a-app.example", ["x-api-key"] = "key-for-a" } })
run(b, cross)
A.is_nil(cross.response_headers["Access-Control-Allow-Origin"],
    "tenant B does not honour tenant A's origin")

-- ─── stage ordering is observable ───────────────────────────────────────────

-- A preflight from an allowed origin is answered before auth or the rate
-- limit can see it: it carries no credential and must not consume quota.
H.reset()
local preflight = Stub.context({ method = "OPTIONS", uri = "/v1/x", client_ip = CLIENT,
    headers = { origin = "https://a-app.example", ["access-control-request-method"] = "POST" } })
local d = run(a, preflight)
A.eq(d.action, "finish", "a preflight finishes")
A.eq(d.stage, "cors", "at the CORS stage")
A.is_nil(preflight.auth, "auth never ran")
A.is_nil(preflight.rate_limit, "and the rate limit never ran, so quota is untouched")

-- IVT wins over auth when both would reject: the cheaper check runs first.
H.reset()
local both = Stub.context({ method = "TRACE", uri = "/v1/x", client_ip = CLIENT })
local dec = run(a, both)
A.eq(dec.stage, "ivt", "the structural check rejects before the verifier is consulted")
A.is_nil(both.auth, "auth never ran")

-- ─── a broken stage fails open, it does not 500 the tenant ──────────────────

H.reset()
local Ivt = require("api_gw.ivt")
local saved_run = Ivt.run
Ivt.run = function() error("synthetic module bug") end
-- The pipeline holds a direct reference from load time, so patch that too.
for _, stage in ipairs(Pipeline.STAGES) do
    if stage.stage == "ivt" then stage.run = Ivt.run end
end

local survivor = Stub.context({ uri = "/v1/x", client_ip = CLIENT, headers = keyed() })
A.is_nil(run(a, survivor), "a crashing stage does not reject the request")
A.ok(survivor.rate_limit, "and later stages still run")
local logged = false
for _, l in ipairs(H.logs) do
    if l.message:find("synthetic module bug", 1, true) then logged = true end
end
A.ok(logged, "and the bug is logged loudly rather than swallowed")

Ivt.run = saved_run
for _, stage in ipairs(Pipeline.STAGES) do
    if stage.stage == "ivt" then stage.run = saved_run end
end

-- ─── façade ─────────────────────────────────────────────────────────────────

H.reset()
A.eq(ApiGw.access({ server_name = "plain.example.com" }, nil, "prod"), false,
    "a server with no api_gw block is not handled — one table lookup and out")
A.eq(ApiGw.access({ server_name = "off.example.com", api_gw = { enabled = false } }, nil, "prod"), false,
    "a disabled gateway is not handled")

H.reset()
H.request.method = "GET"
H.request.headers = { origin = "https://demo-app.example" }
ngx.var.uri = "/v1/items"
A.eq(ApiGw.access(server("demo.example.com", DEMO), nil, "prod"), false,
    "an allowed request is not handled — it continues to the proxy")
A.ok(ngx.ctx.api_gw, "but the context is stashed for the later phases")
A.ok(ngx.ctx.api_gw.correlation_id, "with a correlation id")

-- header_filter copies the collected headers onto the response.
ApiGw.header_filter()
A.eq(ngx.header["Access-Control-Allow-Origin"], "https://demo-app.example",
    "header_filter applies the collected CORS headers")
A.eq(ngx.header["X-Correlation-ID"], ngx.ctx.api_gw.correlation_id,
    "and the correlation id")

-- log() emits exactly one audit line.
H.logs = {}
ApiGw.log()
A.eq(#H.logs, 1, "the log phase emits one audit line")
A.contains(H.logs[1].message, "wsl_api_gw ", "tagged for the shipper")

-- Both extra phases are safe to call when the access phase never ran.
H.reset()
ngx.ctx = {}
ApiGw.header_filter()
ApiGw.log()
A.eq(#H.logs, 0, "header_filter and log are no-ops without a context")

-- A rejection is written to the wire with the correlation id attached.
H.reset()
H.request.method = "TRACE"
ngx.var.uri = "/"
local handled = ApiGw.access(server("a.example.com", TENANT_A), nil, "prod")
A.eq(handled, true, "a rejected request is handled by the gateway")
A.eq(H.exited, 403, "the response is terminated with the policy status")
A.contains(H.output[1], '"error":"invalid_traffic"', "the body carries the stable error code")
A.contains(H.output[1], '"correlation_id"', "and the correlation id, so a caller can quote it in a ticket")

A.done("test_pipeline")
