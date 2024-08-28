-- local cjson = require("cjson")
-- ngx.exit(ngx.HTTP_FORBIDDEN)
client_ip = ngx.var.remote_addr
client_ip='149.5.25.178'
local ip2location = require('ip2location')
local ip2loc = ip2location:new('/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN')
local result = ip2loc:get_all(client_ip)
country = ""
if result.country_short then country = result.country_short end
-- ngx.say("country: ", country)

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
txt = ""

function tablelength(T)
    local count = 0
    for _ in pairs(T) do count = count + 1 end
    return count
end

function check_conditions_loop(rules)

    local check_condition = 0
    for key,value in pairs(rules) do

        value = tostring(value)

        if key=='path' and value~=nil and value~='null' and string.match(ngx.var.request_uri, value)  then
            txt = txt .. "Rule Passed: " .. key .. " - " ..value .. "\n"
            check_condition = check_condition + 1
        end
        
        if key=='client_ip' and value == client_ip  then
            txt = txt .. "Rule Passed: " .. key .. " - " ..value .. "\n"
            check_condition = check_condition + 1
        end

        if key=='country' and value == country  then
            txt = txt .. "Rule Passed: " .. key .. " - " ..value .. "\n"
            check_condition = check_condition + 1
        end

    end
    return check_condition
    
end


function parse_rules(json_data,client_ip)
    if json_data and #json_data > 0 then
        for k,v in next,json_data do 
            -- txt = txt .. v.name
            local checkbreak = false
            if v.match.rules then
                for rule_k, rule_v in pairs(v.match.rules) do
                    rule_v = tostring(rule_v)
                    -- txt = txt .. rule_v 
                    if rule_v == nil or rule_v == 'userdata: NULL' or rule_v == NULL or rule_v=="" then
                        v.match.rules[rule_k] = nil
                    end
                end
                local total = tablelength(v.match.rules)
                local lookup = v.match.operator.lookup
                -- txt = txt .. total
                if total == 1 then
                    local n,t = pairs(v.match.rules)
                    local firstKey, firstValue = n(t)

                    firstValue = string.gsub(firstValue, "%\\", "")
                    -- txt = txt .. firstValue
                    if firstKey=='path' and lookup == 'prefix' and string.match(ngx.var.request_uri, firstValue)  then
                        txt = txt .. "Rule Passed: " .. firstKey .. " - " ..firstValue .. "\n"
                    elseif firstKey=='client_ip' and lookup == 'equals' and firstValue == client_ip  then
                        txt = txt .. "Rule Passed: " .. firstKey .. " - " ..firstValue .. "\n"
                    elseif firstKey=='country' and lookup == 'equals' and firstValue == country  then
                        txt = txt .. "Rule Passed: " .. firstKey .. " - " ..firstValue .. "\n"
                    else
                        txt = false
                        checkbreak = true
                        break
                    end
                    
                elseif total>1 and lookup == 'or' then
                    local check_condition = check_conditions_loop(v.match.rules)

                    if check_condition > 0 then
                        txt = txt .. "OR Condition satisfy \n"
                    else
                        txt = false
                        checkbreak = true
                        break
                    end

                elseif total>1 and lookup == 'and' then
                    local check_condition = check_conditions_loop(v.match.rules)

                    if check_condition == total then
                        txt = txt .. "AND Condition satisfy \n"
                    else
                        txt = false
                        checkbreak = true
                        break
                    end


                end

                -- for key,value in pairs(v.match.rules) do 
                --     if key=='path' and v.match.operator.lookup and v.match.operator.lookup == 'prefix' and string.match(ngx.var.request_uri, value)  then
                --         txt = txt .. "Rule Passed: " .. key .. " - " ..value .. "\n"
                --     elseif key=='client_ip' and v.match.operator.lookup and v.match.operator.lookup == 'equals' and value == client_ip  then
                --         txt = txt .. "Rule Passed: " .. key .. " - " ..value .. "\n"
                --     else
                --         txt = false
                --         checkbreak = true
                --         break
                --     end
                -- end                
            end
            
            if checkbreak == false and v.match.response.message then txt = txt .. "Response: " .. v.match.response.message .. "\n" end

            if checkbreak == false and v.match.response.redirect_uri then 
                txt = txt .. "redirect_uri: " .. v.match.response.redirect_uri .. "\n"                 
                -- ngx.redirect(v.match.response.redirect_uri) return
            end    
            
            if checkbreak == false and v.match.response.body_base64 then 
                txt = txt .. "body_base64: " .. Base64.decode(v.match.response.body_base64) .. "\n"
            end  


            if checkbreak then  break  end
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
    -- local country = result.country_short
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
