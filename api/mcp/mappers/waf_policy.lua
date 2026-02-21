-- WAF Policy Resource Mapper
-- Maps /api/waf_policies domain objects → MCP wslproxy.waf_policy resources

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.waf_policy"
_M.schema = resource_schema.waf_policy
_M.swagger_source = {
    list = "GET /api/waf_policies",
    detail = "GET /api/waf_policies/{id}"
}

function _M.map_one(policy)
    if not policy then return nil end

    return {
        type = _M.resource_type,
        id = policy.id,
        attributes = {
            name = policy.name,
            description = policy.description,
            mode = policy.mode,
            enabled = policy.enabled,
            waf_rules = policy.waf_rules,
            anomaly_threshold = policy.anomaly_threshold,
            paranoia_level = policy.paranoia_level,
            body_inspection = policy.body_inspection,
            max_body_size = policy.max_body_size,
            whitelist = policy.whitelist,
            blocked_response = policy.blocked_response,
            profile_id = policy.profile_id,
            created_at = policy.created_at,
            updated_at = policy.updated_at
        },
        relationships = {
            profile = {
                type = "wslproxy.profile",
                id = policy.profile_id
            },
            waf_rules = {
                type = "wslproxy.waf_rule",
                ids = policy.waf_rules
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
    for _, policy in ipairs(data) do
        table.insert(resources, _M.map_one(policy))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
