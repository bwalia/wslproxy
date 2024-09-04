local cjson = Cjson
local jwt = JWT
local lfs = LFS

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local Conf = require("server-conf")
local Helper = require("helpers")

local settings = Helper.settings()
local storageTypeOverride = settings.settings or os.getenv("STORAGE_TYPE")

local red = {}

if settings.storage_type == "redis" then
    local redis = require "resty.redis"
    red = redis:new()
    red:set_timeout(1000)
    
    local redisHost = settings.env_vars.REDIS_HOST or os.getenv("REDIS_HOST")
    if redisHost == nil then
        redisHost = "localhost"
    end
    
    local ok, err = red:connect(redisHost, 6379)
    if not ok then
        ngx.log(ngx.ERR, "failed to connect to Redis: ", err)
    end
end

local function is_uuid(str)
    local pattern = "^[%x%x%x%x%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%-%x%x%x%x%x%x%x%x%x%x%x%x]$"
    return string.match(str, pattern) ~= nil
end

local function hash_password(password)
    local resty_sha256 = require "resty.sha256"
    local sha256 = resty_sha256:new()
    sha256:update(password)
    local digest = sha256:final()
    local hash = ngx.encode_base64(digest)
    return hash
end

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

local function fileExists(filePath)
    local attr = lfs.attributes(filePath)
    if attr then
        return true
    else
        return false
    end
end

-- Function to check if a directory exists
local function isDirectoryExists(path)
    local attributes = lfs.attributes(path)
    return attributes and attributes.mode == "directory"
end

local function getDataFromFile(path)
    local fileData = nil
    local file, err = io.open(path, "rb")
    if file ~= nil then
        fileData = file:read "*a"
        file:close()
    end
    return fileData, err
end

local function cleanString(input)
    -- Remove double quotes from start and end
    local output = input:match('^"(.*)"$') or input

    -- Replace \n with new line
    output = output:gsub("\\n", "\n")

    return output
end

local function createDirectoryRecursive(path)
    return lfs.mkdir(path)
end

local function isDir(path)
    return lfs.attributes(path, "mode") == "directory"
end

local function setDataToFile(path, value, dir, fileType)
    -- Check if the directory exists
    if not isDirectoryExists(dir) then
        -- Directory doesn't exist, so create it
        local parent = dir:match("^(.*)/[^/]+/?$")
        if parent and not isDir(parent) then
            createDirectoryRecursive(parent)  -- Recursively create parent directories
        end
        local success, errorMsg = createDirectoryRecursive(dir)
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

local function removeServerFromRule(oldRuleId, serverId, envProfile)
    local loadRules = nil
    if oldRuleId and oldRuleId ~= nil and type(oldRuleId) ~= "userdata" then
        if settings.storage_type == "redis" then
            loadRules = red:hget("request_rules_" .. envProfile, oldRuleId)
        else
            loadRules = getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. oldRuleId .. ".json")
        end
        if loadRules and loadRules ~= "null" and type(loadRules) == "string" then
            loadRules = cjson.decode(loadRules)
            local valueToRemove = serverId
            local i = 1
            while i <= #loadRules.servers do
                if loadRules.servers[i] == valueToRemove then
                    table.remove(loadRules.servers, i)
                else
                    i = i + 1
                end
            end
            if settings.storage_type == "redis" then
                red:hset("request_rules_" .. envProfile, oldRuleId, cjson.encode(loadRules))
            else
                setDataToFile(configPath .. "data/rules/" .. envProfile .. "/" .. oldRuleId .. ".json", loadRules,
                    configPath .. "data/rules")
            end
        end
    end
end

local function updateServerInRules(ruleId, serverId, Rtype, envProfile)
    local getRules, ruleErr = nil, nil
    if settings.storage_type == "redis" then
        getRules, ruleErr = red:hget("request_rules_" .. envProfile, ruleId)
    else
        getRules, ruleErr = getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json")
    end
    if getRules and getRules ~= "null" and type(getRules) == "string" then
        getRules = cjson.decode(getRules)
        local getServer = nil
        if settings.storage_type == "redis" then
            getServer = red:hget("servers_" .. envProfile, serverId)
        else
            getServer = getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. serverId .. ".json")
        end
        if getServer and getServer ~= "null" and type(getServer) == "string" then
            getServer = cjson.decode(getServer)
            if Rtype == "rules" and getServer.rules ~= nil and getServer.rules ~= ruleId then
                removeServerFromRule(getServer.rules, serverId, envProfile)
            end
            if Rtype == "statement" and getServer.match_cases ~= nil and type(next(getServer.match_cases)) ~= nil then
                for _, matchCase in ipairs(getServer.match_cases) do
                    removeServerFromRule(matchCase.statement, serverId, envProfile)
                end
            end
        end
        local isServer = true
        if not getRules.servers and getRules.servers == nil then
            getRules.servers = {}
        else
            for idx, server in ipairs(getRules.servers) do
                if server == serverId then
                    isServer = false
                end
            end
        end
        if isServer == true then
            table.insert(getRules.servers, serverId)
            if settings.storage_type == "redis" then
                red:hset("request_rules_" .. envProfile, ruleId, cjson.encode(getRules))
            else
                setDataToFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json", getRules,
                    configPath .. "data/rules")
            end
        end
    end
end

local function deleteRuleFromServer(ruleId, envProfile)
    local getRule = nil
    if settings.storage_type == "redis" then
        getRule = red:hget("request_rules_" .. envProfile, ruleId)
    else
        getRule = getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json")
    end
    if getRule and getRule ~= "null" and type(getRule) == "string" then
        getRule = cjson.decode(getRule)
        -- Remove the rules from all servers that are using it as a statement or case
        if getRule.servers and getRule.servers ~= nil then
            for _, server in ipairs(getRule.servers) do
                local getServer = nil
                if settings.storage_type == "redis" then
                    getServer = red:hget("servers_" .. envProfile, server)
                else
                    getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. server .. ".json")
                end
                if getServer and getServer ~= "null" and type(getServer) == "string" then
                    getServer = cjson.decode(getServer)
                    if getServer.rules == ruleId then
                        getServer.rules = nil
                    else
                        if getServer.match_cases ~= nil and type(next(getServer.match_cases)) ~= nil then
                            for i = #getServer.match_cases, 1, -1 do
                                -- Iterate over the array and remove objects with matching statement value
                                if getServer.match_cases[i].statement == ruleId then
                                    table.remove(getServer.match_cases, i)
                                end
                            end
                        end
                    end
                    if settings.storage_type == "redis" then
                        red:hset("servers_" .. envProfile, server, cjson.encode(getServer))
                    else
                        setDataToFile(configPath .. "data/servers/" .. envProfile .. "/" .. server .. ".json", getServer,
                            configPath .. "data/servers")
                    end
                end
            end
        end
    end
