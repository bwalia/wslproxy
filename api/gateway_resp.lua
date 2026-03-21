local cjson = Cjson
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local Dns = require("dns_access")

local Helper = require("helpers")

-- Read from ngx.ctx.gateway (new) with fallback to legacy nginx variable
local gateway = ngx.ctx.gateway
local selectedRule, primaryNameserver, proxyServer
if gateway then
    selectedRule = gateway.executableRule
    primaryNameserver = gateway.proxyServerName
    proxyServer = gateway.proxyServer
else
    local globalVars = cjson.decode(ngx.var.frontdoor_global_vars or "{}")
    selectedRule = globalVars.executableRule
    primaryNameserver = globalVars.proxyServerName
    proxyServer = globalVars.proxyServer
end

local settings = Helper.settings()

-- Server-level Force HTTPS: redirect all port 80 traffic to HTTPS
-- This is the ssl_force_https toggle from the server editor
if proxyServer and proxyServer.ssl_enabled and proxyServer.ssl_force_https
    and ngx.var.server_port == "80" then
    -- Allow ACME challenges through for Let's Encrypt certificate renewal
    local uri = ngx.var.uri or ""
    if not uri:find("^/.well%-known/acme%-challenge/") then
        local redirect_url = "https://" .. ngx.var.host .. ngx.var.request_uri
        ngx.redirect(redirect_url, ngx.HTTP_MOVED_PERMANENTLY)
        return
    end
end

-- CAPTCHA rule (306): verify human before proxying to backend
-- Rule matching (path, IP, country) already handled by gateway_ack.lua
-- If CAPTCHA cookie is valid, treat as 305 (proxy). If not, serve challenge page.
if selectedRule.statusCode == 306 then
    local captcha_ok, Captcha = pcall(require, "captcha")
    if captcha_ok and Captcha then
        local handled = Captcha.check(settings)
        if handled then
            return -- challenge page served or verification processed
        end
    else
        ngx.log(ngx.ERR, "captcha module not available, falling through to proxy")
    end
    -- CAPTCHA passed or module unavailable — continue as proxy (305)
    selectedRule.statusCode = 305
end

if selectedRule.statusCode == nil then
    ngx.say("Status code not found: ")
    ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
elseif selectedRule.statusCode == 200 or selectedRule.statusCode == 403 then
    ngx.header["Content-Type"] = "text/html"
    ngx.status = selectedRule.statusCode
    ngx.say(Base64.decode(selectedRule.message))
elseif selectedRule.statusCode == 301 then
    if selectedRule.redirectUri == nil then
        ngx.say("Redirect url not found: ")
        ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
    end
    ngx.redirect(selectedRule.redirectUri, ngx.HTTP_MOVED_PERMANENTLY)
    ngx.exit(ngx.HTTP_MOVED_PERMANENTLY)
elseif selectedRule.statusCode == 302 then
    if selectedRule.redirectUri == nil then
        ngx.say("Redirect url not found: ")
        ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
    end
    ngx.redirect(selectedRule.redirectUri, ngx.HTTP_MOVED_TEMPORARILY)
    ngx.exit(ngx.HTTP_MOVED_TEMPORARILY)
