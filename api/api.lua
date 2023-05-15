local cjson = require "cjson"
local jwt = require "resty.jwt"
local redis = require "resty.redis"
local red = redis:new()
red:set_timeout(1000) -- 1 second

local redisHost = os.getenv("REDIS_HOST")

if  redisHost == nil then
    redisHost = "redis-service.test.svc.cluster.local"
end

local ok, err = red:connect(redisHost, 6379)
if not ok then
    ngx.log(ngx.ERR, "failed to connect to Redis: ", err)
    return
end

local function generate_uuid()
    local random = math.random(1000000000)                                            -- generate a random number
    local timestamp = os.time()                                                       -- get the current time in seconds since the Unix epoch
    local hash = ngx.md5(tostring(random) .. tostring(timestamp))                     -- create a hash of the random number and timestamp
    local uuid = string.format("%s-%s-%s-%s-%s", string.sub(hash, 1, 8), string.sub(hash, 9, 12),
        string.sub(hash, 13, 16), string.sub(hash, 17, 20), string.sub(hash, 21, 32)) -- format the hash as a UUID
    return uuid
end

local function is_uuid(str)
    local uuid_pattern = "^([0-9a-fA-F]-){4}[0-9a-fA-F]-([0-9a-fA-F]-){3}[0-9a-fA-F]$"
    return string.match(str, uuid_pattern) ~= nil
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
    return jwt:sign(
        "HCsKpxQ4hU97V5us5TCwvLnAVBgLqNd1dP2R-4Uywg7946J3zAqT9EOA5hdWRCQn",
        {
            header = { typ = "JWT", alg = "HS256" },
            payload = { sub = "123456", exp = ngx.time() + 3600 }
        }
    )
end

-- Authentication

local function login(args)
    local file, err = io.open("/usr/local/openresty/nginx/html/data/settings.json", "rb")
    if file == nil then
        ngx.say("Couldn't read file: " .. err)
    else
        local jsonString = file:read "*a"
        file:close()
        local settings = cjson.decode(jsonString)
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

-- Servers APIs

-- local function listServers()
--     local files = {}
--     -- Run the 'ls' command to get a list of filenames
--     local output, error = io.popen("ls /usr/local/openresty/nginx/html/data/servers"):read("*all")

--     for filename in string.gmatch(output, "[^\r\n]+") do
--         table.insert(files, filename)
    --     end
--     local localFilesCount = #files
--     local getAllRecords, allServers, readFromLocal, redServers = {}, {}, true, {}
--     getAllRecords = red:get("servers");
--     if type(getAllRecords) == "string" then
--         allServers = cjson.decode(getAllRecords)
--         for index, server in pairs(allServers) do
--             table.insert(redServers, server)
--         end
--     end

--     do return ngx.say(#redServers) end
--     -- if localFilesCount == redisFilesCount then
--     --     readFromLocal = true
--     -- else
--     --     for key, value in ipairs(allServers) do
--     --         do return ngx.say(cjson.encode(value)) end
--     --     end
--     --     os.execute("rm /usr/local/openresty/nginx/html/data/servers/*")
--     -- end
--     local jsonData = {}
--     if readFromLocal then
--         for _, filename in ipairs(files) do
--             local file, err = io.open("/usr/local/openresty/nginx/html/data/servers/" .. filename, "rb")
--             if file == nil then
--                 ngx.say("Couldn't read file: " .. err)
--             else
--                 local jsonString = file:read "*a"
--                 file:close()
--                 local servers = cjson.decode(jsonString)

--                 jsonData[_] = servers
--             end
--         end
--     end
--     return ngx.say(cjson.encode({ data = jsonData, total = 3 }))
-- end

local function listServers()
    local getAllRecords = red:get("servers");
    local allServers, servers = {}, {}
    if type(getAllRecords) == "string" then
        allServers = cjson.decode(getAllRecords)
        for index, server in pairs(allServers) do
            table.insert(servers, server)
        end
        return ngx.say(cjson.encode({ data = servers, total = #servers }))
    end
end

local function listServer(args, id)
    local file, err = io.open("/usr/local/openresty/nginx/html/data/servers/" .. id .. ".json", "rb")
    if file == nil then
        ngx.say("Couldn't read file: " .. err)
    else
        local jsonString = file:read "*a"
        file:close()
        local jsonData = cjson.decode(jsonString)
        ngx.say(cjson.encode({ data = jsonData }))
    end
end

local function createUpdateServer(body, uuid)
    local serverId = uuid
    if not uuid then
        serverId = generate_uuid()
    end
    local file, err = io.open("/usr/local/openresty/nginx/html/data/servers/" .. serverId .. ".json", "w")
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
    payloads.id = serverId
    if file then
        -- Write the JSON data to the file
        local allServers = {}
        local getAllRecords = {}
        file:write(cjson.encode(payloads))
        -- Close the file
        file:close()
        getAllRecords = red:get("servers");
        if type(getAllRecords) == "string" then
            allServers = cjson.decode(getAllRecords)
        end
        allServers[serverId] = payloads
        local res, redErr = red:set("servers", cjson.encode(allServers))
        if not res then
            ngx.status = 500
            ngx.say("Failed to save JSON data to Redis: ", redErr)
            return
        end
        return ngx.say(cjson.encode({ data = { id = serverId } }))
    else
        ngx.say("Error opening file", err)
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
                ngx.say({ cjson.encode({ data = value }) })
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
            ngx.say(cjson.encode({ data = payloads }))
        end
    end
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
        listServers()
    elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "servers" then
        listServer(args, uuid)
    end

    if path == "users" then
        listUsers()
    elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "users" then
        listUser(args, uuid)
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
    if path == "user/login" then
        login(args)
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
end

-- Function to handle DELETE requests
local function handle_delete_request(args, path)
    -- handle DELETE request logic
    local response_data = { message = "Hello, DELETE request!" }
    ngx.say(cjson.encode(response_data))
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
