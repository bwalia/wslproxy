-- Encode/decode of sensitive fields that historically lived in CreateUpdateRecord.
-- Sensitive values are stored base64-encoded on disk/redis/pgsql; the API
-- request/response contract is unchanged (callers still send/receive the
-- same shape as before — CreateUpdateRecord encoded before persist).

local _M = {}

local SENSITIVE = {
    amazon_s3_secret_key = true,
    jwt_token_validation_value = true,
    jwt_secret = true,
    password = true,
    secret = true,
    secret_key = true,
    varnish_vcl_config = true,
}

-- Subtrees `walk` does not descend into.
--
-- SENSITIVE is matched on the bare key name at ANY depth, which is fine for
-- the records it was written for (a rule's secret lives at
-- `match.rules.amazon_s3_secret_key`, two levels down) but is a trap for any
-- nested block that happens to reuse one of those names.
--
-- `api_gw` does: docs/api-gw.schema.json defines `auth.jwt.secret` ("Inline
-- key. Prefer secret_ref"). Encoding it here base64'd the HMAC key on save,
-- while api_gw/config.lua reads `jwt.secret` verbatim -- there is no decode
-- counterpart in this module, because every consumer decodes its own fields
-- (rule_loader does exactly that for the S3 keys). The result was a key that
-- silently became the base64 of itself the moment the record went through the
-- admin API, and every JWT failing to verify.
--
-- Not fixed by adding a decode: base64-decoding a value that may already be
-- plaintext is the same guesswork that broke the rule keys in the 2026-08-10
-- incident (CLAUDE.md #15), and an HMAC secret can be valid base64 by
-- coincidence. `api_gw` handles its own indirection instead -- `secret_ref`
-- and `env://` resolved through secret_resolver.lua -- so it wants its values
-- stored exactly as given. Note base64 here is a storage convention, not
-- encryption: skipping it protects nothing that was protected before.
local OPAQUE_SUBTREES = {
    api_gw = true,
}

local function should_encode(k, v)
    if type(v) ~= "string" or v == "" then
        return false
    end
    if SENSITIVE[k] then
        return true
    end
    if k == "config" then
        return true
    end
    return false
end

local function walk(tbl, fn)
    if type(tbl) ~= "table" then
        return tbl
    end
    local out = {}
    for k, v in pairs(tbl) do
        if OPAQUE_SUBTREES[k] then
            out[k] = v
        elseif type(v) == "table" then
            out[k] = walk(v, fn)
        else
            out[k] = fn(k, v)
        end
    end
    return out
end

function _M.encode_sensitive(record)
    if type(record) ~= "table" then
        return record
    end
    return walk(record, function(k, v)
        if should_encode(k, v) then
            -- already looks encoded? leave it; CreateUpdateRecord historically
            -- always re-encoded. Keep that: callers pass plaintext or already-b64.
            local encoded
            if Base64 and Base64.encode then
                encoded = Base64.encode(v)
            elseif ngx and ngx.encode_base64 then
                encoded = ngx.encode_base64(v)
            end
            return encoded or v
        end
        return v
    end)
end

function _M.strip_empty(record)
    if type(record) ~= "table" then
        return record
    end
    local out = {}
    for k, v in pairs(record) do
        if OPAQUE_SUBTREES[k] then
            -- Same reasoning as encode_sensitive: an empty string inside an
            -- api_gw policy is the caller's choice (an explicitly blank
            -- header name, say), not a field to drop on their behalf.
            out[k] = v
        elseif type(v) == "table" then
            out[k] = _M.strip_empty(v)
        elseif v ~= "" then
            out[k] = v
        end
    end
    return out
end

return _M
