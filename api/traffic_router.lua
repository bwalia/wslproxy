-- Traffic Router Module
-- Provides multi-backend weighted routing, header-based routing, cookie stickiness,
-- round-robin selection, least-connections selection, and per-backend stat recording.
-- Designed to be fail-open: any error returns nil, caller falls back to redirect_uri.

local cjson = require("cjson.safe")

local _M = { _VERSION = "1.0.0" }

-- Shared dictionary for router runtime state (health, stats, round-robin counters)
local router_dict = ngx.shared.router_state

-- Seed random number generator per-worker
math.randomseed(ngx.worker.pid() + ngx.now() * 1000)

-------------------------------------------------------------------------------
-- Backend selection algorithms
-------------------------------------------------------------------------------

-- Weighted random selection from a list of backends
-- @param backends table: array of { address, weight, label }
-- @return backend table or nil
local function weighted_select(backends)
    local total_weight = 0
    for _, b in ipairs(backends) do
        total_weight = total_weight + (b.weight or 1)
    end

    if total_weight <= 0 then
        return nil
    end

    local rand = math.random(1, total_weight)
    local cumulative = 0

    for i, b in ipairs(backends) do
        cumulative = cumulative + (b.weight or 1)
        if rand <= cumulative then
            return { address = b.address, label = b.label or ("backend_" .. i), backend_index = i }
        end
    end

    -- Fallback (should not reach here)
    return { address = backends[1].address, label = backends[1].label or "backend_1", backend_index = 1 }
end

