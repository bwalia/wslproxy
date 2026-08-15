-- Plain Lua contract tests for the VPN identity condition in rule_matcher.
-- Run: lua test/rules/test_rule_matcher_vpn.lua
--
-- vpn_identity is stubbed via package.preload so these tests cover the matcher's
-- wiring — is the gate reached, is it ANDed, is it counted — rather than
-- resolution itself, which test_vpn_identity.lua covers.

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

-- ─── Stubs ──────────────────────────────────────────────────────────────────

package.preload["helpers"] = function() return { isEU = function() return false end } end
package.preload["rule_auth"] = function() return { authenticate = function() return true end } end

-- Controlled from the tests below.
local RESOLVE = { identity = nil, reason = "no session", calls = 0 }

package.preload["vpn_identity"] = function()
    return {
        resolve = function()
            RESOLVE.calls = RESOLVE.calls + 1
            if RESOLVE.identity then return RESOLVE.identity end
            return nil, RESOLVE.reason
        end,
        has_group = function(identity, required)
            if type(identity) ~= "table" or type(identity.groups) ~= "table" then return false end
            if required == nil or required == "" then return true end
            local want = {}
            if type(required) == "string" then
                for g in required:gmatch("[^,]+") do table.insert(want, (g:gsub("^%s*(.-)%s*$", "%1"))) end
            else
                for _, g in ipairs(required) do table.insert(want, g) end
            end
            for _, w in ipairs(want) do
                for _, h in ipairs(identity.groups) do
                    if h == w then return true end
                end
            end
            return false
        end,
    }
end

_G.ngx = {
    ERR = 4, WARN = 5,
    log = function() end,
    var = {}, ctx = {}, header = {},
    req = { get_headers = function() return {} end },
}

local Matcher = require("rule_matcher")

local ALICE = { user_id = "u-1", email = "alice@example.com", groups = { "staff" } }
local ADMIN = { user_id = "u-2", email = "root@example.com", groups = { "staff", "platform-admins" } }

local function request(uri, addr)
    ngx.var.request_uri, ngx.var.remote_addr = uri, addr or "10.8.1.7"
    ngx.header, ngx.ctx = {}, {}
end

local function rule(rules, mode)
    return {
        condition_mode = mode or "and",
        rule_data = { id = "r", name = "r", priority = 10,
            match = { rules = rules, response = { code = 305, allow = true } } },
    }
end

local function evaluate(r) return Matcher.evaluate(r, "internal.example.com", {}) end

-- ─── no VPN condition: untouched ────────────────────────────────────────────

RESOLVE.identity, RESOLVE.calls = nil, 0
request("/public")
local r = evaluate(rule({ path_key = "starts_with", path = "/" }))
assert_true(r.all_pass, "a rule without a VPN condition still passes")
assert_eq(RESOLVE.calls, 0, "no identity lookup when no rule needs one")

-- ─── vpn_required ───────────────────────────────────────────────────────────

RESOLVE.identity = ALICE
request("/admin")
r = evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_required = true }))
assert_true(r.conditions.vpn.pass, "resolved identity satisfies vpn_required")
assert_true(r.all_pass, "rule matches")
assert_eq(r.vpn_identity and r.vpn_identity.email, "alice@example.com", "identity exposed on the result")

RESOLVE.identity = nil
request("/admin")
r = evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_required = true }))
assert_false(r.conditions.vpn.pass, "unresolved identity fails vpn_required")
assert_false(r.all_pass, "rule does not match")

-- ─── vpn_groups ─────────────────────────────────────────────────────────────

RESOLVE.identity = ALICE
request("/admin")
r = evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_groups = "staff" }))
assert_true(r.all_pass, "member of the required group passes")

r = evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_groups = "platform-admins" }))
assert_false(r.all_pass, "non-member is denied even though the session is valid")
assert_eq(r.conditions.vpn.reason, "group not held", "reason names the group failure")

