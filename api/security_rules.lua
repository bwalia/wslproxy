-- local cjson = require("cjson")
-- ngx.exit(ngx.HTTP_FORBIDDEN)
client_ip = ngx.var.remote_addr
client_ip='149.5.25.178'
-- ngx.say("Client IP: ", client_ip)

-- local handle = io.popen("wget -qO- ifconfig.co")
-- local result = handle:read("*a")
-- handle:close()
-- ngx.say(result)
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
    if json_data.data and #json_data.data > 0 then
        local txt = ""
        local checkbreak
        for k,v in next,json_data.data do 
            -- txt = txt .. v.name
            if v.match.rules then
                for key,value in pairs(v.match.rules) do 
                    if key=='path' and v.match.operator.lookup and v.match.operator.lookup == 'prefix' and string.match(ngx.var.request_uri, value)  then
                        txt = txt .. "Rule Passed: " .. key .. " - " ..value .. "\n"
                    else
                        txt = false
                        checkbreak = true
                        break
                    end
                end                
            end
            if v.priority == 0 or checkbreak then
                break
            end
        end
        return txt
    else
        return "Hello world, No rules found."
    end
end


-- local http = require("resty.http")
-- local httpc = http.new()
-- -- Send a GET request to httpbin.org/ip
-- local res, err = httpc:request_uri("http://httpbin.org/ip", {
--     method = "GET"
-- })
-- if res and res.status == 200 then
if client_ip then
    -- Parse the response JSON to extract the public IP address
    -- local json = require("cjson")
    -- local data = json.decode(res.body)
    -- local public_ip = data.origin
    -- ngx.say("Public IP: ", public_ip)

    -- local ip2location = require('ip2location')
    -- local ip2loc = ip2location:new('/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN')
    -- local result = ip2loc:get_all(client_ip)
    -- ngx.say("country_short: " .. result.country_short)
    -- ngx.say("country_long: " .. result.country_long)
    -- ngx.say("region: " .. result.region)
    -- ngx.say("city: " .. result.city)
    -- ngx.say("isp: " .. result.isp)
    -- ngx.say("latitude: " .. result.latitude)
    -- ngx.say("longitude: " .. result.longitude)
    -- ngx.say("domain: " .. result.domain)
    -- ngx.say("zipcode: " .. result.zipcode)
    -- ngx.say("timezone: " .. result.timezone)
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
    -- ip2loc:close()

    local file, err = io.open("/usr/local/openresty/nginx/html/data/security_rules.json")
    if file == nil then
        ngx.say("Hello world, json file not found. No rules found!")
    else
        local jsonString = file:read "*a"
        file:close()
        if tostring(jsonString) == "" then
            ngx.say("Hello world, json file is empty. No rules found!")
            return
        end
        local t = cjson.decode(tostring(jsonString))
        data = parse_rules(t,client_ip)
        if data == false then
            ngx.exit(ngx.HTTP_FORBIDDEN)
            return
        end
        ngx.say(data)
        
    end

    -- ngx.say(json_str)

else
    ngx.say("Failed to retrieve Client IP")
end




-- ngx.log(ngx.ERR,'Client IP not allowed')
-- ngx.say('Client IP not allowed')
