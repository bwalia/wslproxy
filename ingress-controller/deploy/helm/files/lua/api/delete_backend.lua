-- delete_backend.lua
-- API endpoint for deleting backend configuration
-- Called by the Go controller via HTTP DELETE /api/internal/backends/{name}

local cjson = require "cjson.safe"
local dynamic_upstream = require "upstream.dynamic_upstream"

-- Get backend name from URI
local backend_name = ngx.var.backend_name

-- Delete backend configuration
local ok, err = dynamic_upstream.remove_backend(backend_name)
if not ok then
    ngx.status = 500
    ngx.say(cjson.encode({
        error = "Failed to delete backend: " .. (err or "unknown error")
    }))
    return ngx.exit(500)
end

-- Return success
ngx.status = 200
ngx.say(cjson.encode({
    message = "Backend deleted successfully",
    backend_name = backend_name
}))