-- request() resets ngx.ctx, which is where the per-request identity is memoised;
-- changing RESOLVE without it would keep returning the previously resolved user.
RESOLVE.identity = ADMIN
request("/admin")
r = evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_groups = "platform-admins" }))
assert_true(r.all_pass, "admin holds the required group")

-- vpn_groups implies identity is required, without vpn_required being set.
RESOLVE.identity = nil
request("/admin")
r = evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_groups = "staff" }))
assert_false(r.all_pass, "vpn_groups alone requires a resolvable identity")

-- ─── the gate is ANDed even in OR mode ──────────────────────────────────────

-- An OR-mode rule whose path matches must NOT pass when identity fails. Treating
-- the VPN condition like an ordinary matching criterion would make this an
-- access-control bypass dressed up as normal rule configuration.
RESOLVE.identity = nil
request("/admin")
r = evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_required = true }, "or"))
assert_true(r.conditions.path.pass, "path matches")
assert_false(r.any_pass, "OR mode does not let a matching path bypass the identity gate")

RESOLVE.identity = ALICE
request("/admin")
r = evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_required = true }, "or"))
assert_true(r.any_pass, "OR mode passes once identity resolves")

RESOLVE.identity = ALICE
request("/nope")
r = evaluate(rule({ path_key = "starts_with", path = "/nope", vpn_groups = "platform-admins" }, "or"))
assert_false(r.any_pass, "OR mode still denies when the group is not held")

-- ─── resolved once per request ──────────────────────────────────────────────

RESOLVE.identity, RESOLVE.calls = ALICE, 0
request("/admin")
local shared = { path_key = "starts_with", path = "/admin", vpn_required = true }
evaluate(rule(shared))
evaluate(rule(shared))
evaluate(rule(shared))
assert_eq(RESOLVE.calls, 1, "identity is resolved once and reused across rules in a request")

-- A new request resolves again.
RESOLVE.calls = 0
request("/admin")
evaluate(rule(shared))
assert_eq(RESOLVE.calls, 1, "a fresh request performs its own lookup")

-- A denial is also cached per request, not retried per rule.
RESOLVE.identity, RESOLVE.calls = nil, 0
request("/admin")
evaluate(rule(shared))
evaluate(rule(shared))
assert_eq(RESOLVE.calls, 1, "an unresolved identity is not retried for every rule")

-- ─── condition counting ─────────────────────────────────────────────────────

-- rule_selector breaks priority ties on condition_count, so the VPN condition
-- has to be counted like the others.
RESOLVE.identity = ALICE
request("/admin")
assert_eq(evaluate(rule({ path_key = "starts_with", path = "/admin" })).condition_count, 1,
    "path only")
assert_eq(evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_required = true })).condition_count, 2,
    "path + vpn_required")
assert_eq(evaluate(rule({ path_key = "starts_with", path = "/admin", vpn_groups = "staff" })).condition_count, 2,
    "path + vpn_groups")
assert_eq(evaluate(rule({
    path_key = "starts_with", path = "/admin",
    client_ip_key = "cidr", client_ip = "10.8.1.0/24",
    vpn_groups = "staff",
})).condition_count, 3, "path + cidr + vpn")

-- ─── defence in depth: cidr and groups together ─────────────────────────────

-- An identity that resolves does not excuse an address outside the overlay:
-- both conditions must hold.
RESOLVE.identity = ADMIN
request("/admin", "203.0.113.9")
r = evaluate(rule({
    path_key = "starts_with", path = "/admin",
    client_ip_key = "cidr", client_ip = "10.8.1.0/24",
    vpn_groups = "platform-admins",
}))
assert_true(r.conditions.vpn.pass, "identity resolves and holds the group")
assert_false(r.conditions.ip.pass, "address is outside the overlay")
assert_false(r.all_pass, "a valid identity from off the overlay is still denied")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok")
