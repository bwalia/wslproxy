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
-- v1 - Initial version is taken and then modified for more API GW features in gateway.lua
-- For authentication see auth.lua

local cjson = require "cjson"
local jwt = require "resty.jwt"
Base64 = require "base64"
Hostname = ngx.var.host
local configPath = os.getenv("NGINX_CONFIG_DIR")

local redisHost = os.getenv("REDIS_HOST")

if redisHost == nil then
    redisHost = "localhost"
end

local isItDTAPEnvironment = function(pHostnameStr)
    --return true
    return string.find(pHostnameStr, "localhost") or string.find(pHostnameStr, "dev") or string.find(pHostnameStr, "int") or string.find(pHostnameStr, "test")
end

local function loadGlobalSettings()
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

local settingsObj = loadGlobalSettings()
local envProfile = settingsObj.env_profile == nil and "prod" or settingsObj.env_profile

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

local function loadFileContent(path)
    local fileData = nil
    local file, err = io.open(path, "rb")
    if file ~= nil then
        fileData = file:read "*a"
        file:close()
    end
    return fileData, err
end

local function isNil(s)
    return s == nil
end

local function isEmpty(s)
    if isNil(s) then
        return true
    end
    return s == ''
end

local function hmac_sha1(key, message)
    local openssl = require("resty.openssl")
    local hmac = openssl.hmac.new(key, "sha1")
    hmac:update(message)
    return hmac:final()
end

-- Function to encode base64
local function base64_encode(data)
    local openssl = require("resty.openssl")
    local base64 = openssl.base64()
    return base64:encode(data)
end

