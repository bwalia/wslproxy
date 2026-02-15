-- dynamic_upstream.lua
-- Zero-downtime dynamic upstream management for WSLProxy Ingress Controller
-- Uses lua-resty-balancer for dynamic peer management

local balancer = require "ngx.balancer"
local cjson = require "cjson.safe"
local http = require "resty.http"

local _M = { _VERSION = '1.0.0' }

-- Shared dictionaries (defined in nginx.conf)
-- lua_shared_dict upstreams 10m;
-- lua_shared_dict upstream_health 10m;
local upstreams_dict = ngx.shared.upstreams
local health_dict = ngx.shared.upstream_health

-- Constants
local HEALTH_CHECK_INTERVAL = 5  -- seconds
local FAIL_TIMEOUT = 10          -- seconds
local MAX_FAILS = 3

-- Helper function to generate upstream key
local function upstream_key(backend_name)
    return "backend:" .. backend_name
end

-- Helper function to generate peer key
local function peer_key(host, port)
    return host .. ":" .. port
end

-- Add or update an upstream backend
-- @param backend_name string: name of the backend
-- @param config table: backend configuration
--   {
--     upstreams = { {host="", port=0, weight=1, max_fails=3, fail_timeout=10}, ... },
--     load_balancing = "round-robin"|"least-connections"|"ip-hash"|"weighted-round-robin",
--     health_check = { enabled=true, interval=5, timeout=3, path="/health", expected_status=200 }
--   }
function _M.update_backend(backend_name, config)
    local key = upstream_key(backend_name)

    -- Serialize config to JSON
    local json_str, err = cjson.encode(config)
    if not json_str then
        ngx.log(ngx.ERR, "Failed to encode backend config: ", err)
        return false, err
    end

    -- Store in shared dict
    local ok, err = upstreams_dict:set(key, json_str)
    if not ok then
        ngx.log(ngx.ERR, "Failed to store backend config: ", err)
        return false, err
    end

    ngx.log(ngx.INFO, "Updated backend: ", backend_name, " with ", #config.upstreams, " upstreams")

    -- Initialize health status for all peers
    for _, upstream in ipairs(config.upstreams) do
        local peer = peer_key(upstream.host, upstream.port)
        local health_key = backend_name .. ":" .. peer
        health_dict:set(health_key, 1)  -- 1 = healthy, 0 = unhealthy
        health_dict:set(health_key .. ":fails", 0)
    end

    return true
end

-- Remove a backend
function _M.remove_backend(backend_name)
    local key = upstream_key(backend_name)
    upstreams_dict:delete(key)
    ngx.log(ngx.INFO, "Removed backend: ", backend_name)
    return true
end

-- Get backend configuration
function _M.get_backend(backend_name)
    local key = upstream_key(backend_name)
    local json_str = upstreams_dict:get(key)

    if not json_str then
        return nil, "backend not found"
    end

    local config, err = cjson.decode(json_str)
    if not config then
        ngx.log(ngx.ERR, "Failed to decode backend config: ", err)
        return nil, err
    end

    return config
end

-- Round-robin load balancing
local round_robin_state = {}
local function balance_round_robin(backend_name, upstreams)
    if not round_robin_state[backend_name] then
        round_robin_state[backend_name] = 0
    end

    local healthy_upstreams = {}
    for _, upstream in ipairs(upstreams) do
        local peer = peer_key(upstream.host, upstream.port)
        local health_key = backend_name .. ":" .. peer
        local is_healthy = health_dict:get(health_key)

        if is_healthy and is_healthy == 1 then
            table.insert(healthy_upstreams, upstream)
        end
    end

    if #healthy_upstreams == 0 then
        return nil, "no healthy upstreams available"
    end

    round_robin_state[backend_name] = (round_robin_state[backend_name] % #healthy_upstreams) + 1
    return healthy_upstreams[round_robin_state[backend_name]]
end

-- Weighted round-robin load balancing
local function balance_weighted_round_robin(backend_name, upstreams)
    local healthy_upstreams = {}
    local total_weight = 0

    for _, upstream in ipairs(upstreams) do
        local peer = peer_key(upstream.host, upstream.port)
        local health_key = backend_name .. ":" .. peer
        local is_healthy = health_dict:get(health_key)

        if is_healthy and is_healthy == 1 then
            table.insert(healthy_upstreams, upstream)
            total_weight = total_weight + (upstream.weight or 1)
        end
    end

    if #healthy_upstreams == 0 then
        return nil, "no healthy upstreams available"
    end

    -- Simple weighted selection
    local rand = math.random(1, total_weight)
    local current_weight = 0

    for _, upstream in ipairs(healthy_upstreams) do
        current_weight = current_weight + (upstream.weight or 1)
        if rand <= current_weight then
            return upstream
        end
    end

    return healthy_upstreams[1]
end

-- IP hash load balancing
local function balance_ip_hash(backend_name, upstreams)
    local healthy_upstreams = {}

    for _, upstream in ipairs(upstreams) do
        local peer = peer_key(upstream.host, upstream.port)
        local health_key = backend_name .. ":" .. peer
        local is_healthy = health_dict:get(health_key)

        if is_healthy and is_healthy == 1 then
            table.insert(healthy_upstreams, upstream)
        end
    end

    if #healthy_upstreams == 0 then
        return nil, "no healthy upstreams available"
    end

    -- Hash client IP
    local client_ip = ngx.var.remote_addr
    local hash = ngx.crc32_long(client_ip)
    local index = (hash % #healthy_upstreams) + 1

    return healthy_upstreams[index]
end

-- Select upstream based on load balancing strategy
function _M.select_upstream(backend_name)
    local config, err = _M.get_backend(backend_name)
    if not config then
        return nil, err
    end

    local strategy = config.load_balancing or "round-robin"
    local upstream

    if strategy == "round-robin" then
        upstream, err = balance_round_robin(backend_name, config.upstreams)
    elseif strategy == "weighted-round-robin" then
        upstream, err = balance_weighted_round_robin(backend_name, config.upstreams)
    elseif strategy == "ip-hash" then
        upstream, err = balance_ip_hash(backend_name, config.upstreams)
    else
        upstream, err = balance_round_robin(backend_name, config.upstreams)
    end

    if not upstream then
        return nil, err
    end

    return upstream
end

-- Balancer callback for OpenResty
function _M.balance()
    local backend_name = ngx.var.backend_name
    if not backend_name then
        ngx.log(ngx.ERR, "No backend_name variable set")
        return ngx.exit(500)
    end

    local upstream, err = _M.select_upstream(backend_name)
    if not upstream then
        ngx.log(ngx.ERR, "Failed to select upstream: ", err)
        return ngx.exit(502)
    end

    -- Set the chosen peer
    local ok, err = balancer.set_current_peer(upstream.host, upstream.port)
    if not ok then
        ngx.log(ngx.ERR, "Failed to set current peer: ", err)
        return ngx.exit(500)
    end

    -- Set connection timeouts
    if upstream.connect_timeout then
        balancer.set_timeouts(upstream.connect_timeout, upstream.send_timeout, upstream.read_timeout)
    end
end

-- Mark peer as failed (called on upstream failure)
function _M.mark_peer_failed(backend_name, host, port)
    local peer = peer_key(host, port)
    local health_key = backend_name .. ":" .. peer
    local fails_key = health_key .. ":fails"

    local current_fails = health_dict:get(fails_key) or 0
    local new_fails = current_fails + 1

    health_dict:set(fails_key, new_fails)

    if new_fails >= MAX_FAILS then
        health_dict:set(health_key, 0)  -- Mark as unhealthy
        ngx.log(ngx.WARN, "Marked peer as unhealthy: ", peer, " (", new_fails, " fails)")
    end
end

-- Active health check (called via timer)
function _M.health_check(backend_name)
    local config, err = _M.get_backend(backend_name)
    if not config or not config.health_check or not config.health_check.enabled then
        return
    end

    local hc = config.health_check
    local httpc = http.new()
    httpc:set_timeout((hc.timeout or 3) * 1000)

    for _, upstream in ipairs(config.upstreams) do
        local peer = peer_key(upstream.host, upstream.port)
        local health_key = backend_name .. ":" .. peer

        local url = "http://" .. upstream.host .. ":" .. upstream.port .. (hc.path or "/health")
        local res, err = httpc:request_uri(url, {
            method = "GET",
            keepalive_timeout = 60000,
            keepalive_pool = 10
        })

        if res and res.status == (hc.expected_status or 200) then
            health_dict:set(health_key, 1)  -- Healthy
            health_dict:set(health_key .. ":fails", 0)
        else
            _M.mark_peer_failed(backend_name, upstream.host, upstream.port)
            ngx.log(ngx.WARN, "Health check failed for ", peer, ": ", err or "status=" .. (res and res.status or "unknown"))
        end
    end
end

-- Start health check timer
function _M.start_health_checks()
    local function health_check_worker()
        -- Get all backends
        local keys = upstreams_dict:get_keys(0)
        for _, key in ipairs(keys) do
            if key:match("^backend:") then
                local backend_name = key:gsub("^backend:", "")
                local ok, err = pcall(_M.health_check, backend_name)
                if not ok then
                    ngx.log(ngx.ERR, "Health check error for ", backend_name, ": ", err)
                end
            end
        end
    end

    local ok, err = ngx.timer.every(HEALTH_CHECK_INTERVAL, health_check_worker)
    if not ok then
        ngx.log(ngx.ERR, "Failed to create health check timer: ", err)
        return false
    end

    ngx.log(ngx.INFO, "Started health check timer with interval ", HEALTH_CHECK_INTERVAL, "s")
    return true
end

return _M
