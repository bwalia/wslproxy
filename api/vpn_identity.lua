-- vpn_identity.lua
-- Resolve an overlay address to the wslvpn session identity behind it.
--
-- Turns "the request came over the VPN" into "this request is user X in groups
-- Y" — the difference between a network boundary and a Zero Trust one.
--
-- Every failure denies. An identity lookup that cannot be completed must never
-- resolve to "no groups", because a rule requiring no particular group would
-- then pass. Callers distinguish the two cases via the second return value:
--
--   identity, nil    → resolved
--   nil, reason      → not resolved; the caller denies
--
-- Lookups are cached in a shared dict keyed by address. Cache TTL is the
-- revocation lag: a session revoked in the control plane keeps proxy access
-- until its entry expires. Keep it short.

local M = {}

local DEFAULT_TTL = 15          -- seconds; also the revocation lag
local DEFAULT_NEGATIVE_TTL = 5  -- seconds; shorter, so a new session appears quickly
local DEFAULT_TIMEOUT = 250     -- ms per control-plane call
local DICT_NAME = "vpn_identity"

-- Sentinel distinguishing "looked up, no session" from "not cached".
local NEGATIVE = "\0none"

local function settings()
    local s = ngx.shared[DICT_NAME]
    return s
end

--- Read config from the rule or environment.
--- Kept explicit rather than global so a misconfigured deployment fails loudly.
local function config(opts)
    opts = opts or {}
    local url = opts.control_url or os.getenv("WSL_CONTROL_URL")
    local token = opts.service_token or os.getenv("WSL_CONTROL_SERVICE_TOKEN")
    return {
        url = url,
        token = token,
        ttl = tonumber(opts.ttl) or DEFAULT_TTL,
        negative_ttl = tonumber(opts.negative_ttl) or DEFAULT_NEGATIVE_TTL,
        timeout = tonumber(opts.timeout_ms) or DEFAULT_TIMEOUT,
    }
end

--- Fetch identity from the control plane.
--- @return table|nil identity, string|nil error
function M.fetch(ip, cfg, http_client)
    if not cfg.url or cfg.url == "" then
        return nil, "no control plane url configured"
    end
    if not cfg.token or cfg.token == "" then
        return nil, "no service token configured"
    end

    local http = http_client
    if not http then
        local ok, resty_http = pcall(require, "resty.http")
        if not ok then
            return nil, "resty.http unavailable"
        end
        http = resty_http.new()
        http:set_timeout(cfg.timeout)
    end

    local url = cfg.url:gsub("/+$", "") .. "/api/v1/sessions/by-ip/" .. ip
    local res, err = http:request_uri(url, {
        method = "GET",
        headers = { ["Authorization"] = "Bearer " .. cfg.token },
    })

    if not res then
        return nil, "control plane unreachable: " .. tostring(err)
    end
    if res.status == 404 then
        -- Definitive: no active session at this address.
        return nil, "no session"
    end
    if res.status ~= 200 then
        return nil, "control plane returned " .. tostring(res.status)
    end

    local ok, decoded = pcall(Cjson.decode, res.body)
    if not ok or type(decoded) ~= "table" then
        return nil, "malformed identity response"
    end
    if type(decoded.groups) ~= "table" then
        -- A response without groups cannot authorise anything; treat as
        -- malformed rather than as a user in no groups.
        return nil, "identity response missing groups"
    end
    return decoded
end

--- Resolve an address to an identity, using the shared-dict cache.
---
--- @param ip   string  client address (ngx.var.remote_addr)
--- @param opts table|nil {control_url, service_token, ttl, negative_ttl, timeout_ms}
--- @param deps table|nil {http_client, dict} — injected in tests
--- @return table|nil identity, string|nil reason
function M.resolve(ip, opts, deps)
    deps = deps or {}
    if not ip or ip == "" then
        return nil, "no client address"
    end

    local cfg = config(opts)
    local dict = deps.dict or settings()

    if dict then
        local cached = dict:get(ip)
        if cached == NEGATIVE then
            return nil, "no session (cached)"
        elseif cached then
            local ok, decoded = pcall(Cjson.decode, cached)
            -- Held to the same shape check as a fresh response: a cached entry
            -- without groups cannot authorise anything, and must not be handed
            -- back as a user who simply holds none.
            if ok and type(decoded) == "table" and type(decoded.groups) == "table" then
                return decoded
            end
            -- Unreadable or malformed entry: drop it and fall through to a
            -- fresh lookup rather than trusting or denying on corrupt data.
            dict:delete(ip)
        end
    end

    local identity, err = M.fetch(ip, cfg, deps.http_client)

    if identity then
        if dict then
            local ok, encoded = pcall(Cjson.encode, identity)
            if ok then
                dict:set(ip, encoded, cfg.ttl)
            end
        end
        return identity
    end

    -- Only cache a definitive "no session". Transient failures (unreachable,
    -- 5xx, timeout) must not be remembered, or one blip would deny a user for
    -- the whole TTL.
    if err == "no session" and dict then
        dict:set(ip, NEGATIVE, cfg.negative_ttl)
    end

    return nil, err
end

--- Does this identity hold at least one of the required groups?
---
--- An empty requirement means "any authenticated VPN user" — the identity still
--- has to resolve, so this is not the same as no check at all.
---
--- @param identity table|nil
--- @param required table|string|nil  list, or comma-separated string
--- @return boolean
function M.has_group(identity, required)
    if type(identity) ~= "table" or type(identity.groups) ~= "table" then
        return false
    end

    local want = {}
    if type(required) == "string" then
        for g in required:gmatch("[^,]+") do
            local trimmed = g:match("^%s*(.-)%s*$")
            if trimmed ~= "" then table.insert(want, trimmed) end
        end
    elseif type(required) == "table" then
        for _, g in ipairs(required) do
            if type(g) == "string" and g ~= "" then table.insert(want, g) end
        end
    end

    if #want == 0 then
        return true -- resolved identity is sufficient
    end

    local held = {}
    for _, g in ipairs(identity.groups) do
        held[g] = true
    end
    for _, g in ipairs(want) do
        if held[g] then
            return true
        end
    end
    return false
end

--- Purge a cached entry. Useful when a revocation webhook lands.
function M.invalidate(ip, deps)
    local dict = (deps or {}).dict or settings()
    if dict and ip then
        dict:delete(ip)
    end
end

M.DEFAULT_TTL = DEFAULT_TTL
M.DEFAULT_NEGATIVE_TTL = DEFAULT_NEGATIVE_TTL
M.DICT_NAME = DICT_NAME
M.NEGATIVE = NEGATIVE

return M
