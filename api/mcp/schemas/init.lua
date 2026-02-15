-- MCP Schema Registry
-- Centralizes all MCP JSON schemas for validation, documentation, and agent discovery
-- Each schema is versioned and strongly typed with no free-form blobs

local _M = {}

_M.VERSION = "1.0.0"
_M.SCHEMA_VERSION = "2025-03-26"

-- Load all schema modules
local manifest_schema = require("mcp.schemas.manifest")
local capabilities_schema = require("mcp.schemas.capabilities")
local resource_schema = require("mcp.schemas.resource")
local tool_schema = require("mcp.schemas.tool")
local error_schema = require("mcp.schemas.error")

-- Master schema registry
_M.schemas = {
    manifest = manifest_schema,
    capabilities = capabilities_schema,
    resource = resource_schema,
    resource_list = resource_schema.list_schema,
    tool = tool_schema,
    tool_result = tool_schema.result_schema,
    error = error_schema
}

-- Validate a value against a schema field definition
-- Returns true if valid, false + error message if invalid
function _M.validate_field(value, field_def, field_name)
    if field_def.required and (value == nil or value == "") then
        return false, field_name .. " is required"
    end

    if value == nil then
        return true, nil
    end

    local lua_type = type(value)

    if field_def.type == "string" and lua_type ~= "string" then
        return false, field_name .. " must be a string, got " .. lua_type
    elseif field_def.type == "number" and lua_type ~= "number" then
        return false, field_name .. " must be a number, got " .. lua_type
    elseif field_def.type == "boolean" and lua_type ~= "boolean" then
        return false, field_name .. " must be a boolean, got " .. lua_type
    elseif field_def.type == "object" and lua_type ~= "table" then
        return false, field_name .. " must be an object, got " .. lua_type
    elseif field_def.type == "array" and lua_type ~= "table" then
        return false, field_name .. " must be an array, got " .. lua_type
    end

    -- Check enum constraint
    if field_def.enum and value ~= nil then
        local valid = false
        for _, allowed in ipairs(field_def.enum) do
            if value == allowed then
                valid = true
                break
            end
        end
        if not valid then
            return false, field_name .. " must be one of: " .. table.concat(field_def.enum, ", ")
        end
    end

    return true, nil
end

-- Validate a table against a schema definition
-- Returns true if valid, false + list of errors if invalid
function _M.validate(data, schema)
    if type(data) ~= "table" then
        return false, {"data must be a table"}
    end

    if not schema or not schema.properties then
        return true, nil
    end

    local errors = {}

    for field_name, field_def in pairs(schema.properties) do
        local ok, err = _M.validate_field(data[field_name], field_def, field_name)
        if not ok then
            table.insert(errors, err)
        end
    end

    if #errors > 0 then
        return false, errors
    end

    return true, nil
end

-- Get schema as JSON-compatible table (for /mcp/schemas endpoint)
function _M.get_schema(schema_name)
    local schema = _M.schemas[schema_name]
    if not schema then
        return nil, "Unknown schema: " .. tostring(schema_name)
    end
    return schema, nil
end

-- List all available schemas
function _M.list_schemas()
    local schemas = {}
    for name, schema in pairs(_M.schemas) do
        if type(schema) == "table" and schema.type then
            table.insert(schemas, {
                name = name,
                type = schema.type,
                version = schema.version or _M.SCHEMA_VERSION,
                description = schema.description or ""
            })
        end
    end
    return schemas
end

return _M
