-- Contract tests for the opsapi.org / sso.opsapi.org edge records.
-- Run: lua test/api_gw/test_opsapi_org.lua
--
-- These hosts front the OpsAPI identity endpoints for the hello-java /
-- hello-php consumer apps. If a route, CORS origin or the PKCE guard stops
-- resolving the way docs/sso/opsapi-cross-domain-sso.md says, this fails.

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local Cors = require("api_gw.cors")

local function load_json(path)
    local f = io.open(path, "rb")
    A.ok(f, path .. " exists")
    if not f then return nil end
    local content = f:read("*a")
    f:close()
    local ok, doc = pcall(Cjson.decode, content)
    A.ok(ok, path .. " is valid JSON")
    return ok and doc or nil
end

local function route_of(cfg, uri, method)
    local r = Config.route_for(cfg, uri, method)
    return r and r.name or nil
end

local rule = load_json("data/rules/prod/opsapi-org-default.json")
A.eq(rule.match.response.code, 305, "the default rule proxies")
A.eq(rule.match.response.redirect_uri, "origin-uk-003.pop0.uk", "to cloud003, where prod OpsAPI runs")

for _, host in ipairs({ "opsapi.org", "sso.opsapi.org" }) do
    local server = load_json("data/servers/prod/host:" .. host .. ".json")
    A.eq(server.rules, "opsapi-org-default", host .. " uses the opsapi.org rule")
    A.eq(server.proxy_server_name, "opsapi.workstation.co.uk",
        host .. " rewrites the upstream Host so Traefik routes it to OpsAPI")

    local cfg = Config.resolve(server, nil, server.profile_id)
    A.ok(cfg, host .. " resolves to a live api_gw config")
    A.eq(cfg.tenant, "prod/" .. host, host .. " gets its own tenant key")

    A.eq(route_of(cfg, "/health"), "health", host .. ": /health is the health class")
    A.eq(route_of(cfg, "/auth/login", "POST"), "login", host .. ": /auth/* is rate limited as auth")
    A.eq(route_of(cfg, "/oauth/authorize", "GET"), "oidc-authorize", host .. ": authorize route")
    A.eq(route_of(cfg, "/oauth/token", "POST"), "oidc-token", host .. ": token route")
    A.eq(route_of(cfg, "/.well-known/jwks.json", "GET"), "oidc-discovery", host .. ": JWKS is public")
    A.eq(route_of(cfg, "/api/v2/users"), "api", host .. ": everything else is the api class")

    for _, route in ipairs(cfg.routes) do
        if route.rate_profile then
            A.ok(cfg.rate_limit.profiles[route.rate_profile],
                host .. ": route " .. tostring(route.name) .. " names a profile that exists")
        end
    end

    -- The consumer apps may call with credentials; anything else gets no CORS.
    A.ok(Cors.origin_allowed(cfg.cors.origins, "https://hello-java.fictionally.org"),
        host .. ": hello-java is an allowed origin")
    A.ok(Cors.origin_allowed(cfg.cors.origins, "https://hello-php.fictionally.org"),
        host .. ": hello-php is an allowed origin")
    A.falsy(Cors.origin_allowed(cfg.cors.origins, "https://evil.example.com"),
        host .. ": an unknown origin is not")
    A.ok(cfg.cors.credentials, host .. ": credentialed CORS")

    local discovery = Config.policy(cfg, Config.route_for(cfg, "/.well-known/openid-configuration", "GET"))
    A.falsy(discovery.cors.credentials, host .. ": discovery CORS is public and uncredentialed")

    -- PKCE guard: an inline hook in the server record, so edge-sync carries it to pop0.
    local hook = server.api_gw.hooks.lua[1]
    A.eq(hook.name, "pkce_guard", host .. ": PKCE guard is installed")
    local guard = (loadstring or load)(hook.source)()
    local verifier_hash = string.rep("a", 43)

    local function decide(uri, args)
        return guard(cfg, { uri = uri, args = args }, {})
    end
    A.eq(decide("/oauth/authorize", {}).status, 400, host .. ": authorize without PKCE is refused")
    A.eq(decide("/oauth/authorize", { code_challenge = verifier_hash, code_challenge_method = "plain" }).status,
        400, host .. ": the plain method is refused")
    A.eq(decide("/oauth/authorize", { code_challenge = "short", code_challenge_method = "S256" }).status,
        400, host .. ": a too-short challenge is refused")
    A.eq(decide("/oauth/authorize", { code_challenge = verifier_hash, code_challenge_method = "S256" }), nil,
        host .. ": an S256 challenge passes to OpsAPI")
    A.eq(decide("/auth/login", {}), nil, host .. ": other paths are untouched")
end

local www = load_json("data/servers/prod/host:www.opsapi.org.json")
local redirect = load_json("data/rules/prod/" .. www.rules .. ".json")
A.eq(redirect.match.response.code, 301, "www.opsapi.org redirects permanently")
A.eq(redirect.match.response.redirect_uri, "https://opsapi.org", "to the apex")
A.ok(redirect.match.response.redirect_preserve_uri, "keeping the path")

A.done()
