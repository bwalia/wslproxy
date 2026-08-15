-- Plain Lua contract tests for the `cidr` client-IP mode in rule_matcher.
-- Run: lua test/rules/test_rule_matcher_cidr.lua
--
-- Stubs `helpers` and `rule_auth` so this exercises rule_matcher's own wiring
-- (does the cidr branch get reached, with the right fields?) rather than their
-- behaviour. ip_cidr itself is the real module.

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local failures = 0
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

local function assert_eq(a, b, msg)
    if a ~= b then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "") .. " expected " .. tostring(b) .. " got " .. tostring(a) .. "\n")
    end
end

-- ─── Stubs ──────────────────────────────────────────────────────────────────

package.preload["helpers"] = function()
    return { isEU = function() return false end }
end

-- No auth configured in these rules, so authenticate always passes.
package.preload["rule_auth"] = function()
    return { authenticate = function() return true end }
end

_G.ngx = {
    var = {},
    header = {},
    ctx = {},
    req = { get_headers = function() return {} end },
}

local Matcher = require("rule_matcher")

-- ─── Helpers ────────────────────────────────────────────────────────────────

local function request(uri, remote_addr)
    ngx.var.request_uri = uri
    ngx.var.remote_addr = remote_addr
    ngx.header = {}
    ngx.ctx = {}
end

local function rule(id, priority, rules)
    return {
        condition_mode = "and",
        rule_data = {
            id = id,
            name = id,
            priority = priority,
            match = {
                rules = rules,
                response = { code = 305, allow = true },
            },
        },
    }
end

local OVERLAY = "10.8.1.0/24"

local function evaluate(r)
    return Matcher.evaluate(r, "internal.example.com", {})
end

-- ─── cidr condition ─────────────────────────────────────────────────────────

local vpn_rule = rule("admin-allow", 20, {
    path_key = "starts_with",
    path = "/admin",
    client_ip_key = "cidr",
    client_ip = OVERLAY,
})

request("/admin/users", "10.8.1.7")
local r = evaluate(vpn_rule)
assert_true(r.conditions.ip.pass, "in-overlay address passes cidr")
assert_true(r.all_pass, "in-overlay request matches the rule")

request("/admin/users", "10.8.0.15")
r = evaluate(vpn_rule)
assert_false(r.conditions.ip.pass, "existing hub peer fails cidr")
assert_false(r.all_pass, "off-overlay request does not match")

request("/admin/users", "203.0.113.9")
r = evaluate(vpn_rule)
assert_false(r.all_pass, "public address does not match")

request("/admin/users", "10.8.10.7")
r = evaluate(vpn_rule)
assert_false(r.conditions.ip.pass,
    "10.8.10.7 is excluded — a starts_with '10.8.1.' match would wrongly accept it")

-- Path still has to match independently of the IP.
request("/public", "10.8.1.7")
r = evaluate(vpn_rule)
assert_true(r.conditions.ip.pass, "ip passes regardless of path")
assert_false(r.conditions.path.pass, "path condition fails")
assert_false(r.all_pass, "in-overlay request to a different path does not match")

-- ─── condition counting ─────────────────────────────────────────────────────

-- The selector breaks priority ties on condition_count, so a cidr condition
-- must be counted like any other client_ip condition.
request("/admin", "10.8.1.7")
assert_eq(evaluate(vpn_rule).condition_count, 2, "path + client_ip counted")

local deny_rule = rule("admin-deny", 10, {
    path_key = "starts_with",
    path = "/admin",
})
assert_eq(evaluate(deny_rule).condition_count, 1, "path only counted")

-- ─── the allow/deny pair ────────────────────────────────────────────────────

-- Documented in docs/VPN_ACCESS.md: a lone allow rule is a bypass, because a
-- failing rule drops out of selection rather than denying.
local Selector = require("rule_selector")
local catch_all = rule("catch-all", 0, { path_key = "starts_with", path = "/" })

local function winner(remote_addr, uri)
    request(uri, remote_addr)
    local evaluated = {
        evaluate(vpn_rule),
        evaluate(deny_rule),
        evaluate(catch_all),
    }
    local won = Selector.select(evaluated)
    return won and won.rule_id or nil
end

assert_eq(winner("10.8.1.7", "/admin"), "admin-allow", "on-VPN reaches the allow rule")
assert_eq(winner("10.8.0.15", "/admin"), "admin-deny", "off-VPN is denied, not passed to catch-all")
assert_eq(winner("203.0.113.9", "/admin"), "admin-deny", "public address is denied")
assert_eq(winner("203.0.113.9", "/public"), "catch-all", "unprotected paths still served")
assert_eq(winner("10.8.1.7", "/public"), "catch-all", "on-VPN unprotected paths unaffected")

-- Without the deny rule, an off-VPN request falls through to the catch-all —
-- the bypass the pairing exists to prevent.
request("/admin", "203.0.113.9")
local without_deny = Selector.select({ evaluate(vpn_rule), evaluate(catch_all) })
assert_eq(without_deny and without_deny.rule_id, "catch-all",
    "lone allow rule falls through to catch-all (why the deny rule is required)")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok")
