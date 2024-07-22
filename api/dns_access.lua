local Dns = {}
local dns_res = require "resty.dns.resolver"
local cjson = require "cjson"

function Dns.access(selectedRule)
    local query_domain = selectedRule.redirectUri
    local dns_conf = {"172.177.0.8", 8600}
    
    local function abort(reason, status_code)
      ngx.status = status_code
      ngx.say(reason)
    end
    
    
    local dns, dns_err = dns_res:new{nameservers = {dns_conf}, timeout = 200}
    
    if not dns then
      return abort("DNS couldnt be resolved", 500)
    end
    
    local entries, entry_err = dns:query(query_domain, {qtype = dns.TYPE_SRV})
    
    if not entries then
      return abort("No records found", 502)
    end
    if entries[1].port then
        local t_ip = dns:query(entries[1].target)[1].address
        -- ngx.say(t_ip, entries[1].port)
        -- ngx.exit(ngx.HTTP_OK)
    
        return t_ip, entries[1].port
    else
      return abort("No valid ports found", 500)
    end
end

return Dns