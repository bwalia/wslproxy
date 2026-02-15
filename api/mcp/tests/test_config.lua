-- Unit tests for MCP Config module
-- Run with: resty api/mcp/tests/test_config.lua
-- Or in OpenResty context with: content_by_lua_file

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

-- Test: Default configuration values
local function test_default_config()
    -- Clear any MCP env vars to test defaults
    local saved_enabled = os.getenv("MCP_ENABLED")
    local saved_mode = os.getenv("MCP_MODE")

    local McpConfig = require("mcp.config")
    local config = McpConfig.load()

    assert_eq("default.mode", "read-only", config.mode)
    assert_false("default.tools_enabled", config.tools_enabled)
    assert_eq("default.api_key_header", "X-MCP-API-Key", config.api_key_header)
    assert_eq("default.rate_limit", 100, config.rate_limit)
    assert_eq("default.version", "2025-03-26", config.version)
    assert_eq("default.server_name", "wslproxy-mcp", config.server_name)
    assert_eq("default.server_version", "1.0.0", config.server_version)
    assert_true("default.redact_secrets", config.redact_secrets)
end

-- Test: is_read_only function
local function test_is_read_only()
    local McpConfig = require("mcp.config")

    assert_true("read_only.default", McpConfig.is_read_only({ mode = "read-only" }))
    assert_false("read_only.readwrite", McpConfig.is_read_only({ mode = "read-write" }))
end

-- Test: are_tools_enabled function
local function test_are_tools_enabled()
    local McpConfig = require("mcp.config")

    assert_false("tools.readonly_disabled", McpConfig.are_tools_enabled({ tools_enabled = false, mode = "read-only" }))
    assert_false("tools.readonly_enabled", McpConfig.are_tools_enabled({ tools_enabled = true, mode = "read-only" }))
    assert_true("tools.readwrite_enabled", McpConfig.are_tools_enabled({ tools_enabled = true, mode = "read-write" }))
    assert_false("tools.readwrite_disabled", McpConfig.are_tools_enabled({ tools_enabled = false, mode = "read-write" }))
end

-- Test: Resource registry completeness
local function test_resource_registry()
    local McpResources = require("mcp.resources")

    local registry = McpResources.RESOURCE_REGISTRY
    assert_true("registry.not_empty", #registry > 0)

    local expected_ids = {
        "servers", "rules", "upstreams", "profiles",
        "ssl", "cache", "health", "metrics", "settings"
    }

    local found_ids = {}
    for _, res in ipairs(registry) do
        found_ids[res.id] = true
        assert_true("registry." .. res.id .. ".has_name", res.name ~= nil and res.name ~= "")
        assert_true("registry." .. res.id .. ".has_description", res.description ~= nil and res.description ~= "")
        assert_true("registry." .. res.id .. ".has_uri", res.uri ~= nil and res.uri ~= "")
        assert_eq("registry." .. res.id .. ".mimeType", "application/json", res.mimeType)
    end

    for _, id in ipairs(expected_ids) do
        assert_true("registry.has_" .. id, found_ids[id] == true)
    end
end

-- Test: Tool registry completeness
local function test_tool_registry()
    local McpTools = require("mcp.tools")

    local registry = McpTools.TOOL_REGISTRY
    assert_true("tools.not_empty", #registry > 0)

    local expected_tools = { "validate_config", "get_error_logs", "reload_config" }
    local found_tools = {}

    for _, tool in ipairs(registry) do
        found_tools[tool.name] = true
        assert_true("tools." .. tool.name .. ".has_description", tool.description ~= nil and tool.description ~= "")
        assert_true("tools." .. tool.name .. ".has_inputSchema", tool.inputSchema ~= nil)
        assert_true("tools." .. tool.name .. ".has_annotations", tool.annotations ~= nil)
    end

    for _, name in ipairs(expected_tools) do
        assert_true("tools.has_" .. name, found_tools[name] == true)
    end
end

-- Run all tests
print("=== MCP Unit Tests ===")
print("")

test_default_config()
test_is_read_only()
test_are_tools_enabled()
test_resource_registry()
test_tool_registry()

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
