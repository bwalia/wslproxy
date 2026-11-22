-- Contract tests for cache_handler.response_forbids_caching: an origin response
-- that sets a cookie or says private/no-store/no-cache must never be stored in
-- the shared static cache (it would serve one visitor's response to others).
-- Run: lua test/rules/test_cache_response_forbids.lua

package.path = "api/?.lua;api/?/init.lua;" .. package.path
rawset(_G, "ngx", rawget(_G, "ngx") or { shared = {}, log = function() end, ERR = 1, WARN = 2 })
package.preload["cjson"] = package.preload["cjson"] or function() return {} end

local C = require("cache_handler")
local f = C.response_forbids_caching
local failures = 0
local function check(got, want, msg)
    local ok = (want == nil and got == nil) or (want ~= nil and got ~= nil and got:find(want, 1, true))
    if not ok then
        failures = failures + 1
        io.stderr:write("FAIL: " .. msg .. " got " .. tostring(got) .. "\n")
    end
end

check(f(nil, nil), nil, "plain response is cacheable")
check(f(nil, "public, max-age=86400"), nil, "public max-age is cacheable")
check(f({}, nil), nil, "empty Set-Cookie table is not a cookie")
check(f("", nil), nil, "empty Set-Cookie string is not a cookie")
check(f("sid=abc; Path=/; HttpOnly", nil), "cookie", "Set-Cookie string forbids")
check(f({ "a=1", "b=2" }, "public"), "cookie", "multiple Set-Cookie forbid")
check(f(nil, "private, max-age=60"), "private", "private forbids")
check(f(nil, "No-Store"), "no-store", "directive match is case-insensitive")
check(f(nil, "no-cache"), "no-cache", "no-cache forbids")
check(f(nil, { "public", "no-store" }), "no-store", "multi-value Cache-Control is joined")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok: cache_handler.response_forbids_caching")