local function gatewayHostAuthenticate(rule)
    local isTokenVerified = true
    if rule.jwt_token_validation_key ~= nil and rule.jwt_token_validation_value ~= nil and type(rule.jwt_token_validation_key) ~= "userdata" and  type(rule.jwt_token_validation_value) ~= "userdata" then
        local jwt_token_key_passphrase = tostring(rule.jwt_token_validation_key)
        local jwt_token_key_val_value = tostring(rule.jwt_token_validation_value)
        local amazon_s3_access_key = tostring(rule.amazon_s3_access_key)
        local amazon_s3_secret_key = tostring(rule.amazon_s3_secret_key)
    if isEmpty(jwt_token_key_passphrase) or isEmpty(jwt_token_key_val_value) then
            isTokenVerified = true
    else
        local passPhrase = Base64.decode(jwt_token_key_passphrase)
        local reqHeaders = ngx.req.get_headers()
        local securityToken = nil
       	local tokenAuthTokenSource = nil

        if rule.jwt_token_validation ~= nil then
          tokenAuthTokenSource = rule.jwt_token_validation
         end

        if tokenAuthTokenSource == "cookie_jwt_token_validation" then
            securityToken = reqHeaders['cookie']
            if securityToken and securityToken ~= nil and type(securityToken) ~= nil then
                local securityToken = string.match(tostring(securityToken), jwt_token_key_val_value .. "=([^;]+)")
                if securityToken ~= nil then
                    securityToken = string.gsub(securityToken, "Bearer", "")
                    securityToken = trimWhitespace(ngx.unescape_uri(securityToken))
                    local isTokenVerified = jwt:verify(passPhrase, securityToken)
                else
                    isTokenVerified = false
                end
            else
                isTokenVerified = false
            end
        end
        if tokenAuthTokenSource == "cookie_key_value" then
            securityToken = reqHeaders['cookie']
            if securityToken and securityToken ~= nil and type(securityToken) ~= nil then
                local securityToken = string.match(tostring(securityToken), jwt_token_key_val_value .. "=([^;]+)")
                if securityToken ~= nil then
                    -- securityToken = string.gsub(securityToken, "Bearer", "")
                    securityToken = trimWhitespace(ngx.unescape_uri(securityToken))
                    if passPhrase == securityToken then
                        isTokenVerified = true
                    end
                else
                    isTokenVerified = false
                end
            else
                isTokenVerified = false
            end
        end

        if tokenAuthTokenSource == "header_jwt_token_validation" then
            securityToken = ngx.req.get_headers()[jwt_token_key_val_value]
            if securityToken ~= nil then
                isTokenVerified = false
                securityToken = trimWhitespace(ngx.unescape_uri(securityToken))
                local verified_token = jwt:verify(passPhrase, securityToken)
                if not verified_token then
                    isTokenVerified = false
                end

                ngx.say("header token found ok: "..jwt_token_key_val_value.." - "..securityToken)
                ngx.exit(ngx.HTTP_OK)

            else
                isTokenVerified = true
            end
        end

        if tokenAuthTokenSource == "amazon_s3_signed_header_validation" then
            -- This code is working only for aws signature version 2
            local folderPath, bucketName = passPhrase, jwt_token_key_val_value
            local s3AccessKey, s3SecretKey = Base64.decode(amazon_s3_access_key), Base64.decode(amazon_s3_secret_key)
            local bucketregion = "eu-west-1"
            local key = ngx.var.uri

            local now = os.date("%a, %d %b %Y %H:%M:%S +0000")
            local file_path = "/" .. bucketName .. "/prod/category-file/1709032659/OdinSPC-TALSystematicSPFactsheet-Jan24.pdf"
            -- local digest = ngx.md5(file_path)
            -- local md5_digest = ngx.encode_base64(digest)
            local md5_digest = ""
            local aws_resource_string_to_sign = "GET\n" .. md5_digest .. "\n\n".. now .."\n"..file_path
            local base64_aws_signature = ngx.encode_base64(ngx.hmac_sha1(s3SecretKey, aws_resource_string_to_sign))
            local authorization_header_override = "AWS " .. s3AccessKey .. ":" .. base64_aws_signature
            local host_header_override = "s3." .. bucketregion .. ".amazonaws.com" -- eu-west-1 is hardcidoded for now but it should be a variable field in the UI
            local uri = ngx.re.sub(key, "^(.*)", "/".. bucketName .. "$1", "o")
            ngx.req.set_uri(uri)
            -- proxy_pass http://s3.amazonaws.com;
            --    ngx.say(
            --     -- "s3AccessKey: " .. s3AccessKey .. "\n",
            --     -- "s3SecretKey: " .. s3SecretKey .. "\n",
            --     "aws_resource_string_to_sign: " .. aws_resource_string_to_sign .. "\n",
            --         "base64_aws_signature: " .. base64_aws_signature .. "\n",
            --         "Date: " .. now .. "\n",
            --         "Authorization: " .. authorization_header_override .. "\n",
            --         "Host: " .. host_header_override
            --     )
            --     ngx.exit(ngx.HTTP_OK)
            ngx.req.set_header("Date", now)
            ngx.req.set_header("Authorization", authorization_header_override)
            ngx.req.set_header("Host", host_header_override)

        end

        -- if tokenAuthTokenSource == "redis" then
        --     -- local redis = require "resty.redis"
        --     -- local red = redis:new()
        --     -- red:set_timeout(1000) -- 1 sec
        --     -- local ok, err = red:connect(redisHost, 6379)
        --     -- if not ok then
        --     --     ngx.say("failed to connect: ", err)
        --     --     return
        --     -- end
        --     -- local res, err = red:get("token:"..jwt_token_key_val_value)
        --     -- if not res then
        --     --     ngx.say("failed to get token: ", err)
        --     --     return
        --     -- end
        --     -- securityToken = res
        --     -- local ok, err = red:close()
        --     -- if not ok then
        --     --     ngx.say("failed to close: ", err)
        --     --     return
        --     -- end
        -- end

    end
end
    return isTokenVerified
end

local function gatewayHostRulesParser(rules, ruleId, priority, message, statusCode, redirectUri)
    local chk_path = (rules.path ~= nil and type(rules.path) ~= "userdata") and trimWhitespace(rules.path) or rules.path
    local isPathPass, failMessage, isTokenPass = false, "", false
    local finalResult, results = {}, {}
    local req_url = ngx.var.request_uri
    if rules.jwt_token_validation_value ~= nil and rules.jwt_token_validation_key ~= nil and type(rules.jwt_token_validation_value) ~= "userdata" and  type(rules.jwt_token_validation_key) ~= "userdata" then
        isTokenPass = gatewayHostAuthenticate(rules)
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
    if isItDTAPEnvironment(Hostname) then
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

