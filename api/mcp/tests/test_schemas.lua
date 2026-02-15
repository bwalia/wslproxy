-- Unit tests for MCP Schema validation
-- Run with: resty api/mcp/tests/test_schemas.lua
-- Tests schema definitions, validation logic, and typed resource structures

local cjson = require("cjson")

-- Mock globals that init.lua normally sets
if not Cjson then
    Cjson = cjson
end

local test_results = { passed = 0, failed = 0, errors = {} }

local function assert_eq(name, expected, actual)
    if expected == actual then
        test_results.passed = test_results.passed + 1
    else
        test_results.failed = test_results.failed + 1
        local msg = string.format("FAIL: %s - expected '%s', got '%s'", name, tostring(expected), tostring(actual))
        table.insert(test_results.errors, msg)
    end
end

local function assert_true(name, value)
    if value then
        test_results.passed = test_results.passed + 1
    else
        test_results.failed = test_results.failed + 1
        table.insert(test_results.errors, "FAIL: " .. name .. " - expected true, got " .. tostring(value))
    end
end

local function assert_false(name, value)
    if not value then
        test_results.passed = test_results.passed + 1
    else
        test_results.failed = test_results.failed + 1
        table.insert(test_results.errors, "FAIL: " .. name .. " - expected false, got " .. tostring(value))
    end
end

local function assert_not_nil(name, value)
    if value ~= nil then
        test_results.passed = test_results.passed + 1
    else
        test_results.failed = test_results.failed + 1
        table.insert(test_results.errors, "FAIL: " .. name .. " - expected non-nil, got nil")
    end
end

-----------------------------------------------------------
-- Test: Schema registry loads all schemas
-----------------------------------------------------------
local function test_schema_registry()
    print("  Testing schema registry...")
    local McpSchemas = require("mcp.schemas")

    assert_not_nil("schemas.init", McpSchemas)
    assert_eq("schemas.version", "1.0.0", McpSchemas.VERSION)
    assert_not_nil("schemas.schemas", McpSchemas.schemas)

    -- Check all expected schemas exist
    local expected = {"manifest", "capabilities", "resource", "resource_list", "tool", "tool_result", "error"}
    for _, name in ipairs(expected) do
        assert_not_nil("schemas.has_" .. name, McpSchemas.schemas[name])
    end
end

-----------------------------------------------------------
-- Test: Manifest schema structure
-----------------------------------------------------------
local function test_manifest_schema()
    print("  Testing manifest schema...")
    local manifest = require("mcp.schemas.manifest")

    assert_eq("manifest.type", "wslproxy.mcp.manifest", manifest.type)
    assert_eq("manifest.version", "1.0.0", manifest.version)
    assert_not_nil("manifest.properties", manifest.properties)
    assert_not_nil("manifest.properties.jsonrpc", manifest.properties.jsonrpc)
    assert_not_nil("manifest.properties.result", manifest.properties.result)
    assert_true("manifest.jsonrpc.required", manifest.properties.jsonrpc.required)
    assert_eq("manifest.jsonrpc.type", "string", manifest.properties.jsonrpc.type)

    -- Check example conforms
    assert_not_nil("manifest.example", manifest.example)
    assert_eq("manifest.example.jsonrpc", "2.0", manifest.example.jsonrpc)
    assert_not_nil("manifest.example.result.serverInfo", manifest.example.result.serverInfo)
end

-----------------------------------------------------------
-- Test: Resource schemas for each domain type
-----------------------------------------------------------
local function test_resource_schemas()
    print("  Testing resource schemas...")
    local resource = require("mcp.schemas.resource")

    -- Main resource schema
    assert_eq("resource.type", "wslproxy.mcp.resource", resource.type)
    assert_not_nil("resource.properties", resource.properties)

    -- Check each domain schema exists and has required fields
    local domain_schemas = {
        "server", "rule", "upstream", "profile", "ssl", "cache", "health", "metrics", "settings"
    }

    for _, name in ipairs(domain_schemas) do
        local schema = resource[name]
        assert_not_nil("resource." .. name, schema)
        assert_not_nil("resource." .. name .. ".type", schema.type)
        assert_true("resource." .. name .. ".type_prefix",
            schema.type:match("^wslproxy%.") ~= nil)
        assert_not_nil("resource." .. name .. ".version", schema.version)
        assert_not_nil("resource." .. name .. ".description", schema.description)
        assert_not_nil("resource." .. name .. ".properties", schema.properties)
    end

    -- Verify specific type names
    assert_eq("resource.server.type", "wslproxy.server", resource.server.type)
    assert_eq("resource.rule.type", "wslproxy.rule", resource.rule.type)
    assert_eq("resource.upstream.type", "wslproxy.upstream", resource.upstream.type)
    assert_eq("resource.health.type", "wslproxy.health", resource.health.type)
    assert_eq("resource.metrics.type", "wslproxy.metrics", resource.metrics.type)

    -- Verify server schema has relationships
    assert_not_nil("resource.server.relationships", resource.server.relationships)
    assert_not_nil("resource.server.relationships.rules", resource.server.relationships.rules)
    assert_not_nil("resource.server.relationships.ssl", resource.server.relationships.ssl)
end

-----------------------------------------------------------
-- Test: Tool schema structure
-----------------------------------------------------------
local function test_tool_schema()
    print("  Testing tool schema...")
    local tool = require("mcp.schemas.tool")

    assert_eq("tool.type", "wslproxy.mcp.tool", tool.type)
    assert_not_nil("tool.properties", tool.properties)
    assert_not_nil("tool.properties.name", tool.properties.name)
    assert_not_nil("tool.properties.inputSchema", tool.properties.inputSchema)
    assert_not_nil("tool.properties.annotations", tool.properties.annotations)

    -- Check tool-specific schemas
    assert_not_nil("tool.validate_config", tool.validate_config)
    assert_not_nil("tool.get_error_logs", tool.get_error_logs)
    assert_not_nil("tool.reload_config", tool.reload_config)

    -- Check tool result schema
    assert_not_nil("tool.result_schema", tool.result_schema)
    assert_eq("tool.result_schema.type", "wslproxy.mcp.tool_result", tool.result_schema.type)
