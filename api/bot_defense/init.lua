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
-- Edge-wide tuning saved from the admin UI (Bot Management → Settings), laid
-- over settings.json "bot_defense". Kept apart because deploys rewrite
-- settings.json from SOPS; only bot_defense.config.OVERLAY_KEYS live here.
M.overlay_file = (os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/") .. "data/bot_defense/settings.json"

-- Admin event feed and counters (Bot Management → Overview / Events).
local EVENT_SLOTS = 500
local STATS_TTL = 26 * 3600

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

--- The admin-saved overlay, or nil. A missing file is normal; a corrupt one
--- is ignored with a warning (the admin API writes it atomically, so this
--- means someone edited it by hand).
function M.read_overlay()
    local f = io.open(M.overlay_file, "rb")
    if not f then return nil end
    local raw = f:read("*a")
    f:close()
    local ok, decoded = pcall((Cjson or require("cjson")).decode, raw or "")
    if not ok or type(decoded) ~= "table" then
        log_limited(ngx.WARN, "overlay", 300, M.overlay_file, " is not valid JSON; ignoring it")
        return nil
    end
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
    local overlay = M.read_overlay()
    if overlay then
        local merged = {}
        if type(raw) == "table" then
            for k, v in pairs(raw) do merged[k] = v end
        end
        for k, v in pairs(overlay) do
            if Config.OVERLAY_KEYS[k] then merged[k] = v end
        end
        raw = merged
    end
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
        -- For the admin overview: never the secret itself.
        secret_source = source,
        datacenter_accepted = accepted,
        datacenter_rejected = rejected,
        overlay_active = overlay ~= nil,
        loaded_at = ngx.now(),
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

--- Steps 1 and 2 — fingerprint and identity — shared by live traffic and the
--- admin simulator, so the simulator scores exactly as the gateway does.
--- @return table codes, table info (from Signals.evaluate + crawler_verdict), boolean verified
local function assess(st, r, ip)
    local fp, info = Signals.evaluate(r)
    local verified = false
    if info.crawler then
        local verdict = "unknown"
        if st.dict then
            -- Without the dict every crawler request would cost a DNS round
            -- trip; then the claim is simply not trusted.
            verdict = Crawlers.verify(info.crawler, ip, st.dict, st.cfg)
        end
        info.crawler_verdict = verdict
        metric("crawlers", 1, { verdict })
        if verdict == "verified" then verified = true
        elseif verdict == "fake" then fp[#fp + 1] = "BD_FAKE_CRAWLER"
        else fp[#fp + 1] = "BD_UA_DECLARED_BOT" end
    end
    if st.datacenter and Datacenter.contains(st.datacenter, ip) then fp[#fp + 1] = "BD_DATACENTER" end
    return fp, info, verified
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
        -- Challenge.verify adds the outcome; the log phase records both.
        ngx.ctx.bot_defense = { host = server.server_name, ip = ip, ua = ua, uri = uri }
        return Challenge.verify(st, ipk, ua or "", now, issue)
    end

    -- 1 + 2. fingerprint and identity
    local fp, _, verified = assess(st, {
        ua = ua,
        accept = var.http_accept,
        accept_language = var.http_accept_language,
        accept_encoding = var.http_accept_encoding,
        sec_ch_ua = var.http_sec_ch_ua,
        sec_fetch_mode = var.http_sec_fetch_mode,
        scheme = var.scheme,
        http_version = ngx.req.http_version and ngx.req.http_version() or nil,
    }, ip)

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

--- Append to the admin event feed: a ring of EVENT_SLOTS entries in the
--- shared dict (one sequence counter, one key per slot), so it is bounded
--- whatever the traffic and shared by every worker.
local function record_event(dict, ev)
    local seq = dict:incr("ev:seq", 1, 0)
    if not seq then return end
    ev.seq = seq
    dict:set("ev:" .. (seq % EVENT_SLOTS), (Cjson or require("cjson")).encode(ev), 86400)
end

--- Hourly counters for the overview (kept 26 h).
local function count(dict, key)
    dict:incr(key, 1, 0, STATS_TTL)
end

local function log_inner(st, c)
    local dict = st.dict
    local hour = math.floor(ngx.now() / 3600)
    if c.challenge_result then
        metric("challenges", 1, { c.challenge_result })
        if dict then
            count(dict, "sc:" .. hour .. ":" .. c.challenge_result)
            record_event(dict, {
                ts = ngx.now(), type = "challenge", result = c.challenge_result,
                host = c.host, ip = c.ip, ua = c.ua and c.ua:sub(1, 200), support_id = ngx.var.request_id,
            })
        end
        return
    end
    if not c.class then return end
    local own = c.action ~= "allow"
    if dict and not own then
        Behaviour.record_response(dict, ngx.now(), c.ip, ngx.status)
    end
    metric("requests", 1, { c.class, c.ivt, c.action })
    for _, code in ipairs(c.codes) do metric("signals", 1, { code }) end
    if dict then
        count(dict, "st:" .. hour .. ":" .. c.class .. ":" .. c.action)
        count(dict, "si:" .. hour .. ":" .. c.ivt)
        count(dict, "sh:" .. hour .. ":" .. tostring(c.host) .. ":" .. c.class)
    end

    -- One structured line and one feed entry per suspicious visitor (and per
    -- action) per minute: enough to investigate, bounded under attack.
    local notable = (c.class ~= "human" and c.class ~= "verified_bot") or own
    if notable and (not dict or dict:add("lg:" .. c.vk .. ":" .. c.action, true, 60)) then
        local ev = {
            ts = ngx.now(), type = "decision",
            host = c.host, ip = c.ip, method = ngx.req.get_method(), uri = c.uri,
            ua = c.ua and c.ua:sub(1, 200),
            class = c.class, ivt = c.ivt, score = c.score, action = c.action,
            signals = table.concat(c.codes, ","), status = ngx.status,
            support_id = ngx.var.request_id,
        }
        ngx.log(ngx.NOTICE, "botdef ", (Cjson or require("cjson")).encode(ev))
        if dict then record_event(dict, ev) end
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

-- ─── admin reads (bot_defense/admin.lua) ────────────────────────────────────

--- Engine status for the overview. Never includes the secret.
function M.status()
    local st = current()
    if not st then return { loaded = false } end
    local cfg = st.cfg
    local dict = st.dict
    return {
        loaded = true,
        loaded_at = st.loaded_at,
        dict = cfg.dict,
        dict_ok = dict ~= nil,
        dict_free_bytes = dict and dict.free_space and dict:free_space() or nil,
        secret_source = st.secret_source,
        overlay_active = st.overlay_active,
        datacenter_ranges = st.datacenter_accepted,
        datacenter_rejected = st.datacenter_rejected,
        pow_difficulty = cfg.pow_difficulty,
        challenge_ttl_s = cfg.challenge_ttl_s,
        passed_ttl_s = cfg.passed_ttl_s,
        session_ttl_s = cfg.session_ttl_s,
        ip_binding = cfg.ip_binding,
        cookie_name = cfg.cookie_name,
        verify_path = cfg.verify_path,
        reload_interval_s = cfg.reload_interval_s,
        dns_nameservers = Crawlers.nameservers(cfg),
    }
end

--- The effective edge configuration and the signal catalogue.
function M.effective()
    local st = current()
    local cfg = st and st.cfg or Config.normalize_global(nil)
    local signals = {}
    for code, s in pairs(Config.SIGNALS) do
        signals[#signals + 1] = {
            code = code, kind = s.kind, ivt = s.ivt, what = s.what,
            default_weight = s.weight, weight = cfg.weights[code] or s.weight,
        }
    end
    table.sort(signals, function(a, b)
        if a.kind ~= b.kind then return a.kind < b.kind end
        return a.code < b.code
    end)
    return cfg, signals
end

--- Recent events, newest first.
--- @param f table { limit, host, class, action, type }
function M.events(f)
    f = f or {}
    local st = current()
    local dict = st and st.dict
    local out = {}
    if not dict then return out end
    local cjson = Cjson or require("cjson")
    local limit = math.max(1, math.min(EVENT_SLOTS, tonumber(f.limit) or 200))
    local seq = dict:get("ev:seq") or 0
    for i = seq, math.max(1, seq - EVENT_SLOTS + 1), -1 do
        local raw = dict:get("ev:" .. (i % EVENT_SLOTS))
        local ok, ev = pcall(cjson.decode, raw or "")
        -- A slot can hold a newer event than `i` if it was overwritten
        -- while we read; the sequence number tells.
        if ok and type(ev) == "table" and ev.seq == i
            and (not f.host or f.host == "" or ev.host == f.host)
            and (not f.class or f.class == "" or ev.class == f.class)
            and (not f.action or f.action == "" or ev.action == f.action)
            and (not f.type or f.type == "" or ev.type == f.type) then
            out[#out + 1] = ev
            if #out >= limit then break end
        end
    end
    return out
end

local CLASSES = { "human", "suspect", "bot", "verified_bot" }
local ACTIONS = { "allow", "challenge", "block" }
local IVTS = { "none", "givt", "sivt" }
local CHALLENGE_RESULTS = { "passed", "insufficient_work", "rebound", "replay", "webdriver",
    "expired", "bad_token", "bad_request" }

--- Counters for the last `hours` hours, oldest first, plus totals and a
--- per-host breakdown for `hosts`.
function M.stats(hours, hosts)
    hours = math.max(1, math.min(24, tonumber(hours) or 24))
    local st = current()
    local dict = st and st.dict
    local now_h = math.floor(ngx.now() / 3600)
    local result = { hourly = {}, totals = { class = {}, action = {}, ivt = {}, challenge = {} }, hosts = {} }
    if not dict then return result end
    local t = result.totals
    for h = now_h - hours + 1, now_h do
        local row = { hour = h * 3600, class = {}, action = {}, ivt = {} }
        for _, cl in ipairs(CLASSES) do
            for _, ac in ipairs(ACTIONS) do
                local n = dict:get("st:" .. h .. ":" .. cl .. ":" .. ac) or 0
                row.class[cl] = (row.class[cl] or 0) + n
                row.action[ac] = (row.action[ac] or 0) + n
            end
        end
        for _, iv in ipairs(IVTS) do row.ivt[iv] = dict:get("si:" .. h .. ":" .. iv) or 0 end
        for k, v in pairs(row.class) do t.class[k] = (t.class[k] or 0) + v end
        for k, v in pairs(row.action) do t.action[k] = (t.action[k] or 0) + v end
        for k, v in pairs(row.ivt) do t.ivt[k] = (t.ivt[k] or 0) + v end
        for _, r in ipairs(CHALLENGE_RESULTS) do
            t.challenge[r] = (t.challenge[r] or 0) + (dict:get("sc:" .. h .. ":" .. r) or 0)
        end
        result.hourly[#result.hourly + 1] = row
    end
    for _, host in ipairs(hosts or {}) do
        local per = {}
        for h = now_h - hours + 1, now_h do
            for _, cl in ipairs(CLASSES) do
                per[cl] = (per[cl] or 0) + (dict:get("sh:" .. h .. ":" .. host .. ":" .. cl) or 0)
            end
        end
        result.hosts[host] = per
    end
    return result
end

--- Score a described request the way the gateway would, without sending
--- traffic or touching behaviour counters (fingerprint + identity only).
--- @param req table { method, path, scheme, ip, ua, accept, accept_language,
---                     accept_encoding, sec_ch_ua, sec_fetch_mode, http_version }
--- @param policy_raw table|nil the server's bot_defense (nil: challenge defaults)
function M.simulate(req, policy_raw)
    local st = current()
    if not st then return nil, "Bot Defense is not loaded on this edge" end
    local policy = Config.normalize_server(policy_raw or { mode = "challenge" })
        or Config.normalize_server({ mode = "monitor" })
    local codes, info, verified = assess(st, req, req.ip or "")
    local score = M.score(st.cfg.weights, codes)
    local path = req.path or "/"
    local class, action = M.decide(policy, score, {
        verified = verified,
        monitored = Config.in_paths(path, policy.monitor_paths),
        challenge_path = Config.in_paths(path, policy.challenge_paths),
    })
    if class == "verified_bot" then score = 0 end
    local skipped = Config.in_paths(path, ALWAYS_SKIP) or Config.in_paths(path, policy.skip_paths)
    local detail = {}
    for _, code in ipairs(codes) do
        local s = Config.SIGNALS[code] or {}
        detail[#detail + 1] = { code = code, weight = st.cfg.weights[code] or 0, ivt = s.ivt, kind = s.kind, what = s.what }
    end
    local nav = Signals.is_navigation(req.method or "GET", req.accept, path)
    return {
        signals = detail,
        score = score,
        class = class,
        ivt = class == "verified_bot" and "givt" or ivt_of(codes),
        action = skipped and "skip" or action,
        mode = policy_raw and policy.mode or "challenge (default policy)",
        thresholds = { challenge = policy.challenge_at, block = policy.block_at },
        crawler = info.crawler and info.crawler.name or nil,
        crawler_verdict = info.crawler_verdict,
        browser = info.browser, browser_major = info.major, tool = info.tool,
        response = (skipped and "not seen by Bot Defense (skip path)")
            or (action == "block" and (nav and "403 block page" or "403 JSON automated_traffic_blocked"))
            or (action == "challenge" and (nav and "403 browser check" or "403 JSON bot_challenge_required"))
            or "proxied to the origin",
        note = "Fingerprint and identity only. Behaviour signals (bursts, scraping, login velocity, "
            .. "cookie dropping) need real traffic over time and can add to this score.",
    }
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
