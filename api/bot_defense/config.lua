-- api/bot_defense/config.lua
-- Policy for wslproxy Bot Defense: the edge-wide settings (settings.json
-- "bot_defense", optional) and the per-server policy (server JSON
-- "bot_defense"). Pure: no ngx calls beyond ngx.null, so it is unit testable.

local M = {}

M.MODES = { off = true, monitor = true, challenge = true, block = true }

-- Signal weights. A request's score is the sum of the weights of the signals
-- it raised, capped at 100. One odd signal is noise; several at once is a bot.
-- `ivt` is the invalid-traffic class a signal implies, following the MRC split:
--   givt  general IVT — identifiable by lists and routine filtration
--         (declared bots and tools, data-centre traffic)
--   sivt  sophisticated IVT — needs analysis: spoofed browsers, headless
--         automation, impersonated crawlers, abnormal behaviour
M.SIGNALS = {
    BD_UA_MISSING           = { weight = 40, ivt = "givt", kind = "fingerprint", what = "No User-Agent header" },
    BD_UA_AUTOMATION        = { weight = 35, ivt = "givt", kind = "fingerprint", what = "HTTP library or CLI tool User-Agent (curl, python-requests, Go, Java ...)" },
    BD_UA_SCANNER           = { weight = 90, ivt = "givt", kind = "fingerprint", what = "Vulnerability scanner User-Agent (sqlmap, nikto, nuclei ...)" },
    BD_UA_DECLARED_BOT      = { weight = 30, ivt = "givt", kind = "fingerprint", what = "Self-declared bot, crawler or spider that is not a verified search engine" },
    BD_UA_HEADLESS          = { weight = 70, ivt = "sivt", kind = "fingerprint", what = "Headless or automated browser (HeadlessChrome, PhantomJS, Selenium ...)" },
    BD_FAKE_CRAWLER         = { weight = 90, ivt = "sivt", kind = "identity", what = "Claims to be a search-engine crawler but its IP does not belong to that engine (reverse + forward DNS)" },
    BD_BROWSER_NO_ACCEPT    = { weight = 15, ivt = "sivt", kind = "fingerprint", what = "Claims to be a browser but sends no Accept header" },
    BD_BROWSER_NO_LANGUAGE  = { weight = 20, ivt = "sivt", kind = "fingerprint", what = "Claims to be a browser but sends no Accept-Language header" },
    BD_BROWSER_NO_ENCODING  = { weight = 15, ivt = "sivt", kind = "fingerprint", what = "Claims to be a browser but sends no Accept-Encoding header" },
    BD_BROWSER_NO_HINTS     = { weight = 15, ivt = "sivt", kind = "fingerprint", what = "Claims to be Chromium but sends no Sec-CH-UA client hints over HTTPS" },
    BD_BROWSER_NO_FETCH_META = { weight = 15, ivt = "sivt", kind = "fingerprint", what = "Claims to be a modern browser but sends no Sec-Fetch-* metadata over HTTPS" },
    BD_OLD_PROTOCOL         = { weight = 15, ivt = "sivt", kind = "fingerprint", what = "Claims to be a browser but speaks HTTP/1.0" },
    BD_DATACENTER           = { weight = 25, ivt = "givt", kind = "identity", what = "Client IP is in a hosting / cloud provider range" },
    BD_BURST                = { weight = 30, ivt = "sivt", kind = "behaviour", what = "Request burst from one IP above the per-10s limit" },
    BD_SCRAPING             = { weight = 35, ivt = "sivt", kind = "behaviour", what = "Too many distinct pages per minute for one visitor" },
    BD_ERROR_STORM          = { weight = 30, ivt = "sivt", kind = "behaviour", what = "Many 401/403/404/405 responses for one IP — scanning, enumeration or carding" },
    BD_LOGIN_VELOCITY       = { weight = 50, ivt = "sivt", kind = "behaviour", what = "Too many login attempts from one IP — credential stuffing" },
    BD_NO_COOKIE            = { weight = 25, ivt = "sivt", kind = "behaviour", what = "Never returns the session cookie it is given — a script, not a browser" },
    BD_NO_ASSETS            = { weight = 20, ivt = "sivt", kind = "behaviour", what = "Loads many pages but never the CSS/JS/images a browser fetches" },
}

M.DEFAULT_THRESHOLDS = { challenge = 40, block = 80 }

