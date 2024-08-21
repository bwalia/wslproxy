local cjson = require("cjson")
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local function getPayloads(body)
    local keyset = {}
    local n = 0
    for k, v in pairs(body) do
        n = n + 1
        if type(v) == "string" then
            if v ~= nil and v ~= "" then
                table.insert(keyset, cjson.decode(k .. v))
            end
        else
            table.insert(keyset, cjson.decode(k))
        end
    end
    return keyset[1]
end

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

local function handle_post_request(args)
    local settings = getSettings()
    local payloads = getPayloads(args)
    local envProfile = payloads.profile
    local writableFile, writableErr = io.open(configPath .. "data/settings.json", "w")
        settings.env_profile = envProfile
        if writableFile == nil then
            ngx.say("Couldn't write file: " .. writableErr)
        else
            writableFile:write(cjson.encode(settings))
            writableFile:close()
            ngx.say(cjson.encode({
                data = {
                    profile = settings.env_profile
                }
            }))
        end
end
if ngx.req.get_method() == "POST" then
    ngx.req.read_body()
    handle_post_request(ngx.req.get_post_args())
end