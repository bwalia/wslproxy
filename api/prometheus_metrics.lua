-- Prometheus metrics module for sharing metrics across nginx contexts
-- NOTE: Prometheus metrics require lua_code_cache to be ON
-- With lua_code_cache OFF (development mode), metrics will not be available
local _M = {}

local DICT_NAME = "prometheus_metrics"

-- Initialize prometheus - must be called from init_worker_by_lua_block
function _M.init()
    if package.loaded._prometheus_instance then
        -- Already initialized
        return true
    end

    local ok, prometheus_lib = pcall(require, "prometheus")
    if not ok then
        ngx.log(ngx.ERR, "Failed to load prometheus library: ", prometheus_lib)
        return false
    end

    local ok2, prometheus = pcall(prometheus_lib.init, DICT_NAME)
    if not ok2 then
        ngx.log(ngx.ERR, "Failed to initialize prometheus: ", prometheus)
        return false
    end

    if not prometheus then
        ngx.log(ngx.ERR, "Prometheus init returned nil")
        return false
    end

    -- Store in package.loaded which persists when lua_code_cache is ON
    package.loaded._prometheus_instance = prometheus

    -- Basic HTTP metrics
    package.loaded._metric_requests = prometheus:counter("nginx_http_requests_total", "Number of HTTP requests", {"host", "status", "method", "endpoint"})
    package.loaded._metric_latency = prometheus:histogram("nginx_http_request_duration_seconds", "HTTP request latency", {"host", "method", "endpoint"})
    package.loaded._metric_connections = prometheus:gauge("nginx_http_connections", "Number of HTTP connections", {"state"})

    -- Request size metrics for bandwidth monitoring
    package.loaded._metric_request_size = prometheus:histogram("nginx_http_request_size_bytes", "HTTP request size in bytes", {"host", "method"})
    package.loaded._metric_response_size = prometheus:histogram("nginx_http_response_size_bytes", "HTTP response size in bytes", {"host", "method", "status"})

    -- Error tracking
    package.loaded._metric_errors = prometheus:counter("nginx_http_errors_total", "Number of HTTP errors", {"host", "status", "endpoint"})
    package.loaded._metric_4xx_errors = prometheus:counter("nginx_http_4xx_errors_total", "Number of 4xx client errors", {"host", "status", "endpoint"})
    package.loaded._metric_5xx_errors = prometheus:counter("nginx_http_5xx_errors_total", "Number of 5xx server errors", {"host", "status", "endpoint"})

    -- NGINX Error Log Level Tracking
    package.loaded._metric_log_levels = prometheus:counter("nginx_log_messages_total", "Count of nginx log messages by level", {"level", "component"})
    package.loaded._metric_log_errors = prometheus:counter("nginx_log_errors_total", "Count of ERROR level log messages", {"component"})
    package.loaded._metric_log_warnings = prometheus:counter("nginx_log_warnings_total", "Count of WARN level log messages", {"component"})
    package.loaded._metric_log_notices = prometheus:counter("nginx_log_notices_total", "Count of NOTICE level log messages", {"component"})

    -- DDoS / Security metrics
    -- No per-IP metrics: nginx_http_requests_by_ip_total{ip,host} and
    -- nginx_http_rate_limited_total{host,ip} made one series per client IP x
    -- host. The library keeps every series in a per-worker table that is never
    -- pruned, which is how lon1's workers grew to ~300 MB and the edge was
    -- OOM-killed (2026-11-25, docs/runbooks/edge-memory.md). Per-IP data
    -- belongs in a shared dict with a TTL (bot_defense, traffic_stats).
    package.loaded._metric_suspicious_requests = prometheus:counter("nginx_http_suspicious_requests_total", "Suspicious request patterns", {"host", "reason"})
    package.loaded._metric_blocked_requests = prometheus:counter("nginx_http_blocked_requests_total", "Blocked requests", {"host", "reason"})

    -- Gateway / Proxy metrics. `upstream` is the configured backend (rule
    -- backend label or redirect URI), not $upstream_addr: resolved IPs of
    -- S3 / CDN backends and retry lists ("a:p, b:p") are unbounded.
    package.loaded._metric_proxy_requests = prometheus:counter("nginx_proxy_requests_total", "Proxy requests", {"upstream", "status"})
    package.loaded._metric_proxy_latency = prometheus:histogram("nginx_proxy_response_time_seconds", "Proxy response time", {"upstream"})
    package.loaded._metric_ssl_handshakes = prometheus:counter("nginx_ssl_handshakes_total", "SSL handshake count", {"protocol", "cipher"})

    -- Business / API metrics
    package.loaded._metric_api_calls = prometheus:counter("api_calls_total", "API endpoint calls", {"endpoint", "method", "status"})
    package.loaded._metric_auth_attempts = prometheus:counter("api_auth_attempts_total", "Authentication attempts", {"result", "type"})
    package.loaded._metric_auth_failures = prometheus:counter("api_auth_failures_total", "Authentication failures", {"reason"})

    -- Server/Route management metrics (WSL Proxy specific)
    package.loaded._metric_server_operations = prometheus:counter("api_server_operations_total", "Server CRUD operations", {"operation", "status"})
    package.loaded._metric_rule_operations = prometheus:counter("api_rule_operations_total", "Rule CRUD operations", {"operation", "status"})
    package.loaded._metric_profile_operations = prometheus:counter("api_profile_operations_total", "Profile operations", {"operation", "status"})

    -- Upstream / External service metrics
    package.loaded._metric_upstream_requests = prometheus:counter("nginx_upstream_requests_total", "Upstream service requests", {"upstream", "status"})
    package.loaded._metric_upstream_latency = prometheus:histogram("nginx_upstream_response_time_seconds", "Upstream response time", {"upstream"})

    -- Cache metrics (WSL Proxy caching system)
    package.loaded._metric_cache_enabled = prometheus:gauge("nginx_cache_enabled", "Whether caching is enabled for a server (1=enabled, 0=disabled)", {"host"})
    package.loaded._metric_cache_hits = prometheus:counter("nginx_cache_hits_total", "Number of cache hits", {"host", "extension"})
    package.loaded._metric_cache_misses = prometheus:counter("nginx_cache_misses_total", "Number of cache misses", {"host", "extension"})
    package.loaded._metric_cache_bypasses = prometheus:counter("nginx_cache_bypasses_total", "Number of cache bypasses", {"host", "reason"})
    package.loaded._metric_cache_stores = prometheus:counter("nginx_cache_stores_total", "Number of responses stored in cache", {"host", "extension", "content_type"})
    package.loaded._metric_cache_size = prometheus:gauge("nginx_cache_size_bytes", "Current cache size in bytes", {"host"})
    package.loaded._metric_cache_entries = prometheus:gauge("nginx_cache_entries_total", "Total number of cached entries", {"host"})
    package.loaded._metric_cache_evictions = prometheus:counter("nginx_cache_evictions_total", "Number of cache evictions", {"host", "reason"})
    package.loaded._metric_cache_hit_ratio = prometheus:gauge("nginx_cache_hit_ratio", "Cache hit ratio (hits / (hits + misses))", {"host"})

    -- Traffic Router / Backend metrics (multi-backend weighted routing)
    package.loaded._metric_backend_requests = prometheus:counter("wslproxy_backend_requests_total", "Requests routed to each backend", {"rule_id", "backend_label", "status"})
    package.loaded._metric_backend_latency = prometheus:histogram("wslproxy_backend_response_seconds", "Backend response latency", {"rule_id", "backend_label"}, {0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1.0, 2.5})
    package.loaded._metric_backend_health = prometheus:gauge("wslproxy_backend_healthy", "Backend health status (1=healthy, 0=unhealthy)", {"rule_id", "backend_label", "address"})
    package.loaded._metric_traffic_weight = prometheus:gauge("wslproxy_traffic_weight_percent", "Current configured traffic weight for backend", {"rule_id", "backend_label"})

    -- WAF (Web Application Firewall) metrics
    package.loaded._metric_waf_inspections = prometheus:counter("nginx_waf_inspections_total", "Total WAF inspection count", {"host"})
    package.loaded._metric_waf_blocked = prometheus:counter("nginx_waf_blocked_total", "Requests blocked by WAF", {"host", "category", "severity"})
    package.loaded._metric_waf_monitored = prometheus:counter("nginx_waf_monitored_total", "Requests flagged by WAF in monitor mode", {"host", "category", "severity"})
    package.loaded._metric_waf_errors = prometheus:counter("nginx_waf_errors_total", "WAF engine errors (fail-open events)", {"host", "error_type"})
    package.loaded._metric_waf_latency = prometheus:histogram("nginx_waf_inspection_duration_seconds", "WAF inspection duration", {"host"}, {0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1})

    -- Drop series left in the shared dict by the old label scheme (the dict
    -- survives reloads, and every worker indexes every key in it).
    if ngx.worker.id() == 0 then
        ngx.timer.at(5, _M.purge_legacy_series)
    end

    -- Per-worker Lua heap / RSS, shared-dict free space, draining workers,
    -- swap (api/memory_metrics.lua, docs/runbooks/edge-memory.md).
    local mm_ok, memory_metrics = pcall(require, "memory_metrics")
    if mm_ok then
        local ok_init, err_init = pcall(memory_metrics.init, prometheus)
        if not ok_init then
            ngx.log(ngx.WARN, "memory_metrics init failed: ", tostring(err_init))
        end
    else
        ngx.log(ngx.WARN, "memory_metrics module not available: ", tostring(memory_metrics))
    end

    ngx.log(ngx.NOTICE, "WSL Proxy Prometheus metrics initialized successfully")
    return true
