-- Health Resource Mapper
-- Maps internal health data → MCP wslproxy.health resource
-- Source: Internal health check (similar to Swagger GET /api/openresty_status)

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.health"
_M.schema = resource_schema.health
_M.swagger_source = {
    related = "GET /api/openresty_status"
}

function _M.map_one(health)
    if not health then return nil end

    return {
        type = _M.resource_type,
        id = "current",
        attributes = {
            status = health.status,
            timestamp = health.timestamp,
            datetime = health.datetime,
            openresty = health.openresty,
            mcp = health.mcp,
            shared_dicts = health.shared_dicts
        }
    }
end

function _M.to_mcp(data)
    return _M.map_one(data)
end

return _M
