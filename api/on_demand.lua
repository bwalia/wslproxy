-- on_demand.lua
--[[
    On-demand hosts: serve, and get certificates for, hosts that have no
    server here, when an outside service vouches for them.

    A server opts in with `on_demand_ask_url`. A request or TLS handshake for
    a host with no server of its own asks each such URL:

        GET <on_demand_ask_url>?domain=<host>      200 = "yes, serve it as you"

    A yes routes the host with that server's rules and settings (upstream
    Host = its proxy_server_name, else its server_name; the client's host
    goes along as X-Original-Host), and lets auto-ssl issue its certificate
    (the allow_domain callback in init.lua). This is the "ask" pattern of
    Caddy's on_demand_tls.

    Example: opsapi's custom form domains. The opsapi dashboard's server sets
    on_demand_ask_url = https://<opsapi api>/api/v2/public/form-domains/check,
    so forms.acme.com (CNAMEd to this edge and verified in opsapi) gets a
    certificate and reaches the dashboard, which serves only that workspace's
    forms there.

    - Worker 0 lists the on-demand servers from disk every REFRESH_SECONDS into
      the `wsl_on_demand` shared dict, because the TLS callback can't read
      files. No such servers = no asks: nothing changes for anyone else.
    - Answers are cached per host: yes YES_TTL, no NO_TTL, an ask that failed
      ERROR_TTL. A host that stops being vouched for loses routing within
      YES_TTL, and its certificate is not renewed.
    - At most MAX_ASKS_PER_MINUTE asks per edge per minute. Beyond that the
      answer is no (fail closed), so a flood of made-up hosts or SNI names can
      hammer neither the ask service nor Let's Encrypt.
    - Needs `lua_shared_dict wsl_on_demand` (both nginx templates). Without it
      the feature is off.
]]

local cjson = require("cjson")

local _M = {}

_M.REFRESH_SECONDS = 30
_M.YES_TTL = 300
_M.NO_TTL = 60
_M.ERROR_TTL = 15
_M.MAX_ASKS_PER_MINUTE = 300
_M.TIMEOUT_MS = 2000

local LIST_KEY = "servers"

local function dict()
    return ngx.shared.wsl_on_demand
end

local function config_path()
    local p = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
    if p:sub(-1) ~= "/" then p = p .. "/" end
    return p
end

--- A host name worth asking about: letters, digits, dots and hyphens, with a
-- dot and a letter-led top-level label (so never an IP address).
function _M.valid_host(host)
    if type(host) ~= "string" or #host > 253 then return false end
    if host:find("[^%w%.%-]") or host:find("%.%.") or host:match("^[%.%-]") or host:match("[%.%-]$") then
        return false
    end
    return host:match("%.%a[%w%-]*$") ~= nil
end

local function env_profile()
    local profile = "prod"
    local f = io.open(config_path() .. "data/settings.json", "rb")
    if f then
        local ok, s = pcall(cjson.decode, f:read("*a") or "")
        f:close()
        if ok and type(s) == "table" and type(s.env_profile) == "string" and s.env_profile ~= "" then
            profile = s.env_profile
        end
    end
    return profile
end

--- List the servers that take on-demand hosts (worker 0, every REFRESH_SECONDS).
function _M.refresh()
    local shd = dict()
    if not shd then return end
    local lfs = LFS or require("lfs")
    local ConfigIO = require("config_io")
    local dir = config_path() .. "data/servers/" .. env_profile() .. "/"
    local list, seen = {}, {}
    local ok, err = pcall(function()
        for file in lfs.dir(dir) do
            local name = file:match("^host:(.+)%.json$") or file:match("^host:(.+)%.ya?ml$")
            if name and not seen[name] then
                seen[name] = true
                local server = ConfigIO.load(dir .. "host:" .. name)
                local url = type(server) == "table" and server.on_demand_ask_url
                if type(url) == "string" and url:match("^https?://[%w%.%-]+") then
                    list[#list + 1] = { server = name, ask = url }
                end
            end
        end
    end)
    if not ok then
        ngx.log(ngx.WARN, "on_demand: couldn't list servers in ", dir, ": ", tostring(err))
        return
    end
    table.sort(list, function(a, b) return a.server < b.server end)
    shd:set(LIST_KEY, #list > 0 and cjson.encode(list) or "")
end

function _M.init_worker()
    if not dict() then
        ngx.log(ngx.NOTICE, "on_demand: no lua_shared_dict wsl_on_demand, so on-demand hosts are off")
        return
    end
    if ngx.worker.id() ~= 0 then return end
    local function tick(premature)
        if not premature then _M.refresh() end
    end
    ngx.timer.at(0, tick)
    ngx.timer.every(_M.REFRESH_SECONDS, tick)
end

-- @return the HTTP status of the ask, or nil when it couldn't be made
local function ask(url, host)
    local ok_http, http = pcall(require, "resty.http")
    if not ok_http then return nil end
    local client = http.new()
    client:set_timeout(_M.TIMEOUT_MS)
    local sep = url:find("?", 1, true) and "&" or "?"
    local res, err = client:request_uri(url .. sep .. "domain=" .. ngx.escape_uri(host), {
        method = "GET",
        ssl_verify = true,
        headers = { ["User-Agent"] = "wslproxy-on-demand" },
    })
    if not res then
        ngx.log(ngx.WARN, "on_demand: asking about ", host, " failed: ", tostring(err))
        return nil
    end
    return res.status
end

--- The server that serves `host` on demand, or nil. Works in the TLS
-- handshake (shared dict + cosockets only) and in request phases.
function _M.lookup(host)
    local shd = dict()
    if not shd or not _M.valid_host(host) then return nil end
    host = host:lower()
    local raw = shd:get(LIST_KEY)
    if not raw or raw == "" then return nil end

    local cached = shd:get("h:" .. host)
    if cached ~= nil then return cached ~= "" and cached or nil end

    local asked = shd:incr("asks:" .. math.floor(ngx.now() / 60), 1, 0, 120)
    if asked and asked > _M.MAX_ASKS_PER_MINUTE then
        ngx.log(ngx.WARN, "on_demand: ask budget used up this minute; not serving ", host)
        return nil
    end

    local ok, list = pcall(cjson.decode, raw)
    if not ok or type(list) ~= "table" then return nil end
    local failed = false
    for _, s in ipairs(list) do
        local status = ask(s.ask, host)
        if status == 200 then
            shd:set("h:" .. host, s.server, _M.YES_TTL)
            return s.server
        end
        if not status then failed = true end
    end
    shd:set("h:" .. host, "", failed and _M.ERROR_TTL or _M.NO_TTL)
    return nil
end

return _M
