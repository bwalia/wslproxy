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
Base64 = require "base64"
ConfigPath = os.getenv("NGINX_CONFIG_DIR")
Hostname = ngx.var.host

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

local function check_rules(rules)

    local chk_path = rules.path
    local pass, failMessage = false, ""
    local req_url = ngx.var.request_uri
    if chk_path and chk_path ~= nil and type(chk_path) ~= "userdata" then
        if rules.path_key == 'starts_with' and req_url:startswith(chk_path) == true then
            pass = true
        elseif rules.path_key == 'ends_with' and req_url:endswith(chk_path) == true then
            pass = true
        elseif rules.path_key == 'equals' and chk_path == req_url then
            pass = true
        else
            pass, failMessage = false, string.format("Route does not match. Expected path is %s, but current is %s",
                chk_path, req_url)
        end
    end

    -- client IP check rules
    local req_add = ngx.var.remote_addr
    -- req_add = '117.245.73.99'
    local ip2location = require('ip2location')
    local ip2loc = ip2location:new('/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN')
    local result = ip2loc:get_all(req_add)
    local country = ""
    if result.country_short then
        country = result.country_short
    end

    local client_ip = rules.client_ip
    -- user data type is null
    if client_ip and client_ip ~= nil and type(client_ip) ~= "userdata" then
        if rules.client_ip_key == 'starts_with' and req_add:startswith(client_ip) == true then -- and req_add~=client_ipand  (req_add:startswith(client_ip) ~= true
            pass = true
        elseif rules.client_ip_key == 'equals' and req_add == client_ip then
            pass = true
        else
            pass, failMessage = false, string.format("Client IP does not match. Expected IP is %s, but your IP is %s",
                client_ip, req_add)
        end
    end

    -- check country 
    if rules.country and rules.country ~= nil and type(rules.country) ~= "userdata" then
        if rules.country_key == 'equals' and rules.country == country then
            pass = true
        else
            pass, failMessage = false, string.format(
                "Country does not match. Expected country is %s, but your country is %s", rules.country, country)
        end
    end
    return pass, failMessage
end

string.startswith = function(self, str)
    return self:find('^' .. str) ~= nil
end

function string:endswith(suffix)
    return self:sub(-#suffix) == suffix
end

local function hasAndCondition(tbl)
    local andKeys = {}
    for _, entry in ipairs(tbl) do
        if entry.condition == "and" then
            table.insert(andKeys, entry.statement)
        end
    end
    return andKeys
end

local function matchRules(ruleId)
    local ruleFromRedis = red:hget("request_rules", ruleId)
    if ruleFromRedis ~= nil and type(ruleFromRedis) ~= "userdata" then
        ruleFromRedis = cjson.decode(ruleFromRedis)
        if ruleFromRedis.match and ruleFromRedis.match.rules then
            -- parse_rules[ruleId] = ruleFromRedis.match.rules
            -- check prefix and postfix URL
            local pass, failMessage = check_rules(ruleFromRedis.match.rules)
            if pass == false then
                ngx.say(ruleFromRedis.name, ' --- ', failMessage, ' fail')
                return
            else
                ngx.say(ruleFromRedis.name, ' --- ', failMessage, ' pass')

            end
            -- return

        end
    end
end

local exist_values, err = red:hscan("domains", 0, "match", "domain:" .. Hostname)
if exist_values[2] and exist_values[2][2] then
    local jsonval = cjson.decode(exist_values[2][2])
    local parse_rules = {}
    if jsonval.rules and type(jsonval.rules) ~= "userdata" then
        if jsonval.match_cases then
            local hasAnd = hasAndCondition(jsonval.match_cases)
            if next(hasAnd) ~= nil then
                for inx, conditionRule in ipairs(hasAnd) do
                    matchRules(conditionRule)
                end
            end
        end
        matchRules(jsonval.rules)
    else
        ngx.say(jsonval.server_name, '---', 'no rules, please ask your administrative to set the Rules for server')
    end
else
    ngx.say("Please add a server first")
end
return
-- this will replace the need for server block for each website. It will parse JSON and match host header and route to the backend server all in lua
