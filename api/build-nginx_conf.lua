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

function check_rules(rules)
    local txt_nginx = ""
    -- local country = tostring(rules.country)
    -- local client_ip = tostring(rules.client_ip)

    local chk_path = rules.path

    if chk_path and chk_path~=nil and type(chk_path) ~= "userdata" then
        local path = "~ ^"
        if rules.path_key == 'starts_with' then
            path = path .. "*"  .. rules.path .. "(.*)$"
        elseif rules.path_key == 'ends_with' then
            path = path .. rules.path .. "*"
        else 
            path = path .. rules.path
        end
        txt_nginx = txt_nginx .. '      location ' .. path .. '{ \n'

        txt_nginx = txt_nginx .. '      }\n\n'
    end

    -- if country and country~=nil and country~='null' then
        
    -- end

    -- if client_ip and client_ip~=nil and client_ip~='null' then
    --     if rules.client_ip == 'starts_with' then
    --         path = path .. "*"
    --     end
    -- end
    return txt_nginx
    
end


local exist_values, err = red:hscan("servers",0, "match","server:"..hostname)
if exist_values[2] and exist_values[2][2] then
    local jsonval = cjson.decode(exist_values[2][2])
    local rules = {}
    txt = txt .. "events { worker_connections  1024; } \n"
    txt = txt .. "http { \n server { \n"

    if jsonval.listen then
        txt = txt .. "      listen " .. jsonval.listen .." \n"
    end

    if jsonval.server_name then
        txt = txt .. "      server_name " .. jsonval.server_name .." \n"
    end

    if jsonval.rules then
        local ok = red:hget("request_rules", jsonval.rules)
        if ok~=nil then
            ok = cjson.decode(ok)
            if ok.match and ok.match.rules then 
                rules[jsonval.rules] = ok.match.rules 
                txt = txt .. check_rules(ok.match.rules)
            end
        end
    end
    
    if jsonval.match_cases then
        for index, case in ipairs(jsonval.match_cases) do
            if case.statement then
                local ok = red:hget("request_rules", case.statement)
                if ok~=nil then
                    ok = cjson.decode(ok)
                    if ok.match and ok.match.rules then rules[case.statement] = ok.match.rules end
                end
            end
        end
    end

    txt = txt .. "  } \n }"

    local wfile, werr = io.open("/tmp/nginx-".. hostname ..".conf", "w")
    if wfile == nil then
        ngx.say('File not written:'..werr)
        return
    end
    wfile:write(txt)
    wfile:close()


    ngx.say(cjson.encode(rules))    
    return
end




ngx.say('You are permitted!!')
-- this will replace the need for server block for each website. It will parse JSON and match host header and route to the backend server all in lua