-- delete_route.lua
-- API endpoint for removing route mappings for a host
-- Called by the Go controller via HTTP DELETE /api/internal/routes/{host}

local cjson = require "cjson.safe"

local routes_dict = ngx.shared.routes

local host = ngx.var.route_host
if not host or host == "" then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Missing host in URI" }))
    return ngx.exit(400)
end

local route_key = "route:" .. host
routes_dict:delete(route_key)

-- Remove from host index
local hosts_json = routes_dict:get("_hosts") or "[]"
local hosts = cjson.decode(hosts_json) or {}
local new_hosts = {}
for _, h in ipairs(hosts) do
    if h ~= host then
        table.insert(new_hosts, h)
    end
end
routes_dict:set("_hosts", cjson.encode(new_hosts))

ngx.log(ngx.INFO, "Deleted routes for host: ", host)

ngx.status = 200
ngx.say(cjson.encode({
    message = "Route deleted successfully",
    host = host
}))
