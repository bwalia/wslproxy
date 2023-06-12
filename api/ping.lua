local cjson = require("cjson")

-- functions

function os.capture(cmd, raw) -- this function cannot be local
    local handle = assert(io.popen(cmd, 'r'))
    local output = assert(handle:read('*a'))
    
    handle:close()
    
    if raw then 
        return output 
    end
   
    output = string.gsub(
        string.gsub(
            string.gsub(output, '^%s+', ''), 
            '%s+$', 
            ''
        ), 
        '[\n\r]+',
        '<br>'
    )
   
   return output
end

local function shell_exec_output(cmd)
    result = os.capture(cmd)
    return result
    end
    
-- functions

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
    app = os.getenv("APP_NAME"),
    version = os.getenv("VERSION"),
    stack = os.getenv("STACK"),
    hostname = os.getenv("HOSTNAME"),
    response = "pong",
    deployment_time = os.getenv("DEPLOYMENT_TIME"),
    redis_host = redisHost,
    redis_status = db_connect_status,
    redis_status_msg = db_status_msg,
    node_uptime =  shell_exec_output("uptime"), -- "10:45:05 up  7:44,  0 users,  load average: 1.46, 1.18, 1.02"
    pod_uptime = os.date("%X", os.time() - os.getenv("DEPLOYMENT_TIME"))
}
-- Encode the table as a JSON string
json_str = cjson.encode(data)

ngx.say(json_str)