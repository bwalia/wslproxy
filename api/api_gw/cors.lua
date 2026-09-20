-- api/api_gw/cors.lua
-- Per-tenant CORS, including preflight.
--
-- Runs early in the pipeline, before IVT, auth and rate limiting: a preflight
-- OPTIONS carries no credentials by design, so authenticating it is impossible
-- and rate limiting it would break a browser that legitimately re-probes. The
-- cost is that a preflight is a cheap unauthenticated endpoint — which is why
-- the IVT burst counter still sees it (see pipeline.lua).
--
-- Credentialed wildcards are refused rather than emitted: `Access-Control-
-- Allow-Origin: *` with `Allow-Credentials: true` is rejected by every browser
-- and silently breaks the tenant's app, so we echo the concrete origin instead.

local M = {}

local Response = require("api_gw.response")

M.MODULE = "cors"

--- Does `origin` match a configured entry?  An entry is an exact origin, "*",
--- or a single-label wildcard such as "https://*.example.com".
function M.origin_allowed(origins, origin)
    if not origin or origin == "" then return false, false end
    for _, spec in ipairs(origins or {}) do
        spec = tostring(spec)
        if spec == "*" then
            return true, true -- allowed, wildcard
        end
        if spec == origin then
            return true, false
        end
        local scheme, rest = spec:match("^(%a[%w+.-]*://)%*%.(.+)$")
        if scheme and rest then
            local o_scheme, o_host = origin:match("^(%a[%w+.-]*://)(.+)$")
            if o_scheme == scheme and o_host then
                -- "*.example.com" matches "a.example.com" but not
                -- "example.com" and not "evil-example.com".
                if #o_host > #rest and o_host:sub(-(#rest + 1)) == "." .. rest then
                    return true, false
                end
            end
        end
    end
    return false, false
end

local function join(list_val)
    return table.concat(list_val, ", ")
end

--- Build the response headers for an allowed request.
--- @param c table  normalised cors config
--- @param origin string
--- @param wildcard boolean  true when the match came from "*"
--- @param preflight boolean
function M.build_headers(c, origin, wildcard, preflight)
    local h = {}
    if wildcard and not c.credentials then
        h["Access-Control-Allow-Origin"] = "*"
    else
        -- Echoing a specific origin makes the response origin-dependent.
        h["Access-Control-Allow-Origin"] = origin
        h["Vary"] = "Origin"
    end
    if c.credentials then
        h["Access-Control-Allow-Credentials"] = "true"
    end
    if #c.expose_headers > 0 then
        h["Access-Control-Expose-Headers"] = join(c.expose_headers)
    end
    if preflight then
        h["Access-Control-Allow-Methods"] = join(c.methods)
        if #c.headers > 0 then
            h["Access-Control-Allow-Headers"] = join(c.headers)
        end
        if c.max_age and c.max_age > 0 then
            h["Access-Control-Max-Age"] = tostring(c.max_age)
        end
    end
    return h
end

--- Pipeline stage.
--- @return table|nil decision  a "finish" decision for a terminated preflight
function M.run(cfg, ctx, policy)
    local c = policy.cors or cfg.cors
    if not c.enabled then return nil end

    local origin = ctx.headers and ctx.headers["origin"]
    if type(origin) == "table" then origin = origin[1] end
    if not origin or origin == "" then
        -- Same-origin or non-browser traffic: nothing to negotiate.
        return nil
    end

    local method = (ctx.method or "GET"):upper()
    local acrm = ctx.headers and ctx.headers["access-control-request-method"]
    local is_preflight = (method == "OPTIONS") and acrm ~= nil

    local allowed, wildcard = M.origin_allowed(c.origins, origin)
    ctx.cors = { origin = origin, allowed = allowed, preflight = is_preflight }

    if not allowed then
        -- Omit the CORS headers and let the browser enforce. Answering a
        -- preflight with 403 gives a worse console error than the standard
        -- "no Access-Control-Allow-Origin header" one, and leaks which
        -- origins the tenant has configured.
        if is_preflight then
            return Response.finish(c.preflight_status, { module = M.MODULE })
        end
        return nil
    end

    local headers = M.build_headers(c, origin, wildcard, is_preflight)
    for k, v in pairs(headers) do
        ctx.response_headers[k] = v
    end

    if is_preflight and not c.preflight_continue then
        return Response.finish(c.preflight_status,
            { module = M.MODULE, headers = headers })
    end

    return nil
end

return M
