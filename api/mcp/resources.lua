-- MCP Resources Module for WSLProxy
-- Exposes read-only proxy configuration data as MCP resources
-- Resources: routes, upstreams, servers, auth policies, rate limits, health, metrics

local _M = {}

local cjson = Cjson or require("cjson")
local lfs = LFS or require("lfs")
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local McpConfig = require("mcp.config")

-- Utility: read and parse a JSON file, return nil on error
local function read_json_file(path)
    local file, err = io.open(path, "rb")
    if not file then
        return nil, err
    end
    local content = file:read("*a")
    file:close()
    if not content or content == "" then
        return nil, "empty file"
    end
    local ok, data = pcall(cjson.decode, content)
    if not ok then
        return nil, "JSON decode error: " .. tostring(data)
    end
    return data, nil
end

-- Utility: list JSON files in a directory and parse them
local function read_json_directory(dir_path)
    local items = {}
    local attr = lfs.attributes(dir_path)
    if not attr or attr.mode ~= "directory" then
        return items, "directory not found: " .. dir_path
    end

    for file in lfs.dir(dir_path) do
        if file ~= "." and file ~= ".." and file:match("%.json$") then
            local file_path = dir_path .. "/" .. file
            local data, err = read_json_file(file_path)
            if data then
                -- Use filename without extension as fallback ID
                if not data.id then
                    data.id = file:gsub("%.json$", "")
                end
                table.insert(items, data)
            end
        end
    end

    return items, nil
end

-- Utility: redact sensitive fields from a table
local function redact_sensitive(data, config)
    if not config.redact_secrets then
        return data
    end

    local sensitive_keys = {
        password = true, secret = true, api_key = true, token = true,
        private_key = true, ssl_key = true, passphrase = true,
        jwt_security_passphrase = true, JWT_SECURITY_PASSPHRASE = true,
        aws_secret_access_key = true, AWS_SECRET_ACCESS_KEY = true,
        credentials = true, auth_token = true
    }

    if type(data) ~= "table" then
        return data
    end

    local redacted = {}
    for k, v in pairs(data) do
        local key_lower = type(k) == "string" and string.lower(k) or ""
        if sensitive_keys[key_lower] or sensitive_keys[k] then
            redacted[k] = "[REDACTED]"
        elseif type(v) == "table" then
            redacted[k] = redact_sensitive(v, config)
        else
            redacted[k] = v
        end
    end
    return redacted
end

-----------------------------------------------------------
-- Resource: Servers (HTTP server hosts / virtual hosts)
-----------------------------------------------------------
function _M.get_servers(config, profile_id)
    profile_id = profile_id or "prod"
    local dir = configPath .. "data/servers/" .. profile_id
    local servers, err = read_json_directory(dir)
    if err then
        ngx.log(ngx.WARN, "MCP: Failed to read servers for profile ", profile_id, ": ", err)
    end

    local result = {}
    for _, server in ipairs(servers) do
        -- Expose only safe, non-secret fields
        table.insert(result, redact_sensitive({
            id = server.id,
            server_name = server.server_name,
            profile_id = server.profile_id or profile_id,
            listens = server.listens,
            ssl_enabled = server.ssl_enabled,
            config_status = server.config_status,
            created_at = server.created_at,
            updated_at = server.updated_at,
            custom_headers = server.custom_headers,
            cache_enabled = server.cache_enabled
        }, config))
    end

    return result
end

function _M.get_server(config, server_id, profile_id)
    profile_id = profile_id or "prod"
    local path = configPath .. "data/servers/" .. profile_id .. "/" .. server_id .. ".json"
    local data, err = read_json_file(path)
    if not data then
        return nil, "Server not found: " .. server_id
    end
    return redact_sensitive(data, config), nil
end