M.DEFAULT_LIMITS = {
    burst_per_10s = 40,           -- requests per IP per 10 s
    distinct_paths_per_min = 40,  -- distinct URLs per visitor per minute
    errors_per_min = 20,          -- 401/403/404/405 per IP per minute
    logins_per_5min = 6,          -- POSTs to login_paths per IP per 5 min
    cookieless_requests = 3,      -- requests without the cookie we issued
    pages_without_assets = 12,    -- page navigations with zero assets
}

M.DEFAULT_GLOBAL = {
    pow_difficulty = 16,          -- leading zero bits; ~65k hashes, well under 1 s in a browser
    challenge_ttl_s = 120,        -- how long a challenge token stays solvable
    session_ttl_s = 1800,         -- session cookie lifetime
    passed_ttl_s = 1800,          -- how long a solved challenge is trusted
    cookie_name = "wsl_bd",
    dict = "wsl_bot_defense",
    verify_path = "/__wsl/bot/verify",
    ip_binding = "prefix",        -- prefix (/24, /56) | exact | none
    dns_timeout_ms = 500,
    reload_interval_s = 30,
}

local function is_null(v)
    return v == nil or (ngx and v == ngx.null)
end
M.is_null = is_null

local function str(v)
    if type(v) ~= "string" then return nil end
    v = v:match("^%s*(.-)%s*$")
    if v == "" then return nil end
    return v
end

local function number(v, lo, hi, default)
    local n = tonumber(v)
    if not n or n ~= n then return default end
    if n < lo then return lo end
    if n > hi then return hi end
    return n
end

--- A valid path entry: absolute, no whitespace or control characters.
--- A trailing "/" or "*" makes it a prefix; anything else matches exactly.
local function valid_path(p)
    return type(p) == "string" and p:sub(1, 1) == "/" and #p <= 512 and not p:find("[%s%c]")
end
M.valid_path = valid_path