end

-- Series of metrics that were removed or whose labels changed meaning. Their
-- keys stay in lua_shared_dict prometheus_metrics until the master restarts,
-- and each new worker loads all of them into its key index.
local LEGACY = {
    { kind = "counter", name = "nginx_http_requests_by_ip_total", labels = { "ip", "host" } },
    { kind = "counter", name = "nginx_http_rate_limited_total", labels = { "host", "ip" } },
}
local LABEL_SCHEMA_KEY = "__wslproxy_metric_label_schema_v2"

--- Delete the series of removed metrics and the proxy metrics labelled with
--- the old upstream IP. Runs once per shared dict lifetime (the marker key
--- survives reloads), from a timer on worker 0, because reset() sleeps for
--- one counter sync interval. Returns how many metrics were reset.
function _M.purge_legacy_series(premature)
    if premature then
        return 0
    end
    local prometheus = package.loaded._prometheus_instance
    local dict = ngx.shared[DICT_NAME]
    if not prometheus or not dict then
        return 0
    end
    local added = dict:add(LABEL_SCHEMA_KEY, 1)
    if not added then
        return 0 -- already done for this dict
    end
    local n = 0
    for _, m in ipairs(LEGACY) do
        local metric = prometheus[m.kind](prometheus, m.name, "removed; see docs/runbooks/edge-memory.md", m.labels)
        if metric and pcall(metric.reset, metric) then
            n = n + 1
        end
    end
    for _, key in ipairs({ "_metric_proxy_requests", "_metric_proxy_latency" }) do
        local metric = package.loaded[key]
        if metric and pcall(metric.reset, metric) then
            n = n + 1
        end
    end
    ngx.log(ngx.NOTICE, "prometheus_metrics: purged legacy series of ", n, " metric(s)")
    return n
