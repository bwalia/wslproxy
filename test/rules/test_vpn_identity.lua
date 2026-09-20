-- Plain Lua contract tests for VPN identity resolution and group enforcement.
-- Run: lua test/rules/test_vpn_identity.lua
--
-- The control plane and shared dict are both injected, so this exercises the
-- real caching, fail-closed and group-matching logic without a network or
-- OpenResty.

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
local function assert_false(v, msg)
    if v then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "expected falsy") .. "\n")
    end
end

-- ─── Minimal JSON, since cjson is absent outside OpenResty ──────────────────

_G.Cjson = _G.Cjson or (function()
    local ok, c = pcall(require, "cjson")
    if ok then return c end
    -- Only ever round-trips the identity shape used below.
    local function encode(v)
        local parts = {}
        for _, k in ipairs({ "session_id", "user_id", "email", "device_id", "assigned_ip", "expires_at" }) do
            if v[k] then table.insert(parts, '"' .. k .. '":"' .. tostring(v[k]) .. '"') end
        end
        if v.groups then
            local gs = {}
            for _, g in ipairs(v.groups) do table.insert(gs, '"' .. g .. '"') end
            table.insert(parts, '"groups":[' .. table.concat(gs, ",") .. "]")
        end
        return "{" .. table.concat(parts, ",") .. "}"
    end
    local function decode(s)
        if type(s) ~= "string" or not s:match("^%s*{") then error("bad json") end
        local out = {}
        for k, v in s:gmatch('"([%w_]+)"%s*:%s*"([^"]*)"') do out[k] = v end
        local garr = s:match('"groups"%s*:%s*%[(.-)%]')
        if garr then
            out.groups = {}
            for g in garr:gmatch('"([^"]*)"') do table.insert(out.groups, g) end
        end
        return out
    end
    return { encode = encode, decode = decode }
end)()

_G.ngx = {
    ERR = 4, WARN = 5, INFO = 7,
    log = function() end,
    var = {}, ctx = {}, header = {},
    req = { get_headers = function() return {} end },
    shared = {},
}

local VI = require("vpn_identity")

-- ─── Fakes ──────────────────────────────────────────────────────────────────

local function fake_dict()
    local store, d = {}, {}
    function d:get(k)
        local e = store[k]
        if not e then return nil end
        return e.v
    end
    function d:set(k, v, ttl) store[k] = { v = v, ttl = ttl }; return true end
    function d:delete(k) store[k] = nil end
    function d:ttl_of(k) return store[k] and store[k].ttl end
    function d:count() local n = 0; for _ in pairs(store) do n = n + 1 end; return n end
    return d
end

local IDENTITY = {
    session_id = "s-1", user_id = "u-1", email = "alice@example.com",
    device_id = "d-1", assigned_ip = "10.8.1.7", expires_at = "2026-01-01T00:00:00Z",
    groups = { "staff", "platform-admins" },
}

local function fake_http(status, body, err)
    local calls = { n = 0 }
    local client = {
        request_uri = function(_, url, opts)
            calls.n = calls.n + 1
            calls.url = url
            calls.auth = opts and opts.headers and opts.headers["Authorization"]
            if err then return nil, err end
            return { status = status, body = body }
        end,
        set_timeout = function() end,
    }
    return client, calls
end

local CFG = { control_url = "http://control:8080", service_token = "tok" }

-- ─── fetch ──────────────────────────────────────────────────────────────────

local http, calls = fake_http(200, Cjson.encode(IDENTITY))
local id, err = VI.resolve("10.8.1.7", CFG, { http_client = http, dict = fake_dict() })
assert_true(id ~= nil, "resolves a valid identity")
assert_eq(id and id.email, "alice@example.com", "carries the user email")
assert_eq(calls.url, "http://control:8080/api/v1/sessions/by-ip/10.8.1.7", "calls the by-ip endpoint")
assert_eq(calls.auth, "Bearer tok", "sends the service token")

-- 404 is definitive: no active session.
http = fake_http(404, "")
id, err = VI.resolve("10.8.1.9", CFG, { http_client = http, dict = fake_dict() })
assert_true(id == nil, "404 does not resolve")
assert_eq(err, "no session", "404 reported as no session")

-- ─── fail closed ────────────────────────────────────────────────────────────

-- Every one of these must deny, and none may yield an identity with no groups —
-- that would satisfy a rule requiring no particular group.
local function denies(label, status, body, transport_err)
    local h = fake_http(status, body, transport_err)
    local ident, reason = VI.resolve("10.8.1.7", CFG, { http_client = h, dict = fake_dict() })
    assert_true(ident == nil, label .. " does not resolve")
    assert_true(reason ~= nil and reason ~= "", label .. " gives a reason")
end