-----------------------------------------------------------
-- Resource: Rules (Security rules and HTTP routes)
-----------------------------------------------------------
function _M.get_rules(config, profile_id)
    profile_id = profile_id or "prod"
    local dir = configPath .. "data/rules/" .. profile_id
    local rules, err = read_json_directory(dir)
    if err then
        ngx.log(ngx.WARN, "MCP: Failed to read rules for profile ", profile_id, ": ", err)
    end

    local result = {}
    for _, rule in ipairs(rules) do
        table.insert(result, redact_sensitive({
            id = rule.id,
            name = rule.name,
            profile_id = rule.profile_id or profile_id,
            priority = rule.priority,
            version = rule.version,
            match = rule.match,
            response = rule.response,
            created_at = rule.created_at,
            updated_at = rule.updated_at
        }, config))
    end

    return result
end

function _M.get_rule(config, rule_id, profile_id)
    profile_id = profile_id or "prod"
    local path = configPath .. "data/rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local data, err = read_json_file(path)
    if not data then
        return nil, "Rule not found: " .. rule_id
    end
    return redact_sensitive(data, config), nil
end

-----------------------------------------------------------
-- Resource: Upstreams / Backends
-----------------------------------------------------------
function _M.get_upstreams(config)
    local dir = configPath .. "data/upstreams"
    local upstreams = {}
    local attr = lfs.attributes(dir)
    if not attr or attr.mode ~= "directory" then
        return upstreams, nil
    end

    for profile_dir in lfs.dir(dir) do
        if profile_dir ~= "." and profile_dir ~= ".." then
            local profile_path = dir .. "/" .. profile_dir
            local profile_attr = lfs.attributes(profile_path)
            if profile_attr and profile_attr.mode == "directory" then
                for file in lfs.dir(profile_path) do
                    if file:match("%.json$") then
                        local data, err = read_json_file(profile_path .. "/" .. file)
                        if data then
                            table.insert(upstreams, redact_sensitive({
                                id = data.id or file:gsub("%.json$", ""),
                                name = data.name,
                                profile = profile_dir,
                                servers = data.servers,
                                algorithm = data.algorithm or "round-robin",
                                health_check = data.health_check
                            }, config))
                        end
                    end
                end
            end
        end
    end

    return upstreams, nil
end

-----------------------------------------------------------
-- Resource: Profiles
-----------------------------------------------------------
function _M.get_profiles(config)
    local dir = configPath .. "data/servers"
    local profiles = {}
    local attr = lfs.attributes(dir)
    if not attr or attr.mode ~= "directory" then
        return profiles, nil
    end

    for entry in lfs.dir(dir) do
        if entry ~= "." and entry ~= ".." then
            local entry_path = dir .. "/" .. entry
            local entry_attr = lfs.attributes(entry_path)
            if entry_attr and entry_attr.mode == "directory" then
                -- Count servers in this profile
                local server_count = 0
                for file in lfs.dir(entry_path) do
                    if file:match("%.json$") then
                        server_count = server_count + 1
                    end
                end
                table.insert(profiles, {
                    id = entry,
                    name = entry,
                    server_count = server_count
                })
            end
        end
    end

    return profiles, nil
end

-----------------------------------------------------------
-- Resource: SSL Configurations
-----------------------------------------------------------
function _M.get_ssl_configs(config)
    local dir = configPath .. "data/ssl"
    local ssl_configs = {}
    local attr = lfs.attributes(dir)
    if not attr or attr.mode ~= "directory" then
        return ssl_configs, nil
    end

    for file in lfs.dir(dir) do
        if file:match("%.json$") then
            local data, err = read_json_file(dir .. "/" .. file)
            if data then
                table.insert(ssl_configs, redact_sensitive({
                    domain = file:gsub("%.json$", ""),
                    ssl_enabled = data.ssl_enabled,
                    ssl_auto_renew = data.ssl_auto_renew,
                    ssl_force_https = data.ssl_force_https,
                    ssl_email = data.ssl_email,
                    created_at = data.created_at
                }, config))
            end
        end
    end

    return ssl_configs, nil
end