end

local function deleteServerFromRules(ruleId, serverId, envProfile)
    local getRule = nil
    if settings.storage_type == "redis" then
        getRule = red:hget("request_rules_" .. envProfile, ruleId)
    else
        getRule = getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json")
    end
    if getRule and getRule ~= "null" and type(getRule) == "string" then
        getRule = cjson.decode(getRule)
        if getRule.servers ~= nil and type(getRule.servers) == "table" then
            for _, server in ipairs(getRule.servers) do
                if server == serverId then
                    table.remove(getRule.servers, _)
                end
            end
            if settings.storage_type == "redis" then
                red:hset("request_rules_" .. envProfile, ruleId, cjson.encode(getRule))
            else
                setDataToFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json", getRule,
                    configPath .. "data/rules")
            end
        end
    end
end

local function listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
    local recordCount, totalRecords, records = 0, 0, {}
    -- Calculate the start and end indices for pagination
    local startIdx = (pageNumber - 1) * pageSize
    local endIdx = startIdx + pageSize - 1
    -- Get the total number of records
    local totalKeys, err = red:hlen(recordsKey)
    if not totalKeys or err or totalKeys == 0 then
        ngx.log(ngx.INFO, "Failed to retrieve total number of records: ", err)
        return {}
    end
    ---@diagnostic disable-next-line: cast-local-type
    totalRecords = tonumber(totalKeys)

    repeat
        local res, err = red:hscan(recordsKey, cursor, "COUNT", pageSize)
        if not res then
            ngx.log(ngx.INFO, "Failed to retrieve records: ", err)
            return {}
        end
        cursor = res[1]
        -- Iterate over the returned records
        for i = 1, #res[2], 2 do
            local recordValue = res[2][i + 1]
            local dataRecord = cjson.decode(recordValue)
            local key = res[2][i]
            recordCount = recordCount + 1
            -- Store the record in the result table if within the desired range
            if recordCount >= startIdx + 1 and recordCount <= endIdx + 1 then
                if type(qParams.meta) == "table" then
                    if qParams.meta.exclude == key then
                        goto continue
                    end
                end
                if type(qParams.filter) == "table" and qParams.filter.q ~= nil then
                    local fieldValue = dataRecord.name
                    fieldValue = fieldValue:lower()
                    local pattern = qParams.filter.q
                    pattern = pattern:lower()
                    if fieldValue and fieldValue:find(pattern, 1, true) then
                        table.insert(records, cjson.decode(recordValue))
                    end
                else
                    table.insert(records, cjson.decode(recordValue))
                end
                ::continue::
            elseif recordCount > endIdx + 1 then
                -- Break the loop if we have retrieved enough records
                break
            end
        end
    until cursor == "0" or recordCount >= endIdx + 1
    return records, totalRecords
end

