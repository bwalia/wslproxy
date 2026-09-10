-- Contract tests for api/secrets_crypto.lua (AES-256-GCM at rest).
--
-- Requires the OpenResty resty CLI (uses resty.aes and ngx.encode_base64):
--   SECRETS_ENCRYPTION_KEY=<b64> resty test/secrets/test_secrets_crypto.lua
--
-- The key must decode to 32 raw bytes.  Generate one with:
--   ./scripts/generate-secrets-encryption-key.sh

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local failures = 0
local function assert_eq(a, b, msg)
    if a ~= b then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "") .. " expected " .. tostring(b) .. " got " .. tostring(a) .. "\n")
    end
end
local function assert_true(v, msg)
    if not v then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "expected truthy") .. "\n")
    end
end
local function assert_nil(v, msg)
    if v ~= nil then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "expected nil") .. " got " .. tostring(v) .. "\n")
    end
end

local Crypto = require "secrets_crypto"

assert_true(Crypto.is_configured(), "SECRETS_ENCRYPTION_KEY must be set")

-- Round-trip on a normal payload
local pt = "hello world jwt PEM content 12345"
local blob = assert(Crypto.encrypt(pt))
assert_eq(blob.encrypted, true, "encrypted flag")
assert_eq(blob.alg, "aes-256-gcm", "algorithm")
assert_true(#blob.ciphertext > 0, "ciphertext non-empty")
assert_true(#blob.iv > 0, "iv non-empty")
assert_true(#blob.tag > 0, "tag non-empty")
assert_eq(Crypto.decrypt(blob), pt, "round-trip plaintext match")

-- Empty payload
local blob2 = assert(Crypto.encrypt(""))
assert_eq(Crypto.decrypt(blob2), "", "empty round-trip")

-- Large payload
local big = string.rep("x", 4096)
assert_eq(Crypto.decrypt(assert(Crypto.encrypt(big))), big, "4k round-trip")

-- Two encrypts of the same plaintext produce different ciphertext (fresh IV)
local a, b = Crypto.encrypt(pt), Crypto.encrypt(pt)
assert_true(a.ciphertext ~= b.ciphertext, "each encryption uses a fresh IV")

-- Tamper detection: flip a byte of the ciphertext → decrypt refuses
local tampered = {
    encrypted = true, alg = blob.alg,
    ciphertext = blob.ciphertext:sub(1, -3) .. "AA",
    iv = blob.iv, tag = blob.tag,
}
local out, err = Crypto.decrypt(tampered)
assert_nil(out, "tampered ciphertext must not decrypt")
assert_true(err and err:find("decrypt failed", 1, true) ~= nil, "clear decrypt error")

-- is_encrypted_blob detects real blobs and rejects strings / partials
assert_true(Crypto.is_encrypted_blob(blob), "real blob passes")
assert_true(not Crypto.is_encrypted_blob("plain string"), "string rejected")
assert_true(not Crypto.is_encrypted_blob({ encrypted = true }), "missing fields rejected")

if failures > 0 then
    io.stderr:write(failures .. " FAIL(s)\n")
    os.exit(1)
end
print("test_secrets_crypto: OK")
