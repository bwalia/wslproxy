-- Plain Lua contract tests for access profile expansion.
-- Run: lua test/rules/test_access_profile.lua
--
-- Expansion is pure, so most of this needs no stubs. The selection tests at the
-- end run generated rules through the real rule_matcher and rule_selector, with
-- `helpers` and `rule_auth` stubbed out.

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

local function assert_nil(v, msg)
    if v ~= nil then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "expected nil") .. " got " .. tostring(v) .. "\n")
    end
end

local AP = require("access_profile")

local OVERLAY = "10.8.1.0/24"
local SERVER = { server_name = "internal.example.com", proxy_pass = "http://127.0.0.1:8080" }

local function profile(endpoints, extra)
    local doc = { name = "staff-internal", allow_cidrs = OVERLAY, endpoints = endpoints }
    for k, v in pairs(extra or {}) do doc[k] = v end
    return doc
end

-- ─── normalise: validation ──────────────────────────────────────────────────

assert_nil(AP.normalise(nil), "nil document rejected")
assert_nil(AP.normalise("string"), "non-table rejected")
assert_nil(AP.normalise({ endpoints = { { path = "/a" } } }), "missing name rejected")
assert_nil(AP.normalise({ name = "p" }), "missing endpoints rejected")
assert_nil(AP.normalise({ name = "p", endpoints = {} }), "empty endpoints rejected")
assert_nil(AP.normalise(profile({ { path_key = "starts_with" } })), "endpoint without path rejected")
assert_nil(AP.normalise({ name = "p", endpoints = { { path = "/a" } } }),
    "endpoint with no allow_cidrs anywhere rejected")
assert_nil(AP.normalise(profile({ { path = "/a", path_key = "regex" } })),
    "unknown path_key rejected")

local ok_profile = AP.normalise(profile({ { path = "/admin" } }))
assert_true(ok_profile ~= nil, "valid profile normalises")
assert_eq(ok_profile.endpoints[1].path_key, "starts_with", "path_key defaults to starts_with")
assert_eq(ok_profile.endpoints[1].allow_cidrs, OVERLAY, "endpoint inherits profile allow_cidrs")
assert_eq(ok_profile.priority_base, AP.DEFAULT_PRIORITY_BASE, "priority_base defaults")
assert_eq(ok_profile.deny_code, 403, "deny_code defaults to 403")
assert_true(ok_profile.deny_message == AP.DEFAULT_DENY_MESSAGE, "deny page defaults")

local override = AP.normalise(profile({ { path = "/x", allow_cidrs = "10.9.0.0/16" } }))
assert_eq(override.endpoints[1].allow_cidrs, "10.9.0.0/16", "endpoint allow_cidrs overrides profile")

-- ─── expand: structure ──────────────────────────────────────────────────────

