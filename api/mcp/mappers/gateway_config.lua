-- Gateway Config Resource Mapper
-- Maps server configs to MCP wslproxy.gateway_config resources
-- Shows Virtual Server gateway settings: WAF binding, rate limiting, security posture
-- Source: Derived from GET /api/servers with gateway-specific field projection

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.gateway_config"
_M.schema = resource_schema.gateway_config
_M.swagger_source = {
    list = "GET /api/servers (projected to gateway fields)",
    detail = "GET /api/servers/{id} (projected to gateway fields)"
}

-- Map a single server to gateway config resource
function _M.map_one(server)
    if not server then return nil end

    return {
        type = _M.resource_type,
        id = server.id,
        attributes = {
            server_name = server.server_name,
            profile_id = server.profile_id,
            waf_enabled = server.waf_enabled or false,
            waf_policy_id = server.waf_policy_id,
            waf_mode_override = server.waf_mode_override,
            rate_limit_enabled = server.rate_limit_enabled or false,
            rate_limit = server.rate_limit,
            ssl_enabled = server.ssl_enabled,
            cache_enabled = server.cache_enabled
        },
        relationships = {
            waf_policy = server.waf_policy_id and {
                type = "wslproxy.waf_policy",
                id = server.waf_policy_id
            } or nil,
            profile = {
                type = "wslproxy.profile",
                id = server.profile_id
            }
        }
    }
end

-- Map a list of servers to gateway config resources
function _M.to_mcp(data)
    if type(data) ~= "table" then
        return data
    end

    if data.id then
        return _M.map_one(data)
    end

    local resources = {}
    for _, server in ipairs(data) do
        table.insert(resources, _M.map_one(server))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
