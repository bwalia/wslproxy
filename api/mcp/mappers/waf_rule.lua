-- WAF Rule Resource Mapper
-- Maps /api/waf_rules domain objects → MCP wslproxy.waf_rule resources

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.waf_rule"
_M.schema = resource_schema.waf_rule
_M.swagger_source = {
    list = "GET /api/waf_rules",
    detail = "GET /api/waf_rules/{id}"
}

function _M.map_one(rule)
    if not rule then return nil end

    return {
        type = _M.resource_type,
        id = rule.id,
        attributes = {
            name = rule.name,
            description = rule.description,
            category = rule.category,
            severity = rule.severity,
            enabled = rule.enabled,
            target = rule.target,
            pattern = rule.pattern,
            pattern_type = rule.pattern_type,
            action = rule.action,
            score = rule.score,
            tags = rule.tags,
            profile_id = rule.profile_id,
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
