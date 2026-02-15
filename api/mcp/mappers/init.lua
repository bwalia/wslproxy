-- MCP Resource Mappers
-- Maps internal WSLProxy domain objects to typed MCP resources
-- One Swagger domain object → one MCP resource type
-- Uses existing internal services, does NOT duplicate business logic

local _M = {}

local server_mapper = require("mcp.mappers.server")
local rule_mapper = require("mcp.mappers.rule")
local upstream_mapper = require("mcp.mappers.upstream")
local profile_mapper = require("mcp.mappers.profile")
local ssl_mapper = require("mcp.mappers.ssl")
local cache_mapper = require("mcp.mappers.cache")
local health_mapper = require("mcp.mappers.health")
local metrics_mapper = require("mcp.mappers.metrics")
local settings_mapper = require("mcp.mappers.settings")

-- Registry mapping resource IDs to their mappers
_M.registry = {
    servers = server_mapper,
    rules = rule_mapper,
    upstreams = upstream_mapper,
    profiles = profile_mapper,
    ssl = ssl_mapper,
    cache = cache_mapper,
    health = health_mapper,
    metrics = metrics_mapper,
    settings = settings_mapper
}

-- Map a raw data table to a typed MCP resource
-- resource_id: the resource type (e.g., "servers")
-- raw_data: the data returned by resources.lua
-- Returns typed resource envelope
function _M.to_mcp_resource(resource_id, raw_data)
    local mapper = _M.registry[resource_id]
    if not mapper then
        return raw_data -- fallback: return raw if no mapper found
    end
    return mapper.to_mcp(raw_data)
end

-- Get the schema type for a resource
function _M.get_resource_type(resource_id)
    local mapper = _M.registry[resource_id]
    if mapper and mapper.resource_type then
        return mapper.resource_type
    end
    return "wslproxy." .. resource_id
end

-- Get the schema for a resource
function _M.get_resource_schema(resource_id)
    local mapper = _M.registry[resource_id]
    if mapper and mapper.schema then
        return mapper.schema
    end
    return nil
end

return _M
