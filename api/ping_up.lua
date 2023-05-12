local cjson = require("cjson")
local handle = io.popen("uptime")
local result = handle:read("*a")
handle:close()

local json_str
local data = {
    app = 'WhiteFalcon',
    version = "20230411134600",
    stack = "Lua 5.1",
    response = "pong",
    deployment_time = "20230510055429",
    up_time =  result -- "10:45:05 up  7:44,  0 users,  load average: 1.46, 1.18, 1.02"

}
-- Encode the table as a JSON string
json_str = cjson.encode(data)

ngx.say(json_str)