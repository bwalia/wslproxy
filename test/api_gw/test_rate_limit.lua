-- Contract tests for rate limiting, including cross-tenant isolation.
-- Run: lua test/api_gw/test_rate_limit.lua

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local RateLimit = require("api_gw.rate_limit")
local Store = require("api_gw.store")

local function cfg_for(server_name, api_gw, profile)
    local s = { server_name = server_name }
    s.api_gw = api_gw
    return Config.resolve(s, nil, profile or "prod")
end

local BASIC = {
    enabled = true,
    rate_limit = {
        default_profile = "tight",
        algorithm = "fixed",
        profiles = { tight = { limit = 3, window_seconds = 60, key = "ip" } },
    },
}

local function hit(cfg, ctx)
    local policy = Config.policy(cfg, nil)
    return RateLimit.run(cfg, ctx, policy)
end

-- ─── the limit is enforced ──────────────────────────────────────────────────

H.reset()
local cfg = cfg_for("a.example.com", BASIC)
local ctx = Stub.context({ client_ip = "198.51.100.1" })

for i = 1, 3 do
    A.is_nil(hit(cfg, ctx), "request " .. i .. " of 3 is allowed")
end
A.eq(ctx.rate_limit.count, 3, "counter reached the limit")
A.eq(ctx.rate_limit.result, "allowed", "at the limit is still allowed")

local decision = hit(cfg, ctx)
A.ok(decision, "the fourth request is rejected")
A.eq(decision.status, 429, "rejection uses 429")
A.eq(decision.code, "rate_limited", "rejection carries a stable error code")
A.eq(decision.module, "rate_limit", "rejection names the module")
A.ok(decision.headers["Retry-After"], "rejection carries Retry-After")

-- ─── headers ────────────────────────────────────────────────────────────────

H.reset()
ctx = Stub.context({ client_ip = "198.51.100.1" })
hit(cfg, ctx)
A.eq(ctx.response_headers["RateLimit-Limit"], "3", "standard limit header")
A.eq(ctx.response_headers["RateLimit-Remaining"], "2", "standard remaining header")
A.ok(ctx.response_headers["RateLimit-Reset"], "standard reset header")
A.eq(ctx.response_headers["X-RateLimit-Limit"], "3", "legacy limit header")

H.reset()
local no_legacy = cfg_for("a.example.com", {
    enabled = true,
    rate_limit = {
        default_profile = "tight", algorithm = "fixed",
        profiles = { tight = { limit = 3, window_seconds = 60, key = "ip" } },
        headers = { legacy = false },
    },
})
ctx = Stub.context({ client_ip = "198.51.100.1" })
hit(no_legacy, ctx)
A.ok(ctx.response_headers["RateLimit-Limit"], "standard headers stay on")
A.is_nil(ctx.response_headers["X-RateLimit-Limit"], "legacy headers can be switched off")

-- ─── MULTI-TENANT ISOLATION ─────────────────────────────────────────────────
-- Two servers, same policy, same client IP, same worker, same shared dict.
-- Exhausting one must leave the other untouched.

H.reset()
local tenant_a = cfg_for("a.example.com", BASIC)
local tenant_b = cfg_for("b.example.com", BASIC)
local same_client = "203.0.113.77"

for i = 1, 4 do hit(tenant_a, Stub.context({ client_ip = same_client })) end
local a_blocked = hit(tenant_a, Stub.context({ client_ip = same_client }))
A.ok(a_blocked, "tenant A is exhausted")

local b_ctx = Stub.context({ client_ip = same_client })
A.is_nil(hit(tenant_b, b_ctx), "tenant B is unaffected by tenant A's traffic")
A.eq(b_ctx.rate_limit.count, 1, "tenant B's counter started from zero")

