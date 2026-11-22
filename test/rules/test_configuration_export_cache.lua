-- CP export must carry static-cache configs and access profiles for the
-- exported servers. Edges only derive cache/<host>.json from admin-API saves,
-- and a missing access profile makes an edge answer "VPN required" to all.
-- Run: lua test/rules/test_configuration_export_cache.lua

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local tmp = os.tmpname(); os.remove(tmp)
os.execute("mkdir -p " .. tmp .. "/data/access_profiles/prod")
local f = io.open(tmp .. "/data/access_profiles/prod/vpn-only.json", "w")
f:write("VPNPROFILE"); f:close()

local decoded = { VPNPROFILE = { name = "vpn-only", allow_cidrs = { "10.0.0.0/8" } } }
package.preload["cjson.safe"] = function()
    return { encode = function() return "{}" end, decode = function(s) return decoded[s] end, array_mt = {} }
end
package.preload["resty.sha256"] = function() return { new = function() return { update = function() end, final = function() return "x" end } end } end
package.preload["resty.string"] = function() return { to_hex = function() return "00" end } end
package.preload["pops"] = function() return { get = function(id) return { id = id, display_name = id } end } end
package.preload["repo"] = function()
    return {
        scan = function(kind)
            if kind ~= "servers" then return {} end
            return {
                { id = "host:www.site.org", server_name = "www.site.org", pop_ids = { "lon1" }, access_profile = "vpn-only" },
                { id = "host:site.org", server_name = "site.org", pop_ids = { "lon1" } },
                { id = "host:api.site.org", server_name = "api.site.org", pop_ids = { "lon1" } },
                { id = "host:other.org", server_name = "other.org", pop_ids = { "lon2" }, access_profile = "vpn-only" },
                { id = "host:bad.org", server_name = "bad.org", pop_ids = { "lon1" }, access_profile = "../../settings" },
                { id = "host:vpn.site.org", server_name = "vpn.site.org", pop_ids = { "lon1" }, access_profile = "shared-only" },
            }
        end,
        get = function(kind, env, id)
            if kind == "access_profiles" and env == "prod" and id == "shared-only" then
                return { allow_cidrs = { "192.168.0.0/16" } }
            end
            return nil
        end,
    }
end
local cache_cfgs = { ["site.org"] = { cache_enabled = true, cache_ttl = 86400 } }
package.preload["cache_manager"] = function()
    return { get_cache_config = function() return nil end,
             get_cache_config_shared = function(k) return cache_cfgs[k] end }
end
rawset(_G, "ngx", { var = { host = "cp" } })
local real_getenv = os.getenv
os.getenv = function(k) if k == "NGINX_CONFIG_DIR" then return tmp .. "/" end return real_getenv(k) end

local Export = require("configuration_export")
local b, err = Export.build("lon1", "prod")

local failures = 0
local function check(c, m) if not c then failures = failures + 1; io.stderr:write("FAIL: " .. m .. "\n") end end
check(b ~= nil, "build returned " .. tostring(err))
check(#b.cache == 1, "one cache config (www.site.org and site.org share key site.org; api has none), got " .. #b.cache)
check(b.cache[1] and b.cache[1].server_name == "site.org" and b.cache[1].cache_ttl == 86400, "cache entry keyed by host without www.")
check(#b.access_profiles == 2, "disk profile + shared-store profile, got " .. #b.access_profiles)
local names = {}
for _, p in ipairs(b.access_profiles) do names[p.name] = p end
check(names["vpn-only"] ~= nil, "disk access profile included")
check(names["shared-only"] and names["shared-only"].allow_cidrs[1] == "192.168.0.0/16", "shared-store access profile included with name")
check(b.manifest.record_counts.cache == 1 and b.manifest.record_counts.access_profiles == 2, "manifest counts")
-- other.org (lon2) is not exported; bad.org's traversal name is ignored, not read.

os.execute("rm -rf " .. tmp)
if failures > 0 then io.stderr:write(failures .. " failure(s)\n"); os.exit(1) end
print("ok: configuration_export carries cache + access_profiles")
