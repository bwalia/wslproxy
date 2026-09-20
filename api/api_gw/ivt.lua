-- api/api_gw/ivt.lua
-- Invalid-traffic guard: cheap structural signals that separate a real client
-- from a scanner, a scraper or a spoofed internal call.
--
-- Four modes, so a tenant can roll this out without risking its own traffic:
--   disabled — module does nothing
--   audit    — evaluate, record findings for the audit log, never react
--   monitor  — audit, plus an X-WSL-IVT response header so a canary or a
--              synthetic check can see the verdict
--   block    — reject once the accumulated weight reaches block_threshold
--
-- Header spoof stripping is the one action taken in every non-disabled mode.
-- It removes headers a client should never be able to set (an internal tenant
-- header, an identity assertion the origin trusts), and removing them is
-- strictly safer than forwarding them — so it is not gated on the mode.
--
-- Signals are weighted and summed rather than being individually fatal: one
-- odd signal is noise, three at once is a scanner. Tenants tune both the
-- weights and the threshold.

local M = {}

local Keys = require("api_gw.keys")
local Store = require("api_gw.store")
local Response = require("api_gw.response")

M.MODULE = "ivt"

--- Regex match with a plain-Lua fallback, so the module loads and behaves
--- outside OpenResty (contract tests).
local function re_find(subject, pattern)
    if ngx and ngx.re then
        local from, _, err = ngx.re.find(subject, pattern, "joi")
        if err then
            ngx.log(ngx.WARN, "[api_gw.ivt] bad path_denylist pattern ", pattern, ": ", err)
            return false
        end
        return from ~= nil
    end
    local ok, from = pcall(string.find, subject, pattern)
    return ok and from ~= nil
end
M.re_find = re_find

--- An Authorization header a real client produced looks like
--- "<scheme> <token>". Anything else — a bare token, an empty scheme, a JSON
--- blob, "undefined" — is a client bug or a probe.
--- @return boolean ok, string|nil scheme
function M.auth_shape_ok(value, scheme_set)
    if type(value) ~= "string" or value == "" then
        return true, nil -- absent is not malformed; auth decides if it matters
    end
    local scheme, token = value:match("^(%a[%w%-._]*)%s+(.+)$")
    if not scheme or not token or token:match("^%s*$") then
        return false, nil
    end
    if scheme_set and next(scheme_set) ~= nil and not scheme_set[scheme:lower()] then
        return false, scheme
    end
    return true, scheme
end

--- Strip headers whose name starts with any configured prefix.
--- Returns the number stripped and the list of names, for the audit trail.
function M.strip_spoofed(prefixes, headers)
    local stripped = {}
    if not prefixes or #prefixes == 0 then return 0, stripped end
    for name in pairs(headers or {}) do
        local lname = tostring(name):lower()
        for _, prefix in ipairs(prefixes) do
            local lp = tostring(prefix):lower()
            if lp ~= "" and lname:sub(1, #lp) == lp then
                stripped[#stripped + 1] = lname
                break
            end
        end
    end
    -- Collected first, removed second: mutating `headers` mid-iteration is
    -- undefined. Both the upstream request and ctx are cleaned, so no later
    -- stage can read a header we just declared untrustworthy.
    for _, name in ipairs(stripped) do
        if ngx and ngx.req and ngx.req.clear_header then
            ngx.req.clear_header(name)
        end
        headers[name] = nil
    end
    return #stripped, stripped
end

--- Resolve the burst counter key material.
local function burst_key_material(burst, ctx)
    if burst.key == "header" and burst.header then
        local v = ctx.headers and ctx.headers[burst.header:lower()]
        if type(v) == "table" then v = v[1] end
        return v or "none"
    end
    return ctx.client_ip or ctx.peer_addr or "unknown"
end

--- Evaluate every signal.  Pure apart from header stripping and the burst
--- counter; returns findings plus the summed weight.
--- @return table findings, number score
function M.evaluate(cfg, ctx)
    local ivt = cfg.ivt
    local w = ivt.weights
    local findings, score = {}, 0

    local function add(signal, weight, detail)
        findings[#findings + 1] = { module = M.MODULE, signal = signal, detail = detail }
        score = score + (weight or 0)
    end

    local method = (ctx.method or "GET"):upper()
    if next(ivt.methods_allow) ~= nil and not ivt.methods_allow[method] then
        add("method_not_allowed", w.method_denied, method)
    elseif ivt.methods_deny[method] then
        add("method_denied", w.method_denied, method)
    end

    for _, pattern in ipairs(ivt.path_denylist) do
        if re_find(ctx.uri or "", tostring(pattern)) then
            add("path_denied", w.path_denied, tostring(pattern))
            break
        end
    end

    if ivt.require_auth_shape then
        local auth = ctx.headers and ctx.headers["authorization"]
        if type(auth) == "table" then auth = auth[1] end
        local ok = M.auth_shape_ok(auth, ivt.auth_schemes)
        if not ok then
            -- The value itself is never recorded: it is a credential.
            add("auth_malformed", w.auth_malformed, nil)
        end
    end

    local n_stripped, names = M.strip_spoofed(ivt.strip_header_prefixes, ctx.headers)
    if n_stripped > 0 then
        add("header_spoof", w.header_spoof, table.concat(names, ","))
        ctx.stripped_headers = names
    end

    local burst = ivt.burst
    if burst.enabled and burst.max_requests and burst.max_requests > 0 then
        local material = burst_key_material(burst, ctx)
        local key = Keys.build(cfg.tenant, M.MODULE, "burst", burst.key,
            Keys.hash(cfg.tenant, material))
        local count, _, err = Store.incr_sliding(key, burst.window_seconds)
        if err then
            -- Infra failure: fail open, but say so loudly once per request.
            ngx.log(ngx.WARN, "[api_gw.ivt] burst counter unavailable: ", err)
        elseif count and count > burst.max_requests then
            add("burst_exceeded", w.burst_exceeded,
                tostring(count) .. "/" .. tostring(burst.max_requests))
        end
    end

    return findings, score
end

--- Pipeline stage.
function M.run(cfg, ctx, policy)
    local mode = policy.ivt_mode or cfg.ivt.mode
    if mode == "disabled" then return nil end

    local findings, score = M.evaluate(cfg, ctx)

    local verdict = "clean"
    if score >= cfg.ivt.block_threshold then
        verdict = "suspect"
    elseif #findings > 0 then
        verdict = "noisy"
    end

    ctx.ivt = { mode = mode, score = score, verdict = verdict, findings = findings }
    for _, f in ipairs(findings) do
        ctx.findings[#ctx.findings + 1] = f
    end

    if mode == "monitor" then
        ctx.response_headers["X-WSL-IVT"] = verdict .. ";score=" .. tostring(score)
    end

    if mode == "block" and verdict == "suspect" then
        local signals = {}
        for _, f in ipairs(findings) do signals[#signals + 1] = f.signal end
        return Response.deny(cfg.ivt.status, "invalid_traffic",
            "Request rejected by the traffic guard.",
            { module = M.MODULE, detail = { score = score, signals = signals } })
    end

    return nil
end

return M
