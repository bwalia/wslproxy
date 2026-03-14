-- WAF Engine Module for WSLProxy
-- Inspects HTTP requests for malicious patterns (SQLi, XSS, Command Injection)
-- Called from gateway_ack.lua after server config is loaded
-- Fail-open: if WAF engine errors, request continues normally
--
-- Usage: local waf_result = WafEngine.inspect(server_config, profile_id)
--        if waf_result and waf_result.action == "block" then
--            WafEngine.block_request(policy, waf_result)
--        end

local _M = {}

local cjson = Cjson or require("cjson")
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
if configPath:sub(-1) ~= "/" then
    configPath = configPath .. "/"
end

-- Per-worker caches (persist across requests when lua_code_cache is ON)
local compiled_patterns = {}
local policy_cache = {}
local rule_cache = {}
local CACHE_TTL = 30 -- seconds

-- ============================================================================
-- PATTERN COMPILATION & MATCHING
-- ============================================================================

-- Get or compile a PCRE regex pattern (JIT compiled, cached per-worker)
local function get_compiled_pattern(pattern_str)
    local cached = compiled_patterns[pattern_str]
    if cached then
        return cached
    end
    local compiled, err = ngx.re.compile(pattern_str, "jois")
    if compiled then
        compiled_patterns[pattern_str] = compiled
    else
        ngx.log(ngx.WARN, "WAF: Failed to compile pattern: ", err, " pattern=", pattern_str)
    end
    return compiled, err
end

-- Inspect a single string value against a rule pattern
local function inspect_single(value, rule)
    if not value or value == "" then
        return false
    end
    if rule.pattern_type == "string" then
        return ngx.re.find(value, rule.pattern, "joi") ~= nil
    end
    -- Default: regex matching
    local compiled, compile_err = get_compiled_pattern(rule.pattern)
    if not compiled then
        return false
    end
    local from = ngx.re.find(value, compiled, "jois")
    return from ~= nil
end

-- Inspect a target (string or table of key-value pairs) against a rule
local function inspect_target(target_value, rule)
    if not target_value then
        return false, nil
    end
    if type(target_value) == "table" then
        for k, v in pairs(target_value) do
            if type(v) == "string" and inspect_single(v, rule) then
                return true, k
            elseif type(v) == "table" then
                -- Handle multi-value headers/args
                for _, sv in ipairs(v) do
                    if type(sv) == "string" and inspect_single(sv, rule) then
                        return true, k
                    end
                end
            end
        end
        return false, nil
    end
    return inspect_single(tostring(target_value), rule), nil
end

-- ============================================================================
-- DATA LOADING (disk-based with TTL cache)
-- ============================================================================

-- Read and parse a JSON file
local function read_json_file(path)
    local file, err = io.open(path, "rb")
    if not file then
        return nil, err
    end
    local content = file:read("*a")
    file:close()
    if not content or content == "" then
        return nil, "empty file"
    end
    local ok, data = pcall(cjson.decode, content)
    if not ok then
        return nil, "JSON decode error: " .. tostring(data)
    end
    return data
end

-- Load WAF policy for a server (cached with TTL)
function _M.load_policy(server_config, profile_id)
    local policy_id = server_config.waf_policy_id
    if not policy_id or policy_id == "" then
        return nil
    end

    local cache_key = profile_id .. ":" .. policy_id
    local cached = policy_cache[cache_key]
    if cached and cached.expires > ngx.time() then
        return cached.data
    end

    local path = configPath .. "data/waf_policies/" .. profile_id .. "/" .. policy_id .. ".json"
    local data, err = read_json_file(path)
    if not data then
        ngx.log(ngx.WARN, "WAF: Failed to load policy ", policy_id, ": ", err)
        return nil
    end

    policy_cache[cache_key] = { data = data, expires = ngx.time() + CACHE_TTL }
    return data
end

