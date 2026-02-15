-- Upstream Resource Mapper
-- Maps internal upstream objects → MCP wslproxy.upstream resources
-- Note: Upstreams are not exposed directly via Swagger but are part of server configs

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.upstream"
_M.schema = resource_schema.upstream
_M.swagger_source = {
    note = "Upstreams are derived from server configurations, not a direct Swagger endpoint"
}

function _M.map_one(upstream)
    if not upstream then return nil end

    return {
        type = _M.resource_type,
        id = upstream.id,
        attributes = {
            name = upstream.name,
            profile = upstream.profile,
            servers = upstream.servers,
            algorithm = upstream.algorithm or "round-robin",
            health_check = upstream.health_check
        },
        relationships = {
            profile = upstream.profile and {
                type = "wslproxy.profile",
                id = upstream.profile
            } or nil
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
    for _, upstream in ipairs(data) do
        table.insert(resources, _M.map_one(upstream))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