local function listPaginationLocal(data, pageSize, pageNumber, qParams)
    local startIdx, endIdx = 0, #data

    if pageSize ~= nil or pageNumber ~= nil then
        startIdx = (pageNumber - 1) * pageSize + 1
        endIdx = startIdx + pageSize - 1
    end

    local currentPageData, currentSearchedData = {}, {}
    for i = startIdx, math.min(endIdx, #data) do
        if type(qParams.meta) == "table" then
            if qParams.meta.exclude == data[i].id then
                goto continue
            end
        end
        if type(qParams.filter) == "table" and qParams.filter.q ~= nil then
            local fieldValue = data[i].name
            fieldValue = fieldValue:lower()
            local pattern = qParams.filter.q
            pattern = pattern:lower()
            if fieldValue and fieldValue:find(pattern, 1, true) then
                table.insert(currentPageData, data[i])
            end
        else
            table.insert(currentPageData, data[i])
        end
        ::continue::
    end

    return currentPageData, #data
end

-- Authentication

local function login(args)
    if settings then
        local suEmail = settings.super_user.email
        local suPassword = settings.super_user.password

        local keyset = {}
        local n = 0
        for k, v in pairs(args) do
            n = n + 1
            if type(v) == "string" then
                table.insert(keyset, cjson.decode(k .. v))
            else
                table.insert(keyset, cjson.decode(k))
            end
        end
        local payloads = keyset[1]
        local password = hash_password(payloads.password)
        if suEmail == payloads.email and suPassword == password then
            ngx.status = ngx.OK
            if settings.storage_type == "redis" then
                local session = require "resty.session".new()
                session:set_subject("OpenResty Fan")
                session:set("quote", "The quick brown fox jumps over the lazy dog")
                local ok, err = session:save()
            end
            ngx.say(cjson.encode({
                data = {
                    user = payloads,
                    accessToken = generateToken()
                },
                status = 200
            }))
        else
            ngx.status = ngx.HTTP_UNAUTHORIZED
            ngx.say(cjson.encode({
                data = "Invalid credentials",
                status = 401
            }))
        end
    end
end

local function setStorage(body)
    local storageType = ""
    if settings then
        if type(body) == "table" then
            local keyset = {}
            local n = 0
            for k, v in pairs(body) do
                n = n + 1
                if type(v) == "string" then
                    table.insert(keyset, cjson.decode(k .. v))
                else
                    table.insert(keyset, cjson.decode(k))
                end
            end
            local payloads = keyset[1]
            storageType = payloads.storage
        else
            storageType = body
        end
        local writableFile, writableErr = io.open(configPath .. "data/settings.json", "w")
        settings.storage_type = storageType
        if writableFile == nil then
            ngx.say("Couldn't write file: " .. writableErr)
        else
            writableFile:write(cjson.encode(settings))
            writableFile:close()
            ngx.say(cjson.encode({
                data = {
                    storage = settings.storage_type
                }
            }))
        end
    end
end
if storageTypeOverride and storageTypeOverride ~= nil then
    setStorage(storageTypeOverride)
end

-- Servers APIs

local function listFromDisk(directory, pageSize, pageNumber, qParams)
    local files = {}
    -- Run the 'ls' command to get a list of filenames
    local output, error = io.popen("ls " .. configPath .. "data/" .. directory .. ""):read("*all")
    for filename in string.gmatch(output, "[^\r\n]+") do
        table.insert(files, filename)
    end

    local jsonData = {}
    for _, filename in ipairs(files) do
        local filePath = configPath .. "data/" .. directory .. "/" .. filename
        local fileAttr = lfs.attributes(filePath)
        if fileAttr then
            if fileAttr.mode == "file" then
                local file, fileErr = io.open(filePath, "rb")
                if file == nil then
                    return ngx.say(cjson.encode({
                        data = {},
                        total = 0
                    }))
                else
                    local jsonString = file:read "*a"
                    file:close()
                    local data = nil
                    if jsonString and jsonString ~= "" then
                        data = cjson.decode(jsonString)
                    end
        
                    jsonData[_] = data
                end
            end
        end
    end
    local data, count = listPaginationLocal(jsonData, pageSize, pageNumber, qParams)
    return data, count
end

local function listServers(args)
    local counter = 0
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)

    -- Retrieve a page of records using HSCAN
    local cursor, totalRecords = "0", 0
    local allServers, servers = {}, {}
    if qParams.filter ~= nil then
        local filter = qParams.filter
        if filter.profile_id ~= nil then
            environment = filter.profile_id
        end
    end
    if settings then
        if settings.storage_type == "disk" then
            allServers, totalRecords = listFromDisk("servers/" .. environment, pageSize, pageNumber, qParams)
            -- totalRecords = #allServers
        else
            -- allServers, totalRecords = listFromDisk("servers/" .. environment, pageSize, pageNumber, qParams)
            -- if (allServers == nil or totalRecords == 0) then
            local recordsKey = "servers_" .. environment
            local records, totalCount = listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
            allServers = records
            totalRecords = totalCount
            -- end
        end
    end

    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allServers, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allServers, Helper.sortAsc(qParams.sort.field))
    end
    return ngx.say(cjson.encode({
        data = allServers,
        total = totalRecords
    }))
end

local function listServer(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    if settings then
        if settings.storage_type == "disk" then
            local jsonData, dataErr = getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. id .. ".json")
            if dataErr ~= nil then
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                jsonData = cjson.decode(jsonData)
                if jsonData.config then
                    jsonData.config = Base64.decode(jsonData.config)
                end
                ngx.say(cjson.encode({
                    data = jsonData
                }))
            end
        else
            --     local server, dataErr = getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. id .. ".json")
            --     if dataErr or dataErr ~= nil then
            local server = red:hget("servers_" .. envProfile, id)
            -- end
            if type(server) == "string" then
                server = cjson.decode(server)
                if server.config then
                    server.config = Base64.decode(server.config)
                end
                ngx.say(cjson.encode({
                    data = server
                }))
            end
        end
    end
end

local function createUpdateServer(body, uuid)
    local payloads, response = GetPayloads(body), {}
    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end

    if uuid then
        response = CreateUpdateRecord(payloads, uuid, "servers", "servers", "update")
    else
        payloads.id = "host:" .. payloads.server_name
        payloads.proxy_pass = "http://localhost"
        response = CreateUpdateRecord(payloads, payloads.id, "servers", "servers", "create")
    end

    ngx.say(cjson.encode({
        data = response
    }))
end