-----------------------------------------------------------
-- Resource: Cache Configurations
-----------------------------------------------------------
function _M.get_cache_configs(config)
    local dir = configPath .. "data/cache"
    local cache_configs = {}
    local attr = lfs.attributes(dir)
    if not attr or attr.mode ~= "directory" then
        return cache_configs, nil
    end

    for file in lfs.dir(dir) do
        if file:match("%.json$") then
            local data, err = read_json_file(dir .. "/" .. file)
            if data then
                table.insert(cache_configs, {
                    server_name = data.server_name or file:gsub("%.json$", ""),
                    cache_enabled = data.cache_enabled,
                    cache_ttl = data.cache_ttl,
                    cached_extensions = data.cached_extensions,
                    updated_at = data.updated_at
                })
            end
        end
    end

    return cache_configs, nil
end

-----------------------------------------------------------
-- Resource: Health & Status
-----------------------------------------------------------
function _M.get_health(config)
    local health = {
        status = "healthy",
        timestamp = ngx.time(),
        datetime = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time()),
        openresty = {
            worker_pid = ngx.worker.pid(),
            worker_count = ngx.worker.count()
        },
        mcp = {
            enabled = config.enabled,
            mode = config.mode,
            version = config.version
        }
    }

    -- Check shared dictionaries
    local shared_dicts = {
        "auto_ssl", "prometheus_metrics", "ssl_domains",
        "wsl_cache", "wsl_cache_keys", "healthcheck", "traffic_stats"
    }
    health.shared_dicts = {}
    for _, dict_name in ipairs(shared_dicts) do
        local dict = ngx.shared[dict_name]
        if dict then
            health.shared_dicts[dict_name] = {
                available = true,
                free_space = dict:free_space(),
                capacity = (dict.capacity and dict:capacity()) or "unknown"
            }
        else
            health.shared_dicts[dict_name] = { available = false }
        end
    end

    return health
end

-----------------------------------------------------------
-- Resource: Metrics Summary (non-PII, non-secret)
-----------------------------------------------------------
function _M.get_metrics_summary(config)
    local metrics = {
        timestamp = ngx.time(),
        datetime = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
    }

    -- Try to get traffic stats if available
    local ok, traffic_stats = pcall(require, "traffic_stats")
    if ok then
        local summary = traffic_stats.get_summary()
        metrics.traffic = {
            total_requests_24h = summary.total_requests_24h,
            total_success_24h = summary.total_success_24h,
            total_errors_24h = summary.total_errors_24h,
            success_rate = summary.success_rate,
            avg_requests_per_hour = summary.avg_requests_per_hour
        }

        -- Add latency distribution
        local latency = traffic_stats.get_latency_distribution()
        metrics.latency = latency

        -- Add method distribution
        local methods = traffic_stats.get_methods_distribution()
        metrics.request_methods = methods

        -- Add top domains (limited, no PII)
        local top_domains = traffic_stats.get_top_domains(10)
        metrics.top_domains = top_domains

        -- Add error code breakdown
        local error_codes = traffic_stats.get_error_codes()
        metrics.error_codes = error_codes
    else
        metrics.traffic = { available = false, reason = "traffic_stats module not loaded" }
    end

    -- NGINX connection stats
    metrics.connections = {
        reading = tonumber(ngx.var.connections_reading) or 0,
        writing = tonumber(ngx.var.connections_writing) or 0,
        waiting = tonumber(ngx.var.connections_waiting) or 0,
        active = tonumber(ngx.var.connections_active) or 0
    }

    return metrics
end

-----------------------------------------------------------
-- Resource: Settings (safe subset only)
-----------------------------------------------------------
function _M.get_settings_safe(config)
    local settings_path = configPath .. "data/settings.json"
    local settings, err = read_json_file(settings_path)
    if not settings then
        return nil, err
    end

    -- Only expose non-sensitive settings
    local safe_settings = {
        storage_type = settings.storage_type,
        ssl_staging = settings.ssl_staging,
        ssl_ocsp_stapling = settings.ssl_ocsp_stapling,
        ip2location_path = settings.ip2location_path,
        dns_resolver = settings.dns_resolver,
        mcp = settings.mcp
    }

    -- Redact any secrets that might have leaked
    return redact_sensitive(safe_settings, config), nil
