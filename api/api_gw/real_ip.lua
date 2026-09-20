-- api/api_gw/real_ip.lua
-- Resolve the real client IP from X-Forwarded-For, but only inside a
-- configured trust boundary.
--
-- The rule: a forwarded header is evidence only when the peer that sent it is
-- itself trusted.  Walking XFF from the right, we keep discarding hops while
-- they are trusted addresses; the first untrusted address is the furthest
-- point we can still vouch for, and that is the client.  An untrusted peer's
-- XFF is ignored entirely — otherwise any caller could set its own IP and walk
-- straight through an IP allowlist or a per-IP rate limit.
--
-- Fail-open on config errors (unparseable CIDR, missing header): the
-- connection's peer address is always a safe answer.

local M = {}

local Cidr = require("ip_cidr")

M.MODULE = "real_ip"

local function trusted(cidrs, ip)
    if not ip or #cidrs == 0 then return false end
    for _, spec in ipairs(cidrs) do
        if Cidr.contains(tostring(spec), ip) then
            return true
        end
    end
    return false
end
M.trusted = trusted

--- Split an XFF value into an ordered array of addresses (left = oldest hop).
local function split_forwarded(value)
    local out = {}
    if not value then return out end
    if type(value) == "table" then
        -- Repeated header: nginx gives an array; concatenate in wire order.
        value = table.concat(value, ",")
    end
    for piece in tostring(value):gmatch("[^,]+") do
        piece = piece:match("^%s*(.-)%s*$")
        -- Strip an IPv6 bracket form or a :port suffix on IPv4.
        local bracketed = piece:match("^%[(.-)%]")
        if bracketed then piece = bracketed end
        if piece ~= "" then out[#out + 1] = piece end
    end
    return out
end
M.split_forwarded = split_forwarded

--- Compute the client IP for this request.
---
--- @param cfg_real_ip table   normalised config.real_ip
--- @param peer_addr   string  the TCP peer (ngx.var.remote_addr)
--- @param header_val  string|table|nil  raw forwarded header value
--- @return string client_ip
--- @return boolean from_header  true when the answer came from XFF
function M.resolve(cfg_real_ip, peer_addr, header_val)
    peer_addr = peer_addr or "0.0.0.0"
    local cidrs = (cfg_real_ip and cfg_real_ip.trusted_cidrs) or {}
    if #cidrs == 0 then
        return peer_addr, false
    end
    if not trusted(cidrs, peer_addr) then
        -- Peer is outside the trust boundary: its XFF claim is worthless.
        return peer_addr, false
    end

    local hops = split_forwarded(header_val)
    if #hops == 0 then
        return peer_addr, false
    end

    if not (cfg_real_ip and cfg_real_ip.recursive) then
        -- Non-recursive: exactly one trusted hop, so the last entry is the
        -- address our trusted peer observed.
        return hops[#hops], true
    end

    for i = #hops, 1, -1 do
        if not trusted(cidrs, hops[i]) then
            return hops[i], true
        end
    end

    -- Every hop is inside the trust boundary (internal-only traffic).
    return hops[1], true
end

--- Pipeline stage.  Populates ctx.client_ip; never denies.
function M.run(cfg, ctx)
    local header_name = cfg.real_ip.header or "X-Forwarded-For"
    local header_val = ctx.headers and ctx.headers[header_name:lower()]
    local ip, from_header = M.resolve(cfg.real_ip, ctx.peer_addr, header_val)
    ctx.client_ip = ip
    ctx.client_ip_from_header = from_header
    return nil
end

return M
