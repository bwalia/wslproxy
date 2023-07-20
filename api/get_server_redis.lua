local redis = require "resty.redis"
local red = redis:new()
red:set_timeout(1000) -- 1 second
local redisHost = os.getenv("REDIS_HOST")

if redisHost == nil then
    redisHost = "localhost"
end

local ok, err = red:connect(redisHost, 6379)
if not ok then
    ngx.log(ngx.ERR, "failed to connect to Redis: ", err)
end

local function getCurrentServer()
    local getCurrentServer = nil
    getCurrentServer = red:hscan("servers", 0, "match", "host:" .. Hostname)
    if getCurrentServer[2] and getCurrentServer[2][2] then
        getCurrentServer = getCurrentServer[2][2]
    end
    return getCurrentServer
end

local function getFromRedis(key, id)
    local data, error = red:hget(key, id)
    if not data then
        return nil
    end
    -- Check if the field exists in the Redis hash
    if data == ngx.null then
        return nil
    else
        return data
    end
end

return {
    getCurrentServer = getCurrentServer(),
    getFromRedis = getFromRedis()
}