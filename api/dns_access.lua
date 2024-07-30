local Dns = {}
local dns_res = require "resty.dns.resolver"
local cjson = require "cjson"

function Dns.access(selectedRule, dnsServerHost, dnsServerPort)
    local query_domain = selectedRule.rule_data.consulDomainName

    local dns_conf = {dnsServerHost, dnsServerPort}
    if dnsServerPort == nil then
      dns_conf = {dnsServerHost}
    end
    
    local function abort(reason, status_code)
      ngx.status = status_code
      ngx.say(reason)
      ngx.exit(status_code)
    end
    
    
    local dns, dns_err = dns_res:new{nameservers = {dns_conf}, timeout = 200}
    if not dns or dns == ngx.null then
      return abort("DNS couldnt be resolved", 500)
    end
    
    local entries, entry_err = dns:query(query_domain, {qtype = dns.TYPE_SRV})
    if not entries or entries == ngx.null or entries.errstr then
      return "false", "false"
    end
    if entries[1].port then
        local t_ip = dns:query(entries[1].target)[1].address
        return t_ip, entries[1].port
    else
      return abort("No valid ports found", 500)
    end
end

return Dns