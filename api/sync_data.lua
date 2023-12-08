local http = require "resty.http"
local jwt = require "resty.jwt"
local cjson = require "cjson"
Hostname = os.getenv("HOST")
local apiUrl = os.getenv("API_URL")
local configPath = os.getenv("NGINX_CONFIG_DIR")
local lfs = require("lfs")

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

local function createDirectoryIfNotExists(directoryPath)
    if not lfs.attributes(directoryPath, "mode") then
        assert(lfs.mkdir(directoryPath))
    end
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
    local allDataTotal = 0
    local allServers, serverErr = httpc:request_uri(path, {
        method = "GET",
        headers = httpHeaders,
        ssl_verify = false,
    })
    if serverErr == nil then
        allServers = allServers.body
    end
    if allServers and allServers ~= nil and type(allServers) == "string" then
        local allServersData = cjson.decode(allServers)["data"]
        allDataTotal = cjson.decode(allServers)["total"]
        for index, server in ipairs(allServersData) do
            createDirectoryIfNotExists(configPath .. "data/" .. keyName)
            setDataToFile(configPath .. "data/" .. keyName .. "/" .. server.id .. ".json", server)
        end
    end
    return allDataTotal
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

function syncRulesAPI(args)
    local apiPageSize = os.getenv("API_PAGE_SIZE")
    local apiTotalPages = 1
    local profileName = args.envprofile
    apiPageSize = (apiPageSize == nil or apiPageSize == "") and 100 or apiPageSize

    deleteFilesInDirectory(configPath .. "data/rules/" .. profileName)
    local totalPages = 1
    local totalRules = saveRecordsToDisk(
        apiUrl ..
        "/rules?_format=json&&params={%22pagination%22:{%22page%22:" ..
        apiTotalPages ..
        ",%22perPage%22:" ..
        apiPageSize ..
        "},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{%22profile_id%22:%22" ..
        profileName .. "%22}}",
        "rules/" .. profileName)
    totalRules = totalRules == nil and 0 or totalRules
    if totalRules > apiPageSize then
        totalPages = totalRules / apiPageSize
        totalPages = math.ceil(totalPages)
        repeat
            apiTotalPages = apiTotalPages + 1
            saveRecordsToDisk(
                apiUrl ..
                "/rules?_format=json&&params={%22pagination%22:{%22page%22:" ..
                apiTotalPages ..
                ",%22perPage%22:" ..
                apiPageSize ..
                "},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{%22profile_id%22:%22" ..
                profileName .. "%22}}",
                "rules/" .. profileName)
        until apiTotalPages >= totalPages
    end

    return ngx.say(cjson.encode({
        data = {
            rules = totalRules,
            totalPage = totalPages,
        }
    }))
end

function syncServersAPI(args)
    local apiPageSize = os.getenv("API_PAGE_SIZE")
    local apiTotalPages = 1
    local profileName = args.envprofile
    apiPageSize = (apiPageSize == nil or apiPageSize == "") and 100 or apiPageSize

    deleteFilesInDirectory(configPath .. "data/servers/" .. profileName)
    local totalPages = 1
    local totalServers = saveRecordsToDisk(
        apiUrl ..
        "/servers?_format=json&&params={%22pagination%22:{%22page%22:" ..
        apiTotalPages ..
        ",%22perPage%22:" ..
        apiPageSize ..
        "},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{%22profile_id%22:%22" ..
        profileName .. "%22}}",
        "servers/" .. profileName)

    totalServers = totalServers == nil and 0 or totalServers
    if totalServers > apiPageSize then
        totalPages = totalServers / apiPageSize
        totalPages = math.ceil(totalPages)
        repeat
            apiTotalPages = apiTotalPages + 1
            saveRecordsToDisk(
                apiUrl ..
                "/servers?_format=json&&params={%22pagination%22:{%22page%22:" ..
                apiTotalPages ..
                ",%22perPage%22:" ..
                apiPageSize ..
                "},%22sort%22:{%22field%22:%22created_at%22,%22order%22:%22DESC%22},%22filter%22:{%22profile_id%22:%22" ..
                profileName .. "%22}}",
                "servers/" .. profileName)
        until apiTotalPages >= totalPages
    end

    return ngx.say(cjson.encode({
        data = {
            servers = totalServers,
            totalPage = totalPages,
        }
    }))
end

function syncSettings()
    local httpc = http.new()
    local allDataTotal = 0
    local settingsObj, settingsErr = httpc:request_uri(apiUrl .. "/global/settings", {
        method = "GET",
        headers = httpHeaders,
        ssl_verify = false,
    })
    if settingsErr == nil then
        settingsObj = settingsObj.body
    end
    if settingsObj and settingsObj ~= nil and type(settingsObj) == "string" then
        local settings = cjson.decode(settingsObj)["data"]
        setDataToFile(configPath .. "data/settings.json", settings)
        return ngx.say(cjson.encode({
            data = {
                settings = settings
            }
        }))
    end
end

local args = ngx.req.get_uri_args()

syncRulesAPI(args)
syncServersAPI(args)
syncSettings()