-- Same hostname in a different environment profile is a different tenant too.
H.reset()
local prod = cfg_for("a.example.com", BASIC, "prod")
local int = cfg_for("a.example.com", BASIC, "int")
for i = 1, 4 do hit(prod, Stub.context({ client_ip = same_client })) end
A.ok(hit(prod, Stub.context({ client_ip = same_client })), "prod is exhausted")
local int_ctx = Stub.context({ client_ip = same_client })
A.is_nil(hit(int, int_ctx), "int is a separate tenant")
A.eq(int_ctx.rate_limit.count, 1, "int's counter started from zero")

-- An explicit shared tenant_id is how you opt INTO a shared quota.
H.reset()
local shared_a = cfg_for("a.example.com", { enabled = true, tenant_id = "acme",
    rate_limit = { default_profile = "tight", algorithm = "fixed",
        profiles = { tight = { limit = 3, window_seconds = 60, key = "ip" } } } })
local shared_b = cfg_for("b.example.com", { enabled = true, tenant_id = "acme",
    rate_limit = { default_profile = "tight", algorithm = "fixed",
        profiles = { tight = { limit = 3, window_seconds = 60, key = "ip" } } } })
hit(shared_a, Stub.context({ client_ip = same_client }))
local shared_ctx = Stub.context({ client_ip = same_client })
hit(shared_b, shared_ctx)
A.eq(shared_ctx.rate_limit.count, 2, "an explicit shared tenant_id shares the quota on purpose")

-- ─── per-route profiles ─────────────────────────────────────────────────────

H.reset()
local routed = cfg_for("a.example.com", {
    enabled = true,
    rate_limit = {
        default_profile = "standard", algorithm = "fixed",
        profiles = {
            standard = { limit = 100, window_seconds = 60, key = "ip" },
            login    = { limit = 2,   window_seconds = 60, key = "ip" },
        },
    },
    routes = {
        { path = "/v1/login", rate_profile = "login" },
        { path = "/",         rate_profile = "standard" },
    },
})

local function hit_path(cfg_in, uri, client)
    local c = Stub.context({ client_ip = client, uri = uri })
    local route = Config.route_for(cfg_in, uri, "GET")
    return RateLimit.run(cfg_in, c, Config.policy(cfg_in, route)), c
end

local client = "198.51.100.55"
hit_path(routed, "/v1/login", client)
hit_path(routed, "/v1/login", client)
local d3 = hit_path(routed, "/v1/login", client)
A.ok(d3, "the tight login profile blocks on the third attempt")

local _, other_ctx = hit_path(routed, "/v1/orders", client)
A.eq(other_ctx.rate_limit.result, "allowed", "a different route class has its own counter")
A.eq(other_ctx.rate_limit.profile, "standard", "and its own profile")

-- ─── key selection ──────────────────────────────────────────────────────────

H.reset()
local by_consumer = cfg_for("a.example.com", {
    enabled = true,
    rate_limit = { default_profile = "p", algorithm = "fixed",
        profiles = { p = { limit = 2, window_seconds = 60, key = "consumer" } } },
})
local c1 = Stub.context({ client_ip = "198.51.100.1", consumer = "user-1" })
local c2 = Stub.context({ client_ip = "198.51.100.1", consumer = "user-2" })
hit(by_consumer, c1); hit(by_consumer, c1)
A.ok(hit(by_consumer, c1), "consumer 1 is exhausted")
A.is_nil(hit(by_consumer, c2), "consumer 2 behind the same IP is independent")

-- No consumer resolved: fall back to the IP, never to one shared bucket.
H.reset()
local anon1 = Stub.context({ client_ip = "198.51.100.10" })
local anon2 = Stub.context({ client_ip = "198.51.100.11" })
hit(by_consumer, anon1); hit(by_consumer, anon1)
A.ok(hit(by_consumer, anon1), "an anonymous caller is limited by IP")
A.eq(anon1.rate_limit.key_kind, "ip", "the fallback key kind is reported honestly")
A.is_nil(hit(by_consumer, anon2), "another anonymous IP is not punished for the first one")