-- Load WAF rules referenced by a policy (cached with TTL)
function _M.load_rules(policy, profile_id)
    if not policy or not policy.waf_rules or #policy.waf_rules == 0 then
        return {}
    end

    local rules = {}
    for _, rule_id in ipairs(policy.waf_rules) do
        local cache_key = profile_id .. ":" .. rule_id
        local cached = rule_cache[cache_key]
        if cached and cached.expires > ngx.time() then
            table.insert(rules, cached.data)
        else
            local path = configPath .. "data/waf_rules/" .. profile_id .. "/" .. rule_id .. ".json"
            local data, err = read_json_file(path)
            if data then
                rule_cache[cache_key] = { data = data, expires = ngx.time() + CACHE_TTL }
                table.insert(rules, data)
            else
                ngx.log(ngx.WARN, "WAF: Failed to load rule ", rule_id, ": ", err)
            end
        end
    end

    return rules
end

-- ============================================================================
-- REQUEST DATA EXTRACTION
-- ============================================================================

-- Extract inspection targets from the current request
local function get_request_data()
    return {
        url = ngx.var.request_uri or "",
        method = ngx.req.get_method() or "",
        headers = ngx.req.get_headers(100) or {},
        args = ngx.req.get_uri_args(100) or {},
        cookies = ngx.var.http_cookie or "",
        user_agent = ngx.var.http_user_agent or "",
        body = nil -- loaded lazily
    }
end

-- Load request body if body inspection is enabled (respects max size)
local function load_body(max_size)
    max_size = max_size or 1048576 -- 1MB default
    local ok, err = pcall(ngx.req.read_body)
    if not ok then
        ngx.log(ngx.WARN, "WAF: Failed to read body: ", err)
        return nil
    end
    local body = ngx.req.get_body_data()
    if not body then
        -- Body too large, may be written to temp file
        local file = ngx.req.get_body_file()
        if file then
            local f = io.open(file, "rb")
            if f then
                body = f:read(max_size)
                f:close()
            end
        end
    end
    if body and #body > max_size then
        body = body:sub(1, max_size)
    end
    return body
end

-- Resolve which request parts to inspect based on the rule's target field
local function resolve_targets(target, request_data)
    local targets = {}
    if target == "all" then
        targets.url = request_data.url
        targets.headers = request_data.headers
        targets.body = request_data.body
        targets.args = request_data.args
        targets.cookies = request_data.cookies
        targets.user_agent = request_data.user_agent
    elseif target == "url" then
        targets.url = request_data.url
        targets.args = request_data.args
    elseif target == "headers" then
        targets.headers = request_data.headers
    elseif target == "body" then
        targets.body = request_data.body
    elseif target == "args" then
        targets.args = request_data.args
    elseif target == "cookies" then
        targets.cookies = request_data.cookies
    elseif target == "user_agent" then
        targets.user_agent = request_data.user_agent
    else
        targets.url = request_data.url
    end
    return targets
end

-- ============================================================================
-- WHITELIST CHECK
-- ============================================================================