function M.path_matches(uri, p)
    if not valid_path(p) then return false end
    local last = p:sub(-1)
    if last == "*" then
        local prefix = p:sub(1, -2)
        return uri:sub(1, #prefix) == prefix
    elseif last == "/" then
        return uri:sub(1, #p) == p
    end
    return uri == p
end

function M.in_paths(uri, list)
    if type(list) ~= "table" then return false end
    for i = 1, #list do
        if M.path_matches(uri, list[i]) then return true end
    end
    return false
end

local function paths(list)
    local out = {}
    if type(list) ~= "table" then return out end
    for _, p in ipairs(list) do
        if valid_path(p) then out[#out + 1] = p end
        if #out >= 200 then break end
    end
    return out
end

--- Edge-wide settings. Everything is optional; the module runs on defaults.
--- @return table cfg, table warnings
function M.normalize_global(raw)
    local warns = {}
    if is_null(raw) then raw = {} end
    if type(raw) ~= "table" then
        warns[#warns + 1] = "settings.bot_defense must be an object; using defaults"
        raw = {}
    end
    local d = M.DEFAULT_GLOBAL
    local cfg = {
        secret = str(raw.secret),
        pow_difficulty = math.floor(number(raw.pow_difficulty, 8, 24, d.pow_difficulty)),
        challenge_ttl_s = number(raw.challenge_ttl_s, 30, 3600, d.challenge_ttl_s),
        session_ttl_s = number(raw.session_ttl_s, 60, 86400 * 7, d.session_ttl_s),
        passed_ttl_s = number(raw.passed_ttl_s, 60, 86400 * 7, d.passed_ttl_s),
        cookie_name = d.cookie_name,
        dict = str(raw.dict) or d.dict,
        verify_path = d.verify_path,
        ip_binding = d.ip_binding,
        dns_timeout_ms = number(raw.dns_timeout_ms, 50, 5000, d.dns_timeout_ms),
        reload_interval_s = number(raw.reload_interval_s, 5, 3600, d.reload_interval_s),
        dns_nameservers = {},
        datacenter_cidrs = {},
        datacenter_file = str(raw.datacenter_file),
        weights = {},
    }

    local name = str(raw.cookie_name)
    if name then
        if name:match("^[%w_%-]+$") then cfg.cookie_name = name
        else warns[#warns + 1] = "cookie_name may only contain letters, digits, _ and -" end
    end
    if raw.ip_binding ~= nil then
        if raw.ip_binding == "prefix" or raw.ip_binding == "exact" or raw.ip_binding == "none" then
            cfg.ip_binding = raw.ip_binding
        else
            warns[#warns + 1] = "ip_binding must be prefix, exact or none; using prefix"
        end
    end
    if type(raw.dns_nameservers) == "table" then
        for _, ns in ipairs(raw.dns_nameservers) do
            if type(ns) == "string" and ns:match("^[%d%.:a-fA-F]+$") then
                cfg.dns_nameservers[#cfg.dns_nameservers + 1] = ns
            end
        end
    end
    if type(raw.datacenter_cidrs) == "table" then
        for _, c in ipairs(raw.datacenter_cidrs) do
            if type(c) == "string" then cfg.datacenter_cidrs[#cfg.datacenter_cidrs + 1] = c end
        end
    end
    for code, spec in pairs(M.SIGNALS) do
        local w = type(raw.weights) == "table" and tonumber(raw.weights[code]) or nil
        cfg.weights[code] = w and number(w, 0, 100, spec.weight) or spec.weight
    end
    return cfg, warns
end

-- ─── admin-side validation ──────────────────────────────────────────────────
-- Shared by the server editor (api.lua validateServerPayload) and the Bot
-- Management API (bot_defense/admin.lua), so both refuse the same input.

--- Validate a server's "bot_defense" object. Unlike normalize_server, which
--- quietly falls back to defaults at request time, this rejects bad input.
--- @return table list of { field, message } (empty when valid)
function M.validate_server(bd)
    local errors = {}
    local function err(field, message) errors[#errors + 1] = { field = field, message = message } end
    if is_null(bd) then return errors end
    if type(bd) ~= "table" then
        err("bot_defense", "Bot Defense must be an object")
        return errors
    end
    if bd.mode ~= nil and (type(bd.mode) ~= "string" or not M.MODES[bd.mode]) then
        err("bot_defense.mode", "Bot Defense mode must be 'off', 'monitor', 'challenge' or 'block'")
    end
    if not is_null(bd.thresholds) then
        local t = bd.thresholds
        local ch = type(t) == "table" and tonumber(t.challenge)
        local bl = type(t) == "table" and tonumber(t.block)
        if type(t) ~= "table" or (t.challenge ~= nil and not (ch and ch >= 1 and ch <= 100))
            or (t.block ~= nil and not (bl and bl >= 1 and bl <= 100)) then
            err("bot_defense.thresholds", "Bot Defense thresholds must be numbers from 1 to 100")
        elseif ch and bl and bl < ch then
            err("bot_defense.thresholds", "The block threshold must not be below the challenge threshold")
        end
    end
    if not is_null(bd.limits) then
        if type(bd.limits) ~= "table" then
            err("bot_defense.limits", "Bot Defense limits must be an object")
        else
            for k, v in pairs(bd.limits) do
                local n = tonumber(v)
                if M.DEFAULT_LIMITS[k] == nil then
                    err("bot_defense.limits." .. tostring(k), "Unknown Bot Defense limit")
                elseif not n or n < 1 or n > 100000 or n % 1 ~= 0 then
                    err("bot_defense.limits." .. tostring(k), "Each Bot Defense limit must be a whole number from 1 to 100000")
                end
            end
        end
    end
    for _, field in ipairs({ "skip_paths", "login_paths", "challenge_paths", "monitor_paths" }) do
        local list = bd[field]
        if not is_null(list) then
            if type(list) ~= "table" then
                err("bot_defense." .. field, "Must be a list of paths")
            else
                local count = 0
                for i, p in ipairs(list) do
                    count = count + 1
                    if not valid_path(p) then
                        err("bot_defense." .. field .. "[" .. i .. "]",
                            "Each path must start with '/' and contain no spaces (end with '/' or '*' for a prefix)")
                    end
                end
                if count > 200 then err("bot_defense." .. field, "At most 200 paths") end
            end
        end
    end
    for _, field in ipairs({ "allow_verified_bots", "forward_headers", "response_headers" }) do
        if not is_null(bd[field]) and type(bd[field]) ~= "boolean" then
            err("bot_defense." .. field, "Must be true or false")
        end
    end
    return errors
end

-- Edge-wide tuning the admin UI may change. Stored in
-- data/bot_defense/settings.json, laid over settings.json "bot_defense" (which
-- the deploy rewrites from SOPS). Operational keys — the HMAC secret, the
-- cookie name, the shared dict, the reload interval — stay out of reach.
M.OVERLAY_KEYS = {
    pow_difficulty = true, challenge_ttl_s = true, passed_ttl_s = true, session_ttl_s = true,
    ip_binding = true, weights = true, datacenter_cidrs = true, datacenter_file = true,
    dns_nameservers = true, dns_timeout_ms = true,
}

--- Validate an edge-settings overlay.
--- @return table|nil clean overlay, table list of { field, message }
function M.validate_overlay(raw)
    local errors = {}
    local function err(field, message) errors[#errors + 1] = { field = field, message = message } end
    if type(raw) ~= "table" then
        err("settings", "Bot Defense settings must be an object")
        return nil, errors
    end
    local clean = {}
    local function int(key, lo, hi)
        local v = raw[key]
        if is_null(v) then return end
        local n = tonumber(v)
        if not n or n % 1 ~= 0 or n < lo or n > hi then
            err(key, ("Must be a whole number from %d to %d"):format(lo, hi))
        else
            clean[key] = n
        end
    end
    for key in pairs(raw) do
        if not M.OVERLAY_KEYS[key] then err(key, "Not an editable Bot Defense setting") end
    end
    int("pow_difficulty", 8, 24)
    int("challenge_ttl_s", 30, 3600)
    int("passed_ttl_s", 60, 604800)
    int("session_ttl_s", 60, 604800)
    int("dns_timeout_ms", 50, 5000)
    if not is_null(raw.ip_binding) then
        if raw.ip_binding == "prefix" or raw.ip_binding == "exact" or raw.ip_binding == "none" then
            clean.ip_binding = raw.ip_binding
        else
            err("ip_binding", "Must be prefix, exact or none")
        end
    end
    if not is_null(raw.weights) then
        if type(raw.weights) ~= "table" then
            err("weights", "Must be an object of signal → weight")
        else
            clean.weights = {}
            for code, w in pairs(raw.weights) do
                local n = tonumber(w)
                if not M.SIGNALS[code] then
                    err("weights." .. tostring(code), "Unknown signal")
                elseif not n or n < 0 or n > 100 then
                    err("weights." .. code, "Weight must be from 0 to 100")
                else
                    clean.weights[code] = n
                end
            end
        end
    end
    local function string_list(key, max, check, message)
        local v = raw[key]
        if is_null(v) then return end
        if type(v) ~= "table" then
            err(key, "Must be a list")
            return
        end
        local out = {}
        for i, s in ipairs(v) do
            if type(s) ~= "string" or not check(s) then
                err(key .. "[" .. i .. "]", message)
            else
                out[#out + 1] = s
            end
        end
        if #out > max then err(key, ("At most %d entries; use datacenter_file for long lists"):format(max)) end
        clean[key] = out
    end
    string_list("datacenter_cidrs", 5000, function(s) return s:match("^[%x%.:/]+$") ~= nil end,
        "Must be an IPv4 or IPv6 CIDR")
    string_list("dns_nameservers", 4, function(s) return s:match("^[%x%.:]+$") ~= nil end,
        "Must be an IP address")
    if not is_null(raw.datacenter_file) then
        local f = raw.datacenter_file
        -- Only a file under data/: this setting must not become a way to read
        -- arbitrary files through the gateway.
        if type(f) ~= "string" or (f ~= "" and (not f:match("^data/[%w_%-%./]+$") or f:find("..", 1, true))) then
            err("datacenter_file", "Must be a path under data/, e.g. data/bot_defense/datacenter.cidr")
        else
            clean.datacenter_file = f
        end
    end
    if #errors > 0 then return nil, errors end
    return clean, errors
end

--- Per-server policy from the server JSON "bot_defense" object.
--- @return table|nil policy (nil when off or absent)
function M.normalize_server(raw)
    if type(raw) ~= "table" then return nil end
    local mode = type(raw.mode) == "string" and raw.mode:lower() or "off"
    if not M.MODES[mode] or mode == "off" then return nil end

    local t = type(raw.thresholds) == "table" and raw.thresholds or {}
    local challenge = number(t.challenge, 1, 100, M.DEFAULT_THRESHOLDS.challenge)
    local block = number(t.block, 1, 100, M.DEFAULT_THRESHOLDS.block)
    if block < challenge then block = challenge end

    local l = type(raw.limits) == "table" and raw.limits or {}
    local limits = {}
    for k, v in pairs(M.DEFAULT_LIMITS) do
        limits[k] = math.floor(number(l[k], 1, 100000, v))
    end

    return {
        mode = mode,
        challenge_at = challenge,
        block_at = block,
        limits = limits,
        skip_paths = paths(raw.skip_paths),
        login_paths = paths(raw.login_paths),
        challenge_paths = paths(raw.challenge_paths),
        monitor_paths = paths(raw.monitor_paths),
        allow_verified_bots = raw.allow_verified_bots ~= false,
        forward_headers = raw.forward_headers ~= false,
        response_headers = raw.response_headers == true,
    }
end

return M
