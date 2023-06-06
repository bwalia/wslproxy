local cjson = require "cjson"
local jwt = require "resty.jwt"
local redis = require "resty.redis"
local red = redis:new()
Base64 = require "base64"
red:set_timeout(1000) -- 1 second
local configPath = os.getenv("NGINX_CONFIG_DIR")
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
local redisHost = os.getenv("REDIS_HOST")

if redisHost == nil then
    redisHost = "localhost"
end

local ok, err = red:connect(redisHost, 6379)
if not ok then
    ngx.log(ngx.ERR, "failed to connect to Redis: ", err)
    return
end

local function sortAsc(field)
    return function(a, b)
        return a[field] < b[field]
    end
end
local function sortDesc(field)
    return function(a, b)
        return a[field] > b[field]
    end
end

local function generate_uuid()
    local random = math.random(1000000000) -- generate a random number
    local timestamp = os.time() -- get the current time in seconds since the Unix epoch
    local hash = ngx.md5(tostring(random) .. tostring(timestamp)) -- create a hash of the random number and timestamp
    local uuid = string.format("%s-%s-%s-%s-%s", string.sub(hash, 1, 8), string.sub(hash, 9, 12),
        string.sub(hash, 13, 16), string.sub(hash, 17, 20), string.sub(hash, 21, 32)) -- format the hash as a UUID
    return uuid
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

-- Authentication

local function login(args)
    local settings = getSettings()
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
            local session = require"resty.session".new()
            session:set_subject("OpenResty Fan")
            session:set("quote", "The quick brown fox jumps over the lazy dog")
            local ok, err = session:save()
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
    local settings = getSettings()
    if settings then
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
        local writableFile, writableErr = io.open(configPath .. "data/settings.json", "w")
        settings.storage_type = payloads.storage
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

-- Servers APIs

local function listFromDisk(directory)
    local files = {}
    -- Run the 'ls' command to get a list of filenames
    local output, error = io.popen("ls " .. configPath .. "data/" .. directory .. ""):read("*all")

    for filename in string.gmatch(output, "[^\r\n]+") do
        table.insert(files, filename)
    end

    local jsonData = {}
    for _, filename in ipairs(files) do
        local file, err = io.open(configPath .. "data/" .. directory .. "/" .. filename, "rb")
        if file == nil then
            -- ngx.say("Couldn't read file: " .. err)
            return ngx.say(cjson.encode({
                data = {},
                total = 0
            }))
        else
            local jsonString = file:read "*a"
            file:close()
            local data = cjson.decode(jsonString)

            jsonData[_] = data
        end
    end

    return jsonData
end

local function listServers(args)
    local counter = 0
    local params = args
    params = params.params
    local allServers, servers = {}, {}
    local settings = getSettings()
    if settings then
        if settings.storage_type == "disk" then
            allServers = listFromDisk("servers")
        else
            local exist_values, err = red:hgetall("servers")
            local records = {}
            for key, value in pairs(exist_values) do
                local check_key = exist_values[key - 1]
                if key % 2 == 0 and string.find(check_key, "server:") == nil then
                    table.insert(records, cjson.decode(value))
                end
            end
            local getAllRecords = records
            if type(getAllRecords) == "string" then
                allServers = cjson.decode(getAllRecords)
            else
                allServers = getAllRecords
            end
        end
    end
    local qParams = cjson.decode(params)
    local perPage = qParams.pagination.perPage * qParams.pagination.page
    local page = perPage - (qParams.pagination.perPage - 1)
    for index, server in pairs(allServers) do
        counter = counter + 1
        if counter >= page and counter <= perPage then
            table.insert(servers, server)
        end
    end
    if qParams.sort.order == "DESC" then
        -- table.sort(servers, sortDesc(qParams.sort.field))
    else
        -- table.sort(servers, sortAsc(qParams.sort.field))
    end
    if counter < 1 then
        return ngx.say(cjson.encode({
            data = {},
            total = 0
        }))
    end
    return ngx.say(cjson.encode({
        data = servers,
        total = counter
    }))
