-- Log Interceptor Module
-- Intercepts ngx.log() calls to track log level metrics in Prometheus
-- Must be initialized early in init_worker_by_lua_block

local _M = {}

local original_log = ngx.log
local log_interceptor_enabled = false

-- Component name extraction from log messages
local function extract_component(message)
    if type(message) ~= "string" then
        return "unknown"
    end

    -- Try to extract component from common patterns
    -- Pattern: "component_name: message" or "[component_name] message"
    local component = message:match("^([%w_]+):")
    if component then
        return component
    end

    component = message:match("^%[([%w_]+)%]")
    if component then
        return component
    end

    -- Default components based on message content
    if message:find("log_handler") then
        return "log_handler"
    elseif message:find("prometheus") or message:find("metrics") then
        return "metrics"
    elseif message:find("upstream") then
        return "upstream"
    elseif message:find("cache") then
        return "cache"
    elseif message:find("ssl") or message:find("certificate") then
        return "ssl"
    elseif message:find("auth") or message:find("login") then
        return "auth"
    elseif message:find("api") then
        return "api"
    elseif message:find("proxy") then
        return "proxy"
    else
        return "nginx"
    end
end

-- Initialize log interceptor
function _M.init()
    if log_interceptor_enabled then
        return true  -- Already initialized
    end

    -- Check if lua_code_cache is ON
    if not package.loaded._prometheus_instance then
        ngx.log(ngx.WARN, "log_interceptor: Cannot initialize - Prometheus not available (lua_code_cache may be OFF)")
        return false
    end

    -- Load metrics module
    local metrics_ok, metrics = pcall(require, "prometheus_metrics")
    if not metrics_ok then
        ngx.log(ngx.WARN, "log_interceptor: Cannot load prometheus_metrics module")
        return false
    end

    -- Override ngx.log to track metrics
    ngx.log = function(level, ...)
        -- Call original log first
        original_log(level, ...)

        -- Track metrics (in pcall to prevent logging errors from breaking logging)
        local ok, err = pcall(function()
            local args = {...}
            local message = table.concat(args, " ")
            local component = extract_component(message)

            -- Track by specific level
            if level == ngx.ERR then
                local metric_errors = metrics.get_metric_log_errors()
                if metric_errors then
                    metric_errors:inc(1, {component})
                end
                local metric_levels = metrics.get_metric_log_levels()
                if metric_levels then
                    metric_levels:inc(1, {"error", component})
                end
            elseif level == ngx.WARN then
                local metric_warnings = metrics.get_metric_log_warnings()
                if metric_warnings then
                    metric_warnings:inc(1, {component})
                end
                local metric_levels = metrics.get_metric_log_levels()
                if metric_levels then
                    metric_levels:inc(1, {"warn", component})
                end
            elseif level == ngx.NOTICE then
                local metric_notices = metrics.get_metric_log_notices()
                if metric_notices then
                    metric_notices:inc(1, {component})
                end
                local metric_levels = metrics.get_metric_log_levels()
                if metric_levels then
                    metric_levels:inc(1, {"notice", component})
                end
            elseif level == ngx.INFO then
                local metric_levels = metrics.get_metric_log_levels()
                if metric_levels then
                    metric_levels:inc(1, {"info", component})
                end
            elseif level == ngx.DEBUG then
                local metric_levels = metrics.get_metric_log_levels()
                if metric_levels then
                    metric_levels:inc(1, {"debug", component})
                end
            end
        end)

        if not ok and err then
            -- Use original_log to avoid recursion
            original_log(ngx.WARN, "log_interceptor: Failed to track log metric: ", tostring(err))
        end
    end

    log_interceptor_enabled = true
    original_log(ngx.NOTICE, "log_interceptor: Log level tracking initialized")
    return true
end

-- Disable log interceptor (for testing or debugging)
function _M.disable()
    if log_interceptor_enabled then
        ngx.log = original_log
        log_interceptor_enabled = false
        ngx.log(ngx.NOTICE, "log_interceptor: Log level tracking disabled")
    end
end

-- Check if enabled
function _M.is_enabled()
    return log_interceptor_enabled
end

return _M