-- Round-robin selection using a shared dict counter
-- @param rule_id string: identifier for the counter
-- @param backends table: array of backends
-- @return backend table or nil
local function round_robin_select(rule_id, backends)
    if #backends == 0 then return nil end

    local key = "rr:" .. rule_id
    local idx, err = router_dict:incr(key, 1, 0)
    if not idx then
        idx = 0
    end

    local selected_idx = (idx % #backends) + 1
    local b = backends[selected_idx]
    return { address = b.address, label = b.label or ("backend_" .. selected_idx), backend_index = selected_idx }
end

-- Header-based routing: if a specific header matches, route to "canary" backends
-- @param backends table: array of backends
-- @param routing table: routing config with header_name, header_value
-- @param request_ctx table: { headers }
-- @return backend table or nil
local function header_select(backends, routing, request_ctx)
    local header_name = routing.header_name
    local header_value = routing.header_value
    if not header_name or header_name == "" then
        return weighted_select(backends)
    end

    local actual_value = request_ctx.headers and request_ctx.headers[header_name]
    local is_canary = (actual_value == header_value)

    -- Separate backends into canary and stable
    local canary_backends = {}
    local stable_backends = {}
    for _, b in ipairs(backends) do
        if b.label == "canary" then
            table.insert(canary_backends, b)
        else
            table.insert(stable_backends, b)
        end
    end

    if is_canary and #canary_backends > 0 then
        return weighted_select(canary_backends)
    elseif #stable_backends > 0 then
        return weighted_select(stable_backends)
    else
        return weighted_select(backends)
    end
end

-- Least-connections (least busy) selection: picks the backend with fewest total requests
-- @param rule_id string: identifier for stats lookup
-- @param backends table: array of { address, weight, label }
-- @return backend table or nil
local function least_conn_select(rule_id, backends)
    if #backends == 0 then return nil end

    local min_reqs = nil
    local min_backend = nil
    local min_index = nil

    for i, b in ipairs(backends) do
        local label = b.label or ("backend_" .. i)
        local req_key = "stats:" .. rule_id .. ":" .. label .. ":req"
        local reqs = router_dict:get(req_key) or 0

        if min_reqs == nil or reqs < min_reqs then
            min_reqs = reqs
            min_backend = b
            min_index = i
        end
    end

    if not min_backend then
        return nil
    end

    return { address = min_backend.address, label = min_backend.label or ("backend_" .. min_index), backend_index = min_index }
end

-- Cookie-based routing with optional stickiness
-- @param backends table: array of backends
-- @param routing table: routing config with cookie_name, sticky
-- @param request_ctx table: { cookies, headers }
-- @return backend table or nil, boolean (should_set_cookie)
local function cookie_select(backends, routing, request_ctx)
    local cookie_name = routing.cookie_name
    if not cookie_name or cookie_name == "" then
        return weighted_select(backends), false
    end

    -- Parse cookie from request
    local cookie_header = ngx.var.http_cookie or ""
    local pattern = cookie_name .. "=([^;]+)"
    local cookie_value = cookie_header:match(pattern)

    -- If we have a sticky cookie, try to find the matching backend
    if cookie_value and routing.sticky then
        local sticky_key = "sticky:" .. cookie_value
        local sticky_addr = router_dict:get(sticky_key)
        if sticky_addr then
            for i, b in ipairs(backends) do
                if b.address == sticky_addr then
                    return { address = b.address, label = b.label or ("backend_" .. i), backend_index = i }, false
                end
            end
        end
    end

    -- No sticky match, do weighted selection
    local selected = weighted_select(backends)
    if selected and routing.sticky then
        -- Return flag to set sticky cookie
        return selected, true
    end
    return selected, false
end

-------------------------------------------------------------------------------
-- Main entry point
-------------------------------------------------------------------------------

--- Select a backend from a rule's response config
-- @param rule_response table: the match.response from the rule JSON
-- @param request_ctx table: { remote_addr, headers, cookies }
-- @param opts table: optional { exclude = "host:port" } for retry
-- @return table { address, label, backend_index } or nil
function _M.select_backend(rule_response, request_ctx, opts)
    if not rule_response then return nil end

    local backends = rule_response.backends
    if not backends or type(backends) ~= "table" or #backends == 0 then
        return nil
    end

    -- Filter out excluded backends (for retry support)
    local available = backends
    if opts and opts.exclude then
        available = {}
        for _, b in ipairs(backends) do
            if b.address ~= opts.exclude then
                table.insert(available, b)
            end
        end
        if #available == 0 then
            available = backends  -- All excluded, use original list
        end
    end

    -- Filter out backends with weight=0
    local active_backends = {}
    for _, b in ipairs(available) do
        if (b.weight or 1) > 0 then
            table.insert(active_backends, b)
        end
    end
    if #active_backends == 0 then
        return nil
    end

    -- Filter out unhealthy backends (fail-open: if all unhealthy, use all)
    local rule_id = (rule_response.rule_id or "default")
    local healthy_backends = {}
    for _, b in ipairs(active_backends) do
        if _M.is_backend_healthy(rule_id, b.address) then
            table.insert(healthy_backends, b)
        end
    end
    if #healthy_backends > 0 then
        active_backends = healthy_backends
    else
        -- All backends unhealthy — fail-open, try them all
        ngx.log(ngx.WARN, "traffic_router: all backends unhealthy for rule ", rule_id, ", using all")
    end

    local routing = rule_response.routing or {}
    local mode = routing.mode or "weighted"
    local selected = nil
    local set_cookie = false

    if mode == "header" then
        selected = header_select(active_backends, routing, request_ctx or {})
    elseif mode == "cookie" then
        selected, set_cookie = cookie_select(active_backends, routing, request_ctx or {})
    elseif mode == "round_robin" then
        local rule_id = rule_response.rule_id or "default"
        selected = round_robin_select(rule_id, active_backends)
    elseif mode == "least_conn" then
        local rule_id = rule_response.rule_id or "default"
        selected = least_conn_select(rule_id, active_backends)
    else
        -- Default: weighted random
        selected = weighted_select(active_backends)
    end

    -- Set sticky cookie if needed
    if selected and set_cookie and routing.cookie_name then
        local cookie_value = ngx.encode_base64(selected.address)
        local sticky_key = "sticky:" .. cookie_value
        router_dict:set(sticky_key, selected.address, 3600)  -- 1 hour TTL
        ngx.ctx._traffic_router_set_cookie = routing.cookie_name .. "=" .. cookie_value .. "; Path=/; HttpOnly; Max-Age=3600"
    end

    return selected
end

-------------------------------------------------------------------------------
-- Per-backend statistics recording (called from log_by_lua phase)
-------------------------------------------------------------------------------

--- Record per-backend request statistics in shared dict
-- @param rule_id string
-- @param backend_label string
-- @param latency number: request time in seconds
-- @param status number: HTTP status code
-- @param bytes_sent number
function _M.record_backend_stat(rule_id, backend_label, latency, status, bytes_sent)
    if not router_dict or not rule_id or not backend_label then return end

    local req_key = "stats:" .. rule_id .. ":" .. backend_label .. ":req"
    local err_key = "stats:" .. rule_id .. ":" .. backend_label .. ":err"
    local ms_key = "stats:" .. rule_id .. ":" .. backend_label .. ":ms"
    local bytes_key = "stats:" .. rule_id .. ":" .. backend_label .. ":bytes"

    router_dict:incr(req_key, 1, 0)

    if status and status >= 500 then
        router_dict:incr(err_key, 1, 0)

        -- Passive health marking: track consecutive 5xx errors per backend
        local consec_key = "consec5xx:" .. rule_id .. ":" .. backend_label
        local consec = router_dict:incr(consec_key, 1, 0)
        if consec and consec >= 3 then
            -- 3 consecutive 5xx → mark backend unhealthy for 30s
            _M.set_backend_health(rule_id, backend_label, false)
            ngx.log(ngx.WARN, "traffic_router: passive health check marked ", backend_label,
                " unhealthy for rule ", rule_id, " after ", consec, " consecutive 5xx errors")
        end
    else
        -- Reset consecutive 5xx counter on any non-5xx response
        local consec_key = "consec5xx:" .. rule_id .. ":" .. backend_label
        router_dict:set(consec_key, 0, 120)
    end

    if latency then
        router_dict:incr(ms_key, math.floor(latency * 1000), 0)
    end

    if bytes_sent then
        router_dict:incr(bytes_key, bytes_sent, 0)
    end

    -- Record Prometheus metrics
    local ok, metrics = pcall(require, "prometheus_metrics")
    if ok and metrics then
        local m_req = metrics.get_metric_backend_requests()
        if m_req then
            m_req:inc(1, { rule_id, backend_label, tostring(status or 0) })
        end
        local m_lat = metrics.get_metric_backend_latency()
        if m_lat and latency then
            m_lat:observe(latency, { rule_id, backend_label })
        end
    end
end

--- Get per-backend statistics from shared dict
-- @param rule_id string
-- @param backend_label string
-- @return table { requests, errors, avg_latency_ms, bytes }
function _M.get_backend_stats(rule_id, backend_label)
    if not router_dict then return nil end

    local req_key = "stats:" .. rule_id .. ":" .. backend_label .. ":req"
    local err_key = "stats:" .. rule_id .. ":" .. backend_label .. ":err"
    local ms_key = "stats:" .. rule_id .. ":" .. backend_label .. ":ms"
    local bytes_key = "stats:" .. rule_id .. ":" .. backend_label .. ":bytes"

    local requests = router_dict:get(req_key) or 0
    local errors = router_dict:get(err_key) or 0
    local total_ms = router_dict:get(ms_key) or 0
    local total_bytes = router_dict:get(bytes_key) or 0

    return {
        requests = requests,
        errors = errors,
        avg_latency_ms = requests > 0 and math.floor(total_ms / requests) or 0,
        total_bytes = total_bytes,
        error_rate = requests > 0 and (errors / requests * 100) or 0
    }
end

--- Get all backend stats for a rule (keyed by label)
-- @param rule_id string
-- @param labels table: array of label strings
-- @return table keyed by label
function _M.get_all_backend_stats(rule_id, labels)
    local result = {}
    for _, label in ipairs(labels or {}) do
        result[label] = _M.get_backend_stats(rule_id, label)
    end
    return result
end

-------------------------------------------------------------------------------
-- Health check support (for future use with active health checks)
-------------------------------------------------------------------------------

--- Update health status for a backend in shared dict
-- @param rule_id string
-- @param address string
-- @param healthy boolean
function _M.set_backend_health(rule_id, address, healthy)
    if not router_dict then return end
    local key = "health:" .. rule_id .. ":" .. address
    router_dict:set(key, healthy and "1" or "0", 120)  -- 2 min TTL

    -- Update Prometheus gauge
    local ok, metrics = pcall(require, "prometheus_metrics")
    if ok and metrics then
        local m_health = metrics.get_metric_backend_health()
        if m_health then
            m_health:set(healthy and 1 or 0, { rule_id, address, address })
        end
    end
end

--- Check if a backend is healthy
-- @param rule_id string
-- @param address string
-- @return boolean (defaults to true if no health data)
function _M.is_backend_healthy(rule_id, address)
    if not router_dict then return true end
    local key = "health:" .. rule_id .. ":" .. address
    local val = router_dict:get(key)
    if val == nil then return true end  -- No health data = assume healthy
    return val == "1"
end

--- Start active health checks (called from init_worker_by_lua_block)
-- Only runs in worker 0 to avoid duplicate checks
function _M.start_health_checks()
    if ngx.worker.id() ~= 0 then return end

    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    local function check_all_backends()
        -- Scan all rule files for backends with health check paths
        local Helper = require("helpers")
        local settings = Helper.settings()
        local envProfile = (settings and settings.envProfile) or "prod"
        local rules_dir = configPath .. "data/rules/" .. envProfile .. "/"

        local ok, lfs = pcall(require, "lfs")
        if not ok then return end

        for file in lfs.dir(rules_dir) do
            if file:match("%.json$") then
                local fh = io.open(rules_dir .. file, "rb")
                if fh then
                    local content = fh:read("*a")
                    fh:close()
                    local rule = cjson.decode(content)
                    if rule and rule.match and rule.match.response and rule.match.response.backends then
                        local response = rule.match.response
                        local routing = response.routing or {}
                        local health_path = routing.health_check_path
                        if health_path then
                            for _, backend in ipairs(response.backends) do
                                local address = backend.address
                                if address then
                                    local host_part = address:match("^(.-):")
                                    local port_part = address:match(":(%d+)$")
                                    if host_part and port_part then
                                        local httpc_ok, httpc_mod = pcall(require, "resty.http")
                                        if httpc_ok then
                                            local httpc = httpc_mod.new()
                                            httpc:set_timeout(3000)
                                            local url = "http://" .. host_part .. ":" .. port_part .. health_path
                                            local res, err = httpc:request_uri(url, { method = "GET" })
                                            local healthy = res and res.status and res.status < 500
                                            _M.set_backend_health(rule.id or file, address, healthy)
                                        end
                                    end
                                end
                            end
                        end
                    end
                end
            end
        end
    end

    local ok, err = ngx.timer.every(10, function(premature)
        if premature then return end
        local check_ok, check_err = pcall(check_all_backends)
        if not check_ok then
            ngx.log(ngx.WARN, "traffic_router: health check error: ", tostring(check_err))
        end
    end)

    if ok then
        ngx.log(ngx.INFO, "traffic_router: started health check timer (10s interval)")
    else
        ngx.log(ngx.WARN, "traffic_router: failed to start health check timer: ", tostring(err))
    end
end

return _M
