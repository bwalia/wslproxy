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
    BD_UA_MISSING           = { weight = 40, ivt = "givt", what = "No User-Agent header" },
    BD_UA_AUTOMATION        = { weight = 35, ivt = "givt", what = "HTTP library or CLI tool User-Agent (curl, python-requests, Go, Java ...)" },
    BD_UA_SCANNER           = { weight = 90, ivt = "givt", what = "Vulnerability scanner User-Agent (sqlmap, nikto, nuclei ...)" },
    BD_UA_DECLARED_BOT      = { weight = 30, ivt = "givt", what = "Self-declared bot, crawler or spider that is not a verified search engine" },
    BD_UA_HEADLESS          = { weight = 70, ivt = "sivt", what = "Headless or automated browser (HeadlessChrome, PhantomJS, Selenium ...)" },
    BD_FAKE_CRAWLER         = { weight = 90, ivt = "sivt", what = "Claims to be a search-engine crawler but its IP does not belong to that engine (reverse + forward DNS)" },
    BD_BROWSER_NO_ACCEPT    = { weight = 15, ivt = "sivt", what = "Claims to be a browser but sends no Accept header" },
    BD_BROWSER_NO_LANGUAGE  = { weight = 20, ivt = "sivt", what = "Claims to be a browser but sends no Accept-Language header" },
    BD_BROWSER_NO_ENCODING  = { weight = 15, ivt = "sivt", what = "Claims to be a browser but sends no Accept-Encoding header" },
    BD_BROWSER_NO_HINTS     = { weight = 15, ivt = "sivt", what = "Claims to be Chromium but sends no Sec-CH-UA client hints over HTTPS" },
    BD_BROWSER_NO_FETCH_META = { weight = 15, ivt = "sivt", what = "Claims to be a modern browser but sends no Sec-Fetch-* metadata over HTTPS" },
    BD_OLD_PROTOCOL         = { weight = 15, ivt = "sivt", what = "Claims to be a browser but speaks HTTP/1.0" },
    BD_DATACENTER           = { weight = 25, ivt = "givt", what = "Client IP is in a hosting / cloud provider range" },
    BD_BURST                = { weight = 30, ivt = "sivt", what = "Request burst from one IP above the per-10s limit" },
    BD_SCRAPING             = { weight = 35, ivt = "sivt", what = "Too many distinct pages per minute for one visitor" },
    BD_ERROR_STORM          = { weight = 30, ivt = "sivt", what = "Many 401/403/404/405 responses for one IP — scanning, enumeration or carding" },
    BD_LOGIN_VELOCITY       = { weight = 50, ivt = "sivt", what = "Too many login attempts from one IP — credential stuffing" },
    BD_NO_COOKIE            = { weight = 25, ivt = "sivt", what = "Never returns the session cookie it is given — a script, not a browser" },
    BD_NO_ASSETS            = { weight = 20, ivt = "sivt", what = "Loads many pages but never the CSS/JS/images a browser fetches" },
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
