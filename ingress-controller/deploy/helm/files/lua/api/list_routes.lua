-- list_routes.lua
-- API endpoint for listing all registered route mappings
-- Called via GET /api/internal/routes

local cjson = require "cjson.safe"

local routes_dict = ngx.shared.routes

local hosts_json = routes_dict:get("_hosts") or "[]"
local hosts = cjson.decode(hosts_json) or {}

local result = { routes = {}, total = #hosts }

for _, host in ipairs(hosts) do
    local route_key = "route:" .. host
    local paths_json = routes_dict:get(route_key)
    local paths = {}
    if paths_json then
        paths = cjson.decode(paths_json) or {}
    end
    table.insert(result.routes, {
        host = host,
        paths = paths,
        paths_count = #paths
    })
end

ngx.status = 200
ngx.header["Content-Type"] = "application/json"
ngx.say(cjson.encode(result))
