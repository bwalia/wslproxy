-- Unit tests for MCP Resource Mappers
-- Run with: resty api/mcp/tests/test_mappers.lua
-- Tests that Swagger domain objects are correctly transformed into typed MCP resources

local cjson = require("cjson")

-- Mock globals
if not Cjson then Cjson = cjson end

local test_results = { passed = 0, failed = 0, errors = {} }

local function assert_eq(name, expected, actual)
    if expected == actual then
        test_results.passed = test_results.passed + 1
    else
        test_results.failed = test_results.failed + 1
        table.insert(test_results.errors,
            string.format("FAIL: %s - expected '%s', got '%s'", name, tostring(expected), tostring(actual)))
    end
end

local function assert_true(name, value)
    if value then
        test_results.passed = test_results.passed + 1
    else
        test_results.failed = test_results.failed + 1
        table.insert(test_results.errors, "FAIL: " .. name .. " - expected true")
    end
end

local function assert_not_nil(name, value)
    if value ~= nil then
        test_results.passed = test_results.passed + 1
    else
        test_results.failed = test_results.failed + 1
        table.insert(test_results.errors, "FAIL: " .. name .. " - expected non-nil")
    end
end

-----------------------------------------------------------
-- Test: Server mapper
-----------------------------------------------------------
local function test_server_mapper()
    print("  Testing server mapper...")
    local mapper = require("mcp.mappers.server")

    assert_eq("server.resource_type", "wslproxy.server", mapper.resource_type)

    -- Test single server mapping
    local raw_server = {
        id = "srv-123",
        server_name = "api.example.com",
        profile_id = "prod",
        ssl_enabled = true,
        config_status = true,
        cache_enabled = false,
        listens = {{listen = "443"}},
        rules = "rule-456"
    }

    local mapped = mapper.map_one(raw_server)
    assert_eq("server.mapped.type", "wslproxy.server", mapped.type)
    assert_eq("server.mapped.id", "srv-123", mapped.id)
    assert_eq("server.mapped.attrs.server_name", "api.example.com", mapped.attributes.server_name)
    assert_eq("server.mapped.attrs.ssl_enabled", true, mapped.attributes.ssl_enabled)
    assert_not_nil("server.mapped.relationships", mapped.relationships)
    assert_not_nil("server.mapped.relationships.profile", mapped.relationships.profile)
    assert_eq("server.mapped.relationships.profile.type", "wslproxy.profile", mapped.relationships.profile.type)

    -- Test list mapping
    local raw_list = {raw_server, {id = "srv-456", server_name = "app.example.com", profile_id = "prod"}}
    local mapped_list = mapper.to_mcp(raw_list)
    assert_eq("server.list.type", "wslproxy.server.list", mapped_list.type)
    assert_eq("server.list.count", 2, mapped_list.count)
    assert_not_nil("server.list.items", mapped_list.items)
end

-----------------------------------------------------------
-- Test: Rule mapper
-----------------------------------------------------------
local function test_rule_mapper()
    print("  Testing rule mapper...")
    local mapper = require("mcp.mappers.rule")

    assert_eq("rule.resource_type", "wslproxy.rule", mapper.resource_type)

    local raw_rule = {
        id = "rule-789",
        name = "Block_Bots",
        profile_id = "prod",
        priority = 1,
        version = 2,
        match = {rules = {path_key = "starts_with", path = "/api"}},
        response = {allow = false, code = 403}
    }

    local mapped = mapper.map_one(raw_rule)
    assert_eq("rule.mapped.type", "wslproxy.rule", mapped.type)
    assert_eq("rule.mapped.id", "rule-789", mapped.id)
    assert_eq("rule.mapped.attrs.name", "Block_Bots", mapped.attributes.name)
    assert_eq("rule.mapped.attrs.priority", 1, mapped.attributes.priority)
    assert_not_nil("rule.mapped.attrs.match", mapped.attributes.match)
    assert_not_nil("rule.mapped.relationships.profile", mapped.relationships.profile)
end

-----------------------------------------------------------
-- Test: Upstream mapper
-----------------------------------------------------------
local function test_upstream_mapper()
    print("  Testing upstream mapper...")
    local mapper = require("mcp.mappers.upstream")

    assert_eq("upstream.resource_type", "wslproxy.upstream", mapper.resource_type)

    local raw = {
        id = "ups-001",
        name = "backend-pool",
        profile = "prod",
        servers = {{address = "10.0.0.1:8080", weight = 1}},
        algorithm = "round-robin"
    }

    local mapped = mapper.map_one(raw)
    assert_eq("upstream.mapped.type", "wslproxy.upstream", mapped.type)
    assert_eq("upstream.mapped.attrs.algorithm", "round-robin", mapped.attributes.algorithm)
end

