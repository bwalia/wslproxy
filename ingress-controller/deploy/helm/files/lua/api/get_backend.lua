-- get_backend.lua
-- API endpoint for getting backend status
-- Called by the Go controller via HTTP GET /api/internal/backends/{name}

local cjson = require "cjson.safe"
local dynamic_upstream = require "upstream.dynamic_upstream"

-- Get backend name from URI
local backend_name = ngx.var.backend_name

-- Get backend configuration
local config, err = dynamic_upstream.get_backend(backend_name)
if not config then
    ngx.status = 404
    ngx.say(cjson.encode({
        error = "Backend not found: " .. (err or "unknown error")
    }))
    return ngx.exit(404)
end

-- Get health status for all upstreams
local health_dict = ngx.shared.upstream_health
local upstreams_status = {}

for _, upstream in ipairs(config.upstreams) do
    local peer_key = upstream.host .. ":" .. upstream.port
    local health_key = backend_name .. ":" .. peer_key
    local is_healthy = health_dict:get(health_key)
    local fails = health_dict:get(health_key .. ":fails") or 0

    table.insert(upstreams_status, {
        host = upstream.host,
        port = upstream.port,
        weight = upstream.weight or 1,
        healthy = is_healthy == 1,
        fails = fails
    })
end

-- Return backend status
ngx.status = 200
ngx.say(cjson.encode({
    backend_name = backend_name,
    load_balancing = config.load_balancing or "round-robin",
    upstreams = upstreams_status,
    health_check = config.health_check,
    circuit_breaker = config.circuit_breaker
}))
