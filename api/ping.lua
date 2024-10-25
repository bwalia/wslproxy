local cjson = Cjson
local lfs = require("lfs")
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local http = require "resty.http"
-- functions

function os.capture(cmd, raw) -- this function cannot be local
    local handle = assert(io.popen(cmd, 'r'))
    local output = assert(handle:read('*a'))
    handle:close()
    if raw then
        return output
    end
    output = string.gsub(string.gsub(string.gsub(output, '^%s+', ''), '%s+$', ''), '[\n\r]+', '<br>')
    return output
end

local function shell_exec_output(cmd)
    local result = os.capture(cmd)
    return result
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

local settings = getSettings()

local redisHost = settings.env_vars.REDIS_HOST or os.getenv("REDIS_HOST")
local redisEndPort = settings.env_vars.REDIS_PORT or os.getenv("REDIS_PORT")
local developmentTime = settings.env_vars.VITE_DEPLOYMENT_TIME or os.getenv("VITE_DEPLOYMENT_TIME")
local primaryNameserver = settings.dns_resolver.nameservers.primary or os.getenv("PRIMARY_DNS_RESOLVER")
local secondaryNameserver = settings.dns_resolver.nameservers.secondary or os.getenv("SECONDARY_DNS_RESOLVER")
local portNameserver = settings.dns_resolver.nameservers.port or os.getenv("DNS_RESOLVER_PORT")
local apiUrl = settings.env_vars.CONTROL_PLANE_API_URL or os.getenv("CONTROL_PLANE_API_URL")
local frontUrl = settings.env_vars.FRONT_URL or os.getenv("FRONT_URL")
local appName = settings.env_vars.APP_NAME or os.getenv("APP_NAME")
local appVersion = settings.env_vars.VERSION or os.getenv("VERSION")
local appStack = settings.env_vars.STACK or os.getenv("STACK")
local appHost = settings.env_vars.HOSTNAME or os.getenv("HOSTNAME")
local jwtPassPhrase = settings.env_vars.JWT_SECURITY_PASSPHRASE or os.getenv("JWT_SECURITY_PASSPHRASE")

local function calculateDateDifference(dateString1, dateString2)
    if dateString1 ~= nil and dateString2 ~= nil then
        local year1, month1, day1, hour1, min1, sec1 = dateString1:match("(%d%d%d%d)(%d%d)(%d%d)(%d%d)(%d%d)(%d%d)")
        local year2, month2, day2, hour2, min2, sec2 = dateString2:match("(%d%d%d%d)(%d%d)(%d%d)(%d%d)(%d%d)(%d%d)")

        local time1 = os.time({
            year = year1,
            month = month1,
            day = day1,
            hour = hour1,
            min = min1,
            sec = sec1
        })
        local time2 = os.time({
            year = year2,
            month = month2,
            day = day2,
            hour = hour2,
            min = min2,
            sec = sec2
        })

        local diffInSeconds = os.difftime(time2, time1)
        local diffInDays = math.abs(diffInSeconds / (24 * 60 * 60))
        diffInDays = math.floor(diffInDays)
        return diffInDays
    else
        return 0
    end
end

local db_connect_status, db_status_msg = "disk", "No Database Selected"
local storageTypeOverride = settings.storage_type or os.getenv("STORAGE_TYPE")
if settings.storage_type == "redis" then
    local redis = require "resty.redis"
    local red = redis:new()
    red:set_timeouts(1000, 1000, 1000) -- 1 sec
    if redisHost == nil then
        redisHost = "localhost"
    end
    
    if redisEndPort == nil then
        redisEndPort = 6379
    end
    
    local ok, err = red:connect(redisHost, redisEndPort)
    if ok then
        db_connect_status = "pong"
        db_status_msg = "OK"
    else
        ngx.say("failed to connect to " .. redisHost .. ": ", err)
        db_connect_status = "err"
        db_status_msg = err
    end
end

local diffInDays = calculateDateDifference(developmentTime, os.date("%Y%m%d%H%M%S"))
local json_str

local function readFile(filePath)
    local file = io.open(filePath, "r")  -- Open the file in read mode
    if file then
        local content = file:read("*a")  -- Read the entire content of the file
        file:close()  -- Close the file handle
        return content
    else
        return nil
    end
end

local function parseEnvString(envString)
    local envTable = {}
    
    for line in envString:gmatch("[^\r\n]+") do
        local key, value = line:match("(%S+)%s*=%s*(.*)")
        if key and value then
            envTable[key] = value
        end
    end

    return envTable
