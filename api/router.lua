-- Date: 2020/09/04
-- Author: Balinder Walia
-- Desc: Router for the API Gateway and CDN Frontend domains
-- Usage: This file is loaded by nginx.conf and is used to route requests to the appropriate backend service
-- All the servers hosts for TLS termination are defined in this lua file and dynamically routed based on the request headers
-- The ideas behind this approach are:
-- No need to reload nginx when adding new backend servers
-- No need to restart nginx when adding new backend servers
-- No need to restart nginx when removing backend servers
-- No need to restart nginx when changing the backend servers

local cjson = require "cjson"
local jwt = require "resty.jwt"
local redis = require "resty.redis"
local red = redis:new()
base64 = require "base64"
configPath = os.getenv("NGINX_CONFIG_DIR")
hostname = ngx.var.host
txt = "worker_processes  1; \n"
red:set_timeout(1000) -- 1 second

local redisHost = os.getenv("REDIS_HOST")

if redisHost == nil then
    redisHost = "localhost"
end

local ok, err = red:connect(redisHost, 6379)
if not ok then
    ngx.log(ngx.ERR, "failed to connect to Redis: ", err)
    return
end

-- function check_rules(rules)

--     local chk_path = rules.path
--     local pass = true
--     if chk_path and chk_path~=nil and type(chk_path) ~= "userdata" then
--         if rules.path_key == 'starts_with' and string.match(ngx.var.request_uri, chk_path) then
--             pass = false
--         elseif rules.path_key == 'ends_with' then
--         else 
--         end
--     end

--     -- if country and country~=nil and country~='null' then
        
--     -- end

--     -- if client_ip and client_ip~=nil and client_ip~='null' then
--     --     if rules.client_ip == 'starts_with' then
--     --         path = path .. "*"
--     --     end
--     -- end   
--     return pass 
-- end

string.startswith = function(self, str) 
    return self:find('^' .. str) ~= nil
end

function string:endswith(suffix)
    return self:sub(-#suffix) == suffix
end
local exist_values, err = red:hscan("servers",0, "match","server:"..hostname)
if exist_values[2] and exist_values[2][2] then
    local jsonval = cjson.decode(exist_values[2][2])
    local parse_rules = {}
    -- if jsonval.server_name then
    -- end

    if jsonval.rules then
        local ok = red:hget("request_rules", jsonval.rules)
        if ok~=nil then
            ok = cjson.decode(ok)
            if ok.match and ok.match.rules then 
                parse_rules[jsonval.rules] = ok.match.rules 

                -- check prefix and postfix URL
                local rules = ok.match.rules
                local chk_path = rules.path
                local pass = true
                local req_url = ngx.var.request_uri
                if chk_path and chk_path~=nil and type(chk_path) ~= "userdata" then
                    -- local starts = req_url:match(chk_path..'(.*)$')
                    -- local ends = req_url:match('^(.*)'..chk_path)
                    if rules.path_key == 'starts_with' and req_url:startswith(chk_path) ~= true then
                        pass = false 
                    elseif rules.path_key == 'ends_with' and req_url:endswith(chk_path) ~= true then
                        pass = false
                    elseif rules.path_key == 'equals' and chk_path~=req_url then
                        pass = false
                    end                  
                end

                
                 

                -- client IP check rules
                req_add = ngx.var.remote_addr
                req_add='149.5.25.178'
                local ip2location = require('ip2location')
                local ip2loc = ip2location:new('/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN')
                local result = ip2loc:get_all(req_add)
                country = ""
                if result.country_short then country = result.country_short end


                local client_ip = rules.client_ip

                if client_ip and client_ip~=nil and type(client_ip) ~= "userdata" then
                    if rules.client_ip_key == 'starts_with' and req_add:startswith(client_ip) ~= true then
                        pass = false 
                    elseif rules.client_ip_key ~= 'equals' and req_add==client_ip then
                        pass = false
                    end 
                end


                --check country 
                 if rules.country and rules.country~=nil and type(rules.country) ~= "userdata" then
                     if rules.country_key == 'equals' and rules.country~=country then
                         pass = false
                     end
                 end

                ngx.say(pass, country, client_ip) --
                return


            end
        end
    end
    
    -- if jsonval.match_cases then
    --     for index, case in ipairs(jsonval.match_cases) do
    --         if case.statement then
    --             local ok = red:hget("request_rules", case.statement)
    --             if ok~=nil then
    --                 ok = cjson.decode(ok)
    --                 if ok.match and ok.match.rules then parse_rules[case.statement] = ok.match.rules end
    --             end
    --         end
    --     end
    -- end

end




ngx.say('You are permitted!!')
return
-- this will replace the need for server block for each website. It will parse JSON and match host header and route to the backend server all in lua