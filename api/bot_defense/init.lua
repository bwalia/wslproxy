-- api/bot_defense/init.lua
-- wslproxy Bot Defense: native bot management and invalid-traffic (IVT)
-- classification, opt-in per server, with no external service.
--
-- Per request (rewrite phase, from gateway_ack.lua, before the cache):
--   1. fingerprint      what the request claims and whether it adds up
--                       (bot_defense.signals)
--   2. identity checks  verified search crawlers (reverse+forward DNS) and
--                       data-centre IPs (bot_defense.crawlers / .datacenter)
--   3. behaviour        what this IP / visitor has been doing (.behaviour)
--   4. score            sum of signal weights → class: human | suspect | bot
--                       | verified_bot, and IVT: none | givt | sivt
--   5. act              monitor | challenge (self-hosted proof of work)
--                       | block, per the server's mode and thresholds
-- The verdict is forwarded to the origin as X-WSL-Bot-* headers, so an app
-- can filter invalid traffic (ad impressions, analytics) it chooses not to
-- block. Log phase: response accounting, metrics, one decision line per
-- suspicious visitor per minute.
--
-- Server JSON:  "bot_defense": { "mode": "off|monitor|challenge|block", ... }
--               (see bot_defense.config and docs/bot-defense.md)
-- Settings:     "bot_defense": { ... } optional, edge-wide, hot-reloaded.
--
-- Everything fails open: an error here is logged and the request proceeds.

local Config = require("bot_defense.config")
local Signals = require("bot_defense.signals")
local Behaviour = require("bot_defense.behaviour")
local Crawlers = require("bot_defense.crawlers")
local Datacenter = require("bot_defense.datacenter")
local Session = require("bot_defense.session")
local Challenge = require("bot_defense.challenge")

local M = {}

M.FORWARD_HEADERS = { "X-WSL-Bot-Class", "X-WSL-Bot-Score", "X-WSL-Bot-IVT", "X-WSL-Bot-Signals" }

-- Never challenged, whatever the policy: a challenged ACME probe would stop
-- certificates renewing.
local ALWAYS_SKIP = { "/.well-known/acme-challenge/" }

