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
local policy_cache = {}
local rule_cache = {}
local CACHE_TTL = 30 -- seconds

-- ============================================================================
-- PATTERN MATCHING
-- ============================================================================

-- Inspect a single string value against a rule pattern.
-- ngx.re has no compile() step: the "o" flag tells OpenResty to compile the
-- pattern once and cache the compiled form per-worker, so passing the pattern
-- string directly to ngx.re.find is both correct and JIT-cached.
local function inspect_single(value, rule)
    if not value or value == "" then
        return false
    end
    if rule.pattern_type == "string" then
        return ngx.re.find(value, rule.pattern, "joi") ~= nil
    end
    -- Default: regex matching (j=JIT, o=compile-once/cache, i=case-insensitive, s=dotall)
    local from, _, err = ngx.re.find(value, rule.pattern, "jois")
    if err then
        ngx.log(ngx.WARN, "WAF: regex error for rule ", tostring(rule.id), ": ", err)
        return false
    end
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
-- BINDING PRECEDENCE & SIGNATURE GOVERNANCE (WAF v2)
-- ============================================================================

-- Lazy loads for the optional v2 modules; nil if absent (fail-open).
local function support_mod() local ok, m = pcall(require, "waf_support"); return ok and m or nil end
local function stages_mod() local ok, m = pcall(require, "waf_stages"); return ok and m or nil end

-- Normalize an F5-style enforcementMode alias to the internal block/monitor.
local function norm_mode(m, fallback)
    if m == "blocking" then return "block" end
    if m == "transparent" then return "monitor" end
    return m or fallback
end

