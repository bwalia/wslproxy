-- update_route.lua
-- API endpoint for registering route mappings (host/path → backend_name)
-- Called by the Go controller via HTTP POST /api/internal/routes/{host}

local cjson = require "cjson.safe"

local routes_dict = ngx.shared.routes

-- Read request body
ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Missing request body" }))
    return ngx.exit(400)
end

-- Parse JSON
local route_config, err = cjson.decode(body)
if not route_config then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Invalid JSON: " .. (err or "unknown error") }))
    return ngx.exit(400)
end

-- Validate required fields
if not route_config.paths or type(route_config.paths) ~= "table" then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Missing or invalid 'paths' field" }))
    return ngx.exit(400)
end

-- Get host from URI
local host = ngx.var.route_host
if not host or host == "" then
    ngx.status = 400
    ngx.say(cjson.encode({ error = "Missing host in URI" }))
    return ngx.exit(400)
end

-- Sort paths by length (longest first) for correct prefix matching
table.sort(route_config.paths, function(a, b)
    return #(a.path or "") > #(b.path or "")
end)

-- Store in shared dict (key: "route:{host}" → JSON array of path rules)
local route_key = "route:" .. host
local json_str, err = cjson.encode(route_config.paths)
if not json_str then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Failed to encode route config: " .. (err or "unknown") }))
    return ngx.exit(500)
end

local ok, err = routes_dict:set(route_key, json_str)
if not ok then
    ngx.status = 500
    ngx.say(cjson.encode({ error = "Failed to store route: " .. (err or "unknown") }))
    return ngx.exit(500)
end

-- Also store in a host index for quick lookups
local hosts_json = routes_dict:get("_hosts") or "[]"
local hosts = cjson.decode(hosts_json) or {}
local found = false
for _, h in ipairs(hosts) do
    if h == host then
        found = true
        break
    end
end
if not found then
    table.insert(hosts, host)
    routes_dict:set("_hosts", cjson.encode(hosts))
end

ngx.log(ngx.INFO, "Updated routes for host: ", host, " (", #route_config.paths, " paths)")

ngx.status = 200
ngx.say(cjson.encode({
    message = "Route updated successfully",
    host = host,
    paths_count = #route_config.paths
}))