M.settings_file = (os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/") .. "data/settings.json"

local state            -- { cfg, secret, dict, datacenter, fingerprint }
local metrics
local log_marks, log_marks_n = {}, 0

local function log_limited(level, key, interval, ...)
    local now = ngx.now()
    local last = log_marks[key]
    if last and now - last < interval then return end
    if not last then
        log_marks_n = log_marks_n + 1
        if log_marks_n > 1000 then log_marks, log_marks_n = {}, 1 end
    end
    log_marks[key] = now
    ngx.log(level, "[bot_defense] ", ...)
end

-- ─── metrics ────────────────────────────────────────────────────────────────

local function register_metrics()
    if metrics then return end
    local prom = package.loaded._prometheus_instance
    if not prom then return end
    local ok, m = pcall(function()
        return {
            requests = prom:counter("wslproxy_bot_requests_total",
                "Requests on Bot Defense servers by class, IVT and action", { "class", "ivt", "action" }),
            signals = prom:counter("wslproxy_bot_signals_total",
                "Bot Defense signals raised", { "signal" }),
            challenges = prom:counter("wslproxy_bot_challenges_total",
                "Challenge verifications by result", { "result" }),
            crawlers = prom:counter("wslproxy_bot_crawler_checks_total",
                "Search-crawler verifications by result", { "result" }),
            errors = prom:counter("wslproxy_bot_errors_total",
                "Internal Bot Defense errors, each one failed open", { "phase" }),
        }
    end)
    if ok then metrics = m end
end

local function metric(name, value, labels)
    local m = metrics and metrics[name]
    if m then pcall(m.inc, m, value, labels) end
end

-- ─── edge-wide config (hot-reloaded) ────────────────────────────────────────

local function canonical(v)
    if type(v) ~= "table" then return type(v) .. ":" .. tostring(v) end
    local keys = {}
    for k in pairs(v) do keys[#keys + 1] = k end
    table.sort(keys, function(a, b) return tostring(a) < tostring(b) end)
    local parts = {}
    for i, k in ipairs(keys) do parts[i] = tostring(k) .. "=" .. canonical(v[k]) end
    return "{" .. table.concat(parts, ",") .. "}"
end

local function read_settings()
    local f = io.open(M.settings_file, "rb")
    if not f then return nil, "settings.json unreadable" end
    local raw = f:read("*a")
    f:close()
    local ok, decoded = pcall((Cjson or require("cjson")).decode, raw or "")
    if not ok or type(decoded) ~= "table" then return nil, "settings.json is not valid JSON" end
    return decoded
end

--- The HMAC key for cookies and challenge tokens. Every edge serving the same
--- hosts must derive the same key, or a visitor moving between edges is
--- challenged again. Order: settings.bot_defense.secret, then a key derived
--- from env_vars.JWT_SECURITY_PASSPHRASE (already shared by the edges of one
--- environment), then a random per-host key kept in the shared dict.
local function derive_secret(cfg, settings, dict)
    if cfg.secret then return cfg.secret, "settings" end
    local pass = type(settings.env_vars) == "table" and settings.env_vars.JWT_SECURITY_PASSPHRASE
    if type(pass) == "string" and pass ~= "" then
        return ngx.hmac_sha1(pass, "wslproxy-bot-defense-v1"), "derived"
    end
    if dict then
        dict:add("secret", Session.random_id(24))
        local s = dict:get("secret")
        if s then return s, "random" end
    end
    return Session.random_id(24), "worker"
end

--- (Re)load settings.bot_defense. A missing or unreadable file keeps the
--- current config; a bad block falls back to defaults with warnings.
function M.reload()
    local settings, err = read_settings()
    if not settings then
        if not state then settings = {} else return false, err end
    end
    local raw = settings.bot_defense
    local pass = type(settings.env_vars) == "table" and settings.env_vars.JWT_SECURITY_PASSPHRASE
    -- The passphrase feeds the derived key, so a rotation must rebuild it.
    local fp = canonical(raw) .. "|" .. (type(pass) == "string" and ngx.md5(pass) or "-")
    if state and state.fingerprint == fp then return true end

    local cfg, warns = Config.normalize_global(raw)
    for _, w in ipairs(warns) do ngx.log(ngx.WARN, "[bot_defense] ", w) end

    local dict = ngx.shared and ngx.shared[cfg.dict] or nil
    if not dict then
        log_limited(ngx.WARN, "nodict", 3600, "lua_shared_dict ", cfg.dict,
            " missing: behaviour signals, crawler caching and replay protection are off")
    end

    local specs = {}
    for _, c in ipairs(cfg.datacenter_cidrs) do specs[#specs + 1] = c end
    if cfg.datacenter_file then
        local path = cfg.datacenter_file
        if path:sub(1, 1) ~= "/" then path = (os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/") .. path end
        local lines, ferr = Datacenter.read_file(path)
        if lines then
            for _, l in ipairs(lines) do specs[#specs + 1] = l end
        else
            log_limited(ngx.WARN, "dcfile", 3600, "datacenter_file ", path, " unreadable: ", tostring(ferr))
        end
    end
    local dc, accepted, rejected = Datacenter.build(specs)
    if rejected > 0 then
        ngx.log(ngx.WARN, "[bot_defense] ignored ", rejected, " invalid datacenter CIDR(s)")
    end

    local secret, source = derive_secret(cfg, settings, dict)
    if source == "random" or source == "worker" then
        log_limited(ngx.WARN, "secret", 3600, "no settings.bot_defense.secret or JWT passphrase:",
            " using a ", source == "random" and "per-host" or "per-worker",
            " random key, so sessions do not carry across ", source == "random" and "edges" or "workers")
    end

    state = {
        cfg = cfg,
        secret = secret,
        dict = dict,
        datacenter = accepted > 0 and dc or nil,
        fingerprint = fp,
    }
    register_metrics()
    return true
end

local function current()
    if not state then pcall(M.reload) end
    return state
end

-- ─── verdict ────────────────────────────────────────────────────────────────

local function ivt_of(cfg_signals)
    local ivt = "none"
    for _, code in ipairs(cfg_signals) do
        local s = Config.SIGNALS[code]
        if s and s.ivt == "sivt" then return "sivt" end
        if s and s.ivt == "givt" then ivt = "givt" end
    end
    return ivt
end
M.ivt_of = ivt_of

--- Score a signal list.
function M.score(weights, codes)
    local score = 0
    for _, c in ipairs(codes) do score = score + (weights[c] or 0) end
    if score > 100 then score = 100 end
    return score
end

--- Class and action for a score under a policy. Pure.
--- @return string class, string action
function M.decide(policy, score, opts)
    opts = opts or {}
    if opts.verified and policy.allow_verified_bots then return "verified_bot", "allow" end
    local class = "human"
    if score >= policy.block_at then class = "bot"
    elseif score >= policy.challenge_at then class = "suspect" end

    if policy.mode == "monitor" or opts.monitored then return class, "allow" end
    if class == "bot" then return class, "block" end
    if class == "suspect" then return class, policy.mode == "block" and "block" or "challenge" end
    if opts.challenge_path and not opts.passed then return class, "challenge" end
    return class, "allow"
end

local function cookie_header(cfg, value, ttl)
    return cfg.cookie_name .. "=" .. value .. "; Path=/; Max-Age=" .. math.floor(ttl)
        .. "; HttpOnly; SameSite=Lax" .. (ngx.var.scheme == "https" and "; Secure" or "")
end

local function access_inner(st, policy, server)
    local cfg = st.cfg
    local var = ngx.var

    -- Spoof guard first, on every request to an enabled server: the origin
    -- may trust these, so a client must never be able to set them.
    for _, h in ipairs(M.FORWARD_HEADERS) do ngx.req.clear_header(h) end

    local uri = var.uri or "/"
    if Config.in_paths(uri, ALWAYS_SKIP) or Config.in_paths(uri, policy.skip_paths) then return end

    local now = ngx.now()
    local method = ngx.req.get_method()
    local ip = var.remote_addr or ""
    local ua = var.http_user_agent
    local ipk = Session.ip_key(ip, cfg.ip_binding)
    local sess = Session.parse(st.secret, var["cookie_" .. cfg.cookie_name], now, ipk, ua or "")

    local function issue(passed_until)
        return cookie_header(cfg, Session.issue(st.secret, sess and sess.vid or Session.random_id(),
            now, cfg.session_ttl_s, passed_until, ipk, ua or ""), cfg.session_ttl_s)
    end

    if uri == cfg.verify_path and method == "POST" then
        return Challenge.verify(st, ipk, ua or "", now, issue)
    end

    -- 1. fingerprint
    local fp, info = Signals.evaluate({
        ua = ua,
        accept = var.http_accept,
        accept_language = var.http_accept_language,
        accept_encoding = var.http_accept_encoding,
        sec_ch_ua = var.http_sec_ch_ua,
        sec_fetch_mode = var.http_sec_fetch_mode,
        scheme = var.scheme,
        http_version = ngx.req.http_version and ngx.req.http_version() or nil,
    })

    -- 2. identity: claimed crawler, data-centre IP
    local verified = false
    if info.crawler then
        local verdict = "unknown"
        if st.dict then
            -- Without the dict every crawler request would cost a DNS round
            -- trip; then the claim is simply not trusted.
            verdict = Crawlers.verify(info.crawler, ip, st.dict, cfg)
        end
        metric("crawlers", 1, { verdict })
        if verdict == "verified" then verified = true
        elseif verdict == "fake" then fp[#fp + 1] = "BD_FAKE_CRAWLER"
        else fp[#fp + 1] = "BD_UA_DECLARED_BOT" end
    end
    if st.datacenter and Datacenter.contains(st.datacenter, ip) then fp[#fp + 1] = "BD_DATACENTER" end

    -- 3. behaviour
    local ipua = ngx.md5(ip .. "|" .. (ua or "")):sub(1, 16)
    local vk = sess and ("s" .. sess.vid) or ("c" .. ipua)
    local is_nav = Signals.is_navigation(method, var.http_accept, uri)
    local behaviour = {}
    if st.dict then
        behaviour = Behaviour.observe(st.dict, now, {
            ip = ip, vk = vk, ipua = ipua, uri = uri,
            is_login = method == "POST" and Config.in_paths(uri, policy.login_paths),
            is_navigation = is_nav,
            is_asset = Signals.is_asset(uri),
            has_cookie = sess ~= nil,
        }, policy.limits)
    end

    -- 4. score. A solved challenge proves a real browser ran our script, so
    -- the fingerprint is waived — but behaviour still counts: a farm that
    -- solves the challenge and then hammers the login is still a bot.
    local passed = sess and sess.passed or false
    local codes = {}
    if not passed then
        for _, c in ipairs(fp) do codes[#codes + 1] = c end
    end
    for _, c in ipairs(behaviour) do codes[#codes + 1] = c end
    local score = M.score(cfg.weights, codes)

    -- Plain HTTP to a force-HTTPS server only ever gets a 301 from
    -- gateway_resp.lua (same condition): score it, never act on it, and leave
    -- the challenge and the cookie to the HTTPS request that follows.
    local redirect_only = server.ssl_enabled == true and server.ssl_force_https == true
        and var.server_port == "80"

    local class, action = M.decide(policy, score, {
        verified = verified,
        passed = passed,
        monitored = redirect_only or Config.in_paths(uri, policy.monitor_paths),
        challenge_path = Config.in_paths(uri, policy.challenge_paths),
    })
    if class == "verified_bot" then score = 0 end
    local ivt = class == "verified_bot" and "givt" or ivt_of(codes)
    if passed and ivt == "givt" then ivt = "none" end -- e.g. a person on a hosting VPN who solved it

    ngx.ctx.bot_defense = {
        class = class, ivt = ivt, score = score, action = action, codes = codes,
        ip = ip, vk = vk, host = server.server_name, uri = uri, ua = ua,
    }

    -- 5. tell the origin, optionally the client, then act
    local signals_csv = table.concat(codes, ",")
    if policy.forward_headers then
        ngx.req.set_header("X-WSL-Bot-Class", class)
        ngx.req.set_header("X-WSL-Bot-Score", tostring(score))
        ngx.req.set_header("X-WSL-Bot-IVT", ivt)
        ngx.req.set_header("X-WSL-Bot-Signals", signals_csv)
    end
    if policy.response_headers then
        ngx.header["X-WSL-Bot-Class"] = class
        ngx.header["X-WSL-Bot-Score"] = tostring(score)
        ngx.header["X-WSL-Bot-IVT"] = ivt
        ngx.header["X-WSL-Bot-Signals"] = signals_csv ~= "" and signals_csv or "none"
        ngx.header["X-WSL-Bot-Action"] = action
    end

    if action == "block" then return Challenge.block(is_nav) end
    if action == "challenge" then return Challenge.serve(st, ipk, ua or "", now, is_nav) end

    -- A client without a valid session gets one: it is how a returning
    -- browser is recognised, and how a script that drops it is spotted.
    if not sess and not redirect_only then require("helpers").appendSetCookie(issue(0)) end
end

--- rewrite phase, from gateway_ack.lua. May end the request.
function M.access(server)
    local raw = server and server.bot_defense
    if type(raw) ~= "table" then return end -- fast path: feature unused
    local policy = Config.normalize_server(raw)
    if not policy then return end
    local st = current()
    if not st then return end
    local ok, err = pcall(access_inner, st, policy, server)
    if not ok then
        metric("errors", 1, { "access" })
        log_limited(ngx.ERR, "access", 60, "request handling failed, failing open: ", tostring(err))
        if ngx.headers_sent then return ngx.exit(ngx.status) end
    end
end

-- ─── log phase ──────────────────────────────────────────────────────────────

local function log_inner(st, c)
    if c.challenge_result then
        metric("challenges", 1, { c.challenge_result })
        return
    end
    if not c.class then return end
    local own = c.action ~= "allow"
    if st.dict and not own then
        Behaviour.record_response(st.dict, ngx.now(), c.ip, ngx.status)
    end
    metric("requests", 1, { c.class, c.ivt, c.action })
    for _, code in ipairs(c.codes) do metric("signals", 1, { code }) end

    -- One structured line per suspicious visitor per minute: enough to
    -- investigate, bounded under attack.
    if c.class ~= "human" and c.class ~= "verified_bot"
        and (not st.dict or st.dict:add("lg:" .. c.vk, true, 60)) then
        ngx.log(ngx.NOTICE, "botdef ", (Cjson or require("cjson")).encode({
            host = c.host, ip = c.ip, uri = c.uri, ua = c.ua and c.ua:sub(1, 200),
            class = c.class, ivt = c.ivt, score = c.score, action = c.action,
            signals = table.concat(c.codes, ","), status = ngx.status,
            support_id = ngx.var.request_id,
        }))
    end
end

function M.log()
    local c = ngx.ctx.bot_defense
    if not c then return end
    local st = state
    if not st then return end
    local ok, err = pcall(log_inner, st, c)
    if not ok then
        metric("errors", 1, { "log" })
        log_limited(ngx.ERR, "log", 60, "log phase failed: ", tostring(err))
    end
end

-- ─── init ───────────────────────────────────────────────────────────────────

--- init_worker: load settings now and re-read them every reload_interval_s.
function M.init()
    local ok, err = pcall(function()
        register_metrics()
        M.reload()
        local interval = state and state.cfg.reload_interval_s or 30
        local okt, terr = ngx.timer.every(interval, function(premature)
            if premature then return end
            local rok, rerr = pcall(M.reload)
            if not rok then log_limited(ngx.ERR, "reload", 300, "settings reload failed: ", tostring(rerr)) end
        end)
        if not okt then ngx.log(ngx.ERR, "[bot_defense] cannot start the reload timer: ", tostring(terr)) end
    end)
    if not ok then ngx.log(ngx.ERR, "[bot_defense] init failed: ", tostring(err)) end
end

-- ─── test hooks ─────────────────────────────────────────────────────────────

function M._reset()
    state, metrics = nil, nil
    log_marks, log_marks_n = {}, 0
end
function M._state() return state end

return M