end

local function listServer(args, id)
    local settings = getSettings()
    if settings then
        if settings.storage_type == "disk" then
            local file, err = io.open(configPath .. "data/servers/" .. id .. ".json", "rb")
            if file == nil then
                -- ngx.say("Couldn't read file: " .. err)
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                local jsonString = file:read "*a"
                file:close()
                local jsonData = cjson.decode(jsonString)
                if jsonData.config then
                    jsonData.config = Base64.decode(jsonData.config)
                end
                ngx.say(cjson.encode({
                    data = jsonData
                }))
            end
        else
            local getAllRecords = red:hget("servers", id)
            local server = {}
            if type(getAllRecords) == "string" then
                server = cjson.decode(getAllRecords)
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

    local payloads = GetPayloads(body)
    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end

    if uuid then
        CreateUpdateRecord(payloads, uuid, "servers", "servers")
    else
        payloads.id = generate_uuid()
        CreateUpdateRecord(payloads, payloads.id, "servers", "servers")
    end

    ngx.say(cjson.encode({
        data = payloads
    }))
end

local function createDeleteServer(body, uuid)
    local serverId = uuid
    local payloads = GetPayloads(body)
    local settings = getSettings()
    if settings then
        if uuid ~= "" and uuid ~= nil then
            if settings.storage_type == "disk" then
                os.remove(configPath .. "data/servers/" .. uuid .. ".json")
            else
                local del, err = red:hdel("servers", uuid)
            end
        elseif payloads and payloads.ids and #payloads.ids > 0 then
            for value = 1, #payloads.ids do
                if settings.storage_type == "disk" then
                    os.remove(configPath .. "data/servers/" .. payloads.ids[value] .. ".json")
                else
                    local del, err = red:hdel("servers", payloads.ids[value])
                end
            end

        end
    end
    ngx.say(cjson.encode({
        data = {"success"}
    }))
end

-- Users APIs

local function createUserInDisk(payloads, uuid)
    local file, err = io.open(configPath .. "data/users.json", "rb")
    if file == nil then
        ngx.say(cjson.encode({
            data = {}
        }))
    else
        local jsonString = file:read "*a"
        file:close()
        local users = cjson.decode(jsonString)
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
        else
            writableFile:write(cjson.encode(users))
            writableFile:close()
            return payloads
        end
    end
end

local function listWithPagination(recordsKey, cursor, pageSize, pageNumber)
    local recordCount, totalRecords, records = 0, 0, {}
    -- Calculate the start and end indices for pagination
    local startIdx = (pageNumber - 1) * pageSize
    local endIdx = startIdx + pageSize - 1
    -- Get the total number of records
    local totalKeys, err = red:hlen(recordsKey)
    if not totalKeys then
        ngx.log(ngx.ERR, "Failed to retrieve total number of records: ", err)
        ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
    end
    ---@diagnostic disable-next-line: cast-local-type
    totalRecords = tonumber(totalKeys)
    repeat
        local res, err = red:hscan(recordsKey, cursor, "COUNT", pageSize)
        if not res then
            ngx.log(ngx.ERR, "Failed to retrieve records: ", err)
            ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
        end
        cursor = res[1]
        -- Iterate over the returned records
        for i = 1, #res[2], 2 do
            local recordValue = res[2][i + 1]
            recordCount = recordCount + 1
            -- Store the record in the result table if within the desired range
            if recordCount >= startIdx + 1 and recordCount <= endIdx + 1 then
                table.insert(records, cjson.decode(recordValue))
            elseif recordCount > endIdx + 1 then
                -- Break the loop if we have retrieved enough records
                break
            end
        end
    until cursor == "0" or recordCount >= endIdx + 1
    return records, totalRecords
end

