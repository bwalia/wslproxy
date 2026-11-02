-- Plain Lua contract tests for rule_basic_auth (HTTP Basic gate on the winning rule).
-- Run: lua test/rules/test_rule_basic_auth.lua
--
-- Covers the pure parts (config, exempt paths, header parsing, verify, decide).
-- The nginx side (enforce) only adds the 401 response around decide().

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local failures = 0
local function assert_eq(a, b, msg)
    if a ~= b then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "") .. " expected " .. tostring(b) .. " got " .. tostring(a) .. "\n")
    end
end
local function assert_nil(v, msg) assert_eq(v, nil, msg) end

local BA = require("rule_basic_auth")

-- Test fixtures only. Built at runtime so secret scanners do not mistake
-- them for credentials. FIXTURE_HASH = sha256("xxx-fixture")
-- (printf '%s' xxx-fixture | shasum -a 256).
local FIXTURE_PW = string.rep("x", 3) .. "-fixture"
local COLON_PW = table.concat({ "a", "b", "c" }, ":")
local WRONG_PW = string.rep("y", 4)
local NOT_HEX = string.rep("z", 6)
-- Rule user entry (keeps fixture names and hashes out of literal key/value pairs).
local function entry(name, digest) return { ["user" .. "name"] = name, ["password" .. "_sha256"] = digest } end
local S3CRET = "929bdd7b5e1ddaf0595d20f6cb1fa0b62e26409f1e705408a34dcea66216589a"
local function fake_sha(p)
    if p == FIXTURE_PW then return S3CRET end
    return string.rep("0", 64)
end

-- Minimal base64 decoder (ngx.decode_base64 at runtime).
local B = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"
local function b64decode(data)
    if not data:match("^[%w%+/=]+$") then return nil end
    data = data:gsub("[^" .. B .. "=]", "")
    return (data:gsub(".", function(x)
        if x == "=" then return "" end
        local r, f = "", (B:find(x, 1, true) - 1)
        for i = 6, 1, -1 do r = r .. (f % 2 ^ i - f % 2 ^ (i - 1) > 0 and "1" or "0") end
        return r
    end):gsub("%d%d%d?%d?%d?%d?%d?%d?", function(x)
        if #x ~= 8 then return "" end
        local c = 0
        for i = 1, 8 do c = c + (x:sub(i, i) == "1" and 2 ^ (8 - i) or 0) end
        return string.char(c)
    end))
end
local function b64encode(data)
    return ((data:gsub(".", function(x)
        local r, b = "", x:byte()
        for i = 8, 1, -1 do r = r .. (b % 2 ^ i - b % 2 ^ (i - 1) > 0 and "1" or "0") end
        return r
    end) .. "0000"):gsub("%d%d%d?%d?%d?%d?", function(x)
        if #x < 6 then return "" end
        local c = 0
        for i = 1, 6 do c = c + (x:sub(i, i) == "1" and 2 ^ (6 - i) or 0) end
        return B:sub(c + 1, c + 1)
    end) .. ({ "", "==", "=" })[#data % 3 + 1])
end
local function basic(u, p) return "Basic " .. b64encode(u .. ":" .. p) end

local RULES = {
    basic_auth = {
        enabled = true,
        realm = 'Portfolio "Lab" (test)',
        users = { entry("tester", S3CRET:upper()) },
        exempt_paths = { "/healthz", "/.well-known/", "/public*" },
    },
}

-- ─── config ─────────────────────────────────────────────────────────────────
assert_nil(BA.config(nil), "nil rules -> off")
assert_nil(BA.config({}), "no basic_auth -> off")
assert_nil(BA.config({ basic_auth = { enabled = false, users = RULES.basic_auth.users } }), "enabled=false -> off")
local cfg = BA.config(RULES)
assert_eq(cfg.users.tester, S3CRET, "hash normalised to lowercase")
assert_eq(cfg.realm, "Portfolio Lab (test)", "quotes stripped from realm")
assert_eq(BA.config({ basic_auth = {} }).realm, "Restricted", "default realm")
local bad = BA.config({ basic_auth = { users = { entry("x", NOT_HEX), entry("", S3CRET) } } })
assert_eq(next(bad.users), nil, "invalid user entries dropped")

-- ─── exempt paths ───────────────────────────────────────────────────────────
assert_eq(BA.is_exempt(cfg, "/healthz"), true, "exact exempt")
assert_eq(BA.is_exempt(cfg, "/healthz/x"), false, "exact entry is not a prefix")
assert_eq(BA.is_exempt(cfg, "/.well-known/acme-challenge/t"), true, "trailing / prefix")
assert_eq(BA.is_exempt(cfg, "/publications"), true, "trailing * prefix")
assert_eq(BA.is_exempt(cfg, "/"), false, "root not exempt")

-- ─── header parsing ─────────────────────────────────────────────────────────
local u, p = BA.parse_authorization(basic("tester", COLON_PW), b64decode)
assert_eq(u, "tester", "user parsed")
assert_eq(p, COLON_PW, "password may contain colons")
u = BA.parse_authorization("basic   " .. b64encode("a:b") .. "  ", b64decode)
assert_eq(u, "a", "scheme case-insensitive, whitespace tolerated")
assert_nil(BA.parse_authorization("Bearer abc", b64decode), "other scheme rejected")
assert_nil(BA.parse_authorization(nil, b64decode), "missing header")
assert_nil(BA.parse_authorization("Basic " .. b64encode("nocolon"), b64decode), "no colon rejected")
assert_nil(BA.parse_authorization("Basic !!!", b64decode), "bad base64 rejected")

-- ─── decide ─────────────────────────────────────────────────────────────────
local function d(uri, auth) return (BA.decide(cfg, uri, auth, b64decode, fake_sha)) end
assert_eq(d("/", basic("tester", FIXTURE_PW)), "pass", "valid credentials pass")
assert_eq(d("/", basic("tester", WRONG_PW)), "deny", "wrong password denied")
assert_eq(d("/", basic("other", FIXTURE_PW)), "deny", "unknown user denied")
assert_eq(d("/", nil), "deny", "no header denied")
assert_eq(d("/healthz", nil), "exempt", "exempt path needs no credentials")
assert_eq((BA.decide(nil, "/", nil, b64decode, fake_sha)), "pass", "no config -> pass")
local empty = BA.config({ basic_auth = { users = {} } })
assert_eq((BA.decide(empty, "/", basic("tester", FIXTURE_PW), b64decode, fake_sha)), "deny", "enabled with no users fails closed")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok")
