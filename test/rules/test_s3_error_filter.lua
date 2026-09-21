-- Contract tests for the S3 credential scrub.
-- Run: lua test/rules/test_s3_error_filter.lua
-- (luajit and `resty` also work; does not require OpenResty)
--
-- The regression under test: s3.<region>.amazonaws.com answers a refused
-- request with an XML body that quotes the access key id, and the gateway
-- used to proxy that body verbatim to an anonymous client. AWS's exposed-key
-- scanner reads public HTTP, so every key installed in the rule was
-- quarantined and deleted within a day of being rotated in.

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

-- ─── minimal ngx stub ───────────────────────────────────────────────────────

-- The real access key id that leaked on www.diytaxreturn.co.uk is not needed;
-- any AKIA-shaped string exercises the same path.
local LEAKED_KEY = "AKIAEXAMPLEKEY123456"
local S3_403_BODY = table.concat({
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Error><Code>InvalidAccessKeyId</Code>",
    "<Message>The AWS Access Key Id you provided does not exist in our records.</Message>",
    "<AWSAccessKeyId>" .. LEAKED_KEY .. "</AWSAccessKeyId>",
    "<RequestId>ABC123</RequestId><HostId>deadbeef</HostId></Error>",
})

_G.ngx = { ctx = {}, header = {}, arg = {}, status = 200 }

local Filter = require("s3_error_filter")

--- Drive one response through both filter phases.
--- @param opts table {signed=bool, status=int, chunks={string,...}, headers=table}
--- @return string client_body, table client_headers, table ctx
local function respond(opts)
    ngx.ctx = { s3_signed = opts.signed or nil, should_cache = opts.should_cache }
    ngx.status = opts.status or 200
    ngx.header = {}
    for k, v in pairs(opts.headers or {}) do ngx.header[k] = v end

    Filter.header_filter()

    local out, chunks = {}, opts.chunks or { "" }
    for i, chunk in ipairs(chunks) do
        ngx.arg[1] = chunk
        ngx.arg[2] = (i == #chunks)
        Filter.body_filter()
        out[#out + 1] = ngx.arg[1] or ""
    end
    return table.concat(out), ngx.header, ngx.ctx
end

-- ─── the leak itself ────────────────────────────────────────────────────────

local body, headers = respond({
    signed = true,
    status = 403,
    chunks = { S3_403_BODY },
    headers = { ["Content-Length"] = tostring(#S3_403_BODY), ["Content-Type"] = "application/xml" },
})

assert_eq(body:find(LEAKED_KEY, 1, true), nil, "a 403 body never carries the access key id to the client")
assert_eq(body:find("AWSAccessKeyId", 1, true), nil, "nor the element that would frame one")
assert_eq(body:find("InvalidAccessKeyId", 1, true), nil, "nor the S3 error code")
assert_eq(body:find("deadbeef", 1, true), nil, "nor the origin's HostId")
assert_true(#body > 0, "the client still gets a body")
assert_eq(headers["Content-Length"], nil, "Content-Length is dropped — the body length changed")
assert_eq(headers["Content-Type"], "text/plain; charset=utf-8", "and the type now describes what we send")
assert_eq(headers["X-WSL-S3-Error"], "403", "the real status stays visible to operators")

-- A chunked error body must not leak a fragment through an early chunk.
local split = {}
for i = 1, #S3_403_BODY, 20 do split[#split + 1] = S3_403_BODY:sub(i, i + 19) end
assert_true(#split > 1, "the fixture actually splits into several chunks")
body = respond({ signed = true, status = 403, chunks = split })
assert_eq(body:find(LEAKED_KEY, 1, true), nil, "a chunked 403 body leaks nothing either")
assert_eq(body:find("AKIA", 1, true), nil, "not even a fragment spanning a chunk boundary")

-- 5xx from S3 carries RequestId/HostId; same treatment.
body = respond({ signed = true, status = 503, chunks = { "<Error><Code>SlowDown</Code><HostId>x</HostId></Error>" } })
assert_eq(body:find("HostId", 1, true), nil, "5xx bodies are replaced too")

-- ─── responses that must pass through untouched ─────────────────────────────

local PAGE = "<html>the actual site</html>"

body, headers = respond({ signed = true, status = 200, chunks = { PAGE },
    headers = { ["Content-Length"] = tostring(#PAGE), ["x-amz-request-id"] = "REQ1", ["x-amz-id-2"] = "ID2" } })
assert_eq(body, PAGE, "a successful S3 response is delivered byte for byte")
assert_eq(headers["Content-Length"], tostring(#PAGE), "with its Content-Length intact")
assert_eq(headers["x-amz-request-id"], nil, "but origin request ids are stripped")
assert_eq(headers["x-amz-id-2"], nil, "both of them")
assert_eq(headers["X-WSL-S3-Error"], nil, "and no error marker on a 200")

-- A 206 range response (S3-hosted media) is a success too.
body = respond({ signed = true, status = 206, chunks = { PAGE } })
assert_eq(body, PAGE, "partial content is not an error")

-- Requests this gateway never signed are none of the filter's business — a
-- 403 from an ordinary backend keeps whatever body that backend chose.
local ORIGIN_403 = "<html>403 from some other origin</html>"
body, headers = respond({ status = 403, chunks = { ORIGIN_403 },
    headers = { ["Content-Length"] = tostring(#ORIGIN_403), ["x-amz-request-id"] = "REQ1" } })
assert_eq(body, ORIGIN_403, "an unsigned 403 passes through unchanged")
assert_eq(headers["Content-Length"], tostring(#ORIGIN_403), "its Content-Length is left alone")
assert_eq(headers["x-amz-request-id"], "REQ1", "and its headers are not ours to strip")

-- ─── the cached copy ────────────────────────────────────────────────────────

-- A scrubbed response must never be stored: a cached copy would keep serving
-- the key after the origin had stopped returning it.
local _, _, ctx = respond({ signed = true, status = 403, should_cache = true, chunks = { S3_403_BODY } })
assert_eq(ctx.should_cache, false, "a scrubbed response is disqualified from the cache")

local _, _, ok_ctx = respond({ signed = true, status = 200, should_cache = true, chunks = { PAGE } })
assert_eq(ok_ctx.should_cache, true, "a healthy S3 response is still cacheable")

-- ─── wiring ─────────────────────────────────────────────────────────────────

-- The filter is inert unless rule_auth.sign_s3_request arms it, so assert the
-- signer still does. Reading the source keeps this test free of OpenResty.
local src = assert(io.open("api/rule_auth.lua")):read("*a")
assert_true(src:find("ngx.ctx.s3_signed = true", 1, true),
    "rule_auth.sign_s3_request arms ngx.ctx.s3_signed")

-- Both nginx templates must call both phases in every gateway server block,
-- or the leak stays open on whichever listener was missed (CLAUDE.md #17).
for _, tmpl in ipairs({ "nginx-dev.conf.tmpl", "infra/ansible/roles/wslproxy/templates/nginx.conf.j2" }) do
    local conf = assert(io.open(tmpl)):read("*a")
    local _, hdr = conf:gsub("S3Err%.header_filter%(%)", "")
    local _, bdy = conf:gsub("S3Err%.body_filter%(%)", "")
    assert_eq(hdr, 2, tmpl .. " calls header_filter in both gateway blocks (80 and 443)")
    assert_eq(bdy, 2, tmpl .. " calls body_filter in both gateway blocks (80 and 443)")
end

if failures > 0 then
    io.stderr:write("test_s3_error_filter: " .. failures .. " failure(s)\n")
    os.exit(1)
end
io.write("ok\n")
