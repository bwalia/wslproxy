-- Optional pgsql driver smoke test. Skips when pgmoon/Postgres are absent.
-- Run: lua test/storage/test_pgsql_driver.lua

package.path = "api/?.lua;api/?/init.lua;" .. package.path

_G.ngx = {
    ERR = 4, WARN = 5, INFO = 7, EMERG = 1, null = {},
    log = function() end,
}
_G.Cjson = (function()
    local ok, c = pcall(require, "cjson")
    if ok then return c end
    ok, c = pcall(require, "dkjson")
    if ok then return { encode = c.encode, decode = c.decode } end
    print("skip: no cjson")
    os.exit(0)
end)()

package.loaded.helpers = package.loaded.helpers or {
    getDataFromFile = function() return nil end,
    setDataToFile = function() return true end,
    settings = function() return {} end,
}

local ok_pg, _ = pcall(require, "pgmoon")
if not ok_pg then
    print("skip: pgmoon not installed")
    os.exit(0)
end

local Pgsql = require("storage.pgsql_driver")
local drv = Pgsql.new({
    settings = {
        pgsql = {
            host = os.getenv("WSLPROXY_PG_HOST") or "127.0.0.1",
            port = tonumber(os.getenv("WSLPROXY_PG_PORT") or "5436"),
            database = os.getenv("WSLPROXY_PG_DB") or "wslproxy",
            user = os.getenv("WSLPROXY_PG_USER") or "wslproxy",
            password = os.getenv("WSLPROXY_PG_PASSWORD") or "wslproxy_local_dev",
        }
    }
})

local pg, err = drv:connect()
if not pg then
    print("skip: postgres unavailable: " .. tostring(err))
    os.exit(0)
end

local rec = {
    id = "host:pg-storage-test.example",
    server_name = "pg-storage-test.example",
    ssl_enabled = true,
    extra_nested = { keep = "me" },
}
local saved, werr = drv:update("servers", "prod", rec.id, rec)
if not saved then
    io.stderr:write("FAIL write: " .. tostring(werr) .. "\n")
    os.exit(1)
end
local got, gerr = drv:get("servers", "prod", rec.id)
if not got then
    io.stderr:write("FAIL get: " .. tostring(gerr) .. "\n")
    os.exit(1)
end
if got.extra_nested == nil or got.extra_nested.keep ~= "me" then
    io.stderr:write("FAIL raw_json roundtrip lost nested field\n")
    os.exit(1)
end
drv:delete("servers", "prod", rec.id)
print("ok")
