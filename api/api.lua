local cjson = Cjson
local jwt = JWT
local lfs = LFS

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local Conf = require("server-conf")
local Helper = require("helpers")
local Errors = require("errors")
local PushData = require("push-data")
local SslManager = require("ssl_manager")
local CacheManager = require("cache_manager")
local VarnishManager = require("varnish_manager")
local VersionManager = require("version_manager")
local CRManager = require("cr_manager")
local AuditLogger = require("audit_logger")

local settings = Helper.settings()
local storageTypeOverride = settings.settings or os.getenv("STORAGE_TYPE")

-- Forward declaration for functions used before definition
local CreateUpdateRecord

-- Validation helper functions
local function validateServerPayload(payloads)
    local errors = {}

    -- Required field: server_name
    if not payloads.server_name or payloads.server_name == "" then
        table.insert(errors, {
            field = "server_name",
            message = "Server name (hostname) is required"
        })
    elseif type(payloads.server_name) ~= "string" then
        table.insert(errors, {
            field = "server_name",
            message = "Server name must be a string"
        })
    end

    -- Optional field: config (auto-generated if not provided)
    -- Config is generated during server creation/update, so it's not required in the payload

    -- Required field: profile_id
    if not payloads.profile_id or payloads.profile_id == "" then
        table.insert(errors, {
            field = "profile_id",
            message = "Profile ID is required (e.g., 'dev', 'int', 'prod')"
        })
    end

    -- Validate listens array if provided
    if payloads.listens then
        if type(payloads.listens) ~= "table" then
            table.insert(errors, {
                field = "listens",
                message = "Listens must be an array of listen configurations"
            })
        elseif #payloads.listens == 0 then
            table.insert(errors, {
                field = "listens",
                message = "At least one listen port configuration is required"
            })
        else
            for i, listen in ipairs(payloads.listens) do
                if not listen.listen or listen.listen == "" then
                    table.insert(errors, {
                        field = "listens[" .. i .. "].listen",
                        message = "Listen port is required for each listen configuration"
                    })
                end
            end
        end
    end

    -- Validate custom_headers (upstream backend request headers) if provided
    if payloads.custom_headers and type(payloads.custom_headers) == "table" then
        for i, header in ipairs(payloads.custom_headers) do
            if not header.header_key or header.header_key == "" then
                table.insert(errors, {
                    field = "custom_headers[" .. i .. "].header_key",
                    message = "Header key is required"
                })
            end
            if not header.header_value then
                table.insert(errors, {
                    field = "custom_headers[" .. i .. "].header_value",
                    message = "Header value is required"
                })
            end
        end
    end

    -- Validate custom_response_headers (client response headers) if provided
    if payloads.custom_response_headers and type(payloads.custom_response_headers) == "table" then
        for i, header in ipairs(payloads.custom_response_headers) do
            if not header.header_key or header.header_key == "" then
                table.insert(errors, {
                    field = "custom_response_headers[" .. i .. "].header_key",
                    message = "Header key is required"
                })
            end
            if not header.header_value then
                table.insert(errors, {
                    field = "custom_response_headers[" .. i .. "].header_value",
                    message = "Header value is required"
                })
            end
            -- Access-Control-Allow-Origin must be "*", "null", or a scheme-qualified origin.
            -- Bare hostnames like "example.com" are silently ignored by browsers and are a
            -- common foot-gun; reject them at save time.
            if header.header_key and header.header_value and header.header_value ~= "" then
                local key_lower = header.header_key:lower()
                if key_lower == "access-control-allow-origin" then
                    local v = header.header_value
                    local ok = v == "*" or v == "null"
                        or v:match("^https?://[%w%-%.:]+$")
                        or v:match("^https?://[%w%-%.:]+/.*$")
                    if not ok then
                        table.insert(errors, {
                            field = "custom_response_headers[" .. i .. "].header_value",
                            message = "Access-Control-Allow-Origin must be '*', 'null', or a scheme-qualified origin (e.g. https://example.com). Got: " .. tostring(v)
                        })
                    end
                end
            end
        end
    end

    -- Validate match_cases if provided
    if payloads.match_cases and type(payloads.match_cases) == "table" then
        for i, matchCase in ipairs(payloads.match_cases) do
            if not matchCase.statement or matchCase.statement == "" then
                table.insert(errors, {
                    field = "match_cases[" .. i .. "].statement",
                    message = "Rule ID (statement) is required for each match case"
                })
            end
            if not matchCase.condition then
                table.insert(errors, {
                    field = "match_cases[" .. i .. "].condition",
                    message = "Condition is required for each match case (e.g., 'and', 'or')"
                })
            end
        end
    end

    -- Validate WAF fields
    if payloads.waf_enabled == true then
        if not payloads.waf_policy_id or payloads.waf_policy_id == "" then
            table.insert(errors, {
                field = "waf_policy_id",
                message = "WAF policy ID is required when WAF is enabled"
            })
        end
    end
    if payloads.waf_mode_override ~= nil and payloads.waf_mode_override ~= "" then
        local valid_modes = { block = true, monitor = true }
        if not valid_modes[payloads.waf_mode_override] then
            table.insert(errors, {
                field = "waf_mode_override",
                message = "WAF mode override must be 'block' or 'monitor'"
            })
        end
    end

    -- Validate rate limit fields
    if payloads.rate_limit_enabled == true then
        if payloads.rate_limit and type(payloads.rate_limit) == "table" then
            if payloads.rate_limit.requests_per_second and type(payloads.rate_limit.requests_per_second) ~= "number" then
                table.insert(errors, {
                    field = "rate_limit.requests_per_second",
                    message = "Requests per second must be a number"
                })
            end
            if payloads.rate_limit.burst and type(payloads.rate_limit.burst) ~= "number" then
                table.insert(errors, {
                    field = "rate_limit.burst",
                    message = "Burst must be a number"
                })
            end
        end
    end

    -- Validate SSL certificate fields if ssl_enabled is true
    if payloads.ssl_enabled == true then
        -- ssl_email is required when SSL is enabled
        if not payloads.ssl_email or payloads.ssl_email == "" then
            table.insert(errors, {
                field = "ssl_email",
                message = "SSL contact email is required when SSL is enabled"
            })
        elseif type(payloads.ssl_email) ~= "string" then
            table.insert(errors, {
                field = "ssl_email",
                message = "SSL email must be a string"
            })
        elseif not string.match(payloads.ssl_email, "^[%w%._%+-]+@[%w%.%-]+%.[%a]+$") then
            table.insert(errors, {
                field = "ssl_email",
                message = "SSL email must be a valid email address"
            })
        end

        -- Validate ssl_auto_renew if provided (should be boolean)
        if payloads.ssl_auto_renew ~= nil and type(payloads.ssl_auto_renew) ~= "boolean" then
            table.insert(errors, {
                field = "ssl_auto_renew",
                message = "SSL auto-renew must be a boolean value"
            })
        end

        -- Validate ssl_force_https if provided (should be boolean)
        if payloads.ssl_force_https ~= nil and type(payloads.ssl_force_https) ~= "boolean" then
            table.insert(errors, {
                field = "ssl_force_https",
                message = "SSL force HTTPS must be a boolean value"
            })
        end
    end

    -- Validate Varnish config fields
    if payloads.varnish_config and type(payloads.varnish_config) == "table" then
        local vc = payloads.varnish_config
        if vc.listen_port then
            local port = tonumber(vc.listen_port)
            if not port or port < 1 or port > 65535 then
                table.insert(errors, {
                    field = "varnish_config.listen_port",
                    message = "Varnish listen port must be between 1 and 65535"
                })
            end
        end
        if vc.admin_listen_port then
            local port = tonumber(vc.admin_listen_port)
            if not port or port < 1 or port > 65535 then
                table.insert(errors, {
                    field = "varnish_config.admin_listen_port",
                    message = "Varnish admin listen port must be between 1 and 65535"
                })
            end
        end
        if vc.cache_ttl_default then
            local ttl = tonumber(vc.cache_ttl_default)
            if not ttl or ttl < 0 then
                table.insert(errors, {
                    field = "varnish_config.cache_ttl_default",
                    message = "Cache TTL must be a non-negative number"
                })
            end
        end
    end

    -- Validate Varnish snippets
    if payloads.varnish_snippets and type(payloads.varnish_snippets) == "table" then
        local valid_hooks = {
            vcl_init = true,
            vcl_recv = true,
            vcl_hash = true,
            vcl_hit = true,
            vcl_miss = true,
            vcl_backend_fetch = true,
            vcl_backend_response = true,
            vcl_deliver = true,
            vcl_synth = true
        }
        for i, snippet in ipairs(payloads.varnish_snippets) do
            if snippet.hook_point and not valid_hooks[snippet.hook_point] then
                table.insert(errors, {
                    field = "varnish_snippets[" .. i .. "].hook_point",
                    message =
                    "Invalid VCL hook point. Valid: vcl_init, vcl_recv, vcl_hash, vcl_hit, vcl_miss, vcl_backend_fetch, vcl_backend_response, vcl_deliver, vcl_synth"
                })
            end
            if snippet.content ~= nil and type(snippet.content) ~= "string" then
                table.insert(errors, {
                    field = "varnish_snippets[" .. i .. "].content",
                    message = "Snippet content must be a string"
                })
            end
        end
    end

    return errors
end

local function validateRulePayload(payloads)
    local errors = {}

    -- Required field: name
    if not payloads.name or payloads.name == "" then
        table.insert(errors, {
            field = "name",
            message = "Rule name is required"
        })
    elseif type(payloads.name) ~= "string" then
        table.insert(errors, {
            field = "name",
            message = "Rule name must be a string"
        })
    end

    -- Required field: match
    if not payloads.match then
        table.insert(errors, {
            field = "match",
            message = "Match configuration is required"
        })
    else
        -- Validate match.rules
        if not payloads.match.rules then
            table.insert(errors, {
                field = "match.rules",
                message = "Match rules configuration is required"
            })
        else
            -- Default path to "/" if empty or missing
            if not payloads.match.rules.path or payloads.match.rules.path == "" then
                payloads.match.rules.path = "/"
            end

            -- Validate path_key
            if not payloads.match.rules.path_key or payloads.match.rules.path_key == "" then
                table.insert(errors, {
                    field = "match.rules.path_key",
                    message = "Path match type is required (e.g., 'starts_with', 'ends_with', 'equals')"
                })
            elseif payloads.match.rules.path_key ~= "starts_with" and
                payloads.match.rules.path_key ~= "ends_with" and
                payloads.match.rules.path_key ~= "equals" then
                table.insert(errors, {
                    field = "match.rules.path_key",
                    message = "Invalid path match type. Must be 'starts_with', 'ends_with', or 'equals'"
                })
            end

            -- Validate country_key if country is provided
            if payloads.match.rules.country and payloads.match.rules.country ~= "" then
                if not payloads.match.rules.country_key or payloads.match.rules.country_key == "" then
                    table.insert(errors, {
                        field = "match.rules.country_key",
                        message = "Country match type is required when country is specified"
                    })
                end
            end

            -- Validate client_ip_key if client_ip is provided
            if payloads.match.rules.client_ip and payloads.match.rules.client_ip ~= "" then
                if not payloads.match.rules.client_ip_key or payloads.match.rules.client_ip_key == "" then
                    table.insert(errors, {
                        field = "match.rules.client_ip_key",
                        message = "Client IP match type is required when client IP is specified"
                    })
                end
            end
        end

        -- Validate match.response
        if not payloads.match.response then
            table.insert(errors, {
                field = "match.response",
                message = "Response configuration is required"
            })
        else
            -- Validate response code
            if not payloads.match.response.code then
                table.insert(errors, {
                    field = "match.response.code",
                    message = "Response code is required (e.g., 200, 301, 302, 305, 403)"
                })
            else
                local code = tonumber(payloads.match.response.code)
                if not code then
                    table.insert(errors, {
                        field = "match.response.code",
                        message = "Response code must be a number"
                    })
                end

                -- Validate redirect_uri for redirect/proxy codes
                if code == 301 or code == 302 or code == 305 then
                    if not payloads.match.response.redirect_uri or payloads.match.response.redirect_uri == "" then
                        table.insert(errors, {
                            field = "match.response.redirect_uri",
                            message = "Redirect URI is required for response codes 301, 302, and 305 (proxy)"
                        })
                    end
                end

                -- Validate message for block codes
                if code == 403 or code == 200 then
                    if not payloads.match.response.message or payloads.match.response.message == "" then
                        table.insert(errors, {
                            field = "match.response.message",
                            message = "Message (Base64 encoded HTML) is required for response codes 200 and 403"
                        })
                    end
                end
            end
        end
    end

    -- Validate priority if provided
    if payloads.priority then
        local priority = tonumber(payloads.priority)
        if not priority then
            table.insert(errors, {
                field = "priority",
                message = "Priority must be a number"
            })
        elseif priority < 1 or priority > 10000 then
            table.insert(errors, {
                field = "priority",
                message = "Priority must be between 1 and 10000"
            })
        end
    end

    return errors
end

local function handleValidationErrors(errors, resourceType)
    if #errors > 0 then
        local fieldNames = {}
        for _, err in ipairs(errors) do
            table.insert(fieldNames, err.field)
        end

        ---@diagnostic disable-next-line: redundant-parameter
        Errors.throwError(
            "Validation failed for " .. resourceType .. ": " .. table.concat(fieldNames, ", "),
            ngx.HTTP_BAD_REQUEST,
            {
                validation_errors = errors,
                resource_type = resourceType,
                error_count = #errors
            }
        )
    end
end

-- =====================================================
-- WAF Rule Validation
-- =====================================================
local function validateWafRulePayload(payloads)
    local errors = {}

    if not payloads.name or payloads.name == "" then
        table.insert(errors, { field = "name", message = "WAF rule name is required" })
    elseif type(payloads.name) ~= "string" then
        table.insert(errors, { field = "name", message = "WAF rule name must be a string" })
    end

    if not payloads.category or payloads.category == "" then
        table.insert(errors, { field = "category", message = "WAF rule category is required" })
    else
        local valid_categories = { sqli = true, xss = true, cmdi = true, lfi = true, rfi = true, protocol = true, custom = true }
        if not valid_categories[payloads.category] then
            table.insert(errors,
                {
                    field = "category",
                    message =
                    "Invalid category. Must be one of: sqli, xss, cmdi, lfi, rfi, protocol, custom"
                })
        end
    end

    if not payloads.pattern or payloads.pattern == "" then
        table.insert(errors, { field = "pattern", message = "WAF rule pattern is required" })
    elseif payloads.pattern_type ~= "string" then
        local ok, compile_err = pcall(ngx.re.compile, payloads.pattern, "ijo")
        if not ok then
            table.insert(errors, { field = "pattern", message = "Invalid regex pattern: " .. tostring(compile_err) })
        end
    end

    if not payloads.target or payloads.target == "" then
        table.insert(errors, { field = "target", message = "WAF rule target is required" })
    else
        local valid_targets = { url = true, headers = true, body = true, args = true, cookies = true, user_agent = true, all = true }
        if not valid_targets[payloads.target] then
            table.insert(errors,
                {
                    field = "target",
                    message =
                    "Invalid target. Must be one of: url, headers, body, args, cookies, user_agent, all"
                })
        end
    end

    if not payloads.action or payloads.action == "" then
        table.insert(errors, { field = "action", message = "WAF rule action is required" })
    else
        local valid_actions = { block = true, monitor = true, allow = true }
        if not valid_actions[payloads.action] then
            table.insert(errors, { field = "action", message = "Invalid action. Must be one of: block, monitor, allow" })
        end
    end

    return errors
end

-- =====================================================
-- WAF Policy Validation
-- =====================================================
local function validateWafPolicyPayload(payloads)
    local errors = {}

    if not payloads.name or payloads.name == "" then
        table.insert(errors, { field = "name", message = "WAF policy name is required" })
    elseif type(payloads.name) ~= "string" then
        table.insert(errors, { field = "name", message = "WAF policy name must be a string" })
    end

    if not payloads.mode or payloads.mode == "" then
        table.insert(errors, { field = "mode", message = "WAF policy mode is required" })
    else
        local valid_modes = { block = true, monitor = true }
        if not valid_modes[payloads.mode] then
            table.insert(errors, { field = "mode", message = "Invalid mode. Must be one of: block, monitor" })
        end
    end

    return errors
end

local red = {}

if settings.storage_type == "redis" then
    local redis = require "resty.redis"
    red = redis:new()
    red:set_timeout(1000)

    local redisHost = settings.env_vars.REDIS_HOST or os.getenv("REDIS_HOST")
    if redisHost == nil then
        redisHost = "localhost"
    end

    local ok, err = red:connect(redisHost, 6379)
    if not ok then
        ngx.log(ngx.ERR, "failed to connect to Redis: ", err)
        Errors.throwError("failed to connect to Redis: " .. err, ngx.HTTP_BAD_GATEWAY)
    end
elseif settings.storage_type == "pgsql" then
    local PgStorage = require("pgsql_storage")
    local pg_config = settings.pgsql or {}
    local store, pg_err = PgStorage.new(pg_config)
    if not store then
        ngx.log(ngx.ERR, "failed to connect to PostgreSQL: ", pg_err)
        Errors.throwError("failed to connect to PostgreSQL: " .. tostring(pg_err), ngx.HTTP_BAD_GATEWAY)
    end
    red = store
end

-- useRemoteStorage: true for redis and pgsql (both use the `red` interface)
local useRemoteStorage = settings.storage_type == "redis" or settings.storage_type == "pgsql"

local function removeServerFromRule(oldRuleId, serverId, envProfile)
    local loadRules = nil
    if oldRuleId and oldRuleId ~= nil and type(oldRuleId) ~= "userdata" then
        if useRemoteStorage then
            loadRules = red:hget("request_rules_" .. envProfile, oldRuleId)
        else
            loadRules = Helper.getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. oldRuleId .. ".json")
        end
        if loadRules and loadRules ~= "null" and type(loadRules) == "string" then
            loadRules = cjson.decode(loadRules)
            local valueToRemove = serverId
            local i = 1
            while i <= #loadRules.servers do
                if loadRules.servers[i] == valueToRemove then
                    table.remove(loadRules.servers, i)
                else
                    i = i + 1
                end
            end
            if useRemoteStorage then
                red:hset("request_rules_" .. envProfile, oldRuleId, cjson.encode(loadRules))
            else
                Helper.setDataToFile(configPath .. "data/rules/" .. envProfile .. "/" .. oldRuleId .. ".json", loadRules,
                    configPath .. "data/rules")
            end
        end
    end
end

local function updateServerInRules(ruleId, serverId, Rtype, envProfile)
    local getRules, ruleErr = nil, nil
    if useRemoteStorage then
        getRules, ruleErr = red:hget("request_rules_" .. envProfile, ruleId)
    else
        getRules, ruleErr = Helper.getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json")
    end
    if getRules and getRules ~= "null" and type(getRules) == "string" then
        getRules = cjson.decode(getRules)
        local getServer = nil
        if useRemoteStorage then
            getServer = red:hget("servers_" .. envProfile, serverId)
        else
            getServer = Helper.getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. serverId .. ".json")
        end
        if getServer and getServer ~= "null" and type(getServer) == "string" then
            getServer = cjson.decode(getServer)
            if Rtype == "rules" and getServer.rules ~= nil and getServer.rules ~= ruleId then
                removeServerFromRule(getServer.rules, serverId, envProfile)
            end
            if Rtype == "statement" and getServer.match_cases ~= nil and type(next(getServer.match_cases)) ~= nil then
                for _, matchCase in ipairs(getServer.match_cases) do
                    removeServerFromRule(matchCase.statement, serverId, envProfile)
                end
            end
        end
        local isServer = true
        if not getRules.servers and getRules.servers == nil then
            getRules.servers = {}
        else
            for idx, server in ipairs(getRules.servers) do
                if server == serverId then
                    isServer = false
                end
            end
        end
        if isServer == true then
            table.insert(getRules.servers, serverId)
            if useRemoteStorage then
                red:hset("request_rules_" .. envProfile, ruleId, cjson.encode(getRules))
            else
                Helper.setDataToFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json", getRules,
                    configPath .. "data/rules")
            end
        end
    end
end

local function deleteRuleFromServer(ruleId, envProfile)
    local getRule = nil
    if useRemoteStorage then
        getRule = red:hget("request_rules_" .. envProfile, ruleId)
    else
        getRule = Helper.getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json")
    end
    if getRule and getRule ~= "null" and type(getRule) == "string" then
        getRule = cjson.decode(getRule)
        -- Remove the rules from all servers that are using it as a statement or case
        if getRule.servers and getRule.servers ~= nil then
            for _, server in ipairs(getRule.servers) do
                local getServer = nil
                if useRemoteStorage then
                    getServer = red:hget("servers_" .. envProfile, server)
                else
                    Helper.getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. server .. ".json")
                end
                if getServer and getServer ~= "null" and type(getServer) == "string" then
                    getServer = cjson.decode(getServer)
                    if getServer.rules == ruleId then
                        getServer.rules = nil
                    else
                        if getServer.match_cases ~= nil and type(next(getServer.match_cases)) ~= nil then
                            for i = #getServer.match_cases, 1, -1 do
                                -- Iterate over the array and remove objects with matching statement value
                                if getServer.match_cases[i].statement == ruleId then
                                    table.remove(getServer.match_cases, i)
                                end
                            end
                        end
                    end
                    if useRemoteStorage then
                        red:hset("servers_" .. envProfile, server, cjson.encode(getServer))
                    else
                        Helper.setDataToFile(configPath .. "data/servers/" .. envProfile .. "/" .. server .. ".json",
                            getServer,
                            configPath .. "data/servers")
                    end
                end
            end
        end
    end
end

local function deleteServerFromRules(ruleId, serverId, envProfile)
    local getRule = nil
    if useRemoteStorage then
        getRule = red:hget("request_rules_" .. envProfile, ruleId)
    else
        getRule = Helper.getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json")
    end
    if getRule and getRule ~= "null" and type(getRule) == "string" then
        getRule = cjson.decode(getRule)
        if getRule.servers ~= nil and type(getRule.servers) == "table" then
            for _, server in ipairs(getRule.servers) do
                if server == serverId then
                    table.remove(getRule.servers, _)
                end
            end
            if useRemoteStorage then
                red:hset("request_rules_" .. envProfile, ruleId, cjson.encode(getRule))
            else
                Helper.setDataToFile(configPath .. "data/rules/" .. envProfile .. "/" .. ruleId .. ".json", getRule,
                    configPath .. "data/rules")
            end
        end
    end
