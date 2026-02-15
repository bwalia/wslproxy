-- Rule Resource Mapper
-- Maps Swagger /api/rules domain objects → MCP wslproxy.rule resources
-- Source: Swagger GET /api/rules, GET /api/rules/{id}

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.rule"
_M.schema = resource_schema.rule
_M.swagger_source = {
    list = "GET /api/rules",
    detail = "GET /api/rules/{id}"
}

-- Map a single rule object to typed MCP resource
function _M.map_one(rule)
    if not rule then return nil end

    return {
        type = _M.resource_type,
        id = rule.id,
        attributes = {
            name = rule.name,
            profile_id = rule.profile_id,
            priority = rule.priority,
            version = rule.version,
            match = rule.match,
            response = rule.response,
            created_at = rule.created_at,
            updated_at = rule.updated_at
        },
        relationships = {
            profile = {
                type = "wslproxy.profile",
                id = rule.profile_id
            }
        }
    }
end

-- Map a list of rules to typed MCP resources
function _M.to_mcp(data)
    if type(data) ~= "table" then
        return data
    end

    if data.id then
        return _M.map_one(data)
    end

    local resources = {}
    for _, rule in ipairs(data) do
        table.insert(resources, _M.map_one(rule))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