end

function _M.get_prometheus()
    return package.loaded._prometheus_instance
end

-- Basic HTTP metrics
function _M.get_metric_requests()
    return package.loaded._metric_requests
end

function _M.get_metric_latency()
    return package.loaded._metric_latency
end

function _M.get_metric_connections()
    return package.loaded._metric_connections
end

function _M.get_metric_request_size()
    return package.loaded._metric_request_size
end

function _M.get_metric_response_size()
    return package.loaded._metric_response_size
end

-- Error metrics
function _M.get_metric_errors()
    return package.loaded._metric_errors
end

function _M.get_metric_4xx_errors()
    return package.loaded._metric_4xx_errors
end

function _M.get_metric_5xx_errors()
    return package.loaded._metric_5xx_errors
end

-- Log level metrics
function _M.get_metric_log_levels()
    return package.loaded._metric_log_levels
end

function _M.get_metric_log_errors()
    return package.loaded._metric_log_errors
end

function _M.get_metric_log_warnings()
    return package.loaded._metric_log_warnings
end

function _M.get_metric_log_notices()
    return package.loaded._metric_log_notices
end

-- Security / DDoS metrics
function _M.get_metric_requests_per_ip()
    return package.loaded._metric_requests_per_ip
end

function _M.get_metric_suspicious_requests()
    return package.loaded._metric_suspicious_requests
