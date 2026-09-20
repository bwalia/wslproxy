-- Contract tests for the optional auth gate.
-- Run: lua test/api_gw/test_auth.lua

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install()

local Config = require("api_gw.config")
local Auth = require("api_gw.auth")

local function cfg_for(auth, extra, server_name)
    local api_gw = { enabled = true, auth = auth }
    for k, v in pairs(extra or {}) do api_gw[k] = v end
    return Config.resolve({ server_name = server_name or "api.example.com", api_gw = api_gw }, nil, "prod")
end

local function run(cfg, ctx)
    return Auth.run(cfg, ctx, Config.policy(cfg, Config.route_for(cfg, ctx.uri, ctx.method)))
end

local function jws(payload, header)
    return Stub.b64url(Cjson.encode(header or { alg = "HS256", typ = "JWT" })) .. "." ..
        Stub.b64url(Cjson.encode(payload)) .. ".signature"
end

-- ─── default is passthrough ─────────────────────────────────────────────────

H.reset()
local cfg = cfg_for({})
local ctx = Stub.context({ uri = "/v1/private" })
A.is_nil(run(cfg, ctx), "the default strategy never rejects — the origin stays authoritative")
A.eq(ctx.auth.strategy, "passthrough", "and reports itself honestly")
A.eq(ctx.auth.result, "passthrough", "with a passthrough result")

-- Passthrough still resolves a subject so rate limiting can key on it.
ctx = Stub.context({ uri = "/v1/private",
    headers = { authorization = "Bearer " .. jws({ sub = "user-42" }) } })
run(cfg, ctx)
A.eq(ctx.consumer, "user-42", "a subject is extracted for rate-limit keying")
A.eq(ctx.consumer_verified, false,
    "and is flagged unverified — it is a fairness key, never an authorisation decision")

H.reset()
local strict_key = cfg_for({ allow_unverified_subject = false })
ctx = Stub.context({ uri = "/v1/x", headers = { authorization = "Bearer " .. jws({ sub = "user-42" }) } })
run(strict_key, ctx)
A.is_nil(ctx.consumer, "a tenant can refuse to key on an unverified claim")

-- ─── public paths ───────────────────────────────────────────────────────────

H.reset()
local protected = cfg_for({ strategy = "api_key", public_paths = { "/health", "/v1/public" },
    api_key = { keys = { "key-abc" } } })

ctx = Stub.context({ uri = "/health" })
A.is_nil(run(protected, ctx), "a public path skips the strategy")
A.eq(ctx.auth.result, "public", "and is recorded as public")

A.is_nil(run(protected, Stub.context({ uri = "/health/live" })), "a child of a public path is public")
A.ok(run(protected, Stub.context({ uri = "/v1/publicadmin" })),
    "an adjacent path is NOT made public by a prefix — the segment-aware match is the point")
A.ok(run(protected, Stub.context({ uri = "/v1/private" })), "a non-public path is enforced")

-- ─── route-level strategy ───────────────────────────────────────────────────

H.reset()
local routed = cfg_for({ strategy = "api_key", api_key = { keys = { "key-abc" } } },
    { routes = {
        { path = "/health", path_key = "equals", auth = "none" },
        { path = "/v1/", auth = "api_key" },
    } })
A.is_nil(run(routed, Stub.context({ uri = "/health" })), "a route can mark itself public")
A.ok(run(routed, Stub.context({ uri = "/v1/orders" })), "and another route can enforce")

-- ─── protected_paths scoping ────────────────────────────────────────────────

H.reset()
local scoped = cfg_for({ strategy = "api_key", protected_paths = { "/v1/admin" },
    api_key = { keys = { "key-abc" } } })
ctx = Stub.context({ uri = "/v1/orders" })
A.is_nil(run(scoped, ctx), "outside protected_paths the strategy does not apply")
A.eq(ctx.auth.result, "out_of_scope", "and says so")
A.ok(run(scoped, Stub.context({ uri = "/v1/admin/users" })), "inside protected_paths it does")

-- ─── api_key strategy ───────────────────────────────────────────────────────

H.reset()
local keyed = cfg_for({ strategy = "api_key",
    api_key = { header = "X-API-Key", query_param = "api_key", keys = { "key-abc", "key-def" } } })