local function listUsers(args)
    local settings = getSettings()
    local users = {}
    local keys = {}
    local params = args
    params = params.params
    local qParams = cjson.decode(params)
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page -- Page number (starting from 1)

    -- Retrieve a page of records using HSCAN
    local cursor = "0"
    local recordCount, totalRecords = 0, 0
    if settings then
        if settings.storage_type == "disk" then
            local file, err = io.open(configPath .. "data/users.json", "rb")
            if file == nil then
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                local jsonString = file:read "*a"
                file:close()
                users = cjson.decode(jsonString)
            end
        else
            local recordsKey = "users"
            local records, totalCount = listWithPagination(recordsKey, cursor, pageSize, pageNumber)
            users = records
            totalRecords = totalCount
        end
    end
    if qParams.sort.order == "DESC" then
        table.sort(users, sortDesc(qParams.sort.field))
    else
        table.sort(users, sortAsc(qParams.sort.field))
    end
    ngx.say(cjson.encode({
        data = users,
        total = totalRecords
    }))
end

local function listUser(args, uuid)
    local settings = getSettings()
    if settings then
        if settings.storage_type == "disk" then
            local file, err = io.open(configPath .. "data/users.json", "rb")
            if file == nil then
                ngx.say(cjson.encode({
                    data = "Couldn't read file: " .. err
                }))
            else
                local jsonString = file:read "*a"
                file:close()
                local users = cjson.decode(jsonString)
                for key, value in pairs(users) do
                    if users[key]["id"] == uuid then
                        ngx.say({cjson.encode({
                            data = value
                        })})
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
            end
            if err then
                ngx.say(cjson.encode({
                    data = err
                }))
            end
        end
    end
end

local function createUpdateUser(body, uuid)
    local settings = getSettings()
    local payloads = GetPayloads(body)
    local getUuid = uuid
    if not uuid then
        getUuid = generate_uuid()
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
            else
                local redis_json = {}
                redis_json[getUuid] = cjson.encode(payloads)
                local inserted, err = red:hmset("users", redis_json)
                if inserted then
                    ngx.say(cjson.encode({
                        data = payloads
                    }))
                end
                if err then
                    ngx.say(cjson.encode({
                        data = err
                    }))
                end
            end
        else
            createUserInDisk(payloads, uuid)
            local redis_json = {}
            redis_json[getUuid] = cjson.encode(payloads)
            local inserted, err = red:hmset("users", redis_json)
            if inserted then
                ngx.say(cjson.encode({
                    data = payloads
                }))
            end
            if err then
                ngx.say(cjson.encode({
                    data = err
                }))
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
    local settings = getSettings()
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
            else
                writableFile:write(cjson.encode(restUsers))
                writableFile:close()
            end
        end
        ngx.say(cjson.encode({
            data = (type(restUsers) == "table" and restUsers or {restUsers})
        }))
    end
end
-- HTTP Request rules:
local function listRules(args)
    local exist_values = {}
    local settings = getSettings()
    local allRules, keys = {}, {}
    local params = args
    params = params.params
    local qParams = cjson.decode(params)
    if settings then
        if settings.storage_type == "disk" then
            exist_values = listFromDisk("rules")
        else
            exist_values, err = red:hgetall("request_rules")
        end
    end
    for key, value in pairs(exist_values) do
        if type(value) == "string" then
            if tonumber(key) % 2 == 0 then
                table.insert(keys, value)
                if type(value) == "string" then
                    local ruleObj = cjson.decode(value)
                    if next(qParams.filter) ~= nil then
                        if qParams.filter.id == ruleObj.id then
                            goto continue
                        end
                    end
                    table.insert(allRules, cjson.decode(value))
                    ::continue::
                end
            end
        elseif type(value) == "table" then
            if type(qParams.meta) == "table" then
                if qParams.meta.exclude == value.id then
                    goto continue
                end
            end
            table.insert(allRules, value)
            ::continue::
        end
    end
    ngx.say({cjson.encode({
        data = allRules,
        total = #allRules
    })})
end

