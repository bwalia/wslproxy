-- api/bot_defense/datacenter.lua
-- Hosting / cloud provider IP ranges (MRC "data-centre traffic", a general
-- IVT category). Ranges come from settings.bot_defense.datacenter_cidrs and/or
-- a file of one CIDR per line (settings.bot_defense.datacenter_file; see
-- scripts/bot-defense-datacenter-ranges.sh for building one from the
-- providers' published lists).
--
-- Both families are turned into merged, sorted address ranges and
-- binary-searched, so a full cloud-provider list (~21k ranges: ~1.7k IPv4
-- after merging, ~7k IPv6) costs a dozen comparisons per request.

local Cidr = require("ip_cidr")

local M = {}

local function parse_ipv6(ip)
    if type(ip) ~= "string" or not ip:find(":", 1, true) then return nil end
    ip = ip:gsub("%%.*$", "") -- zone id
    local head, tail = ip:match("^(.-)::(.*)$")
    local parts = {}
    local function split(s, into)
        if s == "" then return true end
        for h in (s .. ":"):gmatch("([^:]*):") do
            if not h:match("^%x%x?%x?%x?$") then return false end
            into[#into + 1] = tonumber(h, 16)
        end
        return true
    end
    if head then
        local a, b = {}, {}
        if not split(head, a) or not split(tail, b) then return nil end
        if #a + #b > 7 then return nil end
        for _, v in ipairs(a) do parts[#parts + 1] = v end
        for _ = 1, 8 - #a - #b do parts[#parts + 1] = 0 end
        for _, v in ipairs(b) do parts[#parts + 1] = v end
    else
        if not split(ip, parts) or #parts ~= 8 then return nil end
    end
    return parts
end
M.parse_ipv6 = parse_ipv6

--- The first and last address of an IPv6 prefix, as 8-hextet arrays.
local function v6_range(prefix, bits)
    local lo, hi, remaining = {}, {}, bits
    for i = 1, 8 do
        if remaining >= 16 then
            lo[i], hi[i] = prefix[i], prefix[i]
            remaining = remaining - 16
        elseif remaining > 0 then
            local size = 2 ^ (16 - remaining)
            local base = prefix[i] - prefix[i] % size
            lo[i], hi[i] = base, base + size - 1
            remaining = 0
        else
            lo[i], hi[i] = 0, 65535
        end
    end
    return lo, hi
end

--- Lexicographic compare of two 8-hextet addresses: -1, 0 or 1.
local function v6_cmp(a, b)
    for i = 1, 8 do
        if a[i] ~= b[i] then return a[i] < b[i] and -1 or 1 end
    end
    return 0
end

--- Build a range set from a list of CIDR strings. Bad entries are skipped.
--- @return table set, number accepted, number rejected
function M.build(specs)
    local v4, v6, rejected = {}, {}, 0
    for _, spec in ipairs(specs or {}) do
        spec = tostring(spec):gsub("#.*$", ""):match("^%s*(.-)%s*$")
        if spec ~= "" then
            if spec:find(":", 1, true) then
                local addr, bits = spec:match("^([%x:]+)/(%d+)$")
                local parsed = parse_ipv6(addr or spec)
                bits = tonumber(bits) or 128
                if parsed and bits >= 0 and bits <= 128 then
                    local lo, hi = v6_range(parsed, bits)
                    v6[#v6 + 1] = { lo, hi }
                else
                    rejected = rejected + 1
                end
            else
                local c = Cidr.parse_cidr(spec)
                if c then
                    v4[#v4 + 1] = { c.network, c.network + c.size - 1 }
                else
                    rejected = rejected + 1
                end
            end
        end
    end

    table.sort(v4, function(a, b) return a[1] < b[1] end)
    local merged = {}
    for _, r in ipairs(v4) do
        local last = merged[#merged]
        if last and r[1] <= last[2] + 1 then
            if r[2] > last[2] then last[2] = r[2] end
        else
            merged[#merged + 1] = { r[1], r[2] }
        end
    end

    -- Same for IPv6: sort by start, fold overlapping ranges, binary search.
    table.sort(v6, function(a, b) return v6_cmp(a[1], b[1]) < 0 end)
    local merged6 = {}
    for _, r in ipairs(v6) do
        local last = merged6[#merged6]
        if last and v6_cmp(r[1], last[2]) <= 0 then
            if v6_cmp(r[2], last[2]) > 0 then last[2] = r[2] end
        else
            merged6[#merged6 + 1] = { r[1], r[2] }
        end
    end
    return { v4 = merged, v6 = merged6 }, #v4 + #v6, rejected
end

--- Read a CIDR-per-line file.
--- @return table|nil specs, string|nil err
function M.read_file(path)
    local f, err = io.open(path, "rb")
    if not f then return nil, err end
    local specs = {}
    for line in f:lines() do
        if #specs >= 500000 then break end
        specs[#specs + 1] = line
    end
    f:close()
    return specs
end

function M.contains(set, ip)
    if not set then return false end
    local n = Cidr.parse_ipv4(ip)
    if n then
        local ranges = set.v4
        local lo, hi = 1, #ranges
        while lo <= hi do
            local mid = math.floor((lo + hi) / 2)
            local r = ranges[mid]
            if n < r[1] then hi = mid - 1
            elseif n > r[2] then lo = mid + 1
            else return true end
        end
        return false
    end
    local addr = parse_ipv6(ip)
    if not addr then return false end
    local ranges = set.v6
    local lo, hi = 1, #ranges
    while lo <= hi do
        local mid = math.floor((lo + hi) / 2)
        local r = ranges[mid]
        if v6_cmp(addr, r[1]) < 0 then hi = mid - 1
        elseif v6_cmp(addr, r[2]) > 0 then lo = mid + 1
        else return true end
    end
    return false
end

return M
