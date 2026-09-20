-- Plain Lua contract tests for disk driver + query + dual_writer.
-- Run: lua test/storage/test_disk_driver.lua
-- (luajit also works; does not require OpenResty)

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local failures = 0
local function assert_eq(a, b, msg)
    if a ~= b then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "") .. " expected " .. tostring(b) .. " got " .. tostring(a) .. "\n")
    end
end

local function assert_true(v, msg)
    if not v then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "expected truthy") .. "\n")
    end
end

-- Stubs used by storage modules when ngx is absent.
_G.ngx = {
    ERR = 4, WARN = 5, INFO = 7, EMERG = 1, null = {},
    log = function() end,
    HTTP_BAD_REQUEST = 400,
}
_G.Cjson = (function()
    local ok, c = pcall(require, "cjson")
    if ok then return c end
    ok, c = pcall(require, "dkjson")
    if ok then return { encode = c.encode, decode = c.decode } end
    -- Minimal JSON for contract tests (no cjson in host luajit).
    local function encode(v)
        local t = type(v)
        if t == "nil" then return "null" end
        if t == "boolean" then return v and "true" or "false" end
        if t == "number" then return tostring(v) end
        if t == "string" then return '"' .. v:gsub("\\", "\\\\"):gsub('"', '\\"') .. '"' end
        if t == "table" then
            local is_arr, n = true, 0
            for k, _ in pairs(v) do
                n = n + 1
                if type(k) ~= "number" then is_arr = false end
            end
            local parts = {}
            if is_arr and n > 0 then
                for i = 1, n do parts[i] = encode(v[i]) end
                return "[" .. table.concat(parts, ",") .. "]"
            end
            for k, val in pairs(v) do
                parts[#parts + 1] = encode(tostring(k)) .. ":" .. encode(val)
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
        return "null"
    end
    local function decode(s)
        local pos = 1
        local function peek() return s:sub(pos, pos) end
        local function skip()
            while s:sub(pos, pos):match("%s") do pos = pos + 1 end
        end
        local parse
        local function parse_string()
            pos = pos + 1
            local out = {}
            while pos <= #s do
                local ch = s:sub(pos, pos)
                if ch == '"' then pos = pos + 1; break end
                if ch == "\\" then
                    pos = pos + 1
                    out[#out + 1] = s:sub(pos, pos)
                else
                    out[#out + 1] = ch
                end
                pos = pos + 1
            end
            return table.concat(out)
        end
        parse = function()
            skip()
            local ch = peek()
            if ch == '"' then return parse_string() end
            if ch == "{" then
                pos = pos + 1
                local obj = {}
                skip()
                if peek() == "}" then pos = pos + 1; return obj end
                while true do
                    skip()
                    local key = parse_string()
                    skip()
                    assert(peek() == ":", "expected :")
                    pos = pos + 1
                    obj[key] = parse()
                    skip()
                    if peek() == "}" then pos = pos + 1; break end
                    assert(peek() == ",", "expected ,")
                    pos = pos + 1
                end
                return obj
            end
            if ch == "[" then
                pos = pos + 1
                local arr = {}
                skip()
                if peek() == "]" then pos = pos + 1; return arr end
                while true do
                    arr[#arr + 1] = parse()
                    skip()
                    if peek() == "]" then pos = pos + 1; break end
                    assert(peek() == ",", "expected ,")
                    pos = pos + 1
                end
                return arr
            end
            if s:sub(pos, pos + 3) == "true" then pos = pos + 4; return true end
            if s:sub(pos, pos + 4) == "false" then pos = pos + 5; return false end
            if s:sub(pos, pos + 3) == "null" then pos = pos + 4; return nil end
            local num = s:match("^%-?%d+%.?%d*", pos)
            pos = pos + #num
            return tonumber(num)
        end
        return parse()
    end
    return { encode = encode, decode = decode }
end)()

-- Minimal helpers stub with real file IO.
package.loaded.helpers = {
    getDataFromFile = function(path)
        local f = io.open(path, "rb")
        if not f then return nil end
        local s = f:read("*a")
        f:close()
        return s
    end,
    setDataToFile = function(path, value, dir)
        os.execute('mkdir -p "' .. dir .. '"')
        local f, err = io.open(path, "w")
        assert(f, err)
        if type(value) == "table" then
            f:write(_G.Cjson.encode(value))
        else
            f:write(tostring(value))
        end
        f:close()
        return true
    end,
}

local tmp = os.tmpname()
os.remove(tmp)
os.execute('mkdir -p "' .. tmp .. '/data/servers/prod"')
os.execute('mkdir -p "' .. tmp .. '/data"')

-- settings.json for health()
do
    local f = io.open(tmp .. "/data/settings.json", "w")
    f:write('{"storage_type":"disk"}')
    f:close()
end

local Query = require("storage.query")
local page, total = Query.paginate({
    { id = "b", name = "bravo" },
    { id = "a", name = "alpha" },
    { id = "c", name = "charlie" },
}, { q = "alp" }, { field = "name", order = "ASC" }, { page = 1, perPage = 10 })
assert_eq(total, 1, "q filter total")
assert_eq(page[1].id, "a", "q filter hit")

local Disk = require("storage.disk_driver")
local disk = Disk.new({ config_path = tmp .. "/" })

local rec = { id = "host:example.test", server_name = "example.test", ssl_enabled = true }
local saved = disk:create("servers", "prod", rec.id, rec)
assert_eq(saved.server_name, "example.test", "create returns record")

local got = disk:get("servers", "prod", rec.id)
assert_eq(got.server_name, "example.test", "get roundtrip")
assert_eq(got.ssl_enabled, true, "bool preserved")

local listed = disk:list("servers", "prod", {}, { field = "id", order = "ASC" }, nil)
assert_eq(listed.total, 1, "list total")
assert_eq(listed.records[1].id, rec.id, "list record")

assert_true(disk:exists("servers", "prod", rec.id), "exists")
assert_true(disk:delete("servers", "prod", rec.id), "delete")
assert_true(not disk:get("servers", "prod", rec.id), "deleted")

local h = disk:health()
assert_true(h.ok, "disk health")

-- Dual writer: primary succeeds, disk fails → primary rolled back.
local FakePrimary = {}
function FakePrimary.new()
    return setmetatable({ store = {} }, { __index = FakePrimary })
end
function FakePrimary:get(resource, env, id)
    return self.store[resource .. "/" .. tostring(env) .. "/" .. id]
end
function FakePrimary:create(resource, env, id, record)
    self.store[resource .. "/" .. tostring(env) .. "/" .. id] = record
    return record
end
function FakePrimary:update(resource, env, id, record)
    return self:create(resource, env, id, record)
end
function FakePrimary:delete(resource, env, id)
    self.store[resource .. "/" .. tostring(env) .. "/" .. id] = nil
    return true
end
function FakePrimary:health()
    return { ok = true, latency_ms = 0, detail = "fake" }
end

local FailDisk = {
    get = function() return nil end,
    create = function() return nil, "disk full" end,
    update = function() return nil, "disk full" end,
    delete = function() return nil, "disk full" end,
    exists = function() return false end,
    health = function() return { ok = false, latency_ms = 0, detail = "fail" } end,
    list = function() return nil, "disk full" end,
}

local Dual = require("storage.dual_writer")
local primary = FakePrimary.new()
local dual = Dual.new({ primary = primary, disk = FailDisk })
local ok, err = dual:create("servers", "prod", "host:x", { id = "host:x" })
assert_true(not ok, "dual create fails when disk fails")
assert_true(err == "disk full", "disk error surfaced")
assert_true(primary:get("servers", "prod", "host:x") == nil, "primary rolled back")

os.execute('rm -rf "' .. tmp .. '"')

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok")
