-- api/api_gw/config.lua
-- Schema, defaults, normalisation and route resolution for the `api_gw` block.
--
-- Input is whatever the admin API persisted on a server JSON (and, optionally,
-- an override on a rule).  Output is a fully-defaulted, type-coerced table that
-- every other api_gw module can read without re-validating.  Nothing here
-- touches ngx state, so it is directly unit-testable.
--
-- Normalisation runs per request on purpose.  Policy JSON is read from disk by
-- rule_loader on every request (WSLProxy's no-reload contract); memoising the
-- normalised form would put a staleness window in front of that guarantee for
-- a few microseconds of table work.  If this ever shows up in a profile, cache
-- on an explicit `api_gw.version` field rather than on a TTL.

local M = {}

local Keys = require("api_gw.keys")

-- Order is the documented pipeline order; see docs/api-gateway.md.
M.MODULES = { "real_ip", "request_security", "cors", "ivt", "auth", "rate_limit", "audit", "hooks" }

M.IVT_MODES = { disabled = true, audit = true, monitor = true, block = true }
M.AUTH_STRATEGIES = { none = true, passthrough = true, jwt = true, api_key = true }
M.PATH_KEYS = { equals = true, starts_with = true, regex = true }

-- ─── coercion helpers ───────────────────────────────────────────────────────

-- cjson decodes JSON null as a userdata sentinel; some code paths hand us
-- ngx.null instead. Both mean "the operator did not set this".
local function is_null(v)
    if v == nil or type(v) == "userdata" then return true end
    if ngx and ngx.null ~= nil and v == ngx.null then return true end
    return false
end
M.is_null = is_null

--- Boolean with an explicit default.  Accepts real booleans and the
--- "true"/"false"/"1"/"0" strings the admin UI round-trips through URL args.
local function truthy(v, default)
    if is_null(v) then return default end
    if type(v) == "boolean" then return v end
    if type(v) == "number" then return v ~= 0 end
    local s = tostring(v):lower()
    if s == "true" or s == "1" or s == "yes" or s == "on" then return true end
    if s == "false" or s == "0" or s == "no" or s == "off" then return false end
    return default
end
M.truthy = truthy

local function num(v, default)
    if is_null(v) then return default end
    return tonumber(v) or default
end
M.num = num

local function str(v, default)
    if is_null(v) then return default end
    if type(v) == "string" then
        if v == "" then return default end
        return v
    end
    return tostring(v)
end

--- Normalise a list field.  Accepts an array, a comma-separated string, or a
--- single scalar; always returns an array (possibly empty).
local function list(v, default)
    if is_null(v) then return default or {} end
    if type(v) == "table" then
        local out = {}
        for _, item in ipairs(v) do
            if not is_null(item) and item ~= "" then
                out[#out + 1] = item
            end
        end
        return out
    end
    local out = {}
    for piece in tostring(v):gmatch("[^,]+") do
        piece = piece:match("^%s*(.-)%s*$")
        if piece ~= "" then out[#out + 1] = piece end
    end
    return out
end
M.list = list

--- Array → lookup set, optionally upper-cased (for HTTP methods/headers).
local function set_of(arr, transform)
    local s = {}
    for _, v in ipairs(arr or {}) do
        local k = tostring(v)
        if transform then k = transform(k) end
        s[k] = true
    end
    return s
end
M.set_of = set_of

local function lower(s) return s:lower() end
local function upper(s) return s:upper() end

--- Shallow-per-module deep merge: `override` wins key by key, one level into
--- each module table.  Enough for rule-level overrides (a rule tweaks a couple
--- of knobs) without the surprises of a full recursive merge on arrays.
local function merge(base, override)
    if type(override) ~= "table" then return base end
    if type(base) ~= "table" then return override end
    local out = {}
    for k, v in pairs(base) do out[k] = v end
    for k, v in pairs(override) do
        if type(v) == "table" and type(out[k]) == "table"
            and not v[1] and not out[k][1] then
            -- both are maps (not arrays) → merge one level deeper
            local sub = {}
            for sk, sv in pairs(out[k]) do sub[sk] = sv end
            for sk, sv in pairs(v) do sub[sk] = sv end
            out[k] = sub
        else
            out[k] = v
        end
    end
    return out
end
M.merge = merge

-- ─── per-module defaults ────────────────────────────────────────────────────

local function default_rate_profiles()
    -- Named profiles a tenant can reference from a route.  All overridable;
    -- a tenant may also define profiles of its own.  limit = 0 means unlimited.
    return {
        health    = { limit = 0,    window_seconds = 60, key = "ip" },
        auth      = { limit = 10,   window_seconds = 60, key = "ip" },
        public    = { limit = 120,  window_seconds = 60, key = "ip" },
        standard  = { limit = 600,  window_seconds = 60, key = "consumer" },
        expensive = { limit = 30,   window_seconds = 60, key = "consumer" },
        webhook   = { limit = 1200, window_seconds = 60, key = "ip" },
    }
end
M.default_rate_profiles = default_rate_profiles

local function norm_real_ip(raw)
    raw = type(raw) == "table" and raw or {}
    return {
        trusted_cidrs = list(raw.trusted_cidrs, {}),
        header        = str(raw.header, "X-Forwarded-For"),
        recursive     = truthy(raw.recursive, true),
    }
end

local function norm_request_security(raw)
    raw = type(raw) == "table" and raw or {}
    local corr = type(raw.correlation) == "table" and raw.correlation or {}
    local ct = type(raw.content_type) == "table" and raw.content_type or {}
    local typ = type(raw.token_typ) == "table" and raw.token_typ or {}
    return {
        correlation = {
            enabled         = truthy(corr.enabled, true),
            header          = str(corr.header, "X-Correlation-ID"),
            echo_downstream = truthy(corr.echo_downstream, true),
            accept_inbound  = truthy(corr.accept_inbound, true),
            max_length      = num(corr.max_length, 128),
        },
        content_type = {
            enforce      = truthy(ct.enforce, false),
            methods      = set_of(list(ct.methods, { "POST", "PUT", "PATCH" }), upper),
            allow        = set_of(list(ct.allow, { "application/json" }), lower),
            exempt_paths = list(ct.exempt_paths, {}),
            status       = num(ct.status, 415),
        },
        max_body_bytes          = num(raw.max_body_bytes, 0), -- 0 = no api_gw limit
        require_content_length  = truthy(raw.require_content_length, false),
        body_status             = num(raw.body_status, 413),
        token_typ = {
            enabled = truthy(typ.enabled, false),
            header  = str(typ.header, "Authorization"),
            expect  = set_of(list(typ.expect, { "JWT", "at+jwt" }), lower),
            mode    = M.IVT_MODES[str(typ.mode, "audit")] and str(typ.mode, "audit") or "audit",
        },
    }
end

local function norm_cors(raw)
    raw = type(raw) == "table" and raw or {}
    return {
        enabled            = truthy(raw.enabled, true),
        origins            = list(raw.origins, {}),
        methods            = list(raw.methods, { "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS" }),
        headers            = list(raw.headers, { "Authorization", "Content-Type" }),
        expose_headers     = list(raw.expose_headers, {}),
        credentials        = truthy(raw.credentials, false),
        max_age            = num(raw.max_age, 3600),
        preflight_continue = truthy(raw.preflight_continue, false),
        preflight_status   = num(raw.preflight_status, 204),
    }
end

local function norm_ivt(raw)
    raw = type(raw) == "table" and raw or {}
    local methods = type(raw.methods) == "table" and raw.methods or {}
    local burst = type(raw.burst) == "table" and raw.burst or {}
    local weights = type(raw.weights) == "table" and raw.weights or {}
    local mode = str(raw.mode, "audit")
    if not M.IVT_MODES[mode] then mode = "audit" end
    return {
        mode                 = mode,
        methods_allow        = set_of(list(methods.allow, {}), upper),
        methods_deny         = set_of(list(methods.deny, {}), upper),
        path_denylist        = list(raw.path_denylist, {}),
        require_auth_shape   = truthy(raw.require_auth_shape, false),
        auth_schemes         = set_of(list(raw.auth_schemes, { "Bearer", "Basic" }), lower),
        strip_header_prefixes = list(raw.strip_header_prefixes, {}),
        burst = {
            enabled        = truthy(burst.enabled, burst.max_requests ~= nil),
            window_seconds = num(burst.window_seconds, 10),
            max_requests   = num(burst.max_requests, 0),
            key            = str(burst.key, "ip"),
            header         = str(burst.header, nil),
        },
        weights = {
            method_denied     = num(weights.method_denied, 5),
            path_denied       = num(weights.path_denied, 5),
            auth_malformed    = num(weights.auth_malformed, 3),
            header_spoof      = num(weights.header_spoof, 1),
            burst_exceeded    = num(weights.burst_exceeded, 5),
        },
        block_threshold = num(raw.block_threshold, 3),
        status          = num(raw.status, 403),
    }
end

local function norm_auth(raw)
    raw = type(raw) == "table" and raw or {}
    local strategy = str(raw.strategy, "passthrough")
    if not M.AUTH_STRATEGIES[strategy] then strategy = "passthrough" end
    local jwt = type(raw.jwt) == "table" and raw.jwt or {}
    local api_key = type(raw.api_key) == "table" and raw.api_key or {}
    return {
        strategy        = strategy,
        public_paths    = list(raw.public_paths, {}),
        protected_paths = list(raw.protected_paths, {}),
        status          = num(raw.status, 401),
        jwt = {
            secret     = str(jwt.secret, nil),
            secret_ref = str(jwt.secret_ref, nil),
            alg        = str(jwt.alg, "HS256"),
            header     = str(jwt.header, "Authorization"),
            cookie     = str(jwt.cookie, nil),
            issuer     = str(jwt.issuer, nil),
            audience   = str(jwt.audience, nil),
            leeway     = num(jwt.leeway, 60),
            claim_key  = str(jwt.claim_key, "sub"),
        },
        api_key = {
            header      = str(api_key.header, "X-API-Key"),
            query_param = str(api_key.query_param, nil),
            keys        = list(api_key.keys, {}),
            keys_ref    = str(api_key.keys_ref, nil),
        },
        -- Rate limiting by `jwt.sub` on a passthrough route has to read an
        -- unverified claim.  It is a fairness key, never an authorisation
        -- decision, but tenants that care can turn it off and fall back to ip.
        allow_unverified_subject = truthy(raw.allow_unverified_subject, true),
    }
end

local function norm_rate_limit(raw)
    raw = type(raw) == "table" and raw or {}
    local profiles = default_rate_profiles()
    if type(raw.profiles) == "table" then
        for name, p in pairs(raw.profiles) do
            if type(p) == "table" then
                local base = profiles[name] or {}
                profiles[name] = {
                    limit          = num(p.limit, base.limit or 0),
                    window_seconds = num(p.window_seconds, base.window_seconds or 60),
                    key            = str(p.key, base.key or "ip"),
                    header         = str(p.header, base.header),
                    algorithm      = str(p.algorithm, nil),
                }
            end
        end
    end
    local headers = type(raw.headers) == "table" and raw.headers or {}
    local default_profile = str(raw.default_profile, "standard")
    if not profiles[default_profile] then
        profiles[default_profile] = { limit = 0, window_seconds = 60, key = "ip" }
    end
    return {
        enabled         = truthy(raw.enabled, true),
        algorithm       = (str(raw.algorithm, "sliding") == "fixed") and "fixed" or "sliding",
        default_profile = default_profile,
        profiles        = profiles,
        status          = num(raw.status, 429),
        headers = {
            standard = truthy(headers.standard, true),
            legacy   = truthy(headers.legacy, true),
        },
    }
end

local function norm_audit(raw)
    raw = type(raw) == "table" and raw or {}
    -- Redaction is not optional: the configured list is *added* to the
    -- baseline, never replaces it.  A tenant cannot opt into logging its
    -- users' bearer tokens by shipping an empty redact_headers array.
    local redact = set_of(list(raw.redact_headers, {}), lower)
    for _, h in ipairs({ "authorization", "proxy-authorization", "cookie",
        "set-cookie", "x-api-key", "api-key", "x-auth-token" }) do
        redact[h] = true
    end
    return {
        enabled           = truthy(raw.enabled, true),
        level             = str(raw.level, "info"),
        sample_rate       = num(raw.sample_rate, 1),
        tag               = str(raw.tag, "wsl_api_gw"),
        include_query     = truthy(raw.include_query, false),
        include_client_ip = truthy(raw.include_client_ip, false),
        include_headers   = list(raw.include_headers, {}),
        redact_headers    = redact,
    }
end

-- ─── routes ─────────────────────────────────────────────────────────────────

--- Higher score wins.  `equals` always beats `starts_with`, a longer prefix
--- beats a shorter one, and regex sits below both because its breadth is not
--- inspectable.  Ties fall back to declaration order, so selection is total
--- and does not depend on table iteration order.
local function specificity(path_key, path)
    local len = #tostring(path or "")
    if path_key == "equals" then return 100000 + len end
    if path_key == "starts_with" then return 10000 + len end
    return 1000
end
M.specificity = specificity

local function norm_routes(raw)
    local out = {}
    if type(raw) ~= "table" then return out end
    for idx, r in ipairs(raw) do
        if type(r) == "table" and not is_null(r.path) and r.path ~= "" then
            local path_key = str(r.path_key, "starts_with")
            if not M.PATH_KEYS[path_key] then path_key = "starts_with" end
            local ivt_mode = str(r.ivt_mode, nil)
            if ivt_mode and not M.IVT_MODES[ivt_mode] then ivt_mode = nil end
            local auth = str(r.auth, nil)
            if auth and not M.AUTH_STRATEGIES[auth] then auth = nil end
            out[#out + 1] = {
                name           = str(r.name, nil),
                path           = tostring(r.path),
                path_key       = path_key,
                methods        = (#list(r.methods, {}) > 0) and set_of(list(r.methods, {}), upper) or nil,
                auth           = auth,
                rate_profile   = str(r.rate_profile, nil),
                max_body_bytes = num(r.max_body_bytes, nil),
                ivt_mode       = ivt_mode,
                cors           = type(r.cors) == "table" and r.cors or nil,
                _order         = idx,
                _score         = specificity(path_key, r.path),
            }
        end
    end
    table.sort(out, function(a, b)
        if a._score ~= b._score then return a._score > b._score end
        return a._order < b._order
    end)
    return out
end

local function norm_hooks(raw)
    raw = type(raw) == "table" and raw or {}
    local req_hdrs, res_hdrs, lua_hooks = {}, {}, {}

    for _, op in ipairs(list(raw.request_headers, {})) do
        if type(op) == "table" and op.op then
            req_hdrs[#req_hdrs + 1] = {
                op    = str(op.op, "set"),
                name  = str(op.name, nil),
                value = op.value,
                ["from"] = str(op["from"], nil),
                ["to"]   = str(op["to"], nil),
            }
        end
    end
    for _, op in ipairs(list(raw.response_headers, {})) do
        if type(op) == "table" and op.op then
            res_hdrs[#res_hdrs + 1] = {
                op    = str(op.op, "set"),
                name  = str(op.name, nil),
                value = op.value,
                ["from"] = str(op["from"], nil),
                ["to"]   = str(op["to"], nil),
            }
        end
    end
    for _, h in ipairs(list(raw.lua, {})) do
        if type(h) == "table" then
            local phase = str(h.phase, "access_before")
            if phase ~= "access_before" and phase ~= "access_after" and phase ~= "header_filter" then
                phase = "access_before"
            end
            lua_hooks[#lua_hooks + 1] = {
                name   = str(h.name, nil),
                phase  = phase,
                file   = str(h.file, nil),
                source = (type(h.source) == "string" and h.source ~= "") and h.source or nil,
            }
        end
    end

    return {
        enabled           = truthy(raw.enabled, (#req_hdrs + #res_hdrs + #lua_hooks) > 0),
        request_headers   = req_hdrs,
        response_headers  = res_hdrs,
        lua               = lua_hooks,
    }
end

-- ─── public API ─────────────────────────────────────────────────────────────

--- Build the effective api_gw config for a request.
---
--- @param server_config table|nil  server JSON (data/servers/<env>/host:*.json)
--- @param rule_data     table|nil  matched rule JSON, for a per-rule override
--- @param profile_id    string|nil environment profile
--- @return table|nil cfg  nil when api_gw is absent or disabled
function M.resolve(server_config, rule_data, profile_id)
    if type(server_config) ~= "table" then return nil end
    local raw = server_config.api_gw
    if type(raw) ~= "table" then return nil end

    -- A rule may carry `api_gw` at its root or under match.response.
    local override
    if type(rule_data) == "table" then
        if type(rule_data.api_gw) == "table" then
            override = rule_data.api_gw
        elseif type(rule_data.match) == "table" and type(rule_data.match.response) == "table"
            and type(rule_data.match.response.api_gw) == "table" then
            override = rule_data.match.response.api_gw
        end
    end
    if override then
        raw = merge(raw, override)
    end

    if not truthy(raw.enabled, false) then
        return nil
    end

    local enabled_modules = list(raw.modules, M.MODULES)
    local mod_set = {}
    for _, name in ipairs(enabled_modules) do
        mod_set[tostring(name)] = true
    end

    return {
        enabled          = true,
        tenant           = Keys.tenant_id(server_config, profile_id),
        server_name      = server_config.server_name or server_config.id or "unknown",
        profile_id       = profile_id or "default",
        modules          = mod_set,
        real_ip          = norm_real_ip(raw.real_ip),
        request_security = norm_request_security(raw.request_security),
        cors             = norm_cors(raw.cors),
        ivt              = norm_ivt(raw.ivt),
        auth             = norm_auth(raw.auth),
        rate_limit       = norm_rate_limit(raw.rate_limit),
        audit            = norm_audit(raw.audit),
        hooks            = norm_hooks(raw.hooks),
        routes           = norm_routes(raw.routes),
    }
end

--- True when `name` is in the tenant's enabled module list.
function M.module_enabled(cfg, name)
    return cfg ~= nil and cfg.modules ~= nil and cfg.modules[name] == true
end

--- Does a path spec match this URI?
--- @param spec string
--- @param path_key "equals"|"starts_with"|"regex"
--- @param uri string
function M.path_matches(spec, path_key, uri)
    if not spec or not uri then return false end
    if path_key == "equals" then
        return uri == spec
    elseif path_key == "regex" then
        if ngx and ngx.re then
            local from = ngx.re.find(uri, spec, "jo")
            return from ~= nil
        end
        return string.find(uri, spec) ~= nil
    end
    return uri:sub(1, #spec) == spec
end

--- Segment-aware prefix match: "/health" covers "/health" and "/health/live"
--- but NOT "/healthz-other".
---
--- Raw `starts_with` is what a route's `path_key` asks for and gets, but these
--- unlabelled lists (public_paths, protected_paths, exempt_paths) feed auth
--- decisions, where a raw prefix is a bypass waiting to happen: a tenant
--- writing `public_paths: ["/v1/public"]` does not expect "/v1/publicadmin"
--- to become anonymous.
local function prefix_covers(spec, uri)
    if uri == spec then return true end
    if spec:sub(-1) == "/" then
        return uri:sub(1, #spec) == spec
    end
    if uri:sub(1, #spec) == spec then
        return uri:sub(#spec + 1, #spec + 1) == "/"
    end
    return false
end
M.prefix_covers = prefix_covers

--- Does `uri` match any entry in a list of path specs?  Entries are
--- segment-aware prefixes unless they start with `~` (e.g. "~^/v[0-9]+/"),
--- which marks a regex.
function M.path_in_list(specs, uri)
    if not uri then return false end
    for _, spec in ipairs(specs or {}) do
        spec = tostring(spec)
        if spec:sub(1, 1) == "~" then
            if M.path_matches(spec:sub(2), "regex", uri) then return true end
        elseif prefix_covers(spec, uri) then
            return true
        end
    end
    return false
end

--- The most specific route entry matching this request, or nil.
--- @param cfg table
--- @param uri string
--- @param method string|nil
function M.route_for(cfg, uri, method)
    if not cfg or not cfg.routes then return nil end
    method = method and method:upper() or nil
    for _, route in ipairs(cfg.routes) do
        if M.path_matches(route.path, route.path_key, uri) then
            if not route.methods or (method and route.methods[method]) then
                return route
            end
        end
    end
    return nil
end

-- Per-route CORS overlay.  Only the keys the route actually declares are
-- applied: running the route's table through norm_cors() first would fill in
-- every default and silently reset the server's settings, so a route that
-- merely widens `origins` would also switch `credentials` back off.
local CORS_LIST_KEYS = { origins = true, methods = true, headers = true, expose_headers = true }
local CORS_BOOL_KEYS = { enabled = true, credentials = true, preflight_continue = true }
local CORS_NUM_KEYS  = { max_age = true, preflight_status = true }

local function overlay_cors(base, raw)
    local out = {}
    for k, v in pairs(base) do out[k] = v end
    for k, v in pairs(raw) do
        if is_null(v) then
            -- explicit null means "no opinion" — keep the server's value
        elseif CORS_LIST_KEYS[k] then
            out[k] = list(v, out[k])
        elseif CORS_BOOL_KEYS[k] then
            out[k] = truthy(v, out[k])
        elseif CORS_NUM_KEYS[k] then
            out[k] = num(v, out[k])
        end
    end
    return out
end
M.overlay_cors = overlay_cors

--- Collapse server defaults and the winning route into one flat policy.
--- @return table { auth, rate_profile, max_body_bytes, ivt_mode, cors, route }
function M.policy(cfg, route)
    local rl = cfg.rate_limit
    return {
        route          = route,
        auth           = (route and route.auth) or cfg.auth.strategy,
        rate_profile   = (route and route.rate_profile) or rl.default_profile,
        max_body_bytes = (route and route.max_body_bytes) or cfg.request_security.max_body_bytes,
        ivt_mode       = (route and route.ivt_mode) or cfg.ivt.mode,
        cors           = (route and route.cors) and overlay_cors(cfg.cors, route.cors) or cfg.cors,
    }
end

return M