ctx = Stub.context({ uri = "/v1/x", headers = { ["x-api-key"] = "key-abc" } })
A.is_nil(run(keyed, ctx), "a valid key passes")
A.eq(ctx.auth.result, "verified", "and is recorded as verified")
A.ok(ctx.consumer, "a consumer id is produced")
A.eq(ctx.consumer_verified, true, "and marked verified")
A.falsy(ctx.consumer:find("key-abc", 1, true), "the consumer id is a digest, not the key itself")

A.is_nil(run(keyed, Stub.context({ uri = "/v1/x", headers = { ["x-api-key"] = "key-def" } })),
    "a second configured key also works")

local denied = run(keyed, Stub.context({ uri = "/v1/x", headers = { ["x-api-key"] = "wrong" } }))
A.ok(denied, "a wrong key is rejected")
A.eq(denied.status, 401, "with 401")
A.eq(denied.code, "unauthorized", "and a stable code")
A.falsy(denied.message:find("invalid", 1, true),
    "the caller is not told WHY — that is a probing oracle; the reason goes to the audit log")
A.eq(denied.detail.reason, "api_key_invalid", "the reason is available internally")

A.ok(run(keyed, Stub.context({ uri = "/v1/x" })), "a missing key is rejected")

ctx = Stub.context({ uri = "/v1/x", args = { api_key = "key-abc" } })
A.is_nil(run(keyed, ctx), "a key in the configured query parameter works")

-- A tenant that configures no usable key must not accidentally allow everyone.
H.reset()
local keyless = cfg_for({ strategy = "api_key", api_key = { keys = {} } })
local no_keys = run(keyless, Stub.context({ uri = "/v1/x", headers = { ["x-api-key"] = "anything" } }))
A.ok(no_keys, "a strategy with no keys configured rejects rather than admits")
A.eq(no_keys.detail.reason, "key_unavailable", "and says so internally")

-- ─── constant-time compare ──────────────────────────────────────────────────

A.ok(Auth.secure_equals("abc", "abc"), "equal strings compare equal")
A.falsy(Auth.secure_equals("abc", "abd"), "different strings do not")
A.falsy(Auth.secure_equals("abc", "abcd"), "different lengths do not")
A.falsy(Auth.secure_equals("abc", nil), "a nil never matches")
A.falsy(Auth.secure_equals(nil, nil), "two nils never match either")

-- ─── secret resolution ──────────────────────────────────────────────────────

A.eq(Auth.resolve_secret("literal-value"), "literal-value", "a literal passes through")
A.is_nil(Auth.resolve_secret(""), "an empty value resolves to nil")
A.is_nil(Auth.resolve_secret(nil), "a nil resolves to nil")
A.is_nil(Auth.resolve_secret("env://WSLPROXY_TEST_MISSING_VAR"),
    "a missing env var resolves to nil, so the comparison fails closed")
A.is_nil(Auth.resolve_secret("secret://nope#key", "prod"),
    "an unresolvable secret ref resolves to nil, never to the ref string itself")

-- ─── token extraction ───────────────────────────────────────────────────────

local jwt_cfg = { header = "Authorization" }
A.eq(Auth.extract_token(jwt_cfg, Stub.context({ headers = { authorization = "Bearer tok-1" } })), "tok-1",
    "a bearer token is extracted")
A.eq(Auth.extract_token(jwt_cfg, Stub.context({ headers = { authorization = "bearer tok-1" } })), "tok-1",
    "the scheme is case-insensitive")
A.is_nil(Auth.extract_token(jwt_cfg, Stub.context({ headers = { authorization = "tok-1" } })),
    "a bare token in Authorization is not accepted — it is not a credential we recognise")
A.eq(Auth.extract_token({ header = "X-Token" }, Stub.context({ headers = { ["x-token"] = "tok-2" } })), "tok-2",
    "a dedicated header may carry a bare token")
A.is_nil(Auth.extract_token(jwt_cfg, Stub.context({})), "no header means no token")

-- ─── claim validation ───────────────────────────────────────────────────────

