-- api/api_gw/rate_limit.lua
-- Named rate-limit profiles, applied per tenant, per route class, per key.
--
-- Runs after auth so a verified consumer can have its own quota instead of
-- sharing one with everyone behind the same NAT. A key that cannot be resolved
-- falls back to the client IP rather than to a single shared bucket — the
-- fallback must never let one caller exhaust everybody else's quota.
--
-- Fail-open on infra failure (no shared dict, dict full). A rate limiter that
-- blocks every tenant because a dict filled up is a worse outage than the
-- traffic it was protecting against.

local M = {}

local Keys = require("api_gw.keys")
local Store = require("api_gw.store")
local Response = require("api_gw.response")

M.MODULE = "rate_limit"

--- Resolve the material a profile keys on.
--- @return string material, string kind
function M.key_material(profile, ctx)
    local kind = profile.key or "ip"

    if kind == "consumer" then
        if ctx.consumer and ctx.consumer ~= "" then
            return ctx.consumer, "consumer"
        end
        return ctx.client_ip or "unknown", "ip"
    end

    if kind == "jwt.sub" then
        if ctx.consumer and ctx.consumer ~= "" then
            return ctx.consumer, "jwt.sub"
        end
        return ctx.client_ip or "unknown", "ip"
    end

    if kind == "header" then
        local name = profile.header
        if name then
            local v = ctx.headers and ctx.headers[name:lower()]
            if type(v) == "table" then v = v[1] end
            if type(v) == "string" and v ~= "" then
                return v, "header"
            end
        end
        return ctx.client_ip or "unknown", "ip"
    end

    return ctx.client_ip or "unknown", "ip"
end

--- Standard (RFC-draft) and legacy rate-limit headers for a decision.
function M.build_headers(cfg_rl, limit, remaining, reset_at, now_ts)
    local h = {}
    if remaining < 0 then remaining = 0 end
    local reset_in = math.max(0, math.ceil((reset_at or now_ts) - now_ts))
    if cfg_rl.headers.standard then
        h["RateLimit-Limit"] = tostring(limit)
        h["RateLimit-Remaining"] = tostring(remaining)
        h["RateLimit-Reset"] = tostring(reset_in)
    end
    if cfg_rl.headers.legacy then
        h["X-RateLimit-Limit"] = tostring(limit)
        h["X-RateLimit-Remaining"] = tostring(remaining)
        h["X-RateLimit-Reset"] = tostring(math.floor(reset_at or now_ts))
    end
    return h
end

--- Pipeline stage.
function M.run(cfg, ctx, policy)
    local rl = cfg.rate_limit
    if not rl.enabled then return nil end

    local profile_name = policy.rate_profile or rl.default_profile
    local profile = rl.profiles[profile_name]
    if not profile then
        ngx.log(ngx.WARN, "[api_gw.rate_limit] route references unknown profile '",
            tostring(profile_name), "' for tenant ", cfg.tenant, " — not limiting")
        ctx.rate_limit = { profile = profile_name, result = "unknown_profile" }
        return nil
    end

    local limit = tonumber(profile.limit) or 0
    if limit <= 0 then
        ctx.rate_limit = { profile = profile_name, result = "unlimited" }
        return nil
    end

    local material, kind = M.key_material(profile, ctx)
    local key = Keys.build(cfg.tenant, M.MODULE, profile_name, kind,
        Keys.hash(cfg.tenant, material))

    local algorithm = profile.algorithm or rl.algorithm
    local count, reset_at, err = Store.incr(key, profile.window_seconds, algorithm)
    if err or not count then
        ctx.rate_limit = { profile = profile_name, result = "unavailable", error = err }
        return nil -- fail open
    end

    local now_ts = (ngx and ngx.now) and ngx.now() or os.time()
    local remaining = limit - count
    local headers = M.build_headers(rl, limit, remaining, reset_at, now_ts)
    for k, v in pairs(headers) do
        ctx.response_headers[k] = v
    end

    ctx.rate_limit = {
        profile   = profile_name,
        key_kind  = kind,
        count     = count,
        limit     = limit,
        window    = profile.window_seconds,
        algorithm = algorithm,
        result    = (count > limit) and "exceeded" or "allowed",
    }

    if count > limit then
        local retry_after = math.max(1, math.ceil((reset_at or now_ts) - now_ts))
        headers["Retry-After"] = tostring(retry_after)
        return Response.deny(rl.status, "rate_limited",
            "Too many requests. Retry after " .. retry_after .. " seconds.",
            { module = M.MODULE, headers = headers,
              detail = { profile = profile_name, limit = limit, window = profile.window_seconds } })
    end

    return nil
end

return M
