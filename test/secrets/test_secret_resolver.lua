-- Contract tests for api/secret_resolver.lua + the resolver hook in
-- rule_loader.M.load_rule (Phase 3).
--
-- Requires the OpenResty resty CLI:
--   SECRETS_ENCRYPTION_KEY=<b64> resty test/secrets/test_secret_resolver.lua

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local cjson = require "cjson"
_G.Cjson = cjson
_G.Base64 = { encode = ngx.encode_base64, decode = ngx.decode_base64 }

local failures = 0
local function assert_eq(a, b, msg)
    if a ~= b then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "") .. " expected " .. tostring(b) .. " got " .. tostring(a) .. "\n")
    end
end
local function assert_nil(v, msg)
    if v ~= nil then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "expected nil") .. " got " .. tostring(v) .. "\n")
    end
end

local Crypto = require "secrets_crypto"
local Resolver = require "secret_resolver"
local RuleLoader = require "rule_loader"

assert(Crypto.is_configured(), "SECRETS_ENCRYPTION_KEY must be set")

local ROOT = "/tmp/secrets_test/"
os.execute("rm -rf " .. ROOT)
os.execute("mkdir -p " .. ROOT .. "data/secrets/prod")
os.execute("mkdir -p " .. ROOT .. "data/rules/prod")

local function write(path, obj)
    local f = assert(io.open(path, "wb"))
    f:write(cjson.encode(obj))
    f:close()
end

-- ─── ref parsing ────────────────────────────────────────────────────────────

assert_eq(Resolver.is_ref("secret://a#b"), true, "ref true")
assert_eq(Resolver.is_ref("plain"), false, "plain false")
assert_eq(Resolver.is_ref(""), false, "empty false")
assert_eq(Resolver.is_ref(nil), false, "nil false")

local p, err = Resolver.parse_ref("secret://rec-1#jwt_key")
assert_eq(err, nil, "parse valid ref: no error")
assert_eq(p.record_id, "rec-1", "parse record_id")
assert_eq(p.key, "jwt_key", "parse key")

assert_nil(Resolver.parse_ref("secret://onlyid"), "missing #key rejected")
assert_nil(Resolver.parse_ref("secret://#nokey"), "empty record_id rejected")
assert_nil(Resolver.parse_ref("secret://a#"), "empty key rejected")
assert_nil(Resolver.parse_ref("not-a-ref"), "non-prefix rejected")

-- ─── set up a secret record + rules ─────────────────────────────────────────

local jwt_blob = Crypto.encrypt("MY_JWT_SIGNING_KEY_BASE64")
local s3_blob = Crypto.encrypt("AKIAABCDEF12345")
write(ROOT .. "data/secrets/prod/rec-abc.json", {
    id = "rec-abc", secret_name = "acme-creds",
    secrets = {
        { key = "jwt_key",   value = jwt_blob },
        { key = "s3_access", value = s3_blob },
    },
})

-- Legacy-Base64 record (pre-encryption era)
write(ROOT .. "data/secrets/prod/rec-legacy.json", {
    id = "rec-legacy", secret_name = "legacy-creds",
    secrets = {
        { key = "old_key", value = ngx.encode_base64("legacy-plaintext") },
    },
})

-- Rule 1: mixed refs + inline
write(ROOT .. "data/rules/prod/rule-1.json", {
    id = "rule-1", name = "mixed", _schema_version = 2,
    match = {
        rules = {
            path = "/", path_key = "starts_with",
            jwt_token_validation_key = "secret://rec-abc#jwt_key",
            amazon_s3_access_key = "secret://rec-abc#s3_access",
            amazon_s3_secret_key = "AKIAINLINE",
        },
        response = { code = 305 },
    },
})

-- Rule 2: inline only (regression check)
write(ROOT .. "data/rules/prod/rule-2.json", {
    id = "rule-2", name = "inline", _schema_version = 2,
    match = {
        rules = {
            path = "/", path_key = "starts_with",
            amazon_s3_access_key = "INLINE_A",
            amazon_s3_secret_key = "INLINE_S",
        },
        response = { code = 305 },
    },
})

-- Rule 3: broken ref
write(ROOT .. "data/rules/prod/rule-3.json", {
    id = "rule-3", name = "broken", _schema_version = 2,
    match = {
        rules = {
            path = "/", path_key = "starts_with",
            jwt_token_validation_key = "secret://does-not-exist#anything",
        },
        response = { code = 305 },
    },
})

-- Rule 4: legacy Base64 secret store
write(ROOT .. "data/rules/prod/rule-4.json", {
    id = "rule-4", name = "legacy-secret-ref", _schema_version = 2,
    match = {
        rules = {
            path = "/", path_key = "starts_with",
            jwt_token_validation_key = "secret://rec-legacy#old_key",
        },
        response = { code = 305 },
    },
})

-- ─── resolver via load_rule ─────────────────────────────────────────────────

local r1 = RuleLoader.load_rule("rule-1", ROOT, "prod")
assert_eq(r1.match.rules.jwt_token_validation_key,
    "MY_JWT_SIGNING_KEY_BASE64", "encrypted ref resolves")
assert_eq(r1.match.rules.amazon_s3_access_key, "AKIAABCDEF12345", "s3 ref resolves")
assert_eq(r1.match.rules.amazon_s3_secret_key, "AKIAINLINE", "inline preserved")

local r2 = RuleLoader.load_rule("rule-2", ROOT, "prod")
assert_eq(r2.match.rules.amazon_s3_access_key, "INLINE_A", "inline s3_a untouched")
assert_eq(r2.match.rules.amazon_s3_secret_key, "INLINE_S", "inline s3_s untouched")

local r3 = RuleLoader.load_rule("rule-3", ROOT, "prod")
assert_nil(r3.match.rules.jwt_token_validation_key, "broken ref dropped (fail-open)")

local r4 = RuleLoader.load_rule("rule-4", ROOT, "prod")
assert_eq(r4.match.rules.jwt_token_validation_key,
    "legacy-plaintext", "legacy Base64 secret store resolves")

-- ─── per-request cache holds ────────────────────────────────────────────────

-- ngx.ctx is per-request in production; in the resty CLI it's global-ish.
-- Two calls in the same "request" should not re-read the same file — hard to
-- prove without touching the disk, so we just re-verify correctness.
local r1_again = RuleLoader.load_rule("rule-1", ROOT, "prod")
assert_eq(r1_again.match.rules.jwt_token_validation_key,
    "MY_JWT_SIGNING_KEY_BASE64", "second load still resolves")

os.execute("rm -rf " .. ROOT)

if failures > 0 then
    io.stderr:write(failures .. " FAIL(s)\n")
    os.exit(1)
end
print("test_secret_resolver: OK")
