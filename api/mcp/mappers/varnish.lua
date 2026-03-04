-- Varnish Resource Mapper
-- Maps Swagger /api/varnish/* domain objects → MCP wslproxy.varnish resources
-- Source: Swagger GET /api/varnish/configs, GET /api/varnish/config/{server_name}

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.varnish"
_M.schema = resource_schema.varnish
_M.swagger_source = {
    list = "GET /api/varnish/configs",
    detail = "GET /api/varnish/config/{server_name}",
    status = "GET /api/varnish/status/{server_name}",
    vcl_preview = "GET /api/varnish/vcl/preview/{server_name}"
}

function _M.map_one(varnish_config)
    if not varnish_config then return nil end

    local snippet_count = 0
    if varnish_config.snippets and type(varnish_config.snippets) == "table" then
        snippet_count = #varnish_config.snippets
    end

    return {
        type = _M.resource_type,
        id = varnish_config.server_name,
        attributes = {
            server_name = varnish_config.server_name,
            varnish_enabled = varnish_config.varnish_enabled,
            listen_port = varnish_config.listen_port,
            listen_address = varnish_config.listen_address,
            cache_ttl_default = varnish_config.cache_ttl_default,
            cache_grace = varnish_config.cache_grace,
            cache_size = varnish_config.cache_size,
            health_check_enabled = varnish_config.health_check_enabled,
            snippet_count = snippet_count,
            deploy_status = varnish_config.deploy_status,
            updated_at = varnish_config.updated_at
        },
        relationships = {
            server = {
                type = "wslproxy.server",
                id = varnish_config.server_name
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
    for _, varnish in ipairs(data) do
        table.insert(resources, _M.map_one(varnish))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
