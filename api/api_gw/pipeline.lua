-- api/api_gw/pipeline.lua
-- The staged access pipeline. Order is fixed, declared in one table, and
-- exported so the docs and the tests read it from the same source as the
-- runtime — an ordering that only exists in prose drifts from the code.
--
-- Order and the reason for each position:
--
--   1000 real_ip           Everything downstream keys on the client IP, so it
--                          has to be resolved inside the trust boundary first.
--    980 correlation       Established before anything can deny, so every
--                          rejection and every audit line carries the same id.
--    950 cors              A preflight carries no credentials and must not be
--                          authenticated or rate limited; it terminates here.
--                          IVT's burst counter has already been bypassed for
--                          it deliberately — see the note on stage 900.
--    900 ivt               Cheap structural signals. Runs before auth so a
--                          scanner never reaches the verifier, and before
--                          request_security so a denied method is not first
--                          parsed for content types.
--    850 request_security  Content-type, body size, token shape. After IVT
--                          because these are correctness checks on traffic we
--                          have already decided to consider real.
--    800 auth              Credential verification. Produces ctx.consumer.
--    700 rate_limit        Last, so it can key on the verified consumer.
--
-- A stage returns nil to continue, or a decision table from api_gw.response.
-- The first non-nil decision wins and the rest of the pipeline is skipped.

local M = {}

local Config = require("api_gw.config")
local RealIp = require("api_gw.real_ip")
local RequestSecurity = require("api_gw.request_security")
local Cors = require("api_gw.cors")
local Ivt = require("api_gw.ivt")
local Auth = require("api_gw.auth")
local RateLimit = require("api_gw.rate_limit")

-- `module` is the name a tenant lists in `api_gw.modules`; several stages can
-- share one module name (correlation and enforcement are both
-- request_security), which is why stage and module are separate fields.
M.STAGES = {
    { priority = 1000, stage = "real_ip",             module = "real_ip",          run = RealIp.run },
    { priority = 980,  stage = "correlation",         module = "request_security", run = RequestSecurity.correlate },
    { priority = 950,  stage = "cors",                module = "cors",             run = Cors.run },
    { priority = 900,  stage = "ivt",                 module = "ivt",              run = Ivt.run },
    { priority = 850,  stage = "request_security",    module = "request_security", run = RequestSecurity.enforce },
    { priority = 800,  stage = "auth",                module = "auth",             run = Auth.run },
    { priority = 700,  stage = "rate_limit",          module = "rate_limit",       run = RateLimit.run },
}

-- Sorted once at load. Declared in order already; sorting makes the invariant
-- explicit and survives someone appending a stage in the wrong place.
table.sort(M.STAGES, function(a, b) return a.priority > b.priority end)

--- The documented execution order, as stage names. Tests and docs consume this.
--- @return table array of { priority, stage, module }
function M.order()
    local out = {}
    for _, s in ipairs(M.STAGES) do
        out[#out + 1] = { priority = s.priority, stage = s.stage, module = s.module }
    end
    return out
end

--- Run every enabled stage against a request context.
---
--- @param cfg table  normalised config from api_gw.config.resolve
--- @param ctx table  request context (see api_gw.init.new_context)
--- @return table|nil decision
function M.run(cfg, ctx)
    local route = Config.route_for(cfg, ctx.uri, ctx.method)
    local policy = Config.policy(cfg, route)
    ctx.route_name = route and (route.name or route.path) or nil
    ctx.policy = policy

    for _, stage in ipairs(M.STAGES) do
        if Config.module_enabled(cfg, stage.module) then
            -- A stage that throws is an api_gw bug, not a tenant decision:
            -- log it and keep going rather than 500 the tenant's traffic.
            local ok, decision = pcall(stage.run, cfg, ctx, policy)
            if not ok then
                ngx.log(ngx.ERR, "[api_gw] stage '", stage.stage, "' errored for tenant ",
                    tostring(cfg.tenant), ": ", tostring(decision), " — continuing (fail-open)")
            elseif decision then
                decision.stage = stage.stage
                decision.module = decision.module or stage.module
                ctx.decision = decision
                return decision
            end
        end
    end

    return nil
end

return M
