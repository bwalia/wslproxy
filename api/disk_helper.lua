local cjson = require "cjson"
local jwt = require "resty.jwt"
Base64 = require "base64"
local configPath = os.getenv("NGINX_CONFIG_DIR")
local storageTypeOverride = os.getenv("STORAGE_TYPE")

local function getSettings()
    local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
    local settings = {}
    if readSettings == nil then
        ngx.say("Couldn't read file: " .. errSettings)
    else
        local jsonString = readSettings:read "*a"
        readSettings:close()
        settings = cjson.decode(jsonString)
    end
    return settings
end

return {
    getSettings = getSettings,
}