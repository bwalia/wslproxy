-- Standalone test for the pure policy core of mcp_gateway (no ngx).
-- Run with:  resty api/test_mcp_gateway.lua
package.path = "/tmp/?.lua;./api/?.lua;" .. package.path
local M = require("mcp_gateway")

local failures = 0
local function check(name, cond)
    print((cond and "  ok   - " or "  FAIL - ") .. name)
    if not cond then failures = failures + 1 end
end

-- tool_allowed: denylist (default)
do
    local cfg = { tools = { mode = "deny", list = { "delete_file", "exec" } } }
    check("denylist blocks listed", M.tool_allowed(cfg, "delete_file") == false)
    check("denylist allows others", M.tool_allowed(cfg, "read_file") == true)
end

-- tool_allowed: allowlist
do
    local cfg = { tools = { mode = "allow", list = { "read_file", "list_dir" } } }
    check("allowlist passes listed", M.tool_allowed(cfg, "read_file") == true)
    check("allowlist blocks others", M.tool_allowed(cfg, "delete_file") == false)
end

-- tool_allowed: no policy -> all pass
do
    check("no tools block -> allow all", M.tool_allowed({}, "anything") == true)
end

-- method_denied
do
    local cfg = { methods = { deny = { "resources/write" } } }
    check("method denied", M.method_denied(cfg, "resources/write") == true)
    check("method allowed", M.method_denied(cfg, "tools/list") == false)
end

-- decision: denied tool
do
    local cfg = { tools = { mode = "deny", list = { "exec" } } }
    local d = M.decision(cfg, { jsonrpc = "2.0", id = 7, method = "tools/call",
                                params = { name = "exec", arguments = {} } })
    check("decision blocks denied tool", d.allow == false and d.code == -32000)
end

-- decision: allowed tool
do
    local cfg = { tools = { mode = "deny", list = { "exec" } } }
    local d = M.decision(cfg, { method = "tools/call", params = { name = "read_file" } })
    check("decision allows ok tool", d.allow == true and d.tool == "read_file")
end

-- decision: denied method
do
    local cfg = { methods = { deny = { "resources/write" } } }
    local d = M.decision(cfg, { method = "resources/write" })
    check("decision blocks denied method", d.allow == false and d.code == -32601)
end

-- decision: non-tools method passes
do
    local d = M.decision({}, { method = "tools/list" })
    check("decision allows tools/list", d.allow == true)
end

-- batch detection
do
    check("batch detected", M.is_batch({ { method = "x" }, { method = "y" } }) == true)
    check("single not batch", M.is_batch({ method = "x" }) == false)
end

if failures == 0 then print("ALL PASS") else print(failures .. " FAILURE(S)"); os.exit(1) end