local function listRule(args, uuid)
    local settings = getSettings()
    if settings then
        if settings.storage_type == "disk" then
            local file, err = io.open(configPath .. "data/rules/" .. uuid .. ".json", "rb")
            if file == nil then
                -- ngx.say("Couldn't read file: " .. err)
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                local jsonString = file:read "*a"
                file:close()
                local jsonData = cjson.decode(jsonString)
                if jsonData.match.response.message then
                    jsonData.match.response.message = Base64.decode(jsonData.match.response.message)
                end
                ngx.say(cjson.encode({
                    data = jsonData
                }))
            end
        else
            local exist_value, err = red:hget("request_rules", uuid)
            exist_value = cjson.decode(exist_value)
            if exist_value.match.response.message then
                exist_value.match.response.message = Base64.decode(exist_value.match.response.message)
            end

            ngx.say({cjson.encode({
                data = exist_value
            })})
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

local function has_value(tab, val)
    for value = 1, #tab do
        if tab[value] == val then
            local del, err = red:hdel("request_rules", val)
            return true
        end
    end

    return false
end

local function createDeleteRules(body, uuid)

    local payloads = GetPayloads(body)
    local settings = getSettings()

    if uuid ~= "" and uuid ~= nil then
        if settings then
            if settings.storage_type == "disk" then
                os.remove(configPath .. "data/rules/" .. uuid .. ".json")
            else
                local del, err = red:hdel("request_rules", uuid)
            end
        end
    elseif payloads and payloads.ids and #payloads.ids > 0 then
        for value = 1, #payloads.ids do
            if settings then
                if settings.storage_type == "disk" then
                    os.remove(configPath .. "data/rules/" .. payloads.ids[value] .. ".json")
                else
                    local del, err = red:hdel("request_rules", payloads.ids[value])
                end
            end
        end

    end

    ngx.say(cjson.encode({
        data = payloads
    }))
end

function CreateUpdateRecord(json_val, uuid, key_name, folder_name)
    json_val['data'] = nil
    for k, v in pairs(json_val) do
        if v == nil or v == "" then
            json_val[k] = nil
        end
    end
    if key_name == 'servers' and json_val.config then
        json_val.config = Base64.encode(json_val.config)
    end
    if key_name == 'rules' and json_val.match and json_val.match.response and json_val.match.response.message then
        json_val.match.response.message = Base64.encode(json_val.match.response.message)
    end

    local redis_json = {}

    if key_name == 'servers' and json_val.server_name then
        redis_json['server:' .. json_val.server_name] = cjson.encode(json_val)
    end
    redis_json[uuid] = cjson.encode(json_val)
    local inserted, err = red:hmset(key_name, redis_json)

    local file, err = io.open(configPath .. "data/" .. folder_name .. "/" .. uuid .. ".json", "w")
    if file == nil then
        ngx.say("Couldn't read file: " .. err)
    else
        file:write(cjson.encode(json_val))
        file:close()
        -- ngx.say(cjson.encode({ data = json_val }))
    end

end

local function createUpdateRules(body, uuid)
    local payloads = GetPayloads(body)
    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    if uuid then
        CreateUpdateRecord(payloads, uuid, "request_rules", "rules")
    else
        payloads.id = generate_uuid()
        CreateUpdateRecord(payloads, payloads.id, "request_rules", "rules")
    end
    ngx.say(cjson.encode({
        data = payloads
    }))
end

local function listSessions(args)
    local counter = 0
    local params = args
    params = params.params
    local allsessions, sessions = {}, {}
    local exist_values, err = red:scan(0, "match", "session:*") -- red:keys("session:*")
    local records = {}
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
    elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "servers" then
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
end

-- Function to handle PUT requests
local function handle_put_request(args, path)
    -- handle PUT request logic
    if string.find(path, "servers") then
        local pattern = ".*/(.*)"
        local uuid = string.match(path, pattern)
        createUpdateServer(args, uuid)
    end
    if string.find(path, "users") then
        local pattern = ".*/(.*)"
        local uuid = string.match(path, pattern)
        createUpdateUser(args, uuid)
    end

    if string.find(path, "rules") then
        local pattern = ".*/(.*)"
        local uuid = string.match(path, pattern)
        createUpdateRules(args, uuid)
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