end

-----------------------------------------------------------
-- Master resource registry
-----------------------------------------------------------
_M.RESOURCE_REGISTRY = {
    {
        id = "servers",
        name = "HTTP Servers",
        description = "Virtual host / server configurations managed by WSLProxy",
        uri = "wslproxy://resources/servers",
        mimeType = "application/json",
        category = "configuration",
        read_only = true
    },
    {
        id = "rules",
        name = "Security Rules & Routes",
        description = "HTTP routing rules and security policies applied to incoming requests",
        uri = "wslproxy://resources/rules",
        mimeType = "application/json",
        category = "configuration",
        read_only = true
    },
    {
        id = "upstreams",
        name = "Upstreams / Backends",
        description = "Backend upstream server pool configurations",
        uri = "wslproxy://resources/upstreams",
        mimeType = "application/json",
        category = "configuration",
        read_only = true
    },
    {
        id = "profiles",
        name = "Environment Profiles",
        description = "Deployment environment profiles (dev, staging, prod)",
        uri = "wslproxy://resources/profiles",
        mimeType = "application/json",
        category = "configuration",
        read_only = true
    },
    {
        id = "ssl",
        name = "SSL Configurations",
        description = "SSL/TLS certificate configurations per domain",
        uri = "wslproxy://resources/ssl",
        mimeType = "application/json",
        category = "security",
        read_only = true
    },
    {
        id = "cache",
        name = "Cache Configurations",
        description = "Static content cache configurations per server",
        uri = "wslproxy://resources/cache",
        mimeType = "application/json",
        category = "performance",
        read_only = true
    },
    {
        id = "health",
        name = "Health & Status",
        description = "Current health status of the WSLProxy gateway including worker info and shared dict usage",
        uri = "wslproxy://resources/health",
        mimeType = "application/json",
        category = "observability",
        read_only = true
    },
    {
        id = "metrics",
        name = "Metrics Summary",
        description = "Aggregated traffic metrics, latency distributions, error rates (non-PII)",
        uri = "wslproxy://resources/metrics",
        mimeType = "application/json",
        category = "observability",
        read_only = true
    },
    {
        id = "settings",
        name = "Gateway Settings",
        description = "Non-sensitive gateway configuration settings",
        uri = "wslproxy://resources/settings",
        mimeType = "application/json",
        category = "configuration",
        read_only = true
    },
    {
        id = "waf_rules",
        name = "WAF Rules",
        description = "Web Application Firewall detection rules (SQLi, XSS, Command Injection, etc.)",
        uri = "wslproxy://resources/waf_rules",
        mimeType = "application/json",
        category = "security",
        read_only = true
    },
    {
        id = "waf_policies",
        name = "WAF Policies",
        description = "WAF policies grouping rules with enforcement mode and thresholds",
        uri = "wslproxy://resources/waf_policies",
        mimeType = "application/json",
        category = "security",
        read_only = true
    },
    {
        id = "waf_events",
        name = "WAF Events",
        description = "Recent WAF inspection events (blocked and monitored requests)",
        uri = "wslproxy://resources/waf_events",
        mimeType = "application/json",
        category = "security",
        read_only = true
    },
    {
        id = "gateway_config",
        name = "Gateway Config",
        description = "Per-Virtual Server gateway settings: WAF binding, rate limiting, security posture",
        uri = "wslproxy://resources/gateway_config",
        mimeType = "application/json",
        category = "security",
        read_only = true
    }
}

-----------------------------------------------------------
-- Resource: WAF Rules
-----------------------------------------------------------
function _M.get_waf_rules(config, profile_id)
    profile_id = profile_id or "prod"
    local dir = configPath .. "data/waf_rules/" .. profile_id
    local rules, err = read_json_directory(dir)
    if err then
        ngx.log(ngx.WARN, "MCP: Failed to read WAF rules for profile ", profile_id, ": ", err)
    end
    return rules