local function createDeleteServer(body, uuid)
    local serverId = uuid
    local payloads = GetPayloads(body)
    if payloads == ngx.null or not body or type(payloads) == "nil" then
        payloads = ngx.req.get_uri_args()
    end
    local envProfile = "prod"
    if payloads.ids ~= nil then
        envProfile = payloads.ids.envProfile
    else
        envProfile = payloads.envProfile
    end

    if settings then
        if uuid ~= "" and uuid ~= nil then
            if settings.storage_type == "disk" then
                os.remove(configPath .. "data/servers/" .. envProfile .. "/" .. uuid .. ".json")
            else
                -- os.remove(configPath .. "data/servers/" .. envProfile .. "/" .. uuid .. ".json")
                local oldDomain, oldDmnErr = red:hget("servers_" .. envProfile, uuid)
                if oldDomain and oldDomain ~= "null" and type(oldDomain) == "string" then
                    oldDomain = cjson.decode(oldDomain)
                    oldServerName = oldDomain.server_name
                    if oldDomain.rules ~= nil then
                        deleteServerFromRules(oldDomain.rules, uuid, envProfile)
                    end
                    if oldDomain.match_cases ~= nil and type(next(oldDomain.match_cases)) ~= nil then
                        for _, matchCase in pairs(oldDomain.match_cases) do
                            deleteServerFromRules(matchCase.statement, uuid, envProfile)
                        end
                    end
                else
                    ngx.log(ngx.ERR, "Error while getting domain from redis: ", oldDmnErr)
                end
                red:hdel("servers_" .. envProfile, uuid)
            end
        elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
            for value = 1, #payloads.ids.ids do
                if settings.storage_type == "disk" then
                    os.remove(configPath .. "data/servers/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
                else
                    -- os.remove(configPath .. "data/servers/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
                    local oldDomain, oldDmnErr = red:hget("servers_" .. envProfile, payloads.ids.ids[value])
                    if oldDomain and oldDomain ~= "null" and type(oldDomain) == "string" then
                        oldDomain = cjson.decode(oldDomain)
                        oldServerName = oldDomain.server_name
                        if oldDomain.rules ~= nil then
                            deleteServerFromRules(oldDomain.rules, uuid, envProfile)
                        end
                        if oldDomain.match_cases ~= nil and type(next(oldDomain.match_cases)) ~= nil then
                            for _, matchCase in pairs(oldDomain.match_cases) do
                                deleteServerFromRules(matchCase.statement, uuid, envProfile)
                            end
                        end
                    else
                        ngx.log(ngx.ERR, "Error while getting domain from redis: ", oldDmnErr)
                    end
                    red:hdel("servers_" .. envProfile, payloads.ids.ids[value])
                end
            end
        end
    end
    ngx.say(cjson.encode({
        data = { "success" }
    }))
end

-- Users APIs

local function createUserInDisk(payloads, uuid)
    local file, err = io.open(configPath .. "data/users.json", "rb")
    if file == nil then
        file, err = io.open(configPath .. "data/users.json", "w")
    end
    if file ~= nil then
        local jsonString = file:read "*a"
        file:close()
        local users = {}
        if jsonString ~= nil and jsonString ~= "" then
           users = cjson.decode(jsonString)
        end
        if uuid then
            for key, value in pairs(users) do
                if users[key]["id"] == uuid then
                    users[key] = payloads
                end
            end
        else
            table.insert(users, payloads)
        end

        local writableFile, writableErr = io.open(configPath .. "data/users.json", "w")
        if writableFile == nil then
            ngx.say(cjson.encode({
                data = "Couldn't write file: " .. writableErr
            }))
            ngx.exit(ngx.HTTP_OK)
        else
            writableFile:write(cjson.encode(users))
            writableFile:close()
            return payloads
        end
    end
end

local function listUsers(args)
    local users = {}
    local keys = {}
    local params = args
    params = params.params
    local qParams = cjson.decode(params)
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)

    -- Retrieve a page of records using HSCAN
    local cursor = "0"
    local recordCount, totalRecords = 0, 0
    if settings then
        if settings.storage_type == "disk" then
            local file, err = io.open(configPath .. "data/users.json", "rb")
            if file == nil then
                ngx.say(cjson.encode({
                    data = {},
                    total = 0
                }))
                ngx.exit(ngx.HTTP_OK)
            else
                local jsonString = file:read "*a"
                file:close()
                users = cjson.decode(jsonString)
                local currentPageData, totalPages = listPaginationLocal(users, pageSize, pageNumber, qParams)
                users, totalRecords = currentPageData, totalPages
            end
        else
            local recordsKey = "users"
            local records, totalCount = listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
            users = records
            totalRecords = totalCount
        end
    end
    if next(users) ~= nil then
        if qParams.sort.order == "DESC" then
            table.sort(users, Helper.sortDesc(qParams.sort.field))
        else
            table.sort(users, Helper.sortAsc(qParams.sort.field))
        end
    end
    ngx.say(cjson.encode({
        data = users,
        total = totalRecords
    }))
    ngx.exit(ngx.HTTP_OK)
end

local function listUser(args, uuid)
    if settings then
        if settings.storage_type == "disk" then
            local file, err = io.open(configPath .. "data/users.json", "rb")
            if file == nil then
                ngx.say(cjson.encode({
                    data = "Couldn't read file: " .. err
                }))
                ngx.exit(ngx.HTTP_OK)
            else
                local jsonString = file:read "*a"
                file:close()
                local users = cjson.decode(jsonString)
                for key, value in pairs(users) do
                    if users[key]["id"] == uuid then
                        ngx.say({ cjson.encode({
                            data = value
                        }) })
                        ngx.exit(ngx.HTTP_OK)
                    end
                end
            end
        else
            local user, err = red:hget("users", uuid)
            if user then
                user = cjson.decode(user)
                ngx.say(cjson.encode({
                    data = user
                }))
                ngx.exit(ngx.HTTP_OK)
            end
            if err then
                ngx.say(cjson.encode({
                    data = err
                }))
                ngx.exit(ngx.HTTP_OK)
            end
        end
    end
end

local function createUpdateUser(body, uuid)
    local payloads = GetPayloads(body)
    local getUuid = uuid
    if not uuid then
        getUuid = Helper.generate_uuid()
        payloads.id = getUuid
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    if settings then
        if uuid ~= "" and uuid ~= nil then
            if settings.storage_type == "disk" then
                local users = createUserInDisk(payloads, uuid)
                ngx.say(cjson.encode({
                    data = users
                }))
                ngx.exit(ngx.HTTP_OK)
            else
                local redis_json = {}
                redis_json[getUuid] = cjson.encode(payloads)
                local inserted, err = red:hmset("users", redis_json)
                if inserted then
                    ngx.say(cjson.encode({
                        data = payloads
                    }))
                    ngx.exit(ngx.HTTP_OK)
                end
                if err then
                    ngx.say(cjson.encode({
                        data = err
                    }))
                    ngx.exit(ngx.HTTP_OK)
                end
            end
        else
            local users = createUserInDisk(payloads, uuid)
            if settings.storage_type == "disk" then
                ngx.say(cjson.encode({
                    data = users
                }))
                ngx.exit(ngx.HTTP_OK)
            end

            local redis_json = {}
            redis_json[getUuid] = cjson.encode(payloads)
            local inserted, err = red:hmset("users", redis_json)
            if inserted then
                ngx.say(cjson.encode({
                    data = payloads
                }))
                ngx.exit(ngx.HTTP_OK)
            end
            if err then
                ngx.say(cjson.encode({
                    data = err
                }))
                ngx.exit(ngx.HTTP_OK)
            end
        end
    end
end

local function deleteUserInDisk(uuid)
    local file, err = io.open(configPath .. "data/users.json", "rb")
    if file == nil then
        ngx.say(cjson.encode({
            data = "Couldn't read file: " .. err
        }))
        ngx.exit(ngx.HTTP_OK)
    else
        local jsonString = file:read "*a"
        file:close()
        local users = cjson.decode(jsonString)
        if type(uuid) == "string" then
            for key, value in pairs(users) do
                if users[key]["id"] == uuid then
                    table.remove(users, key)
                end
            end
        elseif type(uuid) == "table" then
            for uuidK, id in pairs(uuid) do
                for key, value in pairs(users) do
                    if users[key]["id"] == id then
                        table.remove(users, key)
                    end
                end
            end
        end
        return users
    end
end

local function deleteUsers(args, uuid)
    local payloads = GetPayloads(args)
    local restUsers = {}
    if settings then
        if uuid ~= "" and uuid ~= nil then
            if settings.storage_type == "disk" then
                restUsers = deleteUserInDisk(uuid)
            else
                local del, err = red:hdel("users", uuid)
                if del then
                    restUsers = del
                end
                if err then
                    ngx.say(cjson.encode({
                        data = err
                    }))
                    ngx.exit(ngx.HTTP_OK)
                end
            end
        elseif payloads and payloads.ids and #payloads.ids > 0 then
            if settings then
                if settings.storage_type == "disk" then
                    restUsers = deleteUserInDisk(payloads.ids)
                else
                    for value = 1, #payloads.ids do
                        restUsers = red:hdel("users", payloads.ids[value])
                    end
                end
            end
        end
        if settings.storage_type == "disk" then
            local writableFile, writableErr = io.open(configPath .. "data/users.json", "w")
            if writableFile == nil then
                ngx.say(cjson.encode({
                    data = "Couldn't write file: " .. writableErr
                }))
                ngx.exit(ngx.HTTP_OK)
            else
                writableFile:write(cjson.encode(restUsers))
                writableFile:close()
            end
        end
        ngx.say(cjson.encode({
            data = (type(restUsers) == "table" and restUsers or { restUsers })
        }))
        ngx.exit(ngx.HTTP_OK)
    end
end
-- HTTP Request rules:
local function listRules(args)
    local exist_values = {}
    local allRules, keys, totalRecords = {}, {}, 0
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)
    if qParams.filter ~= nil then
        local filter = qParams.filter
        if filter.profile_id ~= nil then
            environment = filter.profile_id
        end
    end
    if settings then
        if settings.storage_type == "disk" then
            allRules, totalRecords = listFromDisk("rules/" .. environment, pageSize, pageNumber, qParams)
        else
            -- allRules, totalRecords = listFromDisk("rules/" .. environment, pageSize, pageNumber, qParams)
            -- if allRules == nil or totalRecords == 0 then
            allRules, totalRecords = listWithPagination("request_rules_" .. environment, "0", pageSize, pageNumber,
                qParams)
            -- end
        end
    end
    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allRules, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allRules, Helper.sortAsc(qParams.sort.field))
    end
    ngx.say({ cjson.encode({
        data = allRules,
        total = totalRecords
    }) })
