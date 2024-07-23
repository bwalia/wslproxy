local cjson = require("cjson")
local configPath = os.getenv("NGINX_CONFIG_DIR")
local globalVars = ngx.var.vars
Base64 = require "base64"
local Dns = require("dns_access")

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
globalVars = cjson.decode(globalVars)
local selectedRule = globalVars.executableRule
local primaryNameserver = globalVars.proxyServerName
local settings = loadGlobalSettings()

if selectedRule.redirectUri == nil then
    ngx.say("Redirect url not found: ")
    ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
elseif selectedRule.statusCode == nil then
    ngx.say("Status code not found: ")
    ngx.exit(ngx.HTTP_INTERNAL_SERVER_ERROR)
elseif selectedRule.statusCode == 301 then
    ngx.redirect(selectedRule.redirectUri, ngx.HTTP_MOVED_PERMANENTLY)
    ngx.exit(ngx.HTTP_MOVED_PERMANENTLY)
elseif selectedRule.statusCode == 302 then
    ngx.redirect(selectedRule.redirectUri, ngx.HTTP_MOVED_TEMPORARILY)
    ngx.exit(ngx.HTTP_MOVED_TEMPORARILY)
elseif selectedRule.statusCode == 305 then
    local proxy_server_name = primaryNameserver
    -- local getServer = red:hget("servers", jsonval.id)
    -- if getServer ~= nil and type(getServer) ~= "userdata" then
    --     getServer = cjson.decode(getServer)
    --     getServer.proxy_pass = selectedRule.redirectUri
    -- remove http:// from the url or https:// as it should be added in the proxy_pass
    selectedRule.redirectUri = string.gsub(selectedRule.redirectUri, "https://", "")
    selectedRule.redirectUri = string.gsub(selectedRule.redirectUri, "http://", "")
    local extracted = string.match(selectedRule.redirectUri, ":(.*)")
    local extractedPort = 80
    if not isIpAddress(selectedRule.redirectUri) then
        local continueDnsResolve = true
        if selectedRule.rule_data.isConsul then
            local dnsServerHost = settings.consul.dns_server_host
            local dnsServerPort = settings.consul.dns_server_port
            if dnsServerHost ~= nil then
                local tIp, tPort = Dns.access(selectedRule, dnsServerHost, dnsServerPort)
                selectedRule.redirectUri = tIp
                extractedPort = tPort
                if isIpAddress(tIp) then
                    continueDnsResolve = false
                end
            end
        end
        if continueDnsResolve then
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
                return
            end
            local answers, err, tries = r:query(string.gsub(selectedRule.redirectUri, ":(.*)", ""), nil, {})
            if not answers then
                ngx.say("failed to query the DNS server: ", err)
                ngx.say("retry historie:\n  ", table.concat(tries, "\n  "))
                return
            end
            for i, ans in ipairs(answers) do
                selectedRule.redirectUri = ans.address
            end
        end
    end
    local finalProxyHost = selectedRule.redirectUri
    if extracted ~= nil then
        ngx.var.proxy_port = extracted
        finalProxyHost = string.gsub(selectedRule.redirectUri, ":(.*)", "")
    else
        ngx.var.proxy_port = extractedPort
    end

    ngx.var.proxy_host = finalProxyHost
    if proxy_server_name == nil or proxy_server_name == "" then
        ngx.var.proxy_host_override = selectedRule.redirectUri
    else
        ngx.var.proxy_host_override = proxy_server_name
    end
    --ngx.req.set_header("Host", ngx.var.proxy_host_override) this will never work here because balancer by lua overrides host header
    ngx.header["X-Debug-Host"] = ngx.var.proxy_host_override
    ngx.header["X-Debug-Port"] = ngx.var.proxy_port
    ngx.log(ngx.INFO, ngx.var.proxy_host)
    ngx.log(ngx.INFO, ngx.var.proxy_host_override)
    -- do return ngx.say(ngx.var.proxy_host_override) end
    -- else
    --     ngx.log(ngx.ERR, "[ERROR]: Server not found!")
    -- end
    return
elseif selectedRule.statusCode == 200 or selectedRule.statusCode == 403 or selectedRule.statusCode == 403 then
    ngx.header["Content-Type"] = "text/html"
    ngx.status = selectedRule.statusCode
    ngx.say(Base64.decode(selectedRule.message))
end