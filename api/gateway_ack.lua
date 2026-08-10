-- gateway_ack.lua
-- Router for the API Gateway and CDN Frontend domains
-- v2 — Clean rewrite: thin orchestrator delegating to rule_loader, rule_matcher, rule_selector
--
-- Original: 2020/09/04 by Balinder Walia
-- Rewrite: 2026/03/21 — decomposed into modules for reliability and testability

local cjson = Cjson
local Helper = require("helpers")
local RuleLoader = require("rule_loader")
local RuleMatcher = require("rule_matcher")
local RuleSelector = require("rule_selector")

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local hostname = ngx.var.host

-- ─── Default error pages (Base64 encoded) ───────────────────────────────────
-- Hardcoded last-resort fallbacks served only when settings.json is missing
-- or doesn't define nginx.default.<page_type>.  Settings.json wins when
-- present (see get_error_page below).  These three pages each carry a
-- "Powered by wslproxy" link to https://wslproxy.com/ — branding survives
-- even when the operator hasn't customised settings.json.
local DEFAULT_ERROR_PAGES = {
    -- Access denied (HTTP 403, rule didn't match or auth check failed)
    no_rule = "PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCxpbml0aWFsLXNjYWxlPTEiPgo8dGl0bGU+QWNjZXNzIGRlbmllZDwvdGl0bGU+CjxzdHlsZT4KYm9keSB7IGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICJTZWdvZSBVSSIsIFJvYm90bywgc2Fucy1zZXJpZjsgbWF4LXdpZHRoOiA2MDBweDsgbWFyZ2luOiA0ZW0gYXV0bzsgcGFkZGluZzogMmVtOyBjb2xvcjogIzFmMjkzNzsgbGluZS1oZWlnaHQ6IDEuNTsgfQpoMSB7IGZvbnQtc2l6ZTogMS43NWVtOyBjb2xvcjogI2I5MWMxYzsgbWFyZ2luOiAwIDAgMC41ZW07IH0KcCB7IG1hcmdpbjogMC43NWVtIDA7IH0KY29kZSB7IGJhY2tncm91bmQ6ICNmM2Y0ZjY7IHBhZGRpbmc6IDJweCA2cHg7IGJvcmRlci1yYWRpdXM6IDNweDsgZm9udC1zaXplOiAwLjllbTsgfQpzbWFsbCB7IGNvbG9yOiAjNmI3MjgwOyB9CnNtYWxsIGEgeyBjb2xvcjogIzYzNjZmMTsgdGV4dC1kZWNvcmF0aW9uOiBub25lOyB9CnNtYWxsIGE6aG92ZXIgeyB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTsgfQo8L3N0eWxlPgo8L2hlYWQ+Cjxib2R5Pgo8aDE+NDAzIC0gQWNjZXNzIGRlbmllZDwvaDE+CjxwPlRoaXMgZW5kcG9pbnQgcmVxdWlyZXMgYXV0aGVudGljYXRpb24uIFBsZWFzZSBwcm92aWRlIGEgdmFsaWQgQVBJIGtleSBpbiB0aGUgcmVxdWVzdC48L3A+CjxwPklmIHlvdSBhcmUgYSBkZXZlbG9wZXIgaW50ZWdyYXRpbmcgd2l0aCB0aGlzIEFQSSwgY2hlY2sgdGhlIGRvY3VtZW50YXRpb24gZm9yIHRoZSByZXF1aXJlZCA8Y29kZT54LWFwaS1rZXk8L2NvZGU+IGhlYWRlciBvciBhdXRoIGNvb2tpZS4gSWYgeW91IGJlbGlldmUgdGhpcyBpcyBhbiBlcnJvciwgY29udGFjdCB0aGUgc2VydmljZSBhZG1pbmlzdHJhdG9yLjwvcD4KPHA+PHNtYWxsPlBvd2VyZWQgYnkgPGEgaHJlZj0iaHR0cHM6Ly93c2xwcm94eS5jb20vIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+d3NscHJveHk8L2E+Ljwvc21hbGw+PC9wPgo8L2JvZHk+CjwvaHRtbD4=",
    -- Same Access denied page — falls through here when a server's
    -- config exists but no rule's match.rules clause accepted the request.
    conf_mismatch = "PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCxpbml0aWFsLXNjYWxlPTEiPgo8dGl0bGU+QWNjZXNzIGRlbmllZDwvdGl0bGU+CjxzdHlsZT4KYm9keSB7IGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICJTZWdvZSBVSSIsIFJvYm90bywgc2Fucy1zZXJpZjsgbWF4LXdpZHRoOiA2MDBweDsgbWFyZ2luOiA0ZW0gYXV0bzsgcGFkZGluZzogMmVtOyBjb2xvcjogIzFmMjkzNzsgbGluZS1oZWlnaHQ6IDEuNTsgfQpoMSB7IGZvbnQtc2l6ZTogMS43NWVtOyBjb2xvcjogI2I5MWMxYzsgbWFyZ2luOiAwIDAgMC41ZW07IH0KcCB7IG1hcmdpbjogMC43NWVtIDA7IH0KY29kZSB7IGJhY2tncm91bmQ6ICNmM2Y0ZjY7IHBhZGRpbmc6IDJweCA2cHg7IGJvcmRlci1yYWRpdXM6IDNweDsgZm9udC1zaXplOiAwLjllbTsgfQpzbWFsbCB7IGNvbG9yOiAjNmI3MjgwOyB9CnNtYWxsIGEgeyBjb2xvcjogIzYzNjZmMTsgdGV4dC1kZWNvcmF0aW9uOiBub25lOyB9CnNtYWxsIGE6aG92ZXIgeyB0ZXh0LWRlY29yYXRpb246IHVuZGVybGluZTsgfQo8L3N0eWxlPgo8L2hlYWQ+Cjxib2R5Pgo8aDE+NDAzIC0gQWNjZXNzIGRlbmllZDwvaDE+CjxwPlRoaXMgZW5kcG9pbnQgcmVxdWlyZXMgYXV0aGVudGljYXRpb24uIFBsZWFzZSBwcm92aWRlIGEgdmFsaWQgQVBJIGtleSBpbiB0aGUgcmVxdWVzdC48L3A+CjxwPklmIHlvdSBhcmUgYSBkZXZlbG9wZXIgaW50ZWdyYXRpbmcgd2l0aCB0aGlzIEFQSSwgY2hlY2sgdGhlIGRvY3VtZW50YXRpb24gZm9yIHRoZSByZXF1aXJlZCA8Y29kZT54LWFwaS1rZXk8L2NvZGU+IGhlYWRlciBvciBhdXRoIGNvb2tpZS4gSWYgeW91IGJlbGlldmUgdGhpcyBpcyBhbiBlcnJvciwgY29udGFjdCB0aGUgc2VydmljZSBhZG1pbmlzdHJhdG9yLjwvcD4KPHA+PHNtYWxsPlBvd2VyZWQgYnkgPGEgaHJlZj0iaHR0cHM6Ly93c2xwcm94eS5jb20vIiB0YXJnZXQ9Il9ibGFuayIgcmVsPSJub29wZW5lciI+d3NscHJveHk8L2E+Ljwvc21hbGw+PC9wPgo8L2JvZHk+CjwvaHRtbD4=",
    -- Host not configured page (HTTP 200, hostname has no tenant server)
    no_server = "PCFET0NUWVBFIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCxpbml0aWFsLXNjYWxlPTEiPgo8dGl0bGU+SG9zdCBub3QgY29uZmlndXJlZDwvdGl0bGU+CjxzdHlsZT4KYm9keSB7IGZvbnQtZmFtaWx5OiAtYXBwbGUtc3lzdGVtLCBCbGlua01hY1N5c3RlbUZvbnQsICJTZWdvZSBVSSIsIFJvYm90bywgc2Fucy1zZXJpZjsgbWF4LXdpZHRoOiA2MDBweDsgbWFyZ2luOiA0ZW0gYXV0bzsgcGFkZGluZzogMmVtOyBjb2xvcjogIzFmMjkzNzsgbGluZS1oZWlnaHQ6IDEuNTsgfQpoMSB7IGZvbnQtc2l6ZTogMS43NWVtOyBjb2xvcjogI2Q5NzcwNjsgbWFyZ2luOiAwIDAgMC41ZW07IH0KcCB7IG1hcmdpbjogMC43NWVtIDA7IH0Kc21hbGwgeyBjb2xvcjogIzZiNzI4MDsgfQpzbWFsbCBhIHsgY29sb3I6ICM2MzY2ZjE7IHRleHQtZGVjb3JhdGlvbjogbm9uZTsgfQpzbWFsbCBhOmhvdmVyIHsgdGV4dC1kZWNvcmF0aW9uOiB1bmRlcmxpbmU7IH0KPC9zdHlsZT4KPC9oZWFkPgo8Ym9keT4KPGgxPkhvc3Qgbm90IGNvbmZpZ3VyZWQ8L2gxPgo8cD5UaGlzIGhvc3RuYW1lIGlzIG5vdCByZWdpc3RlcmVkIGFzIGEgdGVuYW50IG9uIHRoaXMgcHJveHkuPC9wPgo8cD5JZiB5b3UgYXJlIHRoZSBvcGVyYXRvciwgY29uZmlndXJlIGEgc2VydmVyIGluIHRoZSBhZG1pbiBkYXNoYm9hcmQuIElmIHlvdSBhcmUgYW4gZW5kLXVzZXIsIHBsZWFzZSBkb3VibGUtY2hlY2sgdGhlIFVSTC48L3A+CjxwPjxzbWFsbD5Qb3dlcmVkIGJ5IDxhIGhyZWY9Imh0dHBzOi8vd3NscHJveHkuY29tLyIgdGFyZ2V0PSJfYmxhbmsiIHJlbD0ibm9vcGVuZXIiPndzbHByb3h5PC9hPi48L3NtYWxsPjwvcD4KPC9ib2R5Pgo8L2h0bWw+",
}

local function get_error_page(settings_obj, page_type)
    if settings_obj and settings_obj.nginx and settings_obj.nginx.default and settings_obj.nginx.default[page_type] then
        return settings_obj.nginx.default[page_type]
    end
    return DEFAULT_ERROR_PAGES[page_type]
end

local function serve_error(settings_obj, page_type)
    local html = get_error_page(settings_obj, page_type)
    ngx.header["Content-Type"] = (settings_obj and settings_obj.nginx and settings_obj.nginx.content_type) or "text/html"
    if page_type == "conf_mismatch" then
        ngx.status = ngx.HTTP_FORBIDDEN
    end
    ngx.say(Base64DecodeSafe(html) or "Service unavailable")
end

-- ─── Cache check ────────────────────────────────────────────────────────────

local function check_and_serve_from_cache()
    local ok, CacheManager = pcall(require, "cache_manager")
    if not ok then return false end
    local ok2, CacheHandler = pcall(require, "cache_handler")
    if not ok2 then return false end
    local server_name = hostname:gsub("^www%.", "")
    local cache_config = CacheManager.get_cache_config(server_name)

    -- Check Docker blob/manifest caching (disk-based via nginx proxy_cache)
    if cache_config then
        CacheHandler.check_docker_blob_cache(server_name, cache_config)
    end

    -- Check Lua shared dict cache for static content
    if cache_config and cache_config.cache_enabled then
        local served = CacheHandler.check_cache(server_name, cache_config)
        if served then
            ngx.exit(ngx.OK)
            return true
        end
    end
    return false
end

-- ═══════════════════════════════════════════════════════════════════════════
-- MAIN REQUEST PROCESSING
-- ═══════════════════════════════════════════════════════════════════════════

-- 1. Try cache first (GET/HEAD only)
if ngx.req.get_method() == "GET" or ngx.req.get_method() == "HEAD" then
    if check_and_serve_from_cache() then
        return
    end
end

local settings = Helper.settings()

-- 2. Handle CAPTCHA verification POST (before rule matching)
if ngx.var.uri == "/__captcha/verify" and ngx.req.get_method() == "POST" then
    local captcha_ok, Captcha = pcall(require, "captcha")
    if captcha_ok and Captcha then
        Captcha.handle_verify(settings)
        return
    end
end

local profile = settings.env_profile or "prod"

-- 3. Load server config
local server_config, server_err = RuleLoader.load_server(hostname, configPath, profile)
if not server_config then
    serve_error(settings, "no_server")
    return ngx.exit(ngx.OK)
end

-- 4. Load all candidate rules
local loaded_rules = RuleLoader.load_all_rules(server_config, configPath, profile)
if not loaded_rules or #loaded_rules == 0 then
    serve_error(settings, "no_rule")
    return
end

-- 5. Evaluate each rule against the current request
local evaluated = {}
for _, loaded_rule in ipairs(loaded_rules) do
    local result = RuleMatcher.evaluate(loaded_rule, hostname, settings)
    table.insert(evaluated, result)
end

-- 6. Select the winning rule (deterministic: priority > specificity > conditions > id)
local winner = RuleSelector.select(evaluated)

if winner then
    -- Build the selectedRule object that gateway_resp.lua expects
    local selectedRule = {
        statusCode = winner.status_code,
        redirectUri = winner.redirect_uri,
        message = winner.message,
        priority = winner.priority,
        name = winner.rule_name,
        rule_data = winner.rule_match,
    }

    -- 7. Run pipeline (rate limiting → WAF → transforms)
    local pipeline_ok, GatewayPipeline = pcall(require, "gateway_pipeline")
    if pipeline_ok and GatewayPipeline then
        local handled = GatewayPipeline.execute(server_config, selectedRule, profile)
        if handled then return end
    end

    -- Resolve proxy server name (handle null/empty/ngx.null from cjson)
    local proxy_name = server_config.proxy_server_name
    if not proxy_name or proxy_name == "" or proxy_name == "null"
        or type(proxy_name) == "userdata" then
        proxy_name = server_config.server_name
    end

    -- 8. Pass to gateway_resp.lua via ngx.ctx (no JSON serialization)
    ngx.ctx.gateway = {
        executableRule = selectedRule,
        proxyServerName = proxy_name,
        proxyServer = server_config,
    }

    -- Also set the legacy nginx variable for backward compatibility
    local globalVars = cjson.decode(ngx.var.frontdoor_global_vars or "{}")
    globalVars.executableRule = selectedRule
    globalVars.proxyServerName = proxy_name
    globalVars.proxyServer = server_config
    ngx.var.frontdoor_global_vars = cjson.encode(globalVars)
else
    -- No matching rule — serve error page
    local fallback_msg = RuleSelector.get_fallback_message(evaluated)
    if fallback_msg then
        ngx.header["Content-Type"] = (settings.nginx and settings.nginx.content_type) or "text/html"
        ngx.status = ngx.HTTP_FORBIDDEN
        ngx.say(Base64DecodeSafe(fallback_msg) or "Forbidden")
    else
        serve_error(settings, "conf_mismatch")
    end
end