end

function _M.get_metric_blocked_requests()
    return package.loaded._metric_blocked_requests
end

function _M.get_metric_rate_limited()
    return package.loaded._metric_rate_limited
end

-- Proxy metrics
function _M.get_metric_proxy_requests()
    return package.loaded._metric_proxy_requests
end

function _M.get_metric_proxy_latency()
    return package.loaded._metric_proxy_latency
end

function _M.get_metric_ssl_handshakes()
    return package.loaded._metric_ssl_handshakes
end

-- Business / API metrics
function _M.get_metric_api_calls()
    return package.loaded._metric_api_calls
end

function _M.get_metric_auth_attempts()
    return package.loaded._metric_auth_attempts
end

function _M.get_metric_auth_failures()
    return package.loaded._metric_auth_failures
end

-- Server/Route operations metrics
function _M.get_metric_server_operations()
    return package.loaded._metric_server_operations
end

function _M.get_metric_rule_operations()
    return package.loaded._metric_rule_operations
end

function _M.get_metric_profile_operations()
    return package.loaded._metric_profile_operations
end

-- Upstream metrics
function _M.get_metric_upstream_requests()
    return package.loaded._metric_upstream_requests
end

function _M.get_metric_upstream_latency()
    return package.loaded._metric_upstream_latency
end

-- Cache metrics getters
function _M.get_metric_cache_enabled()
    return package.loaded._metric_cache_enabled
end

function _M.get_metric_cache_hits()
    return package.loaded._metric_cache_hits
end

function _M.get_metric_cache_misses()
    return package.loaded._metric_cache_misses
end

function _M.get_metric_cache_bypasses()
    return package.loaded._metric_cache_bypasses
end

function _M.get_metric_cache_stores()
    return package.loaded._metric_cache_stores
end

function _M.get_metric_cache_size()
    return package.loaded._metric_cache_size
end

function _M.get_metric_cache_entries()
    return package.loaded._metric_cache_entries
end

function _M.get_metric_cache_evictions()
    return package.loaded._metric_cache_evictions
end

function _M.get_metric_cache_hit_ratio()
    return package.loaded._metric_cache_hit_ratio
end

-- Traffic Router / Backend metrics getters
function _M.get_metric_backend_requests()
    return package.loaded._metric_backend_requests
end

function _M.get_metric_backend_latency()
    return package.loaded._metric_backend_latency
end

function _M.get_metric_backend_health()
    return package.loaded._metric_backend_health
end

function _M.get_metric_traffic_weight()
    return package.loaded._metric_traffic_weight
end

-- WAF metrics getters
function _M.get_metric_waf_inspections()
    return package.loaded._metric_waf_inspections
end

function _M.get_metric_waf_blocked()
    return package.loaded._metric_waf_blocked
end

function _M.get_metric_waf_monitored()
    return package.loaded._metric_waf_monitored
end

function _M.get_metric_waf_errors()
    return package.loaded._metric_waf_errors
end

function _M.get_metric_waf_latency()
    return package.loaded._metric_waf_latency
end

function _M.is_initialized()
    return package.loaded._prometheus_instance ~= nil
end

return _M