elseif selectedRule.statusCode == 305 then
    -- Rule-level auto redirect HTTP to HTTPS (only if server has SSL enabled)
    if selectedRule.rule_data and selectedRule.rule_data.auto_redirect_https
        and proxyServer and proxyServer.ssl_enabled
        and ngx.var.server_port == "80" then
        local redirect_url = "https://" .. ngx.var.host .. ngx.var.request_uri
        ngx.redirect(redirect_url, ngx.HTTP_MOVED_PERMANENTLY)
        return
    end

    local proxy_server_name = primaryNameserver

    -- Traffic Router: multi-backend weighted routing (fail-open)
    -- Must run BEFORE the redirectUri nil check so backends can populate redirectUri
    local tr_ok, TrafficRouter = pcall(require, "traffic_router")
    if tr_ok and TrafficRouter and selectedRule.rule_data then
        local response = selectedRule.rule_data.response or selectedRule.rule_data
        if response and response.backends and type(response.backends) == "table" and #response.backends > 0 then
            local ctx = {
                remote_addr = ngx.var.remote_addr,
                headers = ngx.req.get_headers(),
            }
            -- Attach rule_id for round-robin counter
            response.rule_id = selectedRule.rule_data.id or selectedRule.rule_data.rule_id
            local backend = TrafficRouter.select_backend(response, ctx)
            if backend then
                selectedRule.redirectUri = backend.address
                ngx.ctx.selected_backend_label = backend.label
                ngx.ctx.selected_backend_rule_id = response.rule_id
                -- Cache for potential retry in balancer_by_lua
                ngx.ctx._router_response_cache = response
                ngx.ctx._router_ctx_cache = ctx
            end
            -- Set sticky cookie if traffic router requested it
            if ngx.ctx._traffic_router_set_cookie then
                ngx.header["Set-Cookie"] = ngx.ctx._traffic_router_set_cookie
            end
        end
    end

    if selectedRule.redirectUri == nil then
        ngx.say("Redirect url not found: ")
        ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
    end

    -- Set backend metrics context for single-backend rules (not using Traffic Router)
    if not ngx.ctx.selected_backend_label then
        local rule_id = selectedRule.rule_data and selectedRule.rule_data.id or "unknown"
        ngx.ctx.selected_backend_rule_id = rule_id
        ngx.ctx.selected_backend_label = selectedRule.redirectUri
    end

    -- Strip matched path prefix from URI before proxying (like K8s Ingress rewrite-target)
    if selectedRule.rule_data.strip_path
        and selectedRule.rule_data.path
        and selectedRule.rule_data.path ~= "/"
        and type(selectedRule.rule_data.path) ~= "userdata" then
        local matched_path = selectedRule.rule_data.path
        local current_uri = ngx.var.uri
        if current_uri:sub(1, #matched_path) == matched_path then
            local new_uri = current_uri:sub(#matched_path + 1)
            if new_uri == "" then new_uri = "/" end
            ngx.req.set_uri(new_uri)
        end
    end

    local origin_serverScheme = "http"
    if Helper.isStringContains("https://", selectedRule.redirectUri) then
        origin_serverScheme = "https"
    end

    selectedRule.redirectUri = string.gsub(selectedRule.redirectUri, "https://", "")
    selectedRule.redirectUri = string.gsub(selectedRule.redirectUri, "http://", "")
    -- Separate path from hostname before DNS resolution
    -- e.g. "bucket.s3.amazonaws.com/landing" -> host="bucket.s3.amazonaws.com", path="/landing"
    local redirectPath = nil
    local slashPos = string.find(selectedRule.redirectUri, "/")
    if slashPos then
        redirectPath = string.sub(selectedRule.redirectUri, slashPos)
        selectedRule.redirectUri = string.sub(selectedRule.redirectUri, 1, slashPos - 1)
    end
    local extracted = nil
    local extractedPort = 80
    -- if not isIpAddress(selectedRule.redirectUri) then
    local continueDnsResolve = true
    if selectedRule.rule_data.isConsul then
        local dnsServerHost = settings.consul.dns_server_host
        local dnsServerPort = settings.consul.dns_server_port
        if dnsServerHost ~= nil then
            local tIp, tPort = Dns.access(selectedRule, dnsServerHost, dnsServerPort)
            if Helper.isIpAddress(tIp) then
                selectedRule.redirectUri = tIp
                extractedPort = tPort
                continueDnsResolve = false
            end
        end
    end
    if string.sub(selectedRule.redirectUri, 1, 6) == "unix:/" then
        continueDnsResolve = false
    end
    if continueDnsResolve then
        extracted = string.match(selectedRule.redirectUri, ":(.*)")
        if not Helper.isIpAddress(selectedRule.redirectUri) then
            local resolver = require "resty.dns.resolver"
            local primaryNameserver = os.getenv("PRIMARY_DNS_RESOLVER")
            if (primaryNameserver == nil or primaryNameserver == "") and not (settings == nil or settings.dns_resolver == nil) then
                primaryNameserver = settings.dns_resolver.nameservers.primary
            end
            if primaryNameserver == nil or primaryNameserver == "" then
                primaryNameserver = "1.1.1.1"
            end
            local secondaryNameserver = os.getenv("SECONDARY_DNS_RESOLVER")
            if (secondaryNameserver == nil or secondaryNameserver == "") and not (settings == nil or settings.dns_resolver == nil) then
                secondaryNameserver = settings.dns_resolver.nameservers.secondary
            end
            if secondaryNameserver == nil or secondaryNameserver == "" then
                secondaryNameserver = "8.8.8.8"
            end
            local portNameserver = os.getenv("DNS_RESOLVER_PORT")
            if (portNameserver == nil or portNameserver == "") and not (settings == nil or settings.dns_resolver == nil) then
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
                ngx.exit(ngx.HTTP_BAD_REQUEST)
                return
            end
            local answers, qErr, tries = r:query(string.gsub(selectedRule.redirectUri, ":(.*)", ""), nil, {})
            if not answers or answers.errstr ~= nil then
                ngx.say(Cjson.encode({
                    message = "DNS couldn't resolve the domain please check your domain or DNS configurations.",
                    error = qErr,
                    retry_historie = tries
                }))
                ngx.exit(ngx.HTTP_BAD_REQUEST)
                return
            end
            for i, ans in ipairs(answers) do
                selectedRule.redirectUri = ans.address
            end
        end
    end
    local finalProxyHost = selectedRule.redirectUri
    if not Helper.isIpAddress(finalProxyHost) and not string.sub(selectedRule.redirectUri, 1, 6) == "unix:/" then
        ngx.say(Cjson.encode({
            message = "DNS failed to resolve the domain please check your domain or DNS configurations.",
        }))
        ngx.exit(ngx.HTTP_BAD_REQUEST)
    end
    if extracted ~= nil then
        ngx.var.proxy_port = extracted
        finalProxyHost = string.gsub(selectedRule.redirectUri, ":(.*)", "")
    else
        ngx.var.proxy_port = extractedPort
    end

    -- Varnish interception: route through local Varnish if enabled for this server
    local v_ok, VarnishMgr = pcall(require, "varnish_manager")
    if v_ok and proxyServer and proxyServer.server_name then
        local varnish_enabled = VarnishMgr.is_varnish_enabled(proxyServer.server_name)
        if varnish_enabled then
            local vc = VarnishMgr.get_varnish_config(proxyServer.server_name)
            if vc and vc.varnish_enabled then
                -- Store original backend info in debug headers
                ngx.header["X-Debug-Varnish-Enabled"] = "true"
                ngx.header["X-Debug-Origin-Backend"] = finalProxyHost .. ":" .. ngx.var.proxy_port
                -- Route to local Varnish instead of origin
                finalProxyHost = vc.listen_address or "127.0.0.1"
                ngx.var.proxy_port = tostring(vc.listen_port or 6081)
                origin_serverScheme = "http"
            end
        end
    end

    ngx.var.proxy_host = finalProxyHost
    -- S3 signed requests need s3.<region>.amazonaws.com as Host header
    if ngx.ctx.s3_host_override then
        ngx.var.proxy_host_override = ngx.ctx.s3_host_override
    elseif proxy_server_name ~= nil and proxy_server_name ~= "" then
        ngx.var.proxy_host_override = proxy_server_name
    else
        ngx.var.proxy_host_override = selectedRule.redirectUri
    end

    -- Upstream backend request headers (forwarded to the backend server)
    if proxyServer and proxyServer.custom_headers ~= nil and type(proxyServer.custom_headers) == "table" then
        for idx, header in ipairs(proxyServer.custom_headers) do
            ngx.req.set_header(header.header_key, header.header_value)
        end
    end

    -- Client response headers (sent back to the browser via header_filter phase)
    if proxyServer and proxyServer.custom_response_headers ~= nil and type(proxyServer.custom_response_headers) == "table" then
        ngx.ctx.custom_response_headers = proxyServer.custom_response_headers
    end

    -- Prepend redirect path to the request URI if present
    -- e.g. redirect_uri had "/landing" and request is "/" -> upstream gets "/landing/"
    if redirectPath and redirectPath ~= "/" then
        local currentUri = ngx.var.uri or "/"
        ngx.req.set_uri(redirectPath .. currentUri)
    end

    ngx.var.proxy_host_scheme = origin_serverScheme
    --ngx.req.set_header("Host", ngx.var.proxy_host_override) this will never work here because balancer by lua overrides host header
    ngx.header["X-Debug-Request-ID"] = ngx.var.request_id
    ngx.header["X-Debug-Origin-Host"] = ngx.var.proxy_host_override
    ngx.header["X-Debug-Origin-Port"] = ngx.var.proxy_port
    ngx.header["X-Debug-Origin-HTTPS"] = ngx.var.proxy_host_scheme
    ngx.log(ngx.INFO, ngx.var.proxy_host)
    ngx.log(ngx.INFO, ngx.var.proxy_host_override)
    ngx.log(ngx.INFO, ngx.var.proxy_host_scheme)
    -- do return ngx.say(ngx.var.proxy_host_override) end
    -- else
    --     ngx.log(ngx.ERR, "[ERROR]: Server not found!")
    -- end
    return
end
