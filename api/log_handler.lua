-- Log Handler Module
-- Handles all request logging including Prometheus metrics and traffic stats
-- Called from log_by_lua_block in nginx.conf

local _M = {}

-- Cache IP2Location instance for performance (per-worker)
local ip2loc_instance = nil
local ip2loc_init_attempted = false

-- Initialize IP2Location (lazy loading)
-- Uses global IP2LocationPath set in init.lua from settings.json
local function get_ip2location()
    if ip2loc_instance then
        return ip2loc_instance
    end

    if ip2loc_init_attempted then
        return nil
    end

    ip2loc_init_attempted = true

    -- Use global IP2LocationPath from init.lua (loaded from settings.json)
    local path = IP2LocationPath
    if not path or path == "" then
        ngx.log(ngx.WARN, "log_handler: IP2LocationPath not set in init.lua")
        return nil
    end

    local ok, err = pcall(function()
        if IP2location then
            ip2loc_instance = IP2location:new(path)
            ngx.log(ngx.INFO, "log_handler: IP2Location initialized from settings: ", path)
        end
    end)

    if not ok then
        ngx.log(ngx.WARN, "log_handler: Failed to init IP2Location from ", path, ": ", tostring(err))
    end

    return ip2loc_instance
end

-- Lookup country code from IP address
local function get_country_code(ip_address)
    local ip2loc = get_ip2location()
    if not ip2loc then
        return ""
    end

    local ok, result = pcall(function()
        return ip2loc:get_all(ip_address)
    end)

    if ok and result and result.country_short and result.country_short ~= "-" then
        return result.country_short
    end

    return ""
end

function _M.log_request()
    -- Get request variables - with nil safety checks
    local host = ngx.var.host
    local status = tonumber(ngx.var.status)
    local method = ngx.var.request_method
    local uri = ngx.var.uri
    local remote_addr = ngx.var.remote_addr
    local request_time = ngx.now() - ngx.req.start_time()
    local request_length = tonumber(ngx.var.request_length) or 0
    local bytes_sent = tonumber(ngx.var.bytes_sent) or 0

    -- Skip logging for malformed requests (nil uri, host, or method)
    if not host or not method or not uri then
        return
    end

    -- Sanitize host (remove www prefix)
    host = host:gsub("^www.", "")

    -- Get country code from IP address for geographic tracking
    local country_code = get_country_code(remote_addr or "")

    -- Extract endpoint (first 2 path segments for API grouping)
    local endpoint = uri:match("^(/[^/]*/[^/]*)")
    if not endpoint then
        endpoint = uri:match("^(/[^/]*)")
    end
    endpoint = endpoint or uri

    -- Load Prometheus metrics module
    local metrics_ok, metrics = pcall(require, "prometheus_metrics")
    if metrics_ok and metrics then
        -- Basic HTTP metrics
        local metric_requests = metrics.get_metric_requests()
        local metric_latency = metrics.get_metric_latency()
        if metric_requests and metric_latency then
            metric_requests:inc(1, {host, tostring(status), method, endpoint})
            metric_latency:observe(request_time, {host, method, endpoint})
        end

        -- Request/Response size metrics
        local metric_request_size = metrics.get_metric_request_size()
        local metric_response_size = metrics.get_metric_response_size()
        if metric_request_size and metric_response_size then
            metric_request_size:observe(request_length, {host, method})
            metric_response_size:observe(bytes_sent, {host, method, tostring(status)})
        end

        -- Error tracking
        if status >= 400 then
            local metric_errors = metrics.get_metric_errors()
            if metric_errors then
                metric_errors:inc(1, {host, tostring(status), endpoint})
            end

            if status >= 400 and status < 500 then
                local metric_4xx = metrics.get_metric_4xx_errors()
                if metric_4xx then
                    metric_4xx:inc(1, {host, tostring(status), endpoint})
                end
            elseif status >= 500 then
                local metric_5xx = metrics.get_metric_5xx_errors()
                if metric_5xx then
                    metric_5xx:inc(1, {host, tostring(status), endpoint})
                end
            end
        end

        -- DDoS / Security: Track requests per IP
        local metric_requests_per_ip = metrics.get_metric_requests_per_ip()
        if metric_requests_per_ip then
            metric_requests_per_ip:inc(1, {remote_addr, host})
        end

        -- Detect suspicious patterns
        local metric_suspicious = metrics.get_metric_suspicious_requests()
        if metric_suspicious and uri then
            local user_agent = ngx.var.http_user_agent or ""

            -- Suspicious patterns
            if user_agent == "" or user_agent == "-" then
                metric_suspicious:inc(1, {host, "no_user_agent"})
            end

            -- Safe pattern matching with nil checks
            if uri:find("%.%.") or uri:find("//") then
                metric_suspicious:inc(1, {host, "path_traversal_attempt"})
            end

            local uri_lower = uri:lower()
            if uri_lower:find("script") or uri_lower:find("exec") or uri_lower:find("union") then
                metric_suspicious:inc(1, {host, "injection_attempt"})
            end

            -- Rapid sequential errors from same IP
            if status == 404 or status == 403 then
                metric_suspicious:inc(1, {host, "error_" .. tostring(status)})
            end
        end

        -- API metrics: Track API calls
        local metric_api_calls = metrics.get_metric_api_calls()
        if metric_api_calls and uri and uri:match("^/api/") then
            metric_api_calls:inc(1, {endpoint, method, tostring(status)})
        end

        -- Track authentication attempts
        if uri and uri:match("^/api/user/login") then
            local metric_auth_attempts = metrics.get_metric_auth_attempts()
            if metric_auth_attempts then
                local result = (status == 200) and "success" or "failure"
                metric_auth_attempts:inc(1, {result, "login"})

                if status ~= 200 then
                    local metric_auth_failures = metrics.get_metric_auth_failures()
                    if metric_auth_failures then
                        local reason = (status == 401) and "invalid_credentials" or
                                    (status == 403) and "forbidden" or "other"
                        metric_auth_failures:inc(1, {reason})
                    end
                end
            end
        end
    end

    -- Record traffic stats for dashboard chart
    local traffic_ok, traffic_stats_module = pcall(require, "traffic_stats")
    if traffic_ok and traffic_stats_module and traffic_stats_module.record_request then
        local stats_ok, stats_err = pcall(function()
            traffic_stats_module.record_request({
                status = status,
                bytes_sent = bytes_sent,
                host = host,
                method = method,
                request_time = request_time,
                uri = uri or "",
                country_code = country_code
            })
        end)
        if not stats_ok then
            ngx.log(ngx.WARN, "log_handler: Failed to record traffic stats: ", tostring(stats_err))
        end
    end
end

return _M
