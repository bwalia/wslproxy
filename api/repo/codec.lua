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
        if type(v) == "table" then
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
        if type(v) == "table" then
            out[k] = _M.strip_empty(v)
        elseif v ~= "" then
            out[k] = v
        end
    end
    return out
end

return _M
