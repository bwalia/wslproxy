-- dns_manager must never converge a name owned by nebula-dns-failover (the
-- lon1<->lon2 DNS failover writer). Drives the real provision_for_server with
-- stubbed Cloudflare HTTP and asserts: no write call, error failover_managed.
-- Run: lua test/rules/test_dns_manager_failover_guard.lua

package.path = "api/?.lua;api/?/init.lua;" .. package.path

-- cjson stub: bodies are opaque keys into a table registry.
local registry, n = {}, 0
local function reg(t) n = n + 1; local k = "body#" .. n; registry[k] = t; return k end
package.preload["cjson"] = function()
    return { encode = function() return "{}" end,
             decode = function(s) local t = registry[s]; if not t then error("unknown body " .. tostring(s)) end; return t end }
end

local calls = {}
local list_result = {}
package.preload["resty.http"] = function()
    return { new = function()
        return { set_timeout = function() end,
                 request_uri = function(_, url, opts)
                     calls[#calls + 1] = { method = opts.method, url = url }
                     if opts.method == "GET" then
                         return { status = 200, headers = {}, body = reg({ success = true, result = list_result }) }
                     end
                     return { status = 200, headers = {}, body = reg({ success = true, result = { id = "new" } }) }
                 end }
    end }
end

local server_json = reg({ server_name = "app.example.org", dns_record_type = "CNAME",
                          dns_cname_target = "pop1.example.org", pop_ids = { "lon1" } })
package.preload["helpers"] = function() return { getDataFromFile = function() return server_json end } end
package.preload["audit_logger"] = function() return { log = function() end } end
package.preload["pops"] = function() return { get = function() return nil end, list = function() return {} end } end
rawset(_G, "ngx", { log = function() end, ERR = 1, WARN = 2, INFO = 3, sleep = function() end,
                    escape_uri = function(s) return s end })

local DM = require("dns_manager")
DM.find_zone = function()
    return { zone_name = "example.org", zone_id = "z1",
             provider = { api_token = "t", default_proxied = false } }
end

local failures = 0
local function check(cond, msg)
    if not cond then failures = failures + 1; io.stderr:write("FAIL: " .. msg .. "\n") end
end
local function writes()
    local w = 0
    for _, c in ipairs(calls) do if c.method ~= "GET" then w = w + 1 end end
    return w
end

-- 1. Name owned by the failover writer: refused, nothing written, even dry_run=false.
list_result = { { id = "r1", type = "CNAME", name = "app.example.org", content = "lon2.pop0.uk",
                  comment = "nebula-dns-failover | adopted 2026-11-22" } }
calls = {}
local res, err = DM.provision_for_server({ server_id = "host:app.example.org", profile_id = "prod" })
check(res == nil, "failover-owned name must not provision")
check(err and err.code == "failover_managed", "error code failover_managed, got " .. tostring(err and err.code))
check(writes() == 0, "no Cloudflare write for a failover-owned name")

-- 2. Same refusal in dry-run (operators must not be told a plan exists).
calls = {}
res, err = DM.provision_for_server({ server_id = "host:app.example.org", profile_id = "prod", dry_run = true })
check(err and err.code == "failover_managed", "dry run is refused too")

-- 3. Unowned name still provisions (guard does not over-block).
list_result = {}
calls = {}
res, err = DM.provision_for_server({ server_id = "host:app.example.org", profile_id = "prod" })
check(res ~= nil, "unowned name provisions: " .. tostring(err and (err.code .. " " .. tostring(err.message))))
check(writes() == 1, "unowned name gets exactly one create, got " .. writes())

-- 4. Pure helper.
check(DM.failover_owned_record({ { comment = "wslproxy-managed server=x" } }) == nil, "wslproxy marker is not failover")
check(DM.failover_owned_record({ { comment = nil }, { comment = "x nebula-dns-failover y", id = "k" } }).id == "k", "finds marked record")

if failures > 0 then io.stderr:write(failures .. " failure(s)\n"); os.exit(1) end
print("ok: dns_manager refuses failover-owned names")