end

local function listRule(args, uuid)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    if settings then
        if settings.storage_type == "disk" then
            local jsonData, dataErr = getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. uuid .. ".json")
            if dataErr == nil then
                local resultData = cjson.decode(jsonData)
                if resultData.match.rules.jwt_token_validation_value ~= nil and
                    resultData.match.rules.jwt_token_validation_key ~= nil then
                    resultData.match.rules.jwt_token_validation_key =
                    Base64.decode(resultData.match.rules.jwt_token_validation_key)
                end
                if resultData.match.rules.amazon_s3_access_key then
                    resultData.match.rules.amazon_s3_access_key = Base64.decode(resultData.match.rules.amazon_s3_access_key)
                end
                if resultData.match.rules.amazon_s3_secret_key then
                    resultData.match.rules.amazon_s3_secret_key = Base64.decode(resultData.match.rules.amazon_s3_secret_key)
                end
                ngx.say(cjson.encode({
                    data = resultData
                }))
            else
                ngx.status = ngx.HTTP_BAD_REQUEST
                ngx.say(cjson.encode({
                    data = {
                        message = "Error" .. dataErr
                    }
                }))
            end
        else
            -- local exist_value, Rerr = getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. uuid .. ".json")
            -- if exist_value == nil or Rerr then
            local exist_value, Rerr = red:hget("request_rules_" .. envProfile, uuid)
            -- end
            exist_value = cjson.decode(exist_value)
            -- if exist_value.match.response.message then
            --     exist_value.match.response.message = Base64.decode(exist_value.match.response.message)
            -- end

            if exist_value.match.rules.jwt_token_validation_value ~= nil and
                exist_value.match.rules.jwt_token_validation_key ~= nil then
                exist_value.match.rules.jwt_token_validation_key =
                    Base64.decode(exist_value.match.rules.jwt_token_validation_key)
            end
            if exist_value.match.rules.amazon_s3_access_key then
                exist_value.match.rules.amazon_s3_access_key = Base64.decode(exist_value.match.rules.amazon_s3_access_key)
            end
            if exist_value.match.rules.amazon_s3_secret_key then
                exist_value.match.rules.amazon_s3_secret_key = Base64.decode(exist_value.match.rules.amazon_s3_secret_key)
            end

            ngx.say({ cjson.encode({
                data = exist_value
            }) })
        end
    end
    -- end
end

function GetPayloads(body)
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

