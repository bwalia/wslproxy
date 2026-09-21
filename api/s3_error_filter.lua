-- s3_error_filter.lua ─ keep AWS credentials out of client-visible responses.
--
-- Rules with `amazon_s3_signed_header_validation` are signed by
-- rule_auth.sign_s3_request() and proxied to s3.<region>.amazonaws.com.  When
-- that origin refuses the request it answers with an XML error document that
-- quotes the access key id back at the caller:
--
--   <Error><Code>InvalidAccessKeyId</Code>
--     <Message>The AWS Access Key Id you provided does not exist in our
--     records.</Message><AWSAccessKeyId>AKIA...</AWSAccessKeyId>
--     <RequestId>...</RequestId><HostId>...</HostId></Error>
--
-- Nothing downstream rewrote that body, so the gateway republished the key on
-- a public domain.  AWS's exposed-key scanner crawls public HTTP, and an AKIA
-- id it finds there is treated as compromised: the key gets the
-- AWSCompromisedKeyQuarantine policy and is then deleted.  That is what
-- happened to bwalia-s3-publisher on 2026-09-01, and again within a day of
-- the 2026-09-02 rotation — every S3 workflow in .github/workflows has been
-- red since, because each new key was leaked by this same 403 the moment it
-- was installed (see docs/runbooks/s3-credential-rotation.md).
--
-- Contract: for any request this gateway signed, an upstream 4xx/5xx body
-- never reaches the client.  The status code is preserved so caching,
-- logging and monitoring behave as before; only the body is replaced.
--
-- Fail-open per the module convention in CLAUDE.md §15: every entry point is
-- called under pcall from the nginx filter blocks, and a request that was
-- never S3-signed returns immediately.

local M = {}

-- Deliberately opaque.  The caller is an anonymous internet client; the real
-- code is in the error log and on the X-WSL-S3-Error response header.
local GENERIC_BODY = "Origin request failed.\n"

-- Origin-identifying headers.  `Server: AmazonS3` is already dropped by
-- nginx's default proxy_hide_header list; these are not.
local STRIP_HEADERS = {
    "x-amz-request-id",
    "x-amz-id-2",
    "x-amz-bucket-region",
}

--- header_filter phase.  Decides whether this response needs scrubbing and
--- prepares the headers for a body of a different length.
function M.header_filter()
    if not ngx.ctx.s3_signed then return end

    for _, name in ipairs(STRIP_HEADERS) do
        ngx.header[name] = nil
    end

    local status = ngx.status or 0
    if status < 400 then return end

    ngx.ctx.s3_error_scrub = true

    -- Never let a leaking body into the response cache: cache_handler gates
    -- on status too, but this request is the one case where a cached copy
    -- would keep serving the key after the origin stopped returning it.
    ngx.ctx.should_cache = false

    -- The replacement body has neither the upstream length nor its encoding.
    ngx.header["Content-Length"] = nil
    ngx.header["Content-Encoding"] = nil
    ngx.header["Content-Type"] = "text/plain; charset=utf-8"
    ngx.header["X-WSL-S3-Error"] = tostring(status)
end

--- body_filter phase.  Discards every upstream chunk and emits the
--- replacement on the last one, so a multi-chunk error body cannot slip a
--- fragment through.
function M.body_filter()
    if not ngx.ctx.s3_error_scrub then return end

    if ngx.arg[2] then       -- end of stream
        ngx.arg[1] = GENERIC_BODY
    else
        ngx.arg[1] = ""
    end
end

return M