-- Resolve the effective enforcement mode with binding precedence:
--   route override > per-server override > policy default.
-- Returns (mode, binding_label). Longest matching route path wins.
local function resolve_mode(policy, server_config, ctx)
    local mode = norm_mode(policy.enforcementMode, policy.mode or "monitor")
    local binding = "domain"
    if server_config.waf_mode_override and server_config.waf_mode_override ~= "" then
        mode = server_config.waf_mode_override
        binding = "server"
    end
    if policy.routeOverrides then
        local best = -1
        for _, ro in ipairs(policy.routeOverrides) do
            local p = ro.path or "/"
            local method_ok = true
            if ro.methods then
                method_ok = false
                for _, mm in ipairs(ro.methods) do
                    if mm == "*" or mm == ctx.method then method_ok = true break end
                end
            end
            if method_ok and ctx.path:sub(1, #p) == p and #p > best then
                best = #p
                mode = norm_mode(ro.enforcementMode, ro.mode or mode)
                binding = "route:" .. p
            end
        end
    end
    return mode, binding
end

-- Is a staged value still in its staging window (→ alarm-only)?
-- true means indefinitely staged; an ISO-8601 string stages until that instant.
local function staged_active(v)
    if v == true then return true end
    if type(v) == "string" then
        local y, mo, d, h, mi, s = v:match("(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
        if y then
            return ngx.time() < os.time({ year = y, month = mo, day = d, hour = h, min = mi, sec = s })
        end
        return true
    end
    return false
end

-- Build governance lookups from the policy: disabled ids, staged ids, and the
-- per-signature-set block toggle. Absence of a key means "default on".
local function governance(policy)
    local disabled, staged, set_block = {}, {}, nil
    local sig = policy.signatures
    if sig then
        for _, id in ipairs(sig.disable or {}) do disabled[id] = true end
        for _, s in ipairs(sig.stage or {}) do staged[s.id] = s["until"] or s.until_field or true end
    end
    if policy.signatureSets then
        set_block = {}
        for _, s in ipairs(policy.signatureSets) do set_block[s.id] = (s.block ~= false) end
    end
    return disabled, staged, set_block
end

local function rule_set_id(rule)
    return rule.signature_set or ("SET_" .. tostring(rule.category or "misc"):upper())
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

    local support = support_mod()
    local stages = stages_mod()

    local request_data = get_request_data()
    if is_whitelisted(policy, request_data) then
        return nil
    end

    -- Load body up front: both the JSON profile stage and body signatures need it.
    if policy.body_inspection ~= false then
        request_data.body = load_body(policy.max_body_size or 1048576)
    end

    local ctx = {
        method = request_data.method,
        path = ngx.var.uri or "",
        url = request_data.url,
        headers = request_data.headers,
        args = request_data.args,
        body = request_data.body,
        ip = ngx.var.remote_addr or "",
    }

    local effective_mode, binding = resolve_mode(policy, server_config, ctx)
    local service = server_config.waf_service or policy.service

    -- Turn a finding into either a block result or a logged alarm (transparent
    -- mode, or a staged signature). Returns a block result table, or nil.
    local function decide(f, staged)
        local block = (effective_mode == "block") and not staged
        local action = block and "block" or "alarm"
        local sid = support and support.support_id() or nil
        local rec = support and support.finding({
            support_id = sid, stage = f.stage, action = action, code = f.code,
            sig_id = f.sig_id, sig_set = f.sig_set, category = f.category,
            severity = f.severity, target = f.target, detail = f.detail,
            policy = policy.name, service = service, binding = binding,
        }) or nil
        if support and rec then support.log_security(server_config, rec, nil) end
        _M.record_event(block and "blocked" or "monitored",
            { id = f.sig_id or f.code, name = f.detail, category = f.category, severity = f.severity },
            server_config, request_data)
        if block then
            return { action = "block", support_id = sid, finding = rec,
                     rule = { id = f.sig_id or f.code, category = f.category, severity = f.severity } }
        end
        return nil
    end

    -- Stage 1..N: positive-security / protocol / API checks before signatures.
    if stages then
        for _, stage in ipairs(stages.PIPELINE) do
            local ok, finding = pcall(stage.fn, policy, ctx)
            if ok and finding then
                local res = decide({
                    stage = finding.stage, code = finding.code, sig_id = finding.code,
                    category = finding.category, severity = finding.severity,
                    target = finding.target, detail = finding.detail,
                }, false)
                if res then return res end
            elseif not ok then
                ngx.log(ngx.WARN, "WAF: stage ", stage.name, " error (skipped): ", tostring(finding))
            end
        end
    end

    -- Stage N+1: attack-signature matching with set/disable/stage governance.
    local rules = _M.load_rules(policy, profile_id)
    if rules and #rules > 0 then
        local disabled, staged, set_block = governance(policy)
        local total_score = 0
        local matched_rules = {}
        for _, rule in ipairs(rules) do
            if rule.enabled and not disabled[rule.id] then
                local set_id = rule_set_id(rule)
                local set_blocks = true
                if set_block and set_block[set_id] ~= nil then set_blocks = set_block[set_id] end
                local targets = resolve_targets(rule.target, request_data)
                for target_name, target_value in pairs(targets) do
                    local matched = inspect_target(target_value, rule)
                    if matched then
                        local is_staged = staged_active(staged[rule.id]) or (not set_blocks)
                        -- Staged / set-disabled signatures alarm only; they must
                        -- not contribute to the blocking anomaly score.
                        if not is_staged then
                            total_score = total_score + (rule.score or 0)
                        end
                        matched_rules[#matched_rules + 1] = {
                            rule_id = rule.id, category = rule.category, severity = rule.severity,
                        }
                        local f = {
                            stage = "signature", code = "VIOL_ATTACK_SIGNATURE", sig_id = rule.id,
                            sig_set = set_id, category = rule.category, severity = rule.severity,
                            target = target_name, detail = rule.name,
                        }
                        if rule.action == "block" then
                            local res = decide(f, is_staged)
                            if res then
                                res.rule = rule
                                res.score = total_score
                                res.matched_rules = matched_rules
                                return res
                            end
                        else
                            decide(f, true) -- alarm-only rule: always log, never block
                        end
                        break -- one match per rule
                    end
                end
            end
        end

        -- Anomaly score threshold (independent of any single block-action rule).
        if #matched_rules > 0 and total_score >= (policy.anomaly_threshold or 5)
            and effective_mode == "block" then
            local res = decide({
                stage = "anomaly", code = "VIOL_ANOMALY_SCORE", category = "anomaly",
                severity = "high", target = "all",
                detail = "anomaly score " .. total_score .. " >= " .. (policy.anomaly_threshold or 5),
            }, false)
            if res then
                res.matched_rules = matched_rules
                res.score = total_score
                return res
            end
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
    local support_id = matched_result and matched_result.support_id
    if matched_result and matched_result.rule then
        ngx.header["X-WAF-Rule"] = matched_result.rule.id or "unknown"
    end
    if matched_result and matched_result.finding then
        ngx.header["X-WAF-Violation"] = matched_result.finding.code or "unknown"
    end
    if support_id then
        -- Echo the correlation id so a user can quote it in a support request.
        ngx.header["X-Support-ID"] = support_id
    end

    local page
    if body_b64 then
        local decode_ok, decoded = pcall(Base64.decode, body_b64)
        page = (decode_ok and decoded) or _M.DEFAULT_BLOCK_PAGE
    else
        page = _M.DEFAULT_BLOCK_PAGE
    end
    -- Surface the support id inside the page too (replace a {{support_id}}
    -- placeholder if present, else append a small reference line).
    if support_id then
        if page:find("{{support_id}}", 1, true) then
            page = page:gsub("{{support_id}}", support_id)
        else
            page = page:gsub("</body>", '<div style="font:12px monospace;color:#8a93a8;margin-top:16px">Support ID: '
                .. support_id .. "</div></body>", 1)
        end
    end
    ngx.say(page)

    return ngx.exit(status_code)
end

return _M
