-- Contract tests for api_gw config normalisation and route resolution.
-- Run: lua test/api_gw/test_config.lua

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
Stub.install()

local Config = require("api_gw.config")

local function server(api_gw, extra)
    local s = { server_name = "api.example.com" }
    for k, v in pairs(extra or {}) do s[k] = v end
    s.api_gw = api_gw
    return s
end

-- ─── opt-in ─────────────────────────────────────────────────────────────────

A.is_nil(Config.resolve(nil, nil, "prod"), "nil server resolves to nothing")
A.is_nil(Config.resolve({ server_name = "x" }, nil, "prod"), "no api_gw block means disabled")
A.is_nil(Config.resolve(server({ enabled = false }), nil, "prod"), "enabled=false means disabled")
A.ok(Config.resolve(server({ enabled = true }), nil, "prod"), "enabled=true resolves")
A.ok(Config.resolve(server({ enabled = "true" }), nil, "prod"), 'string "true" is accepted from the admin UI')
A.is_nil(Config.resolve(server({ enabled = "false" }), nil, "prod"), 'string "false" is honoured')

-- ─── defaults ───────────────────────────────────────────────────────────────

local cfg = Config.resolve(server({ enabled = true }), nil, "prod")
A.eq(cfg.tenant, "prod/api.example.com", "tenant is derived")
A.eq(cfg.auth.strategy, "passthrough", "auth defaults to passthrough — origin stays authoritative")
A.eq(cfg.ivt.mode, "audit", "ivt defaults to audit, not block")
A.eq(cfg.rate_limit.algorithm, "sliding", "sliding window is the default")
A.eq(cfg.rate_limit.default_profile, "standard", "default rate profile")
A.eq(cfg.request_security.correlation.enabled, true, "correlation is on by default")
A.eq(cfg.request_security.content_type.enforce, false, "content-type enforcement is opt-in")
A.eq(cfg.request_security.max_body_bytes, 0, "no api_gw body limit by default")
A.eq(cfg.cors.credentials, false, "credentials are off by default")
A.eq(cfg.audit.enabled, true, "audit is on by default")
A.eq(#cfg.routes, 0, "no routes by default")

for _, name in ipairs(Config.MODULES) do
    A.ok(Config.module_enabled(cfg, name), "module " .. name .. " is on when modules is unset")
end

local trimmed = Config.resolve(server({ enabled = true, modules = { "cors", "audit" } }), nil, "prod")
A.ok(Config.module_enabled(trimmed, "cors"), "listed module stays on")
A.falsy(Config.module_enabled(trimmed, "rate_limit"), "unlisted module is off")
local from_string = Config.resolve(server({ enabled = true, modules = "cors, audit" }), nil, "prod")
A.ok(Config.module_enabled(from_string, "audit"), "modules accepts a comma-separated string")

-- ─── redaction cannot be weakened ───────────────────────────────────────────

local audit_cfg = Config.resolve(server({ enabled = true, audit = { redact_headers = {} } }), nil, "prod")
A.ok(audit_cfg.audit.redact_headers["authorization"], "authorization stays redacted")
A.ok(audit_cfg.audit.redact_headers["cookie"], "cookie stays redacted")
A.ok(audit_cfg.audit.redact_headers["x-api-key"], "x-api-key stays redacted")
local audit_extra = Config.resolve(server({ enabled = true,
    audit = { redact_headers = { "X-Tenant-Secret" } } }), nil, "prod")
A.ok(audit_extra.audit.redact_headers["x-tenant-secret"], "tenant redactions are added, lower-cased")
A.ok(audit_extra.audit.redact_headers["authorization"], "tenant redactions do not replace the baseline")

-- ─── rate profiles ──────────────────────────────────────────────────────────

A.eq(cfg.rate_limit.profiles.health.limit, 0, "health is unlimited by default")
A.eq(cfg.rate_limit.profiles.auth.limit, 10, "auth profile is tight by default")
A.ok(cfg.rate_limit.profiles.webhook, "webhook profile exists")

local tuned = Config.resolve(server({
    enabled = true,
    rate_limit = { profiles = { auth = { limit = 3 }, custom = { limit = 7, key = "header", header = "X-Team" } } },
}), nil, "prod")
A.eq(tuned.rate_limit.profiles.auth.limit, 3, "a named default can be re-tuned")
A.eq(tuned.rate_limit.profiles.auth.window_seconds, 60, "un-set fields keep the default")
A.eq(tuned.rate_limit.profiles.custom.limit, 7, "a tenant can add its own profile")
A.eq(tuned.rate_limit.profiles.custom.header, "X-Team", "custom profile keeps its header")

local unknown_default = Config.resolve(server({
    enabled = true, rate_limit = { default_profile = "made_up" },
}), nil, "prod")
A.ok(unknown_default.rate_limit.profiles.made_up, "an unknown default profile is created as unlimited")
A.eq(unknown_default.rate_limit.profiles.made_up.limit, 0, "and it does not block traffic")

-- ─── invalid enum values fall back, never crash ─────────────────────────────

local bad = Config.resolve(server({
    enabled = true,
    ivt = { mode = "destroy" },
    auth = { strategy = "kerberos" },
    routes = { { path = "/x", path_key = "glob", auth = "nope", ivt_mode = "sometimes" } },
}), nil, "prod")
A.eq(bad.ivt.mode, "audit", "an unknown ivt mode falls back to audit")
A.eq(bad.auth.strategy, "passthrough", "an unknown auth strategy falls back to passthrough")
A.eq(bad.routes[1].path_key, "starts_with", "an unknown path_key falls back to starts_with")
A.is_nil(bad.routes[1].auth, "an unknown route auth is dropped, not applied")
A.is_nil(bad.routes[1].ivt_mode, "an unknown route ivt_mode is dropped")

-- ─── route specificity ──────────────────────────────────────────────────────

local routed = Config.resolve(server({
    enabled = true,
    routes = {
        { path = "/",          rate_profile = "public" },
        { path = "/v1/",       rate_profile = "standard", auth = "jwt" },
        { path = "/v1/report", rate_profile = "expensive" },
        { path = "/health",    path_key = "equals", auth = "none", rate_profile = "health", ivt_mode = "disabled" },
    },
}), nil, "prod")

A.eq(routed.routes[1].path, "/health", "equals sorts above every prefix")
A.eq(routed.routes[2].path, "/v1/report", "the longer prefix sorts first")
A.eq(routed.routes[3].path, "/v1/", "then the shorter prefix")
A.eq(routed.routes[4].path, "/", "the catch-all sorts last")

A.eq(Config.route_for(routed, "/health").path, "/health", "exact route wins")
A.eq(Config.route_for(routed, "/health/live").path, "/", "equals does not match a longer path")
A.eq(Config.route_for(routed, "/v1/report/2024").path, "/v1/report", "most specific prefix wins")
A.eq(Config.route_for(routed, "/v1/users").path, "/v1/", "less specific prefix still matches")
A.eq(Config.route_for(routed, "/anything").path, "/", "catch-all catches")

-- Ordering must not depend on declaration order.
local reversed = Config.resolve(server({
    enabled = true,
    routes = {
        { path = "/health", path_key = "equals" },
        { path = "/v1/report" },
        { path = "/v1/" },
        { path = "/" },
    },
}), nil, "prod")
A.eq(Config.route_for(reversed, "/v1/report/x").path, "/v1/report",
    "selection is independent of declaration order")

-- Two routes of identical specificity: first declared wins, deterministically.
local tie = Config.resolve(server({
    enabled = true,
    routes = { { path = "/aaa", name = "first" }, { path = "/aaa", name = "second" } },
}), nil, "prod")
A.eq(Config.route_for(tie, "/aaa").name, "first", "ties break on declaration order")

-- Method-scoped routes.
local methodful = Config.resolve(server({
    enabled = true,
    routes = {
        { path = "/v1/", methods = { "POST" }, rate_profile = "expensive", name = "writes" },
        { path = "/v1/", rate_profile = "standard", name = "reads" },
    },
}), nil, "prod")
A.eq(Config.route_for(methodful, "/v1/x", "POST").name, "writes", "method-scoped route matches its method")
A.eq(Config.route_for(methodful, "/v1/x", "GET").name, "reads", "and is skipped for other methods")

-- ─── policy flattening ──────────────────────────────────────────────────────

local policy = Config.policy(routed, Config.route_for(routed, "/health"))
A.eq(policy.auth, "none", "route auth overrides the server strategy")
A.eq(policy.rate_profile, "health", "route rate profile is used")
A.eq(policy.ivt_mode, "disabled", "route ivt mode is used")

local fallback = Config.policy(routed, nil)
A.eq(fallback.auth, "passthrough", "with no route, server defaults apply")
A.eq(fallback.rate_profile, "standard", "with no route, the default profile applies")

-- ─── rule-level override ────────────────────────────────────────────────────

local base_server = server({ enabled = true, ivt = { mode = "audit" }, rate_limit = { default_profile = "standard" } })
local overridden = Config.resolve(base_server, { api_gw = { ivt = { mode = "block" } } }, "prod")
A.eq(overridden.ivt.mode, "block", "a rule can tighten the server policy")
A.eq(overridden.rate_limit.default_profile, "standard", "untouched keys survive the merge")

local nested = Config.resolve(base_server,
    { match = { response = { api_gw = { ivt = { mode = "monitor" } } } } }, "prod")
A.eq(nested.ivt.mode, "monitor", "match.response.api_gw is also honoured")

local disabling = Config.resolve(base_server, { api_gw = { enabled = false } }, "prod")
A.is_nil(disabling, "a rule can switch the gateway off for its own traffic")

-- ─── path list helpers ──────────────────────────────────────────────────────

A.ok(Config.path_in_list({ "/health", "/metrics" }, "/health"), "exact entry matches")
A.ok(Config.path_in_list({ "/health" }, "/health/live"), "entry covers a child segment")
A.falsy(Config.path_in_list({ "/health" }, "/healthz-other/x"),
    "entry does not leak onto a sibling path — this is the auth-bypass case")
A.falsy(Config.path_in_list({ "/v1/public" }, "/v1/publicadmin"),
    "a public prefix does not make an adjacent private path anonymous")
A.ok(Config.path_in_list({ "/v1/" }, "/v1/anything"), "a trailing slash matches everything below it")
A.falsy(Config.path_in_list({}, "/anything"), "an empty list matches nothing")
A.ok(Config.path_in_list({ "~^/v\\d+/" }, "/v2/users"), "a ~-prefixed entry is treated as a regex")
A.falsy(Config.path_in_list({ "~^/v\\d+/" }, "/vX/users"), "and the regex actually has to match")

-- ─── list coercion ──────────────────────────────────────────────────────────

A.set_eq(Config.list("a, b ,c"), { "a", "b", "c" }, "comma strings split and trim")
A.set_eq(Config.list({ "a", "b" }), { "a", "b" }, "arrays pass through")
A.set_eq(Config.list(nil, { "d" }), { "d" }, "nil takes the default")
A.set_eq(Config.list(ngx.null, { "d" }), { "d" }, "cjson null takes the default")

A.done("test_config")