H.reset()
local by_header = cfg_for("a.example.com", {
    enabled = true,
    rate_limit = { default_profile = "p", algorithm = "fixed",
        profiles = { p = { limit = 1, window_seconds = 60, key = "header", header = "X-Partner" } } },
})
local p1 = Stub.context({ headers = { ["x-partner"] = "alpha" } })
local p2 = Stub.context({ headers = { ["x-partner"] = "beta" } })
hit(by_header, p1)
A.ok(hit(by_header, p1), "partner alpha is limited")
A.is_nil(hit(by_header, p2), "partner beta is independent")

-- ─── unlimited and unknown profiles ─────────────────────────────────────────

H.reset()
local unlimited = cfg_for("a.example.com", {
    enabled = true,
    rate_limit = { default_profile = "health", algorithm = "fixed" },
})
local u_ctx = Stub.context({})
for _ = 1, 50 do A.is_nil(RateLimit.run(unlimited, u_ctx, Config.policy(unlimited, nil))) end
A.eq(u_ctx.rate_limit.result, "unlimited", "limit 0 means unlimited")

H.reset()
local bad_ref = cfg_for("a.example.com", { enabled = true,
    rate_limit = { default_profile = "standard" },
    routes = { { path = "/", rate_profile = "does_not_exist" } } })
local bad_ctx = Stub.context({ uri = "/" })
local bad_policy = Config.policy(bad_ref, Config.route_for(bad_ref, "/"))
A.is_nil(RateLimit.run(bad_ref, bad_ctx, bad_policy), "an unknown profile does not block traffic")
A.eq(bad_ctx.rate_limit.result, "unknown_profile", "and the misconfiguration is recorded")

-- ─── disabled module ────────────────────────────────────────────────────────

H.reset()
local off = cfg_for("a.example.com", { enabled = true, rate_limit = { enabled = false, default_profile = "tight",
    profiles = { tight = { limit = 1, window_seconds = 60 } } } })
local off_ctx = Stub.context({})
for _ = 1, 10 do A.is_nil(RateLimit.run(off, off_ctx, Config.policy(off, nil))) end
A.is_nil(off_ctx.rate_limit, "a disabled limiter records nothing and blocks nothing")

-- ─── fail-open when the shared dict is missing ──────────────────────────────

H.reset()
local saved = ngx.shared
ngx.shared = {}
Store.reset()
local failopen_ctx = Stub.context({})
for _ = 1, 10 do
    A.is_nil(RateLimit.run(cfg, failopen_ctx, Config.policy(cfg, nil)),
        "traffic keeps flowing when the shared dict is missing")
end
A.eq(failopen_ctx.rate_limit.result, "unavailable", "and the infra failure is recorded, not hidden")
ngx.shared = saved
Store.reset()

-- ─── window behaviour ───────────────────────────────────────────────────────

H.reset()
local windowed = cfg_for("a.example.com", {
    enabled = true,
    rate_limit = { default_profile = "w", algorithm = "fixed",
        profiles = { w = { limit = 2, window_seconds = 10, key = "ip" } } },
})
local w_ctx = Stub.context({ client_ip = "198.51.100.90" })
hit(windowed, w_ctx); hit(windowed, w_ctx)
A.ok(hit(windowed, w_ctx), "limit reached inside the window")
H.advance(11)
A.is_nil(hit(windowed, w_ctx), "the window rolls over and the quota is restored")

-- Sliding windows carry a weighted share of the previous bucket forward, so
-- the fixed-window boundary burst is smoothed instead of doubling the limit.
H.reset()
local sliding = cfg_for("a.example.com", {
    enabled = true,
    rate_limit = { default_profile = "w", algorithm = "sliding",
        profiles = { w = { limit = 10, window_seconds = 10, key = "ip" } } },
})
local s_ctx = Stub.context({ client_ip = "198.51.100.91" })
for _ = 1, 10 do hit(sliding, s_ctx) end
H.advance(10) -- straight into the next bucket
local after = Stub.context({ client_ip = "198.51.100.91" })
hit(sliding, after)
A.ok(after.rate_limit.count > 1,
    "the previous window still counts immediately after the boundary")

A.done("test_rate_limit")
