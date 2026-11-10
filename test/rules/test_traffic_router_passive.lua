-- Contract tests for traffic_router passive health.
-- Run: lua test/rules/test_traffic_router_passive.lua (luajit and `resty` also work)
--
-- Regression: passive marking was keyed by backend LABEL ("k3s1") while
-- is_backend_healthy() reads by ADDRESS, and it only saw the final status, so a
-- primary rescued by a failover retry ("503, 200") was never marked down.

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local failures = 0
local function check(v, msg)
    if not v then failures = failures + 1; io.stderr:write("FAIL: " .. msg .. "\n") end
end

-- ─── minimal ngx stub with a shared dict ────────────────────────────────────
local store = {}
local dict = {}
function dict:get(k) return store[k] end
function dict:set(k, v) store[k] = v; return true end
function dict:incr(k, by, init) store[k] = (tonumber(store[k]) or init or 0) + by; return store[k] end

_G.ngx = {
    shared = { router_state = dict },
    worker = { pid = function() return 1 end, id = function() return 1 end },
    now = function() return 0 end,
    log = function() end, WARN = 4, ERR = 3, INFO = 7,
}
package.loaded["cjson.safe"] = { decode = function() return nil end, encode = function() return "" end }

local TR = require("traffic_router")
local RULE, K3S, S3 = "wsw-k3s1-s3-failover", "193.237.176.232:8888", "http://s3.example:80"

check(TR.is_backend_healthy(RULE, K3S), "no data: healthy")

-- Two failed attempts rescued by S3: not yet down.
TR.record_upstream_attempts(RULE, { K3S, S3 }, "503, 200")
TR.record_upstream_attempts(RULE, { K3S, S3 }, "502, 200")
check(TR.is_backend_healthy(RULE, K3S), "2 failures: still healthy")
check(TR.is_backend_healthy(RULE, S3), "S3 served 200s: healthy")

-- Third consecutive failure (a timeout) marks the primary down, by ADDRESS.
TR.record_upstream_attempts(RULE, { K3S, S3 }, "504, 200")
check(not TR.is_backend_healthy(RULE, K3S), "3 consecutive failures: primary down")
check(TR.is_backend_healthy(RULE, S3), "S3 stays healthy")

-- An active probe that passes (e.g. Traefik 404 for a host-less probe) must
-- not clear the passive mark.
TR.set_backend_health = TR.set_backend_health  -- real function; needs prometheus optional
package.loaded["prometheus_metrics"] = { get_metric_backend_health = function() return nil end }
TR.set_backend_health(RULE, K3S, true)
check(not TR.is_backend_healthy(RULE, K3S), "passing active probe does not clear passive mark")

-- Selection skips the passively-down primary.
local picked = TR.select_backend({
    rule_id = RULE,
    routing = { mode = "failover" },
    backends = { { label = "k3s1", weight = 100, address = K3S }, { label = "s3", weight = 1, address = S3 } },
}, {})
check(picked and picked.address == S3, "failover selects S3 while primary is passively down")

-- A success resets the streak.
local R2 = "other-rule"
TR.record_upstream_attempts(R2, { K3S }, "503")
TR.record_upstream_attempts(R2, { K3S }, "503")
TR.record_upstream_attempts(R2, { K3S }, "200")
TR.record_upstream_attempts(R2, { K3S }, "503")
check(TR.is_backend_healthy(R2, K3S), "a success between failures resets the streak")

-- 404 is a valid answer, "-" is unknown: neither marks a backend down.
local R3 = "r3"
for _ = 1, 5 do TR.record_upstream_attempts(R3, { K3S }, "404") end
for _ = 1, 5 do TR.record_upstream_attempts(R3, { K3S }, "-") end
check(TR.is_backend_healthy(R3, K3S), "404s and '-' do not mark down")

-- Internal redirects (" : ") are parsed as further attempts.
local R4 = "r4"
TR.record_upstream_attempts(R4, { K3S, S3, K3S }, "503, 200 : 503")
TR.record_upstream_attempts(R4, { K3S }, "503")
check(not TR.is_backend_healthy(R4, K3S), "' : ' separated statuses counted")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n"); os.exit(1)
end
print("ok")
