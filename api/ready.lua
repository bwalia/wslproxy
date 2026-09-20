local cjson = require("cjson")
ngx.header.content_type = "application/json"

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
if configPath:sub(-1) ~= "/" then
    configPath = configPath .. "/"
end

-- Read config version from file written by wslproxy-agent
local config_version = -1
local vf = io.open(configPath .. "data/.config_version", "r")
if vf then
    local content = vf:read("*a")
    vf:close()
    if content then
        content = content:gsub("%s+", "")
        config_version = tonumber(content) or -1
    end
end

-- Check settings.json exists and is valid
local settings_ok = false
local sf = io.open(configPath .. "data/settings.json", "r")
if sf then
    local content = sf:read("*a")
    sf:close()
    if content and content ~= "" then
        local ok, _ = pcall(cjson.decode, content)
        settings_ok = ok
    end
end

local storage_health = { ok = true, storage_type = "disk" }
local ok_store, store_h = pcall(function()
    return require("storage").health()
end)
if ok_store and type(store_h) == "table" then
    storage_health = store_h
elseif not ok_store then
    storage_health = { ok = false, detail = tostring(store_h) }
end

local ready = settings_ok and storage_health.ok ~= false

if ready then
    ngx.status = 200
    ngx.say(cjson.encode({
        ready = true,
        config_version = config_version,
        storage = storage_health,
        timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
    }))
else
    ngx.status = 503
    ngx.say(cjson.encode({
        ready = false,
        config_version = config_version,
        reason = settings_ok and (storage_health.detail or "storage unhealthy") or "settings not loaded",
        storage = storage_health,
        timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
    }))
end
