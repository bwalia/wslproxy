-- Server Resource Mapper
-- Maps Swagger /api/servers domain objects → MCP wslproxy.server resources
-- Source: Swagger GET /api/servers, GET /api/servers/{id}

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.server"
_M.schema = resource_schema.server
_M.swagger_source = {
    list = "GET /api/servers",
    detail = "GET /api/servers/{id}"
}

-- Map a single server object to typed MCP resource
function _M.map_one(server)
    if not server then return nil end

    return {
        type = _M.resource_type,
        id = server.id,
        attributes = {
            server_name = server.server_name,
            profile_id = server.profile_id,
            listens = server.listens,
            ssl_enabled = server.ssl_enabled,
            config_status = server.config_status,
            created_at = server.created_at,
            updated_at = server.updated_at,
            custom_headers = server.custom_headers,
            custom_response_headers = server.custom_response_headers,
            cache_enabled = server.cache_enabled,
            waf_enabled = server.waf_enabled or false,
            waf_policy_id = server.waf_policy_id,
            waf_mode_override = server.waf_mode_override,
            rate_limit_enabled = server.rate_limit_enabled or false,
            rate_limit = server.rate_limit
        },
        relationships = {
            rules = server.rules and {
                type = "wslproxy.rule",
                id = server.rules
            } or nil,
            profile = {
                type = "wslproxy.profile",
                id = server.profile_id
            },
            waf_policy = server.waf_policy_id and {
                type = "wslproxy.waf_policy",
                id = server.waf_policy_id
            } or nil
        }
    }
end

-- Map a list of servers to typed MCP resources
function _M.to_mcp(data)
    if type(data) ~= "table" then
        return data
    end

    -- If data is a single object with an id, treat as single resource
    if data.id then
        return _M.map_one(data)
    end

    -- Array of servers
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
