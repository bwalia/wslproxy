-- Settings Resource Mapper
-- Maps internal gateway settings → MCP wslproxy.settings resource
-- Source: Internal settings.json (non-sensitive subset)

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.settings"
_M.schema = resource_schema.settings
_M.swagger_source = {
    note = "Internal settings.json, not exposed via Swagger admin API"
}

function _M.map_one(settings)
    if not settings then return nil end

    return {
        type = _M.resource_type,
        id = "current",
        attributes = {
            storage_type = settings.storage_type,
            ssl_staging = settings.ssl_staging,
            ssl_ocsp_stapling = settings.ssl_ocsp_stapling,
            dns_resolver = settings.dns_resolver,
            mcp = settings.mcp
        }
    }
end

function _M.to_mcp(data)
    return _M.map_one(data)
end

return _M