end

local function check_api_status(url, target)
    local replacedURL = string.gsub(url, "https://", "http://") -- Temporary Fixed for "unable to get local issuer certificate"
    local httpc = http.new()
    local res, apiErr = httpc:request_uri(replacedURL, {
        method = "GET",
        headers = {
            ["Content-Type"] = "application/json",
        },
    })

    if not res then
        ngx.say("HTTP request failed for " .. target .. " " .. url .. " ", apiErr)
        -- ngx.exit(ngx.HTTP_SERVICE_UNAVAILABLE)
        return
    end
   return res
end


local apiResApi = check_api_status(apiUrl, "api")
if apiResApi ~= nil and apiResApi.status >= 500 and apiResApi.status < 600 then
    ngx.say("Server error For API_URL. Status code: " .. tostring(apiResApi.status))
    ngx.exit(ngx.HTTP_SERVICE_UNAVAILABLE)
end

local currentDir = lfs.currentdir()
if currentDir == nil or currentDir == "/" then
    currentDir = "/usr/local/openresty/nginx/html/openresty-admin"
end

local frontFilePath = currentDir .. "/.env"
local frontEnvContent = readFile(frontFilePath)
frontEnvContent = parseEnvString(frontEnvContent)

if frontEnvContent.VITE_TARGET_PLATFORM ~= "DOCKER" then
    local apiResFront = check_api_status(frontUrl, "front")
    if apiResFront ~= nil and apiResFront.status >= 500 and apiResFront.status < 600 then
        ngx.say("Server error for FRONT_URL. Status code: " .. tostring(apiResFront.status))
        ngx.exit(ngx.HTTP_SERVICE_UNAVAILABLE)
    end
end
local data = {
    app = appName,
    version = appVersion,
    stack = appStack,
    hostname = appHost,
    response = "pong",
    deployment_time = developmentTime,
    redis_host = redisHost,
    redis_status = db_connect_status,
    redis_status_msg = db_status_msg,
    node_uptime = shell_exec_output("uptime -s"), -- "10:45:05 up  7:44,  0 users,  load average: 1.46, 1.18, 1.02"
    openresty_version = shell_exec_output("cat /opt/nginx/VERSION"),
    pod_uptime = diffInDays .. " days ago",
    storage_type = storageTypeOverride,
    dns_primary_server = primaryNameserver,
    dns_secondary_server = secondaryNameserver,
    dns_server_port = portNameserver,
    swagger_url = ngx.var.scheme.."://".. ngx.var.http_host .. "/swagger/",
    mendatory_env_vars_backend = {
        NGINX_CONFIG_DIR = configPath and "Found" or "Not Found",
        JWT_SECURITY_PASSPHRASE = jwtPassPhrase and "Found" or "Not Found",
        PRIMARY_DNS_RESOLVER = primaryNameserver and "Found" or "Not Found",
        SECONDARY_DNS_RESOLVER = secondaryNameserver and "Found" or "Not Found",
        DNS_RESOLVER_PORT = portNameserver and "Found" or "Not Found",
        FRONT_URL = frontUrl or "Not Found",
        API_URL = apiUrl or "Not Found",
    },
    mendatory_env_vars_frontend = {
        VITE_JWT_SECURITY_PASSPHRASE = frontEnvContent.VITE_JWT_SECURITY_PASSPHRASE and "Found" or "Not Found",
        VITE_API_URL = frontEnvContent.VITE_API_URL and frontEnvContent.VITE_API_URL or "Not Found",
        VITE_FRONT_URL = frontEnvContent.VITE_FRONT_URL and frontEnvContent.VITE_FRONT_URL or "Not Found",
        VITE_NGINX_CONFIG_DIR = frontEnvContent.VITE_NGINX_CONFIG_DIR and "Found" or "Not Found",
        VITE_APP_NAME = frontEnvContent.VITE_APP_NAME and frontEnvContent.VITE_APP_NAME or "Not Found",
        VITE_DEPLOYMENT_TIME = frontEnvContent.VITE_DEPLOYMENT_TIME and frontEnvContent.VITE_DEPLOYMENT_TIME or "Not Found",
        VITE_APP_DISPLAY_NAME = frontEnvContent.VITE_APP_DISPLAY_NAME and frontEnvContent.VITE_APP_DISPLAY_NAME or "Not Found",
    }
}
-- Encode the table as a JSON string
json_str = cjson.encode(data)

ngx.say(json_str)