-- Check if the current request should bypass WAF inspection
local function is_whitelisted(policy, request_data)
    local wl = policy.whitelist
    if not wl then
        return false
    end

    -- Path whitelist
    if wl.paths and type(wl.paths) == "table" then
        local uri = ngx.var.uri or ""
        for _, path in ipairs(wl.paths) do
            if uri == path or uri:sub(1, #path) == path then
                return true
            end
        end
    end

    -- IP whitelist (simple prefix/exact match)
    if wl.ips and type(wl.ips) == "table" then
        local remote_addr = ngx.var.remote_addr or ""
        for _, ip_pattern in ipairs(wl.ips) do
            if remote_addr == ip_pattern then
                return true
            end
            -- CIDR-like prefix match (e.g. "10.0.0.0/8" → check "10.")
            local prefix = ip_pattern:match("^([%d%.]+)/")
            if prefix then
                local parts = {}
                for part in prefix:gmatch("(%d+)") do
                    table.insert(parts, part)
                end
                local mask = tonumber(ip_pattern:match("/(%d+)$")) or 32
                local check_prefix = ""
                if mask <= 8 then
                    check_prefix = parts[1] .. "."
                elseif mask <= 16 then
                    check_prefix = parts[1] .. "." .. (parts[2] or "0") .. "."
                elseif mask <= 24 then
                    check_prefix = parts[1] .. "." .. (parts[2] or "0") .. "." .. (parts[3] or "0") .. "."
                end
                if check_prefix ~= "" and remote_addr:sub(1, #check_prefix) == check_prefix then
                    return true
                end
            end
        end
    end

    -- User-agent whitelist
    if wl.user_agents and type(wl.user_agents) == "table" then
        local ua = request_data.user_agent or ""
        for _, ua_pattern in ipairs(wl.user_agents) do
            if ua:find(ua_pattern, 1, true) then
                return true
            end
        end
    end

    return false
end

-- ============================================================================
-- EVENT RECORDING (Prometheus + shared dict)
-- ============================================================================

-- Record a WAF event for metrics and the events API
function _M.record_event(event_type, rule, server_config, request_data)
    -- Prometheus metrics
    local metrics_ok, metrics = pcall(require, "prometheus_metrics")
    if metrics_ok and metrics.is_initialized() then
        local host = (server_config and server_config.server_name) or ngx.var.host or "unknown"
        local category = (rule and rule.category) or "unknown"
        local severity = (rule and rule.severity) or "unknown"

        if event_type == "blocked" or event_type == "blocked_anomaly" then
            local m = metrics.get_metric_waf_blocked()
            if m then m:inc(1, { host, category, severity }) end
        else
            local m = metrics.get_metric_waf_monitored()
            if m then m:inc(1, { host, category, severity }) end
        end

        local total = metrics.get_metric_waf_inspections()
        if total then total:inc(1, { host }) end
    end

    -- Store event in shared dict for recent events API
    local waf_events = ngx.shared.waf_events
    if waf_events then
        local event = cjson.encode({
            timestamp = ngx.time(),
            type = event_type,
            host = (server_config and server_config.server_name) or ngx.var.host or "unknown",
            rule_id = (rule and rule.id) or "anomaly",
            rule_name = (rule and rule.name) or "Anomaly Score Exceeded",
            category = (rule and rule.category) or "anomaly",
            severity = (rule and rule.severity) or "high",
            client_ip = ngx.var.remote_addr or "",
            uri = ngx.var.request_uri or "",
            method = ngx.req.get_method() or ""
        })
        local key = ngx.time() .. ":" .. math.random(100000)
        waf_events:set(key, event, 3600) -- 1 hour TTL
    end
end

-- ============================================================================
-- MAIN INSPECTION
-- ============================================================================

-- Internal implementation (may throw errors)
function _M._inspect_impl(server_config, profile_id)
    if not server_config.waf_enabled or not server_config.waf_policy_id then
        return nil
    end

    local policy = _M.load_policy(server_config, profile_id)
    if not policy or not policy.enabled then
        return nil
    end

    -- Apply per-Virtual Server mode override (does not mutate cached policy)
    local effective_mode = policy.mode
    if server_config.waf_mode_override and server_config.waf_mode_override ~= "" then
        effective_mode = server_config.waf_mode_override
    end

    local request_data = get_request_data()

    if is_whitelisted(policy, request_data) then
        return nil
    end

    local rules = _M.load_rules(policy, profile_id)
    if not rules or #rules == 0 then
        return nil
    end

    -- Load body if enabled in policy
    if policy.body_inspection ~= false then
        request_data.body = load_body(policy.max_body_size or 1048576)
    end

    local total_score = 0
    local matched_rules = {}

    for _, rule in ipairs(rules) do
        if rule.enabled then
            local targets = resolve_targets(rule.target, request_data)
            for target_name, target_value in pairs(targets) do
                local matched, detail = inspect_target(target_value, rule)
                if matched then
                    total_score = total_score + (rule.score or 0)
                    table.insert(matched_rules, {
                        rule_id = rule.id,
                        rule_name = rule.name,
                        category = rule.category,
                        severity = rule.severity,
                        action = rule.action,
                        target = target_name,
                        detail = detail
                    })

                    -- Immediate block for "block" action rules in "block" effective mode
                    if rule.action == "block" and effective_mode == "block" then
                        _M.record_event("blocked", rule, server_config, request_data)
                        return {
                            action = "block",
                            rule = rule,
                            matched_rules = matched_rules,
                            score = total_score
                        }
                    end
                    break -- one match per rule is enough, move to next rule
                end
            end
        end
    end

    -- Anomaly score threshold check
    if #matched_rules > 0 and total_score >= (policy.anomaly_threshold or 5) and effective_mode == "block" then
        _M.record_event("blocked_anomaly", matched_rules[1], server_config, request_data)
        return {
            action = "block",
            matched_rules = matched_rules,
            score = total_score
        }
    end

    -- Monitor mode: log but don't block
    if #matched_rules > 0 then
        for _, mr in ipairs(matched_rules) do
            _M.record_event("monitored", {
                id = mr.rule_id,
                name = mr.rule_name,
                category = mr.category,
                severity = mr.severity
            }, server_config, request_data)
        end
    end

    return nil -- allow request
end

-- Main entry point: inspect request (fail-open wrapper)
function _M.inspect(server_config, profile_id)
    local start_time = ngx.now()
    local ok, result = pcall(_M._inspect_impl, server_config, profile_id)
    local duration = ngx.now() - start_time

    -- Record inspection latency
    local metrics_ok, metrics = pcall(require, "prometheus_metrics")
    if metrics_ok and metrics.is_initialized() then
        local host = (server_config and server_config.server_name) or ngx.var.host or "unknown"
        local latency = metrics.get_metric_waf_latency()
        if latency then latency:observe(duration, { host }) end
    end

    if not ok then
        ngx.log(ngx.ERR, "WAF: Engine error (fail-open): ", tostring(result))
        -- Record error metric
        if metrics_ok and metrics.is_initialized() then
            local host = (server_config and server_config.server_name) or ngx.var.host or "unknown"
            local err_metric = metrics.get_metric_waf_errors()
            if err_metric then err_metric:inc(1, { host, "engine_error" }) end
        end
        return nil -- fail-open: allow request
    end

    return result
end

-- ============================================================================
-- BLOCK PAGE
-- ============================================================================

_M.DEFAULT_BLOCK_PAGE = [[<!DOCTYPE html>
<html>
<head><title>403 Forbidden - Request Blocked</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; text-align: center; padding: 50px; background: #f8f9fa; color: #333; }
  .container { max-width: 600px; margin: 0 auto; background: #fff; border-radius: 12px; padding: 48px; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  h1 { color: #dc3545; font-size: 28px; margin-bottom: 16px; }
  p { color: #6c757d; font-size: 16px; line-height: 1.6; }
  .shield { font-size: 64px; margin-bottom: 16px; }
  .ref { font-size: 12px; color: #adb5bd; margin-top: 32px; border-top: 1px solid #e9ecef; padding-top: 16px; }
</style>
</head>
<body>
<div class="container">
  <div class="shield">&#128737;</div>
  <h1>403 Forbidden</h1>
  <p>Your request has been blocked by the Web Application Firewall.</p>
  <p>If you believe this is an error, please contact the site administrator.</p>
  <div class="ref">Protected by WSLProxy WAF</div>
</div>
</body>
</html>]]

-- Serve custom 403 block page
function _M.block_request(policy, matched_result)
    local response = policy and policy.blocked_response or {}
    local status_code = response.status_code or 403
    local content_type = response.content_type or "text/html"
    local body_b64 = response.body_base64

    ngx.status = status_code
    ngx.header["Content-Type"] = content_type
    ngx.header["X-WAF-Block"] = "true"
    if matched_result and matched_result.rule then
        ngx.header["X-WAF-Rule"] = matched_result.rule.id or "unknown"
    end

    if body_b64 then
        local decode_ok, decoded = pcall(Base64.decode, body_b64)
        if decode_ok and decoded then
            ngx.say(decoded)
        else
            ngx.say(_M.DEFAULT_BLOCK_PAGE)
        end
    else
        ngx.say(_M.DEFAULT_BLOCK_PAGE)
    end

    return ngx.exit(status_code)
end

return _M
