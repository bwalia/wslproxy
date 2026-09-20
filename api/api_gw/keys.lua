-- api/api_gw/keys.lua
-- Tenant-scoped key construction and identity hashing for the api_gw package.
--
-- EVERY shared-dict key written by any api_gw module goes through this module.
-- That is the isolation boundary: two tenants can run identical policies with
-- identical client IPs and never share a counter.  Tests assert this directly
-- (test/api_gw/test_keys.lua), so do not build dict keys by hand elsewhere.
--
-- Key shape:  agw:1:<tenant>:<module>:<part>:<part>...
--             ^   ^ ^        ^        ^
--             |   | |        |        escaped user-controlled material
--             |   | |        module name (rate_limit, ivt, ...)
--             |   | escaped tenant id
--             |   schema version — bump to invalidate every counter at once
--             namespace
--
-- Escaping matters: without it tenant "a" + key "b:c" and tenant "a:b" + key
-- "c" would produce the same string and silently share a limit.

local M = {}

-- Bump when the meaning of a counter changes; old keys then age out on TTL
-- instead of being read with the wrong semantics.
M.SCHEMA = "1"

local NAMESPACE = "agw"

-- Percent-escape the separator (and the escape char itself) so no component
-- can forge a boundary.  Cheap: only two characters are ever rewritten.
local function esc(s)
    if s == nil then return "-" end
    s = tostring(s)
    if s == "" then return "-" end
    s = s:gsub("%%", "%%25")
    s = s:gsub(":", "%%3A")
    return s
end
M.escape = esc

--- Stable tenant identity for a server.
---
--- Precedence: explicit `api_gw.tenant_id` (lets several hostnames share one
--- quota deliberately) > profile_id/server_name (the default, one quota per
--- server per environment).
---
--- @param server_config table|nil
--- @param profile_id    string|nil
--- @return string
function M.tenant_id(server_config, profile_id)
    server_config = server_config or {}
    local gw = server_config.api_gw
    if type(gw) == "table" and type(gw.tenant_id) == "string" and gw.tenant_id ~= "" then
        return gw.tenant_id
    end
    local profile = (profile_id ~= nil and profile_id ~= "") and tostring(profile_id) or "default"
    local server = server_config.server_name
    if server == nil or server == "" then
        server = server_config.id or "unknown"
    end
    return profile .. "/" .. tostring(server)
end

--- Prefix shared by every key a module writes for one tenant.
--- @param tenant string
--- @param module_name string
--- @return string
function M.scope(tenant, module_name)
    return NAMESPACE .. ":" .. M.SCHEMA .. ":" .. esc(tenant) .. ":" .. esc(module_name) .. ":"
end

--- Build a full dict key from a scope plus any number of parts.
--- @param tenant string
--- @param module_name string
--- @param ... string|number  key parts (each escaped)
--- @return string
function M.build(tenant, module_name, ...)
    local parts = { ... }
    local out = M.scope(tenant, module_name)
    for i = 1, select("#", ...) do
        if i > 1 then out = out .. ":" end
        out = out .. esc(parts[i])
    end
    return out
end

-- ─── Identity hashing ───────────────────────────────────────────────────────

-- Arithmetic-only fallback digest.  No bitwise operators: LuaJIT (Lua 5.1)
-- has no `~`/`&` syntax and plain Lua 5.4 has no `bit` library, so a
-- multiply-and-mod polynomial is the only form that loads on both.  This path
-- is a test-time fallback; OpenResty always uses sha256 below.
local function poly_hex(s)
    local function round(seed, mult)
        local h = seed
        for i = 1, #s do
            h = (h * mult + s:byte(i)) % 4294967296
        end
        return h
    end
    return string.format("%08x%08x", round(5381, 33), round(2166136261, 131))
end

local sha256_mod, resty_str_mod
local sha_probe_done = false

local function sha256_hex(s)
    if not sha_probe_done then
        sha_probe_done = true
        local ok1, m1 = pcall(require, "resty.sha256")
        local ok2, m2 = pcall(require, "resty.string")
        if ok1 and ok2 then
            sha256_mod, resty_str_mod = m1, m2
        end
    end
    if not sha256_mod then
        return nil
    end
    local h = sha256_mod:new()
    if not h then return nil end
    h:update(s)
    return resty_str_mod.to_hex(h:final())
end

--- One-way, tenant-salted digest of client-identifying material.
---
--- Used for `client_key_hash` in audit lines and for rate-limit dict keys, so
--- neither an API key nor a raw IP is ever written to a log or a dict.  The
--- tenant salt means the same client hashes differently per tenant, which
--- keeps SIEM correlation inside a tenant boundary by construction.
---
--- @param tenant string
--- @param value  string|nil
--- @param len    number|nil  hex chars to keep (default 16)
--- @return string
function M.hash(tenant, value, len)
    len = len or 16
    if value == nil or value == "" then
        return "anon"
    end
    local material = tostring(tenant) .. "\0" .. tostring(value)
    local hex = sha256_hex(material)
    if not hex then
        hex = poly_hex(material)
    end
    return hex:sub(1, len)
end

return M
