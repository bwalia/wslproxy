-- Contract tests for tenant key isolation.
-- Run: lua test/api_gw/test_keys.lua
--
-- This file is the isolation guarantee. If any assertion here stops holding,
-- two tenants can share a rate-limit bucket.

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
Stub.install()

local Keys = require("api_gw.keys")

-- ─── tenant identity ────────────────────────────────────────────────────────

A.eq(Keys.tenant_id({ server_name = "a.example.com" }, "prod"), "prod/a.example.com",
    "tenant defaults to profile/server")
A.eq(Keys.tenant_id({ server_name = "a.example.com" }, "int"), "int/a.example.com",
    "same host in another profile is another tenant")
A.eq(Keys.tenant_id({ server_name = "a.example.com", api_gw = { tenant_id = "acme" } }, "prod"), "acme",
    "explicit tenant_id wins")
A.eq(Keys.tenant_id({ id = "host:b.example.com" }, "prod"), "prod/host:b.example.com",
    "falls back to id when server_name is absent")
A.eq(Keys.tenant_id({ server_name = "a.example.com" }, nil), "default/a.example.com",
    "missing profile still produces a tenant")

-- ─── key construction ───────────────────────────────────────────────────────

local k1 = Keys.build("prod/a.example.com", "rate_limit", "standard", "ip", "abc")
local k2 = Keys.build("prod/b.example.com", "rate_limit", "standard", "ip", "abc")
A.ne(k1, k2, "identical policy + identical client must not collide across tenants")
A.contains(k1, "prod/a.example.com", "key carries the tenant prefix")
A.contains(k1, ":rate_limit:", "key carries the module")

A.ne(Keys.build("t", "rate_limit", "x"), Keys.build("t", "ivt", "x"),
    "modules are separated inside a tenant")

-- The separator-forgery case: without escaping, ("a", "b:c") and ("a:b", "c")
-- would build the same string and silently share a counter.
A.ne(Keys.build("a", "m", "b:c"), Keys.build("a:b", "m", "c"),
    "a colon in key material cannot forge a tenant boundary")
A.ne(Keys.build("a%3Ab", "m", "c"), Keys.build("a:b", "m", "c"),
    "a pre-escaped colon cannot forge a tenant boundary either")

A.eq(Keys.escape("a:b"), "a%3Ab", "colon is escaped")
A.eq(Keys.escape("a%b"), "a%25b", "percent is escaped first")
A.eq(Keys.escape(""), "-", "empty material gets a placeholder")
A.eq(Keys.escape(nil), "-", "nil material gets a placeholder")

-- Same inputs must always produce the same key, or counters reset per request.
A.eq(Keys.build("t", "m", "a", "b"), Keys.build("t", "m", "a", "b"), "key construction is deterministic")

-- ─── identity hashing ───────────────────────────────────────────────────────

local ip = "198.51.100.4"
A.ne(Keys.hash("tenant-a", ip), Keys.hash("tenant-b", ip),
    "the same client hashes differently per tenant (salted)")
A.eq(Keys.hash("tenant-a", ip), Keys.hash("tenant-a", ip), "hashing is stable")
A.eq(#Keys.hash("t", ip), 16, "default digest length")
A.eq(#Keys.hash("t", ip, 8), 8, "digest length is configurable")
A.eq(Keys.hash("t", nil), "anon", "absent identity hashes to a constant")
A.eq(Keys.hash("t", ""), "anon", "empty identity hashes to a constant")

-- The point of hashing: the raw value never survives into a key or a log.
local secret = "sk_live_supersecret"
A.falsy(Keys.hash("t", secret):find("supersecret", 1, true), "digest does not leak the input")

A.done("test_keys")
