-- Contract tests for the structured audit line, especially redaction.
-- Run: lua test/api_gw/test_audit.lua

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local Audit = require("api_gw.audit")

local function cfg_for(audit, server_name)
    return Config.resolve({ server_name = server_name or "api.example.com",
        api_gw = { enabled = true, audit = audit } }, nil, "prod")
end

local SENSITIVE_HEADERS = {
    authorization = "Bearer super-secret-token",
    cookie = "session=deadbeef",
    ["x-api-key"] = "sk_live_abcdef",
    ["x-request-id"] = "req-1",
    ["user-agent"] = "curl/8.0",
}

-- ─── the record ─────────────────────────────────────────────────────────────

H.reset()
local cfg = cfg_for({})
local ctx = Stub.context({
    method = "POST", uri = "/v1/orders", client_ip = "198.51.100.7",
    correlation_id = "corr-1", route_name = "/v1/",
    headers = SENSITIVE_HEADERS,
})
ctx.auth = { strategy = "api_key", result = "verified" }
ctx.consumer = "consumer-9"
ctx.consumer_verified = true
ctx.rate_limit = { profile = "standard", result = "allowed", count = 3, limit = 600 }
ctx.ivt = { mode = "audit", verdict = "noisy", score = 1,
    findings = { { signal = "header_spoof" } } }

local rec = Audit.build(cfg, ctx, { status = 200, latency_ms = 12, bytes_sent = 900 })

A.eq(rec.tenant, "prod/api.example.com", "the record is tenant-scoped")
A.eq(rec.server, "api.example.com", "and names the server")
A.eq(rec.profile, "prod", "and the environment profile")
A.eq(rec.method, "POST", "method is recorded")
A.eq(rec.path, "/v1/orders", "path is recorded")
A.eq(rec.status, 200, "status is recorded")
A.eq(rec.latency_ms, 12, "latency is recorded")
A.eq(rec.correlation_id, "corr-1", "the correlation id ties the line to the request")
A.eq(rec.route, "/v1/", "the matched route class is recorded")
A.eq(rec.auth.result, "verified", "the auth outcome is recorded")
A.eq(rec.rate_limit.profile, "standard", "the rate profile is recorded")
A.eq(rec.ivt.verdict, "noisy", "the IVT verdict is recorded")
A.set_eq(rec.ivt.signals, { "header_spoof" }, "with its signals")

-- ─── REDACTION ──────────────────────────────────────────────────────────────
-- The whole point of the module. If any of these stop holding, the audit log
-- becomes a credential store.

local encoded = Cjson.encode(rec)
A.falsy(encoded:find("super-secret-token", 1, true), "the bearer token never reaches the log line")
A.falsy(encoded:find("deadbeef", 1, true), "the session cookie never reaches the log line")
A.falsy(encoded:find("sk_live_abcdef", 1, true), "the api key never reaches the log line")
A.falsy(encoded:find("consumer-9", 1, true), "the raw consumer id is hashed, not logged")
A.falsy(encoded:find("198.51.100.7", 1, true), "the raw client IP is hashed by default")

A.ok(rec.client_key_hash, "a client key hash is present for correlation")
A.ne(rec.client_key_hash, "198.51.100.7", "and it is not the IP")
A.ok(rec.auth.consumer_hash, "a consumer hash is present")
A.ne(rec.auth.consumer_hash, "consumer-9", "and it is not the consumer id")

-- The same client hashes differently for a different tenant.
local other = Audit.build(cfg_for({}, "b.example.com"), ctx, { status = 200 })
A.ne(other.client_key_hash, rec.client_key_hash, "client hashes do not correlate across tenants")

-- A tenant cannot opt into logging credentials by naming them explicitly.
H.reset()
local greedy = cfg_for({ include_headers = { "Authorization", "Cookie", "X-API-Key", "X-Request-Id" },
    redact_headers = {} })
local greedy_rec = Audit.build(greedy, Stub.context({ headers = SENSITIVE_HEADERS }), { status = 200 })
A.is_nil(greedy_rec.headers and greedy_rec.headers["authorization"],
    "an explicitly requested Authorization header is still dropped")
A.is_nil(greedy_rec.headers and greedy_rec.headers["cookie"], "so is Cookie")
A.is_nil(greedy_rec.headers and greedy_rec.headers["x-api-key"], "so is X-API-Key")
A.eq(greedy_rec.headers["x-request-id"], "req-1", "a harmless header is captured as asked")

-- A header value cannot bloat the line without bound.
H.reset()
local long = cfg_for({ include_headers = { "X-Big" } })
local long_rec = Audit.build(long, Stub.context({ headers = { ["x-big"] = string.rep("a", 5000) } }),
    { status = 200 })
A.ok(#long_rec.headers["x-big"] < 300, "captured header values are truncated")

-- ─── opt-ins ────────────────────────────────────────────────────────────────

H.reset()
local with_ip = cfg_for({ include_client_ip = true })
local ip_rec = Audit.build(with_ip, Stub.context({ client_ip = "198.51.100.7" }), { status = 200 })
A.eq(ip_rec.client_ip, "198.51.100.7", "a tenant can opt into raw client IPs")

H.reset()
local no_query = cfg_for({})
local q_ctx = Stub.context({ query = "token=secret&page=2" })
A.is_nil(Audit.build(no_query, q_ctx, { status = 200 }).query,
    "the query string is NOT logged by default — it routinely carries tokens")

local with_query = cfg_for({ include_query = true })
A.eq(Audit.build(with_query, q_ctx, { status = 200 }).query, "token=secret&page=2",
    "but a tenant can opt in explicitly")

local long_q = cfg_for({ include_query = true })
local lq = Audit.build(long_q, Stub.context({ query = string.rep("x", 2000) }), { status = 200 })
A.ok(#lq.query < 600, "and even then it is truncated")

-- ─── sampling ───────────────────────────────────────────────────────────────

local full = cfg_for({}).audit
A.ok(Audit.should_emit(full, Stub.context({}), 200), "sample_rate 1 emits everything")

local none = cfg_for({ sample_rate = 0 }).audit
A.falsy(Audit.should_emit(none, Stub.context({}), 200), "sample_rate 0 drops ordinary traffic")
A.ok(Audit.should_emit(none, Stub.context({}), 401),
    "but a 4xx is always kept — a sampled trail that drops the 401s is useless")
A.ok(Audit.should_emit(none, Stub.context({}), 500), "and so is a 5xx")

local denied_ctx = Stub.context({})
denied_ctx.decision = { action = "deny", module = "rate_limit", code = "rate_limited", status = 429 }
A.ok(Audit.should_emit(none, denied_ctx, 429), "a gateway rejection is always kept")

local off = cfg_for({ enabled = false }).audit
A.falsy(Audit.should_emit(off, Stub.context({}), 500), "a disabled audit module emits nothing at all")

-- ─── emission ───────────────────────────────────────────────────────────────

H.reset()
A.ok(Audit.emit(cfg, ctx, { status = 200, latency_ms = 5 }), "emit reports success")
A.eq(#H.logs, 1, "exactly one line is written")
A.contains(H.logs[1].message, "wsl_api_gw ", "the line is tagged for the log shipper")
A.contains(H.logs[1].message, '"tenant":', "and is JSON")
A.falsy(H.logs[1].message:find("super-secret-token", 1, true), "and carries no credential")

H.reset()
local tagged = cfg_for({ tag = "acme_gw" })
Audit.emit(tagged, Stub.context({}), { status = 200 })
A.contains(H.logs[1].message, "acme_gw ", "the tag is configurable per tenant")

A.done("test_audit")
