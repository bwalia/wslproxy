-- rule_auth.lua
-- JWT validation and AWS S3 Signature V4 signing
-- Extracted from gateway_ack.lua for clean separation of concerns

local M = {}

local cjson = Cjson
local jwt = JWT

-- ─── Crypto helpers ─────────────────────────────────────────────────────────

local ffi = require("ffi")
pcall(ffi.cdef, [[
    typedef struct engine_st ENGINE;
    typedef struct evp_md_st EVP_MD;
    typedef struct evp_md_ctx_st EVP_MD_CTX;
    unsigned char *HMAC(const EVP_MD *evp_md, const void *key, int key_len,
                        const unsigned char *d, size_t n, unsigned char *md,
                        unsigned int *md_len);
    const EVP_MD *EVP_sha256(void);
]])

local function hmac_sha256(key, message)
    local buf = ffi.new("unsigned char[32]")
    local md_len = ffi.new("unsigned int[1]")
    ffi.C.HMAC(ffi.C.EVP_sha256(), key, #key, message, #message, buf, md_len)
    return ffi.string(buf, 32)
end

local function sha256_hex(data)
    local sha256 = require("resty.sha256")
    local str = require("resty.string")
    local hash = sha256:new()
    hash:update(data)
    return str.to_hex(hash:final())
end

local function to_hex(s)
    return (s:gsub('.', function(c)
        return string.format('%02x', string.byte(c))
    end))
end

local function trim(s)
    return (s:gsub("^%s*(.-)%s*$", "%1"))
end

local function is_empty(s)
    return s == nil or s == '' or type(s) == "userdata"
end

-- ─── JWT / Cookie / Header authentication ───────────────────────────────────

--- Authenticate a request against the rule's token validation config.
--- Returns true if the request passes authentication (or if no auth is configured).
function M.authenticate(rule)
    -- No auth configured → pass
    if is_empty(rule.jwt_token_validation_key) or is_empty(rule.jwt_token_validation_value) then
        return true
    end

    local passphrase = Base64.decode(tostring(rule.jwt_token_validation_key))
    local token_source = rule.jwt_token_validation
    local token_value_name = tostring(rule.jwt_token_validation_value)

    -- No token source → pass
    if is_empty(token_source) then
        return true
    end

    -- ── Cookie JWT ──
    if token_source == "cookie_jwt_token_validation" then
        local cookie_header = ngx.req.get_headers()['cookie']
        if not cookie_header then return false end
        local token = string.match(tostring(cookie_header), token_value_name .. "=([^;]+)")
        if not token then return false end
        token = string.gsub(token, "Bearer", "")
        token = trim(ngx.unescape_uri(token))
        local verified = jwt:verify(passphrase, token)
        return verified and true or false
    end

    -- ── Cookie key-value ──
    if token_source == "cookie_key_value" then
        local cookie_header = ngx.req.get_headers()['cookie']
        if not cookie_header then return false end
        local token = string.match(tostring(cookie_header), token_value_name .. "=([^;]+)")
        if not token then return false end
        token = trim(ngx.unescape_uri(token))
        return passphrase == token
    end

    -- ── Header JWT ──
    if token_source == "header_jwt_token_validation" then
        local token = ngx.req.get_headers()[token_value_name]
        if not token then
            -- Fail-closed: an operator who configured header JWT
            -- validation means "only requests carrying this header
            -- should pass."  Earlier versions returned true here on
            -- missing header — that was a footgun that left a
            -- supposedly-authenticated endpoint fully open.  Behaviour
            -- now matches the cookie paths above which already return
            -- false on missing cookie.
            return false
        end
        -- Some clients send "Bearer <jwt>"; the cookie path strips
        -- this and the header path didn't.  Strip it here too so an
        -- operator who configures Header JWT doesn't have to know
        -- which client convention they'll see.
        token = string.gsub(tostring(token), "^[Bb]earer%s+", "")
        token = trim(ngx.unescape_uri(token))
        local verified = jwt:verify(passphrase, token)
        return verified and true or false
    end

    -- ── AWS S3 Signature V4 ──
    if token_source == "amazon_s3_signed_header_validation" then
        M.sign_s3_request(rule, passphrase, token_value_name)
        return true
    end

    -- Unknown source → pass
    return true
end

-- ─── AWS S3 Signature V4 signing ────────────────────────────────────────────

--- Sign the current request for S3 API access.
--- Sets Authorization, x-amz-date, x-amz-content-sha256 headers and rewrites URI.
--- Stores s3_host_override in ngx.ctx for gateway_resp.lua.
---
--- @param rule       table  The rule's match.rules object
--- @param folder_path string Decoded jwt_token_validation_key (default doc path)
--- @param bucket_name string Decoded jwt_token_validation_value (S3 bucket name)
function M.sign_s3_request(rule, folder_path, bucket_name)
    local s3_access_key = tostring(rule.amazon_s3_access_key or "")
    local s3_secret_key = tostring(rule.amazon_s3_secret_key or "")
    local region = tostring(rule.amazon_s3_region or "eu-west-2")

    -- Decode keys: schema v2 stores plaintext, v1 stores base64
    -- rule_loader.lua normalizes this before we get here, so keys are always plaintext
    -- (kept as documentation of the contract)

    -- Build S3 object key
    local request_uri = ngx.var.uri
    local s3_key = request_uri
    if request_uri == "/" and folder_path and folder_path ~= "" and folder_path ~= "/" then
        local clean_folder = folder_path:sub(1, 1) == "/" and folder_path:sub(2) or folder_path
        s3_key = "/" .. clean_folder
    end
    local file_path = "/" .. bucket_name .. s3_key

    -- AWS Signature V4
    local host_header = "s3." .. region .. ".amazonaws.com"
    local now_date = os.date("!%Y%m%d")
    local now_datetime = os.date("!%Y%m%dT%H%M%SZ")
    local service = "s3"
    local credential_scope = now_date .. "/" .. region .. "/" .. service .. "/aws4_request"
    local payload_hash = sha256_hex("")

    -- Canonical request
    local canonical_headers = "host:" .. host_header .. "\n" ..
        "x-amz-content-sha256:" .. payload_hash .. "\n" ..
        "x-amz-date:" .. now_datetime .. "\n"
    local signed_headers = "host;x-amz-content-sha256;x-amz-date"
    local canonical_request = "GET\n" .. file_path .. "\n" .. "\n" ..
        canonical_headers .. "\n" .. signed_headers .. "\n" .. payload_hash

    -- String to sign
    local string_to_sign = "AWS4-HMAC-SHA256\n" .. now_datetime .. "\n" ..
        credential_scope .. "\n" .. sha256_hex(canonical_request)

    -- Signing key
    local k_date = hmac_sha256("AWS4" .. s3_secret_key, now_date)
    local k_region = hmac_sha256(k_date, region)
    local k_service = hmac_sha256(k_region, service)
    local k_signing = hmac_sha256(k_service, "aws4_request")
    local signature = to_hex(hmac_sha256(k_signing, string_to_sign))

    local authorization = "AWS4-HMAC-SHA256 Credential=" .. s3_access_key .. "/" ..
        credential_scope .. ", SignedHeaders=" .. signed_headers .. ", Signature=" .. signature

    -- Set request headers and rewrite URI
    ngx.req.set_uri(file_path)
    ngx.req.set_header("x-amz-date", now_datetime)
    ngx.req.set_header("x-amz-content-sha256", payload_hash)
    ngx.req.set_header("Authorization", authorization)
    ngx.ctx.s3_host_override = host_header
end

return M
