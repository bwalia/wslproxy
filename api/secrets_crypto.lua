-- api/secrets_crypto.lua
-- Encrypt / decrypt secret values with AES-256-GCM.
--
-- Key source: env var SECRETS_ENCRYPTION_KEY (base64 of 32 raw bytes).
--   Populated via data/settings.json env_vars block, same as
--   JWT_SECURITY_PASSPHRASE.
--
-- On-disk format for each secret value:
--   { encrypted = true, alg = "aes-256-gcm",
--     ciphertext = <b64>, iv = <b64>, tag = <b64> }
--
-- The key is never in the repo.  Encrypted blobs are safe to push to git.
-- Lose the key → lose the plaintext.  Keep it in three places (settings.json,
-- password manager, offline copy).

local aes = require "resty.aes"
local resty_random = require "resty.random"

local _M = {}

local KEY_ENV = "SECRETS_ENCRYPTION_KEY"
local CIPHER = aes.cipher(256, "gcm")

-- resty.aes's new() takes the IV via its `_hash` table option
-- (see /usr/local/openresty/lualib/resty/aes.lua ~ line 150), and
-- for GCM the padding flag must be off.  Build the cipher instance
-- fresh each call — one aes handle should not be reused across
-- multiple messages because it caches the IV internally.
local function new_gcm(key, iv)
    return aes:new(key, nil, CIPHER, { iv = iv }, nil, nil, false)
end

-- Cache the decoded key per-worker; env doesn't change without a reload.
local cached_key

local function read_key_env()
    -- settings.env_vars first (survives init phase reliably),
    -- os.getenv() as fallback.
    if _G.settings and type(_G.settings) == "table" then
        local ev = _G.settings.env_vars
        if type(ev) == "table" and ev[KEY_ENV] and ev[KEY_ENV] ~= "" then
            return ev[KEY_ENV]
        end
    end
    return os.getenv(KEY_ENV)
end

local function get_key()
    if cached_key then return cached_key end
    local b64 = read_key_env()
    if not b64 or b64 == "" then
        return nil, KEY_ENV .. " env var not set (add it to data/settings.json env_vars)"
    end
    local key = ngx.decode_base64(b64)
    if not key then
        return nil, KEY_ENV .. " is not valid base64"
    end
    if #key ~= 32 then
        return nil, KEY_ENV .. " must decode to 32 raw bytes (got " .. #key ..
            ") — generate with: openssl rand -base64 32"
    end
    cached_key = key
    return cached_key
end

-- Returns true if the key is configured and usable in this worker.
function _M.is_configured()
    local k = get_key()
    return k ~= nil
end

-- Encrypt plaintext.  Returns a table { encrypted, alg, ciphertext, iv, tag }
-- suitable for direct JSON serialization, or nil, err.
function _M.encrypt(plaintext)
    if type(plaintext) ~= "string" then
        return nil, "plaintext must be a string"
    end
    local key, err = get_key()
    if not key then return nil, err end

    local iv = resty_random.bytes(12, true)
    if not iv or #iv ~= 12 then
        return nil, "resty.random failed to produce 12 bytes"
    end

    local a, aerr = new_gcm(key, iv)
    if not a then return nil, "aes:new failed: " .. tostring(aerr) end

    -- lua-resty-string returns {ciphertext, tag} for GCM (a Lua table with 2
    -- elements), NOT two return values.  See resty/aes.lua ~ line 283.
    local res, eerr = a:encrypt(plaintext)
    if not res then return nil, "encrypt failed: " .. tostring(eerr) end
    local ct, tag
    if type(res) == "table" then
        ct, tag = res[1], res[2]
    else
        ct = res
        if #ct <= 16 then
            return nil, "encrypt: no tag returned and ciphertext too short"
        end
        tag = ct:sub(-16)
        ct = ct:sub(1, -17)
    end
    if not ct or not tag or #tag ~= 16 then
        return nil, "encrypt: malformed ciphertext/tag"
    end

    return {
        encrypted = true,
        alg = "aes-256-gcm",
        ciphertext = ngx.encode_base64(ct),
        iv = ngx.encode_base64(iv),
        tag = ngx.encode_base64(tag),
    }
end

-- Decrypt a table produced by encrypt().  Returns plaintext or nil, err.
function _M.decrypt(payload)
    if type(payload) ~= "table" then
        return nil, "payload must be a table"
    end
    local ct_b64  = payload.ciphertext
    local iv_b64  = payload.iv
    local tag_b64 = payload.tag
    if not ct_b64 or not iv_b64 or not tag_b64 then
        return nil, "payload missing ciphertext/iv/tag"
    end
    local ct  = ngx.decode_base64(ct_b64)
    local iv  = ngx.decode_base64(iv_b64)
    local tag = ngx.decode_base64(tag_b64)
    if not ct or not iv or not tag then
        return nil, "invalid base64 in payload"
    end
    if #iv ~= 12 then
        return nil, "iv must be 12 bytes"
    end
    if #tag ~= 16 then
        return nil, "tag must be 16 bytes"
    end

    local key, err = get_key()
    if not key then return nil, err end

    local a, aerr = new_gcm(key, iv)
    if not a then return nil, "aes:new failed: " .. tostring(aerr) end

    local plaintext, derr = a:decrypt(ct, tag)
    if not plaintext then
        return nil, "decrypt failed (key mismatch or tampered ciphertext): "
            .. tostring(derr)
    end
    return plaintext
end

-- Convenience: recognize whether a value is an encrypted blob table.
function _M.is_encrypted_blob(v)
    return type(v) == "table" and v.encrypted == true
        and type(v.ciphertext) == "string"
        and type(v.iv) == "string"
        and type(v.tag) == "string"
end

return _M
