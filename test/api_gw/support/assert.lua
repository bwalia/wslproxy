-- test/api_gw/support/assert.lua
-- The assertion helpers the api_gw contract tests share. Same shape as the
-- inline helpers in test/rules and test/storage: collect failures, print them,
-- exit non-zero at the end.

local A = { failures = 0 }

local function fail(msg)
    A.failures = A.failures + 1
    io.stderr:write("FAIL: " .. tostring(msg) .. "\n")
end

function A.eq(got, want, msg)
    if got ~= want then
        fail((msg or "") .. " — expected " .. tostring(want) .. ", got " .. tostring(got))
    end
end

function A.ne(got, unwanted, msg)
    if got == unwanted then
        fail((msg or "") .. " — expected anything but " .. tostring(unwanted))
    end
end

function A.ok(v, msg)
    if not v then fail((msg or "expected truthy") .. " — got " .. tostring(v)) end
end

function A.falsy(v, msg)
    if v then fail((msg or "expected falsy") .. " — got " .. tostring(v)) end
end

function A.is_nil(v, msg)
    if v ~= nil then fail((msg or "expected nil") .. " — got " .. tostring(v)) end
end

function A.contains(haystack, needle, msg)
    if type(haystack) ~= "string" or not haystack:find(needle, 1, true) then
        fail((msg or "") .. " — " .. tostring(haystack) .. " does not contain " .. tostring(needle))
    end
end

--- Every element of `want` appears in `got` (order-insensitive set compare).
function A.set_eq(got, want, msg)
    local g, w = {}, {}
    for _, v in ipairs(got or {}) do g[v] = true end
    for _, v in ipairs(want or {}) do w[v] = true end
    for v in pairs(w) do
        if not g[v] then fail((msg or "") .. " — missing " .. tostring(v)) end
    end
    for v in pairs(g) do
        if not w[v] then fail((msg or "") .. " — unexpected " .. tostring(v)) end
    end
end

--- Print the result and exit. Call at the end of every test file.
function A.done(name)
    if A.failures > 0 then
        io.stderr:write(name .. ": " .. A.failures .. " failure(s)\n")
        os.exit(1)
    end
    io.write("ok\n")
end

return A