end

function _M.get_waf_rule(config, rule_id, profile_id)
    profile_id = profile_id or "prod"
    local path = configPath .. "data/waf_rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local data, err = read_json_file(path)
    if not data then
        return nil, "WAF rule not found: " .. rule_id
    end
    return data, nil
end

-----------------------------------------------------------
-- Resource: WAF Policies
-----------------------------------------------------------
function _M.get_waf_policies(config, profile_id)
    profile_id = profile_id or "prod"
    local dir = configPath .. "data/waf_policies/" .. profile_id
    local policies, err = read_json_directory(dir)
    if err then
        ngx.log(ngx.WARN, "MCP: Failed to read WAF policies for profile ", profile_id, ": ", err)
    end
    return policies
end

function _M.get_waf_policy(config, policy_id, profile_id)
    profile_id = profile_id or "prod"
    local path = configPath .. "data/waf_policies/" .. profile_id .. "/" .. policy_id .. ".json"
    local data, err = read_json_file(path)
    if not data then
        return nil, "WAF policy not found: " .. policy_id
    end
    return data, nil
end

-----------------------------------------------------------
-- Resource: WAF Events (from shared dict)
-----------------------------------------------------------
function _M.get_waf_events(config)
    local events = {}
    local waf_dict = ngx.shared.waf_events
    if not waf_dict then
        return events
    end

    local keys = waf_dict:get_keys(500)
    for _, key in ipairs(keys) do
        local val = waf_dict:get(key)
        if val then
            local ok, event = pcall(cjson.decode, val)
            if ok and event then
                table.insert(events, event)
            end
        end
    end

    -- Sort by timestamp descending
    table.sort(events, function(a, b)
        return (a.timestamp or 0) > (b.timestamp or 0)
    end)

    return events
end

-----------------------------------------------------------
-- Resource: Gateway Config (composite view of server gateway settings)
-----------------------------------------------------------
function _M.get_gateway_config(config, profile_id)
    profile_id = profile_id or "prod"
    local dir = configPath .. "data/servers/" .. profile_id
    local servers, err = read_json_directory(dir)
    if err then
        ngx.log(ngx.WARN, "MCP: Failed to read servers for gateway config, profile ", profile_id, ": ", err)
    end

    local result = {}
    for _, server in ipairs(servers) do
        table.insert(result, {
            id = server.id,
            server_name = server.server_name,
            profile_id = server.profile_id or profile_id,
            waf_enabled = server.waf_enabled or false,
            waf_policy_id = server.waf_policy_id,
            waf_mode_override = server.waf_mode_override,
            rate_limit_enabled = server.rate_limit_enabled or false,
            rate_limit = server.rate_limit,
            ssl_enabled = server.ssl_enabled,
            cache_enabled = server.cache_enabled
        })
    end

    return result
end

-- Get a specific resource by ID
function _M.get_resource(resource_id, config, params)
    local profile_id = params and params.profile_id or "prod"

    local handlers = {
        servers = function() return _M.get_servers(config, profile_id), nil end,
        rules = function() return _M.get_rules(config, profile_id), nil end,
        upstreams = function() return _M.get_upstreams(config) end,
        profiles = function() return _M.get_profiles(config), nil end,
        ssl = function() return _M.get_ssl_configs(config), nil end,
        cache = function() return _M.get_cache_configs(config), nil end,
        health = function() return _M.get_health(config), nil end,
        metrics = function() return _M.get_metrics_summary(config), nil end,
        settings = function() return _M.get_settings_safe(config) end,
        waf_rules = function() return _M.get_waf_rules(config, profile_id), nil end,
        waf_policies = function() return _M.get_waf_policies(config, profile_id), nil end,
        waf_events = function() return _M.get_waf_events(config), nil end,
        gateway_config = function() return _M.get_gateway_config(config, profile_id), nil end
    }

    local handler = handlers[resource_id]
    if not handler then
        return nil, "Unknown resource: " .. resource_id
    end

    return handler()
end

return _M
