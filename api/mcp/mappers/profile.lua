-- Profile Resource Mapper
-- Maps Swagger /api/profiles domain objects → MCP wslproxy.profile resources
-- Source: Swagger GET /api/profiles

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.profile"
_M.schema = resource_schema.profile
_M.swagger_source = {
    list = "GET /api/profiles"
}

function _M.map_one(profile)
    if not profile then return nil end

    return {
        type = _M.resource_type,
        id = profile.id,
        attributes = {
            name = profile.name,
            server_count = profile.server_count
        },
        relationships = {
            servers = {
                type = "wslproxy.server",
                cardinality = "many"
            },
            rules = {
                type = "wslproxy.rule",
                cardinality = "many"
            }
        }
    }
end

function _M.to_mcp(data)
    if type(data) ~= "table" then
        return data
    end

    if data.id and data.name then
        return _M.map_one(data)
    end

    local resources = {}
    for _, profile in ipairs(data) do
        table.insert(resources, _M.map_one(profile))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
