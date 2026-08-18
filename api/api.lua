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
local Pops = require("pops")
local DnsManager = require("dns_manager")
local Storage = require("storage")
local Repo = require("repo")

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
        local valid_categories = {
            sqli = true, xss = true, cmdi = true, lfi = true, rfi = true, protocol = true, custom = true,
            -- Modern / API-era categories shipped by the extended rule library.
            ssti = true, ssrf = true, nosqli = true, rce = true, xxe = true, jwt = true,
            graphql = true, redirect = true, scanner = true, ["proto-pollution"] = true,
            ["mass-assignment"] = true, smuggling = true,
        }
        if not valid_categories[payloads.category] then
            table.insert(errors,
                {
                    field = "category",
                    message =
                    "Invalid category. Must be one of: sqli, xss, cmdi, lfi, rfi, protocol, custom, " ..
                    "ssti, ssrf, nosqli, rce, xxe, jwt, graphql, redirect, scanner, proto-pollution, " ..
                    "mass-assignment, smuggling"
                })
        end
    end

    if not payloads.pattern or payloads.pattern == "" then
        table.insert(errors, { field = "pattern", message = "WAF rule pattern is required" })
    elseif payloads.pattern_type ~= "string" then
        -- OpenResty has no ngx.re.compile; test-compile by matching the pattern
        -- against an empty subject (the "o" flag caches the compiled regex per
        -- worker, exactly as the engine does at request time).
        local ok, compile_err = pcall(ngx.re.find, "", payloads.pattern, "jo")
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

local store_ok, store_err = pcall(function()
    Storage.init(settings)
end)
if not store_ok then
    ngx.log(ngx.ERR, "failed to init storage: ", tostring(store_err))
    Errors.throwError("failed to connect to storage: " .. tostring(store_err), ngx.HTTP_BAD_GATEWAY)
end

-- Redis client is only used for resty.session listing (session:* keys).
-- CRUD goes through Repo / storage drivers.
local red = nil
if settings.storage_type == "redis" then
    local redis = require "resty.redis"
    red = redis:new()
    red:set_timeout(1000)
    local redisHost = (settings.env_vars and settings.env_vars.REDIS_HOST) or os.getenv("REDIS_HOST") or "localhost"
    local ok, err = red:connect(redisHost, 6379)
    if not ok then
        ngx.log(ngx.ERR, "failed to connect to Redis (sessions): ", err)
    end
end

local function removeServerFromRule(oldRuleId, serverId, envProfile)
    -- Accept either a single rule ID (string) or an array of rule IDs,
    -- for the same reason as `updateServerInRules` — Next.js admin may
    -- pass arrays while legacy react-admin passed single strings.
    if type(oldRuleId) == "table" then
        for _, r in ipairs(oldRuleId) do
            if type(r) == "string" and r ~= "" then
                removeServerFromRule(r, serverId, envProfile)
            end
        end
        return
    end
    if type(oldRuleId) ~= "string" or oldRuleId == "" then
        return
    end

    local loadRules = nil
    if oldRuleId and oldRuleId ~= nil and type(oldRuleId) ~= "userdata" then
        loadRules = Repo.get("rules", envProfile, oldRuleId)
        if type(loadRules) == "table" then
            -- Guard: rule JSON may not have a `.servers` field yet if
            -- no server has ever been linked to it.  Without this
            -- check, `#loadRules.servers` raises "attempt to get
            -- length of field 'servers' (a nil value)" and aborts
            -- the whole PUT /api/servers/... request.  Sibling
            -- function updateServerInRules already handles this
            -- shape (see the `if not getRules.servers` branch).
            if type(loadRules.servers) ~= "table" then
                return
            end
            local valueToRemove = serverId
            local i = 1
            while i <= #loadRules.servers do
                if loadRules.servers[i] == valueToRemove then
                    table.remove(loadRules.servers, i)
                else
                    i = i + 1
                end
            end
            Repo.save("rules", envProfile, oldRuleId, loadRules, { skip_strip = true })
        end
    end
end

local function updateServerInRules(ruleId, serverId, Rtype, envProfile)
    -- Accept either a single rule ID (string) or an array of rule IDs
    -- (Next.js admin sends `rules` and `match_cases[].statement` as
    -- arrays; legacy react-admin sent them as single strings).  Normalize
    -- by recursing element-wise when a table is received.
    if type(ruleId) == "table" then
        for _, r in ipairs(ruleId) do
            if type(r) == "string" and r ~= "" then
                updateServerInRules(r, serverId, Rtype, envProfile)
            end
        end
        return
    end
    if type(ruleId) ~= "string" or ruleId == "" then
        return
    end

    local getRules = Repo.get("rules", envProfile, ruleId)
    if type(getRules) == "table" then
        local getServer = Repo.get("servers", envProfile, serverId)
        if type(getServer) == "table" then
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
            Repo.save("rules", envProfile, ruleId, getRules, { skip_strip = true })
        end
    end
end

local function deleteRuleFromServer(ruleId, envProfile)
    local getRule = Repo.get("rules", envProfile, ruleId)
    if type(getRule) == "table" then
        -- Remove the rules from all servers that are using it as a statement or case
        if getRule.servers and getRule.servers ~= nil then
            for _, server in ipairs(getRule.servers) do
                local getServer = Repo.get("servers", envProfile, server)
                if type(getServer) == "table" then
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
                    Repo.save("servers", envProfile, server, getServer, { skip_strip = true })
                end
            end
        end
    end
end

local function deleteServerFromRules(ruleId, serverId, envProfile)
    local getRule = Repo.get("rules", envProfile, ruleId)
    if type(getRule) == "table" then
        if getRule.servers ~= nil and type(getRule.servers) == "table" then
            for _, server in ipairs(getRule.servers) do
                if server == serverId then
                    table.remove(getRule.servers, _)
                end
            end
            Repo.save("rules", envProfile, ruleId, getRule, { skip_strip = true })
        end
    end
end

-- Forward declaration: listWithPagination runs after this local is assigned.
local listPaginationLocal

-- Map historical redis hash names / disk directory prefixes onto repo
-- resource ids.  listWithPagination and listFromDisk both scan via Repo
-- so disk / redis / pgsql share listPaginationLocal semantics.
local REDIS_KEY_RESOURCE = {
    servers = "servers",
    request_rules = "rules",
    secrets = "secrets",
    instances = "instances",
    upstreams = "upstreams",
    waf_rules = "waf_rules",
    waf_policies = "waf_policies",
    waf_events = "waf_events",
    users = "users",
    pops = "pops",
    bookmarks = "bookmarks",
    company_logo = "company_logo",
}

local function resource_from_redis_key(recordsKey)
    if REDIS_KEY_RESOURCE[recordsKey] then
        return REDIS_KEY_RESOURCE[recordsKey], nil
    end
    local base, env = tostring(recordsKey):match("^(.*)_(.+)$")
    if base and REDIS_KEY_RESOURCE[base] then
        return REDIS_KEY_RESOURCE[base], env
    end
    return base or recordsKey, env
end

local function listWithPagination(recordsKey, cursor, pageSize, pageNumber, qParams)
    local resource, env = resource_from_redis_key(recordsKey)
    local allRecords, err = Repo.scan(resource, env)
    if not allRecords then
        ngx.log(ngx.INFO, "Failed to retrieve records: ", tostring(err))
        return {}, 0
    end
    return listPaginationLocal(allRecords, pageSize, pageNumber, qParams)
end

