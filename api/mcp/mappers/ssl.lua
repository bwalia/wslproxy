-- SSL Resource Mapper
-- Maps internal SSL config objects → MCP wslproxy.ssl resources
-- SSL configs are managed internally and linked to server configurations

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.ssl"
_M.schema = resource_schema.ssl
_M.swagger_source = {
    note = "SSL configurations are managed internally, not via a dedicated Swagger endpoint"
}

function _M.map_one(ssl_config)
    if not ssl_config then return nil end

    return {
        type = _M.resource_type,
        id = ssl_config.domain,
        attributes = {
            domain = ssl_config.domain,
            ssl_enabled = ssl_config.ssl_enabled,
            ssl_auto_renew = ssl_config.ssl_auto_renew,
            ssl_force_https = ssl_config.ssl_force_https,
            ssl_email = ssl_config.ssl_email,
            created_at = ssl_config.created_at
        },
        relationships = {
            server = {
                type = "wslproxy.server",
                id = ssl_config.domain
            }
        }
    }
end

function _M.to_mcp(data)
    if type(data) ~= "table" then
        return data
    end

    if data.domain and not data[1] then
        return _M.map_one(data)
    end

    local resources = {}
    for _, ssl in ipairs(data) do
        table.insert(resources, _M.map_one(ssl))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