-----------------------------------------------------------
-- Test: Health mapper
-----------------------------------------------------------
local function test_health_mapper()
    print("  Testing health mapper...")
    local mapper = require("mcp.mappers.health")

    assert_eq("health.resource_type", "wslproxy.health", mapper.resource_type)

    local raw = {
        status = "healthy",
        timestamp = 1739635200,
        datetime = "2026-02-15T12:00:00Z",
        openresty = {worker_pid = 1234, worker_count = 4},
        mcp = {enabled = true, mode = "read-only", version = "2025-03-26"}
    }

    local mapped = mapper.to_mcp(raw)
    assert_eq("health.mapped.type", "wslproxy.health", mapped.type)
    assert_eq("health.mapped.id", "current", mapped.id)
    assert_eq("health.mapped.attrs.status", "healthy", mapped.attributes.status)
end

-----------------------------------------------------------
-- Test: Metrics mapper
-----------------------------------------------------------
local function test_metrics_mapper()
    print("  Testing metrics mapper...")
    local mapper = require("mcp.mappers.metrics")

    assert_eq("metrics.resource_type", "wslproxy.metrics", mapper.resource_type)

    local raw = {
        timestamp = 1739635200,
        datetime = "2026-02-15T12:00:00Z",
        traffic = {total_requests_24h = 45000},
        connections = {active = 19}
    }

    local mapped = mapper.to_mcp(raw)
    assert_eq("metrics.mapped.type", "wslproxy.metrics", mapped.type)
    assert_eq("metrics.mapped.id", "current", mapped.id)
    assert_not_nil("metrics.mapped.attrs.traffic", mapped.attributes.traffic)
    assert_not_nil("metrics.mapped.attrs.connections", mapped.attributes.connections)
end

-----------------------------------------------------------
-- Test: Profile mapper
-----------------------------------------------------------
local function test_profile_mapper()
    print("  Testing profile mapper...")
    local mapper = require("mcp.mappers.profile")

    assert_eq("profile.resource_type", "wslproxy.profile", mapper.resource_type)

    local raw_list = {
        {id = "prod", name = "prod", server_count = 5},
        {id = "staging", name = "staging", server_count = 2}
    }

    local mapped = mapper.to_mcp(raw_list)
    assert_eq("profile.list.type", "wslproxy.profile.list", mapped.type)
    assert_eq("profile.list.count", 2, mapped.count)
    assert_eq("profile.list.items[1].attrs.server_count", 5, mapped.items[1].attributes.server_count)
end

-----------------------------------------------------------
-- Test: SSL mapper
-----------------------------------------------------------
local function test_ssl_mapper()
    print("  Testing ssl mapper...")
    local mapper = require("mcp.mappers.ssl")

    assert_eq("ssl.resource_type", "wslproxy.ssl", mapper.resource_type)

    local raw = {
        domain = "api.example.com",
        ssl_enabled = true,
        ssl_auto_renew = true,
        ssl_force_https = true
    }

    local mapped = mapper.map_one(raw)
    assert_eq("ssl.mapped.type", "wslproxy.ssl", mapped.type)
    assert_eq("ssl.mapped.id", "api.example.com", mapped.id)
    assert_eq("ssl.mapped.attrs.ssl_enabled", true, mapped.attributes.ssl_enabled)
end

-----------------------------------------------------------
-- Test: Cache mapper
-----------------------------------------------------------
local function test_cache_mapper()
    print("  Testing cache mapper...")
    local mapper = require("mcp.mappers.cache")

    assert_eq("cache.resource_type", "wslproxy.cache", mapper.resource_type)

    local raw = {
        server_name = "app.example.com",
        cache_enabled = true,
        cache_ttl = 3600
    }

    local mapped = mapper.map_one(raw)
    assert_eq("cache.mapped.type", "wslproxy.cache", mapped.type)
    assert_eq("cache.mapped.id", "app.example.com", mapped.id)
    assert_eq("cache.mapped.attrs.cache_ttl", 3600, mapped.attributes.cache_ttl)
end

-----------------------------------------------------------
-- Test: Mapper registry
-----------------------------------------------------------
local function test_mapper_registry()
    print("  Testing mapper registry...")
    local McpMappers = require("mcp.mappers")

    local expected_mappers = {"servers", "rules", "upstreams", "profiles", "ssl", "cache", "health", "metrics", "settings"}
    for _, id in ipairs(expected_mappers) do
        assert_not_nil("registry.has_" .. id, McpMappers.registry[id])
    end

    -- Test get_resource_type
    assert_eq("registry.type.servers", "wslproxy.server", McpMappers.get_resource_type("servers"))
    assert_eq("registry.type.rules", "wslproxy.rule", McpMappers.get_resource_type("rules"))
    assert_eq("registry.type.health", "wslproxy.health", McpMappers.get_resource_type("health"))
end

-- Run all tests
print("=== MCP Mapper Unit Tests ===")
print("")

test_server_mapper()
test_rule_mapper()
test_upstream_mapper()
test_health_mapper()
test_metrics_mapper()
test_profile_mapper()
test_ssl_mapper()
test_cache_mapper()
test_mapper_registry()

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

if test_results.failed > 0 then
    os.exit(1)
end
