-- ip_cidr.lua
-- IPv4 CIDR containment for rule matching.
--
-- Pure Lua with no OpenResty dependency, so it is unit testable outside nginx
-- (see test/rules/test_ip_cidr.lua). Arithmetic rather than bitops, so it runs
-- on plain Lua 5.1 as well as LuaJIT.
--
-- This backs access control decisions, so parsing is strict and every failure
-- path returns "no match" rather than guessing.

local M = {}

-- Parsed CIDRs, keyed by spec string. Bounded by the number of distinct CIDRs
-- in the rule set, so it cannot grow with traffic.
local cache = {}

--- Parse a dotted-quad into a 32-bit integer.
---
--- Strict: rejects out-of-range octets and leading zeros, since "010.0.0.1" is
--- read as octal by some resolvers and decimal by others — an ambiguity that
--- does not belong in an allowlist.
---
--- @param ip string
--- @return number|nil
function M.parse_ipv4(ip)
    if type(ip) ~= "string" then
        return nil
    end
    local a, b, c, d = ip:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if not a then
        return nil
    end
    for _, octet in ipairs({ a, b, c, d }) do
        if #octet > 1 and octet:sub(1, 1) == "0" then
            return nil
        end
        if #octet > 3 then
            return nil
        end
        if tonumber(octet) > 255 then
            return nil
        end
    end
    return tonumber(a) * 16777216 + tonumber(b) * 65536 + tonumber(c) * 256 + tonumber(d)
end

--- Parse "10.8.1.0/24", or a bare address treated as /32.
---
--- @param spec string
--- @return table|nil  { network = number, size = number }
function M.parse_cidr(spec)
    if type(spec) ~= "string" then
        return nil
    end
    spec = spec:gsub("^%s*(.-)%s*$", "%1")

    local cached = cache[spec]
    if cached ~= nil then
        -- `false` marks a spec already known to be unparseable.
        if cached == false then
            return nil
        end
        return cached
    end

    local addr, bits = spec:match("^([%d%.]+)/(%d+)$")
    if not addr then
        addr, bits = spec, "32"
    end

    local prefix = tonumber(bits)
    local network = M.parse_ipv4(addr)
    if not network or not prefix or prefix < 0 or prefix > 32 or bits:match("^0%d") then
        cache[spec] = false
        return nil
    end

    -- Number of addresses the prefix covers. 2^32 is exactly representable as a
    -- double, so the modulo below is exact across the whole IPv4 space.
    local size = 2 ^ (32 - prefix)
    local parsed = { network = network - (network % size), size = size }
    cache[spec] = parsed
    return parsed
end

--- Is `ip` inside `spec`?
---
--- IPv6 addresses never match an IPv4 CIDR — they fail to parse and return
--- false, so an IPv6 client cannot pass an IPv4 allowlist.
---
--- @param spec string  e.g. "10.8.1.0/24"
--- @param ip   string  e.g. "10.8.1.7"
--- @return boolean
function M.contains(spec, ip)
    local cidr = M.parse_cidr(spec)
    if not cidr then
        return false
    end
    local addr = M.parse_ipv4(ip)
    if not addr then
        return false
    end
    return addr - (addr % cidr.size) == cidr.network
end

--- Is `ip` inside any of a comma-separated list of CIDRs?
---
--- An unparseable entry is skipped rather than failing the whole list, so one
--- bad range in an operator's config cannot silently open or close the others.
--- A list with no parseable entry at all matches nothing.
---
--- @param specs string  e.g. "10.8.1.0/24, 10.8.2.0/24"
--- @param ip    string
--- @return boolean
function M.contains_any(specs, ip)
    if type(specs) ~= "string" or specs == "" then
        return false
    end
    for spec in specs:gmatch("[^,]+") do
        if M.contains(spec, ip) then
            return true
        end
    end
    return false
end

--- Drop cached parses. Used by tests; also safe to call after a config reload.
function M.reset_cache()
    cache = {}
end

return M
