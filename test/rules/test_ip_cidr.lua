-- Plain Lua contract tests for IPv4 CIDR matching.
-- Run: lua test/rules/test_ip_cidr.lua
-- (luajit and `resty` also work; does not require OpenResty)

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

local Cidr = require("ip_cidr")

-- ─── parse_ipv4 ─────────────────────────────────────────────────────────────

assert_eq(Cidr.parse_ipv4("0.0.0.0"), 0, "zero address")
assert_eq(Cidr.parse_ipv4("255.255.255.255"), 4294967295, "broadcast address")
assert_eq(Cidr.parse_ipv4("10.8.1.7"), 168296711, "overlay address")

assert_eq(Cidr.parse_ipv4("256.0.0.1"), nil, "octet over 255")
assert_eq(Cidr.parse_ipv4("10.8.1"), nil, "too few octets")
assert_eq(Cidr.parse_ipv4("10.8.1.7.9"), nil, "too many octets")
assert_eq(Cidr.parse_ipv4("10.8.1.x"), nil, "non-numeric octet")
assert_eq(Cidr.parse_ipv4(""), nil, "empty string")
assert_eq(Cidr.parse_ipv4(nil), nil, "nil input")
assert_eq(Cidr.parse_ipv4(12345), nil, "non-string input")
assert_eq(Cidr.parse_ipv4("10.8.1.7:443"), nil, "address with port")
assert_eq(Cidr.parse_ipv4(" 10.8.1.7"), nil, "leading whitespace")

-- Leading zeros are ambiguous (octal in some resolvers) and must not parse.
assert_eq(Cidr.parse_ipv4("010.8.1.7"), nil, "leading zero octet")
assert_eq(Cidr.parse_ipv4("10.08.1.7"), nil, "leading zero middle octet")
assert_eq(Cidr.parse_ipv4("0.0.0.00"), nil, "leading zero final octet")

-- ─── parse_cidr ─────────────────────────────────────────────────────────────

local c = Cidr.parse_cidr("10.8.1.0/24")
assert_true(c ~= nil, "parses /24")
assert_eq(c.size, 256, "/24 covers 256 addresses")

assert_true(Cidr.parse_cidr("10.8.1.7") ~= nil, "bare address parses as /32")
assert_eq(Cidr.parse_cidr("10.8.1.7").size, 1, "bare address covers one address")

assert_eq(Cidr.parse_cidr("10.8.1.0/33"), nil, "prefix over 32")
assert_eq(Cidr.parse_cidr("10.8.1.0/-1"), nil, "negative prefix")
assert_eq(Cidr.parse_cidr("10.8.1.0/"), nil, "empty prefix")
assert_eq(Cidr.parse_cidr("10.8.1.0/abc"), nil, "non-numeric prefix")
assert_eq(Cidr.parse_cidr("not-a-cidr"), nil, "garbage")
assert_eq(Cidr.parse_cidr(nil), nil, "nil input")

-- Host bits set: 10.8.1.7/24 means the 10.8.1.0/24 network.
assert_eq(Cidr.parse_cidr("10.8.1.7/24").network, Cidr.parse_cidr("10.8.1.0/24").network,
    "host bits are masked off")

-- ─── contains ───────────────────────────────────────────────────────────────

assert_true(Cidr.contains("10.8.1.0/24", "10.8.1.7"), "in range")
assert_true(Cidr.contains("10.8.1.0/24", "10.8.1.0"), "network address in range")
assert_true(Cidr.contains("10.8.1.0/24", "10.8.1.255"), "broadcast address in range")
assert_false(Cidr.contains("10.8.1.0/24", "10.8.2.7"), "adjacent range excluded")
assert_false(Cidr.contains("10.8.1.0/24", "10.8.0.255"), "one below range excluded")
assert_false(Cidr.contains("10.8.1.0/24", "10.8.2.0"), "one above range excluded")

-- The existing mesh must never satisfy the zero-trust overlay range.
for _, n in ipairs({ 4, 5, 6, 7, 8, 10, 11, 14, 15 }) do
    assert_false(Cidr.contains("10.8.1.0/24", "10.8.0." .. n),
        "hub peer 10.8.0." .. n .. " is outside the overlay")
end

-- Prefix edges.
assert_true(Cidr.contains("0.0.0.0/0", "8.8.8.8"), "/0 matches everything")
assert_true(Cidr.contains("10.8.1.7/32", "10.8.1.7"), "/32 exact match")
assert_false(Cidr.contains("10.8.1.7/32", "10.8.1.8"), "/32 rejects neighbour")
assert_true(Cidr.contains("128.0.0.0/1", "255.255.255.255"), "high half of /1")
assert_false(Cidr.contains("128.0.0.0/1", "127.255.255.255"), "low half excluded from /1")
assert_true(Cidr.contains("255.255.255.255/32", "255.255.255.255"), "top of address space")

-- Malformed input never matches.
assert_false(Cidr.contains("not-a-cidr", "10.8.1.7"), "garbage spec matches nothing")
assert_false(Cidr.contains("10.8.1.0/24", "not-an-ip"), "garbage ip matches nothing")
assert_false(Cidr.contains("10.8.1.0/24", ""), "empty ip matches nothing")
assert_false(Cidr.contains("10.8.1.0/24", nil), "nil ip matches nothing")

-- IPv6 clients cannot pass an IPv4 allowlist.
assert_false(Cidr.contains("10.8.1.0/24", "fd00::1"), "ipv6 does not match ipv4 range")
assert_false(Cidr.contains("10.8.1.0/24", "::ffff:10.8.1.7"), "ipv4-mapped ipv6 does not match")

-- Leading-zero spoofing cannot smuggle an address into range.
assert_false(Cidr.contains("10.8.1.0/24", "010.8.1.7"), "leading-zero ip does not match")

-- ─── contains_any ───────────────────────────────────────────────────────────

assert_true(Cidr.contains_any("10.8.1.0/24", "10.8.1.7"), "single entry")
assert_true(Cidr.contains_any("10.8.1.0/24,10.9.0.0/16", "10.9.5.5"), "second entry")
assert_true(Cidr.contains_any("10.8.1.0/24, 10.9.0.0/16", "10.9.5.5"), "whitespace tolerated")
assert_false(Cidr.contains_any("10.8.1.0/24,10.9.0.0/16", "10.10.0.1"), "no entry matches")

-- One bad entry must not decide the others.
assert_true(Cidr.contains_any("garbage,10.8.1.0/24", "10.8.1.7"), "bad entry skipped, good entry matches")
assert_false(Cidr.contains_any("garbage,10.8.1.0/24", "10.9.1.7"), "bad entry does not open the list")
assert_false(Cidr.contains_any("garbage,junk", "10.8.1.7"), "all-bad list matches nothing")

assert_false(Cidr.contains_any("", "10.8.1.7"), "empty list matches nothing")
assert_false(Cidr.contains_any(nil, "10.8.1.7"), "nil list matches nothing")

-- ─── cache ──────────────────────────────────────────────────────────────────

-- Repeated lookups stay correct once a spec is cached, including negatives.
assert_true(Cidr.contains("10.8.1.0/24", "10.8.1.7"), "cached positive still matches")
assert_false(Cidr.contains("bad/spec", "10.8.1.7"), "cached negative still fails")
assert_false(Cidr.contains("bad/spec", "10.8.1.7"), "cached negative is stable")
Cidr.reset_cache()
assert_true(Cidr.contains("10.8.1.0/24", "10.8.1.7"), "correct after cache reset")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("ok")