denies("unreachable control plane", nil, nil, "connection refused")
denies("500 from control plane", 500, "boom")
denies("503 from control plane", 503, "")
denies("malformed body", 200, "not json at all")
denies("body missing groups", 200, '{"user_id":"u-1","email":"a@b.c"}')

-- Missing configuration denies rather than resolving.
local ident, reason = VI.resolve("10.8.1.7", { service_token = "t" }, { dict = fake_dict() })
assert_true(ident == nil, "no control url denies")
assert_true(reason:find("url"), "explains the missing url")

ident, reason = VI.resolve("10.8.1.7", { control_url = "http://c" }, { dict = fake_dict() })
assert_true(ident == nil, "no service token denies")
assert_true(reason:find("token"), "explains the missing token")

ident, reason = VI.resolve(nil, CFG, { dict = fake_dict() })
assert_true(ident == nil, "nil address denies")
ident, reason = VI.resolve("", CFG, { dict = fake_dict() })
assert_true(ident == nil, "empty address denies")

-- ─── caching ────────────────────────────────────────────────────────────────

local dict = fake_dict()
http, calls = fake_http(200, Cjson.encode(IDENTITY))
VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
assert_eq(calls.n, 1, "repeat lookups are served from cache")
assert_eq(dict:ttl_of("10.8.1.7"), VI.DEFAULT_TTL, "positive entry uses the identity ttl")

-- A definitive "no session" is cached, but on a shorter ttl so a newly
-- connected user is not locked out for the full window.
dict = fake_dict()
http, calls = fake_http(404, "")
VI.resolve("10.8.1.9", CFG, { http_client = http, dict = dict })
VI.resolve("10.8.1.9", CFG, { http_client = http, dict = dict })
assert_eq(calls.n, 1, "negative result is cached")
assert_eq(dict:ttl_of("10.8.1.9"), VI.DEFAULT_NEGATIVE_TTL, "negative entry uses the shorter ttl")

-- Transient failures must NOT be cached, or one blip denies a user for the
-- whole TTL even after the control plane recovers.
dict = fake_dict()
http, calls = fake_http(nil, nil, "timeout")
VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
assert_eq(calls.n, 2, "transient failure is retried, not cached")
assert_eq(dict:count(), 0, "nothing cached after a transient failure")

-- Recovery after a blip resolves immediately.
dict = fake_dict()
http = fake_http(nil, nil, "timeout")
VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
http = fake_http(200, Cjson.encode(IDENTITY))
ident = VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
assert_true(ident ~= nil, "resolves as soon as the control plane recovers")

-- A corrupt cache entry triggers a fresh lookup rather than denying or trusting.
dict = fake_dict()
dict:set("10.8.1.7", "{{{ corrupt", 60)
http, calls = fake_http(200, Cjson.encode(IDENTITY))
ident = VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
assert_true(ident ~= nil, "corrupt cache entry falls back to a live lookup")
assert_eq(calls.n, 1, "corrupt entry caused exactly one refetch")

-- Cache is per address: one client cannot pick up another's identity.
dict = fake_dict()
http = fake_http(200, Cjson.encode(IDENTITY))
VI.resolve("10.8.1.7", CFG, { http_client = http, dict = dict })
local other = fake_http(404, "")
ident = VI.resolve("10.8.1.8", CFG, { http_client = other, dict = dict })
assert_true(ident == nil, "a different address is resolved independently")

VI.invalidate("10.8.1.7", { dict = dict })
assert_true(dict:get("10.8.1.7") == nil, "invalidate purges the entry")

-- ─── has_group ──────────────────────────────────────────────────────────────

assert_true(VI.has_group(IDENTITY, "staff"), "holds a required group")
assert_true(VI.has_group(IDENTITY, "platform-admins"), "holds the second group")
assert_true(VI.has_group(IDENTITY, "nope,staff"), "any-of semantics")
assert_true(VI.has_group(IDENTITY, { "nope", "staff" }), "accepts a list")
assert_true(VI.has_group(IDENTITY, "staff, platform-admins"), "tolerates whitespace")
assert_false(VI.has_group(IDENTITY, "finance"), "group not held")
assert_false(VI.has_group(IDENTITY, "Staff"), "group match is case sensitive")

-- No requirement means any resolved identity suffices — but an unresolved one
-- still fails, which is what makes vpn_required meaningful.
assert_true(VI.has_group(IDENTITY, nil), "no requirement passes for a resolved identity")
assert_true(VI.has_group(IDENTITY, ""), "empty requirement passes")
assert_false(VI.has_group(nil, nil), "no identity never passes")
assert_false(VI.has_group(nil, "staff"), "no identity never holds a group")
assert_false(VI.has_group({}, "staff"), "identity without groups never holds one")
assert_false(VI.has_group({ groups = {} }, "staff"), "empty groups holds nothing")
assert_true(VI.has_group({ groups = {} }, nil), "empty groups still satisfies no requirement")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok")
