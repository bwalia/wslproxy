local cjson = require("cjson")
local handle = io.popen("uptime")
local result = handle:read("*a")
handle:close()

local redis = require "resty.redis"
local red = redis:new()
red:set_timeouts(1000, 1000, 1000) -- 1 sec

local redisHost = os.getenv("REDIS_HOST")

if redisHost == nil then
    redisHost = "localhost"
end

local db_connect_status = "err"
local ok, err = red:connect(redisHost, 6379)
if ok then
    db_connect_status = "pong"
    db_status_msg = "OK"
else
    ngx.say("failed to connect to " .. redisHost .. ": ", err)
    db_connect_status = "err"
    db_status_msg = err
end

local json_str
local data = {
    app = 'WhiteFalcon',
    version = "20230411134600",
    stack = "Lua 5.1",
    response = "pong",
    deployment_time = "20230510055429",
    redis_status = db_connect_status,
    redis_status_msg = db_status_msg,
    uptime =  result -- "10:45:05 up  7:44,  0 users,  load average: 1.46, 1.18, 1.02"

}
-- Encode the table as a JSON string
json_str = cjson.encode(data)

ngx.say(json_str)