end

-----------------------------------------------------------
-- Test: Error schema structure
-----------------------------------------------------------
local function test_error_schema()
    print("  Testing error schema...")
    local error_schema = require("mcp.schemas.error")

    assert_eq("error.type", "wslproxy.mcp.error", error_schema.type)
    assert_not_nil("error.properties", error_schema.properties)
    assert_not_nil("error.codes", error_schema.codes)

    -- Check error codes
    assert_eq("error.codes.PARSE_ERROR", -32700, error_schema.codes.PARSE_ERROR)
    assert_eq("error.codes.METHOD_NOT_FOUND", -32601, error_schema.codes.METHOD_NOT_FOUND)
    assert_eq("error.codes.RESOURCE_NOT_FOUND", -32002, error_schema.codes.RESOURCE_NOT_FOUND)

    -- Check example errors
    assert_not_nil("error.examples", error_schema.examples)
    assert_not_nil("error.examples.authentication", error_schema.examples.authentication)
    assert_not_nil("error.examples.not_found", error_schema.examples.not_found)
end

-----------------------------------------------------------
-- Test: Schema validation function
-----------------------------------------------------------
local function test_schema_validation()
    print("  Testing schema validation...")
    local McpSchemas = require("mcp.schemas")

    -- Test valid field validation
    local ok, err = McpSchemas.validate_field("hello", {type = "string", required = true}, "test_field")
    assert_true("validate.string_valid", ok)

    -- Test required field missing
    ok, err = McpSchemas.validate_field(nil, {type = "string", required = true}, "test_field")
    assert_false("validate.required_missing", ok)

    -- Test type mismatch
    ok, err = McpSchemas.validate_field(123, {type = "string", required = true}, "test_field")
    assert_false("validate.type_mismatch", ok)

    -- Test enum validation
    ok, err = McpSchemas.validate_field("read-only", {type = "string", enum = {"read-only", "read-write"}}, "mode")
    assert_true("validate.enum_valid", ok)

    ok, err = McpSchemas.validate_field("invalid", {type = "string", enum = {"read-only", "read-write"}}, "mode")
    assert_false("validate.enum_invalid", ok)

    -- Test optional field (nil allowed)
    ok, err = McpSchemas.validate_field(nil, {type = "string", required = false}, "optional_field")
    assert_true("validate.optional_nil", ok)

    -- Test boolean validation
    ok, err = McpSchemas.validate_field(true, {type = "boolean", required = true}, "bool_field")
    assert_true("validate.boolean_valid", ok)

    -- Test number validation
    ok, err = McpSchemas.validate_field(42, {type = "number", required = true}, "num_field")
    assert_true("validate.number_valid", ok)

    -- Test table (object) validation
    ok, err = McpSchemas.validate_field({key = "val"}, {type = "object", required = true}, "obj_field")
    assert_true("validate.object_valid", ok)
end

-----------------------------------------------------------
-- Test: Schema list function
-----------------------------------------------------------
local function test_schema_list()
    print("  Testing schema list...")
    local McpSchemas = require("mcp.schemas")

    local schemas = McpSchemas.list_schemas()
    assert_true("list.not_empty", #schemas > 0)

    local found_types = {}
    for _, s in ipairs(schemas) do
        assert_not_nil("list.item.name", s.name)
        assert_not_nil("list.item.type", s.type)
        found_types[s.name] = true
    end

    -- Verify key schemas appear in list
    assert_true("list.has_manifest", found_types["manifest"] == true)
    assert_true("list.has_capabilities", found_types["capabilities"] == true)
    assert_true("list.has_resource", found_types["resource"] == true)
    assert_true("list.has_tool", found_types["tool"] == true)
    assert_true("list.has_error", found_types["error"] == true)
end

-----------------------------------------------------------
-- Test: Capabilities schema
-----------------------------------------------------------
local function test_capabilities_schema()
    print("  Testing capabilities schema...")
    local caps = require("mcp.schemas.capabilities")

    assert_eq("caps.type", "wslproxy.mcp.capabilities", caps.type)
    assert_not_nil("caps.properties", caps.properties)
    assert_not_nil("caps.properties.server", caps.properties.server)
    assert_not_nil("caps.properties.mode", caps.properties.mode)
    assert_not_nil("caps.properties.capabilities", caps.properties.capabilities)
    assert_not_nil("caps.properties.metadata", caps.properties.metadata)

    -- Check mode enum
    local mode_prop = caps.properties.mode
    assert_not_nil("caps.mode.enum", mode_prop.enum)
    assert_eq("caps.mode.enum[1]", "read-only", mode_prop.enum[1])
    assert_eq("caps.mode.enum[2]", "read-write", mode_prop.enum[2])
end

-- Run all tests
print("=== MCP Schema Unit Tests ===")
print("")

test_schema_registry()
test_manifest_schema()
test_resource_schemas()
test_tool_schema()
test_error_schema()
test_schema_validation()
test_schema_list()
test_capabilities_schema()

-- Print results
print("")
print(string.format("Results: %d passed, %d failed", test_results.passed, test_results.failed))
if #test_results.errors > 0 then
    print("")
    print("Failures:")
    for _, err in ipairs(test_results.errors) do
        print("  " .. err)
    end
end

-- Exit with error code if tests failed
if test_results.failed > 0 then
    os.exit(1)
end
