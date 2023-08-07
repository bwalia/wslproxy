local http = require "resty.http"
local jwt = require "resty.jwt"
local cjson = require "cjson"
Hostname = os.getenv("HOST")
local apiUrl = os.getenv("API_URL")
local configPath = os.getenv("NGINX_CONFIG_DIR")

local _R = {}

local function generateToken()
    local passPhrase = os.getenv("JWT_SECURITY_PASSPHRASE")
    return jwt:sign(passPhrase, {
        header = {
            typ = "JWT",
            alg = "HS256"
        },
        payload = {
            sub = "123456",
            exp = ngx.time() + 3600
        }
    })
end

local function setDataToFile(path, value)
    local file, err = io.open(path, "w")
    if file == nil then
        ngx.say("Couldn't read file: " .. err)
    else
        file:write(cjson.encode(value))
        file:close()
    end
end

local httpHeaders = {
    ["Authorization"] = "Bearer " .. generateToken(),
    ["Content-Type"] = "application/json",
}

local function getRuleByID(ruleId)
    local httpc = http.new()
    local serverRule, reqError = httpc:request_uri(apiUrl .. "/rules/" .. ruleId, {
        method = "GET",
        headers = httpHeaders,
        ssl_verify = false,
    })
    if reqError == nil then
        serverRule = serverRule.body
    end
    return serverRule
end

local function saveRecordsToDisk(path, keyName)
    local httpc = http.new()
    local allServers, serverErr = httpc:request_uri(path, {
        method = "GET",
        headers = httpHeaders,
        ssl_verify = false,
    })
    if serverErr == nil then
        allServers = allServers.body
    end
    if allServers and allServers ~= nil and type(allServers) == "string" then
        allServers = cjson.decode(allServers)["data"]
        for index, server in ipairs(allServers) do
            setDataToFile(configPath .. "data/" .. keyName .. "/" .. server.id .. ".json", server)
        end
    end
    return true
end

function _R.server()
    local httpc = http.new()
    local currentServer, httpErr = httpc:request_uri(apiUrl .. "/servers/host:" .. Hostname, {
        method = "GET",
        headers = httpHeaders,
        ssl_verify = false,
    })
    if httpErr == nil then
        currentServer = currentServer.body
    end

    if currentServer ~= nil and type(currentServer) == "string" then
        currentServer = cjson.decode(currentServer)
        currentServer = currentServer.data
        if currentServer.rules and currentServer.rules ~= nil then
            local serverRule = getRuleByID(currentServer.rules)
            currentServer.rules = cjson.decode(serverRule).data
        end
        if currentServer.match_cases ~= nil and currentServer.match_cases then
            for index, value in ipairs(currentServer.match_cases) do
                local conditionRule = getRuleByID(value.statement)
                currentServer.match_cases[index].statement = cjson.decode(conditionRule).data
            end
        end
        currentServer = cjson.encode(currentServer)
    end
    return currentServer
end

-- Function to remove all files inside a directory
local function deleteFilesInDirectory(directory)
    local handle = io.popen("ls " .. directory)
    local files = handle:read("*a")
    handle:close()

    for file in files:gmatch("[^\r\n]+") do
        local filepath = directory .. "/" .. file
        os.remove(filepath)
    end
end

function syncAPI()
    ngx.header["Access-Control-Allow-Origin"] = "*"
    ngx.header["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    ngx.header["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    deleteFilesInDirectory(configPath .. "data/servers")
    deleteFilesInDirectory(configPath .. "data/rules")
    local updateServers = saveRecordsToDisk(
    apiUrl ..
    "/servers?_format=json&&params={%22pagination%22:{%22page%22:1,%22perPage%22:10},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{}}",
        "servers")
    local updateRules = saveRecordsToDisk(
    apiUrl ..
    "/rules?_format=json&&params={%22pagination%22:{%22page%22:1,%22perPage%22:10},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{}}",
        "rules")

    return ngx.say(cjson.encode({
        data = {
            servers = updateServers,
            rules = updateRules,
        }
    }))
end

syncAPI()
