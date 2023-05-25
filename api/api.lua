local cjson = require "cjson"
local jwt = require "resty.jwt"
local redis = require "resty.redis"
local red = redis:new()
Base64 = require "base64"
red:set_timeout(1000) -- 1 second

local function getSettings()
    local readSettings, errSettings = io.open("/usr/local/openresty/nginx/html/data/settings.json", "rb")
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
    return jwt:sign("HCsKpxQ4hU97V5us5TCwvLnAVBgLqNd1dP2R-4Uywg7946J3zAqT9EOA5hdWRCQn", {
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
        local writableFile, writableErr = io.open("/usr/local/openresty/nginx/html/data/settings.json", "w")
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
    local output, error = io.popen("ls /usr/local/openresty/nginx/html/data/" .. directory .. ""):read("*all")

    for filename in string.gmatch(output, "[^\r\n]+") do
        table.insert(files, filename)
    end

    local jsonData = {}
    for _, filename in ipairs(files) do
        local file, err = io.open("/usr/local/openresty/nginx/html/data/" .. directory .. "/" .. filename, "rb")
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
                if key % 2 == 0 then
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
            local file, err = io.open("/usr/local/openresty/nginx/html/data/servers/" .. id .. ".json", "rb")
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
    if uuid ~= "" and uuid ~= nil then
        os.remove("/usr/local/openresty/nginx/html/data/servers/" .. uuid .. ".json")
        local del, err = red:hdel("servers", uuid)
    elseif payloads and payloads.ids and #payloads.ids > 0 then
        for value = 1, #payloads.ids do
            os.remove("/usr/local/openresty/nginx/html/data/servers/" .. payloads.ids[value] .. ".json")
            local del, err = red:hdel("servers", payloads.ids[value])
        end

    end
end

-- Users APIs

local function listUsers()
    local file, err = io.open("/usr/local/openresty/nginx/html/data/users.json", "rb")
    if file == nil then
        ngx.say("Couldn't read file: " .. err)
    else
        local jsonString = file:read "*a"
        file:close()
        local users = cjson.decode(jsonString)
        ngx.say(cjson.encode({
            data = users,
            total = 4
        }))
    end
end

local function listUser(args, uuid)
    local file, err = io.open("/usr/local/openresty/nginx/html/data/users.json", "rb")
    if file == nil then
        ngx.say("Couldn't read file: " .. err)
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
end

local function createUpdateUser(body, uuid)
    local file, err = io.open("/usr/local/openresty/nginx/html/data/users.json", "rb")
    if file == nil then
        ngx.say("Couldn't read file: " .. err)
    else
        local jsonString = file:read "*a"
        file:close()
        local users = cjson.decode(jsonString)
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

        if uuid then
            for key, value in pairs(users) do
                if users[key]["id"] == uuid then
                    users[key] = payloads
                end
            end
        else
            payloads.id = generate_uuid()
        end

        table.insert(users, payloads)
        local writableFile, writableErr = io.open("/usr/local/openresty/nginx/html/data/users.json", "w")
        if writableFile == nil then
            ngx.say("Couldn't write file: " .. writableErr)
        else
            writableFile:write(cjson.encode(users))
            writableFile:close()
            ngx.say(cjson.encode({
                data = payloads
            }))
        end
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
            if next(qParams.filter) ~= nil then
                if qParams.filter.id == value.id then
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
            local file, err = io.open("/usr/local/openresty/nginx/html/data/rules/" .. uuid .. ".json", "rb")
            if file == nil then
                -- ngx.say("Couldn't read file: " .. err)
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                local jsonString = file:read "*a"
                file:close()
                local jsonData = cjson.decode(jsonString)
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

    if uuid ~= "" and uuid ~= nil then
        os.remove("/usr/local/openresty/nginx/html/data/rules/" .. uuid .. ".json")
        local del, err = red:hdel("request_rules", uuid)
    elseif payloads and payloads.ids and #payloads.ids > 0 then

        for value = 1, #payloads.ids do
            os.remove("/usr/local/openresty/nginx/html/data/rules/" .. payloads.ids[value] .. ".json")
            local del, err = red:hdel("request_rules", payloads.ids[value])
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
    if json_val.config then
        json_val.config = Base64.encode(json_val.config)
    end
    if json_val.match and json_val.match.response and json_val.match.response.message then
        json_val.match.response.message = Base64.encode(json_val.match.response.message)
    end

    local redis_json = {}
    redis_json[uuid] = cjson.encode(json_val)
    local inserted, err = red:hmset(key_name, redis_json)

    local file, err = io.open("/usr/local/openresty/nginx/html/data/" .. folder_name .. "/" .. uuid .. ".json", "w")
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
        listUsers()
    elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "users" then
        listUser(args, uuid)
    end

    if path == "rules" then
        listRules(args)
    elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "rules" then
        listRule(args, uuid)
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
    -- local response_data = { message = path }
    -- ngx.say(cjson.encode(response_data))
    if string.find(path, "rules") then
        local pattern = ".*/(.*)"
        local uuid = string.match(path, pattern)
        createDeleteRules(args, uuid)
    end
    if string.find(path, "servers") then
        local pattern = ".*/(.*)"
        local uuid = string.match(path, pattern)
        createDeleteServer(args, uuid)
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
