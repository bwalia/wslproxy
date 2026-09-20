-- Contract tests for the invalid-traffic guard.
-- Run: lua test/api_gw/test_ivt.lua

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local Ivt = require("api_gw.ivt")

local function cfg_for(ivt, server_name, extra)
    local api_gw = { enabled = true, ivt = ivt }
    for k, v in pairs(extra or {}) do api_gw[k] = v end
    return Config.resolve({ server_name = server_name or "api.example.com", api_gw = api_gw }, nil, "prod")
end

local function run(cfg, ctx)
    return Ivt.run(cfg, ctx, Config.policy(cfg, Config.route_for(cfg, ctx.uri, ctx.method)))
end

local function signals(ctx)
    local out = {}
    for _, f in ipairs(ctx.ivt.findings) do out[#out + 1] = f.signal end
    return out
end

-- ─── Authorization shape ────────────────────────────────────────────────────

A.ok(Ivt.auth_shape_ok("Bearer abc.def.ghi", { bearer = true }), "a well-formed bearer token passes")
A.ok(Ivt.auth_shape_ok(nil, { bearer = true }), "an absent header is not malformed — auth decides if it matters")
A.falsy(Ivt.auth_shape_ok("abc.def.ghi", { bearer = true }), "a bare token with no scheme is malformed")
A.falsy(Ivt.auth_shape_ok("Bearer", { bearer = true }), "a scheme with no token is malformed")
A.falsy(Ivt.auth_shape_ok("Bearer   ", { bearer = true }), "a scheme with whitespace only is malformed")
A.falsy(Ivt.auth_shape_ok("undefined", { bearer = true }), "a client-side bug is caught")
A.falsy(Ivt.auth_shape_ok("Digest xyz", { bearer = true, basic = true }), "an unlisted scheme is rejected")
A.ok(Ivt.auth_shape_ok("Digest xyz", {}), "an empty scheme set accepts any well-formed scheme")

-- ─── modes ──────────────────────────────────────────────────────────────────

local DENY_ALL = { methods = { deny = { "TRACE" } }, path_denylist = { "/wp-admin" },
    block_threshold = 1 }

H.reset()
local disabled = cfg_for({ mode = "disabled", methods = { deny = { "TRACE" } } })
local ctx = Stub.context({ method = "TRACE", uri = "/" })
A.is_nil(run(disabled, ctx), "disabled mode does nothing")
A.is_nil(ctx.ivt, "and records nothing")

H.reset()
local audit = cfg_for(DENY_ALL)
ctx = Stub.context({ method = "TRACE", uri = "/" })
A.is_nil(run(audit, ctx), "audit mode never blocks")
A.eq(ctx.ivt.verdict, "suspect", "but it reaches a verdict")
A.set_eq(signals(ctx), { "method_denied" }, "and records the signal")
A.is_nil(ctx.response_headers["X-WSL-IVT"], "audit mode is invisible on the wire")

H.reset()
local monitor = cfg_for({ mode = "monitor", methods = { deny = { "TRACE" } }, block_threshold = 1 })
ctx = Stub.context({ method = "TRACE", uri = "/" })
A.is_nil(run(monitor, ctx), "monitor mode never blocks")
A.contains(ctx.response_headers["X-WSL-IVT"], "suspect", "but it surfaces the verdict on the response")
A.contains(ctx.response_headers["X-WSL-IVT"], "score=", "with the score, so a canary can alert on it")

H.reset()
local block = cfg_for({ mode = "block", methods = { deny = { "TRACE" } }, block_threshold = 1 })
ctx = Stub.context({ method = "TRACE", uri = "/" })
local decision = run(block, ctx)
A.ok(decision, "block mode rejects")
A.eq(decision.status, 403, "with 403 by default")
A.eq(decision.code, "invalid_traffic", "and a stable error code")
A.set_eq(decision.detail.signals, { "method_denied" }, "the decision names the signals")

ctx = Stub.context({ method = "GET", uri = "/" })
A.is_nil(run(block, ctx), "clean traffic passes even in block mode")
A.eq(ctx.ivt.verdict, "clean", "and is recorded as clean")

-- ─── signals ────────────────────────────────────────────────────────────────

H.reset()
local allowlist = cfg_for({ mode = "block", methods = { allow = { "GET", "POST" } }, block_threshold = 1 })
A.is_nil(run(allowlist, Stub.context({ method = "GET" })), "an allowed method passes")
A.is_nil(run(allowlist, Stub.context({ method = "post" })), "method comparison is case-insensitive")
A.ok(run(allowlist, Stub.context({ method = "DELETE" })), "a method outside the allowlist is rejected")

H.reset()
local paths = cfg_for({ mode = "block", path_denylist = { "/wp-admin", "\\.php$" }, block_threshold = 1 })
A.ok(run(paths, Stub.context({ uri = "/wp-admin/install.php" })), "a denylisted path is rejected")
A.ok(run(paths, Stub.context({ uri = "/index.php" })), "a denylist regex is honoured")
A.is_nil(run(paths, Stub.context({ uri = "/v1/php-docs" })), "a path that merely contains the word passes")

H.reset()
local shapes = cfg_for({ mode = "block", require_auth_shape = true, block_threshold = 1 })
A.is_nil(run(shapes, Stub.context({ headers = { authorization = "Bearer abc" } })), "a good header passes")
local bad_shape = Stub.context({ headers = { authorization = "garbage" } })
A.ok(run(shapes, bad_shape), "a malformed Authorization header is rejected")
-- The credential itself must never end up in a finding, a log or a response.
for _, f in ipairs(bad_shape.ivt.findings) do
    A.is_nil(f.detail, "the auth finding carries no credential material")
end

-- ─── header spoof stripping ─────────────────────────────────────────────────

H.reset()
local stripper = cfg_for({ mode = "audit", strip_header_prefixes = { "X-Internal-", "X-Tenant-" } })
ctx = Stub.context({ headers = {
    ["x-internal-user"] = "admin",
    ["x-tenant-id"] = "other-tenant",
    ["x-request-id"] = "keep-me",
    ["authorization"] = "Bearer abc",
} })
A.is_nil(run(stripper, ctx), "stripping alone does not reject")
A.set_eq(ctx.stripped_headers, { "x-internal-user", "x-tenant-id" }, "the spoofed headers are identified")
A.is_nil(ctx.headers["x-internal-user"], "and removed from the request context")
A.is_nil(ctx.headers["x-tenant-id"], "both of them")
A.eq(ctx.headers["x-request-id"], "keep-me", "unrelated headers are untouched")
A.set_eq(H.cleared_headers, { "x-internal-user", "x-tenant-id" }, "and cleared from the upstream request")

-- Stripping happens in audit mode too: removing a header a client should never
-- have set is strictly safer than forwarding it, whatever the mode.
H.reset()
local strip_audit = cfg_for({ mode = "audit", strip_header_prefixes = { "X-Internal-" } })
ctx = Stub.context({ headers = { ["x-internal-role"] = "root" } })
run(strip_audit, ctx)
A.eq(#H.cleared_headers, 1, "audit mode still strips spoofed headers")

-- ─── weighting and threshold ────────────────────────────────────────────────

H.reset()
-- One weak signal (weight 1) under a threshold of 3 is noise, not a block.
local weighted = cfg_for({
    mode = "block",
    strip_header_prefixes = { "X-Internal-" },
    require_auth_shape = true,
    block_threshold = 3,
    weights = { header_spoof = 1, auth_malformed = 3 },
})
ctx = Stub.context({ headers = { ["x-internal-a"] = "1" } })
A.is_nil(run(weighted, ctx), "a single weak signal is below the threshold")
A.eq(ctx.ivt.verdict, "noisy", "and is reported as noisy rather than clean")
A.eq(ctx.ivt.score, 1, "the score is the sum of the weights")

ctx = Stub.context({ headers = { ["x-internal-a"] = "1", authorization = "garbage" } })
A.ok(run(weighted, ctx), "two signals together cross the threshold")
A.eq(ctx.ivt.score, 4, "scores accumulate")

-- ─── burst counter, per tenant ──────────────────────────────────────────────

H.reset()
local burst_policy = { mode = "block", block_threshold = 1,
    burst = { window_seconds = 10, max_requests = 3, key = "ip" } }
local tenant_a = cfg_for(burst_policy, "a.example.com")
local tenant_b = cfg_for(burst_policy, "b.example.com")
local client = "203.0.113.200"

for i = 1, 3 do
    A.is_nil(run(tenant_a, Stub.context({ client_ip = client })), "burst request " .. i .. " passes")
end
A.ok(run(tenant_a, Stub.context({ client_ip = client })), "the fourth request trips the burst guard")

A.is_nil(run(tenant_b, Stub.context({ client_ip = client })),
    "the same client is not pre-tripped on another tenant")

H.advance(21)
A.is_nil(run(tenant_a, Stub.context({ client_ip = client })), "the burst window expires")

-- A burst counter keyed on a header separates callers behind one IP.
H.reset()
local by_header = cfg_for({ mode = "block", block_threshold = 1,
    burst = { window_seconds = 10, max_requests = 1, key = "header", header = "X-Client-Id" } })
local same_ip = "203.0.113.201"
run(by_header, Stub.context({ client_ip = same_ip, headers = { ["x-client-id"] = "one" } }))
A.ok(run(by_header, Stub.context({ client_ip = same_ip, headers = { ["x-client-id"] = "one" } })),
    "client one trips its own burst")
A.is_nil(run(by_header, Stub.context({ client_ip = same_ip, headers = { ["x-client-id"] = "two" } })),
    "client two behind the same IP is unaffected")

-- ─── fail-open when the dict is gone ────────────────────────────────────────

H.reset()
local Store = require("api_gw.store")
local saved = ngx.shared
ngx.shared = {}
Store.reset()
local failopen = cfg_for(burst_policy)
for _ = 1, 10 do
    A.is_nil(run(failopen, Stub.context({ client_ip = client })),
        "traffic flows when the burst counter is unavailable")
end
ngx.shared = saved
Store.reset()

-- ─── per-route mode override ────────────────────────────────────────────────

H.reset()
local routed = cfg_for({ mode = "block", methods = { deny = { "TRACE" } }, block_threshold = 1 }, "api.example.com",
    { routes = { { path = "/health", path_key = "equals", ivt_mode = "disabled" } } })
A.ok(run(routed, Stub.context({ method = "TRACE", uri = "/v1/x" })), "the server policy blocks elsewhere")
A.is_nil(run(routed, Stub.context({ method = "TRACE", uri = "/health" })),
    "a route can switch the guard off for its own path")

A.done("test_ivt")