-- ─── Filter / sort / paginate over an in-memory collection ───────────────
--
-- Pipeline order: **filter → sort → paginate**.  Previously this was
-- paginate-first (the page slice was computed before the filter ran),
-- which meant a search only saw records on the visible page — typing
-- `abc` returned "not found" if the matching record happened to live on
-- page 2 of the unfiltered list.  Sort was also applied AFTER pagination
-- by each list* caller, so cross-page ordering reflected whatever order
-- `ls` returned from disk rather than the requested sort.field / order.
--
-- Both fixed here, in one place, so every resource that calls into this
-- helper (servers, rules, secrets, instances, upstreams, waf_rules,
-- waf_policies, users, profiles) gets correct query semantics and
-- accurate total counts.  The list* callers' own post-pagination sort
-- blocks are now redundant and have been removed.
--
-- qParams.type.search_fields (optional, array of dotted paths like
-- "match.rules.path") broadens the q match across multiple columns.
-- Falls back to a single-field match on qParams.type.key_name so
-- callers that haven't been updated still work.
listPaginationLocal = function(data, pageSize, pageNumber, qParams)
    qParams = qParams or {}

    -- Resolve a dotted path against a nested record (e.g.
    -- "match.rules.path").  Returns nil at any missing segment.
    local function getNested(item, path)
        local cur = item
        for segment in tostring(path):gmatch("[^.]+") do
            if type(cur) ~= "table" then return nil end
            cur = cur[segment]
        end
        return cur
    end

    -- Pick search fields.  Prefer the explicit search_fields array;
    -- otherwise the single key_name set by the caller; otherwise "name"
    -- as a generic fallback.
    local searchFields = qParams.type and qParams.type.search_fields
    if not (type(searchFields) == "table" and #searchFields > 0) then
        local keyName = (qParams.type and qParams.type.key_name) or "name"
        searchFields = { keyName }
    end

    -- Normalise the q query once.  An empty string or nil means
    -- "no filter".
    local q
    if type(qParams.filter) == "table"
        and qParams.filter.q ~= nil
        and qParams.filter.q ~= ""
    then
        q = tostring(qParams.filter.q):lower()
    end

    -- meta.exclude lets callers (combobox pickers) hide a record from
    -- its own dropdown.  Preserved from the previous behaviour.
    local excludeId
    if type(qParams.meta) == "table" then
        excludeId = qParams.meta.exclude
    end

    -- 1. Filter the WHOLE collection.
    local matches = {}
    for _, item in ipairs(data or {}) do
        if item ~= nil and item ~= ngx.null and item ~= "null" then
            local keep = true
            if excludeId ~= nil and item.id == excludeId then
                keep = false
            end
            if keep and q ~= nil then
                local hit = false
                for _, fieldPath in ipairs(searchFields) do
                    local val = getNested(item, fieldPath)
                    if val ~= nil and val ~= ngx.null then
                        if tostring(val):lower():find(q, 1, true) then
                            hit = true
                            break
                        end
                    end
                end
                if not hit then keep = false end
            end
            if keep then matches[#matches + 1] = item end
        end
    end

    -- 2. Sort the filtered collection.
    if type(qParams.sort) == "table" and qParams.sort.field ~= nil then
        if qParams.sort.order == "DESC" then
            table.sort(matches, Helper.sortDesc(qParams.sort.field))
        elseif qParams.sort.order == "ASC" then
            table.sort(matches, Helper.sortAsc(qParams.sort.field))
        end
    end

    -- 3. Paginate the sorted, filtered slice.  `total` is the count of
    -- matches BEFORE pagination, so the frontend's page count is honest.
    local total = #matches
    if pageSize == nil or pageNumber == nil then
        return matches, total
    end
    local startIdx = (pageNumber - 1) * pageSize + 1
    local endIdx = math.min(startIdx + pageSize - 1, total)
    local pageData = {}
    for i = startIdx, endIdx do
        pageData[#pageData + 1] = matches[i]
    end
    return pageData, total
end

-- Authentication

-- Auth cookie name — keep in sync with nginx auth block fallback + Next.js middleware.
local AUTH_COOKIE_NAME = "wslproxy_token"
-- Align with JWT expiry (Helper.generateToken uses 3600s).
local AUTH_COOKIE_MAX_AGE = 3600

-- Build a Set-Cookie value for the auth token.  `Secure` is only added on
-- HTTPS requests so local HTTP development still works.
local function buildAuthCookie(token, maxAge)
    local parts = {
        AUTH_COOKIE_NAME .. "=" .. (token or ""),
        "Path=/",
        "HttpOnly",
        "SameSite=Lax",
        "Max-Age=" .. tostring(maxAge or 0),
    }
    if ngx.var.scheme == "https" then
        table.insert(parts, "Secure")
    end
    return table.concat(parts, "; ")
end

local function instanceInfo()
    return {
        instance_id = settings.instance_id,
        instance_name = settings.instance_name,
        instance_hash = settings.instance_hash,
        serial_number = settings.serial_number,
    }
end

local function login(args)
    if settings then
        local suEmail = settings.super_user.email
        local suPassword = settings.super_user.password

        local payloads = Helper.GetPayloads(args)
        local password = Helper.hashPassword(payloads.password)

        if suEmail == payloads.email and suPassword == password then
            local token = Helper.generateToken()

            -- Set httpOnly cookie so middleware can gate auth server-side and
            -- tokens are no longer accessible via document.cookie / localStorage.
            ngx.header["Set-Cookie"] = buildAuthCookie(token, AUTH_COOKIE_MAX_AGE)

            ngx.status = ngx.OK
            if settings.storage_type == "redis" then
                local session = require "resty.session".new()
                session:set_subject("Users")
                session:set(payloads.email, cjson.encode(payloads))
                session:save()
            end
            ngx.say(cjson.encode({
                data = {
                    user = { email = payloads.email },
                    -- accessToken retained in the body for backward-compat
                    -- with the react-admin UI (localStorage-based auth).
                    accessToken = token,
                    instance = instanceInfo(),
                },
                status = 200
            }))
            ngx.exit(ngx.HTTP_OK)
        else
            Errors.throwError("Invalid credentials", ngx.HTTP_UNAUTHORIZED)
        end
    end
end

-- Clears the auth cookie.  Idempotent: safe to call with an already-expired
-- cookie.  Does NOT require a valid JWT (see nginx auth bypass list).
local function logout()
    ngx.header["Set-Cookie"] = buildAuthCookie("", 0)
    ngx.status = ngx.HTTP_OK
    ngx.say(cjson.encode({ data = { message = "Logged out" }, status = 200 }))
    ngx.exit(ngx.HTTP_OK)
end

-- Returns the current session info.  Auth is enforced by the nginx auth
-- block, so if we get here the cookie/bearer is already validated.
local function userMe()
    if not settings then
        Errors.throwError("Settings not loaded", ngx.HTTP_INTERNAL_SERVER_ERROR)
        return
    end
    ngx.status = ngx.HTTP_OK
    ngx.say(cjson.encode({
        data = {
            user = { email = settings.super_user and settings.super_user.email or nil },
            instance = instanceInfo(),
        },
        status = 200
    }))
    ngx.exit(ngx.HTTP_OK)
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
    -- directory is historically "servers/prod", "rules/int", "waf_policies/prod"
    local resource, env = tostring(directory):match("^([^/]+)/?(.*)$")
    if env == "" then
        env = nil
    end
    local jsonData, err = Repo.scan(resource, env)
    if not jsonData then
        ngx.log(ngx.WARN, "listFromDisk scan failed: ", tostring(err))
        jsonData = {}
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
        key_name = "server_name",
        -- Fields the q search matches.  `id` covers `host:foo.wslproxy.com`
        -- exact-id paste-search; `proxy_server_name` lets users find a
        -- server by its upstream alias even when server_name doesn't
        -- contain the term.
        search_fields = { "server_name", "proxy_server_name", "id" }
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

    -- (Sort is now applied inside listPaginationLocal / listWithPagination,
    -- on the full filtered collection BEFORE pagination — so a search
    -- can't lose records that live on a later page.)
    return ngx.say(cjson.encode({
        data = allServers,
        total = totalRecords
    }))
end

local function listServer(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local jsonData = Repo.get("servers", envProfile, id)
    if type(jsonData) ~= "table" then
        ngx.say(cjson.encode({ data = {} }))
        return
    end
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
    ngx.say(cjson.encode({ data = jsonData }))
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
        key_name = "secret_name",
        search_fields = { "secret_name", "id", "description" }
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

    -- Sort applied inside listPaginationLocal / listWithPagination.
    return ngx.say(cjson.encode({
        data = allServers,
        total = totalRecords
    }))
end

local function listSecret(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local jsonData = Repo.get("secrets", envProfile, id)
    if type(jsonData) ~= "table" then
        ngx.say(cjson.encode({ data = {} }))
        return
    end
    if jsonData.secrets then
        for sIdx, secret in ipairs(jsonData.secrets) do
            jsonData.secrets[sIdx].value = Base64.decode(jsonData.secrets[sIdx].value)
        end
    end
    ngx.say(cjson.encode({ data = jsonData }))
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
        key_name = "instance_name",
        search_fields = { "instance_name", "id" }
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

    -- Sort applied inside listPaginationLocal / listWithPagination.
    return ngx.say(cjson.encode({
        data = allServers,
        total = totalRecords
    }))
end

local function listInstance(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local jsonData = Repo.get("instances", envProfile, id)
    if type(jsonData) ~= "table" then
        ngx.say(cjson.encode({ data = {} }))
        return
    end
    if jsonData.secrets then
        for sIdx, secret in ipairs(jsonData.secrets) do
            jsonData.secrets[sIdx].value = Base64.decode(jsonData.secrets[sIdx].value)
        end
    end
    ngx.say(cjson.encode({ data = jsonData }))
end


-- Sync SSL side effects for a persisted server record.  Single
-- source of truth called from BOTH the interactive save path
-- (`createUpdateServer`, i.e. POST/PUT /api/servers) and the bulk
-- import path (`importProjects`, i.e. POST /api/projects/import).
--
-- Before this helper existed the SSL wire-up (create
-- data/ssl/<domain>.json + populate ngx.shared.ssl_domains +
-- trigger initial cert issuance) lived only inline in
-- createUpdateServer.  Any code path that wrote a server record
-- via a different route — most notably the beaconpulse bulk-import
-- workflow — silently left the ssl_enabled=true server without a
-- matching ssl config file, so auto-ssl denied the domain until
-- the next worker restart triggered ssl_init.reconcile_disk_ssl_configs.
-- `int.workstation.academy` was stuck on the self-signed fallback
-- cert for weeks because of this drift (2026-07-14).
--
-- The helper is idempotent: safe to call for a record that already
-- has the ssl config file (SslManager.store_ssl_config overwrites
-- with the current values).  Non-fatal — an SSL wire-up failure
-- MUST NOT block the save; it's logged as ERR and the record
-- persists.
local function syncServerSslConfig(server_name, payloads)
    if not server_name or server_name == "" then
        return
    end
    if payloads.ssl_enabled then
        local ssl_config = {
            ssl_enabled = true,
            ssl_email = payloads.ssl_email,
            ssl_auto_renew = payloads.ssl_auto_renew ~= false,   -- default true
            ssl_force_https = payloads.ssl_force_https ~= false, -- default true
            ssl_staging = payloads.ssl_staging ~= false          -- default true for safety
        }
        local ssl_ok, ssl_err = SslManager.store_ssl_config(server_name, ssl_config)
        if not ssl_ok then
            ngx.log(ngx.ERR, "syncServerSslConfig: failed to store SSL config for ",
                server_name, ": ", tostring(ssl_err))
        else
            ngx.log(ngx.INFO, "syncServerSslConfig: SSL configured + activated for ", server_name)
            -- Trigger initial ACME issuance in the background.  Idempotent —
            -- auto-ssl returns fast if a valid cert already exists.
            SslManager.trigger_certificate_issuance(server_name)
        end
    else
        local ssl_ok, ssl_err = SslManager.remove_ssl_config(server_name)
        if not ssl_ok then
            ngx.log(ngx.WARN, "syncServerSslConfig: failed to remove SSL config for ",
                server_name, ": ", tostring(ssl_err))
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

    -- Handle SSL certificate configuration if ssl_enabled is set.
    -- Delegates to syncServerSslConfig so this exact wire-up also
    -- fires from bulk-import paths (importProjects) — see
    -- syncServerSslConfig definition above.  Without that shared
    -- helper, imported records with ssl_enabled=true silently landed
    -- on disk without a matching data/ssl/*.json + shared-dict entry;
    -- auto-ssl then denied the domain until the next worker restart
    -- (`int.workstation.academy`, 2026-07-14).
    if not payloads.ssl_enabled then
        -- HTTPS-force is nonsense without a certificate.  Clear it
        -- BEFORE syncServerSslConfig so the persisted disk record
        -- doesn't hold a stale true from a prior save.
        payloads.ssl_force_https = false
    end
    syncServerSslConfig(payloads.server_name, payloads)

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

    local function unlink_and_delete_server(sid)
        local oldDomain = Repo.get("servers", envProfile, sid)
        if type(oldDomain) == "table" then
            oldServerName = oldDomain.server_name
            if oldDomain.rules ~= nil then
                deleteServerFromRules(oldDomain.rules, sid, envProfile)
            end
            if oldDomain.match_cases ~= nil and type(next(oldDomain.match_cases)) ~= nil then
                for _, matchCase in pairs(oldDomain.match_cases) do
                    deleteServerFromRules(matchCase.statement, sid, envProfile)
                end
            end
        end
        Repo.delete("servers", envProfile, sid)
    end
    if uuid ~= "" and uuid ~= nil then
        unlink_and_delete_server(uuid)
    elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            unlink_and_delete_server(payloads.ids.ids[value])
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
    users, totalRecords = listWithPagination("users", cursor, pageSize, pageNumber, qParams)
    -- Sort applied inside listPaginationLocal / listWithPagination.
    ngx.say(cjson.encode({
        data = users,
        total = totalRecords
    }))
    ngx.exit(ngx.HTTP_OK)
end

local function listUser(args, uuid)
    local user, err = Repo.get("users", nil, uuid)
    if type(user) == "table" then
        ngx.say(cjson.encode({
            data = user
        }))
        ngx.exit(ngx.HTTP_OK)
    end
    Errors.throwError(err or "user not found", ngx.HTTP_NOT_FOUND)
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
    local inserted, err = Repo.save("users", nil, getUuid, payloads, { skip_strip = true })
    if inserted then
        ngx.say(cjson.encode({
            data = payloads
        }))
        ngx.exit(ngx.HTTP_OK)
    end
    Errors.throwError(err or "failed to save user", ngx.HTTP_INTERNAL_SERVER_ERROR)
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
    if uuid ~= "" and uuid ~= nil then
        local del, err = Repo.delete("users", nil, uuid)
        if err then
            Errors.throwError(err, ngx.HTTP_INTERNAL_SERVER_ERROR)
        end
        restUsers = del
    elseif payloads and payloads.ids and #payloads.ids > 0 then
        for value = 1, #payloads.ids do
            restUsers = Repo.delete("users", nil, payloads.ids[value])
        end
    end
    ngx.say(cjson.encode({
        data = (type(restUsers) == "table" and restUsers or { restUsers })
    }))
    ngx.exit(ngx.HTTP_OK)
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
        key_name = "name",
        -- Rules are useful to find by name (typical), by id (uuid pasted
        -- from a server's match_cases), or by the path they match — e.g.
        -- searching `/api` finds every rule that targets the API.
        search_fields = { "name", "id", "match.rules.path" }
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
    -- Sort applied inside listPaginationLocal / listWithPagination.
    ngx.say({ cjson.encode({
        data = allRules,
        total = totalRecords
    }) })
end

local function listRule(args, uuid)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local exist_value = Repo.get("rules", envProfile, uuid)
    if type(exist_value) ~= "table" then
        Errors.throwError("Rule not found", ngx.HTTP_NOT_FOUND)
        return
    end
    if exist_value.match and exist_value.match.rules
        and exist_value.match.rules.jwt_token_validation_value ~= nil
        and exist_value.match.rules.jwt_token_validation_key ~= nil then
        exist_value.match.rules.jwt_token_validation_key =
            Base64.decode(exist_value.match.rules.jwt_token_validation_key)
    end
    ngx.say(cjson.encode({
        data = exist_value
    }))
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
        deleteRuleFromServer(uuid, envProfile)
        Repo.delete("rules", envProfile, uuid)
    elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            deleteRuleFromServer(payloads.ids.ids[value], envProfile)
            Repo.delete("rules", envProfile, payloads.ids.ids[value])
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
        Repo.delete("secrets", envProfile, uuid)
    elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            Repo.delete("secrets", envProfile, payloads.ids.ids[value])
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
        Repo.delete("instances", envProfile, uuid)
    elseif payloads and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            Repo.delete("instances", envProfile, payloads.ids.ids[value])
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
        local getDomain = Repo.get("servers", envProfile, json_val.id)
        if type(getDomain) == "table" and method == "create" then
            ngx.status = ngx.HTTP_CONFLICT
            formatResponse = {
                message = string.format(
                    "Server name %s is alredy exist either you need to delete that, or you can update the same record.",
                    json_val.server_name)
            }
            return formatResponse
        end
        if method == "update" and json_val.id ~= "host:" .. json_val.server_name then
            local previousDomain = Repo.get("servers", envProfile, "host:" .. json_val.server_name)
            if type(previousDomain) == "table" then
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
    local persist_ok, persist_err = Repo.save(folder_name, envProfile, uuid, json_val, {
        skip_strip = true,
        encode_sensitive = false,
    })
    if not persist_ok then
        ngx.log(ngx.ERR, "CreateUpdateRecord persist failed: ", tostring(persist_err))
        ngx.status = ngx.HTTP_INTERNAL_SERVER_ERROR
        return { message = "persist failed: " .. tostring(persist_err) }
    end
    if key_name == "servers" then
        local configString = Base64.decode(json_val.config)
        Helper.setDataToFile(filePathDir .. "/conf/" .. json_val.server_name .. ".conf", Helper.cleanString(configString),
            filePathDir .. "/conf", "conf")
        -- OpenResty routes per-request from data/servers/*.json (gateway_ack.lua).
        -- config_status is stored metadata for the admin UI only — no conf.d copy,
        -- nginx -t, or reload; those do not affect the Lua routing pipeline.
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
        key_name = "name",
        search_fields = { "name", "id", "category", "description" }
    }
    local pageSize = qParams.pagination.perPage
    local pageNumber = qParams.pagination.page
    if qParams.filter ~= nil and qParams.filter.profile_id ~= nil then
        environment = qParams.filter.profile_id
    end
    allRules, totalRecords = listFromDisk("waf_rules/" .. environment, pageSize, pageNumber, qParams)
    -- Sort applied inside listPaginationLocal / listWithPagination.
    ngx.say(cjson.encode({
        data = allRules,
        total = totalRecords
    }))
end

local function listWafRule(args, uuid)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local resultData = Repo.get("waf_rules", envProfile, uuid)
    if type(resultData) == "table" then
        ngx.say(cjson.encode({
            data = resultData
        }))
    else
        Errors.throwError("WAF rule not found", ngx.HTTP_NOT_FOUND)
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
        Repo.delete("waf_rules", envProfile, uuid)
    elseif payloads and payloads.ids and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            Repo.delete("waf_rules", envProfile, payloads.ids.ids[value])
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
        key_name = "name",
        search_fields = { "name", "id", "description" }
    }
    local pageSize = qParams.pagination.perPage
    local pageNumber = qParams.pagination.page
    if qParams.filter ~= nil and qParams.filter.profile_id ~= nil then
        environment = qParams.filter.profile_id
    end
    allPolicies, totalRecords = listFromDisk("waf_policies/" .. environment, pageSize, pageNumber, qParams)
    -- Sort applied inside listPaginationLocal / listWithPagination.
    ngx.say(cjson.encode({
        data = allPolicies,
        total = totalRecords
    }))
end

local function listWafPolicy(args, uuid)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local resultData = Repo.get("waf_policies", envProfile, uuid)
    if type(resultData) == "table" then
        ngx.say(cjson.encode({
            data = resultData
        }))
    else
        Errors.throwError("WAF policy not found", ngx.HTTP_NOT_FOUND)
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
        Repo.delete("waf_policies", envProfile, uuid)
    elseif payloads and payloads.ids and payloads.ids.ids and #payloads.ids.ids > 0 then
        for value = 1, #payloads.ids.ids do
            Repo.delete("waf_policies", envProfile, payloads.ids.ids[value])
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
        key_name = "name",
        search_fields = { "name", "id", "load_balancing_method" }
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

    -- Sort applied inside listPaginationLocal / listWithPagination.

    return ngx.say(cjson.encode({
        data = allUpstreams,
        total = totalRecords
    }))
end

local function listUpstream(args, id)
    local envProfile = args.envprofile ~= nil and args.envprofile or "prod"
    local upstream = Repo.get("upstreams", envProfile, id)
    if type(upstream) == "table" then
        ngx.say(cjson.encode({
            data = upstream
        }))
    else
        ngx.say(cjson.encode({ data = {} }))
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

    local scanned, scanErr = Repo.scan("upstreams", envProfile)
    if scanErr then
        ngx.log(ngx.WARN, "storage error reading upstreams: ", tostring(scanErr))
    end
    if scanned then
        for _, upstream in ipairs(scanned) do
            if upstream and upstream.enabled ~= false then
                table.insert(allUpstreams, upstream)
                ngx.log(ngx.INFO, "writeUpstreamConfigFile - Added upstream: ", upstream.name or "unknown")
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

    local del, err = Repo.delete("upstreams", envProfile, decodedUuid)
    if del then
        restUpstreams = { deleted = true, id = decodedUuid }
        ngx.log(ngx.INFO, "Successfully deleted upstream: ", decodedUuid)
    else
        ngx.log(ngx.WARN, "Failed to delete upstream: ", err or "not found")
        restUpstreams = { deleted = false, id = decodedUuid, error = err or "Upstream not found" }
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
    if settings.storage_type == "redis" and red then
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
    local settingsLogo = Repo.get("company_logo", nil, uuid)
    if type(settingsLogo) == "table" then
        ngx.say(cjson.encode({
            data = settingsLogo
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
    local saved = Repo.save("company_logo", nil, settingUUID, body, { skip_strip = true })
    if saved then
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
        local import_resource = args.dataType == "rules" and "rules" or args.dataType
        response = Repo.save(import_resource, value.profile_id, value.id, value, {
            skip_strip = true,
            encode_sensitive = false,
        })

        -- Bulk-import SSL wire-up.  Before this call, importing a
        -- server record with ssl_enabled=true silently landed on
        -- disk without a matching data/ssl/<domain>.json file — so
        -- ssl_init's allow_domain check denied the domain and the
        -- self-signed fallback cert was served for weeks.  Now the
        -- import fires the same side-effects the interactive
        -- POST/PUT /api/servers path does (see syncServerSslConfig).
        -- Only relevant for the 'servers' import type; rules /
        -- upstreams / etc don't carry SSL config.
        if args.dataType == "servers" and value.server_name then
            syncServerSslConfig(value.server_name, value)
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

-- ─────────────────────────────────────────────────────────────────────
-- POPs (Points of Presence) — HTTP wrappers
--
-- Pure HTTP-translation layer.  All validation, persistence, audit
-- and referential-integrity logic lives in api/pops.lua; these
-- functions translate between HTTP request shape and the module's
-- structured return contract.
--
-- Module returns `(value, err_table)` where `err_table.code` is one
-- of: validation_failed | not_found | conflict | io_error.  The
-- mapping below converts those to HTTP status codes once, in one
-- place, so every endpoint surfaces identical error semantics.
-- ─────────────────────────────────────────────────────────────────────

local function popErrorResponse(err)
    local status_for = {
        validation_failed = ngx.HTTP_BAD_REQUEST,
        not_found = ngx.HTTP_NOT_FOUND,
        conflict = ngx.HTTP_CONFLICT,
        io_error = ngx.HTTP_INTERNAL_SERVER_ERROR,
    }
    local status = status_for[err.code] or ngx.HTTP_INTERNAL_SERVER_ERROR
    ngx.status = status
    -- Envelope shape MUST match what the dashboard's parseBackendError
    -- expects: `{ error: { message, status, code, details? } }`.  A
    -- flat `{error: "code", message: ...}` body is parsed as raw text
    -- and rendered verbatim in the UI's error banners.
    ngx.say(cjson.encode({
        error = {
            message = err.message or "Unknown error",
            status = status,
            code = err.code or "internal_error",
            details = err.details,
        },
    }))
    return ngx.exit(status)
end

local function listPops(args)
    local params = {}
    -- Two query-arg conventions are in use across this API: a single
    -- `params=<json>` blob (used by the react-admin dataProvider) or
    -- individual `pagination[page]` style flat keys (used by curl /
    -- the Next.js admin's dataProvider).  Accept both so callers
    -- don't have to know which dialect this endpoint expects.
    if args.params and args.params ~= "" then
        local ok, decoded = pcall(cjson.decode, args.params)
        if ok and type(decoded) == "table" then params = decoded end
    else
        params = {
            pagination = {
                page = tonumber(args['pagination[page]']) or 1,
                perPage = tonumber(args['pagination[perPage]']) or 25,
            },
            sort = {
                field = args['sort[field]'] or 'id',
                order = args['sort[order]'] or 'ASC',
            },
            filter = {
                q = args['filter[q]'],
                status = args['filter[status]'],
                region = args['filter[region]'],
            },
        }
    end
    local records, total_or_err = Pops.list(params)
    if not records then
        return popErrorResponse(total_or_err)
    end
    ngx.say(cjson.encode({ data = records, total = total_or_err }))
end

local function listPop(args, uuid)
    local record, err = Pops.get(uuid)
    if not record then
        return popErrorResponse(err)
    end
    ngx.say(cjson.encode({ data = record }))
end

-- Shared create/update handler — matches the convention used by
-- every other resource in this file (createUpdateServer,
-- createUpdateUpstreams, etc.).  `uuid` nil = POST = create;
-- `uuid` set = PUT = update.
local function createUpdatePop(body, uuid)
    -- Helper.GetPayloads internally calls cjson.decode without a
    -- pcall — malformed JSON throws a Lua runtime error which would
    -- otherwise escape as a 500 with an HTML body, defeating our
    -- structured error envelope.  Wrap defensively so any parse
    -- failure surfaces as a 400 validation_failed instead.
    local ok, payload = pcall(Helper.GetPayloads, body)
    if not ok or not payload then
        return popErrorResponse({
            code = "validation_failed",
            message = "Failed to parse request payload",
            details = (not ok) and {parse_error = tostring(payload)} or nil,
        })
    end
    local user = ngx.req.get_headers()["x-user"] or "system"
    local record, err
    if uuid and uuid ~= "" and uuid ~= "pops" then
        record, err = Pops.update(uuid, payload, user)
    else
        record, err = Pops.create(payload, user)
    end
    if not record then
        return popErrorResponse(err)
    end
    ngx.say(cjson.encode({ data = record }))
end

-- DELETE supports an optional `?force=true` query param for
-- cascade-detach (strip the pop_id from every server that
-- references it before removing).  Default behaviour is to refuse
-- with 409 + a list of referencing servers so the operator can
-- review them first.
local function deletePop(args, uuid)
    if not uuid or uuid == "" or uuid == "pops" then
        return popErrorResponse({
            code = "validation_failed",
            message = "pop id is required in the URL",
        })
    end
    -- Force flag can arrive in three places:
    --   1. URL query string `?force=true`  (curl, direct API users)
    --   2. POST body field `force=true`    (form-encoded)
    --   3. Nested in `params` JSON blob   (react-admin dataProvider)
    -- handle_delete_request passes the POST args to us; the URI
    -- query args have to be read explicitly here.  Accept all three
    -- forms so the API behaves identically regardless of caller.
    local force = false
    local query_args = ngx.req.get_uri_args()
    if query_args.force == "true" or args.force == "true" or args.force == true then
        force = true
    elseif args.params then
        local ok, decoded = pcall(cjson.decode, args.params)
        if ok and type(decoded) == "table" and decoded.force then
            force = true
        end
    end
    local user = ngx.req.get_headers()["x-user"] or "system"
    local ok, err = Pops.delete(uuid, {force = force}, user)
    if not ok then
        return popErrorResponse(err)
    end
    ngx.say(cjson.encode({ data = {message = "POP deleted", id = uuid, forced = force} }))
end

-- ─────────────────────────────────────────────────────────────────────
-- DNS Manager — HTTP wrappers
--
-- Pure HTTP-translation layer for the Cloudflare provisioning module.
-- Domain logic lives in api/dns_manager.lua; these handlers translate
-- between request shape and the module's structured-error contract.
--
-- Status-code mapping covers a superset of the pops mapping: DNS adds
-- `zone_not_allowed` (403 — the managed_zones safety guard fired),
-- `not_configured` (503 — settings.json has no usable dns block),
-- `disabled` (503 — explicitly off), `network_error` (502 — couldn't
-- reach Cloudflare), `provider_error` (502 — Cloudflare returned
-- success:false), `rate_limited` (429 — retries exhausted).
-- ─────────────────────────────────────────────────────────────────────

local function dnsErrorResponse(err)
    local status_for = {
        validation_failed = ngx.HTTP_BAD_REQUEST,
        not_found = ngx.HTTP_NOT_FOUND,
        no_pops_assigned = ngx.HTTP_BAD_REQUEST,
        no_targets = ngx.HTTP_BAD_REQUEST,
        no_cname_target = ngx.HTTP_BAD_REQUEST,
        zone_not_allowed = ngx.HTTP_FORBIDDEN,
        zone_not_found = ngx.HTTP_NOT_FOUND,
        conflict = ngx.HTTP_CONFLICT,
        not_configured = ngx.HTTP_SERVICE_UNAVAILABLE,
        disabled = ngx.HTTP_SERVICE_UNAVAILABLE,
        network_error = ngx.HTTP_BAD_GATEWAY,
        provider_error = ngx.HTTP_BAD_GATEWAY,
        decode_error = ngx.HTTP_BAD_GATEWAY,
        rate_limited = 429,
        io_error = ngx.HTTP_INTERNAL_SERVER_ERROR,
    }
    local status = status_for[err.code] or ngx.HTTP_INTERNAL_SERVER_ERROR
    ngx.status = status
    -- Same envelope contract as popErrorResponse — the dashboard's
    -- parseBackendError reads `error.message` / `error.code` /
    -- `error.details` from this nested shape.  A flat top-level
    -- envelope is treated as opaque text and rendered raw.
    ngx.say(cjson.encode({
        error = {
            message = err.message or "Unknown error",
            status = status,
            code = err.code or "internal_error",
            details = err.details,
        },
    }))
    return ngx.exit(status)
end

-- GET /api/dns/lookup?domain=<fqdn>[&type=A]
-- Read-only inspection — returns the current Cloudflare records for
-- a domain, annotated with which ones wslproxy manages.  Used by the
-- "DNS State" panel on the server form and for ops debugging.
local function dnsLookup(args)
    local domain = args.domain
    if (not domain or domain == "") and args.params then
        local ok, decoded = pcall(cjson.decode, args.params)
        if ok and type(decoded) == "table" then
            domain = decoded.domain
        end
    end
    local result, err = DnsManager.lookup({
        domain = domain,
        type = args.type,
    })
    if not result then return dnsErrorResponse(err) end
    ngx.say(cjson.encode({ data = result }))
end

-- POST /api/dns/provision
-- Body: { server_id, profile_id, dry_run?, include_inactive?, record_type? }
-- Reads the server's pop_ids, resolves each to a POP IP, and
-- converges Cloudflare to match.  See dns_manager.provision_for_server
-- for the exact action-planning semantics.
local function dnsProvision(body)
    -- See note in createUpdatePop: Helper.GetPayloads will throw on
    -- malformed JSON; pcall keeps the failure inside our structured
    -- error envelope rather than bubbling up as a 500 HTML page.
    local ok, payload = pcall(Helper.GetPayloads, body)
    if not ok or not payload then
        return dnsErrorResponse({
            code = "validation_failed",
            message = "Failed to parse request payload",
            details = (not ok) and {parse_error = tostring(payload)} or nil,
        })
    end
    local user = ngx.req.get_headers()["x-user"] or "system"
    local result, err = DnsManager.provision_for_server({
        server_id = payload.server_id,
        profile_id = payload.profile_id,
        dry_run = payload.dry_run == true,
        include_inactive = payload.include_inactive == true,
        record_type = payload.record_type,
        user = user,
    })
    if not result then return dnsErrorResponse(err) end
    ngx.say(cjson.encode({ data = result }))
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

-- Official admin UIs allowed to mutate even when the instance is locked.
-- Add new official UIs here when they're introduced.
local ALLOWED_MUTATION_PLATFORMS = {
    ["react-admin"] = true,          -- Legacy React-Admin (Vite) UI
    ["openresty-admin-next"] = true, -- Modern Next.js UI
    ["openresty-admin-next-ssr"] = true, -- Next.js server-component SSR
}

-- Returns true if mutations are allowed for this request: either the
-- instance is unlocked globally, or the request came from a known
-- official admin UI identified via the x-platform header.
local function isMutationAllowed()
    if settings and settings.instance_locked == "false" then
        return true
    end
    return platform and ALLOWED_MUTATION_PLATFORMS[platform] == true
end

-- ============================================================================
-- WAF Test Lab — server-side request relay (POST /api/waf/test)
-- ============================================================================
-- The admin dashboard is a different origin from the tenant hosts, so a browser
-- there cannot read their WAF blocks (a 403 block page carries no CORS headers).
-- This endpoint fires ONE request at an allow-listed target from OpenResty and
-- returns the status + x-waf-* headers, letting the dashboard measure WAF
-- efficacy against any managed host or rule (POST included). Because it is a
-- server-side relay it is strictly guarded:
--   * only http/https, only hosts on the allow-list (settings.waf.test_targets),
--   * never a private/loopback/link-local/CGNAT/metadata address,
--   * bounded timeout and a truncated response body.
-- The allow-list is the hard SSRF boundary; the IP-range check is defence in depth.
local WAF_TEST_DEFAULT_TARGETS = {
    "https://payments-secure.fictionally.org",
    "https://payments-open.fictionally.org",
    "https://payments.fictionally.org",
}

local function waf_test_target_list()
    local w = (settings and settings.waf) or {}
    local list = w.test_targets or (settings and settings.waf_test_targets) or WAF_TEST_DEFAULT_TARGETS
    if type(list) ~= "table" or #list == 0 then list = WAF_TEST_DEFAULT_TARGETS end
    return list
end

local function waf_parse_target(url)
    if type(url) ~= "string" then return nil end
    local scheme, host, port = url:match("^(https?)://([^:/%?#]+):?(%d*)")
    if not scheme or not host or host == "" then return nil end
    port = (port ~= "" and tonumber(port)) or (scheme == "https" and 443 or 80)
    return { scheme = scheme, host = host:lower(), port = port }
end

-- Match a requested target against the allow-list by host; the scheme/port come
-- from the allow-list entry so they can't be swapped to reach something else.
local function waf_match_target(url)
    local want = waf_parse_target(url)
    if not want then return nil end
    for _, entry in ipairs(waf_test_target_list()) do
        local raw = (type(entry) == "table" and (entry.url or entry.target)) or entry
        local e = waf_parse_target(raw)
        if e and e.host == want.host then return e end
    end
    return nil
end

-- Block obvious SSRF targets: metadata/localhost names and private / loopback /
-- link-local / CGNAT / multicast IP literals (v4 and v6).
local function waf_host_blocked(host)
    host = tostring(host or ""):lower()
    local names = { localhost = true, ["ip6-localhost"] = true, metadata = true,
                    ["metadata.google.internal"] = true, ["instance-data"] = true }
    if names[host] then return true end
    local o1, o2 = host:match("^(%d+)%.(%d+)%.%d+%.%d+$")
    if o1 then
        o1, o2 = tonumber(o1), tonumber(o2)
        if o1 == 0 or o1 == 10 or o1 == 127 then return true end
        if o1 == 169 and o2 == 254 then return true end            -- link-local + cloud metadata
        if o1 == 172 and o2 >= 16 and o2 <= 31 then return true end
        if o1 == 192 and o2 == 168 then return true end
        if o1 == 100 and o2 >= 64 and o2 <= 127 then return true end -- CGNAT
        if o1 >= 224 then return true end                            -- multicast / reserved
    end
    if host == "::1" or host == "::" or host:match("^fe80:") or host:match("^fc") or host:match("^fd") then
        return true
    end
    return false
end

-- Keep the URL valid while letting the WAF's decoded args still see the payload:
-- percent-encode only whitespace and the few bytes that break a request target.
local function waf_encode_path(p)
    p = tostring(p or "/")
    if p == "" then p = "/" end
    if p:sub(1, 1) ~= "/" then p = "/" .. p end
    return (p:gsub("[%s\"<>\\%^`{|}]", function(c) return string.format("%%%02X", string.byte(c)) end))
end

local function waf_header_ci(headers, name)
    if type(headers) ~= "table" then return nil end
    name = name:lower()
    for k, v in pairs(headers) do
        if type(k) == "string" and k:lower() == name then
            if type(v) == "table" then return v[1] end
            return v
        end
    end
    return nil
end

local function waf_test_json(code, tbl)
    ngx.status = code
    ngx.header["Content-Type"] = "application/json"
    ngx.say(cjson.encode(tbl))
    ngx.exit(ngx.HTTP_OK)
end

local function handle_waf_test()
    ngx.req.read_body()
    local raw = ngx.req.get_body_data()
    local ok, req = pcall(cjson.decode, raw or "{}")
    if not ok or type(req) ~= "table" then
        waf_test_json(400, { ok = false, error = "Invalid JSON body" })
    end

    -- Guard rejections are expected outcomes the UI renders inline, so they come
    -- back as 200 {ok=false, error=...} rather than 4xx (which the client's
    -- apiFetch would throw on). Only a genuinely malformed body is a 400.
    local method = tostring(req.method or "GET"):upper()
    local ALLOWED = { GET = true, POST = true, PUT = true, DELETE = true,
                      HEAD = true, OPTIONS = true, PATCH = true }
    if not ALLOWED[method] then
        waf_test_json(200, { ok = false, error = "method not allowed: " .. method })
    end

    local entry = waf_match_target(req.target)
    if not entry then
        waf_test_json(200, { ok = false,
            error = "target host is not on the WAF test allow-list",
            allow_list = waf_test_target_list() })
    end
    if waf_host_blocked(entry.host) then
        waf_test_json(200, { ok = false, error = "target resolves to a blocked address range" })
    end

    local portpart = ((entry.port ~= 80 and entry.port ~= 443) and (":" .. entry.port)) or ""
    local url = entry.scheme .. "://" .. entry.host .. portpart .. waf_encode_path(req.path or "/")

    -- Pass caller headers through, minus hop-by-hop / framing headers the client
    -- must not control (Host/Content-Length/Connection are set by resty.http).
    local out_headers = {}
    if type(req.headers) == "table" then
        for k, v in pairs(req.headers) do
            local lk = tostring(k):lower()
            if lk ~= "host" and lk ~= "content-length" and lk ~= "connection"
                and lk ~= "transfer-encoding" and type(v) == "string" then
                out_headers[k] = v
            end
        end
    end
    if req.content_type and not waf_header_ci(out_headers, "content-type") then
        out_headers["Content-Type"] = tostring(req.content_type)
    end
    if not waf_header_ci(out_headers, "user-agent") then
        out_headers["User-Agent"] = "wslproxy-waf-testlab/1.0"
    end

    local http_ok, http = pcall(require, "resty.http")
    if not http_ok then
        waf_test_json(200, { ok = false, error = "resty.http unavailable on this node" })
    end
    local httpc = http.new()
    local timeout = tonumber(req.timeout_ms) or 10000
    if timeout < 1000 then timeout = 1000 elseif timeout > 20000 then timeout = 20000 end
    httpc:set_timeout(timeout)

    local t0 = ngx.now()
    local res, err = httpc:request_uri(url, {
        method = method,
        headers = out_headers,
        body = (type(req.body) == "string" and req.body) or nil,
        ssl_verify = false, -- test tool: we read WAF headers, not establish trust
    })
    local latency_ms = math.floor((ngx.now() - t0) * 1000 + 0.5)

    if not res then
        waf_test_json(200, { ok = false, error = "request failed: " .. tostring(err),
            target = entry.host, path = req.path, method = method, latency_ms = latency_ms })
    end

    local block = tostring(waf_header_ci(res.headers, "x-waf-block") or ""):lower() == "true"
    waf_test_json(200, {
        ok = true,
        status = res.status,
        blocked = (res.status == 403 and block),
        waf_block = block,
        waf_rule = waf_header_ci(res.headers, "x-waf-rule"),
        waf_violation = waf_header_ci(res.headers, "x-waf-violation"),
        support_id = waf_header_ci(res.headers, "x-support-id"),
        server = waf_header_ci(res.headers, "server"),
        content_type = waf_header_ci(res.headers, "content-type"),
        latency_ms = latency_ms,
        target = entry.host,
        scheme = entry.scheme,
        path = req.path,
        method = method,
        body_snippet = (res.body or ""):sub(1, 2000),
    })
end

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

    if path == "user/me" then
        userMe()
    end
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

    -- Public, unauthenticated bookmark surface.  The matching nginx
    -- access_by_lua_block exempts /api/public/bookmarks from JWT
    -- verification (GET-only).  Only bookmarks explicitly flagged
    -- `public: true` are returned, with sensitive fields stripped.
    if path == "public/bookmarks" then
        local bm_ok, Bookmarks = pcall(require, "bookmarks")
        if bm_ok then Bookmarks.list_public(args) end
    elseif uuid and #uuid > 0 and subPath[1] == "public" and subPath[2] == "bookmarks" then
        local bm_ok, Bookmarks = pcall(require, "bookmarks")
        if bm_ok then Bookmarks.get_public(args, uuid) end
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

    -- ── Log search (server-side grep) ────────────────────────────────
    -- GET /api/logs/search?kind=error|access&q=pattern
    --                    &regex=0|1&case=0|1&limit=N&max_bytes=N
    --
    -- Powers the full-screen log viewer in the admin.  Validates
    -- inputs + dispatches to Helper.searchLogFile which caps scan
    -- size and result count defensively.
    if path == "logs/search" then
        local args = ngx.req.get_uri_args()
        local kind = args.kind or "error"
        local logFile
        if kind == "error" then
            logFile = "/usr/local/openresty/nginx/logs/error.log"
        elseif kind == "access" then
            logFile = "/usr/local/openresty/nginx/logs/access.log"
        else
            ngx.status = ngx.HTTP_BAD_REQUEST
            ngx.say(cjson.encode({
                data = {
                    message = "kind must be 'error' or 'access'"
                }
            }))
            ngx.exit(ngx.HTTP_BAD_REQUEST)
        end

        local query = args.q or ""
        if #query > 512 then
            ngx.status = ngx.HTTP_BAD_REQUEST
            ngx.say(cjson.encode({
                data = {
                    message = "query too long (max 512 chars)"
                }
            }))
            ngx.exit(ngx.HTTP_BAD_REQUEST)
        end

        local result, status = Helper.searchLogFile(logFile, {
            query = query,
            regex = args.regex == "1" or args.regex == "true",
            case_sensitive = args.case == "1" or args.case == "true",
            limit = tonumber(args.limit),
            max_scan_bytes = tonumber(args.max_bytes),
        })

        if status ~= ngx.HTTP_OK then
            ngx.status = status
            ngx.say(cjson.encode({
                data = { message = tostring(result) }
            }))
            ngx.exit(status)
        end

        ngx.say(cjson.encode({ data = result }))
        ngx.exit(ngx.HTTP_OK)
    end

    -- ── Structured logs for dashboard ────────────────────────────────
    --
    -- BOUNDED tail-read only.  Previous implementation slurped the
    -- ENTIRE access.log into a Lua table per request (352 MB / 1.4 M
    -- lines on prod as of 2026-07-14), blocking every other request
    -- through the gateway under the single-worker prod topology
    -- (CLAUDE.md §15 #2).  Now uses Helper.readTailLines which caps
    -- the read at MAX_LOG_TAIL_BYTES bytes regardless of file size.
    --
    -- Trade-off: `total` is an ESTIMATE when the file is larger than
    -- the read window.  Frontend already treats `total` as
    -- informational.  The estimate is derived from file_size /
    -- avg_line_bytes so it tracks reality closely enough for the
    -- "showing N of ~M" display.
    if path == "logs/access" then
        local args = ngx.req.get_uri_args()
        local limit = math.min(tonumber(args.limit) or 200, 1000)
        local offset = tonumber(args.offset) or 0
        local logFile = "/usr/local/openresty/nginx/logs/access.log"

        -- Read enough bytes to comfortably serve `limit` lines even
        -- after filters knock out most of them.  200 lines * ~800
        -- avg bytes = 160 KB nominal; multiply by 25 for filter
        -- headroom + safety = 4 MB cap.  Hard cap so a huge limit
        -- can't turn this into a whole-file read.
        local MAX_LOG_TAIL_BYTES = 5 * 1024 * 1024
        local lines, file_size, truncated = Helper.readTailLines(logFile, MAX_LOG_TAIL_BYTES)
        -- Tag as an array so cjson always emits `[]` for an empty
        -- result — otherwise `{}` gets returned and the frontend's
        -- `.filter()` / `.map()` blow up.
        local entries = setmetatable({}, cjson.empty_array_mt)
        -- Estimate total: if truncated, extrapolate from what we
        -- read; if not, #lines IS the total.  Never lie about the
        -- shape (frontend just displays this).
        local total
        if truncated and #lines > 0 then
            local avg = math.max(1, math.floor(#(lines[1] or "") + 100))
            total = math.floor(file_size / avg)
        else
            total = #lines
        end
        if #lines > 0 then
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
                    -- Parse common / combined log format.
                    --
                    -- The original pattern was rigidly anchored to
                    --   <ip> - <user> [time] "<method> <uri> ..." <status> <bytes>
                    -- but the docker-dev nginx (and ingress-controller
                    -- variants) inject extra columns BEFORE the
                    -- `- - [time]` block — typically server_name,
                    -- request_id, or x-forwarded-for.  Anything in
                    -- there breaks the rigid pattern and the whole
                    -- entry is dropped → frontend shows
                    -- "57 total entries · 0 loaded" with an empty
                    -- table even though the access.log has data.
                    --
                    -- Lazy-match (`.-`) past the IP up to the first
                    -- `[timestamp]`, then continue.  Also relaxed the
                    -- "HTTP/x.x" tail so an unusual protocol string
                    -- doesn't fail the match.  Works against both the
                    -- canonical combined log format and the
                    -- server_name-prefixed dev variant.
                    local remote_addr, timestamp, method, uri, status, bytes =
                        line:match('^(%S+).-%[([^%]]+)%]%s+"(%S+)%s+(%S+)[^"]*"%s+(%d+)%s+(%d+)')
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
        local limit = math.min(tonumber(args.limit) or 200, 1000)
        local logFile = "/usr/local/openresty/nginx/logs/error.log"

        -- Same bounded tail-read as /logs/access.  error.log is
        -- typically much larger than access.log (1.9 GB / 6.2M lines
        -- on prod 2026-07-14) — before this cap the handler slurped
        -- the whole thing every request and hard-blocked the gateway.
        local MAX_LOG_TAIL_BYTES = 5 * 1024 * 1024
        local lines, file_size, truncated = Helper.readTailLines(logFile, MAX_LOG_TAIL_BYTES)
        -- Tag as an array so an empty result serializes as `[]` not
        -- `{}` — matches the `logs/access` handler above.
        local entries = setmetatable({}, cjson.empty_array_mt)
        local total
        if truncated and #lines > 0 then
            local avg = math.max(1, math.floor(#(lines[1] or "") + 100))
            total = math.floor(file_size / avg)
        else
            total = #lines
        end
        if #lines > 0 then
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

    -- POPs (Points of Presence)
    if path == "pops" then
        listPops(args)
    elseif uuid and subPath[1] == "pops" then
        listPop(args, uuid)
    end

    -- DNS Manager (Cloudflare).  Read-only inspection — returns the
    -- current Cloudflare records for a domain.  Matches both
    -- `/api/dns/lookup?domain=...` and the `params=` JSON envelope so
    -- both curl and the dashboard's dataProvider can call it.
    if path == "dns/lookup" then
        dnsLookup(args)
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
    -- WAF Test Lab: the allow-listed target hosts the dashboard may fire at.
    if path == "waf/test/targets" then
        waf_test_json(200, { targets = waf_test_target_list() })
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
    if path == "user/logout" then
        logout()
    end
    if path == "push-data" then
        local body = Helper.GetPayloads(args)
        PushData.sendData(body, Helper, configPath, Errors)
    end
    -- WAF Test Lab relay (read-only action; guarded by the target allow-list, so
    -- it sits outside the mutation gate and works from any admin UI/platform).
    if path == "waf/test" then
        handle_waf_test()
    end
    if isMutationAllowed() then
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
        -- POPs POST: exact-match dispatch.  POST is create-only here;
        -- updates go through PUT /api/pops/{id} via the PUT
        -- dispatcher's "^pops" string.find clause.
        if path == "pops" then
            createUpdatePop(args, nil)
        end
        -- DNS provisioning.  The action endpoint (not a CRUD on a
        -- resource) — body carries server_id + profile_id + flags.
        -- Reads each pop's IP, converges Cloudflare to a 1-A-per-pop
        -- record set.  See api/dns_manager.lua provision_for_server.
        if path == "dns/provision" then
            dnsProvision(args)
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
    if isMutationAllowed() then
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

        -- POPs PUT: forwards uuid (the URL segment) to the shared
        -- create/update handler so it takes the update path.  We
        -- anchor with "^pops" so unrelated paths like "shops/..."
        -- can't trip on a `find` substring match.  POST routes to a
        -- separate dispatch in handle_post_request (path == "pops").
        if string.find(path, "^pops") then
            createUpdatePop(args, uuid)
        end

        -- Bookmarks share a single create/update handler (the function
        -- looks up by id/host and replaces or appends).  Without this
        -- the admin form's PUT request would silently no-op — POST
        -- would still work for create, but edits to existing
        -- bookmarks (including flipping the `public` flag) would never
        -- reach disk.
        if string.find(path, "bookmarks") then
            local bm_ok, Bookmarks = pcall(require, "bookmarks")
            if bm_ok then Bookmarks.create_or_update(args) end
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
    if isMutationAllowed() then
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
        -- POPs DELETE: forwards uuid + the parsed query args (the
        -- wrapper reads `force` from either a flat query param or a
        -- nested params blob so the API behaves identically whether
        -- called via curl or via the react-admin dataProvider).
        if string.find(path, "^pops") and uuid then
            deletePop(args, uuid)
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
