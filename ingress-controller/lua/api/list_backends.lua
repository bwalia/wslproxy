-- list_backends.lua
-- API endpoint for listing all backends
-- Called by the Go controller via HTTP GET /api/internal/backends

local cjson = require "cjson.safe"

-- Get all backend keys from shared dictionary
local upstreams_dict = ngx.shared.upstreams
local keys = upstreams_dict:get_keys(0)

local backends = {}

for _, key in ipairs(keys) do
    if key:match("^backend:") then
        local backend_name = key:gsub("^backend:", "")
        local json_str = upstreams_dict:get(key)

        if json_str then
            local config, err = cjson.decode(json_str)
            if config then
                table.insert(backends, {
                    name = backend_name,
                    upstreams_count = #(config.upstreams or {}),
                    load_balancing = config.load_balancing or "round-robin"
                })
            end
        end
    end
end

-- Return list of backends
ngx.status = 200
ngx.say(cjson.encode({
    backends = backends,
    total = #backends
}))
