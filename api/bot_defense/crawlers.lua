-- api/bot_defense/crawlers.lua
-- Verify that a client claiming to be a search-engine crawler really is one:
-- the IP's PTR record must be under the engine's published domain AND that
-- name must resolve back to the same IP (reverse + forward DNS). This is the
-- method Google, Bing, Apple, Yandex and Baidu document for their crawlers,
-- and it needs nothing but DNS.
--
--   verified  allow it (search visibility is never at risk)
--   fake      a definite mismatch: an impersonator (sophisticated IVT)
--   unknown   DNS failed or timed out: no penalty — fail open
--
-- Results are cached in the shared dict, so each IP costs at most one lookup
-- per day per engine.

local M = {}

local TTL = { verified = 86400, fake = 3600, unknown = 60 }

local resolv_conf_ns

--- Nameservers: settings first, then /etc/resolv.conf (the host's own
--- resolver — systemd-resolved on the edges, Docker's in containers).
function M.nameservers(cfg)
    if cfg and cfg.dns_nameservers and #cfg.dns_nameservers > 0 then return cfg.dns_nameservers end
    if resolv_conf_ns == nil then
        resolv_conf_ns = {}
        local f = io.open("/etc/resolv.conf", "rb")
        if f then
            for line in f:lines() do
                local ns = line:match("^%s*nameserver%s+([%x%.:]+)")
                if ns then resolv_conf_ns[#resolv_conf_ns + 1] = ns end
                if #resolv_conf_ns >= 3 then break end
            end
            f:close()
        end
    end
    if #resolv_conf_ns > 0 then return resolv_conf_ns end
    return { "1.1.1.1", "8.8.8.8" }
end

--- Overridable for tests: returns an object with reverse_query/query.
function M.new_resolver(cfg)
    local Resolver = require("resty.dns.resolver")
    -- A copy: resolver:new() rewrites its list in place ("1.1.1.1" becomes
    -- {"1.1.1.1", 53}), which would corrupt the config and the cached list.
    local nameservers = {}
    for i, ns in ipairs(M.nameservers(cfg)) do nameservers[i] = ns end
    return Resolver:new({
        nameservers = nameservers,
        retrans = 1,
        timeout = cfg and cfg.dns_timeout_ms or 500,
    })
end

--- Same address? IPv6 is compared parsed: the resolver and nginx do not
--- always write the same address the same way ("::1" vs "0:0:0:0:0:0:0:1").
local function same_ip(a, b)
    if a == b then return true end
    if type(a) ~= "string" or type(b) ~= "string" then return false end
    local Dc = require("bot_defense.datacenter")
    local pa, pb = Dc.parse_ipv6(a), Dc.parse_ipv6(b)
    if not pa or not pb then return false end
    for i = 1, 8 do
        if pa[i] ~= pb[i] then return false end
    end
    return true
end
M.same_ip = same_ip

local function under(host, domains)
    host = host:lower():gsub("%.$", "")
    for _, d in ipairs(domains) do
        if host == d or host:sub(-(#d + 1)) == "." .. d then return true end
    end
    return false
end

local function lookup(crawler, ip, cfg)
    local r, err = M.new_resolver(cfg)
    if not r then return "unknown", "resolver: " .. tostring(err) end

    local ptrs, perr = r:reverse_query(ip)
    if not ptrs then return "unknown", "ptr: " .. tostring(perr) end
    if ptrs.errcode then
        -- NXDOMAIN: the IP has no PTR at all. Every real crawler has one.
        if ptrs.errcode == 3 then return "fake", "no PTR record" end
        return "unknown", "ptr rcode " .. tostring(ptrs.errcode)
    end

    local host
    for _, a in ipairs(ptrs) do
        if a.ptrdname and under(a.ptrdname, crawler.domains) then
            host = a.ptrdname
            break
        end
    end
    if not host then return "fake", "PTR not under " .. table.concat(crawler.domains, "/") end

    local qtype = ip:find(":", 1, true) and r.TYPE_AAAA or r.TYPE_A
    local addrs, ferr = r:query(host, { qtype = qtype })
    if not addrs then return "unknown", "forward: " .. tostring(ferr) end
    if addrs.errcode then return "fake", "PTR name does not resolve" end
    for _, a in ipairs(addrs) do
        if same_ip(a.address, ip) then return "verified", host end
    end
    return "fake", "PTR name resolves elsewhere"
end

--- @return string verdict verified | fake | unknown
--- @return string detail
function M.verify(crawler, ip, dict, cfg)
    local key = "cv:" .. crawler.name .. ":" .. ip
    local cached = dict and dict:get(key)
    if cached then return cached, "cached" end
    local ok, verdict, detail = pcall(lookup, crawler, ip, cfg)
    if not ok then verdict, detail = "unknown", tostring(verdict) end
    if dict then dict:set(key, verdict, TTL[verdict] or 60) end
    return verdict, detail
end

return M
