local cjson = Cjson
local configPath = os.getenv("NGINX_CONFIG_DIR")

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
local globalVars = ngx.var.frontdoor_global_vars
globalVars = cjson.decode(globalVars)
local selectedRule = globalVars.executableRule
local primaryNameserver = globalVars.proxyServerName
local settings = getSettings()

if selectedRule.statusCode == 301 then
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
    if not isIpAddress(selectedRule.redirectUri) then
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
    ngx.header["Content-Type"] = settings.nginx.content_type ~= nil and settings.nginx.content_type or
    "text/html"
    ngx.status = selectedRule.statusCode
    ngx.say(Base64.decode(selectedRule.message))
end