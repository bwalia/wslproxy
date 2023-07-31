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
Base64 = require "base64"
ConfigPath = os.getenv("NGINX_CONFIG_DIR")
Hostname = ngx.var.host
local configPath = os.getenv("NGINX_CONFIG_DIR")

local redisHost = os.getenv("REDIS_HOST")

if redisHost == nil then
    redisHost = "localhost"
end

local function getSettings()
    local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
    local settings = {}
    if readSettings == nil then
        ngx.say("Couldn't read file: " .. errSettings)
    else
        local jsonString = readSettings:read "*a"
        readSettings:close()
        settings = cjson.decode(jsonString)
    end
    return settings
end

local function trimWhitespace(str)
    -- Trim whitespace from the start and end of the string
    local trimmedStr = string.gsub(str, "^%s*(.-)%s*$", "%1")
    return trimmedStr
end

local function splitString(inputString, separator)
    local result = {}
    local pattern = string.format("([^%s]+)", separator)
    for value in string.gmatch(inputString, pattern) do
        table.insert(result, value)
    end
    return result
end

local function getDataFromFile(path)
    local fileData = nil
    local file, err = io.open(path, "rb")
    if file ~= nil then
        fileData = file:read "*a"
        file:close()
    end
    return fileData, err
end

local function matchSecurityToken(rule)
    local isTokenVerified = true
    if rule.jwt_token_validation_value ~= nil and rule.jwt_token_validation_key ~= nil then
        local passPhrase = Base64.decode(rule.jwt_token_validation_key)
        local reqHeaders = ngx.req.get_headers()
        local securityToken = reqHeaders['cookie']
        if securityToken and securityToken ~= nil and type(securityToken) ~= nil then
            local token = string.match(tostring(securityToken), "Authorization=([^;]+)")
            if token ~= nil then
                token = string.gsub(token, "Bearer", "")
                token = trimWhitespace(ngx.unescape_uri(token))
                local verified_token = jwt:verify(passPhrase, token)
                if not verified_token then
                    isTokenVerified = false
                end
            else
                isTokenVerified = false
            end
        else
            isTokenVerified = false
        end
    end
    return isTokenVerified
end

