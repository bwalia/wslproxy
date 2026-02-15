-- Metrics Resource Mapper
-- Maps internal traffic metrics → MCP wslproxy.metrics resource
-- Source: Internal traffic_stats module, NGINX connection counters

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.metrics"
_M.schema = resource_schema.metrics
_M.swagger_source = {
    note = "Aggregated from internal traffic_stats module and NGINX variables, no direct Swagger endpoint"
}

function _M.map_one(metrics)
    if not metrics then return nil end

    return {
        type = _M.resource_type,
        id = "current",
        attributes = {
            timestamp = metrics.timestamp,
            datetime = metrics.datetime,
            traffic = metrics.traffic,
            connections = metrics.connections,
            latency = metrics.latency,
            request_methods = metrics.request_methods,
            top_domains = metrics.top_domains,
            error_codes = metrics.error_codes
        }
    }
end

function _M.to_mcp(data)
    return _M.map_one(data)
end

return _M
