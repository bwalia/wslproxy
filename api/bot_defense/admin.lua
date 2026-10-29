-- api/bot_defense/admin.lua
-- Admin API for Bot Management (dashboard: Bot Management section).
--
--   GET  /api/bot_defense/overview         engine status, every server's mode,
--                                          last-24h counters per class/action/IVT/host
--   GET  /api/bot_defense/events           recent decisions + challenge results
--                                          (?limit= &host= &class= &action= &type=)
--   GET  /api/bot_defense/settings         edge settings: the admin overlay,
--                                          the effective values, the signal catalogue
--   PUT  /api/bot_defense/settings         save the overlay (data/bot_defense/settings.json)
--   PUT  /api/bot_defense/servers/<id>     set one server's bot_defense
--   POST /api/bot_defense/evaluate         score a described request (read-only)
--
-- Writes go through api.lua's mutation gate. Server changes save only the
-- bot_defense field, through the same Repo path the server editor uses (the
-- record round-trips exactly as stored), with a version snapshot and an
-- audit entry. Responses are { data = ... } or { error, errors }.

local Config = require("bot_defense.config")
local Datacenter = require("bot_defense.datacenter")
local Bot = require("bot_defense")

local M = {}

local cjson = Cjson or require("cjson")
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

local function respond(status, body)
    ngx.status = status
    ngx.header["Content-Type"] = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.say(cjson.encode(body))
    return ngx.exit(ngx.HTTP_OK)
end

local function fail(status, message, errors)
    return respond(status, { error = message, errors = errors })
end

-- From the query string for every method: api.lua hands PUT/POST handlers
-- the body, and the UI sends ?envprofile= on all of them. Absent means prod;
-- malformed is refused, so a typo never lands on prod.
local function env_of()
    local args = ngx.req.get_uri_args()
    local e = args.envprofile or args.envProfile
    if e == nil or e == "" then return "prod" end
    if type(e) == "string" and e:match("^[%w_%-]+$") then return e end
    return fail(400, "envprofile must be letters, digits, '-' or '_'")
end

local function user()
    local h = ngx.req.get_headers()
    local u = h["x-user"] or h["x-user-email"]
    if type(u) == "table" then u = u[1] end
    return (type(u) == "string" and u ~= "") and u or "admin"
end

local function body()
    ngx.req.read_body()
    local raw = ngx.req.get_body_data()
    if not raw then
        local path = ngx.req.get_body_file()
        local f = path and io.open(path, "rb")
        if f then
            raw = f:read("*a")
            f:close()
        end
    end
    local ok, decoded = pcall(cjson.decode, raw or "")
    if not ok or type(decoded) ~= "table" then return nil end
    return decoded
end

local function as_array(t)
    t = t or {}
    if cjson.array_mt then setmetatable(t, cjson.array_mt) end
    return t
end

local function audit(action, resource_type, resource_name, details)
    local ok, Audit = pcall(require, "audit_logger")
    if ok and Audit and Audit.log then
        pcall(Audit.log, action, user(), resource_type, resource_name, details)
    end
end

-- ─── servers ────────────────────────────────────────────────────────────────

local function summary(rec)
    local raw = type(rec.bot_defense) == "table" and rec.bot_defense or nil
    local p = raw and Config.normalize_server(raw)
    return {
        id = rec.id,
        server_name = rec.server_name,
        configured = raw ~= nil,
        mode = p and p.mode or "off",
        challenge_at = p and p.challenge_at or Config.DEFAULT_THRESHOLDS.challenge,
        block_at = p and p.block_at or Config.DEFAULT_THRESHOLDS.block,
        challenge_paths = #(p and p.challenge_paths or {}),
        login_paths = #(p and p.login_paths or {}),
        monitor_paths = #(p and p.monitor_paths or {}),
        skip_paths = #(p and p.skip_paths or {}),
        response_headers = p and p.response_headers or false,
        forward_headers = p == nil or p.forward_headers,
        bot_defense = raw,
    }
end

