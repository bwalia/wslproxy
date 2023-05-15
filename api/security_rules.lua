-- local cjson = require("cjson")
-- ngx.exit(ngx.HTTP_FORBIDDEN)
local client_ip = ngx.var.remote_addr
ngx.say("Client IP: ", client_ip)

-- local host, port = "127.0.0.1", 100
-- local socket = require("socket")
-- local tcp = assert(socket.tcp())

-- tcp:connect(host, port);
-- --note the newline below
-- tcp:send("hello world\n");

-- while true do
--     local s, status, partial = tcp:receive()
--     ngx.say(s or partial)
--     if status == "closed" then break end
-- end
-- tcp:close()


local cjson = require("cjson")
local json_str
local data = ""

function parse_rules(json_data,public_ip)
    if json_data.data then
        local txt = ""
        local n = 0
        for k,v in next,json_data.data do 
            if v.match.client_ip and v.match.client_ip == public_ip then
                txt = txt .. "Client IP allowed!! publicIP: " .. v.match.client_ip
            end
            n = n + 1
        end
        return txt
    else
        return true
    end
end


local http = require("resty.http")
local httpc = http.new()
-- Send a GET request to httpbin.org/ip
local res, err = httpc:request_uri("http://httpbin.org/ip", {
    method = "GET"
})
if res and res.status == 200 then
    -- Parse the response JSON to extract the public IP address
    local json = require("cjson")
    local data = json.decode(res.body)
    local public_ip = data.origin
    ngx.say("Public IP: ", public_ip)

    local ip2location = require('ip2location')
    local ip2loc = ip2location:new('/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN')
    local result = ip2loc:get_all(public_ip)
    ngx.say("country_short: " .. result.country_short)
    ngx.say("country_long: " .. result.country_long)
    ngx.say("region: " .. result.region)
    ngx.say("city: " .. result.city)
    ngx.say("isp: " .. result.isp)
    ngx.say("latitude: " .. result.latitude)
    ngx.say("longitude: " .. result.longitude)
    ngx.say("domain: " .. result.domain)
    ngx.say("zipcode: " .. result.zipcode)
    ngx.say("timezone: " .. result.timezone)
    -- ngx.say("netspeed: " .. result.netspeed)
    -- ngx.say("iddcode: " .. result.iddcode)
    -- ngx.say("areacode: " .. result.areacode)
    -- ngx.say("weatherstationcode: " .. result.weatherstationcode)
    -- ngx.say("weatherstationname: " .. result.weatherstationname)
    -- ngx.say("mcc: " .. result.mcc)
    -- ngx.say("mnc: " .. result.mnc)
    -- ngx.say("mobilebrand: " .. result.mobilebrand)
    -- ngx.say("elevation: " .. result.elevation)
    -- ngx.say("usagetype: " .. result.usagetype)
    -- ngx.say("addresstype: " .. result.addresstype)
    -- ngx.say("category: " .. result.category)
    -- ngx.say("district: " .. result.district)
    -- ngx.say("asn: " .. result.asn)
    -- ngx.say("as: " .. result.as)
    ip2loc:close()

    local file, err = io.open("/usr/local/openresty/nginx/html/data/security_rules.json")
    if file == nil then
        local data = {
            error = err,
            message = "data not found!!",
            status = false
        }
        json_str = cjson.encode(data)
    else
        local jsonString = file:read "*a"
        file:close()
        local t = cjson.decode(tostring(jsonString))
        local data = {
            data = parse_rules(t,public_ip),
            message = "File read successfully!!",
            status = true
        }
        json_str = cjson.encode(data)
    end

    ngx.say(json_str)

else
    ngx.say("Failed to retrieve public IP")
end




-- ngx.log(ngx.ERR,'Client IP not allowed')
-- ngx.say('Client IP not allowed')
