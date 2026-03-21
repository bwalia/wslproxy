-- rule_matcher.lua
-- Evaluate a single rule's conditions against the current request.
-- Returns a result struct with pass/fail per condition and specificity scoring.

local M = {}

local Helper = require("helpers")
local RuleAuth = require("rule_auth")

-- ─── String helpers (match existing gateway_ack.lua behavior) ───────────────

-- These are set on the string metatable by gateway_ack.lua / shared code.
-- Ensure they exist here too for standalone use.
if not string.startswith then
    string.startswith = function(self, str)
        return self:find('^' .. str) ~= nil
    end
end

if not string.endswith then
    function string:endswith(suffix)
        return self:sub(-#suffix) == suffix
    end
end

local function is_empty(s)
    return s == nil or s == '' or type(s) == "userdata"
end

local function trim(s)
    return (s:gsub("^%s*(.-)%s*$", "%1"))
end

-- ─── Path matching ──────────────────────────────────────────────────────────

--- Evaluate path condition.
--- Returns {pass=bool, specificity=number, path_key=string}
---
--- Specificity scoring:
---   equals:      path_length + 1000  (most specific)
---   ends_with:   path_length + 500
---   starts_with: path_length         (catch-all "/" = 1)
---   no path:     0 (always passes)
local function match_path(rule_path, path_key, request_uri)
    -- No path configured → always matches (specificity 0)
    if is_empty(rule_path) then
        return { pass = true, specificity = 0, path_key = path_key or "none" }
    end

    local path = trim(rule_path)
    local pass = false

    if path_key == "starts_with" then
        pass = request_uri:startswith(path)
        return { pass = pass, specificity = #path, path_key = path_key }
    elseif path_key == "ends_with" then
        pass = request_uri:endswith(path)
        return { pass = pass, specificity = #path + 500, path_key = path_key }
    elseif path_key == "equals" then
        pass = (path == request_uri)
        return { pass = pass, specificity = #path + 1000, path_key = path_key }
    end

    -- Unknown path_key → fail
    return { pass = false, specificity = 0, path_key = path_key or "unknown" }
end

-- ─── Client IP matching ─────────────────────────────────────────────────────

--- Evaluate client IP condition.
--- Returns {pass=bool}
local function match_client_ip(rules, hostname, settings)
    local client_ip_key = rules.client_ip_key
    local client_ip = rules.client_ip

    -- No IP restriction configured → pass
    if is_empty(client_ip) then
        return { pass = true }
    end

    local req_addr = ngx.var.remote_addr
    ngx.header["X-Origin-IP"] = req_addr

    -- IP from header override
    if client_ip_key == "ipheader" then
        req_addr = ngx.req.get_headers()[client_ip]
        return { pass = true }  -- ipheader mode just sets the IP, doesn't filter
    end

    -- DTAP testing override: use test IPs for specific countries
    local is_dtap = hostname and (
        hostname:find("localhost") or hostname:find("dev") or
        hostname:find("int") or hostname:find("test")
    )
    if is_dtap and rules.country and client_ip then
        local test_ips = {
            BE = "104.155.127.255", EU = "104.155.127.255",
            IN = "117.245.73.99", AU = "1.44.255.255",
            GB = "103.219.168.255", TH = "101.109.255.255",
        }
        req_addr = test_ips[rules.country] or req_addr
    end

    -- Store resolved IP for country lookup
    ngx.ctx._resolved_ip = req_addr

    -- Match
    if client_ip_key == "starts_with" then
        return { pass = req_addr:startswith(client_ip) }
    elseif client_ip_key == "equals" then
        return { pass = (req_addr == client_ip) }
    end

    return { pass = false }
end

-- ─── Country matching ───────────────────────────────────────────────────────

--- Evaluate country condition.
--- Returns {pass=bool}
local function match_country(rules, settings)
    local rule_country = rules.country
    local country_key = rules.country_key

    -- No country restriction configured → pass
    if is_empty(rule_country) then
        return { pass = true }
    end

    -- Resolve country from IP
    local req_addr = ngx.ctx._resolved_ip or ngx.var.remote_addr
    local ip2loc_path = settings.ip2location_path or "/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN"
    local ip2loc = IP2location:new(ip2loc_path)
    local result = ip2loc:get_all(req_addr)
    local country = result.country_short or ""

    if country_key == "not_equals" then
        if rule_country == "EU" then
            return { pass = not Helper.isEU(country) }
        end
        return { pass = (rule_country ~= country) }
    elseif rule_country == "EU" then
        return { pass = Helper.isEU(country) }
    elseif country_key == "equals" then
        return { pass = (rule_country == country) }
    end

    return { pass = false }
end

-- ─── Token / auth matching ──────────────────────────────────────────────────

--- Evaluate token/auth condition.
--- Returns {pass=bool}
local function match_token(rules)
    return { pass = RuleAuth.authenticate(rules) }
end

-- ─── Main evaluation ────────────────────────────────────────────────────────

--- Evaluate a rule against the current request.
---
--- @param loaded_rule   table  {rule_data=table, condition_mode=string} from rule_loader
--- @param hostname      string Request hostname
--- @param settings      table  Settings object
--- @return table  Evaluation result:
---   {
---     rule_id        = string,
---     priority       = number,
---     condition_mode = "and"|"or",
---     conditions     = { path={pass,specificity}, ip={pass}, country={pass}, token={pass} },
---     all_pass       = bool,
---     any_pass       = bool,
---     path_specificity = number,
---     condition_count  = number,
---     rule_response  = table,   -- the match.response object for gateway_resp
---     rule_match     = table,   -- the match.rules object (with auth fields)
---   }
function M.evaluate(loaded_rule, hostname, settings)
    local rule_data = loaded_rule.rule_data
    local rules = rule_data.match.rules
    local response = rule_data.match.response
    local request_uri = ngx.var.request_uri

    -- Evaluate each condition
    local path_result = match_path(rules.path, rules.path_key, request_uri)
    local ip_result = match_client_ip(rules, hostname, settings)
    local country_result = match_country(rules, settings)
    local token_result = match_token(rules)

    local all_pass = path_result.pass and ip_result.pass and country_result.pass and token_result.pass
    local any_pass = path_result.pass or ip_result.pass or country_result.pass or token_result.pass

    -- Count non-trivial conditions (those that actually filter)
    local condition_count = 0
    if not is_empty(rules.path) then condition_count = condition_count + 1 end
    if not is_empty(rules.client_ip) then condition_count = condition_count + 1 end
    if not is_empty(rules.country) then condition_count = condition_count + 1 end
    if not is_empty(rules.jwt_token_validation_key) then condition_count = condition_count + 1 end

    -- Build the rule_data object that gateway_resp.lua expects
    -- This preserves the existing contract
    local enriched_rules = {}
    for k, v in pairs(rules) do
        enriched_rules[k] = v
    end
    enriched_rules.isConsul = response.is_consul
    enriched_rules.consulDomainName = response.consul_domain_name
    enriched_rules.strip_path = response.strip_path
    enriched_rules.auto_redirect_https = response.auto_redirect_https or false
    enriched_rules.id = rule_data.id
    enriched_rules.response = response

    return {
        rule_id = rule_data.id,
        rule_name = rule_data.name,
        priority = rule_data.priority or 0,
        condition_mode = loaded_rule.condition_mode,
        conditions = {
            path = path_result,
            ip = ip_result,
            country = country_result,
            token = token_result,
        },
        all_pass = all_pass,
        any_pass = any_pass,
        path_specificity = path_result.specificity,
        condition_count = condition_count,
        -- Data needed by downstream (gateway_resp.lua)
        status_code = response.code,
        message = response.message,
        redirect_uri = response.redirect_uri,
        rule_response = response,
        rule_match = enriched_rules,
    }
end

return M
