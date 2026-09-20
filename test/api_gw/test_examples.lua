-- Contract tests for the shipped example tenant configs.
-- Run: lua test/api_gw/test_examples.lua
--
-- Examples are documentation that runs: if one stops resolving the way its
-- comments claim, this fails rather than sending an operator down a dead end.

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local Pipeline = require("api_gw.pipeline")

local function load_example(name)
    local path = "examples/api-gw/" .. name
    local f = io.open(path, "rb")
    A.ok(f, "example " .. path .. " exists")
    if not f then return nil end
    local content = f:read("*a")
    f:close()
    local ok, doc = pcall(Cjson.decode, content)
    A.ok(ok, "example " .. path .. " is valid JSON")
    return ok and doc or nil
end

-- ─── generic SaaS example ───────────────────────────────────────────────────

local demo = load_example("host:api.demo.example.com.json")
A.ok(demo, "the generic SaaS example loads")

local demo_cfg = Config.resolve(demo, nil, demo.profile_id)
A.ok(demo_cfg, "it resolves to a live config")
A.eq(demo_cfg.tenant, "prod/api.demo.example.com", "with its own tenant key")
A.eq(demo_cfg.ivt.mode, "audit", "IVT ships in audit mode — nothing is blocked on day one")
A.eq(demo_cfg.auth.strategy, "passthrough", "auth stays with the origin")
A.falsy(Config.module_enabled(demo_cfg, "auth"), "and the auth module is not even in the module list")

-- The route matrix resolves the way the file's comments claim.
local function route_of(cfg, uri, method)
    local r = Config.route_for(cfg, uri, method)
    return r and r.name or nil
end

A.eq(route_of(demo_cfg, "/health"), "health", "/health resolves to the health class")
A.eq(route_of(demo_cfg, "/v1/auth/login"), "login", "the login path resolves to the tight auth class")
A.eq(route_of(demo_cfg, "/v1/reports/monthly"), "reports", "reports resolve to the expensive class")
A.eq(route_of(demo_cfg, "/v1/orders"), "api", "ordinary API paths resolve to standard")
A.eq(route_of(demo_cfg, "/anything-else"), "catchall", "everything else falls to the public class")

A.eq(Config.policy(demo_cfg, Config.route_for(demo_cfg, "/health")).rate_profile, "health",
    "/health is unlimited")
A.eq(Config.policy(demo_cfg, Config.route_for(demo_cfg, "/v1/auth/login")).max_body_bytes, 8192,
    "the login route carries a tight body limit")

-- Every profile a route names must exist, or requests silently go unlimited.
for _, route in ipairs(demo_cfg.routes) do
    if route.rate_profile then
        A.ok(demo_cfg.rate_limit.profiles[route.rate_profile],
            "route " .. tostring(route.name) .. " names a profile that exists: " .. route.rate_profile)
    end
end

-- ─── the tighter example ────────────────────────────────────────────────────

local fishers = load_example("host:api.fishers.example.com.json")
A.ok(fishers, "the second example loads")

local f_cfg = Config.resolve(fishers, nil, fishers.profile_id)
A.ok(f_cfg, "it resolves too")
A.eq(f_cfg.tenant, "fishers-prod", "it uses an explicit tenant id")
A.eq(f_cfg.ivt.mode, "block", "and runs IVT in block mode")
A.ok(Config.module_enabled(f_cfg, "auth"), "with the auth module enabled")
A.eq(Config.policy(f_cfg, Config.route_for(f_cfg, "/api/v1/admin/users")).auth, "api_key",
    "the admin surface enforces an edge key")
A.eq(Config.policy(f_cfg, Config.route_for(f_cfg, "/api/v1/orders")).auth, "passthrough",
    "while the ordinary API keeps the origin authoritative")

for _, route in ipairs(f_cfg.routes) do
    if route.rate_profile then
        A.ok(f_cfg.rate_limit.profiles[route.rate_profile],
            "route " .. tostring(route.name) .. " names a profile that exists: " .. route.rate_profile)
    end
end

-- ─── the two examples do not interfere ──────────────────────────────────────

H.reset()
A.ne(demo_cfg.tenant, f_cfg.tenant, "the two examples are separate tenants")

local CLIENT = "203.0.113.150"

-- Drive the stricter tenant's burst guard past its limit, then check the
-- permissive one is untouched. This is the acceptance criterion, run against
-- the files an operator would actually copy.
local tripped = false
for _ = 1, 200 do
    local d = Pipeline.run(f_cfg, Stub.context({ uri = "/api/v1/orders", client_ip = CLIENT }))
    if d then tripped = true break end
end
A.ok(tripped, "the strict example eventually rejects a flood")

local demo_ctx = Stub.context({ uri = "/v1/orders", client_ip = CLIENT })
A.is_nil(Pipeline.run(demo_cfg, demo_ctx), "the permissive example is unaffected by its neighbour's flood")
A.eq(demo_ctx.rate_limit.count, 1, "and its counter started from zero")

A.done("test_examples")