end

local function listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
    local recordCount, totalRecords, records = 0, 0, {}
    -- Calculate the start and end indices for pagination
    local startIdx = (pageNumber - 1) * pageSize
    local endIdx = startIdx + pageSize - 1
    -- Get the total number of records
    local totalKeys, err = red:hlen(recordsKey)
    if not totalKeys or err or totalKeys == 0 then
        ngx.log(ngx.INFO, "Failed to retrieve total number of records: ", err)
        return {}
    end
    ---@diagnostic disable-next-line: cast-local-type
    totalRecords = tonumber(totalKeys)

    repeat
        local res, err = red:hscan(recordsKey, cursor, "COUNT", pageSize)
        if not res then
            ngx.log(ngx.INFO, "Failed to retrieve records: ", err)
            return {}
        end
        cursor = res[1]
        -- Iterate over the returned records
        for i = 1, #res[2], 2 do
            local recordValue = res[2][i + 1]
            local dataRecord = cjson.decode(recordValue)
            local key = res[2][i]
            recordCount = recordCount + 1
            -- Store the record in the result table if within the desired range
            if recordCount >= startIdx + 1 and recordCount <= endIdx + 1 then
                if type(qParams.meta) == "table" then
                    if qParams.meta.exclude == key then
                        goto continue
                    end
                end
                if type(qParams.filter) == "table" and qParams.filter.q ~= nil then
                    local fieldValue = dataRecord.name
                    fieldValue = fieldValue:lower()
                    local pattern = qParams.filter.q
                    pattern = pattern:lower()
                    if fieldValue and fieldValue:find(pattern, 1, true) then
                        table.insert(records, cjson.decode(recordValue))
                    end
                else
                    table.insert(records, cjson.decode(recordValue))
                end
                ::continue::
            elseif recordCount > endIdx + 1 then
                -- Break the loop if we have retrieved enough records
                break
            end
        end
    until cursor == "0" or recordCount >= endIdx + 1
    return records, totalRecords
end

local function listPaginationLocal(data, pageSize, pageNumber, qParams)
    local startIdx, endIdx = 0, #data

    if pageSize ~= nil or pageNumber ~= nil then
        startIdx = (pageNumber - 1) * pageSize + 1
        endIdx = startIdx + pageSize - 1
    end

    local currentPageData, totalRec = {}, #data
    for i = startIdx, math.min(endIdx, #data) do
        if data[i] ~= nil and data[i] ~= ngx.null and data[i] ~= "null" then
            if type(qParams.meta) == "table" then
                if qParams.meta.exclude == data[i].id then
                    goto continue
                end
            end
            if type(qParams.filter) == "table" and qParams.filter.q ~= nil then
                local fieldValue = data[i][qParams.type.key_name]
                fieldValue = fieldValue:lower()
                local pattern = qParams.filter.q
                pattern = pattern:lower()
                if fieldValue and fieldValue:find(pattern, 1, true) then
                    table.insert(currentPageData, data[i])
                end
                totalRec = #currentPageData
            else
                table.insert(currentPageData, data[i])
            end
            ::continue::
        end
    end
    return currentPageData, totalRec
end

-- Authentication

local function login(args)
    if settings then
        local suEmail = settings.super_user.email
        local suPassword = settings.super_user.password

        local payloads = Helper.GetPayloads(args)
        local password = Helper.hashPassword(payloads.password)

        if suEmail == payloads.email and suPassword == password then
            ngx.status = ngx.OK
            if useRemoteStorage then
                local session = require "resty.session".new()
                session:set_subject("Users")
                session:set(payloads.email, cjson.encode(payloads))
                session:save()
            end
            ngx.say(cjson.encode({
                data = {
                    user = payloads,
                    accessToken = Helper.generateToken(),
                    instance = {
                        instance_id = settings.instance_id,
                        instance_name = settings.instance_name,
                        instance_hash = settings.instance_hash,
                        serial_number = settings.serial_number,
                    }
                },
                status = 200
            }))
            ngx.exit(ngx.HTTP_OK)
        else
            Errors.throwError("Invalid credentials", ngx.HTTP_UNAUTHORIZED)
        end
    end
end

local function setStorage(body)
    local storageType = ""
    if settings then
        if type(body) == "table" then
            local keyset = {}
            local n = 0
            for k, v in pairs(body) do
                n = n + 1
                if type(v) == "string" then
                    table.insert(keyset, cjson.decode(k .. v))
                else
                    table.insert(keyset, cjson.decode(k))
                end
            end
            local payloads = keyset[1]
            storageType = payloads.storage
        else
            storageType = body
        end
        local writableFile, writableErr = io.open(configPath .. "data/settings.json", "w")
        settings.storage_type = storageType
        if writableFile == nil then
            Errors.throwError("Couldn't write file: " .. writableErr, ngx.HTTP_INTERNAL_SERVER_ERROR)
        else
            writableFile:write(cjson.encode(settings))
            writableFile:close()
            ngx.say(cjson.encode({
                data = {
                    storage = settings.storage_type
                }
            }))
        end
    end
end
if storageTypeOverride and storageTypeOverride ~= nil then
    setStorage(storageTypeOverride)
end

-- Servers APIs

local function listFromDisk(directory, pageSize, pageNumber, qParams)
    local files = {}
    -- Run the 'ls' command to get a list of filenames
    local output, error = io.popen("ls " .. configPath .. "data/" .. directory .. ""):read("*all")
    for filename in string.gmatch(output, "[^\r\n]+") do
        if filename:match("%.json$") then
            table.insert(files, filename)
        end
    end

    local jsonData, data = {}, {}
    for _, filename in ipairs(files) do
        local filePath = configPath .. "data/" .. directory .. "/" .. filename
        local fileAttr = lfs.attributes(filePath)
        if fileAttr then
            if fileAttr.mode == "file" then
                local file, fileErr = io.open(filePath, "rb")
                if file == nil then
                    return ngx.say(cjson.encode({
                        data = {},
                        total = 0
                    }))
                else
                    local jsonString = file:read "*a"
                    file:close()

                    if jsonString and jsonString ~= "" then
                        data = cjson.decode(jsonString)
                    end
                    if data ~= nil and data ~= ngx.null and data ~= "null" then
                        jsonData[_] = data
                    end
                end
            end
        end
    end

    local diskData, count = listPaginationLocal(jsonData, pageSize, pageNumber, qParams)
    return diskData, count
end

local function listServers(args)
    local counter = 0
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    qParams["type"] = {
        table = "servers",
        key_name = "server_name"
    }
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)

    -- Retrieve a page of records using HSCAN
    local cursor, totalRecords = "0", 0
    local allServers, servers = {}, {}
    if qParams.filter ~= nil then
        local filter = qParams.filter
        if filter.profile_id ~= nil then
            environment = filter.profile_id
        end
    end
    if settings then
        if settings.storage_type == "disk" then
            allServers, totalRecords = listFromDisk("servers/" .. environment, pageSize, pageNumber, qParams)
            -- totalRecords = #allServers
        else
            -- allServers, totalRecords = listFromDisk("servers/" .. environment, pageSize, pageNumber, qParams)
            -- if (allServers == nil or totalRecords == 0) then
            local recordsKey = "servers_" .. environment
            local records, totalCount = listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
            allServers = records
            totalRecords = totalCount
            -- end
        end
    end

    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allServers, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allServers, Helper.sortAsc(qParams.sort.field))
    end
    return ngx.say(cjson.encode({
        data = allServers,
        total = totalRecords
    }))
end

local function listServer(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    if settings then
        if settings.storage_type == "disk" then
            local jsonData, dataErr = Helper.getDataFromFile(configPath ..
                "data/servers/" .. envProfile .. "/" .. id .. ".json")
            if dataErr ~= nil then
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                jsonData = cjson.decode(jsonData)
                if jsonData.config then
                    local configDec, decodeErr = Helper.decodeBase64(jsonData.config)
                    if decodeErr ~= nil then
                        jsonData.config = configDec
                    end
                end
                if jsonData.varnish_vcl_config then
                    local vclDec, decodeErr = Helper.decodeBase64(jsonData.varnish_vcl_config)
                    if decodeErr ~= nil then
                        jsonData.varnish_vcl_config = vclDec
                    end
                end
                ngx.say(cjson.encode({
                    data = jsonData
                }))
            end
        else
            --     local server, dataErr = Helper.getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. id .. ".json")
            --     if dataErr or dataErr ~= nil then
            local server = red:hget("servers_" .. envProfile, id)
            -- end
            if type(server) == "string" then
                server = cjson.decode(server)
                if server.config then
                    local configDec, decodeErr = Helper.decodeBase64(server.config)
                    if decodeErr ~= nil then
                        server.config = configDec
                    end
                end

                if server.varnish_vcl_config then
                    local vclDec, decodeErr = Helper.decodeBase64(server.varnish_vcl_config)
                    if decodeErr ~= nil then
                        server.varnish_vcl_config = vclDec
                    end
                end
                ngx.say(cjson.encode({
                    data = server
                }))
            end
        end
    end
end

local function listSecrets(args)
    local counter = 0
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    qParams["type"] = {
        table = "secrets",
        key_name = "secret_name"
    }
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)

    -- Retrieve a page of records using HSCAN
    local cursor, totalRecords = "0", 0
    local allServers, servers = {}, {}
    if qParams.filter ~= nil then
        local filter = qParams.filter
        if filter.profile_id ~= nil then
            environment = filter.profile_id
        end
    end
    if settings then
        if settings.storage_type == "disk" then
            allServers, totalRecords = listFromDisk("secrets/" .. environment, pageSize, pageNumber, qParams)
            -- totalRecords = #allServers
        else
            -- allServers, totalRecords = listFromDisk("servers/" .. environment, pageSize, pageNumber, qParams)
            -- if (allServers == nil or totalRecords == 0) then
            local recordsKey = "secrets_" .. environment
            local records, totalCount = listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
            allServers = records
            totalRecords = totalCount
            -- end
        end
    end

    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allServers, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allServers, Helper.sortAsc(qParams.sort.field))
    end
    return ngx.say(cjson.encode({
        data = allServers,
        total = totalRecords
    }))
end

local function listSecret(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    if settings then
        if settings.storage_type == "disk" then
            local jsonData, dataErr = Helper.getDataFromFile(configPath ..
                "data/secrets/" .. envProfile .. "/" .. id .. ".json")
            if dataErr ~= nil then
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                jsonData = cjson.decode(jsonData)
                if jsonData.secrets then
                    for sIdx, secret in ipairs(jsonData.secrets) do
                        jsonData.secrets[sIdx].value = Base64.decode(jsonData.secrets[sIdx].value)
                    end
                end
                ngx.say(cjson.encode({
                    data = jsonData
                }))
            end
        else
            --     local server, dataErr = Helper.getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. id .. ".json")
            --     if dataErr or dataErr ~= nil then
            local server = red:hget("secrets_" .. envProfile, id)
            -- end
            if type(server) == "string" then
                server = cjson.decode(server)
                if server.config then
                    server.config = Base64.decode(server.config)
                end
                ngx.say(cjson.encode({
                    data = server
                }))
            end
        end
    end
end


local function listInstances(args)
    local counter = 0
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    qParams["type"] = {
        table = "instances",
        key_name = "instance_name"
    }
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)

    -- Retrieve a page of records using HSCAN
    local cursor, totalRecords = "0", 0
    local allServers, servers = {}, {}
    if qParams.filter ~= nil then
        local filter = qParams.filter
        if filter.profile_id ~= nil then
            environment = filter.profile_id
        end
    end
    if settings then
        if settings.storage_type == "disk" then
            allServers, totalRecords = listFromDisk("instances/" .. environment, pageSize, pageNumber, qParams)
            -- totalRecords = #allServers
        else
            -- allServers, totalRecords = listFromDisk("servers/" .. environment, pageSize, pageNumber, qParams)
            -- if (allServers == nil or totalRecords == 0) then
            local recordsKey = "instances_" .. environment
            local records, totalCount = listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
            allServers = records
            totalRecords = totalCount
            -- end
        end
    end

    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allServers, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allServers, Helper.sortAsc(qParams.sort.field))
    end
    return ngx.say(cjson.encode({
        data = allServers,
        total = totalRecords
    }))
end

