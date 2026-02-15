-- Cache Resource Mapper
-- Maps Swagger /api/cache/* domain objects → MCP wslproxy.cache resources
-- Source: Swagger GET /api/cache/configs, GET /api/cache/config/{server_name}

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.cache"
_M.schema = resource_schema.cache
_M.swagger_source = {
    list = "GET /api/cache/configs",
    detail = "GET /api/cache/config/{server_name}",
    status = "GET /api/cache/status/{server_name}",
    stats = "GET /api/cache/stats"
}

function _M.map_one(cache_config)
    if not cache_config then return nil end

    return {
        type = _M.resource_type,
        id = cache_config.server_name,
        attributes = {
            server_name = cache_config.server_name,
            cache_enabled = cache_config.cache_enabled,
            cache_ttl = cache_config.cache_ttl,
            cached_extensions = cache_config.cached_extensions,
            updated_at = cache_config.updated_at
        },
        relationships = {
            server = {
                type = "wslproxy.server",
                id = cache_config.server_name
            }
        }
    }
end

function _M.to_mcp(data)
    if type(data) ~= "table" then
        return data
    end

    if data.server_name and not data[1] then
        return _M.map_one(data)
    end

    local resources = {}
    for _, cache in ipairs(data) do
        table.insert(resources, _M.map_one(cache))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