local NOW = 1700000000
A.ok(Auth.validate_claims({ sub = "u" }, { leeway = 0 }, NOW), "claims with nothing to check pass")
A.ok(Auth.validate_claims({ exp = NOW + 10 }, { leeway = 0 }, NOW), "an unexpired token passes")
A.falsy(Auth.validate_claims({ exp = NOW - 10 }, { leeway = 0 }, NOW), "an expired token fails")
A.ok(Auth.validate_claims({ exp = NOW - 10 }, { leeway = 60 }, NOW), "leeway covers clock skew")
A.falsy(Auth.validate_claims({ nbf = NOW + 100 }, { leeway = 0 }, NOW), "a not-yet-valid token fails")
A.ok(Auth.validate_claims({ nbf = NOW + 10 }, { leeway = 60 }, NOW), "leeway applies to nbf too")

A.ok(Auth.validate_claims({ iss = "https://idp" }, { issuer = "https://idp" }, NOW), "a matching issuer passes")
A.falsy(Auth.validate_claims({ iss = "https://evil" }, { issuer = "https://idp" }, NOW), "a wrong issuer fails")
A.falsy(Auth.validate_claims({}, { issuer = "https://idp" }, NOW), "a missing issuer fails when one is required")

A.ok(Auth.validate_claims({ aud = "api" }, { audience = "api" }, NOW), "a string audience matches")
A.ok(Auth.validate_claims({ aud = { "web", "api" } }, { audience = "api" }, NOW), "an array audience matches")
A.falsy(Auth.validate_claims({ aud = { "web" } }, { audience = "api" }, NOW), "a wrong audience fails")

local ok, reason = Auth.validate_claims({ exp = NOW - 1 }, { leeway = 0 }, NOW)
A.falsy(ok, "expiry is caught")
A.eq(reason, "expired", "with a specific internal reason")

A.falsy(Auth.validate_claims(nil, {}, NOW), "missing claims fail")

-- ─── jwt strategy without a key ─────────────────────────────────────────────

H.reset()
local unkeyed = cfg_for({ strategy = "jwt", jwt = {} })
local jwt_denied = run(unkeyed, Stub.context({ uri = "/v1/x",
    headers = { authorization = "Bearer " .. jws({ sub = "u" }) } }))
A.ok(jwt_denied, "a jwt strategy with no key rejects — auth is the one place api_gw fails closed")
A.eq(jwt_denied.detail.reason, "key_unavailable", "and the operator error is recorded")
A.contains(jwt_denied.headers["WWW-Authenticate"], "Bearer", "a 401 advertises the scheme")

A.ok(run(unkeyed, Stub.context({ uri = "/v1/x" })), "a missing token is also rejected")

-- ─── unverified claim reading ───────────────────────────────────────────────

local claims = Auth.unverified_claims(jws({ sub = "u-9", role = "admin" }))
A.eq(claims.sub, "u-9", "the payload segment decodes")
A.is_nil(Auth.unverified_claims("not-a-jwt"), "a non-JWS decodes to nil")
A.is_nil(Auth.unverified_claims(nil), "nil decodes to nil")

-- ─── multi-tenant separation ────────────────────────────────────────────────

H.reset()
local tenant_a = cfg_for({ strategy = "api_key", api_key = { keys = { "key-a" } } }, nil, "a.example.com")
local tenant_b = cfg_for({ strategy = "api_key", api_key = { keys = { "key-b" } } }, nil, "b.example.com")

A.is_nil(run(tenant_a, Stub.context({ uri = "/v1/x", headers = { ["x-api-key"] = "key-a" } })),
    "tenant A accepts its own key")
A.ok(run(tenant_b, Stub.context({ uri = "/v1/x", headers = { ["x-api-key"] = "key-a" } })),
    "tenant B rejects tenant A's key")

-- The same consumer identity hashes differently per tenant.
local a_ctx = Stub.context({ uri = "/v1/x", headers = { ["x-api-key"] = "key-a" } })
local b_ctx = Stub.context({ uri = "/v1/x", headers = { ["x-api-key"] = "key-b" } })
run(tenant_a, a_ctx); run(tenant_b, b_ctx)
A.ne(a_ctx.consumer, b_ctx.consumer, "consumer ids do not collide across tenants")

-- Two tenants can run different strategies side by side.
H.reset()
local passthrough_tenant = cfg_for({}, nil, "c.example.com")
A.is_nil(run(passthrough_tenant, Stub.context({ uri = "/v1/x" })),
    "a passthrough tenant is unaffected by an enforcing neighbour")
A.ok(run(tenant_a, Stub.context({ uri = "/v1/x" })), "while the enforcing tenant still enforces")

A.done("test_auth")
