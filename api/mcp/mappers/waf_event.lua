-- WAF Event Resource Mapper
-- Maps WAF events from shared dict → MCP wslproxy.waf_event resources

local _M = {}

local resource_schema = require("mcp.schemas.resource")

_M.resource_type = "wslproxy.waf_event"
_M.schema = resource_schema.waf_event
_M.swagger_source = {
    list = "GET /api/waf_events"
}

function _M.map_one(event)
    if not event then return nil end

    return {
        type = _M.resource_type,
        id = event.id or (event.timestamp .. "-" .. (event.rule_id or "unknown")),
        attributes = {
            timestamp = event.timestamp,
            type = event.type,
            host = event.host,
            rule_id = event.rule_id,
            rule_name = event.rule_name,
            category = event.category,
            severity = event.severity,
            client_ip = event.client_ip,
            uri = event.uri,
            method = event.method,
            score = event.score,
            matched_data = event.matched_data
        },
        relationships = {
            waf_rule = event.rule_id and {
                type = "wslproxy.waf_rule",
                id = event.rule_id
            } or nil
        }
    }
end

function _M.to_mcp(data)
    if type(data) ~= "table" then
        return data
    end

    if data.timestamp and data.rule_id then
        return _M.map_one(data)
    end

    local resources = {}
    for _, event in ipairs(data) do
        table.insert(resources, _M.map_one(event))
    end

    return {
        type = _M.resource_type .. ".list",
        count = #resources,
        items = resources
    }
end

return _M