local function createDeleteRules(body, uuid)
    local payloads = GetPayloads(body)
    if payloads == ngx.null or not body or type(payloads) == "nil" then
        payloads = ngx.req.get_uri_args()
    end
    local envProfile = "prod"
    if payloads.ids ~= nil then
        envProfile = payloads.ids.envProfile
    else
        envProfile = payloads.envProfile
    end
    if uuid ~= "" and uuid ~= nil then
        if settings then
            if settings.storage_type == "disk" then
                os.remove(configPath .. "data/rules/" .. envProfile .. "/" .. uuid .. ".json")
            else
                deleteRuleFromServer(uuid, envProfile)
                red:hdel("request_rules_" .. envProfile, uuid)
            end
        end
    elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            if settings then
                if settings.storage_type == "redis" then
                    deleteRuleFromServer(payloads.ids.ids[value], envProfile)
                    red:hdel("request_rules_" .. envProfile, payloads.ids.ids[value])
                else
                    os.remove(configPath .. "data/rules/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
                    local command = "rm -f " ..
                        configPath .. "data/rules/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json"
                    os.execute(command)
                end
            end
        end
    end

    ngx.say(cjson.encode({
        data = payloads
    }))
end

function CreateUpdateRecord(json_val, uuid, key_name, folder_name, method)
    local formatResponse = {}
    json_val['data'] = nil
    for k, v in pairs(json_val) do
        if v == nil or v == "" then
            json_val[k] = nil
        end
    end

    local envProfile = "prod"
    if json_val.profile_id ~= nil then
        envProfile = json_val.profile_id
    end
    if folder_name == "rules" and json_val.match.rules.jwt_token_validation_value ~= nil and
        json_val.match.rules.jwt_token_validation_key ~= nil then
        json_val.match.rules.jwt_token_validation_key = Base64.encode(json_val.match.rules.jwt_token_validation_key)
        if json_val.match.rules.amazon_s3_access_key then
            json_val.match.rules.amazon_s3_access_key = string.gsub(json_val.match.rules.amazon_s3_access_key, "%%2B", "+")
            json_val.match.rules.amazon_s3_access_key = Base64.encode(json_val.match.rules.amazon_s3_access_key)
        end
        if json_val.match.rules.amazon_s3_secret_key then
            json_val.match.rules.amazon_s3_secret_key = string.gsub(json_val.match.rules.amazon_s3_secret_key, "%%2B", "+")
            json_val.match.rules.amazon_s3_secret_key = Base64.encode(json_val.match.rules.amazon_s3_secret_key)
        end
    end
    if key_name == 'servers' and json_val.config then
        json_val.config = Base64.encode(json_val.config)
    end
    if folder_name == 'rules' and json_val.match and json_val.match.response and json_val.match.response.message then
        json_val.match.response.message = string.gsub(json_val.match.response.message, "%%2B", "+")
    end

    local redis_json, domainJson = {}, {}
    if key_name == 'servers' and json_val.server_name then
        local getDomain = ""
        if settings.storage_type == "redis" then
            getDomain = red:hget(key_name .. "_" .. envProfile, json_val.id)
        else
            getDomain = getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. json_val.id .. ".json")
        end
        if getDomain and getDomain ~= nil and type(getDomain) == "string" and method == "create" then
            ngx.status = ngx.HTTP_CONFLICT
            formatResponse = {
                message = string.format(
                    "Server name %s is alredy exist either you need to delete that, or you can update the same record.",
                    json_val.server_name)
            }
            return formatResponse
        end
        if method == "update" and json_val.id ~= "host:" .. json_val.server_name then
            local previousDomain = ""
            if settings.storage_type == "redis" then
                previousDomain = red:hget(key_name .. "_" .. envProfile, "host:" .. json_val.server_name)
            else
                previousDomain = getDataFromFile(configPath ..
                    "data/servers/" .. envProfile .. "/host:" .. json_val.server_name .. ".json")
            end
            if previousDomain and previousDomain ~= nil and type(previousDomain) == "string" then
                ngx.status = ngx.HTTP_CONFLICT
                formatResponse = {
                    message = string.format(
                        "Server name %s is alredy exist either you need to delete that, or you can update the same record.",
                        json_val.server_name)
                }
                return formatResponse
            end
        end
    end
    if key_name == 'servers' and json_val.rules ~= nil and type(json_val.rules) ~= "userdata" and json_val.rules then
        updateServerInRules(json_val.rules, json_val.id, "rules", envProfile)
    end

    if key_name == "servers" and json_val.match_cases ~= nil and type(next(json_val.match_cases)) ~= nil then
        for index, case in ipairs(json_val.match_cases) do
            updateServerInRules(case.statement, json_val.id, "statement", envProfile)
        end
    end

    local filePathDir = configPath .. "data/" .. folder_name .. "/" .. envProfile
    local nginxTenantConfDir = settings.nginx.tenant_conf_path or "/opt/nginx/conf.d"
    local rebootFilePath = settings.nginx.reboot_file_path or "/tmp/nginx/nginx-reboot-required"
    -- HS 28/08/2024 This part of the code need to be refactor or optimise
    if settings.storage_type == "redis" then
        redis_json[uuid] = cjson.encode(json_val)
        red:hmset(key_name .. "_" .. envProfile, redis_json)
    end
    setDataToFile(filePathDir .. "/" .. uuid .. ".json", json_val, filePathDir)
    if key_name == "servers" then
        local configString = Base64.decode(json_val.config)
        setDataToFile(filePathDir .. "/conf/" .. json_val.server_name .. ".conf", cleanString(configString), filePathDir .. "/conf", "conf")
        if json_val.config_status then
            if fileExists(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf") == false then
                Conf.saveConfFiles(nginxTenantConfDir, cleanString(configString), json_val.server_name .. ".conf")
                local nginxStatus, commandStatus = Helper.testNginxConfig()
                local isSuccess = Helper.isStringContains("nginx.conf syntax is ok", nginxStatus)
                json_val.nginx_status = nginxStatus
                if isSuccess then
                    Conf.CreateNginxFlag(rebootFilePath)
                else
                    json_val.config_status = false
                    setDataToFile(filePathDir .. "/" .. uuid .. ".json", json_val, filePathDir)
                    os.remove(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf")
                end
            else
                local sourceFilePath = filePathDir .. "/conf/" .. json_val.server_name .. ".conf"
                local destinationFilePath = nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf"
                local isFilesSame = Conf.compareFiles(sourceFilePath, destinationFilePath)
                if isFilesSame == false then
                    Conf.saveConfFiles(nginxTenantConfDir, cleanString(configString), json_val.server_name .. ".conf")
                    local nginxStatus, commandStatus = Helper.testNginxConfig()
                    local isSuccess = Helper.isStringContains("nginx.conf syntax is ok", nginxStatus)
                    json_val.nginx_status = nginxStatus
                    if isSuccess then
                        Conf.CreateNginxFlag(rebootFilePath)
                    else
                        json_val.config_status = false
                        setDataToFile(filePathDir .. "/" .. uuid .. ".json", json_val, filePathDir)
                        os.remove(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf")
                    end
                end
            end
        else
            if fileExists(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf") then
                os.remove(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf")
            end
        end
    end
    ngx.status = ngx.HTTP_OK
    return json_val
end

local function createUpdateRules(body, uuid)
    local payloads, response = GetPayloads(body), {}
    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    if uuid then
        response = CreateUpdateRecord(payloads, uuid, "request_rules", "rules", "update")
    else
        payloads.id = Helper.generate_uuid()
        response = CreateUpdateRecord(payloads, payloads.id, "request_rules", "rules", "create")
    end
    ngx.say(cjson.encode({
        data = response
    }))
end

local function listSessions(args)
    local counter = 0
    local params = args
    params = params.params
    local allsessions, sessions = {}, {}
    local records = {}
    if settings.storage_type == "redis" then
    local exist_values, err = red:scan(0, "match", "session:*") -- red:keys("session:*")
    if exist_values[2] ~= nil then
        for key, value in pairs(exist_values[2]) do
            -- if key % 2 == 0 then
            table.insert(records, {
                session_id = value,
                id = key,
                subject = 'Redacted',
                timeout = 'Redacted',
                quote = 'Redacted'
            })
            -- end
        end
    end
    end
    local getAllRecords = records
    if type(getAllRecords) == "string" then
        allsessions = cjson.decode(getAllRecords)
    else
        allsessions = getAllRecords
    end
    local qParams = cjson.decode(params)
    local perPage = qParams.pagination.perPage * qParams.pagination.page
    local page = perPage - (qParams.pagination.perPage - 1)
    for index, server in pairs(allsessions) do
        counter = counter + 1
        if counter >= page and counter <= perPage then
            table.insert(sessions, server)
        end
    end
    if qParams.sort.order == "DESC" then
        -- table.sort(sessions, sortDesc(qParams.sort.field))
    else
        -- table.sort(sessions, sortAsc(qParams.sort.field))
    end
    if counter < 1 then
        return ngx.say(cjson.encode({
            data = {},
            total = 0
        }))
    end
    return ngx.say(cjson.encode({
        data = sessions,
        total = counter
    }))
end

-- Settings section

local function listSettings(args, uuid)
    local settingsLogo = red:hget("company_logo", uuid)
    if settingsLogo and settingsLogo ~= "null" and type(settingsLogo) == "string" then
        ngx.say(cjson.encode({
            data = cjson.decode(settingsLogo)
        }))
    end
end

local function createUpdateSettings(body, uuid)
    body = GetPayloads(body)
    local settingsJson, settingUUID = {}, uuid
    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        body.created_at = os.time(os.date("!*t"))
        body.id = Helper.generate_uuid()
        settingUUID = body.id
    end
    settingsJson[settingUUID] = cjson.encode(body)
    local savingToRedis = red:hmset("company_logo", settingsJson)
    if savingToRedis and savingToRedis ~= nil and type(savingToRedis) == "string" then
        return ngx.say(cjson.encode({
            data = body
        }))
    end
end

-- Import rules and servers from json file
local function importProjects(args)
    args = GetPayloads(args)
    local envProfile = args.envProfile ~= nil and args.envProfile or "prod"
    local response, formattedJson = nil, {}
    local redisKey = args.dataType == "rules" and "request_rules" or args.dataType
    for key, value in pairs(args.data) do
        envProfile = value.profile_id
        local pathDir = configPath .. "data/" .. args.dataType .. "/" .. value.profile_id
        if settings.storage_type == "redis" then
            formattedJson[value.id] = cjson.encode(value)
            red:hmset(redisKey .. "_" .. value.profile_id, formattedJson)
            response = setDataToFile(
                pathDir .. "/" .. value.id .. ".json", value, pathDir)
        else
            response = setDataToFile(
                pathDir .. "/" .. value.id .. ".json", value, pathDir)
        end
    end
    ngx.say(cjson.encode({
        data = envProfile
    }))
end

-- Hanlde the Profiles settings

local function handleUpdateCreateProfiles(body, uuid)
    local successCreation, errorCreation = nil, nil
    if uuid == nil then
        local folderPath = configPath .. "data/rules/" .. body.name
        local parent = folderPath:match("^(.*)/[^/]+/?$")
        if parent and not isDir(parent) then
            createDirectoryRecursive(parent)  -- Recursively create parent directories
        end
        successCreation, errorCreation = createDirectoryRecursive(folderPath)
    elseif uuid ~= nil then
        local oldPath, newPath = configPath .. "data/rules/" .. uuid, configPath .. "data/rules/" .. body.name
        -- Rename the directory using the shell command
        local command = string.format("mv %s %s", oldPath, newPath)
        successCreation, errorCreation = os.execute(command)
    end
    return successCreation, errorCreation
end

local function listDirectories(path, pageSize, pageNumber, qParams)
    local directories = {}
    local pathAttr = lfs.attributes(path)
    if pathAttr ~= nil and pathAttr.mode == "directory" then
        for dir in lfs.dir(path) do
            if dir ~= "." and dir ~= ".." then
                local dirPath = path .. "/" .. dir
                local attr = lfs.attributes(dirPath)
    
                if attr and attr.mode == "directory" then
                    local createdAt = os.date("%Y-%m-%d %H:%M:%S", attr.change)
                    table.insert(directories, { id = tostring(dir), name = dir, createdAt = createdAt })
                end
            end
        end
        local data, count = listPaginationLocal(directories, pageSize, pageNumber, qParams)
        return data, count
    else 
        return {}, 0
    end
end

local function listProfiles(args)
    local params, allProfiles, totalRecords = args, {}, 0
    local qParams = {}
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {}
        }
    else
        qParams = cjson.decode(params)
    end
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)
    allProfiles, totalRecords = listDirectories(configPath .. "data/rules", pageSize, pageNumber, qParams)
    ngx.say(
        cjson.encode({
            data = allProfiles,
            total = totalRecords
        }))
end
local function listProfile(args, uuid)
    local dirPath = configPath .. "data/rules/" .. uuid
    local attr = lfs.attributes(dirPath)
    ngx.say(cjson.encode({
        data = {
            name = uuid,
            pathUuid = uuid,
            directoryAttr = attr
        }
    }))
end

local function createUpdateProfiles(body, uuid)
    body = GetPayloads(body)
    local successCreate, errorCreate = handleUpdateCreateProfiles(body, uuid)
    if successCreate then
        ngx.status = ngx.HTTP_OK
        ngx.say(cjson.encode({
            data = {
                message = "Success.",
                status = ngx.HTTP_OK
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    else
        ngx.status = ngx.HTTP_BAD_REQUEST
        ngx.say(cjson.encode({
            data = {
                message = "Error:",
                errorCreate,
                status = ngx.HTTP_BAD_GATEWAY
            }
        }))
    end
end

local function updateProfileSettings(args)
    local payloads = GetPayloads(args)
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

local function readFile(filePath)
    local file = io.open(filePath, "r")
    if not file then return nil end
    local content = file:read("*a")
    file:close()
    return content
end

local function listFiles(directory)
    local files = {}
    local totalFiles = 0

    for file in lfs.dir(directory) do
        if file ~= "." and file ~= ".." then
            local fullPath = directory .. '/' .. file
            local attr = lfs.attributes(fullPath)
            if attr.mode == "file" then
                table.insert(files, {
                    name = fullPath,
                    content = readFile(fullPath)
                })
                totalFiles = totalFiles + 1
            elseif attr.mode == "directory" then
                -- Recursively list files in subdirectories
                local subFiles, subTotal = listFiles(fullPath)
                for _, subFile in ipairs(subFiles) do
                    table.insert(files, subFile)
                end
                totalFiles = totalFiles + subTotal
            end
        end
    end
    return files, totalFiles
end

local function listServerConf(args)
    local profile = args.profile
    local dirPath = configPath .. "data/servers/" .. profile .. "/conf"
    local files, total = listFiles(dirPath)
    return ngx.say(cjson.encode({
        data = files,
        total = total
    }))
end

local function handle_get_request(args, path)
    -- handle GET request logic
    local delimiter = "/"
    local subPath = {}
    for substring in string.gmatch(path, "[^" .. delimiter .. "]+") do
        table.insert(subPath, substring)
    end
    local pattern = ".*/(.*)"
    local uuid = string.match(path, pattern)

    if path == "servers" then
        listServers(args)
    elseif uuid and string.match(uuid, "^host:") and subPath[1] == "servers" then
        listServer(args, uuid)
    end

    if path == "users" then
        listUsers(args)
    elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "users" then
        listUser(args, uuid)
    end

    if path == "rules" then
        listRules(args)
    elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "rules" then
        listRule(args, uuid)
    end

    if path == "sessions" then
        listSessions(args)
        -- elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "sessions" then
        --     listSession(args, uuid)
    end
    if path == "conf" then
        listServerConf(args)
    end
    if path == "global/settings" then
        local settingsData = settings
        settingsData.dns_resolver = nil
        settingsData.env_vars = nil
        settingsData.consul = nil
        settingsData.super_user = nil
        settingsData.nginx = nil
        settingsData.redis_host = nil
        settingsData.redis_port = nil
        ngx.say(cjson.encode({
            data = settingsData
        }))
    end
    if path == "profiles" then
        listProfiles(args)
    elseif uuid and subPath[1] == "profiles" then
        listProfile(args, uuid)
    end
end

local function handle_post_request(args, path)
    -- handle POST request logic
    if path == "servers" then
        createUpdateServer(args)
    end
    if path == "users" then
        createUpdateUser(args)
    end
    if path == "rules" then
        createUpdateRules(args)
    end
    if path == "user/login" then
        login(args)
    end
    if path == "storage/management" then
        setStorage(args)
    end
    if path == "settings" then
        createUpdateSettings(args)
    end
    if path == "settings/profile" then
        updateProfileSettings(args)
    end
    if path == "projects/import" then
        importProjects(args)
    end
    if path == "profiles" then
        createUpdateProfiles(args, nil)
    end
end

-- Function to handle PUT requests
local function handle_put_request(args, path)
    -- handle PUT request logic
    local pattern = ".*/(.*)"
    local uuid = string.match(path, pattern)
    if not uuid or uuid == nil or uuid == "" then
        ngx.status = ngx.HTTP_BAD_REQUEST
        ngx.say(cjson.encode({
            data = {
                message = "The uuid must be present while updating the data."
            }
        }))
        ngx.exit(ngx.HTTP_BAD_REQUEST)
        return
    end
    if string.find(path, "servers") then
        createUpdateServer(args, uuid)
    end
    if string.find(path, "users") then
        createUpdateUser(args, uuid)
    end

    if string.find(path, "rules") then
        createUpdateRules(args, uuid)
    end
    if string.find(path, "settings") then
        createUpdateSettings(args, uuid)
    end
    if string.find(path, "profiles") then
        createUpdateProfiles(args, uuid)
    end
end

-- Function to handle DELETE requests
local function handle_delete_request(args, path)
    -- handle DELETE request logic
    local pattern = ".*/(.*)"
    local uuid = string.match(path, pattern)
    if string.find(path, "rules") then
        createDeleteRules(args, uuid)
    end
    if string.find(path, "servers") then
        createDeleteServer(args, uuid)
    end
    if string.find(path, "users") then
        deleteUsers(args, uuid)
    end
end

-- Get the path name from the URI
local path_name = ngx.var.uri:match("^/api/(.*)$")

-- Determine the request method and call the appropriate function
if ngx.req.get_method() == "GET" then
    handle_get_request(ngx.req.get_uri_args(), path_name)
elseif ngx.req.get_method() == "POST" then
    ngx.req.read_body()
    handle_post_request(ngx.req.get_post_args(), path_name)
elseif ngx.req.get_method() == "PUT" then
    ngx.req.read_body()
    handle_put_request(ngx.req.get_post_args(), path_name)
elseif ngx.req.get_method() == "DELETE" then
    ngx.req.read_body()
    handle_delete_request(ngx.req.get_post_args(), path_name)
else
    ngx.exit(ngx.HTTP_NOT_ALLOWED)
end