local function listInstance(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    if settings then
        if settings.storage_type == "disk" then
            local jsonData, dataErr = Helper.getDataFromFile(configPath ..
                "data/instances/" .. envProfile .. "/" .. id .. ".json")
            if dataErr ~= nil then
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                jsonData = cjson.decode(jsonData)
                if jsonData.secrets then
                    for sIdx, secret in ipairs(jsonData.secrets) do
                        jsonData.secrets[sIdx].value = Base64.decode(jsonData.secrets[sIdx].value)
                    end
                end
                ngx.say(cjson.encode({
                    data = jsonData
                }))
            end
        else
            --     local server, dataErr = Helper.getDataFromFile(configPath .. "data/servers/" .. envProfile .. "/" .. id .. ".json")
            --     if dataErr or dataErr ~= nil then
            local server = red:hget("instances_" .. envProfile, id)
            -- end
            if type(server) == "string" then
                server = cjson.decode(server)
                if server.config then
                    server.config = Base64.decode(server.config)
                end
                ngx.say(cjson.encode({
                    data = server
                }))
            end
        end
    end
end


local function createUpdateServer(body, uuid)
    local payloads, response = Helper.GetPayloads(body), {}

    -- Validate payload
    local validationErrors = validateServerPayload(payloads)
    handleValidationErrors(validationErrors, "server")

    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end

    -- Generate config if not provided
    if not payloads.config or payloads.config == "" then
        local listen_port = "80"
        -- Safely access listens array - check first element directly instead of using # operator
        if payloads.listens and type(payloads.listens) == "table" then
            local first_listen = payloads.listens[1]
            if first_listen and type(first_listen) == "table" and first_listen.listen then
                listen_port = tostring(first_listen.listen)
            end
        end
        local server_name = payloads.server_name or "localhost"
        local root = payloads.root or "/var/www/html"
        local index = payloads.index or "index.html"
        local access_log = payloads.access_log or "logs/access.log"
        local error_log = payloads.error_log or "logs/error.log"

        payloads.config = string.format([[server {
      listen %s;  # Listen on port (HTTP)
      server_name %s;  # Your domain name
      root %s;  # Document root directory
      index %s;  # Default index files
      access_log %s;  # Access log file location
      error_log %s;  # Error log file location



  }

  ]], listen_port, server_name, root, index, access_log, error_log)
    end

    if uuid then
        response = CreateUpdateRecord(payloads, uuid, "servers", "servers", "update")
    else
        payloads.id = "host:" .. payloads.server_name
        payloads.proxy_pass = "http://localhost"
        response = CreateUpdateRecord(payloads, payloads.id, "servers", "servers", "create")
    end

    -- Handle SSL certificate configuration if ssl_enabled is set
    if payloads.ssl_enabled then
        local ssl_config = {
            ssl_enabled = payloads.ssl_enabled,
            ssl_email = payloads.ssl_email,
            ssl_auto_renew = payloads.ssl_auto_renew ~= false,   -- default true
            ssl_force_https = payloads.ssl_force_https ~= false, -- default true
            ssl_staging = payloads.ssl_staging ~= false          -- default true for safety
        }
        local ssl_ok, ssl_err = SslManager.store_ssl_config(payloads.server_name, ssl_config)
        if not ssl_ok then
            ngx.log(ngx.ERR, "Failed to store SSL config for ", payloads.server_name, ": ", ssl_err)
        else
            ngx.log(ngx.INFO, "SSL configuration stored for domain: ", payloads.server_name)
            -- Add domain to SSL cache for immediate availability
            if AddSslDomainToCache then
                AddSslDomainToCache(payloads.server_name)
            end
            -- Trigger certificate readiness check
            SslManager.trigger_certificate_issuance(payloads.server_name)
        end
    else
        -- If SSL is disabled, clear force HTTPS — can't redirect to HTTPS without a certificate
        payloads.ssl_force_https = false
        -- If SSL is disabled, remove SSL config
        local ssl_ok, ssl_err = SslManager.remove_ssl_config(payloads.server_name)
        if not ssl_ok then
            ngx.log(ngx.WARN, "Failed to remove SSL config for ", payloads.server_name, ": ", ssl_err)
        end
        -- Remove domain from SSL cache
        if RemoveSslDomainFromCache then
            RemoveSslDomainFromCache(payloads.server_name)
        end
    end

    -- Handle static content caching configuration if cache_enabled is set
    if payloads.cache_enabled ~= nil then
        if payloads.cache_enabled then
            local cache_options = {}
            if payloads.cache_ttl then cache_options.cache_ttl = tonumber(payloads.cache_ttl) end
            if payloads.cached_extensions then cache_options.cached_extensions = payloads.cached_extensions end
            if payloads.cached_mime_types then cache_options.cached_mime_types = payloads.cached_mime_types end
            if payloads.cache_bypass_cookie then cache_options.cache_bypass_cookie = payloads.cache_bypass_cookie end
            if payloads.cache_bypass_header then cache_options.cache_bypass_header = payloads.cache_bypass_header end

            local cache_ok, cache_err = CacheManager.enable_cache(payloads.server_name, cache_options)
            if not cache_ok then
                ngx.log(ngx.ERR, "Failed to enable cache for ", payloads.server_name, ": ", cache_err)
            else
                ngx.log(ngx.INFO, "Cache enabled for domain: ", payloads.server_name)
            end
        else
            -- If caching is disabled, update cache config
            local cache_ok, cache_err = CacheManager.disable_cache(payloads.server_name)
            if not cache_ok then
                ngx.log(ngx.WARN, "Failed to disable cache for ", payloads.server_name, ": ", cache_err)
            else
                ngx.log(ngx.INFO, "Cache disabled for domain: ", payloads.server_name)
            end
        end
    end

    -- Handle Docker blob caching configuration
    if payloads.cache_docker_blobs ~= nil then
        local existing_config = CacheManager.get_cache_config(payloads.server_name) or {}
        existing_config.cache_docker_blobs = payloads.cache_docker_blobs
        if payloads.cache_docker_blobs_ttl then
            existing_config.cache_docker_blobs_ttl = tonumber(payloads.cache_docker_blobs_ttl)
        end
        if payloads.cache_docker_manifests ~= nil then
            existing_config.cache_docker_manifests = payloads.cache_docker_manifests
        end
        if payloads.cache_docker_manifests_ttl then
            existing_config.cache_docker_manifests_ttl = tonumber(payloads.cache_docker_manifests_ttl)
        end
        if payloads.cache_docker_serve_stale ~= nil then
            existing_config.cache_docker_serve_stale = payloads.cache_docker_serve_stale
        end
        if payloads.cache_docker_stale_ttl then
            existing_config.cache_docker_stale_ttl = tonumber(payloads.cache_docker_stale_ttl)
        end
        local cache_ok, cache_err = CacheManager.save_cache_config(payloads.server_name, existing_config)
        if not cache_ok then
            ngx.log(ngx.ERR, "Failed to save Docker cache config for ", payloads.server_name, ": ", cache_err)
        else
            ngx.log(ngx.INFO, "Docker blob cache ", payloads.cache_docker_blobs and "enabled" or "disabled",
                " for domain: ", payloads.server_name)
        end
    end

    -- Handle Varnish configuration if varnish_enabled is set
    if payloads.varnish_enabled ~= nil then
        if payloads.varnish_enabled then
            local varnish_options = {}
            if payloads.varnish_config and type(payloads.varnish_config) == "table" then
                varnish_options = payloads.varnish_config
            end
            -- Carry over snippets if provided
            if payloads.varnish_snippets and type(payloads.varnish_snippets) == "table" then
                varnish_options.snippets = payloads.varnish_snippets
            end
            local varnish_ok, varnish_err = VarnishManager.enable_varnish(payloads.server_name, varnish_options)
            if not varnish_ok then
                ngx.log(ngx.ERR, "Failed to enable Varnish for ", payloads.server_name, ": ", varnish_err)
            else
                ngx.log(ngx.INFO, "Varnish enabled for domain: ", payloads.server_name)
            end
        else
            local varnish_ok, varnish_err = VarnishManager.disable_varnish(payloads.server_name)
            if not varnish_ok then
                ngx.log(ngx.WARN, "Failed to disable Varnish for ", payloads.server_name, ": ", varnish_err)
            else
                ngx.log(ngx.INFO, "Varnish disabled for domain: ", payloads.server_name)
            end
        end
    elseif payloads.varnish_config or payloads.varnish_snippets then
        -- Update config/snippets even if varnish_enabled not explicitly set
        local existing = VarnishManager.get_varnish_config(payloads.server_name)
        if existing then
            if payloads.varnish_config and type(payloads.varnish_config) == "table" then
                for k, v in pairs(payloads.varnish_config) do
                    existing[k] = v
                end
            end
            if payloads.varnish_snippets and type(payloads.varnish_snippets) == "table" then
                existing.snippets = payloads.varnish_snippets
            end
            VarnishManager.save_varnish_config(payloads.server_name, existing)
        end
    end

    ngx.say(cjson.encode({
        data = response
    }))
end

local function createDeleteServer(body, uuid)
    local serverId = uuid
    local payloads = Helper.GetPayloads(body)
    if payloads == ngx.null or not body or type(payloads) == "nil" then
        payloads = ngx.req.get_uri_args()
    end
    local envProfile = "prod"
    if payloads.ids ~= nil and payloads.ids.envProfile ~= nil then
        envProfile = payloads.ids.envProfile
    elseif payloads.envProfile ~= nil then
        envProfile = payloads.envProfile
    end

    if settings then
        if uuid ~= "" and uuid ~= nil then
            if settings.storage_type == "disk" then
                os.remove(configPath .. "data/servers/" .. envProfile .. "/" .. uuid .. ".json")
            else
                -- os.remove(configPath .. "data/servers/" .. envProfile .. "/" .. uuid .. ".json")
                local oldDomain, oldDmnErr = red:hget("servers_" .. envProfile, uuid)
                if oldDomain and oldDomain ~= "null" and type(oldDomain) == "string" then
                    oldDomain = cjson.decode(oldDomain)
                    oldServerName = oldDomain.server_name
                    if oldDomain.rules ~= nil then
                        deleteServerFromRules(oldDomain.rules, uuid, envProfile)
                    end
                    if oldDomain.match_cases ~= nil and type(next(oldDomain.match_cases)) ~= nil then
                        for _, matchCase in pairs(oldDomain.match_cases) do
                            deleteServerFromRules(matchCase.statement, uuid, envProfile)
                        end
                    end
                else
                    ngx.log(ngx.ERR, "Error while getting domain from redis: ", oldDmnErr)
                end
                red:hdel("servers_" .. envProfile, uuid)
            end
        elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
            for value = 1, #payloads.ids.ids do
                if settings.storage_type == "disk" then
                    os.remove(configPath .. "data/servers/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
                else
                    -- os.remove(configPath .. "data/servers/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
                    local oldDomain, oldDmnErr = red:hget("servers_" .. envProfile, payloads.ids.ids[value])
                    if oldDomain and oldDomain ~= "null" and type(oldDomain) == "string" then
                        oldDomain = cjson.decode(oldDomain)
                        oldServerName = oldDomain.server_name
                        if oldDomain.rules ~= nil then
                            deleteServerFromRules(oldDomain.rules, uuid, envProfile)
                        end
                        if oldDomain.match_cases ~= nil and type(next(oldDomain.match_cases)) ~= nil then
                            for _, matchCase in pairs(oldDomain.match_cases) do
                                deleteServerFromRules(matchCase.statement, uuid, envProfile)
                            end
                        end
                    else
                        ngx.log(ngx.ERR, "Error while getting domain from redis: ", oldDmnErr)
                    end
                    red:hdel("servers_" .. envProfile, payloads.ids.ids[value])
                end
            end
        end
    end
    ngx.say(cjson.encode({
        data = { "success" }
    }))
end

-- Users APIs

local function createUserInDisk(payloads, uuid)
    local file, err = io.open(configPath .. "data/users.json", "rb")
    if file == nil then
        file, err = io.open(configPath .. "data/users.json", "w")
    end
    if file ~= nil then
        local jsonString = file:read "*a"
        file:close()
        local users = {}
        if jsonString ~= nil and jsonString ~= "" then
            users = cjson.decode(jsonString)
        end
        if uuid then
            for key, value in pairs(users) do
                if users[key]["id"] == uuid then
                    users[key] = payloads
                end
            end
        else
            table.insert(users, payloads)
        end

        local writableFile, writableErr = io.open(configPath .. "data/users.json", "w")
        if writableFile == nil then
            Errors.throwError("Couldn't write file: " .. writableErr, ngx.HTTP_INTERNAL_SERVER_ERROR)
        else
            writableFile:write(cjson.encode(users))
            writableFile:close()
            return payloads
        end
    end
end

local function listUsers(args)
    local users = {}
    local keys = {}
    local params = args
    params = params.params
    local qParams = cjson.decode(params)
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)

    -- Retrieve a page of records using HSCAN
    local cursor = "0"
    local recordCount, totalRecords = 0, 0
    if settings then
        if settings.storage_type == "disk" then
            local file, err = io.open(configPath .. "data/users.json", "rb")
            if file == nil then
                ngx.say(cjson.encode({
                    data = {},
                    total = 0
                }))
                ngx.exit(ngx.HTTP_OK)
            else
                local jsonString = file:read "*a"
                file:close()
                users = cjson.decode(jsonString)
                local currentPageData, totalPages = listPaginationLocal(users, pageSize, pageNumber, qParams)
                users, totalRecords = currentPageData, totalPages
            end
        else
            local recordsKey = "users"
            local records, totalCount = listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
            users = records
            totalRecords = totalCount
        end
    end
    if next(users) ~= nil then
        if qParams.sort.order == "DESC" then
            table.sort(users, Helper.sortDesc(qParams.sort.field))
        else
            table.sort(users, Helper.sortAsc(qParams.sort.field))
        end
    end
    ngx.say(cjson.encode({
        data = users,
        total = totalRecords
    }))
    ngx.exit(ngx.HTTP_OK)
end

local function listUser(args, uuid)
    if settings then
        if settings.storage_type == "disk" then
            local file, err = io.open(configPath .. "data/users.json", "rb")
            if file == nil then
                Errors.throwError("Couldn't read file: " .. err, ngx.HTTP_INTERNAL_SERVER_ERROR)
            else
                local jsonString = file:read "*a"
                file:close()
                local users = cjson.decode(jsonString)
                for key, value in pairs(users) do
                    if users[key]["id"] == uuid then
                        ngx.say({ cjson.encode({
                            data = value
                        }) })
                        ngx.exit(ngx.HTTP_OK)
                    end
                end
            end
        else
            local user, err = red:hget("users", uuid)
            if user then
                user = cjson.decode(user)
                ngx.say(cjson.encode({
                    data = user
                }))
                ngx.exit(ngx.HTTP_OK)
            end
            if err then
                Errors.throwError(err, ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
        end
    end
end

local function createUpdateUser(body, uuid)
    local payloads = Helper.GetPayloads(body)
    local getUuid = uuid
    if not uuid then
        getUuid = Helper.generate_uuid()
        payloads.id = getUuid
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    if settings then
        if uuid ~= "" and uuid ~= nil then
            if settings.storage_type == "disk" then
                local users = createUserInDisk(payloads, uuid)
                ngx.say(cjson.encode({
                    data = users
                }))
                ngx.exit(ngx.HTTP_OK)
            else
                local redis_json = {}
                redis_json[getUuid] = cjson.encode(payloads)
                local inserted, err = red:hmset("users", redis_json)
                if inserted then
                    ngx.say(cjson.encode({
                        data = payloads
                    }))
                    ngx.exit(ngx.HTTP_OK)
                end
                if err then
                    Errors.throwError(err, ngx.HTTP_INTERNAL_SERVER_ERROR)
                end
            end
        else
            local users = createUserInDisk(payloads, uuid)
            if settings.storage_type == "disk" then
                ngx.say(cjson.encode({
                    data = users
                }))
                ngx.exit(ngx.HTTP_OK)
            end

            local redis_json = {}
            redis_json[getUuid] = cjson.encode(payloads)
            local inserted, err = red:hmset("users", redis_json)
            if inserted then
                ngx.say(cjson.encode({
                    data = payloads
                }))
                ngx.exit(ngx.HTTP_OK)
            end
            if err then
                Errors.throwError(err, ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
        end
    end
end

local function deleteUserInDisk(uuid)
    local file, err = io.open(configPath .. "data/users.json", "rb")
    if file == nil then
        Errors.throwError("Couldn't read file: " .. err, ngx.HTTP_INTERNAL_SERVER_ERROR)
    else
        local jsonString = file:read "*a"
        file:close()
        local users = cjson.decode(jsonString)
        if type(uuid) == "string" then
            for key, value in pairs(users) do
                if users[key]["id"] == uuid then
                    table.remove(users, key)
                end
            end
        elseif type(uuid) == "table" then
            for uuidK, id in pairs(uuid) do
                for key, value in pairs(users) do
                    if users[key]["id"] == id then
                        table.remove(users, key)
                    end
                end
            end
        end
        return users
    end
end

local function deleteUsers(args, uuid)
    local payloads = Helper.GetPayloads(args)
    local restUsers = {}
    if settings then
        if uuid ~= "" and uuid ~= nil then
            if settings.storage_type == "disk" then
                restUsers = deleteUserInDisk(uuid)
            else
                local del, err = red:hdel("users", uuid)
                if del then
                    restUsers = del
                end
                if err then
                    Errors.throwError(err, ngx.HTTP_INTERNAL_SERVER_ERROR)
                end
            end
        elseif payloads and payloads.ids and #payloads.ids > 0 then
            if settings then
                if settings.storage_type == "disk" then
                    restUsers = deleteUserInDisk(payloads.ids)
                else
                    for value = 1, #payloads.ids do
                        restUsers = red:hdel("users", payloads.ids[value])
                    end
                end
            end
        end
        if settings.storage_type == "disk" then
            local writableFile, writableErr = io.open(configPath .. "data/users.json", "w")
            if writableFile == nil then
                Errors.throwError("Couldn't write file: " .. writableErr, ngx.HTTP_INTERNAL_SERVER_ERROR)
            else
                writableFile:write(cjson.encode(restUsers))
                writableFile:close()
            end
        end
        ngx.say(cjson.encode({
            data = (type(restUsers) == "table" and restUsers or { restUsers })
        }))
        ngx.exit(ngx.HTTP_OK)
    end
end
-- HTTP Request rules:
local function listRules(args)
    local exist_values = {}
    local allRules, keys, totalRecords = {}, {}, 0
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    qParams["type"] = {
        table = "rules",
        key_name = "name"
    }
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)
    if qParams.filter ~= nil then
        local filter = qParams.filter
        if filter.profile_id ~= nil then
            environment = filter.profile_id
        end
    end
    if settings then
        if settings.storage_type == "disk" then
            allRules, totalRecords = listFromDisk("rules/" .. environment, pageSize, pageNumber, qParams)
        else
            -- allRules, totalRecords = listFromDisk("rules/" .. environment, pageSize, pageNumber, qParams)
            -- if allRules == nil or totalRecords == 0 then
            allRules, totalRecords = listWithPagination("request_rules_" .. environment, "0", pageSize, pageNumber,
                qParams)
            -- end
        end
    end
    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allRules, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allRules, Helper.sortAsc(qParams.sort.field))
    end
    ngx.say({ cjson.encode({
        data = allRules,
        total = totalRecords
    }) })
end

local function listRule(args, uuid)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    if settings then
        if settings.storage_type == "disk" then
            local jsonData, dataErr = Helper.getDataFromFile(configPath ..
                "data/rules/" .. envProfile .. "/" .. uuid .. ".json")
            if dataErr == nil then
                local resultData = cjson.decode(jsonData)
                if resultData.match.rules.jwt_token_validation_value ~= nil and
                    resultData.match.rules.jwt_token_validation_key ~= nil then
                    resultData.match.rules.jwt_token_validation_key =
                        Base64.decode(resultData.match.rules.jwt_token_validation_key)
                end
                -- S3 keys are now stored as plaintext (schema v2) — no decoding needed
                ngx.say(cjson.encode({
                    data = resultData
                }))
            else
                Errors.throwError("Error" .. dataErr, ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
        else
            -- local exist_value, Rerr = Helper.getDataFromFile(configPath .. "data/rules/" .. envProfile .. "/" .. uuid .. ".json")
            -- if exist_value == nil or Rerr then
            local exist_value, Rerr = red:hget("request_rules_" .. envProfile, uuid)
            -- end
            exist_value = cjson.decode(exist_value)
            -- if exist_value.match.response.message then
            --     exist_value.match.response.message = Base64.decode(exist_value.match.response.message)
            -- end

            if exist_value.match.rules.jwt_token_validation_value ~= nil and
                exist_value.match.rules.jwt_token_validation_key ~= nil then
                exist_value.match.rules.jwt_token_validation_key =
                    Base64.decode(exist_value.match.rules.jwt_token_validation_key)
            end
            -- S3 keys are now stored as plaintext (schema v2) — no decoding needed

            ngx.say({ cjson.encode({
                data = exist_value
            }) })
        end
    end
    -- end
end

local function createDeleteRules(body, uuid)
    local payloads = Helper.GetPayloads(body)
    if payloads == ngx.null or not body or type(payloads) == "nil" then
        payloads = ngx.req.get_uri_args()
    end
    local envProfile = "prod"
    if payloads.ids ~= nil and payloads.ids.envProfile ~= nil then
        envProfile = payloads.ids.envProfile
    elseif payloads.envProfile ~= nil then
        envProfile = payloads.envProfile
    end
    if uuid ~= "" and uuid ~= nil then
        if settings then
            if settings.storage_type == "disk" then
                os.remove(configPath .. "data/rules/" .. envProfile .. "/" .. uuid .. ".json")
            else
                deleteRuleFromServer(uuid, envProfile)
                red:hdel("request_rules_" .. envProfile, uuid)
            end
        end
    elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            if settings then
                if useRemoteStorage then
                    deleteRuleFromServer(payloads.ids.ids[value], envProfile)
                    red:hdel("request_rules_" .. envProfile, payloads.ids.ids[value])
                else
                    os.remove(configPath .. "data/rules/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
                    local command = "rm -f " ..
                        configPath .. "data/rules/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json"
                    os.execute(command)
                end
            end
        end
    end

    ngx.say(cjson.encode({
        data = payloads
    }))
end

local function createDeleteSecrets(body, uuid)
    local payloads = Helper.GetPayloads(body)
    if payloads == ngx.null or not body or type(payloads) == "nil" then
        payloads = ngx.req.get_uri_args()
    end
    local envProfile = "prod"
    if payloads.ids ~= nil and payloads.ids.envProfile ~= nil then
        envProfile = payloads.ids.envProfile
    elseif payloads.envProfile ~= nil then
        envProfile = payloads.envProfile
    end
    if uuid ~= "" and uuid ~= nil then
        if settings then
            if settings.storage_type == "disk" then
                os.remove(configPath .. "data/secrets/" .. envProfile .. "/" .. uuid .. ".json")
            else
                red:hdel("secrets_" .. envProfile, uuid)
            end
        end
    elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            if settings then
                if useRemoteStorage then
                    red:hdel("secrets_" .. envProfile, payloads.ids.ids[value])
                else
                    os.remove(configPath .. "data/secrets/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
                    local command = "rm -f " ..
                        configPath .. "data/secrets/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json"
                    os.execute(command)
                end
            end
        end
    end

    ngx.say(cjson.encode({
        data = payloads
    }))
end
local function createDeleteInstances(body, uuid)
    local payloads = Helper.GetPayloads(body)
    if payloads == ngx.null or not body or type(payloads) == "nil" then
        payloads = ngx.req.get_uri_args()
    end
    local envProfile = "prod"
    if payloads.ids ~= nil and payloads.ids.envProfile ~= nil then
        envProfile = payloads.ids.envProfile
    elseif payloads.envProfile ~= nil then
        envProfile = payloads.envProfile
    end
    if uuid ~= "" and uuid ~= nil then
        if settings then
            if settings.storage_type == "disk" then
                os.remove(configPath .. "data/instances/" .. envProfile .. "/" .. uuid .. ".json")
            else
                red:hdel("instances_" .. envProfile, uuid)
            end
        end
    elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            if settings then
                if useRemoteStorage then
                    red:hdel("instances_" .. envProfile, payloads.ids.ids[value])
                else
                    os.remove(configPath .. "data/instances/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
                    local command = "rm -f " ..
                        configPath .. "data/instances/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json"
                    os.execute(command)
                end
            end
        end
    end

    ngx.say(cjson.encode({
        data = payloads
    }))
end

CreateUpdateRecord = function(json_val, uuid, key_name, folder_name, method)
    local formatResponse = {}
    json_val['data'] = nil
    for k, v in pairs(json_val) do
        if v == nil or v == "" then
            json_val[k] = nil
        end
    end

    local envProfile = "prod"
    if json_val.profile_id ~= nil then
        envProfile = json_val.profile_id
    end

    if folder_name == "secrets" and json_val.secrets ~= nil then
        for sIdx, secret in ipairs(json_val.secrets) do
            json_val.secrets[sIdx].value = Base64.encode(json_val.secrets[sIdx].value)
        end
    end
    if folder_name == "rules" and json_val.match.rules.jwt_token_validation_value ~= nil and
        json_val.match.rules.jwt_token_validation_key ~= nil then
        json_val.match.rules.jwt_token_validation_key = Base64.encode(json_val.match.rules.jwt_token_validation_key)
        -- S3 keys: store as plaintext (schema v2), only fix URL encoding
        if json_val.match.rules.amazon_s3_access_key then
            json_val.match.rules.amazon_s3_access_key = string.gsub(json_val.match.rules.amazon_s3_access_key, "%%2B",
                "+")
        end
        if json_val.match.rules.amazon_s3_secret_key then
            json_val.match.rules.amazon_s3_secret_key = string.gsub(json_val.match.rules.amazon_s3_secret_key, "%%2B",
                "+")
        end
        -- Mark as schema v2 for rule_loader backward compatibility
        json_val._schema_version = 2
    end
    if key_name == 'servers' and json_val.config then
        json_val.config = Base64.encode(json_val.config)
    end
    if key_name == 'servers' and json_val.varnish_vcl_config then
        json_val.varnish_vcl_config = Base64.encode(json_val.varnish_vcl_config)
    end
    if folder_name == 'rules' and json_val.match and json_val.match.response and json_val.match.response.message then
        json_val.match.response.message = string.gsub(json_val.match.response.message, "%%2B", "+")
    end

    local redis_json, domainJson = {}, {}
    if key_name == 'servers' and json_val.server_name then
        local getDomain = ""
        if useRemoteStorage then
            getDomain = red:hget(key_name .. "_" .. envProfile, json_val.id)
        else
            getDomain = Helper.getDataFromFile(configPath ..
                "data/servers/" .. envProfile .. "/" .. json_val.id .. ".json")
        end
        if getDomain and getDomain ~= nil and type(getDomain) == "string" and method == "create" then
            ngx.status = ngx.HTTP_CONFLICT
            formatResponse = {
                message = string.format(
                    "Server name %s is alredy exist either you need to delete that, or you can update the same record.",
                    json_val.server_name)
            }
            return formatResponse
        end
        if method == "update" and json_val.id ~= "host:" .. json_val.server_name then
            local previousDomain = ""
            if useRemoteStorage then
                previousDomain = red:hget(key_name .. "_" .. envProfile, "host:" .. json_val.server_name)
            else
                previousDomain = Helper.getDataFromFile(configPath ..
                    "data/servers/" .. envProfile .. "/host:" .. json_val.server_name .. ".json")
            end
            if previousDomain and previousDomain ~= nil and type(previousDomain) == "string" then
                ngx.status = ngx.HTTP_CONFLICT
                formatResponse = {
                    message = string.format(
                        "Server name %s is alredy exist either you need to delete that, or you can update the same record.",
                        json_val.server_name)
                }
                return formatResponse
            end
        end
    end
    if key_name == 'servers' and json_val.rules ~= nil and type(json_val.rules) ~= "userdata" and json_val.rules then
        updateServerInRules(json_val.rules, json_val.id, "rules", envProfile)
    end

    if key_name == "servers" and json_val.match_cases ~= nil and type(next(json_val.match_cases)) ~= nil then
        for index, case in ipairs(json_val.match_cases) do
            updateServerInRules(case.statement, json_val.id, "statement", envProfile)
        end
    end

    local filePathDir = configPath .. "data/" .. folder_name .. "/" .. envProfile
    local nginxTenantConfDir = settings.nginx.tenant_conf_path or "/opt/nginx/conf.d"
    local rebootFilePath = settings.nginx.reboot_file_path or "/tmp/nginx/nginx-reboot-required"
    local trimmed_path = string.match(rebootFilePath, "(.+)/[^/]+$")
    if not Helper.isDirectoryExists(trimmed_path) then
        local isDirCreated, errDir = Helper.createDirectoryRecursive(trimmed_path)
        if not isDirCreated and errDir then
            Errors.throwError(errDir .. " while creating " .. trimmed_path, ngx.HTTP_INTERNAL_SERVER_ERROR)
        end
    end
    -- HS 28/08/2024 This part of the code need to be refactor or optimise
    if useRemoteStorage then
        redis_json[uuid] = cjson.encode(json_val)
        red:hmset(key_name .. "_" .. envProfile, redis_json)
    end
    Helper.setDataToFile(filePathDir .. "/" .. uuid .. ".json", json_val, filePathDir)
    if key_name == "servers" then
        local configString = Base64.decode(json_val.config)
        Helper.setDataToFile(filePathDir .. "/conf/" .. json_val.server_name .. ".conf", Helper.cleanString(configString),
            filePathDir .. "/conf", "conf")
        json_val.nginx_status_check = "error"
        if json_val.config_status then
            if Helper.isFileExists(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf") == false then
                Conf.saveConfFiles(nginxTenantConfDir, Helper.cleanString(configString), json_val.server_name .. ".conf")
                local nginxStatus, commandStatus = Helper.testNginxConfig()
                local isSuccess = Helper.isStringContains("nginx.conf syntax is ok", nginxStatus)
                json_val.nginx_status = nginxStatus
                if isSuccess then
                    json_val.nginx_status_check = "success"
                    Conf.CreateNginxFlag(rebootFilePath)
                else
                    json_val.config_status = false
                    Helper.setDataToFile(filePathDir .. "/" .. uuid .. ".json", json_val, filePathDir)
                    os.remove(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf")
                    Conf.CreateNginxFlag(rebootFilePath)
                end
            else
                local sourceFilePath = filePathDir .. "/conf/" .. json_val.server_name .. ".conf"
                local destinationFilePath = nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf"
                local isFilesSame = Conf.compareFiles(sourceFilePath, destinationFilePath)
                if isFilesSame == false then
                    Conf.saveConfFiles(nginxTenantConfDir, Helper.cleanString(configString),
                        json_val.server_name .. ".conf")
                    local nginxStatus, commandStatus = Helper.testNginxConfig()
                    local isSuccess = Helper.isStringContains("nginx.conf syntax is ok", nginxStatus)
                    json_val.nginx_status = nginxStatus
                    if isSuccess then
                        json_val.nginx_status_check = "success"
                        Conf.CreateNginxFlag(rebootFilePath)
                    else
                        json_val.config_status = false
                        Helper.setDataToFile(filePathDir .. "/" .. uuid .. ".json", json_val, filePathDir)
                        os.remove(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf")
                        Conf.CreateNginxFlag(rebootFilePath)
                    end
                end
            end
        else
            if Helper.isFileExists(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf") then
                os.remove(nginxTenantConfDir .. "/" .. json_val.server_name .. ".conf")
                Conf.CreateNginxFlag(rebootFilePath)
            end
        end
    end
    ngx.status = ngx.HTTP_OK
    return json_val
end

local function createUpdateRules(body, uuid)
    local payloads, response = Helper.GetPayloads(body), {}

    -- Validate payload
    local validationErrors = validateRulePayload(payloads)
    handleValidationErrors(validationErrors, "rule")

    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    if uuid then
        response = CreateUpdateRecord(payloads, uuid, "request_rules", "rules", "update")
    else
        local envProfile = "prod"
        if payloads.profile_id ~= nil then
            envProfile = payloads.profile_id
        end
        local folderPath = string.format("%sdata/rules/%s", configPath, envProfile)
        local isUnique, err = Helper.isUniqueField(folderPath, "name", payloads.name)
        if not isUnique then
            Errors.conflict(err, { name = payloads.name })
        end
        payloads.id = Helper.generate_uuid()
        response = CreateUpdateRecord(payloads, payloads.id, "request_rules", "rules", "create")
    end
    ngx.say(cjson.encode({
        data = response
    }))
end

local function createUpdateSecrets(body, uuid)
    local payloads, response = Helper.GetPayloads(body), {}
    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    if uuid then
        response = CreateUpdateRecord(payloads, uuid, "secrets", "secrets", "update")
    else
        payloads.id = Helper.generate_uuid()
        response = CreateUpdateRecord(payloads, payloads.id, "secrets", "secrets", "create")
    end
    ngx.say(cjson.encode({
        data = response
    }))
end

local function createUpdateInstances(body, uuid)
    local payloads, response = Helper.GetPayloads(body), {}
    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    if uuid then
        response = CreateUpdateRecord(payloads, uuid, "instances", "instances", "update")
    else
        payloads.id = Helper.generate_uuid()
        response = CreateUpdateRecord(payloads, payloads.id, "instances", "instances", "create")
    end
    ngx.say(cjson.encode({
        data = response
    }))
end

-- =====================================================
-- WAF Rules API Functions
-- =====================================================
local function listWafRules(args)
    local allRules, totalRecords = {}, 0
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    qParams["type"] = {
        table = "waf_rules",
        key_name = "name"
    }
    local pageSize = qParams.pagination.perPage
    local pageNumber = qParams.pagination.page
    if qParams.filter ~= nil and qParams.filter.profile_id ~= nil then
        environment = qParams.filter.profile_id
    end
    allRules, totalRecords = listFromDisk("waf_rules/" .. environment, pageSize, pageNumber, qParams)
    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allRules, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allRules, Helper.sortAsc(qParams.sort.field))
    end
    ngx.say(cjson.encode({
        data = allRules,
        total = totalRecords
    }))
end

local function listWafRule(args, uuid)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local jsonData, dataErr = Helper.getDataFromFile(configPath ..
        "data/waf_rules/" .. envProfile .. "/" .. uuid .. ".json")
    if dataErr == nil then
        local resultData = cjson.decode(jsonData)
        ngx.say(cjson.encode({
            data = resultData
        }))
    else
        Errors.throwError("WAF rule not found: " .. tostring(dataErr), ngx.HTTP_NOT_FOUND)
    end
end

local function createUpdateWafRules(body, uuid)
    local payloads, response = Helper.GetPayloads(body), {}

    local validationErrors = validateWafRulePayload(payloads)
    handleValidationErrors(validationErrors, "waf_rule")

    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    ---@diagnostic disable-next-line: param-type-mismatch
    payloads.updated_at = os.time(os.date("!*t"))

    if uuid then
        response = CreateUpdateRecord(payloads, uuid, "waf_rules", "waf_rules", "update")
    else
        local envProfile = payloads.profile_id or "prod"
        local folderPath = string.format("%sdata/waf_rules/%s", configPath, envProfile)
        local isUnique, err = Helper.isUniqueField(folderPath, "name", payloads.name)
        if not isUnique then
            Errors.conflict(err, { name = payloads.name })
        end
        payloads.id = Helper.generate_uuid()
        response = CreateUpdateRecord(payloads, payloads.id, "waf_rules", "waf_rules", "create")
    end
    ngx.say(cjson.encode({
        data = response
    }))
end

local function createDeleteWafRules(body, uuid)
    local payloads = Helper.GetPayloads(body)
    if payloads == ngx.null or not body or type(payloads) == "nil" then
        payloads = ngx.req.get_uri_args()
    end
    local envProfile = "prod"
    if payloads.ids ~= nil then
        envProfile = payloads.ids.envProfile or "prod"
    elseif payloads.envProfile then
        envProfile = payloads.envProfile
    end
    if uuid ~= "" and uuid ~= nil then
        os.remove(configPath .. "data/waf_rules/" .. envProfile .. "/" .. uuid .. ".json")
    elseif payloads and payloads.ids and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            os.remove(configPath .. "data/waf_rules/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
        end
    end
    ngx.say(cjson.encode({
        data = payloads
    }))
end

-- =====================================================
-- WAF Policies API Functions
-- =====================================================
local function listWafPolicies(args)
    local allPolicies, totalRecords = {}, 0
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    qParams["type"] = {
        table = "waf_policies",
        key_name = "name"
    }
    local pageSize = qParams.pagination.perPage
    local pageNumber = qParams.pagination.page
    if qParams.filter ~= nil and qParams.filter.profile_id ~= nil then
        environment = qParams.filter.profile_id
    end
    allPolicies, totalRecords = listFromDisk("waf_policies/" .. environment, pageSize, pageNumber, qParams)
    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allPolicies, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allPolicies, Helper.sortAsc(qParams.sort.field))
    end
    ngx.say(cjson.encode({
        data = allPolicies,
        total = totalRecords
    }))
end

local function listWafPolicy(args, uuid)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local jsonData, dataErr = Helper.getDataFromFile(configPath ..
        "data/waf_policies/" .. envProfile .. "/" .. uuid .. ".json")
    if dataErr == nil then
        local resultData = cjson.decode(jsonData)
        ngx.say(cjson.encode({
            data = resultData
        }))
    else
        Errors.throwError("WAF policy not found: " .. tostring(dataErr), ngx.HTTP_NOT_FOUND)
    end
end

local function createUpdateWafPolicies(body, uuid)
    local payloads, response = Helper.GetPayloads(body), {}

    local validationErrors = validateWafPolicyPayload(payloads)
    handleValidationErrors(validationErrors, "waf_policy")

    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    ---@diagnostic disable-next-line: param-type-mismatch
    payloads.updated_at = os.time(os.date("!*t"))

    if uuid then
        response = CreateUpdateRecord(payloads, uuid, "waf_policies", "waf_policies", "update")
    else
        local envProfile = payloads.profile_id or "prod"
        local folderPath = string.format("%sdata/waf_policies/%s", configPath, envProfile)
        local isUnique, err = Helper.isUniqueField(folderPath, "name", payloads.name)
        if not isUnique then
            Errors.conflict(err, { name = payloads.name })
        end
        payloads.id = Helper.generate_uuid()
        response = CreateUpdateRecord(payloads, payloads.id, "waf_policies", "waf_policies", "create")
    end
    ngx.say(cjson.encode({
        data = response
    }))
end

local function createDeleteWafPolicies(body, uuid)
    local payloads = Helper.GetPayloads(body)
    if payloads == ngx.null or not body or type(payloads) == "nil" then
        payloads = ngx.req.get_uri_args()
    end
    local envProfile = "prod"
    if payloads.ids ~= nil then
        envProfile = payloads.ids.envProfile or "prod"
    elseif payloads.envProfile then
        envProfile = payloads.envProfile
    end
    if uuid ~= "" and uuid ~= nil then
        os.remove(configPath .. "data/waf_policies/" .. envProfile .. "/" .. uuid .. ".json")
    elseif payloads and payloads.ids and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            os.remove(configPath .. "data/waf_policies/" .. envProfile .. "/" .. payloads.ids.ids[value] .. ".json")
        end
    end
    ngx.say(cjson.encode({
        data = payloads
    }))
end

-- =====================================================
-- WAF Events API Functions (read-only)
-- =====================================================
local function listWafEvents(args)
    local events = {}
    local waf_dict = ngx.shared.waf_events
    if not waf_dict then
        ngx.say(cjson.encode({
            data = events,
            total = 0,
            message = "WAF events shared dict not available"
        }))
        return
    end

    local keys = waf_dict:get_keys(1000)
    for _, key in ipairs(keys) do
        local val = waf_dict:get(key)
        if val then
            local ok, event = pcall(cjson.decode, val)
            if ok and event then
                table.insert(events, event)
            end
        end
    end

    -- Filter by host if provided
    local filter_host = args["filter[host]"] or args["host"]
    if filter_host and filter_host ~= "" then
        local filtered = {}
        for _, event in ipairs(events) do
            if event.host == filter_host then
                table.insert(filtered, event)
            end
        end
        events = filtered
    end

    -- Filter by type if provided
    local filter_type = args["filter[type]"] or args["type"]
    if filter_type and filter_type ~= "" then
        local filtered = {}
        for _, event in ipairs(events) do
            if event.type == filter_type then
                table.insert(filtered, event)
            end
        end
        events = filtered
    end

    -- Sort by timestamp descending (newest first)
    table.sort(events, function(a, b)
        return (a.timestamp or 0) > (b.timestamp or 0)
    end)

    -- Apply pagination from args
    local params = args
    local qParams = {}
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = tonumber(args['pagination[page]']) or 1,
                perPage = tonumber(args['pagination[perPage]']) or 50
            }
        }
    else
        qParams = cjson.decode(params)
    end

    local pageSize = tonumber(qParams.pagination.perPage) or 50
    local pageNumber = tonumber(qParams.pagination.page) or 1
    local totalRecords = #events
    local startIdx = (pageNumber - 1) * pageSize + 1
    local endIdx = math.min(startIdx + pageSize - 1, totalRecords)
    local paginatedEvents = {}
    for i = startIdx, endIdx do
        if events[i] then
            table.insert(paginatedEvents, events[i])
        end
    end

    ngx.say(cjson.encode({
        data = paginatedEvents,
        total = totalRecords
    }))
end

-- =====================================================
-- WAF Seed Function
-- =====================================================
local function seedWafRules(args)
    local ok, WafDefaults = pcall(require, "waf_default_rules")
    if not ok then
        Errors.throwError("Failed to load WAF default rules module: " .. tostring(WafDefaults),
            ngx.HTTP_INTERNAL_SERVER_ERROR)
        return
    end

    local payloads = Helper.GetPayloads(args)
    local envProfile = "prod"
    if payloads and payloads.profile_id then
        envProfile = payloads.profile_id
    end

    local seed_data = WafDefaults.get_seed_data(envProfile)
    local rulesDir = configPath .. "data/waf_rules/" .. envProfile
    local policiesDir = configPath .. "data/waf_policies/" .. envProfile

    -- Create directories if needed
    if not Helper.isDirectoryExists(rulesDir) then
        Helper.createDirectoryRecursive(rulesDir)
    end
    if not Helper.isDirectoryExists(policiesDir) then
        Helper.createDirectoryRecursive(policiesDir)
    end

    -- Write seed rules
    local rulesWritten = 0
    for _, rule in ipairs(seed_data.rules) do
        local filePath = rulesDir .. "/" .. rule.id .. ".json"
        -- Only write if file doesn't exist (don't overwrite customizations)
        if not Helper.isFileExists(filePath) then
            Helper.setDataToFile(filePath, rule, rulesDir)
            rulesWritten = rulesWritten + 1
        end
    end

    -- Write default policy
    local policiesWritten = 0
    local policyPath = policiesDir .. "/" .. seed_data.policy.id .. ".json"
    if not Helper.isFileExists(policyPath) then
        Helper.setDataToFile(policyPath, seed_data.policy, policiesDir)
        policiesWritten = 1
    end

    ngx.say(cjson.encode({
        data = {
            message = "WAF seed data deployed",
            profile_id = envProfile,
            rules_written = rulesWritten,
            rules_skipped = #seed_data.rules - rulesWritten,
            policies_written = policiesWritten
        }
    }))
end

-- =====================================================
-- Upstreams API Functions
-- =====================================================

local function listUpstreams(args)
    local params = args
    local qParams, environment = {}, "prod"
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {
                profile_id = args['filter[profile_id]']
            }
        }
    else
        qParams = cjson.decode(params)
    end
    qParams["type"] = {
        table = "upstreams",
        key_name = "name"
    }
    local pageSize = qParams.pagination.perPage
    local pageNumber = qParams.pagination.page
    local cursor, totalRecords = "0", 0
    local allUpstreams = {}

    if qParams.filter ~= nil then
        local filter = qParams.filter
        if filter.profile_id ~= nil then
            environment = filter.profile_id
        end
    end

    if settings then
        if settings.storage_type == "disk" then
            allUpstreams, totalRecords = listFromDisk("upstreams/" .. environment, pageSize, pageNumber, qParams)
        else
            local recordsKey = "upstreams_" .. environment
            local records, totalCount = listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
            allUpstreams = records
            totalRecords = totalCount
        end
    end

    if qParams.sort ~= nil and qParams.sort.order == "DESC" then
        table.sort(allUpstreams, Helper.sortDesc(qParams.sort.field))
    elseif qParams.sort ~= nil and qParams.sort.order == "ASC" then
        table.sort(allUpstreams, Helper.sortAsc(qParams.sort.field))
    end

    return ngx.say(cjson.encode({
        data = allUpstreams,
        total = totalRecords
    }))
end

local function listUpstream(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    if settings then
        if settings.storage_type == "disk" then
            local jsonData, dataErr = Helper.getDataFromFile(configPath ..
                "data/upstreams/" .. envProfile .. "/" .. id .. ".json")
            if dataErr ~= nil then
                ngx.say(cjson.encode({
                    data = {}
                }))
            else
                jsonData = cjson.decode(jsonData)
                ngx.say(cjson.encode({
                    data = jsonData
                }))
            end
        else
            local upstream = red:hget("upstreams_" .. envProfile, id)
            if type(upstream) == "string" then
                upstream = cjson.decode(upstream)
                ngx.say(cjson.encode({
                    data = upstream
                }))
            end
        end
    end
end

local function generateUpstreamConfig(upstream)
    if not upstream or not upstream.name then
        return nil, "Upstream name is required"
    end

    local config = "upstream " .. upstream.name .. " {\n"

    -- Zone configuration
    if upstream.zone_name and upstream.zone_name ~= "" then
        config = config .. "    zone " .. upstream.zone_name .. " " .. (upstream.zone_size or "64k") .. ";\n\n"
    end

    -- Load balancing method
    if upstream.load_balancing_method and upstream.load_balancing_method ~= "round_robin" then
        if upstream.load_balancing_method == "hash" and upstream.hash_key then
            config = config .. "    hash " .. upstream.hash_key .. ";\n"
        elseif upstream.load_balancing_method ~= "hash" then
            config = config .. "    " .. upstream.load_balancing_method .. ";\n"
        end
    end

    -- Servers
    if upstream.servers and type(upstream.servers) == "table" then
        for _, server in ipairs(upstream.servers) do
            if server and server.address and server.address ~= "" then
                local serverLine = "    server " .. server.address
                if server.port and server.port ~= "" and server.port ~= "80" then
                    serverLine = serverLine .. ":" .. server.port
                end
                if server.weight and tonumber(server.weight) and tonumber(server.weight) ~= 1 then
                    serverLine = serverLine .. " weight=" .. server.weight
                end
                if server.max_fails ~= nil and tonumber(server.max_fails) and tonumber(server.max_fails) ~= 3 then
                    serverLine = serverLine .. " max_fails=" .. server.max_fails
                end
                if server.fail_timeout and server.fail_timeout ~= "" and server.fail_timeout ~= "10s" then
                    serverLine = serverLine .. " fail_timeout=" .. server.fail_timeout
                end
                -- Note: slow_start, max_conns, and resolve are NGINX Plus (commercial) features
                -- They are stored in the config but not included in the generated nginx config
                -- Uncomment the lines below if using NGINX Plus:
                -- if server.slow_start and server.slow_start ~= "" then
                --     serverLine = serverLine .. " slow_start=" .. server.slow_start
                -- end
                -- if server.max_conns and tonumber(server.max_conns) and tonumber(server.max_conns) > 0 then
                --     serverLine = serverLine .. " max_conns=" .. server.max_conns
                -- end
                -- if server.resolve == true then
                --     serverLine = serverLine .. " resolve"
                -- end
                if server.state == "backup" then
                    serverLine = serverLine .. " backup"
                elseif server.state == "down" then
                    serverLine = serverLine .. " down"
                end
                config = config .. serverLine .. ";\n"
            end
        end
    end

    -- Keepalive settings
    if upstream.keepalive and tonumber(upstream.keepalive) and tonumber(upstream.keepalive) > 0 then
        config = config .. "\n    keepalive " .. upstream.keepalive .. ";\n"
    end
    if upstream.keepalive_timeout and upstream.keepalive_timeout ~= "" then
        config = config .. "    keepalive_timeout " .. upstream.keepalive_timeout .. ";\n"
    end
    if upstream.keepalive_requests and tonumber(upstream.keepalive_requests) and tonumber(upstream.keepalive_requests) > 0 then
        config = config .. "    keepalive_requests " .. upstream.keepalive_requests .. ";\n"
    end

    config = config .. "}\n"

    return config
end

-- Generate Lua code for health check initialization (for lua-resty-upstream-healthcheck)
local function generateHealthCheckLua(upstream)
    if not upstream or not upstream.name or not upstream.health_check_enabled then
        return nil
    end

    local interval = upstream.health_check_interval or "5000" -- default 5s
    -- Convert interval string like "5s" to milliseconds
    local intervalMs = interval
    if type(interval) == "string" then
        local num, unit = interval:match("^(%d+)(%a*)$")
        if num then
            num = tonumber(num)
            if unit == "s" or unit == "" then
                intervalMs = num * 1000
            elseif unit == "ms" then
                intervalMs = num
            elseif unit == "m" then
                intervalMs = num * 60 * 1000
            else
                intervalMs = num * 1000 -- default to seconds
            end
        end
    end

    local fails = upstream.health_check_fails or 3
    local passes = upstream.health_check_passes or 2
    local uri = upstream.health_check_uri or "/"

    local luaCode = string.format([[
-- Health check for upstream: %s
local hc = require "resty.upstream.healthcheck"
local ok, err = hc.spawn_checker{
    shm = "healthcheck",
    upstream = "%s",
    type = "http",
    http_req = "GET %s HTTP/1.0\r\nHost: healthcheck\r\n\r\n",
    interval = %d,
    timeout = 2000,
    fall = %d,
    rise = %d,
    valid_statuses = {200, 302},
    concurrency = 1,
}
if not ok then
    ngx.log(ngx.ERR, "failed to spawn health checker for %s: ", err)
end
]], upstream.name, upstream.name, uri, intervalMs, fails, passes, upstream.name)

    return luaCode
end

local function writeUpstreamConfigFile(envProfile)
    -- Generate combined upstream config file for nginx include
    local upstreamsDir = configPath .. "data/upstreams/" .. envProfile
    local upstreamConfigFile = configPath .. "data/upstreams/" .. envProfile .. "/upstreams.conf"

    -- Ensure the upstreams directory exists
    if not Helper.isDirectoryExists(upstreamsDir) then
        local created, createErr = Helper.createDirectoryWithParents(upstreamsDir)
        if not created then
            ngx.log(ngx.ERR, "Failed to create upstreams directory: ", upstreamsDir, " - ", createErr or "unknown error")
            return false, "Failed to create upstreams directory: " .. (createErr or "unknown error")
        end
        ngx.log(ngx.INFO, "Created upstreams directory: ", upstreamsDir)
    end

    local allUpstreams = {}
    ngx.log(ngx.INFO, "writeUpstreamConfigFile - Regenerating config for profile: ", envProfile)
    ngx.log(ngx.INFO, "writeUpstreamConfigFile - Upstreams directory: ", upstreamsDir)

    if settings.storage_type == "disk" then
        -- Read all upstream files from disk
        local files, filesErr = Helper.getFilesInDirectory(upstreamsDir)
        if filesErr then
            ngx.log(ngx.WARN, "Error reading upstreams directory: ", filesErr)
            -- Continue with empty list - directory might be newly created
            files = {}
        end
        ngx.log(ngx.INFO, "writeUpstreamConfigFile - Found ", files and #files or 0, " files in directory")

        if files then
            for _, file in ipairs(files) do
                ngx.log(ngx.DEBUG, "writeUpstreamConfigFile - Processing file: ", file)
                if file:match("%.json$") and not file:match("upstreams%.conf") then
                    local jsonData, readErr = Helper.getDataFromFile(upstreamsDir .. "/" .. file)
                    if jsonData then
                        local decodeOk, upstream = pcall(cjson.decode, jsonData)
                        if decodeOk and upstream and upstream.enabled ~= false then
                            table.insert(allUpstreams, upstream)
                            ngx.log(ngx.INFO, "writeUpstreamConfigFile - Added upstream: ", upstream.name or "unknown")
                        elseif not decodeOk then
                            ngx.log(ngx.WARN, "Failed to decode upstream JSON file: ", file, " - ", upstream)
                        end
                    elseif readErr then
                        ngx.log(ngx.WARN, "Failed to read upstream file: ", file, " - ", readErr)
                    end
                end
            end
        end
    else
        -- Read from Redis
        local allRecords, redisErr = red:hgetall("upstreams_" .. envProfile)
        if redisErr then
            ngx.log(ngx.WARN, "Redis error reading upstreams: ", redisErr)
        end
        if allRecords and type(allRecords) == "table" then
            for i = 1, #allRecords, 2 do
                local decodeOk, upstream = pcall(cjson.decode, allRecords[i + 1])
                if decodeOk and upstream and upstream.enabled ~= false then
                    table.insert(allUpstreams, upstream)
                end
            end
        end
    end

    -- Generate config content
    local configContent = "# Auto-generated upstream configuration\n"
    configContent = configContent .. "# Generated at: " .. os.date("%Y-%m-%d %H:%M:%S") .. "\n"
    configContent = configContent .. "# Total upstreams: " .. #allUpstreams .. "\n\n"

    -- Generate health check Lua content
    local healthCheckContent = "-- Auto-generated health check configuration\n"
    healthCheckContent = healthCheckContent .. "-- Generated at: " .. os.date("%Y-%m-%d %H:%M:%S") .. "\n"
    healthCheckContent = healthCheckContent .. "-- This file should be included in init_worker_by_lua_block\n"
    healthCheckContent = healthCheckContent .. "-- Requires lua-resty-upstream-healthcheck module\n\n"

    local hasHealthChecks = false

    for _, upstream in ipairs(allUpstreams) do
        local upstreamConfig = generateUpstreamConfig(upstream)
        if upstreamConfig then
            configContent = configContent .. upstreamConfig .. "\n"
        end

        -- Generate health check Lua code if enabled
        local healthCheckLua = generateHealthCheckLua(upstream)
        if healthCheckLua then
            healthCheckContent = healthCheckContent .. healthCheckLua .. "\n"
            hasHealthChecks = true
        end
    end

    -- Write upstream config file
    local file, err = io.open(upstreamConfigFile, "w")
    if file then
        file:write(configContent)
        file:close()
        ngx.log(ngx.INFO, "Upstream config written successfully: ", upstreamConfigFile, " (", #allUpstreams,
            " upstreams)")
    else
        ngx.log(ngx.ERR, "Failed to write upstream config file: ", upstreamConfigFile, " - ", err or "unknown error")
        return false, "Failed to write upstream config: " .. (err or "unknown error")
    end

    -- Write health check Lua file
    local healthCheckFile = upstreamsDir .. "/healthcheck.lua"
    local hcFile, hcErr = io.open(healthCheckFile, "w")
    if hcFile then
        hcFile:write(healthCheckContent)
        hcFile:close()
        if hasHealthChecks then
            ngx.log(ngx.INFO, "Health check config written successfully: ", healthCheckFile)
        end
    else
        ngx.log(ngx.WARN, "Failed to write health check file: ", healthCheckFile, " - ", hcErr or "unknown error")
    end

    return true, upstreamConfigFile
end

local function createUpdateUpstreams(body, uuid)
    local payloads, response = Helper.GetPayloads(body), {}

    -- Validate required fields
    if not payloads then
        ngx.status = ngx.HTTP_BAD_REQUEST
        ngx.say(cjson.encode({
            error = "Invalid request body",
            message = "Failed to parse request payload"
        }))
        return ngx.exit(ngx.HTTP_BAD_REQUEST)
    end

    -- If name is not provided but id is (happens during updates when name field is disabled),
    -- extract the name from the id (format: "upstream:name")
    if (not payloads.name or payloads.name == "") and payloads.id then
        local extractedName = payloads.id:match("^upstream:(.+)$")
        if extractedName then
            payloads.name = extractedName
            ngx.log(ngx.INFO, "Extracted upstream name from id: ", extractedName)
        end
    end

    -- Also try to extract from uuid parameter (for PUT requests)
    if (not payloads.name or payloads.name == "") and uuid then
        local extractedName = uuid:match("^upstream:(.+)$")
        if extractedName then
            payloads.name = extractedName
            ngx.log(ngx.INFO, "Extracted upstream name from uuid: ", extractedName)
        end
    end

    if not payloads.name or payloads.name == "" then
        ngx.status = ngx.HTTP_BAD_REQUEST
        ngx.say(cjson.encode({
            error = "Validation error",
            message = "Upstream name is required"
        }))
        return ngx.exit(ngx.HTTP_BAD_REQUEST)
    end

    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        payloads.created_at = os.time(os.date("!*t"))
    end
    ---@diagnostic disable-next-line: param-type-mismatch
    payloads.updated_at = os.time(os.date("!*t"))

    -- Default enabled to true if not set
    if payloads.enabled == nil then
        payloads.enabled = true
    end

    -- Set default profile if not provided
    if not payloads.profile_id or payloads.profile_id == "" then
        payloads.profile_id = "prod"
    end

    -- Generate the nginx config for preview
    local configOk, generatedConfig = pcall(generateUpstreamConfig, payloads)
    if configOk then
        payloads.generated_config = generatedConfig
    else
        ngx.log(ngx.WARN, "Failed to generate upstream config preview: ", generatedConfig)
        payloads.generated_config = "# Error generating config preview"
    end

    local saveOk, saveErr = pcall(function()
        if uuid then
            response = CreateUpdateRecord(payloads, uuid, "upstreams", "upstreams", "update")
        else
            payloads.id = "upstream:" .. payloads.name
            response = CreateUpdateRecord(payloads, payloads.id, "upstreams", "upstreams", "create")
        end
    end)

    if not saveOk then
        ngx.log(ngx.ERR, "Failed to save upstream: ", saveErr)
        ngx.status = ngx.HTTP_INTERNAL_SERVER_ERROR
        ngx.say(cjson.encode({
            error = "Save failed",
            message = "Failed to save upstream: " .. tostring(saveErr)
        }))
        return ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
    end

    -- Regenerate the combined upstream config file
    local envProfile = payloads.profile_id or "prod"
    local ok, configFilePath = writeUpstreamConfigFile(envProfile)
    if ok then
        ngx.log(ngx.INFO, "Upstream config regenerated: ", configFilePath)
    else
        ngx.log(ngx.WARN, "Failed to regenerate upstream config: ", configFilePath)
        -- Don't fail the request, just log the warning
    end

    ngx.say(cjson.encode({
        data = response
    }))
end

-- Delete a single upstream
-- If returnOnly is true, returns the result without sending response (for bulk delete)
local function deleteUpstreamInternal(args, uuid, envProfile)
    local restUpstreams = nil

    -- URL decode the uuid in case it contains special characters like ':'
    local decodedUuid = ngx.unescape_uri(uuid)
    ngx.log(ngx.INFO, "Deleting upstream: ", decodedUuid, " from profile: ", envProfile)

    if settings.storage_type == "disk" then
        local filePath = configPath .. "data/upstreams/" .. envProfile .. "/" .. decodedUuid .. ".json"
        ngx.log(ngx.INFO, "Attempting to delete file: ", filePath)

        -- Check if file exists first
        if not Helper.isFileExists(filePath) then
            ngx.log(ngx.WARN, "Upstream file not found: ", filePath)
            return { deleted = false, id = decodedUuid, error = "Upstream not found" }
        end

        local ok, err = os.remove(filePath)
        if ok then
            restUpstreams = { deleted = true, id = decodedUuid }
            ngx.log(ngx.INFO, "Successfully deleted upstream file: ", filePath)
        else
            ngx.log(ngx.ERR, "Failed to delete upstream file: ", filePath, " - ", err)
            restUpstreams = { deleted = false, id = decodedUuid, error = err or "Unknown error" }
        end
    else
        local del, err = red:hdel("upstreams_" .. envProfile, decodedUuid)
        if del and del > 0 then
            restUpstreams = { deleted = true, id = decodedUuid }
        else
            ngx.log(ngx.WARN, "Failed to delete upstream from Redis: ", err or "not found")
            restUpstreams = { deleted = false, id = decodedUuid, error = err or "Upstream not found" }
        end
    end

    return restUpstreams
end

local function deleteUpstream(args, uuid)
    -- Validate uuid
    if not uuid or uuid == "" or uuid == "upstreams" then
        ngx.status = ngx.HTTP_BAD_REQUEST
        ngx.say(cjson.encode({
            error = "Validation error",
            message = "Upstream ID is required for deletion"
        }))
        return ngx.exit(ngx.HTTP_BAD_REQUEST)
    end

    -- Get envProfile from request body (JSON) or args
    local envProfile = "prod"
    local bodyData = ngx.req.get_body_data()
    if bodyData then
        local ok, parsedBody = pcall(cjson.decode, bodyData)
        if ok and parsedBody and parsedBody.envProfile then
            envProfile = parsedBody.envProfile
        end
    end
    -- Fallback to args if not found in body
    if envProfile == "prod" and args and args.envprofile then
        envProfile = args.envprofile
    end

    ngx.log(ngx.INFO, "Delete upstream - envProfile: ", envProfile, ", uuid: ", uuid)
    local restUpstreams = deleteUpstreamInternal(args, uuid, envProfile)

    -- Regenerate the combined upstream config file
    local ok, configFilePath = writeUpstreamConfigFile(envProfile)
    if ok then
        ngx.log(ngx.INFO, "Upstream config regenerated after delete: ", configFilePath)
    else
        ngx.log(ngx.WARN, "Failed to regenerate upstream config after delete: ", configFilePath)
    end

    if restUpstreams and restUpstreams.deleted then
        ngx.say(cjson.encode({
            data = restUpstreams
        }))
        ngx.exit(ngx.HTTP_OK)
    else
        ngx.status = ngx.HTTP_INTERNAL_SERVER_ERROR
        ngx.say(cjson.encode({
            error = "Delete failed",
            message = restUpstreams and restUpstreams.error or "Failed to delete upstream"
        }))
        ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
    end
end

-- =====================================================
-- End Upstreams API Functions
-- =====================================================

local function listSessions(args)
    local counter = 0
    local params = args
    params = params.params
    local allsessions, sessions = {}, {}
    local records = {}
    if useRemoteStorage then
        local exist_values, err = red:scan(0, "match", "session:*") -- red:keys("session:*")
        if exist_values[2] ~= nil then
            for key, value in pairs(exist_values[2]) do
                -- if key % 2 == 0 then
                table.insert(records, {
                    session_id = value,
                    id = key,
                    subject = 'Redacted',
                    timeout = 'Redacted',
                    quote = 'Redacted'
                })
                -- end
            end
        end
    end
    local getAllRecords = records
    if type(getAllRecords) == "string" then
        allsessions = cjson.decode(getAllRecords)
    else
        allsessions = getAllRecords
    end
    local qParams = cjson.decode(params)
    local perPage = qParams.pagination.perPage * qParams.pagination.page
    local page = perPage - (qParams.pagination.perPage - 1)
    for index, server in pairs(allsessions) do
        counter = counter + 1
        if counter >= page and counter <= perPage then
            table.insert(sessions, server)
        end
    end
    if qParams.sort.order == "DESC" then
        -- table.sort(sessions, sortDesc(qParams.sort.field))
    else
        -- table.sort(sessions, sortAsc(qParams.sort.field))
    end
    if counter < 1 then
        return ngx.say(cjson.encode({
            data = {},
            total = 0
        }))
    end
    return ngx.say(cjson.encode({
        data = sessions,
        total = counter
    }))
end

-- Settings section

local function listSettings(args, uuid)
    local settingsLogo = red:hget("company_logo", uuid)
    if settingsLogo and settingsLogo ~= "null" and type(settingsLogo) == "string" then
        ngx.say(cjson.encode({
            data = cjson.decode(settingsLogo)
        }))
    end
end

local function createUpdateSettings(body, uuid)
    body = Helper.GetPayloads(body)
    local settingsJson, settingUUID = {}, uuid
    if not uuid then
        ---@diagnostic disable-next-line: param-type-mismatch
        body.created_at = os.time(os.date("!*t"))
        body.id = Helper.generate_uuid()
        settingUUID = body.id
    end
    settingsJson[settingUUID] = cjson.encode(body)
    local savingToRedis = red:hmset("company_logo", settingsJson)
    if savingToRedis and savingToRedis ~= nil and type(savingToRedis) == "string" then
        return ngx.say(cjson.encode({
            data = body
        }))
    end
end

-- Import rules and servers from json file
local function importProjects(args)
    args = Helper.GetPayloads(args)
    local envProfile = args.envProfile ~= nil and args.envProfile or "prod"
    local response, formattedJson = nil, {}
    local redisKey = args.dataType == "rules" and "request_rules" or args.dataType
    for key, value in pairs(args.data) do
        envProfile = value.profile_id
        local pathDir = configPath .. "data/" .. args.dataType .. "/" .. value.profile_id
        if not Helper.isDirectoryExists(pathDir) then
            Helper.createDirectoryRecursive(pathDir)
        end
        if useRemoteStorage then
            formattedJson[value.id] = cjson.encode(value)
            red:hmset(redisKey .. "_" .. value.profile_id, formattedJson)
            response = Helper.setDataToFile(
                pathDir .. "/" .. value.id .. ".json", value, pathDir)
        else
            response = Helper.setDataToFile(
                pathDir .. "/" .. value.id .. ".json", value, pathDir)
        end
    end
    ngx.say(cjson.encode({
        data = envProfile
    }))
end

-- Hanlde the Profiles settings

local function handleUpdateCreateProfiles(body, uuid)
    local successCreation, errorCreation = nil, nil
    if uuid == nil then
        local folderPath = configPath .. "data/rules/" .. body.name
        local parent = folderPath:match("^(.*)/[^/]+/?$")
        if parent and not Helper.isDirectoryExists(parent) then
            Helper.createDirectoryRecursive(parent) -- Recursively create parent directories
        end
        successCreation, errorCreation = Helper.createDirectoryRecursive(folderPath)
    elseif uuid ~= nil then
        local oldPath, newPath = configPath .. "data/rules/" .. uuid, configPath .. "data/rules/" .. body.name
        -- Rename the directory using the shell command
        local command = string.format("mv %s %s", oldPath, newPath)
        successCreation, errorCreation = os.execute(command)
    end
    return successCreation, errorCreation
end

local function listDirectories(path, pageSize, pageNumber, qParams)
    local directories = {}
    local pathAttr = lfs.attributes(path)
    if pathAttr ~= nil and pathAttr.mode == "directory" then
        for dir in lfs.dir(path) do
            if dir ~= "." and dir ~= ".." then
                local dirPath = path .. "/" .. dir
                local attr = lfs.attributes(dirPath)

                if attr and attr.mode == "directory" then
                    local createdAt = os.date("%Y-%m-%d %H:%M:%S", attr.change)
                    table.insert(directories, { id = tostring(dir), name = dir, createdAt = createdAt })
                end
            end
        end
        local data, count = listPaginationLocal(directories, pageSize, pageNumber, qParams)
        return data, count
    else
        return {}, 0
    end
end

local function listProfiles(args)
    local params, allProfiles, totalRecords = args, {}, 0
    local qParams = {}
    params = params.params
    if params == nil and type(params) == "nil" then
        qParams = {
            pagination = {
                page = args['pagination[page]'],
                perPage = args['pagination[perPage]']
            },
            sort = {
                field = args['sort[field]'],
                order = args['sort[order]']
            },
            filter = {}
        }
    else
        qParams = cjson.decode(params)
    end
    -- Set the pagination parameters
    local pageSize = qParams.pagination.perPage -- Number of records per page
    local pageNumber = qParams.pagination.page  -- Page number (starting from 1)
    allProfiles, totalRecords = listDirectories(configPath .. "data/rules", pageSize, pageNumber, qParams)
    ngx.say(
        cjson.encode({
            data = allProfiles,
            total = totalRecords
        }))
end
local function listProfile(args, uuid)
    local dirPath = configPath .. "data/rules/" .. uuid
    local attr = lfs.attributes(dirPath)
    ngx.say(cjson.encode({
        data = {
            name = uuid,
            pathUuid = uuid,
            directoryAttr = attr
        }
    }))
end

local function createUpdateProfiles(body, uuid)
    body = Helper.GetPayloads(body)
    local successCreate, errorCreate = handleUpdateCreateProfiles(body, uuid)
    if successCreate then
        ngx.status = ngx.HTTP_OK
        ngx.say(cjson.encode({
            data = {
                message = "Success.",
                status = ngx.HTTP_OK
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    else
        ngx.status = ngx.HTTP_INTERNAL_SERVER_ERROR
        ngx.say(cjson.encode({
            data = {
                message = "Error:",
                errorCreate,
                status = ngx.HTTP_BAD_GATEWAY
            }
        }))
    end
end

local function updateProfileSettings(args)
    local payloads = Helper.GetPayloads(args)
    local envProfile = payloads.profile
    settings.env_profile = envProfile
    local updateSettings, msg = Helper.writeSettingsFile(configPath .. "data/settings.json", settings)
    if not updateSettings then
        Errors.throwError("Couldn't save settings: " .. (msg or "unknown error"), ngx.HTTP_INTERNAL_SERVER_ERROR)
    else
        ngx.say(cjson.encode({
            data = {
                profile = settings.env_profile
            }
        }))
    end
end

local function deleteProfile(body)
    local payloads = Helper.GetPayloads(body)
    if payloads.ids.ids then
        local response = {}
        for index, path in ipairs(payloads.ids.ids) do
            local rulePath = configPath .. "data/rules/" .. path
            local serverPath = configPath .. "data/servers/" .. path
            local ruleDel = Helper.removeDir(rulePath)
            local serverDel = Helper.removeDir(serverPath)
            table.insert(response, ruleDel)
            table.insert(response, serverDel)
        end
        ngx.say(cjson.encode({
            data = {
                message = response
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    end
end

local function readFile(filePath)
    local file, fileErr = io.open(filePath, "r")
    if not file then return fileErr, ngx.HTTP_INTERNAL_SERVER_ERROR end
    local content = file:read("*a")
    file:close()
    return content, ngx.HTTP_OK
end

local function listFiles(directory)
    local files = {}
    local totalFiles = 0

    for file in lfs.dir(directory) do
        if file ~= "." and file ~= ".." then
            local fullPath = directory .. '/' .. file
            local attr = lfs.attributes(fullPath)
            if attr.mode == "file" then
                table.insert(files, {
                    name = fullPath,
                    content = readFile(fullPath)
                })
                totalFiles = totalFiles + 1
            elseif attr.mode == "directory" then
                -- Recursively list files in subdirectories
                local subFiles, subTotal = listFiles(fullPath)
                for _, subFile in ipairs(subFiles) do
                    table.insert(files, subFile)
                end
                totalFiles = totalFiles + subTotal
            end
        end
    end
    return files, totalFiles
end

local function listServerConf(args)
    local profile = args.profile
    local dirPath = configPath .. "data/servers/" .. profile .. "/conf"
    local files, total = listFiles(dirPath)
    return ngx.say(cjson.encode({
        data = files,
        total = total
    }))
end

local function listOpenrestyLogs()
    local logFile = "/usr/local/openresty/nginx/logs/error.log"
    local logs, status = Helper.readLogFile(logFile)
    ngx.say(cjson.encode({
        data = {
            logs = logs
        }
    }))
    ngx.exit(status)
end
local function listOpenrestyAccessLogs()
    local logFile = "/usr/local/openresty/nginx/logs/access.log"
    local logs, status = Helper.readLogFile(logFile)
    ngx.say(cjson.encode({
        data = {
            logs = logs
        }
    }))
    ngx.exit(status)
end

-- Reset Password
local function resetPassword(args)
    local payloads = Helper.GetPayloads(args)
    local oldPassword = Helper.hashPassword(payloads.oldPassword)
    local newPassword = Helper.hashPassword(payloads.newPassword)
    if oldPassword ~= settings.super_user.password then
        Errors.throwError("Old Password is not correct please check the password and try again.", ngx.HTTP_FORBIDDEN)
    end
    if newPassword == settings.super_user.password then
        Errors.throwError("New password should be different from old password.", ngx.HTTP_FORBIDDEN)
    end
    settings.super_user.password = newPassword
    local updateSettings, msg = Helper.writeSettingsFile(configPath .. "data/settings.json", settings)
    if not updateSettings then
        Errors.throwError(msg, ngx.HTTP_INTERNAL_SERVER_ERROR)
    end
    return ngx.say(cjson.encode({
        message = "Password has been reset successfully."
    }))
end

local function deleteAll(body)
    local payloads = Helper.GetPayloads(body)
    local rulesPath = configPath .. "data/rules"
    local serversPath = configPath .. "data/servers"
    local rulesDeleted, ruleMsg, serversDelete, serverMsg = false, "", false, ""
    if payloads.type ~= "rules" or payloads.type ~= "servers" then
        Errors.throwError("You can only delete either rules or servers", ngx.HTTP_FORBIDDEN)
    end
    if payloads.type == "rules" then
        rulesDeleted, ruleMsg = Helper.deleteAllFiles(rulesPath)
    end
    if payloads.type == "servers" then
        serversDelete, serverMsg = Helper.deleteAllFiles(serversPath)
    end
    local responseMsg = rulesDeleted and "All Rules has been deleted." or "All Servers has been deleted."
    if rulesDeleted or serversDelete then
        return ngx.say(cjson.encode({
            message = responseMsg
        }))
    else
        if ruleMsg ~= nil then
            Errors.throwError(ruleMsg, ngx.HTTP_FORBIDDEN)
        end
        if serverMsg ~= nil then
            Errors.throwError(serverMsg, ngx.HTTP_FORBIDDEN)
        end
    end
end

local platform = ngx.req.get_headers()["x-platform"]
local preAction = ngx.req.get_headers()["x-special-case-pre-action"]

-- AI log analysis handler shared by GET and POST dispatch.
-- Request body (JSON): { logs: [<log_entry>], question?: string, context?: string }
-- Response envelope:   { data: { analysis, root_causes[], recommendations[],
--                                severity: "low"|"medium"|"high"|"critical",
--                                related_patterns[] } }
-- Reads Ollama endpoint from settings.ai_endpoint / settings.ai_model.
local function handle_ai_analyze()
    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    local ok, payload = pcall(cjson.decode, body or "{}")
    if not ok then
        ngx.status = 400
        ngx.say(cjson.encode({ error = "Invalid JSON" }))
        ngx.exit(400)
    end
    local logs_text = ""
    if payload.logs then
        for _, log_entry in ipairs(payload.logs) do
            logs_text = logs_text .. cjson.encode(log_entry) .. "\n"
        end
    end
    local question = payload.question or "Analyze these logs for issues."
    local context = payload.context or ""
    local prompt = "You are an expert DevOps/SRE engineer specializing in nginx/OpenResty ingress controllers. "
        .. "Analyze the following log entries and provide:\n"
        .. "1. A clear analysis of what's happening\n"
        .. "2. Root causes of any errors or issues\n"
        .. "3. Specific recommendations to fix the issues\n"
        .. "4. Severity assessment (low/medium/high/critical)\n\n"
        .. "Context: " .. context .. "\n"
        .. "Question: " .. question .. "\n\n"
        .. "Log entries:\n" .. logs_text .. "\n\n"
        .. "Respond in this JSON format:\n"
        ..
        '{"analysis": "...", "root_causes": ["..."], "recommendations": ["..."], "severity": "low|medium|high|critical", "related_patterns": ["..."]}'

    local ollama_host = (settings and settings.ai_endpoint) or "http://127.0.0.1:11434"
    local ollama_model = (settings and settings.ai_model) or "llama3.2"
    local http = require("resty.http")
    local httpc = http.new()
    httpc:set_timeout(60000)
    local res, err = httpc:request_uri(ollama_host .. "/api/generate", {
        method = "POST",
        body = cjson.encode({
            model = ollama_model,
            prompt = prompt,
            stream = false,
            format = "json",
        }),
        headers = {
            ["Content-Type"] = "application/json",
        },
    })
    if res and res.status == 200 then
        local ok2, result = pcall(cjson.decode, res.body)
        if ok2 and result.response then
            local ok3, ai_response = pcall(cjson.decode, result.response)
            if ok3 then
                ngx.say(cjson.encode({ data = ai_response }))
            else
                ngx.say(cjson.encode({
                    data = {
                        analysis = result.response,
                        root_causes = {},
                        recommendations = {},
                        severity = "medium",
                    }
                }))
            end
        else
            ngx.say(cjson.encode({
                data = {
                    analysis = "AI returned unexpected format.",
                    severity = "low",
                }
            }))
        end
    else
        ngx.status = 503
        ngx.say(cjson.encode({
            data = {
                analysis = "Could not reach AI service at " .. ollama_host .. ". " .. (err or ""),
                root_causes = { "Ollama service not running or not reachable" },
                recommendations = {
                    "Start Ollama: ollama serve",
                    "Pull a model: ollama pull " .. ollama_model,
                    "Check firewall settings for port 11434",
                },
                severity = "medium",
            }
        }))
    end
    ngx.exit(ngx.HTTP_OK)
end

local function handle_get_request(args, path)
    -- handle GET request logic
    path = ngx.unescape_uri(path)
    local delimiter = "/"
    local subPath = {}
    for substring in string.gmatch(path, "[^" .. delimiter .. "]+") do
        table.insert(subPath, substring)
    end
    local pattern = ".*/(.*)"
    local uuid = string.match(path, pattern)

    if path == "servers" then
        listServers(args)
    elseif uuid and string.match(uuid, "^host:") and subPath[1] == "servers" then
        listServer(args, uuid)
    end

    if path == "users" then
        listUsers(args)
    elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "users" then
        listUser(args, uuid)
    end

    if path == "rules" then
        listRules(args)
    elseif uuid and #uuid > 0 and subPath[1] == "rules" then
        listRule(args, uuid)
    end

    if path == "secrets" then
        listSecrets(args)
    elseif uuid and #uuid > 0 and subPath[1] == "secrets" then
        listSecret(args, uuid)
    end
    if path == "instances" then
        listInstances(args)
    elseif uuid and #uuid > 0 and subPath[1] == "instances" then
        listInstance(args, uuid)
    end

    if path == "upstreams" then
        listUpstreams(args)
    elseif uuid and string.match(uuid, "^upstream:") and subPath[1] == "upstreams" then
        listUpstream(args, uuid)
    end

    if path == "sessions" then
        listSessions(args)
        -- elseif uuid and (#uuid == 36 or #uuid == 32) and subPath[1] == "sessions" then
        --     listSession(args, uuid)
    end
    if path == "bookmarks" then
        local bm_ok, Bookmarks = pcall(require, "bookmarks")
        if bm_ok then Bookmarks.list(args) end
    elseif uuid and #uuid > 0 and subPath[1] == "bookmarks" then
        local bm_ok, Bookmarks = pcall(require, "bookmarks")
        if bm_ok then Bookmarks.get(args, uuid) end
    end

    if path == "conf" then
        listServerConf(args)
    end
    if path == "openresty_status" then
        local nginxStatus, commandStatus = Helper.testNginxConfig()
        local apiStatus = ngx.HTTP_OK
        if not nginxStatus then
            nginxStatus = "Unable to get the status of nginx file"
            apiStatus = ngx.HTTP_INTERNAL_SERVER_ERROR
        end
        local statusRes = "error"
        local isSuccess = Helper.isStringContains("nginx.conf syntax is ok", nginxStatus)
        if isSuccess then
            statusRes = "success"
        end
        ngx.say(cjson.encode({
            data = {
                message = nginxStatus,
                check_status = statusRes,
            }
        }))
        ngx.exit(apiStatus)
    end

    if path == "openresty/error_logs" then
        listOpenrestyLogs()
    end
    if path == "openresty/access_logs" then
        listOpenrestyAccessLogs()
    end

    -- ── Structured logs for dashboard ────────────────────────────────
    if path == "logs/access" then
        local args = ngx.req.get_uri_args()
        local limit = tonumber(args.limit) or 200
        local offset = tonumber(args.offset) or 0
        local logFile = "/usr/local/openresty/nginx/logs/access.log"
        local f = io.open(logFile, "r")
        local entries = {}
        local total = 0
        if f then
            local lines = {}
            for line in f:lines() do
                lines[#lines + 1] = line
            end
            f:close()
            total = #lines
            -- Read from end (most recent first), apply offset and limit
            local startIdx = math.max(1, #lines - offset - limit + 1)
            local endIdx = math.max(1, #lines - offset)
            for i = endIdx, startIdx, -1 do
                local line = lines[i]
                local ok, entry = pcall(cjson.decode, line)
                if ok and type(entry) == "table" then
                    entry.id = "access-" .. tostring(i)
                    -- Apply filters
                    local include = true
                    if args.status_code and args.status_code ~= "" then
                        local sc = tostring(entry.status or "")
                        local filter = args.status_code
                        if filter == "2xx" then
                            include = sc:sub(1, 1) == "2"
                        elseif filter == "3xx" then
                            include = sc:sub(1, 1) == "3"
                        elseif filter == "4xx" then
                            include = sc:sub(1, 1) == "4"
                        elseif filter == "5xx" then
                            include = sc:sub(1, 1) == "5"
                        else
                            include = sc == filter
                        end
                    end
                    if args.method and args.method ~= "" then
                        include = include and (entry.method == args.method)
                    end
                    if args.search and args.search ~= "" then
                        local q = args.search:lower()
                        local haystack = (tostring(entry.uri or "") .. " " .. tostring(entry.remote_addr or "") .. " " .. tostring(entry.http_user_agent or ""))
                            :lower()
                        include = include and haystack:find(q, 1, true)
                    end
                    if include then
                        entries[#entries + 1] = entry
                    end
                else
                    -- Parse common log format
                    local remote_addr, timestamp, method, uri, status, bytes =
                        line:match('^(%S+)%s+%-%s+%S+%s+%[([^%]]+)%]%s+"(%S+)%s+(%S+)%s+%S+"%s+(%d+)%s+(%d+)')
                    if remote_addr then
                        local entry2 = {
                            id = "access-" .. tostring(i),
                            timestamp = timestamp,
                            remote_addr = remote_addr,
                            method = method,
                            uri = uri,
                            status = tonumber(status) or 0,
                            body_bytes_sent = tonumber(bytes) or 0,
                            request_time = 0,
                        }
                        local include2 = true
                        if args.status_code and args.status_code ~= "" then
                            local sc = tostring(entry2.status)
                            local filter = args.status_code
                            if filter == "2xx" then
                                include2 = sc:sub(1, 1) == "2"
                            elseif filter == "3xx" then
                                include2 = sc:sub(1, 1) == "3"
                            elseif filter == "4xx" then
                                include2 = sc:sub(1, 1) == "4"
                            elseif filter == "5xx" then
                                include2 = sc:sub(1, 1) == "5"
                            else
                                include2 = sc == filter
                            end
                        end
                        if include2 then
                            entries[#entries + 1] = entry2
                        end
                    end
                end
                if #entries >= limit then break end
            end
        end
        ngx.say(cjson.encode({
            data = entries,
            total = total
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    if path == "logs/errors" then
        local args = ngx.req.get_uri_args()
        local limit = tonumber(args.limit) or 200
        local logFile = "/usr/local/openresty/nginx/logs/error.log"
        local f = io.open(logFile, "r")
        local entries = {}
        local total = 0
        if f then
            local lines = {}
            for line in f:lines() do
                lines[#lines + 1] = line
            end
            f:close()
            total = #lines
            for i = #lines, math.max(1, #lines - limit * 2 + 1), -1 do
                local line = lines[i]
                local timestamp, level, message =
                    line:match("^(%d+/%d+/%d+%s+%d+:%d+:%d+)%s+%[(%w+)%]%s+%d+#%d+:%s*(.*)")
                if timestamp then
                    local entry = {
                        id = "error-" .. tostring(i),
                        timestamp = timestamp,
                        level = level,
                        message = message,
                    }
                    local client = message:match("client:%s+(%S+)")
                    local server = message:match("server:%s+(%S+)")
                    local request = message:match('request:%s+"([^"]*)"')
                    local upstream = message:match("upstream:%s+(%S+)")
                    local host = message:match('host:%s+"([^"]*)"')
                    if client then entry.client = client end
                    if server then entry.server = server end
                    if request then entry.request = request end
                    if upstream then entry.upstream = upstream end
                    if host then entry.host = host end
                    local include = true
                    if args.level and args.level ~= "" then
                        include = (entry.level == args.level)
                    end
                    if args.search and args.search ~= "" then
                        include = include and message:lower():find(args.search:lower(), 1, true)
                    end
                    if include then
                        entries[#entries + 1] = entry
                    end
                end
                if #entries >= limit then break end
            end
        end
        ngx.say(cjson.encode({
            data = entries,
            total = total
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- ── AI analysis proxy (forwards to local Ollama) ─────────────────
    -- Kept in GET for backward compatibility; real clients POST.
    if path == "ai/analyze" then
        handle_ai_analyze()
    end

    if path == "ai/models" then
        local ollama_host = (settings and settings.ai_endpoint) or "http://127.0.0.1:11434"
        local http = require("resty.http")
        local httpc = http.new()
        httpc:set_timeout(5000)
        local res, err = httpc:request_uri(ollama_host .. "/api/tags", {
            method = "GET",
        })
        if res and res.status == 200 then
            local ok, result = pcall(cjson.decode, res.body)
            if ok and result.models then
                local models = {}
                for _, m in ipairs(result.models) do
                    models[#models + 1] = m.name
                end
                ngx.say(cjson.encode({
                    data = {
                        models = models,
                        default = (settings and settings.ai_model) or "llama3.2",
                    }
                }))
            else
                ngx.say(cjson.encode({ data = { models = {}, default = "" } }))
            end
        else
            ngx.say(cjson.encode({ data = { models = {}, default = "" } }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- SSL Certificate status endpoint
    if subPath[1] == "ssl" and subPath[2] == "status" and subPath[3] then
        local server_name = subPath[3]
        local ssl_status, ssl_err = SslManager.get_certificate_status(server_name)
        if ssl_status then
            ngx.say(cjson.encode({
                data = {
                    server_name = server_name,
                    ssl_enabled = ssl_status.ssl_enabled,
                    certificate_exists = ssl_status.certificate_exists,
                    certificate_expiry = ssl_status.certificate_expiry,
                    message = ssl_status.ssl_enabled and "SSL is enabled for this domain" or
                        "SSL is not enabled for this domain"
                }
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    server_name = server_name,
                    ssl_enabled = false,
                    error = ssl_err or "Failed to get SSL status"
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get SSL configuration for a domain
    if subPath[1] == "ssl" and subPath[2] == "config" and subPath[3] then
        local server_name = subPath[3]
        local ssl_config, ssl_err = SslManager.get_ssl_config(server_name)
        if ssl_config then
            ngx.say(cjson.encode({
                data = ssl_config
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    error = ssl_err or "Failed to get SSL config"
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- Cache status endpoint - GET /api/cache/status/{server_name}
    if subPath[1] == "cache" and subPath[2] == "status" and subPath[3] then
        local server_name = subPath[3]
        local cache_config = CacheManager.get_cache_config(server_name)
        local cache_enabled = cache_config and cache_config.cache_enabled or false
        ngx.say(cjson.encode({
            data = {
                server_name = server_name,
                cache_enabled = cache_enabled,
                cache_ttl = cache_config and cache_config.cache_ttl or 3600,
                message = cache_enabled and "Caching is enabled for this domain" or
                    "Caching is not enabled for this domain"
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get cache configuration for a domain - GET /api/cache/config/{server_name}
    if subPath[1] == "cache" and subPath[2] == "config" and subPath[3] then
        local server_name = subPath[3]
        local cache_config, cache_err = CacheManager.get_cache_config(server_name)
        if cache_config then
            ngx.say(cjson.encode({
                data = cache_config
            }))
        else
            -- Return default config if none exists
            local default_config = CacheManager.get_default_config()
            default_config.server_name = server_name
            ngx.say(cjson.encode({
                data = default_config
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- List all cache configurations - GET /api/cache/configs
    if path == "cache/configs" then
        local configs = CacheManager.list_cache_configs()
        ngx.say(cjson.encode({
            data = configs
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get server-specific cache statistics - GET /api/cache/stats/{server_name}
    -- Note: General /api/cache/stats is handled later with comprehensive stats
    if subPath[1] == "cache" and subPath[2] == "stats" and subPath[3] then
        local server_name = subPath[3]
        local stats, stats_err = require("cache_handler").get_server_cache_stats(server_name)
        if stats then
            ngx.say(cjson.encode({
                data = stats
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    error = stats_err or "Failed to get cache stats"
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- ============================================================
    -- Varnish GET endpoints
    -- ============================================================

    -- GET /api/varnish/config/{server_name} - Get Varnish config + snippets
    if subPath[1] == "varnish" and subPath[2] == "config" and subPath[3] then
        local server_name = subPath[3]
        local varnish_config, varnish_err = VarnishManager.get_varnish_config(server_name)
        if varnish_config then
            ngx.say(cjson.encode({ data = varnish_config }))
        else
            local default_config = VarnishManager.get_default_config()
            default_config.server_name = server_name
            ngx.say(cjson.encode({ data = default_config }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/varnish/configs - List all Varnish configurations
    if path == "varnish/configs" then
        local configs = VarnishManager.list_varnish_configs()
        ngx.say(cjson.encode({ data = configs }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/varnish/status/{server_name} - Get deploy status
    if subPath[1] == "varnish" and subPath[2] == "status" and subPath[3] then
        local server_name = subPath[3]
        local status = VarnishManager.get_deploy_status(server_name)
        ngx.say(cjson.encode({
            data = {
                server_name = server_name,
                deploy_status = status,
                varnish_enabled = VarnishManager.is_varnish_enabled(server_name)
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/varnish/snippets/{server_name} - List snippets
    if subPath[1] == "varnish" and subPath[2] == "snippets" and subPath[3] then
        local server_name = subPath[3]
        local snippets = VarnishManager.get_snippets(server_name)
        ngx.say(cjson.encode({ data = snippets }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/varnish/vcl/{server_name} - Get last generated VCL
    if subPath[1] == "varnish" and subPath[2] == "vcl" and subPath[3] and subPath[3] ~= "preview" then
        local server_name = subPath[3]
        local vcl_content = VarnishManager.get_generated_vcl(server_name)
        ngx.say(cjson.encode({
            data = {
                server_name = server_name,
                vcl = vcl_content or ""
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/varnish/vcl/preview/{server_name} - Generate VCL preview without deploying
    if subPath[1] == "varnish" and subPath[2] == "vcl" and subPath[3] == "preview" and subPath[4] then
        local server_name = subPath[4]
        local VarnishVcl = require("varnish_vcl")
        local config = VarnishManager.get_varnish_config(server_name) or VarnishManager.get_default_config()
        local snippets = config.snippets or {}
        local vcl, vcl_err = VarnishVcl.assemble(server_name, config, snippets)
        if vcl then
            ngx.say(cjson.encode({
                data = {
                    server_name = server_name,
                    vcl = vcl,
                    snippet_count = #snippets
                }
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    error = vcl_err or "Failed to generate VCL"
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- Detailed health check - GET /api/system/detailed-health
    -- Proxies to the /health?detailed=true endpoint (ping.lua) and wraps in {data: ...}
    if path == "system/detailed-health" then
        local res = ngx.location.capture("/health?detailed=true")
        ngx.header.content_type = "application/json"
        if res and res.status == 200 and res.body and res.body ~= "" then
            local ok, healthData = pcall(cjson.decode, res.body)
            if ok then
                ngx.say(cjson.encode({ data = healthData }))
            else
                ngx.say(res.body)
            end
        else
            ngx.say(cjson.encode({ data = nil, error = "Health check unavailable" }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get instance/server information - GET /api/instance/info
    if path == "instance/info" then
        local function execute_command(cmd)
            local handle = io.popen(cmd)
            if not handle then return nil end
            local result = handle:read("*a")
            handle:close()
            return result
        end

        local function get_ip_addresses()
            local ips = {}
            local ip_cmd = execute_command(
                "hostname -I 2>/dev/null || ip addr show 2>/dev/null | grep 'inet ' | awk '{print $2}' | cut -d/ -f1")
            if ip_cmd then
                for ip in ip_cmd:gmatch("%S+") do
                    table.insert(ips, ip)
                end
            end
            return ips
        end

        local function get_network_interfaces()
            local interfaces = {}
            local if_cmd = execute_command("ip -brief addr show 2>/dev/null || ifconfig -a 2>/dev/null")
            if if_cmd then
                for line in if_cmd:gmatch("[^\r\n]+") do
                    table.insert(interfaces, line)
                end
            end
            return interfaces
        end

        local function get_routes()
            local routes = {}
            local route_cmd = execute_command("ip route show 2>/dev/null || route -n 2>/dev/null")
            if route_cmd then
                for line in route_cmd:gmatch("[^\r\n]+") do
                    table.insert(routes, line)
                end
            end
            return routes
        end

        local hostname = execute_command("hostname 2>/dev/null"):gsub("%s+", "")
        local fqdn = execute_command("hostname -f 2>/dev/null"):gsub("%s+", "")
        local os_info = execute_command("cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2")
        if os_info then os_info = os_info:gsub("%s+$", "") end
        local kernel = execute_command("uname -r 2>/dev/null"):gsub("%s+", "")
        local uptime = execute_command("uptime -p 2>/dev/null || uptime"):gsub("%s+$", "")
        local cpu_info = execute_command("lscpu 2>/dev/null | grep 'Model name' | cut -d':' -f2"):gsub("^%s+", ""):gsub(
            "%s+$", "")
        local cpu_cores = execute_command("nproc 2>/dev/null"):gsub("%s+", "")
        -- CPU usage: /proc/stat is most reliable across all Linux (GNU, BusyBox, SUSE, Debian)
        local cpu_usage = execute_command(
                "cat /proc/stat 2>/dev/null | head -1 | awk '{total=0; for(i=2;i<=NF;i++) total+=$i; idle=$5; if(total>0) printf \"%.1f\", 100*(total-idle)/total; else print \"0\"}'")
            :gsub("%s+", "")

        -- Memory information (total, used, available, free)
        local memory_total = execute_command("free -h 2>/dev/null | grep Mem | awk '{print $2}'"):gsub("%s+", "")
        local memory_used = execute_command("free -h 2>/dev/null | grep Mem | awk '{print $3}'"):gsub("%s+", "")
        local memory_available = execute_command("free -h 2>/dev/null | grep Mem | awk '{print $7}'"):gsub("%s+", "")
        local memory_free = execute_command("free -h 2>/dev/null | grep Mem | awk '{print $4}'"):gsub("%s+", "")

        -- Disk information
        local disk = execute_command("df -h / 2>/dev/null | tail -1 | awk '{print $2}'"):gsub("%s+", "")
        local disk_used = execute_command("df -h / 2>/dev/null | tail -1 | awk '{print $3}'"):gsub("%s+", "")
        local disk_available = execute_command("df -h / 2>/dev/null | tail -1 | awk '{print $4}'"):gsub("%s+", "")
        local disk_percent = execute_command("df -h / 2>/dev/null | tail -1 | awk '{print $5}'"):gsub("%s+", "")

        local load_avg = execute_command("uptime | awk -F'load average:' '{print $2}'"):gsub("^%s+", ""):gsub("%s+$", "")

        ngx.say(cjson.encode({
            data = {
                hostname = hostname or "unknown",
                fqdn = fqdn or hostname or "unknown",
                ip_addresses = get_ip_addresses(),
                os = os_info or "unknown",
                kernel = kernel or "unknown",
                uptime = uptime or "unknown",
                cpu = {
                    model = cpu_info or "unknown",
                    cores = cpu_cores or "unknown",
                    usage_percent = cpu_usage or "0"
                },
                memory = {
                    total = memory_total or "unknown",
                    used = memory_used or "unknown",
                    available = memory_available or "unknown",
                    free = memory_free or "unknown"
                },
                disk = {
                    total = disk or "unknown",
                    used = disk_used or "unknown",
                    available = disk_available or "unknown",
                    percent = disk_percent or "0%"
                },
                load_average = load_avg or "unknown",
                network = {
                    interfaces = get_network_interfaces(),
                    routes = get_routes()
                },
                environment = os.getenv("HOSTNAME") or os.getenv("APP_NAME") or "unknown"
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get comprehensive dashboard statistics - GET /api/traffic/stats
    if path == "traffic/stats" then
        local traffic_ok, traffic_stats = pcall(require, "traffic_stats")
        if traffic_ok and traffic_stats then
            local dashboard_data = traffic_stats.get_dashboard_data()
            ngx.say(cjson.encode({
                data = dashboard_data
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    error = "Traffic stats module not available",
                    chart_data = {},
                    summary = {},
                    top_domains = {},
                    error_codes = {},
                    error_timeline = {},
                    latency = {},
                    methods = {},
                    current_hour = {}
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get nginx log level metrics - GET /api/log/metrics
    if path == "log/metrics" then
        local metrics_ok, metrics = pcall(require, "prometheus_metrics")
        if metrics_ok and metrics.is_initialized() then
            -- Get log level metric counters
            local log_levels = metrics.get_metric_log_levels()
            local log_errors = metrics.get_metric_log_errors()
            local log_warnings = metrics.get_metric_log_warnings()
            local log_notices = metrics.get_metric_log_notices()

            -- Extract current values from metrics
            -- Note: These are counters, so values are cumulative
            ngx.say(cjson.encode({
                data = {
                    available = true,
                    message = "Log metrics are being tracked. View detailed metrics at /metrics endpoint.",
                    metrics = {
                        log_errors_total = "nginx_log_errors_total",
                        log_warnings_total = "nginx_log_warnings_total",
                        log_notices_total = "nginx_log_notices_total",
                        log_messages_total = "nginx_log_messages_total"
                    },
                    note = "These are Prometheus counter metrics. Use rate() function in PromQL for meaningful graphs."
                }
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    available = false,
                    error = "Prometheus metrics not initialized",
                    metrics = {}
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get cache statistics - GET /api/cache/stats
    if path == "cache/stats" then
        local cache_dict = ngx.shared.wsl_cache
        local cache_keys_dict = ngx.shared.wsl_cache_keys

        if not cache_dict then
            ngx.say(cjson.encode({
                data = {
                    available = false,
                    error = "Cache shared dictionary not configured"
                }
            }))
            ngx.exit(ngx.HTTP_OK)
        end

        -- Get all cache keys and calculate stats
        local keys = cache_dict:get_keys(0) -- Get all keys
        local total_entries = #keys
        local total_size = 0
        local entries_by_host = {}
        local entries_by_extension = {}
        local top_urls = {}

        for _, key in ipairs(keys) do
            local value = cache_dict:get(key)
            if value then
                -- Calculate size
                total_size = total_size + #value

                -- Parse key to extract host and URL
                local host, url = key:match("^([^:]+):(.+)$")
                if host and url then
                    -- Count by host
                    entries_by_host[host] = (entries_by_host[host] or 0) + 1

                    -- Extract extension
                    local ext = url:match("%.([%w]+)$")
                    if ext then
                        entries_by_extension[ext] = (entries_by_extension[ext] or 0) + 1
                    end

                    -- Add to top URLs list (limit to 50)
                    if #top_urls < 50 then
                        table.insert(top_urls, {
                            url = url,
                            host = host,
                            size = #value,
                            key = key
                        })
                    end
                end
            end
        end

        -- Convert to arrays for JSON
        local hosts_array = {}
        for host, count in pairs(entries_by_host) do
            table.insert(hosts_array, { host = host, count = count })
        end
        table.sort(hosts_array, function(a, b) return a.count > b.count end)

        local extensions_array = {}
        for ext, count in pairs(entries_by_extension) do
            table.insert(extensions_array, { extension = ext, count = count })
        end
        table.sort(extensions_array, function(a, b) return a.count > b.count end)

        -- Sort top URLs by size
        table.sort(top_urls, function(a, b) return a.size > b.size end)

        -- Docker blob cache stats (disk-based proxy_cache)
        local docker_cache_stats = {
            enabled_servers = 0,
            blob_cache_servers = {},
            manifest_cache_servers = {},
        }
        local ok_cm, CacheManagerStats = pcall(require, "cache_manager")
        if ok_cm then
            local all_configs = CacheManagerStats.list_cache_configs()
            for _, cfg in ipairs(all_configs or {}) do
                if cfg.cache_docker_blobs then
                    docker_cache_stats.enabled_servers = docker_cache_stats.enabled_servers + 1
                    table.insert(docker_cache_stats.blob_cache_servers, {
                        server_name = cfg.server_name or "unknown",
                        blob_ttl = cfg.cache_docker_blobs_ttl or 2592000,
                        manifest_caching = cfg.cache_docker_manifests or false,
                        manifest_ttl = cfg.cache_docker_manifests_ttl or 3600,
                        serve_stale = cfg.cache_docker_serve_stale or false,
                        stale_ttl = cfg.cache_docker_stale_ttl or 31536000,
                    })
                end
            end
        end

        -- Read disk cache directory stats
        local docker_disk_stats = {
            total_files = 0,
            total_size_bytes = 0,
        }
        local cache_dir = "/var/cache/nginx/docker_blobs"
        local ok_popen, pipe = pcall(io.popen, "du -sb " .. cache_dir .. " 2>/dev/null && find " .. cache_dir .. " -type f 2>/dev/null | wc -l")
        if ok_popen and pipe then
            local output = pipe:read("*a")
            pipe:close()
            local dir_size = output:match("^(%d+)")
            local file_count = output:match("\n(%d+)")
            docker_disk_stats.total_size_bytes = tonumber(dir_size) or 0
            docker_disk_stats.total_files = tonumber(file_count) or 0
        end

        ngx.say(cjson.encode({
            data = {
                available = true,
                total_entries = total_entries,
                total_size_bytes = total_size,
                total_size_mb = math.floor(total_size / 1024 / 1024 * 100) / 100,
                entries_by_host = hosts_array,
                entries_by_extension = extensions_array,
                top_urls = top_urls,
                cache_dict_capacity = cache_dict:capacity(),
                cache_dict_free_space = cache_dict:free_space(),
                docker_cache = {
                    enabled_servers = docker_cache_stats.enabled_servers,
                    blob_cache_servers = docker_cache_stats.blob_cache_servers,
                    disk_total_files = docker_disk_stats.total_files,
                    disk_total_size_bytes = docker_disk_stats.total_size_bytes,
                    disk_total_size_mb = math.floor(docker_disk_stats.total_size_bytes / 1024 / 1024 * 100) / 100,
                }
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get error details by status code - GET /api/traffic/errors/:code
    if path:match("^traffic/errors/%d+$") then
        local status_code = path:match("^traffic/errors/(%d+)$")
        local traffic_ok, traffic_stats = pcall(require, "traffic_stats")
        if traffic_ok and traffic_stats and status_code then
            local error_details = traffic_stats.get_error_details(status_code)
            ngx.say(cjson.encode({
                data = {
                    status_code = tonumber(status_code),
                    errors = error_details or {}
                }
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    status_code = tonumber(status_code),
                    errors = {},
                    error = traffic_ok and "status_code not provided" or "traffic_stats module not available"
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- Get all error details - GET /api/traffic/errors
    if path == "traffic/errors" then
        local traffic_ok, traffic_stats = pcall(require, "traffic_stats")
        if traffic_ok and traffic_stats then
            local all_error_details = traffic_stats.get_all_error_details()
            ngx.say(cjson.encode({
                data = {
                    errors = all_error_details or {}
                }
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    errors = {},
                    error = "traffic_stats module not available"
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    -- Debug endpoint to check shared dict keys - GET /api/traffic/debug
    if path == "traffic/debug" then
        local traffic_ok, traffic_stats = pcall(require, "traffic_stats")
        if traffic_ok and traffic_stats and traffic_stats.debug_keys then
            local debug_info = traffic_stats.debug_keys()
            ngx.say(cjson.encode({
                data = {
                    keys = debug_info,
                    message = "Debug info for traffic_stats shared dict"
                }
            }))
        else
            ngx.say(cjson.encode({
                data = {
                    keys = {},
                    error = "traffic_stats module not available or debug_keys function missing"
                }
            }))
        end
        ngx.exit(ngx.HTTP_OK)
    end

    if path == "global/settings" then
        local settingsData = settings
        settingsData.dns_resolver = nil
        settingsData.env_vars = nil
        settingsData.consul = nil
        settingsData.super_user = nil
        settingsData.nginx = nil
        settingsData.redis_host = nil
        settingsData.redis_port = nil
        ngx.say(cjson.encode({
            data = settingsData
        }))
    end
    if path == "profiles" then
        listProfiles(args)
    elseif uuid and subPath[1] == "profiles" then
        listProfile(args, uuid)
    end

    -- WAF endpoints
    if path == "waf_rules" then
        listWafRules(args)
    elseif uuid and #uuid > 0 and subPath[1] == "waf_rules" then
        listWafRule(args, uuid)
    end
    if path == "waf_policies" then
        listWafPolicies(args)
    elseif uuid and #uuid > 0 and subPath[1] == "waf_policies" then
        listWafPolicy(args, uuid)
    end
    if path == "waf_events" then
        listWafEvents(args)
    end

    -- Topology graph endpoint (nodes + edges for canvas visualization)
    if path == "topology/graph" then
        local ok, Topology = pcall(require, "topology")
        if ok then
            local result = Topology.get_graph(args)
            ngx.say(cjson.encode(result))
            ngx.exit(ngx.HTTP_OK)
        end
    end

    -- Traffic management endpoints
    if path == "traffic/topology" then
        local ok, TrafficMgmt = pcall(require, "traffic_mgmt")
        if ok then
            local result = TrafficMgmt.get_topology(args)
            ngx.say(cjson.encode(result))
            ngx.exit(ngx.HTTP_OK)
        end
    end
    if path == "traffic/backends" then
        local ok, TrafficMgmt = pcall(require, "traffic_mgmt")
        if ok then
            local result = TrafficMgmt.get_backend_stats(args)
            ngx.status = result.status or 200
            ngx.say(cjson.encode(result))
            ngx.exit(ngx.HTTP_OK)
        end
    end
    if path == "traffic/health" then
        local ok, TrafficMgmt = pcall(require, "traffic_mgmt")
        if ok then
            local result = TrafficMgmt.get_backend_health(args)
            ngx.say(cjson.encode(result))
            ngx.exit(ngx.HTTP_OK)
        end
    end

    -- ============================================================
    -- Version Control & Change Request GET endpoints
    -- ============================================================

    -- GET /api/versions/{type}/{profile}/{name} - List versions for a resource
    if string.find(path, "^versions/[^/]+/[^/]+/[^/]+$") then
        local res_type, profile, name = path:match("^versions/([^/]+)/([^/]+)/(.+)$")
        if res_type and profile and name then
            local versions = VersionManager.list_versions(res_type, profile, name)
            local meta = VersionManager.get_meta(res_type, profile, name)
            ngx.say(cjson.encode({
                data = versions,
                total = #versions,
                meta = meta,
            }))
            ngx.exit(ngx.HTTP_OK)
        end
    end

    -- GET /api/versions/{type}/{profile}/{name}/live - Get live version
    if string.find(path, "^versions/[^/]+/[^/]+/[^/]+/live$") then
        local res_type, profile, name = path:match("^versions/([^/]+)/([^/]+)/(.+)/live$")
        if res_type and profile and name then
            local version, err = VersionManager.get_live_version(res_type, profile, name)
            if version then
                ngx.say(cjson.encode({ data = version }))
            else
                ngx.say(cjson.encode({ data = nil, error = err }))
            end
            ngx.exit(ngx.HTTP_OK)
        end
    end

    -- GET /api/versions/{type}/{profile}/{name}/diff/{v1}/{v2} - Diff two versions
    if string.find(path, "^versions/[^/]+/[^/]+/[^/]+/diff/%d+/%d+$") then
        local res_type, profile, name, v1, v2 = path:match("^versions/([^/]+)/([^/]+)/([^/]+)/diff/(%d+)/(%d+)$")
        if res_type and profile and name and v1 and v2 then
            local diff, err = VersionManager.diff_versions(res_type, profile, name, v1, v2)
            if diff then
                ngx.say(cjson.encode({ data = diff }))
            else
                Errors.throwError(err or "Failed to generate diff", ngx.HTTP_BAD_REQUEST)
            end
            ngx.exit(ngx.HTTP_OK)
        end
    end

    -- GET /api/versions/{type}/{profile}/{name}/{version} - Get specific version
    if string.find(path, "^versions/[^/]+/[^/]+/[^/]+/%d+$") then
        local res_type, profile, name, version = path:match("^versions/([^/]+)/([^/]+)/([^/]+)/(%d+)$")
        if res_type and profile and name and version then
            local entry, err = VersionManager.get_version(res_type, profile, name, tonumber(version))
            if entry then
                ngx.say(cjson.encode({ data = entry }))
            else
                Errors.throwError(err or "Version not found", ngx.HTTP_NOT_FOUND)
            end
            ngx.exit(ngx.HTTP_OK)
        end
    end

    -- GET /api/change-requests - List all CRs
    if path == "change-requests" then
        local params = {}
        if args then
            local ok_args, parsed = pcall(function()
                if args.params then return cjson.decode(args.params) end
                return args
            end)
            if ok_args and parsed then
                params = parsed.filter or parsed or {}
            end
        end
        local crs, total = CRManager.list_crs(params)
        ngx.say(cjson.encode({ data = crs, total = total }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/change-requests/pending-count - Get pending CR count
    if path == "change-requests/pending-count" then
        local count = CRManager.get_pending_count()
        ngx.say(cjson.encode({ data = { count = count } }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/change-requests/config - Get CR config (whether passphrase is set, etc.)
    if path == "change-requests/config" then
        local config = CRManager.get_cr_config()
        ngx.say(cjson.encode({
            data = {
                has_passphrase = (config.approval_passphrase ~= nil and config.approval_passphrase ~= ""),
                required_approvals = config.required_approvals or 2,
                passphrase_set_by = config.passphrase_set_by,
                passphrase_set_at = config.passphrase_set_at,
            }
        }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/versions/status/{type}/{profile} - Bulk version status for all resources
    if string.find(path, "^versions/status/[^/]+/[^/]+$") then
        local res_type, profile = path:match("^versions/status/([^/]+)/([^/]+)$")
        if res_type and profile then
            local statuses = {}
            local versions_base = configPath .. "data/versions/" .. res_type .. "/" .. profile
            local dir_ok, iter, dir_obj = pcall(LFS.dir, versions_base)
            if dir_ok and iter then
                for entry in iter, dir_obj do
                    if entry ~= "." and entry ~= ".." then
                        local meta_path = versions_base .. "/" .. entry .. "/meta.json"
                        local meta_file = io.open(meta_path, "rb")
                        if meta_file then
                            local content = meta_file:read("*a")
                            meta_file:close()
                            local ok, meta = pcall(cjson.decode, content)
                            if ok and meta then
                                statuses[entry] = {
                                    live_version = meta.live_version,
                                    latest_version = meta.latest_version,
                                    managed = true,
                                }
                            end
                        end
                    end
                end
            end
            ngx.say(cjson.encode({ data = statuses }))
            ngx.exit(ngx.HTTP_OK)
        end
    end

    -- GET /api/change-requests/{cr_id} - Get specific CR
    if string.find(path, "^change%-requests/CR%-") then
        local cr_id = path:match("^change%-requests/(CR%-%d+)$")
        if cr_id then
            local cr, err = CRManager.get_cr(cr_id)
            if cr then
                ngx.say(cjson.encode({ data = cr }))
            else
                Errors.throwError(err or "CR not found", ngx.HTTP_NOT_FOUND)
            end
            ngx.exit(ngx.HTTP_OK)
        end
    end

    -- GET /api/audit - List audit logs
    if path == "audit" then
        local params = {}
        if args then
            local ok_args, parsed = pcall(function()
                if args.params then return cjson.decode(args.params) end
                return args
            end)
            if ok_args and parsed then
                params = parsed.filter or parsed or {}
            end
        end
        local entries, total = AuditLogger.list(params)
        ngx.say(cjson.encode({ data = entries, total = total }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- GET /api/audit/{resource_type}/{resource_name} - Get audit for specific resource
    if string.find(path, "^audit/[^/]+/.+$") then
        local res_type, res_name = path:match("^audit/([^/]+)/(.+)$")
        if res_type and res_name then
            local entries, total = AuditLogger.get_by_resource(res_type, res_name)
            ngx.say(cjson.encode({ data = entries, total = total }))
            ngx.exit(ngx.HTTP_OK)
        end
    end
end

local function handle_post_request(args, path)
    -- handle POST request logic
    if path == "user/login" then
        login(args)
    end
    if path == "push-data" then
        local body = Helper.GetPayloads(args)
        PushData.sendData(body, Helper, configPath, Errors)
    end
    if settings.instance_locked == "false" or platform == "react-admin" then
        if path == "servers" then
            createUpdateServer(args)
        end
        if path == "users" then
            createUpdateUser(args)
        end
        if path == "rules" then
            createUpdateRules(args)
        end
        if path == "secrets" then
            createUpdateSecrets(args)
        end
        if path == "instances" then
            createUpdateInstances(args)
        end
        if path == "upstreams" then
            createUpdateUpstreams(args)
        end
        if path == "storage/management" then
            setStorage(args)
        end
        if path == "settings" then
            createUpdateSettings(args)
        end
        if path == "settings/profile" then
            updateProfileSettings(args)
        end
        if path == "projects/import" then
            importProjects(args)
        end
        if path == "profiles" then
            createUpdateProfiles(args, nil)
        end
        if path == "bookmarks" then
            local bm_ok, Bookmarks = pcall(require, "bookmarks")
            if bm_ok then Bookmarks.create_or_update(args) end
        end
        if path == "waf_rules" then
            createUpdateWafRules(args)
        end
        if path == "waf_policies" then
            createUpdateWafPolicies(args)
        end
        if path == "waf_rules/seed" then
            seedWafRules(args)
        end
        -- Traffic management POST endpoints
        if path == "traffic/backends/weights" then
            local ok, TrafficMgmt = pcall(require, "traffic_mgmt")
            if ok then
                local body = Helper.GetPayloads(args)
                local result = TrafficMgmt.update_weights(body)
                ngx.status = result.status or 200
                ngx.say(cjson.encode(result))
                ngx.exit(ngx.HTTP_OK)
            end
        end
        if path == "traffic/backends/promote" then
            local ok, TrafficMgmt = pcall(require, "traffic_mgmt")
            if ok then
                local body = Helper.GetPayloads(args)
                local result = TrafficMgmt.promote_backend(body)
                ngx.status = result.status or 200
                ngx.say(cjson.encode(result))
                ngx.exit(ngx.HTTP_OK)
            end
        end
        if path == "traffic/backends/rollback" then
            local ok, TrafficMgmt = pcall(require, "traffic_mgmt")
            if ok then
                local body = Helper.GetPayloads(args)
                local result = TrafficMgmt.rollback_to_primary(body)
                ngx.status = result.status or 200
                ngx.say(cjson.encode(result))
                ngx.exit(ngx.HTTP_OK)
            end
        end
        -- ── AI analysis proxy (forwards to local Ollama) ─────────────────
        -- Called via POST from both openresty-admin and openresty-admin-next.
        if path == "ai/analyze" then
            handle_ai_analyze()
        end
        if path == "password/reset" then
            resetPassword(args)
        end
        -- Cache enable/disable endpoints
        -- POST /api/cache/enable/{server_name}
        if string.find(path, "^cache/enable/") then
            local server_name = path:match("^cache/enable/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local payloads = Helper.GetPayloads(args)
            local options = {}
            if payloads.cache_ttl then options.cache_ttl = tonumber(payloads.cache_ttl) end
            if payloads.cached_extensions then options.cached_extensions = payloads.cached_extensions end
            if payloads.cached_mime_types then options.cached_mime_types = payloads.cached_mime_types end
            -- Docker blob caching options
            if payloads.cache_docker_blobs ~= nil then options.cache_docker_blobs = payloads.cache_docker_blobs end
            if payloads.cache_docker_blobs_ttl then options.cache_docker_blobs_ttl = tonumber(payloads.cache_docker_blobs_ttl) end
            if payloads.cache_docker_manifests ~= nil then options.cache_docker_manifests = payloads.cache_docker_manifests end
            if payloads.cache_docker_manifests_ttl then options.cache_docker_manifests_ttl = tonumber(payloads.cache_docker_manifests_ttl) end
            if payloads.cache_docker_serve_stale ~= nil then options.cache_docker_serve_stale = payloads.cache_docker_serve_stale end
            if payloads.cache_docker_stale_ttl then options.cache_docker_stale_ttl = tonumber(payloads.cache_docker_stale_ttl) end

            local success, err = CacheManager.enable_cache(server_name, options)
            if success then
                ngx.say(cjson.encode({
                    message = "Caching enabled for " .. server_name,
                    server_name = server_name,
                    cache_enabled = true
                }))
            else
                Errors.throwError("Failed to enable caching: " .. (err or "unknown error"),
                    ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
            ngx.exit(ngx.HTTP_OK)
        end
        -- POST /api/cache/disable/{server_name}
        if string.find(path, "^cache/disable/") then
            local server_name = path:match("^cache/disable/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local success, err = CacheManager.disable_cache(server_name)
            if success then
                ngx.say(cjson.encode({
                    message = "Caching disabled for " .. server_name,
                    server_name = server_name,
                    cache_enabled = false
                }))
            else
                Errors.throwError("Failed to disable caching: " .. (err or "unknown error"),
                    ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
            ngx.exit(ngx.HTTP_OK)
        end
        -- POST /api/cache/config/{server_name} - Update cache configuration
        if string.find(path, "^cache/config/") then
            local server_name = path:match("^cache/config/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local payloads = Helper.GetPayloads(args)
            local success, err = CacheManager.save_cache_config(server_name, payloads)
            if success then
                ngx.say(cjson.encode({
                    message = "Cache configuration updated for " .. server_name,
                    server_name = server_name
                }))
            else
                Errors.throwError("Failed to update cache config: " .. (err or "unknown error"),
                    ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
            ngx.exit(ngx.HTTP_OK)
        end
        -- POST /api/cache/clear/{server_name} - Clear cache for a domain
        if string.find(path, "^cache/clear/") then
            local server_name = path:match("^cache/clear/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local CacheHandler = require("cache_handler")
            local success, msg = CacheHandler.clear_cache(server_name)
            if success then
                ngx.say(cjson.encode({
                    message = msg or ("Cache cleared for " .. server_name),
                    server_name = server_name
                }))
            else
                Errors.throwError("Failed to clear cache: " .. (msg or "unknown error"), ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
            ngx.exit(ngx.HTTP_OK)
        end
        -- ============================================================
        -- Varnish POST endpoints
        -- ============================================================

        -- POST /api/varnish/config/{server_name} - Save Varnish config
        if string.find(path, "^varnish/config/") then
            local server_name = path:match("^varnish/config/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local payloads = Helper.GetPayloads(args)
            local success, err = VarnishManager.save_varnish_config(server_name, payloads)
            if success then
                ngx.say(cjson.encode({
                    message = "Varnish configuration updated for " .. server_name,
                    server_name = server_name
                }))
            else
                Errors.throwError("Failed to update Varnish config: " .. (err or "unknown error"),
                    ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
            ngx.exit(ngx.HTTP_OK)
        end

        -- POST /api/varnish/snippets/{server_name} - Create snippet
        if string.find(path, "^varnish/snippets/") then
            local server_name = path:match("^varnish/snippets/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local payloads = Helper.GetPayloads(args)
            local success, err = VarnishManager.save_snippet(server_name, payloads)
            if success then
                local snippets = VarnishManager.get_snippets(server_name)
                ngx.say(cjson.encode({
                    message = "Snippet created for " .. server_name,
                    server_name = server_name,
                    snippets = snippets
                }))
            else
                Errors.throwError("Failed to create snippet: " .. (err or "unknown error"),
                    ngx.HTTP_BAD_REQUEST)
            end
            ngx.exit(ngx.HTTP_OK)
        end

        -- POST /api/varnish/deploy/{server_name} - Deploy VCL
        if string.find(path, "^varnish/deploy/") then
            local server_name = path:match("^varnish/deploy/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local payloads = Helper.GetPayloads(args) or {}
            local dry_run = payloads.dry_run ~= false -- default to dry_run=true

            local VarnishVcl = require("varnish_vcl")
            local config = VarnishManager.get_varnish_config(server_name)
            if not config then
                Errors.throwError("No Varnish config found for " .. server_name, ngx.HTTP_NOT_FOUND)
                ngx.exit(ngx.HTTP_NOT_FOUND)
            end

            local snippets = config.snippets or {}

            -- Step 1: Generate VCL
            local vcl, vcl_err = VarnishVcl.assemble(server_name, config, snippets)
            if not vcl then
                Errors.throwError("Failed to generate VCL: " .. (vcl_err or "unknown"), ngx.HTTP_INTERNAL_SERVER_ERROR)
                ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
            end

            -- Step 2: Validate VCL
            local valid, validate_output = VarnishVcl.validate_vcl(vcl)

            if dry_run then
                ngx.say(cjson.encode({
                    data = {
                        server_name = server_name,
                        dry_run = true,
                        valid = valid,
                        validation_output = validate_output,
                        vcl_preview = vcl,
                        snippet_count = #snippets
                    }
                }))
                ngx.exit(ngx.HTTP_OK)
            end

            if not valid then
                VarnishManager.set_deploy_status(server_name, {
                    state = "failed",
                    last_deployed_at = os.time(),
                    last_error = validate_output
                })
                Errors.throwError("VCL validation failed: " .. validate_output, ngx.HTTP_BAD_REQUEST)
                ngx.exit(ngx.HTTP_BAD_REQUEST)
            end

            -- Step 3: Save VCL to disk
            local save_ok, vcl_path = VarnishManager.save_generated_vcl(server_name, vcl)
            if not save_ok then
                Errors.throwError("Failed to save VCL: " .. tostring(vcl_path), ngx.HTTP_INTERNAL_SERVER_ERROR)
                ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
            end

            -- Step 4: Deploy VCL to Varnish
            local admin_addr = (config.admin_listen_address or "127.0.0.1") .. ":" .. (config.admin_listen_port or 6082)
            local label = VarnishVcl.generate_vcl_label(server_name)
            local deploy_ok, deploy_output, deployed_label = VarnishVcl.deploy_vcl(vcl_path, admin_addr, label)

            if deploy_ok then
                VarnishManager.set_deploy_status(server_name, {
                    state = "deployed",
                    last_deployed_at = os.time(),
                    last_vcl_label = deployed_label,
                    last_error = nil
                })
                ngx.say(cjson.encode({
                    data = {
                        server_name = server_name,
                        deployed = true,
                        vcl_label = deployed_label,
                        message = deploy_output
                    }
                }))
            else
                VarnishManager.set_deploy_status(server_name, {
                    state = "failed",
                    last_deployed_at = os.time(),
                    last_vcl_label = deployed_label,
                    last_error = deploy_output
                })
                ngx.say(cjson.encode({
                    data = {
                        server_name = server_name,
                        deployed = false,
                        error = deploy_output
                    }
                }))
            end
            ngx.exit(ngx.HTTP_OK)
        end

        -- POST /api/varnish/enable/{server_name} - Enable Varnish
        if string.find(path, "^varnish/enable/") then
            local server_name = path:match("^varnish/enable/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local payloads = Helper.GetPayloads(args) or {}
            local success, err = VarnishManager.enable_varnish(server_name, payloads)
            if success then
                ngx.say(cjson.encode({
                    message = "Varnish enabled for " .. server_name,
                    server_name = server_name,
                    varnish_enabled = true
                }))
            else
                Errors.throwError("Failed to enable Varnish: " .. (err or "unknown error"),
                    ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
            ngx.exit(ngx.HTTP_OK)
        end

        -- POST /api/varnish/disable/{server_name} - Disable Varnish
        if string.find(path, "^varnish/disable/") then
            local server_name = path:match("^varnish/disable/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local success, err = VarnishManager.disable_varnish(server_name)
            if success then
                ngx.say(cjson.encode({
                    message = "Varnish disabled for " .. server_name,
                    server_name = server_name,
                    varnish_enabled = false
                }))
            else
                Errors.throwError("Failed to disable Varnish: " .. (err or "unknown error"),
                    ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
            ngx.exit(ngx.HTTP_OK)
        end

        -- POST /api/varnish/purge/{server_name} - Purge Varnish cache
        if string.find(path, "^varnish/purge/") then
            local server_name = path:match("^varnish/purge/(.+)$")
            if not server_name or server_name == "" then
                Errors.throwError("Server name is required", ngx.HTTP_BAD_REQUEST)
            end
            local payloads = Helper.GetPayloads(args) or {}
            local config = VarnishManager.get_varnish_config(server_name)
            if not config then
                Errors.throwError("No Varnish config found for " .. server_name, ngx.HTTP_NOT_FOUND)
                ngx.exit(ngx.HTTP_NOT_FOUND)
            end
            local admin_addr = (config.admin_listen_address or "127.0.0.1") .. ":" .. (config.admin_listen_port or 6082)
            local VarnishVcl = require("varnish_vcl")
            local success, output = VarnishVcl.purge_cache(admin_addr, payloads.url_pattern)
            ngx.say(cjson.encode({
                data = {
                    server_name = server_name,
                    purged = success,
                    output = output
                }
            }))
            ngx.exit(ngx.HTTP_OK)
        end

        -- POST /api/cache/clear-all - Clear all cache
        if path == "cache/clear-all" then
            local CacheHandler = require("cache_handler")
            local success, msg = CacheHandler.clear_all_cache()
            if success then
                ngx.say(cjson.encode({
                    message = msg or "All cache cleared"
                }))
            else
                Errors.throwError("Failed to clear cache: " .. (msg or "unknown error"), ngx.HTTP_INTERNAL_SERVER_ERROR)
            end
            ngx.exit(ngx.HTTP_OK)
        end

        -- ============================================================
        -- Version Control & Change Request POST endpoints
        -- ============================================================

        -- POST /api/versions/{type}/{profile}/{name} - Create a new draft version
        if string.find(path, "^versions/[^/]+/[^/]+/.+$") and not string.find(path, "/rollback$") and not string.find(path, "/initialize$") then
            local res_type, profile, name = path:match("^versions/([^/]+)/([^/]+)/(.+)$")
            if res_type and profile and name then
                local payloads = Helper.GetPayloads(args)
                if not payloads then
                    Errors.throwError("Request body is required", ngx.HTTP_BAD_REQUEST)
                    ngx.exit(ngx.HTTP_BAD_REQUEST)
                end
                local user = payloads.created_by or ngx.req.get_headers()["x-user"] or "system"
                local version, err = VersionManager.create_version(
                    res_type, profile, name,
                    payloads.config_payload or payloads,
                    user,
                    payloads.description
                )
                if version then
                    ngx.say(cjson.encode({ data = version, message = "Draft version created" }))
                else
                    Errors.throwError(err or "Failed to create version", ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- POST /api/versions/{type}/{profile}/{name}/initialize - Initialize versioning for existing resource
        if string.find(path, "^versions/[^/]+/[^/]+/.+/initialize$") then
            local res_type, profile, name = path:match("^versions/([^/]+)/([^/]+)/(.+)/initialize$")
            if res_type and profile and name then
                local user = ngx.req.get_headers()["x-user"] or "system"
                local version, err = VersionManager.initialize_resource(res_type, profile, name, user)
                if version then
                    ngx.say(cjson.encode({ data = version, message = "Versioning initialized" }))
                else
                    Errors.throwError(err or "Failed to initialize versioning", ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- POST /api/versions/{type}/{profile}/{name}/rollback/{version} - Create rollback version
        if string.find(path, "^versions/[^/]+/[^/]+/.+/rollback/%d+$") then
            local res_type, profile, name, version = path:match("^versions/([^/]+)/([^/]+)/([^/]+)/rollback/(%d+)$")
            if res_type and profile and name and version then
                local user = ngx.req.get_headers()["x-user"] or "system"
                local new_version, err = VersionManager.create_rollback_version(
                    res_type, profile, name, tonumber(version), user
                )
                if new_version then
                    ngx.say(cjson.encode({ data = new_version, message = "Rollback version created as draft" }))
                else
                    Errors.throwError(err or "Failed to create rollback version", ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- POST /api/change-requests - Create a new CR
        if path == "change-requests" then
            local payloads = Helper.GetPayloads(args)
            if not payloads then
                Errors.throwError("Request body is required", ngx.HTTP_BAD_REQUEST)
                ngx.exit(ngx.HTTP_BAD_REQUEST)
            end
            local user = payloads.created_by or ngx.req.get_headers()["x-user"] or "system"
            local cr, err = CRManager.create_cr(payloads, user)
            if cr then
                ngx.say(cjson.encode({ data = cr, message = "Change Request created" }))
            else
                Errors.throwError(err or "Failed to create CR", ngx.HTTP_BAD_REQUEST)
            end
            ngx.exit(ngx.HTTP_OK)
        end
    else
        Errors.throwError(
            "You can't create record either you can create it from UI or you need to change settings for instance lock.",
            ngx.HTTP_FORBIDDEN)
    end
end

-- Function to handle PUT requests
local function handle_put_request(args, path)
    -- handle PUT request logic
    path = ngx.unescape_uri(path)
    local pattern = ".*/(.*)"
    local uuid = string.match(path, pattern)
    if not uuid or uuid == nil or uuid == "" then
        Errors.throwError("The uuid must be present while updating the data.", ngx.HTTP_INTERNAL_SERVER_ERROR)
        return
    end
    if settings.instance_locked == "false" or platform == "react-admin" then
        if string.find(path, "servers") then
            createUpdateServer(args, uuid)
        end
        if string.find(path, "users") then
            createUpdateUser(args, uuid)
        end

        if string.find(path, "waf_rules") then
            createUpdateWafRules(args, uuid)
        elseif string.find(path, "waf_policies") then
            createUpdateWafPolicies(args, uuid)
        elseif string.find(path, "rules") then
            createUpdateRules(args, uuid)
        end

        if string.find(path, "secrets") then
            createUpdateSecrets(args, uuid)
        end

        if string.find(path, "instances") then
            createUpdateInstances(args, uuid)
        end

        if string.find(path, "upstreams") then
            createUpdateUpstreams(args, uuid)
        end

        if string.find(path, "settings") then
            createUpdateSettings(args, uuid)
        end
        if string.find(path, "profiles") then
            createUpdateProfiles(args, uuid)
        end

        -- ============================================================
        -- Version Control & Change Request PUT endpoints
        -- ============================================================

        -- PUT /api/change-requests/{cr_id}/approve - Approve a CR
        if string.find(path, "^change%-requests/CR%-[^/]+/approve$") then
            local cr_id = path:match("^change%-requests/(CR%-%d+)/approve$")
            if cr_id then
                local payloads = Helper.GetPayloads(args)
                local user = (payloads and payloads.user) or ngx.req.get_headers()["x-user"] or "system"
                local comment = payloads and payloads.comment
                local passphrase = payloads and payloads.passphrase
                local cr, err = CRManager.approve_cr(cr_id, user, comment, passphrase)
                if cr then
                    ngx.say(cjson.encode({ data = cr, message = "CR approved" }))
                else
                    Errors.throwError(err or "Failed to approve CR", ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- PUT /api/change-requests/{cr_id}/reject - Reject a CR
        if string.find(path, "^change%-requests/CR%-[^/]+/reject$") then
            local cr_id = path:match("^change%-requests/(CR%-%d+)/reject$")
            if cr_id then
                local payloads = Helper.GetPayloads(args)
                local user = (payloads and payloads.user) or ngx.req.get_headers()["x-user"] or "system"
                local reason = payloads and payloads.reason
                local cr, err = CRManager.reject_cr(cr_id, user, reason)
                if cr then
                    ngx.say(cjson.encode({ data = cr, message = "CR rejected" }))
                else
                    Errors.throwError(err or "Failed to reject CR", ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- PUT /api/change-requests/{cr_id}/cancel - Cancel a CR
        if string.find(path, "^change%-requests/CR%-[^/]+/cancel$") then
            local cr_id = path:match("^change%-requests/(CR%-%d+)/cancel$")
            if cr_id then
                local payloads = Helper.GetPayloads(args)
                local user = (payloads and payloads.user) or ngx.req.get_headers()["x-user"] or "system"
                local cr, err = CRManager.cancel_cr(cr_id, user)
                if cr then
                    ngx.say(cjson.encode({ data = cr, message = "CR cancelled" }))
                else
                    Errors.throwError(err or "Failed to cancel CR", ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- PUT /api/change-requests/config/passphrase - Set CR approval passphrase
        if path == "change-requests/config/passphrase" then
            local payloads = Helper.GetPayloads(args)
            if not payloads or not payloads.passphrase then
                Errors.throwError("passphrase is required", ngx.HTTP_BAD_REQUEST)
                ngx.exit(ngx.HTTP_BAD_REQUEST)
            end
            local user = (payloads and payloads.user) or ngx.req.get_headers()["x-user"] or "system"
            local ok, err = CRManager.set_passphrase(payloads.passphrase, user)
            if ok then
                ngx.say(cjson.encode({ message = "CR approval passphrase updated" }))
            else
                Errors.throwError(err or "Failed to set passphrase", ngx.HTTP_BAD_REQUEST)
            end
            ngx.exit(ngx.HTTP_OK)
        end

        -- PUT /api/versions/{type}/{profile}/{name}/{version} - Update a draft version
        if string.find(path, "^versions/[^/]+/[^/]+/[^/]+/%d+$") then
            local res_type, profile, name, version = path:match("^versions/([^/]+)/([^/]+)/([^/]+)/(%d+)$")
            if res_type and profile and name and version then
                local payloads = Helper.GetPayloads(args)
                if not payloads then
                    Errors.throwError("Request body is required", ngx.HTTP_BAD_REQUEST)
                    ngx.exit(ngx.HTTP_BAD_REQUEST)
                end
                local user = (payloads and payloads.updated_by) or ngx.req.get_headers()["x-user"] or "system"
                local entry, err = VersionManager.update_draft(
                    res_type, profile, name, tonumber(version),
                    payloads.config_payload or payloads,
                    user,
                    payloads.description
                )
                if entry then
                    ngx.say(cjson.encode({ data = entry, message = "Draft updated" }))
                else
                    Errors.throwError(err or "Failed to update draft", ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- PUT /api/varnish/config/{server_name} - Update Varnish config
        if string.find(path, "^varnish/config/") then
            local server_name = path:match("^varnish/config/(.+)$")
            if server_name and server_name ~= "" then
                local payloads = Helper.GetPayloads(args)
                local success, err = VarnishManager.save_varnish_config(server_name, payloads)
                if success then
                    ngx.say(cjson.encode({
                        message = "Varnish configuration updated for " .. server_name,
                        server_name = server_name
                    }))
                else
                    Errors.throwError("Failed to update Varnish config: " .. (err or "unknown error"),
                        ngx.HTTP_INTERNAL_SERVER_ERROR)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- PUT /api/varnish/snippets/{server_name}/{snippet_id} - Update snippet
        if string.find(path, "^varnish/snippets/") then
            local server_name, snippet_id = path:match("^varnish/snippets/([^/]+)/(.+)$")
            if server_name and snippet_id then
                local payloads = Helper.GetPayloads(args)
                payloads.id = snippet_id
                local success, err = VarnishManager.save_snippet(server_name, payloads)
                if success then
                    ngx.say(cjson.encode({
                        message = "Snippet updated",
                        server_name = server_name,
                        snippet_id = snippet_id
                    }))
                else
                    Errors.throwError("Failed to update snippet: " .. (err or "unknown error"),
                        ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end
    else
        Errors.throwError(
            "You can't create record either you can create it from UI or you need to change settings for instance lock.",
            ngx.HTTP_FORBIDDEN)
    end
end

-- Function to handle DELETE requests
local function handle_delete_request(args, path)
    -- handle DELETE request logic
    path = ngx.unescape_uri(path)
    local pattern = ".*/(.*)"
    local uuid = string.match(path, pattern)
    if settings.instance_locked == "false" or platform == "react-admin" then
        -- DELETE /api/varnish/snippets/{server_name}/{snippet_id}
        if string.find(path, "^varnish/snippets/") then
            local server_name, snippet_id = path:match("^varnish/snippets/([^/]+)/(.+)$")
            if server_name and snippet_id then
                local success, err = VarnishManager.delete_snippet(server_name, snippet_id)
                if success then
                    ngx.say(cjson.encode({
                        message = "Snippet deleted",
                        server_name = server_name,
                        snippet_id = snippet_id
                    }))
                else
                    Errors.throwError("Failed to delete snippet: " .. (err or "unknown error"),
                        ngx.HTTP_BAD_REQUEST)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        -- DELETE /api/varnish/config/{server_name}
        if string.find(path, "^varnish/config/") then
            local server_name = path:match("^varnish/config/(.+)$")
            if server_name and server_name ~= "" then
                local success, err = VarnishManager.delete_varnish_config(server_name)
                if success then
                    ngx.say(cjson.encode({
                        message = "Varnish config deleted for " .. server_name,
                        server_name = server_name
                    }))
                else
                    Errors.throwError("Failed to delete Varnish config: " .. (err or "unknown error"),
                        ngx.HTTP_INTERNAL_SERVER_ERROR)
                end
                ngx.exit(ngx.HTTP_OK)
            end
        end

        if string.find(path, "waf_rules") then
            createDeleteWafRules(args, uuid)
        elseif string.find(path, "waf_policies") then
            createDeleteWafPolicies(args, uuid)
        elseif string.find(path, "rules") then
            createDeleteRules(args, uuid)
        end
        if string.find(path, "secrets") then
            createDeleteSecrets(args, uuid)
        end
        if string.find(path, "instances") then
            createDeleteInstances(args, uuid)
        end
        if string.find(path, "upstreams") then
            -- Check if this is a bulk delete (path ends with "upstreams" and body contains ids)
            if uuid == "upstreams" or not uuid or uuid == "" then
                -- Bulk delete - get IDs from request body
                local bodyData = ngx.req.get_body_data()
                if bodyData then
                    local ok, parsedBody = pcall(cjson.decode, bodyData)
                    if ok and parsedBody and parsedBody.ids and parsedBody.ids.ids then
                        local ids = parsedBody.ids.ids
                        local deletedIds = {}
                        local envProfile = parsedBody.ids.envProfile or "prod"
                        for _, id in ipairs(ids) do
                            if id and string.match(id, "^upstream:") then
                                -- Use internal function that doesn't call ngx.exit
                                local result = deleteUpstreamInternal(nil, id, envProfile)
                                if result and result.deleted then
                                    table.insert(deletedIds, id)
                                end
                            end
                        end
                        -- Regenerate the combined upstream config file once after all deletes
                        local configOk, configFilePath = writeUpstreamConfigFile(envProfile)
                        if configOk then
                            ngx.log(ngx.INFO, "Upstream config regenerated after bulk delete: ", configFilePath)
                        else
                            ngx.log(ngx.WARN, "Failed to regenerate upstream config after bulk delete: ", configFilePath)
                        end
                        ngx.say(cjson.encode({
                            data = deletedIds
                        }))
                        return ngx.exit(ngx.HTTP_OK)
                    end
                end
                ngx.status = ngx.HTTP_BAD_REQUEST
                ngx.say(cjson.encode({
                    error = "Validation error",
                    message = "Upstream ID is required for deletion. For bulk delete, send IDs in request body."
                }))
                ngx.exit(ngx.HTTP_BAD_REQUEST)
                -- Single delete - validate that uuid is an upstream ID (should start with "upstream:")
            elseif uuid and string.match(uuid, "^upstream:") then
                deleteUpstream(args, uuid)
            else
                ngx.status = ngx.HTTP_BAD_REQUEST
                ngx.say(cjson.encode({
                    error = "Validation error",
                    message = "Invalid upstream ID format. Expected format: upstream:<name>"
                }))
                ngx.exit(ngx.HTTP_BAD_REQUEST)
            end
        end
        if string.find(path, "servers") then
            createDeleteServer(args, uuid)
        end
        if string.find(path, "users") then
            deleteUsers(args, uuid)
        end
        if string.find(path, "profiles") then
            deleteProfile(args)
        end
        if string.find(path, "bookmarks") and uuid then
            local bm_ok, Bookmarks = pcall(require, "bookmarks")
            if bm_ok then Bookmarks.delete(args, uuid) end
        end
    elseif settings.instance_locked == "false" or preAction == "pre-release-delete-all-override" then
        if path == "delete/all" then
            deleteAll(args)
        end
    else
        Errors.throwError(
            "You can't delete record either you can delete it from UI or you need to change settings for instance lock.",
            ngx.HTTP_FORBIDDEN)
    end
end

-- Get the path name from the URI
local path_name = ngx.var.uri:match("^/api/(.*)$")

-- Determine the request method and call the appropriate function
if ngx.req.get_method() == "GET" then
    handle_get_request(ngx.req.get_uri_args(), path_name)
elseif ngx.req.get_method() == "POST" then
    ngx.req.read_body()
    local postBody, postErr = ngx.req.get_post_args()
    if postErr then
        Errors.throwError(postErr, ngx.HTTP_INTERNAL_SERVER_ERROR)
    end
    handle_post_request(postBody, path_name)
elseif ngx.req.get_method() == "PUT" then
    ngx.req.read_body()
    handle_put_request(ngx.req.get_post_args(), path_name)
elseif ngx.req.get_method() == "DELETE" then
    ngx.req.read_body()
    handle_delete_request(ngx.req.get_post_args(), path_name)
else
    ngx.exit(ngx.HTTP_NOT_ALLOWED)
end