local expanded = AP.expand(AP.normalise(profile({ { path = "/admin" } })), SERVER)
assert_eq(#expanded, 2, "one endpoint expands to a pair")

local deny, allow = expanded[1], expanded[2]
assert_eq(deny.rule_data.match.response.code, 403, "deny responds 403")
assert_nil(deny.rule_data.match.rules.client_ip, "deny has no ip condition")
assert_eq(deny.rule_data.match.rules.path, "/admin", "deny matches the path")

assert_eq(allow.rule_data.match.response.code, 305, "allow proxies")
assert_eq(allow.rule_data.match.response.redirect_uri, "http://127.0.0.1:8080",
    "allow origin falls back to server proxy_pass")
assert_eq(allow.rule_data.match.rules.client_ip_key, "cidr", "allow uses cidr matching")
assert_eq(allow.rule_data.match.rules.client_ip, OVERLAY, "allow carries the range")
assert_true(allow.rule_data.priority > deny.rule_data.priority, "allow outranks deny")
assert_eq(allow.condition_mode, "and", "conditions are ANDed")

-- Origin precedence: endpoint > profile > server proxy_pass.
local with_profile_origin = AP.expand(
    AP.normalise(profile({ { path = "/admin" } }, { origin = "http://origin:9000" })), SERVER)
assert_eq(with_profile_origin[2].rule_data.match.response.redirect_uri, "http://origin:9000",
    "profile origin beats server proxy_pass")

local with_endpoint_origin = AP.expand(
    AP.normalise(profile({ { path = "/admin", origin = "http://ep:1" } }, { origin = "http://prof:2" })), SERVER)
assert_eq(with_endpoint_origin[2].rule_data.match.response.redirect_uri, "http://ep:1",
    "endpoint origin beats profile origin")

-- No origin anywhere is a load-time failure, not a 500 at request time.
local no_origin, err = AP.expand(AP.normalise(profile({ { path = "/admin" } })), {})
assert_nil(no_origin, "expansion fails without an origin")
assert_true(err ~= nil and err:find("no origin"), "error explains the missing origin")

-- ─── expand: priority ordering across endpoints ─────────────────────────────

-- A narrower endpoint's deny must outrank a broader endpoint's allow, or
-- someone allowed on /admin would reach /admin/reports too.
local nested = AP.expand(AP.normalise(profile({
    { path = "/admin" },
    { path = "/admin/reports", allow_cidrs = "10.9.0.0/16" },
})), SERVER)

local by_id = {}
for _, e in ipairs(nested) do by_id[e.rule_data.id] = e.rule_data end

local broad_allow, narrow_deny
for _, r in pairs(by_id) do
    if r.match.rules.path == "/admin" and r.match.rules.client_ip then broad_allow = r end
    if r.match.rules.path == "/admin/reports" and not r.match.rules.client_ip then narrow_deny = r end
end
assert_true(broad_allow ~= nil and narrow_deny ~= nil, "found both rules")
assert_true(narrow_deny.priority > broad_allow.priority,
    "narrower deny outranks broader allow")

-- ─── selection: end to end ──────────────────────────────────────────────────

package.preload["helpers"] = function() return { isEU = function() return false end } end
package.preload["rule_auth"] = function() return { authenticate = function() return true end } end
_G.ngx = { var = {}, header = {}, ctx = {}, req = { get_headers = function() return {} end } }

local Matcher = require("rule_matcher")
local Selector = require("rule_selector")

-- The domain's own catch-all, as it exists today.
local catch_all = {
    condition_mode = "and",
    rule_data = {
        id = "catch-all", name = "catch-all", priority = 1,
        match = {
            rules = { path_key = "starts_with", path = "/" },
            response = { code = 305, redirect_uri = "http://127.0.0.1:8080" },
        },
    },
}

local function winner(rules, uri, remote_addr)
    ngx.var.request_uri = uri
    ngx.var.remote_addr = remote_addr
    ngx.header = {}
    ngx.ctx = {}
    local evaluated = {}
    for _, r in ipairs(rules) do
        table.insert(evaluated, Matcher.evaluate(r, "internal.example.com", {}))
    end
    local won = Selector.select(evaluated)
    return won and won.rule_id or nil
end

local rules = { catch_all }
for _, e in ipairs(nested) do table.insert(rules, e) end

-- /admin: allowed only from the overlay.
assert_eq(winner(rules, "/admin", "10.8.1.7"), "ap:staff-internal:1:allow", "on-overlay reaches /admin")
assert_eq(winner(rules, "/admin", "203.0.113.9"), "ap:staff-internal:1:deny", "off-overlay denied at /admin")
assert_eq(winner(rules, "/admin", "10.8.0.15"), "ap:staff-internal:1:deny", "hub peer denied at /admin")

-- /admin/reports: allowed only from 10.9.0.0/16, even for someone on the
-- overlay who is allowed at /admin. This is the case the priority ranking exists for.
assert_eq(winner(rules, "/admin/reports", "10.9.5.5"), "ap:staff-internal:2:allow",
    "allowed range reaches /admin/reports")
assert_eq(winner(rules, "/admin/reports", "10.8.1.7"), "ap:staff-internal:2:deny",
    "overlay user allowed at /admin is still denied at /admin/reports")
assert_eq(winner(rules, "/admin/reports", "203.0.113.9"), "ap:staff-internal:2:deny",
    "off-overlay denied at /admin/reports")

-- Unprotected paths are untouched.
assert_eq(winner(rules, "/", "203.0.113.9"), "catch-all", "public root still served")
assert_eq(winner(rules, "/about", "203.0.113.9"), "catch-all", "public path still served")
assert_eq(winner(rules, "/about", "10.8.1.7"), "catch-all", "on-overlay public path unaffected")

-- ─── fail closed ────────────────────────────────────────────────────────────

local Loader = require("rule_loader")
local deny_all = Loader.deny_all_rule("staff-internal", "boom")
assert_eq(deny_all.rule_data.match.response.code, 403, "failure rule denies")
assert_eq(deny_all.rule_data.match.rules.path, "/", "failure rule covers every path")

local broken = { catch_all, deny_all }
assert_eq(winner(broken, "/", "10.8.1.7"), "ap:staff-internal:failed",
    "a broken profile denies rather than falling through to the catch-all")
assert_eq(winner(broken, "/admin", "10.8.1.7"), "ap:staff-internal:failed",
    "broken profile denies protected paths too")

-- ─── load_and_expand ────────────────────────────────────────────────────────

local fake_files = {
    ["/opt/nginx/data/access_profiles/prod/staff-internal.json"] = "{json}",
}
local deps = {
    read_file = function(path)
        local c = fake_files[path]
        if not c then return nil, "not found" end
        return c
    end,
    decode = function() return profile({ { path = "/admin" } }) end,
}

local loaded = AP.load_and_expand("staff-internal", "/opt/nginx/", "prod", SERVER, deps)
assert_eq(#loaded, 2, "loads and expands from disk path")

local missing, missing_err = AP.load_and_expand("nope", "/opt/nginx/", "prod", SERVER, deps)
assert_nil(missing, "missing profile fails")
assert_true(missing_err:find("cannot read"), "missing profile explains why")

local bad_decode, decode_err = AP.load_and_expand("staff-internal", "/opt/nginx/", "prod", SERVER, {
    read_file = deps.read_file,
    decode = function() return nil, "syntax error" end,
})
assert_nil(bad_decode, "unparseable profile fails")
assert_true(decode_err:find("cannot parse"), "parse failure explains why")

local bad_shape, shape_err = AP.load_and_expand("staff-internal", "/opt/nginx/", "prod", SERVER, {
    read_file = deps.read_file,
    decode = function() return { name = "x" } end,
})
assert_nil(bad_shape, "invalid profile shape fails")
assert_true(shape_err:find("invalid profile"), "shape failure explains why")

assert_nil(AP.load_and_expand(nil, "/opt/nginx/", "prod", SERVER, deps), "nil name fails")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok")
