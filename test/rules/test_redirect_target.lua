-- Contract tests for the 301/302 Location builder.
-- Run: lua test/rules/test_redirect_target.lua
-- (luajit and `resty` also work; does not require OpenResty)

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local R = require("redirect_target")

local failures = 0
local function eq(got, want, msg)
    if got ~= want then
        failures = failures + 1
        io.stderr:write("FAIL: " .. msg .. " expected " .. tostring(want) .. " got " .. tostring(got) .. "\n")
    end
end

local UI = "https://vault-ui.workstation.co.uk"

-- Flag off or absent: redirect_uri is used as written (the old behaviour).
eq(R.build(UI, nil, "/a?b=1"), UI, "no flag keeps redirect_uri as is")
eq(R.build(UI, false, "/a?b=1"), UI, "false keeps redirect_uri as is")
eq(R.build(UI .. "/", nil, "/a"), UI .. "/", "no flag keeps a trailing slash too")

-- Flag on: path and query follow.
eq(R.build(UI, true, "/secrets/list?page=2"), UI .. "/secrets/list?page=2", "path + query are appended")
eq(R.build(UI .. "/", true, "/x"), UI .. "/x", "a trailing slash on the base is not doubled")
eq(R.build(UI, "true", "/x"), UI .. "/x", "the string \"true\" counts (form-posted rules)")
eq(R.build(UI .. "/app", true, "/x?y"), UI .. "/app/x?y", "a base path is kept")

-- Root: exactly one slash. Empty or missing: nothing to append.
eq(R.build(UI, true, "/"), UI .. "/", "/ gives the base root")
eq(R.build(UI .. "/", true, "/"), UI .. "/", "/ on a slash-terminated base is not doubled")
eq(R.build(UI, true, "/?q=1"), UI .. "/?q=1", "a root query is kept")
eq(R.build(UI, true, ""), UI, "empty request_uri adds nothing")
eq(R.build(UI, true, nil), UI, "nil request_uri adds nothing")

-- The host never changes: a protocol-relative-looking path stays a path.
eq(R.build(UI, true, "//evil.example/x"), UI .. "/evil.example/x", "leading slashes collapse")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok")
