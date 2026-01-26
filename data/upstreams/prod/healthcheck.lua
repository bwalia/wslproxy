-- Auto-generated health check configuration
-- Generated at: 2026-01-16 11:34:38
-- This file should be included in init_worker_by_lua_block
-- Requires lua-resty-upstream-healthcheck module

-- Health check for upstream: local
local hc = require "resty.upstream.healthcheck"
local ok, err = hc.spawn_checker{
    shm = "healthcheck",
    upstream = "local",
    type = "http",
    http_req = "GET / HTTP/1.0\r\nHost: healthcheck\r\n\r\n",
    interval = 5000,
    timeout = 2000,
    fall = 3,
    rise = 2,
    valid_statuses = {200, 302},
    concurrency = 1,
}
if not ok then
    ngx.log(ngx.ERR, "failed to spawn health checker for local: ", err)
end

