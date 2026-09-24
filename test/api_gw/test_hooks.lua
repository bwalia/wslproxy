#!/usr/bin/env lua
-- Run: lua test/api_gw/test_hooks.lua
package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
Stub.install()

local Config = require("api_gw.config")
local Hooks = require("api_gw.hooks")
local Pipeline = require("api_gw.pipeline")

local function cfg_with_hooks(hooks)
    return Config.resolve({
        server_name = "api.example.com",
        api_gw = {
            enabled = true,
            modules = { "hooks", "real_ip", "cors", "auth", "rate_limit", "audit", "request_security", "ivt" },
            hooks = hooks,
        },
    }, nil, "prod")
end

-- Declarative request header set
do
    local cfg = cfg_with_hooks({
        enabled = true,
        request_headers = {
            { op = "set", name = "X-Tenant", value = "{{tenant}}" },
        },
    })
    A.ok(cfg, "resolves")
    A.ok(cfg.hooks.enabled, "hooks enabled")
    local ctx = {
        headers = {},
        method = "GET",
        uri = "/v1",
        client_ip = "1.2.3.4",
        response_headers = {},
        findings = {},
    }
    local decision = Hooks.request_phase(cfg, ctx, {})
    A.eq(decision, nil, "declarative set continues")
    A.eq(ctx.headers["X-Tenant"], cfg.tenant, "tenant header expanded")
end

-- Inline lua access_before can terminate
do
    local cfg = cfg_with_hooks({
        enabled = true,
        lua = {
            {
                name = "block_debug",
                phase = "access_before",
                source = [[
return function(cfg, ctx, policy)
  return { status = 403, reason = "blocked", module = "hooks", action = "deny" }
end
]],
            },
        },
    })
    local ctx = {
        headers = {},
        method = "GET",
        uri = "/",
        client_ip = "1.2.3.4",
        response_headers = {},
        findings = {},
    }
    local decision = Hooks.request_phase(cfg, ctx, {})
    A.ok(decision, "inline hook returned decision")
    A.eq(decision.status, 403, "status 403")
end

-- Pipeline order includes hooks stages
do
    local order = Pipeline.order()
    local names = {}
    for _, s in ipairs(order) do names[#names + 1] = s.stage end
    local joined = table.concat(names, ",")
    A.ok(joined:find("hooks_request", 1, true), "hooks_request in order")
    A.ok(joined:find("hooks_access_after", 1, true), "hooks_access_after in order")
end

print("OK test_hooks")
