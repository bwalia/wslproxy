-- Gateway Pipeline Module for WSLProxy API Gateway
-- Orchestrates the execution order:
--     api_gw (Kong-class edge gateway) -> rate_limit -> WAF
--     (transforms handled in gateway_resp.lua)
-- Called from gateway_ack.lua after rule matching determines the target
--
-- api_gw runs first because it owns CORS preflight, which must be answered
-- before anything can rate-limit or inspect it, and because its IVT stage is
-- the cheapest way to shed obvious junk.  It is opt-in per server
-- (`api_gw.enabled`); with no api_gw block the call costs one table lookup
-- and the legacy order below is exactly what it always was.
--
-- Fail-open: if any pipeline stage errors, request continues normally
-- No nginx reloads required — reads config from server JSON on each request

local _M = {}

local cjson = Cjson or require("cjson")

-- ============================================================================
-- RATE LIMITING
-- ============================================================================

-- Per-IP sliding window rate limiter using shared dict
-- Returns nil to allow, or a table with action="rate_limited" to reject
function _M.rate_limit(server_config)
    if not server_config.rate_limit_enabled then
        return nil
    end

    local rate_config = server_config.rate_limit
    if not rate_config then
        return nil
    end

    local rate_dict = ngx.shared.wsl_cache
    if not rate_dict then
        return nil -- fail-open: no shared dict available
    end

    local limit = tonumber(rate_config.requests_per_second) or 100
    local burst = tonumber(rate_config.burst) or 50
    local key = "ratelimit:" .. (server_config.server_name or "unknown") .. ":" .. (ngx.var.remote_addr or "0.0.0.0")

    -- Increment counter with 1-second TTL window
    local current, err = rate_dict:incr(key, 1, 0, 1)
    if err then
        ngx.log(ngx.WARN, "gateway_pipeline: rate limit counter error: ", err)
        return nil -- fail-open
    end

    if current and current > (limit + burst) then
        return {
            action = "rate_limited",
            current = current,
            limit = limit,
            burst = burst
        }
    end

    return nil
end

-- ============================================================================
-- WAF INSPECTION (delegates to existing waf_engine.lua)
-- ============================================================================

function _M.waf_inspect(server_config, profile_id)
    local waf_ok, WafEngine = pcall(require, "waf_engine")
    if not waf_ok or not WafEngine then
        return nil, nil -- fail-open: WAF module not available
    end

    local result = WafEngine.inspect(server_config, profile_id)
    return result, WafEngine
end

-- ============================================================================
-- API GATEWAY PACKAGE (api/api_gw/)
-- ============================================================================

-- Run the tenant's api_gw pipeline, when it has one.
-- Returns true if the request was handled (answered or rejected).
function _M.api_gw(server_config, selected_rule, profile_id)
    if type(server_config) ~= "table" or type(server_config.api_gw) ~= "table" then
        return false -- not configured: no module load, no work
    end
    local ok, ApiGw = pcall(require, "api_gw")
    if not ok or not ApiGw then
        ngx.log(ngx.ERR, "gateway_pipeline: api_gw is configured for ",
            tostring(server_config.server_name), " but the package failed to load: ",
            tostring(ApiGw), " — continuing without it (fail-open)")
        return false
    end
    local rule_data = selected_rule and selected_rule.rule_data or nil
    local called_ok, handled = pcall(ApiGw.access, server_config, rule_data, profile_id)
    if not called_ok then
        ngx.log(ngx.ERR, "gateway_pipeline: api_gw errored: ", tostring(handled),
            " — continuing without it (fail-open)")
        return false
    end
    return handled == true
end

-- ============================================================================
-- PIPELINE EXECUTION
-- ============================================================================

-- Execute the full gateway pipeline for a request
-- Returns true if request was handled (blocked/rejected), false to continue to proxy
function _M.execute(server_config, selected_rule, profile_id)
    -- Phase 1: Authentication
    -- Already handled in gatewayHostRulesParser() before this is called

    -- Phase 2: API Gateway (CORS, correlation, IVT, edge auth, rate limiting)
    if _M.api_gw(server_config, selected_rule, profile_id) then
        return true -- request handled
    end

    -- Phase 3: Rate Limiting (legacy server-level limiter)
    local rate_result = _M.rate_limit(server_config)
    if rate_result and rate_result.action == "rate_limited" then
        ngx.status = 429
        ngx.header["Content-Type"] = "application/json"
        ngx.header["Retry-After"] = "1"
        ngx.header["X-RateLimit-Limit"] = tostring(rate_result.limit)
        ngx.header["X-RateLimit-Remaining"] = "0"
        ngx.say(cjson.encode({
            error = "rate_limited",
            message = "Too many requests. Please retry after 1 second.",
            limit = rate_result.limit,
            current = rate_result.current
        }))
        return ngx.exit(429)
    end

    -- Phase 4: WAF Inspection (delegates to existing waf_engine module)
    local waf_result, WafEngine = _M.waf_inspect(server_config, profile_id)
    if waf_result and waf_result.action == "block" then
        local policy = WafEngine.load_policy(server_config, profile_id)
        WafEngine.block_request(policy, waf_result)
        return true -- request handled
    end

    -- Phase 5: Transforms
    -- Header injection and URI rewriting are handled in gateway_resp.lua

    return false -- continue to proxy
end

return _M