local function all_servers(env)
    local Repo = require("repo")
    local records = Repo.scan("servers", env) or {}
    local out = {}
    for _, rec in ipairs(records) do
        if type(rec) == "table" and rec.id then out[#out + 1] = summary(rec) end
    end
    local rank = { block = 0, challenge = 1, monitor = 2, off = 3 }
    table.sort(out, function(a, b)
        if rank[a.mode] ~= rank[b.mode] then return rank[a.mode] < rank[b.mode] end
        return tostring(a.server_name) < tostring(b.server_name)
    end)
    return out
end

local function get_overview(args)
    local servers = all_servers(env_of())
    local protected = {}
    local by_mode = { off = 0, monitor = 0, challenge = 0, block = 0 }
    for _, s in ipairs(servers) do
        by_mode[s.mode] = (by_mode[s.mode] or 0) + 1
        if s.mode ~= "off" then protected[#protected + 1] = s.server_name end
    end
    return respond(200, { data = {
        engine = Bot.status(),
        servers = as_array(servers),
        servers_by_mode = by_mode,
        stats = Bot.stats(tonumber(args.hours) or 24, protected),
    } })
end

local function put_server(id, args)
    local env = env_of()
    local req = body()
    if not req then return fail(400, "Invalid JSON body") end
    -- Accept { bot_defense = {...} } or the object itself.
    local bd = req.bot_defense ~= nil and req.bot_defense or req
    if bd == cjson.null then bd = nil end
    local errors = Config.validate_server(bd)
    if #errors > 0 then return fail(422, "Invalid Bot Defense policy", errors) end

    local Repo = require("repo")
    local rec = Repo.get("servers", env, id)
    if type(rec) ~= "table" then return fail(404, "Server " .. tostring(id) .. " not found in " .. env) end
    local before = rec.bot_defense
    rec.bot_defense = bd
    rec.updated_at = ngx.time()
    -- Exactly as stored: no strip, no re-encoding (the record's `config` is
    -- already encoded on disk).
    local ok, err = Repo.save("servers", env, id, rec, { skip_strip = true, encode_sensitive = false })
    if not ok then return fail(500, "Save failed: " .. tostring(err)) end

    local okv, VersionManager = pcall(require, "version_manager")
    if okv and VersionManager.snapshot_live then
        pcall(VersionManager.snapshot_live, "servers", env, id, rec, user(),
            "Bot Defense: " .. ((type(bd) == "table" and bd.mode) or "off"))
    end
    audit("update", "servers", id, {
        field = "bot_defense",
        from = type(before) == "table" and before.mode or "off",
        to = type(bd) == "table" and bd.mode or "off",
        via = "bot_management",
    })
    return respond(200, { data = summary(rec) })
end

-- ─── events / settings ──────────────────────────────────────────────────────

local function get_events(args)
    local events = Bot.events({
        limit = args.limit, host = args.host, class = args.class,
        action = args.action, type = args.type,
    })
    return respond(200, { data = as_array(events), total = #events })
end

local function get_settings()
    local cfg, signals = Bot.effective()
    local overlay = Bot.read_overlay() or {}
    return respond(200, { data = {
        overlay = overlay,
        effective = {
            pow_difficulty = cfg.pow_difficulty,
            challenge_ttl_s = cfg.challenge_ttl_s,
            passed_ttl_s = cfg.passed_ttl_s,
            session_ttl_s = cfg.session_ttl_s,
            ip_binding = cfg.ip_binding,
            dns_timeout_ms = cfg.dns_timeout_ms,
            dns_nameservers = as_array(cfg.dns_nameservers),
            datacenter_cidrs = #cfg.datacenter_cidrs,
            datacenter_file = cfg.datacenter_file,
        },
        signals = as_array(signals),
        editable = as_array((function()
            local keys = {}
            for k in pairs(Config.OVERLAY_KEYS) do keys[#keys + 1] = k end
            table.sort(keys)
            return keys
        end)()),
        file = "data/bot_defense/settings.json",
        engine = Bot.status(),
    } })
end

local function write_atomic(path, content)
    -- One level under data/, which exists; no shell from a worker.
    local dir = path:match("^(.*)/[^/]+$")
    local lfs = LFS or require("lfs")
    if not lfs.attributes(dir, "mode") then
        local ok, merr = lfs.mkdir(dir)
        if not ok then return nil, "cannot create " .. dir .. ": " .. tostring(merr) end
    end
    local tmp = path .. ".tmp." .. tostring(ngx.worker.pid())
    local f, err = io.open(tmp, "wb")
    if not f then return nil, err end
    f:write(content)
    f:close()
    local ok, rerr = os.rename(tmp, path)
    if not ok then
        os.remove(tmp)
        return nil, rerr
    end
    return true
end

local function put_settings()
    local req = body()
    if not req then return fail(400, "Invalid JSON body") end
    local clean, errors = Config.validate_overlay(req)
    if not clean then return fail(422, "Invalid Bot Defense settings", errors) end
    if clean.datacenter_cidrs and #clean.datacenter_cidrs > 0 then
        local _, _, rejected = Datacenter.build(clean.datacenter_cidrs)
        if rejected > 0 then
            return fail(422, "Invalid Bot Defense settings",
                { { field = "datacenter_cidrs", message = rejected .. " entr" .. (rejected == 1 and "y is" or "ies are")
                    .. " not a valid CIDR" } })
        end
    end
    for _, k in ipairs({ "datacenter_cidrs", "dns_nameservers" }) do
        if clean[k] then as_array(clean[k]) end
    end
    local ok, err = write_atomic(Bot.overlay_file, cjson.encode(clean))
    if not ok then return fail(500, "Could not write " .. Bot.overlay_file .. ": " .. tostring(err)) end
    audit("update", "bot_defense", "settings", { keys = (function()
        local k = {}
        for key in pairs(clean) do k[#k + 1] = key end
        table.sort(k)
        return table.concat(k, ",")
    end)() })
    -- This worker applies it now; the others within reload_interval_s.
    pcall(Bot.reload)
    return get_settings()
end

-- ─── simulator ──────────────────────────────────────────────────────────────

local function post_evaluate(args)
    local req = body()
    if not req then return fail(400, "Invalid JSON body") end
    local h = type(req.headers) == "table" and req.headers or {}
    local function hv(name)
        for k, v in pairs(h) do
            if type(k) == "string" and k:lower() == name and type(v) == "string" and v ~= "" then return v end
        end
        return nil
    end
    local ip = type(req.ip) == "string" and req.ip ~= "" and req.ip or "203.0.113.10"
    if not ip:match("^[%x%.:]+$") then return fail(422, "ip must be an IPv4 or IPv6 address") end
    local path = type(req.path) == "string" and req.path:sub(1, 1) == "/" and req.path or "/"

    local policy_raw, server_note
    if type(req.host) == "string" and req.host ~= "" then
        local rec = require("repo").get("servers", env_of(), "host:" .. req.host)
        if type(rec) ~= "table" then return fail(404, "No server " .. req.host) end
        policy_raw = type(rec.bot_defense) == "table" and rec.bot_defense or { mode = "off" }
        server_note = req.host
    end
    if policy_raw and policy_raw.mode == "off" then
        return respond(200, { data = { action = "off", server = server_note,
            response = "proxied to the origin — Bot Defense is off for this server", signals = as_array({}) } })
    end

    local result, err = Bot.simulate({
        method = type(req.method) == "string" and req.method:upper() or "GET",
        path = path:gsub("%?.*$", ""),
        scheme = req.scheme == "http" and "http" or "https",
        ip = ip,
        ua = hv("user-agent"),
        accept = hv("accept"),
        accept_language = hv("accept-language"),
        accept_encoding = hv("accept-encoding"),
        sec_ch_ua = hv("sec-ch-ua"),
        sec_fetch_mode = hv("sec-fetch-mode"),
        http_version = tonumber(req.http_version) or 2.0,
    }, policy_raw)
    if not result then return fail(503, err) end
    result.server = server_note
    result.signals = as_array(result.signals)
    return respond(200, { data = result })
end

-- ─── routing (called from api.lua) ──────────────────────────────────────────

function M.handle_get(path, args)
    if path == "bot_defense/overview" then return get_overview(args or {}) end
    if path == "bot_defense/events" then return get_events(args or {}) end
    if path == "bot_defense/settings" then return get_settings() end
    return fail(404, "Unknown Bot Defense endpoint")
end

function M.handle_post(path, args)
    if path == "bot_defense/evaluate" then return post_evaluate(args or {}) end
    return fail(404, "Unknown Bot Defense endpoint")
end

--- @param allowed boolean api.lua's mutation gate
function M.handle_put(path, args, allowed)
    if not allowed then return fail(403, "Changes are not allowed on this instance") end
    if path == "bot_defense/settings" then return put_settings() end
    local id = path:match("^bot_defense/servers/(.+)$")
    if id then return put_server(ngx.unescape_uri(id), args or {}) end
    return fail(404, "Unknown Bot Defense endpoint")
end

return M
