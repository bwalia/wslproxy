-- cache_configs and access_profiles must be registered storage resources whose
-- disk paths are exactly where the request path reads them. Unregistered, the
-- pgsql dual writer's disk write failed and rolled the row back silently.
-- Run: lua test/storage/test_driver_cache_access_paths.lua
package.path = "api/?.lua;api/?/init.lua;" .. package.path
local D = require("storage.driver")
local failures = 0
local function eq(a, b, m) if a ~= b then failures = failures + 1; io.stderr:write("FAIL: " .. m .. " got " .. tostring(a) .. "\n") end end
eq(D.disk_dir("/opt/nginx/", "cache_configs", "global"), "/opt/nginx/data/cache", "cache configs live in flat data/cache (cache_manager path)")
eq(D.disk_dir("/opt/nginx/", "access_profiles", "prod"), "/opt/nginx/data/access_profiles/prod", "access profiles per env (access_profile.lua path)")
eq(select(1, D.disk_dir("/opt/nginx/", "access_profiles", "..")), nil, "env traversal refused")
if failures > 0 then os.exit(1) end
print("ok: storage driver paths for cache_configs / access_profiles")
