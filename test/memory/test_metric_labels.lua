-- Plain Lua tests: Prometheus labels in api/log_handler.lua stay bounded.
-- Run: luajit test/memory/test_metric_labels.lua
-- Every distinct label set is a series kept in each worker's heap for the
-- worker's life, so no label may come straight from the request.

package.path = "api/?.lua;api/?/init.lua;" .. package.path
_G.ngx = _G.ngx or { log = function() end, WARN = 4, ERR = 3, var = {}, ctx = {} }

local failures = 0
local function assert_eq(a, b, msg)
    if a ~= b then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "") .. " expected " .. tostring(b) .. " got " .. tostring(a) .. "\n")
    end
end

local L = require("log_handler")

-- host: configured server name wins, www. stripped, lower-cased.
assert_eq(L.metric_host("www.DiyTaxReturn.co.uk", "_"), "diytaxreturn.co.uk", "server name")
assert_eq(L.metric_host("wwwx.example.com", "_"), "wwwx.example.com", "only a literal www. is stripped")
-- no configured server: the nginx block's server_name, else _unmatched.
assert_eq(L.metric_host(nil, "lon1.pop0.uk"), "lon1.pop0.uk", "admin block server_name")
assert_eq(L.metric_host(nil, "_"), "_unmatched", "catch-all block")
assert_eq(L.metric_host("", ""), "_unmatched", "empty")
assert_eq(L.metric_host(nil, nil), "_unmatched", "nil")

-- A scanner sending 10k random Host headers to the catch-all block makes ONE
-- host label value, not 10k.
-- (The Host header is not an input at all: gateway_ack.lua sets ctx only for
-- a configured server, and the catch-all block's server_name is "_".)
local seen = {}
for _ = 1, 10000 do
    seen[L.metric_host(nil, "_")] = true
end
local n = 0
for _ in pairs(seen) do n = n + 1 end
assert_eq(n, 1, "random Host headers collapse to one label")

-- method: usual verbs kept, anything else folded.
for _, m in ipairs({ "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" }) do
    assert_eq(L.metric_method(m), m, "method " .. m)
end
assert_eq(L.metric_method("PROPFIND"), "OTHER", "webdav folded")
assert_eq(L.metric_method("XYZ" .. string.rep("A", 50)), "OTHER", "junk folded")
assert_eq(L.metric_method(nil), "OTHER", "nil folded")

-- upstream: configured backend label, never the resolved address.
assert_eq(L.metric_upstream("blue"), "blue", "backend label")
assert_eq(L.metric_upstream("http://10.0.0.5:8080"), "http://10.0.0.5:8080", "redirect uri as configured")
assert_eq(L.metric_upstream(nil), "_other", "no backend")
assert_eq(L.metric_upstream(""), "_other", "empty backend")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("metric labels: all tests passed")
