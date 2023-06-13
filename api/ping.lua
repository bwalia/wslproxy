local cjson = require("cjson")

-- functions

function os.capture(cmd, raw) -- this function cannot be local
    local handle = assert(io.popen(cmd, 'r'))
    local output = assert(handle:read('*a'))
    handle:close()
    if raw then
        return output
    end
    output = string.gsub(string.gsub(string.gsub(output, '^%s+', ''), '%s+$', ''), '[\n\r]+', '<br>')
    return output
end

local function shell_exec_output(cmd)
    result = os.capture(cmd)
    return result
end

local function calculateDateDifference(dateString1, dateString2)
    if dateString1 ~= nil and dateString2 ~= nil then
        local year1, month1, day1, hour1, min1, sec1 = dateString1:match("(%d%d%d%d)(%d%d)(%d%d)(%d%d)(%d%d)(%d%d)")
        local year2, month2, day2, hour2, min2, sec2 = dateString2:match("(%d%d%d%d)(%d%d)(%d%d)(%d%d)(%d%d)(%d%d)")
    
        local time1 = os.time({
            year = year1,
            month = month1,
            day = day1,
            hour = hour1,
            min = min1,
            sec = sec1
        })
        local time2 = os.time({
            year = year2,
            month = month2,
            day = day2,
            hour = hour2,
            min = min2,
            sec = sec2
        })
    
        local diffInSeconds = os.difftime(time2, time1)
        local diffInDays = math.abs(diffInSeconds / (24 * 60 * 60))
        diffInDays = math.floor(diffInDays)
        return diffInDays
    end
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
local storageTypeOverride = os.getenv("STORAGE_TYPE")
if ok then
    db_connect_status = "pong"
    db_status_msg = "OK"
else
    ngx.say("failed to connect to " .. redisHost .. ": ", err)
    db_connect_status = "err"
    db_status_msg = err
end

local diffInDays = calculateDateDifference(os.getenv("VITE_DEPLOYMENT_TIME"), os.date("%Y%m%d%H%M%S"))
local json_str
local data = {
    app = os.getenv("APP_NAME"),
    version = os.getenv("VERSION"),
    stack = os.getenv("STACK"),
    hostname = os.getenv("HOSTNAME"),
    response = "pong",
    deployment_time = os.getenv("VITE_DEPLOYMENT_TIME"),
    redis_host = redisHost,
    redis_status = db_connect_status,
    redis_status_msg = db_status_msg,
    node_uptime = shell_exec_output("uptime -s"), -- "10:45:05 up  7:44,  0 users,  load average: 1.46, 1.18, 1.02"
    pod_uptime = diffInDays .. " days ago",
    storage_type = storageTypeOverride
}
-- Encode the table as a JSON string
json_str = cjson.encode(data)

ngx.say(json_str)
