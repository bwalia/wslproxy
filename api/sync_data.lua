local http = require "resty.http"
local jwt = JWT
local cjson = Cjson
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local lfs = require("lfs")

local _R = {}

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
local Hostname = settings.env_vars.HOSTNAME or os.getenv("HOST")
local apiUrl = settings.env_vars.API_URL or os.getenv("API_URL")
local function generateToken()
    local passPhrase = settings.env_vars.JWT_SECURITY_PASSPHRASE or os.getenv("JWT_SECURITY_PASSPHRASE")
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

local function cleanString(input)
    -- Remove double quotes from start and end
    local output = input:match('^"(.*)"$') or input

    -- Replace \n with new line
    output = output:gsub("\\n", "\n")

    return output
end

local function isDirectoryExists(path)
    local attributes = lfs.attributes(path)
    return attributes and attributes.mode == "directory"
end

local function setDataToLocalFile(path, value, dir, fileType)
    -- Check if the directory exists
    if not isDirectoryExists(dir) then
        -- Directory doesn't exist, so create it
        local success, errorMsg = lfs.mkdir(dir)
        if errorMsg ~= nil then
            ngx.status = ngx.HTTP_BAD_REQUEST
            ngx.say(cjson.encode({
                data = {
                    message = "Error creating directory:", errorMsg
                }
            }))
        end
    else
        print("Directory already exists")
    end
    local file, err = io.open(path, "w")
    if file == nil then
        ngx.say("Couldn't read file: " .. err)
    else
        if fileType == "conf" then
            local cleanedContent = value:gsub('"(.-)"', function(s)
                return cleanString(s)
            end)
            file:write(cleanedContent)
            file:close()
        else
            file:write(cjson.encode(value))
            file:close()
        end
    end
end

local function saveRecordsToDisk(path, keyName, type)
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
    if allServers and allServers ~= nil and allServers ~= "" then
        local allServersData = cjson.decode(allServers)["data"]
        allDataTotal = cjson.decode(allServers)["total"]
        for index, server in ipairs(allServersData) do
            if type == "conf" then
                setDataToLocalFile(configPath .. "data/" .. keyName .. "/" .. server.name .. ".conf", server, configPath .. "data/" .. keyName, "conf")
            else
                createDirectoryIfNotExists(configPath .. "data/" .. keyName)
                setDataToFile(configPath .. "data/" .. keyName .. "/" .. server.id .. ".json", server)
            end
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
    if handle then
        local files = handle:read("*a")
        handle:close()
        for file in files:gmatch("[^\r\n]+") do
            local filepath = directory .. "/" .. file
            os.remove(filepath)
        end
    end

end

local function runShellScript(script)
    local command = "sh " .. script
    local result = os.execute(command)
    return result
end

function SyncRulesAPI(args)
    local apiPageSize = settings.env_vars.API_PAGE_SIZE or os.getenv("API_PAGE_SIZE")
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

function SyncServersAPI(args)
    local apiPageSize = settings.env_vars.API_PAGE_SIZE or os.getenv("API_PAGE_SIZE")
    local apiTotalPages = 1
    local profileName = args.envprofile
    apiPageSize = (apiPageSize == nil or apiPageSize == "") and 100 or apiPageSize
    local settings = getSettings()
    deleteFilesInDirectory(configPath .. "data/servers/" .. profileName)
    if settings.sync_nginx_conf_files ~= nil and settings.sync_nginx_conf_files == true then
        deleteFilesInDirectory(configPath .. "data/servers/" .. profileName .. "/conf")
    end
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
    if settings.sync_nginx_conf_files ~= nil and settings.sync_nginx_conf_files == true then
        saveRecordsToDisk(apiUrl .. "/conf?_format=json&profile=" .. profileName, "servers/" .. profileName .. "/conf")
    end
    if settings.sync_nginx_reload ~= nil and settings.sync_nginx_reload == true then
        local script_path = settings.script_path
        runShellScript(script_path)
    end
    return ngx.say(cjson.encode({
        data = {
            servers = totalServers,
            totalPage = totalPages,
        }
    }))
end

function SyncSettings()
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
                settings = "settings are synced"
            }
        }))
    end
end

local args = ngx.req.get_uri_args()
if args.settings == "true" then
    SyncSettings()
end
SyncRulesAPI(args)
SyncServersAPI(args)