local function gatewayRequestHandler(ruleId)
    local settings = loadGlobalSettings()
    local ruleFromRedis = nil
    ruleFromRedis = loadFileContent(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json")
    if ruleFromRedis ~= nil and type(ruleFromRedis) ~= "userdata" then
        ruleFromRedis = cjson.decode(ruleFromRedis)
        if ruleFromRedis.match and ruleFromRedis.match.rules then
            -- check prefix and postfix URL
            local results = gatewayHostRulesParser(ruleFromRedis.match.rules, ruleFromRedis.id, ruleFromRedis.priority,
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
        if isEmpty(entry.paths) then
            isPathEqual = false 
        elseif entry.paths_key == "starts_with" and targetPath:startswith(entry.paths) == true and entry.paths ~= "/" then
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

local exist_values = nil

local file, err = io.open(configPath .. "data/servers/" .. envProfile .. "/host:" .. Hostname .. ".json", "rb")
if file == nil then
    if settingsObj.nginx.default.no_server ~= nil then
        ngx.header["Content-Type"] = settingsObj.nginx.content_type ~= nil and settingsObj.nginx.content_type or
        "text/html"
        do return ngx.say(Base64.decode(settingsObj.nginx.default.no_server)) end
    end
else
    exist_values = file:read "*a"
end

local function findIndexByKey(table, keyToFind)
    for index, item in ipairs(table) do
        for key, _ in pairs(item) do
            if key == keyToFind then
                return index
            end
        end
    end
    return nil
end

local function isPathsValueUnique(table)
    local reqUri = ngx.var.request_uri

    local uniquePaths = {}  -- To keep track of unique paths
    local highestPriorityByPath = {}  -- To keep track of the highest priority for each path
    local highestPriority = -1
    local highestPriorityUUID = nil

    local function processEntry(key, entry)
        local path = entry.paths
        local priority = entry.path_priority

        if uniquePaths[path] then
            if priority > highestPriorityByPath[path] then
                highestPriorityByPath[path] = priority
            end
        else
            uniquePaths[path] = true
            highestPriorityByPath[path] = priority
        end
    end

    for key, item in pairs(table) do
        local path, isCheck = item["paths"], false
        if reqUri == "/" and item.paths == "/" then
            isCheck = true
        end
        if item.paths_key == "starts_with" and reqUri:startswith(item.paths) == true then
            if string.len(item.paths) > 1 then
                isCheck = true
            end
        elseif item.paths_key == "ends_with" and reqUri:endswith(item.paths) == true then
            isCheck = true
        elseif item.paths_key == "equals" and reqUri == item.paths then
            isCheck = true
        end
        if isCheck == true then
            processEntry(key, item)
            local path = item.paths
            local priority = item.path_priority

            if priority > highestPriority then
                highestPriority = priority
                highestPriorityUUID = key
            elseif priority == highestPriority and uniquePaths[path] then
                highestPriorityUUID = key
            end
        end
    end

    return highestPriorityUUID
end

if exist_values and exist_values ~= 0 and exist_values ~= nil and exist_values ~= "" then
    local jsonval = cjson.decode(exist_values)
    local parse_rules = {}
    if jsonval.rules and type(jsonval.rules) ~= "userdata" then
        table.insert(parse_rules, gatewayRequestHandler(jsonval.rules))
        if jsonval.match_cases then
            local hasAnd = hasAndCondition(jsonval.match_cases)
            if next(hasAnd) ~= nil then
                for inx, conditionRule in ipairs(hasAnd) do
                    table.insert(parse_rules, gatewayRequestHandler(conditionRule))
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
                    preFinalObj["path_key"] = _
                elseif value.rule_data.path_key == 'ends_with' and reqUri:endswith(value.rule_data.path) == true then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    pathMatched = true
                    hasFalseValue = {}
                    preFinalObj["path_matched"] = true
                    preFinalObj["path_key"] = _
                elseif value.rule_data.path_key == 'equals' and value.rule_data.path == reqUri then
                    highestPriority = value.priority
                    highestPriorityKey = key
                    highestPriorityParentKey = _
                    pathMatched = true
                    hasFalseValue = {}
                    preFinalObj["path_matched"] = true
                    preFinalObj["path_key"] = _
                else
                    preFinalObj["path_matched"] = false
                    preFinalObj["path_key"] = _
                end
                preFinalObj["paths"] = value.rule_data.path
                preFinalObj["paths_key"] = value.rule_data.path_key

                for field, fieldValue in pairs(value) do
                    if fieldValue == false then
                        hasFalseField = true
                    end
                    preFinalObj["has_false_value"] = hasFalseField
                end
                preFinalObj['path_priority'] = value.priority
                finalObj[key] = preFinalObj
            end
        end
        -- ngx.say(highestPriorityParentKey, "  --- ", highestPriorityKey)
        local finalObjCount, isAllPathPass, isPathExists, isUnique = 0, false, false, false
        if type(finalObj) == "table" then
            finalObjCount = getTableLength(finalObj)
            isAllPathPass = isAllPathAllowed(finalObj, "/")
            isPathExists = isAnyPathExists(finalObj, ngx.var.request_uri)
            isUnique = isPathsValueUnique(finalObj)
        end
        -- do
        --     return ngx.say(cjson.encode({
        --         finalObjCount = finalObjCount,
        --         isAllPathPass = isAllPathPass,
        --         isPathExists = isPathExists,
        --         isUnique = isUnique
        --     }))
        -- end
        -- do return ngx.say(cjson.encode(finalObj)) end
        local rulePasses = false
        local requestedUri = ngx.var.request_uri
        for index, passedRule in pairs(finalObj) do
            if isAllPathPass and not isPathExists then
                if requestedUri == "/" and passedRule.has_false_value == false then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
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
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.paths_key == "starts_with" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.paths_key == "ends_with" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.paths_key == "equals" and
                    requestedUri:startswith(passedRule.paths) == false and
                    passedRule.path_matched == true and
                    passedRule.has_false_value == false
                then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                end
                if passedRule.path_matched == true and passedRule.has_false_value == false and passedRule.paths ~= "/" then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                elseif passedRule.path_matched == true and passedRule.has_false_value == false and finalObjCount == 1 then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                else
                    rulePasses = false
                end
            else
                if passedRule.path_matched == true and passedRule.has_false_value == false then
                    rulePasses = true
                    highestPriorityKey = index
                    highestPriorityParentKey = passedRule.path_key
                    break
                end
            end
        end
        -- do return ngx.say(isUnique) end
        -- do return ngx.say(cjson.encode({
        --         data = { highestPriorityParentKey = highestPriorityParentKey, highestPriorityKey = highestPriorityKey } })) end
        if isUnique and type(isUnique) ~= "nil" then
            highestPriorityKey = isUnique
            highestPriorityParentKey = findIndexByKey(parse_rules, isUnique)
        end
        -- do return ngx.say(highestPriorityKey) end
        if rulePasses == true then
            local selectedRule = parse_rules[highestPriorityParentKey][highestPriorityKey]
            local globalVars = ngx.var.vars
            globalVars = cjson.decode(globalVars)
            globalVars.executableRule = selectedRule
            globalVars.proxyServerName = jsonval.proxy_server_name
            ngx.var.vars = cjson.encode(globalVars)
        else
            if settingsObj.nginx.default.conf_mismatch ~= nil then
                ngx.header["Content-Type"] = settingsObj.nginx.content_type ~= nil and settingsObj.nginx.content_type or
                    "text/html"
                ngx.status = ngx.HTTP_FORBIDDEN
                ngx.say(Base64.decode(settingsObj.nginx.default.conf_mismatch))
            end
        end
    else
        if settingsObj.nginx.default.no_rule ~= nil then
            ngx.header["Content-Type"] = settingsObj.nginx.content_type ~= nil and settingsObj.nginx.content_type or
            "text/html"
            ngx.say(Base64.decode(settingsObj.nginx.default.no_rule))
        end
    end
else
    -- ngx.say("No Nginx Server Config found.")
    if settingsObj.nginx.default.no_server ~= nil then
        ngx.header["Content-Type"] = settingsObj.nginx.content_type ~= nil and settingsObj.nginx.content_type or
        "text/html"
        ngx.say(Base64.decode(settingsObj.nginx.default.no_server))
    end
end
-- ngx.var.proxy_host_override = 'test313.yourdomain.com'
-- this will replace the need for server block for each website. It will parse JSON and match host header and route to the backend server all in lua