local function check_rules(rules, ruleId, priority, message, statusCode, redirectUri)
    local chk_path = (rules.path ~= nil and type(rules.path) ~= "userdata") and trimWhitespace(rules.path) or rules.path
    local isPathPass, failMessage, isTokenPass = false, "", false
    local finalResult, results = {}, {}
    local req_url = ngx.var.request_uri
    if rules.jwt_token_validation_value ~= nil and rules.jwt_token_validation_key ~= nil then
        isTokenPass = matchSecurityToken(rules)
    else
        isTokenPass = true
    end

    results["token"] = isTokenPass
    if chk_path and chk_path ~= nil and chk_path ~= "" and type(chk_path) ~= "userdata" then
        if rules.path_key == 'starts_with' and req_url:startswith(chk_path) == true then
            isPathPass = true
        elseif rules.path_key == 'ends_with' and req_url:endswith(chk_path) == true then
            isPathPass = true
        elseif rules.path_key == 'equals' and chk_path == req_url then
            isPathPass = true
        else
            isPathPass, failMessage = false, string.format(
                "Route does not match. Expected path is %s, but current is %s", chk_path, req_url)
        end
    else
        isPathPass = true
    end
    results["path"] = isPathPass

    -- client IP check rules
    local isClientIpPass = false
    local req_add = ngx.var.remote_addr
    local testingIps = {
        BE = "104.155.127.255",
        IN = "117.245.73.99",
        AU = "1.44.255.255",
        GB = "103.219.168.255",
        TH = "101.109.255.255"
    }
    if string.find(Hostname, "localhost") or string.find(Hostname, "int") then
        if rules.country ~= nil and rules.client_ip ~= nil then
            req_add = testingIps[rules.country]
        end
    end

    local ip2location = require('ip2location')
    local ip2loc = ip2location:new('/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN')
    local result = ip2loc:get_all(req_add)
    local country = ""
    if result.country_short then
        country = result.country_short
    end
    local client_ip = (rules.client_ip ~= nil and type(rules.client_ip) ~= "userdata") and rules.client_ip or
        rules.client_ip
    -- user data type is null
    if client_ip and client_ip ~= nil and client_ip ~= "" and type(client_ip) ~= "userdata" then
        if rules.client_ip_key == 'starts_with' and req_add:startswith(client_ip) == true then -- and req_add~=client_ipand  (req_add:startswith(client_ip) ~= true
            isClientIpPass = true
        elseif rules.client_ip_key == 'equals' and req_add == client_ip then
            isClientIpPass = true
        else
            isClientIpPass, failMessage = false, string.format(
                "Client IP does not match. Expected IP is %s, but your IP is %s", client_ip, req_add)
        end
    else
        isClientIpPass = true
    end

    results["client_ip"] = isClientIpPass
    local isCountryPass = false
    -- check country
    if rules.country and rules.country ~= nil and rules.country ~= "" and type(rules.country) ~= "userdata" then
        if rules.country_key == 'equals' and rules.country == country then
            isCountryPass = true
        else
            isCountryPass, failMessage = false, string.format(
                "Country does not match. Expected country is %s, but your country is %s", rules.country, country)
        end
    else
        isCountryPass = true
    end
    results["country"] = isCountryPass
    results["priority"] = priority
    results["message"] = message
    results["statusCode"] = statusCode
    results["redirectUri"] = redirectUri
    results["rule_data"] = rules

    finalResult[ruleId] = results

    return finalResult
end

string.startswith = function(self, str)
    return self:find('^' .. str) ~= nil
end

function string:endswith(suffix)
    return self:sub(- #suffix) == suffix
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
    local settings = getSettings()
    local ruleFromRedis = nil
    ruleFromRedis = getDataFromFile(configPath .. "data/rules/" .. ruleId .. ".json")
    if ruleFromRedis ~= nil and type(ruleFromRedis) ~= "userdata" then
        ruleFromRedis = cjson.decode(ruleFromRedis)
        if ruleFromRedis.match and ruleFromRedis.match.rules then
            -- check prefix and postfix URL
            local results = check_rules(ruleFromRedis.match.rules, ruleFromRedis.id, ruleFromRedis.priority,
                ruleFromRedis.match.response.message, ruleFromRedis.match.response.code,
                ruleFromRedis.match.response.redirect_uri)
            return results
        end
    end
end

local function anyValueIsTrue(table)
    for _, value in ipairs(table) do
        if value == true then
            return true
        end
    end
    return false
end

local function getTableLength(tbl)
    local count = 0
    for _ in pairs(tbl) do
        count = count + 1
    end
    return count
end

local function isIpAddress(str)
    local pattern = "^%d+%.%d+%.%d+%.%d+$"
    local match = string.match(str, pattern)
    if match then
        -- Further validate the IP address components
        local a, b, c, d = string.match(str, "(%d+)%.(%d+)%.(%d+)%.(%d+)")
        if tonumber(a) <= 255 and tonumber(b) <= 255 and tonumber(c) <= 255 and tonumber(d) <= 255 then
            return true
        end
    end
    return false
end

local function isAnyPathExists(myTable, targetPath)
    local isPathEqual = false
    for _, entry in pairs(myTable) do
        if entry.paths_key == "starts_with" and targetPath:startswith(entry.paths) == true and entry.paths ~= "/" then
            isPathEqual = true
            break
        elseif entry.paths_key == 'ends_with' and targetPath:endswith(entry.paths) == true and entry.paths ~= "/" then
            isPathEqual = true
            break
        elseif entry.paths_key == 'equals' and entry.paths == targetPath then
            isPathEqual = true
            break
        end
    end
    return isPathEqual
end

local function isAllPathAllowed(myTable, targetPath)
    local isPathEqual = false
    for _, entry in pairs(myTable) do
        if entry.paths == targetPath then
            isPathEqual = true
            break
        end
    end
    return isPathEqual
end


local settings = getSettings()
local exist_values = nil

local file, err = io.open(configPath .. "data/servers/host:" .. Hostname .. ".json", "rb")
if file == nil then
    if settings.nginx.default.no_server ~= nil then
        do return ngx.say(Base64.decode(settings.nginx.default.no_server)) end
    end
else
    exist_values = file:read "*a"
end
if exist_values and exist_values ~= 0 and exist_values ~= nil and exist_values ~= "" then
    local jsonval = cjson.decode(exist_values)
    local parse_rules = {}
    if jsonval.rules and type(jsonval.rules) ~= "userdata" then
        table.insert(parse_rules, matchRules(jsonval.rules))
        if jsonval.match_cases then
            local hasAnd = hasAndCondition(jsonval.match_cases)
            if next(hasAnd) ~= nil then
                for inx, conditionRule in ipairs(hasAnd) do
                    table.insert(parse_rules, matchRules(conditionRule))
                end
            end
        end
        -- do return ngx.say(cjson.encode(parse_rules)) end
        local highestPriority = 0
        local highestPriorityKey, highestPriorityParentKey
        local hasFalseValue, pathMatched, finalObj = {}, false, {}
        local reqUri = ngx.var.request_uri
        for _, record in ipairs(parse_rules) do
            for key, value in pairs(record) do
                local preFinalObj = {}
                local hasFalseField = false
                if value.rule_data.path_key == "starts_with" and reqUri:startswith(value.rule_data.path) == true then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    pathMatched = true
                    hasFalseValue = {}
                    preFinalObj["path_matched"] = true
                elseif value.rule_data.path_key == 'ends_with' and reqUri:endswith(value.rule_data.path) == true then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    pathMatched = true
                    hasFalseValue = {}
                    preFinalObj["path_matched"] = true
                elseif value.rule_data.path_key == 'equals' and value.rule_data.path == reqUri then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    pathMatched = true
                    hasFalseValue = {}
                    preFinalObj["path_matched"] = true
                elseif value.priority > highestPriority then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    preFinalObj["path_matched"] = false
                else
                    preFinalObj["path_matched"] = false
                end
                preFinalObj["paths"] = value.rule_data.path
                preFinalObj["paths_key"] = value.rule_data.path_key

                for field, fieldValue in pairs(value) do
                    if fieldValue == false then
                        hasFalseField = true
                    end
                    preFinalObj["has_false_value"] = hasFalseField
                end
                finalObj[key] = preFinalObj
            end
        end
        local finalObjCount, isAllPathPass, isPathExists = 0, false, false
        if type(finalObj) == "table" then
            finalObjCount = getTableLength(finalObj)
            isAllPathPass = isAllPathAllowed(finalObj, "/")
            isPathExists = isAnyPathExists(finalObj, ngx.var.request_uri)
        end
        -- do return ngx.say(cjson.encode({
        --     finalObjCount = finalObjCount,
        --     isAllPathPass= isAllPathPass,
        --     isPathExists = isPathExists
        -- })) end
        -- do return ngx.say(cjson.encode(finalObj)) end
        local rulePasses = false
        local requestedUri = ngx.var.request_uri
        for index, passedRule in pairs(finalObj) do
            if isAllPathPass and not isPathExists then
                if requestedUri == "/" and passedRule.has_false_value == false then
                    rulePasses = true
                    break
                elseif passedRule.paths_key == "starts_with" and
                    requestedUri:startswith(passedRule.paths) == false
                then
                    rulePasses = true
                    break
                elseif passedRule.paths_key == "ends_with" and
                    requestedUri:startswith(passedRule.paths) == false
                then
                    rulePasses = true
                    break
                elseif passedRule.paths_key == "equals" and
                    requestedUri:startswith(passedRule.paths) == false
                then
                    rulePasses = true
                    break
                end
            end
            if isAllPathPass == true then
                if requestedUri == "/" and passedRule.has_false_value == false then
                    rulePasses = true
                    break
                elseif passedRule.paths_key == "starts_with" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    break
                elseif passedRule.paths_key == "ends_with" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    break
                elseif passedRule.paths_key == "equals" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    break
                end
                if passedRule.path_matched == true and passedRule.has_false_value == false and passedRule.paths ~= "/" then
                    rulePasses = true
                    break
                elseif passedRule.path_matched == true and passedRule.has_false_value == false and finalObjCount == 1 then
                    rulePasses = true
                    break
                else
                    rulePasses = false
                end
            else
                if passedRule.path_matched == true and passedRule.has_false_value == false then
                    rulePasses = true
                    break
                end
            end
        end
        -- do return ngx.say(tostring(rulePasses)) end
        -- do return ngx.say(cjson.encode({data = {highestPriorityParentKey = highestPriorityParentKey, highestPriorityKey = highestPriorityKey}})) end
        if rulePasses == true then
            local selectedRule = parse_rules[highestPriorityParentKey][highestPriorityKey]
            if selectedRule.statusCode == 301 then
                ngx.redirect(selectedRule.redirectUri, ngx.HTTP_MOVED_PERMANENTLY)
                ngx.exit(ngx.HTTP_MOVED_PERMANENTLY)
            elseif selectedRule.statusCode == 302 then
                ngx.redirect(selectedRule.redirectUri, ngx.HTTP_MOVED_TEMPORARILY)
                ngx.exit(ngx.HTTP_MOVED_TEMPORARILY)
            elseif selectedRule.statusCode == 305 then
                local proxy_server_name = jsonval.proxy_server_name
                -- local getServer = red:hget("servers", jsonval.id)
                -- if getServer ~= nil and type(getServer) ~= "userdata" then
                --     getServer = cjson.decode(getServer)
                --     getServer.proxy_pass = selectedRule.redirectUri
                -- remove http:// from the url or https:// as it should be added in the proxy_pass
                selectedRule.redirectUri = string.gsub(selectedRule.redirectUri, "https://", "")
                selectedRule.redirectUri = string.gsub(selectedRule.redirectUri, "http://", "")
                local extracted = string.match(selectedRule.redirectUri, ":(.*)")
                if not isIpAddress(selectedRule.redirectUri) then
                    local resolver = require "resty.dns.resolver"
                    local primaryNameserver = os.getenv("PRIMARY_DNS_RESOLVER")
                    if primaryNameserver == nil or primaryNameserver == "" and not (settings.dns_resolver==nil) then
                        primaryNameserver = settings.dns_resolver.nameservers.primary
                    end
                    if primaryNameserver == nil or primaryNameserver == "" then
                        primaryNameserver = "8.8.8.8"
                    end
                    local secondaryNameserver = os.getenv("SECONDARY_DNS_RESOLVER")
                    if primaryNameserver == nil or primaryNameserver == "" and not (settings.dns_resolver==nil) then
                        secondaryNameserver = settings.dns_resolver.nameservers.secondary
                    end
                    if secondaryNameserver == nil or secondaryNameserver == "" then
                        secondaryNameserver = "8.8.4.4"
                    end
                    local portNameserver = os.getenv("DNS_RESOLVER_PORT")
                    if portNameserver == nil or portNameserver == "" and not (settings.dns_resolver==nil) then
                        portNameserver = settings.dns_resolver.nameservers.port
                    end
                    if portNameserver == nil or portNameserver == "" then
                        portNameserver = "53"
                    end
                    local r, err = resolver:new {
                        nameservers = { primaryNameserver, { secondaryNameserver, tonumber(portNameserver) } },
                        retrans = 5,      -- 5 retransmissions on receive timeout
                        timeout = 2000,   -- 2 sec
                        no_random = true, -- always start with first nameserver
                    }
                    if not r then
                        ngx.say("failed to instantiate the resolver: ", err)
                        return
                    end
                    local answers, err, tries = r:query(selectedRule.redirectUri, nil, {})
                    if not answers then
                        ngx.say("failed to query the DNS server: ", err)
                        ngx.say("retry historie:\n  ", table.concat(tries, "\n  "))
                        return
                    end
                    for i, ans in ipairs(answers) do
                        selectedRule.redirectUri = ans.address
                    end
                end
                local finalProxyHost = selectedRule.redirectUri
                if extracted ~= nil then
                    ngx.var.proxy_port = extracted
                    finalProxyHost = string.gsub(selectedRule.redirectUri, ":(.*)", "")
                end

                ngx.var.proxy_host = finalProxyHost
                if proxy_server_name == nil or proxy_server_name == "" then
                    -- ngx.req.set_header("Host", selectedRule.redirectUri)
                    ngx.ctx.proxy_host_override = selectedRule.redirectUri
                    ngx.header["X-Debug-Host"] = ngx.ctx.proxy_host_override
                else
                    -- ngx.req.set_header("Host", proxy_server_name)
                    ngx.ctx.proxy_host_override = proxy_server_name
                    ngx.header["X-Debug-Host"] = ngx.ctx.proxy_host_override
                end
                ngx.log(ngx.INFO, ngx.var.proxy_host)
                ngx.log(ngx.INFO, ngx.var.proxy_host_override)
                -- do return ngx.say(ngx.var.proxy_host_override) end
                -- else
                --     ngx.log(ngx.ERR, "[ERROR]: Server not found!")
                -- end
                return
            elseif selectedRule.statusCode == 200 or selectedRule.statusCode == 403 or selectedRule.statusCode == 403 then
                ngx.status = selectedRule.statusCode
                ngx.say(Base64.decode(parse_rules[highestPriorityParentKey][highestPriorityKey].message))
            end
        else
            if settings.nginx.default.conf_mismatch ~= nil then
                ngx.header["Content-Type"] = settings.nginx.content_type ~= nil and settings.nginx.content_type or
                "text/html"
                ngx.status = ngx.HTTP_FORBIDDEN
                ngx.say(Base64.decode(settings.nginx.default.conf_mismatch))
            end
        end
    else
        if settings.nginx.default.no_rule ~= nil then
            ngx.say(Base64.decode(settings.nginx.default.no_rule))
        end
    end
else
    -- ngx.say("No Nginx Server Config found.")
    if settings.nginx.default.no_server ~= nil then
        ngx.say(Base64.decode(settings.nginx.default.no_server))
    end
end
-- ngx.var.proxy_host_override = 'test313.workstation.co.uk'
-- this will replace the need for server block for each website. It will parse JSON and match host header and route to the backend server all in lua
