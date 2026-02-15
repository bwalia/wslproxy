-- update_backend.lua
-- API endpoint for updating backend configuration
-- Called by the Go controller via HTTP POST /api/internal/backends/{name}

local cjson = require "cjson.safe"
local dynamic_upstream = require "upstream.dynamic_upstream"

-- Read request body
ngx.req.read_body()
local body = ngx.req.get_body_data()

if not body then
    ngx.status = 400
    ngx.say(cjson.encode({
        error = "Missing request body"
    }))
    return ngx.exit(400)
end

-- Parse JSON
local config, err = cjson.decode(body)
if not config then
    ngx.status = 400
    ngx.say(cjson.encode({
        error = "Invalid JSON: " .. (err or "unknown error")
    }))
    return ngx.exit(400)
end

-- Validate required fields
if not config.upstreams or type(config.upstreams) ~= "table" then
    ngx.status = 400
    ngx.say(cjson.encode({
        error = "Missing or invalid 'upstreams' field"
    }))
    return ngx.exit(400)
end

if #config.upstreams == 0 then
    ngx.status = 400
    ngx.say(cjson.encode({
        error = "At least one upstream is required"
    }))
    return ngx.exit(400)
end

-- Get backend name from URI
local backend_name = ngx.var.backend_name

-- Update backend configuration
local ok, err = dynamic_upstream.update_backend(backend_name, config)
if not ok then
    ngx.status = 500
    ngx.say(cjson.encode({
        error = "Failed to update backend: " .. (err or "unknown error")
    }))
    return ngx.exit(500)
end

-- Return success
ngx.status = 200
ngx.say(cjson.encode({
    message = "Backend updated successfully",
    backend_name = backend_name,
    upstreams_count = #config.upstreams
}))
