-- Contract tests for repo/codec.lua — which record fields get base64-encoded
-- on the way to disk, and which are stored exactly as given.
-- Run: lua test/storage/test_codec.lua
--
-- The regression under test: SENSITIVE is matched on the bare key name at any
-- depth, and `api_gw.auth.jwt.secret` (docs/api-gw.schema.json) collides with
-- the `secret` entry. Encoding it base64'd the HMAC key on save while
-- api_gw/config.lua reads it verbatim, so every JWT failed to verify — only
-- for records saved through the admin API, never for hand-edited files.

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local failures = 0
local function assert_eq(a, b, msg)
    if a ~= b then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "") .. " expected " .. tostring(b) .. " got " .. tostring(a) .. "\n")
    end
end

-- codec reaches for a global Base64 (init.lua sets one) or ngx.encode_base64.
-- Supply a recognisable stand-in so the tests assert on "was it encoded",
-- not on base64 itself.
rawset(_G, "Base64", { encode = function(v) return "B64(" .. v .. ")" end })

local Codec = require("repo.codec")

-- ─── fields that must still be encoded ──────────────────────────────────────

local out = Codec.encode_sensitive({
    id = "host:x",
    server_name = "x.example.com",
    config = "server { listen 80; }",
    varnish_vcl_config = "vcl 4.0;",
    match = { rules = { amazon_s3_secret_key = "s3secret", path = "/" } },
})

assert_eq(out.config, "B64(server { listen 80; })", "top-level config is still encoded")
assert_eq(out.varnish_vcl_config, "B64(vcl 4.0;)", "varnish VCL is still encoded")
assert_eq(out.match.rules.amazon_s3_secret_key, "B64(s3secret)",
    "a rule's S3 secret is still encoded two levels down — that is what the depth walk is for")
assert_eq(out.match.rules.path, "/", "a non-sensitive sibling is untouched")
assert_eq(out.server_name, "x.example.com", "and so is a non-sensitive top-level field")

-- ─── the api_gw subtree is opaque ───────────────────────────────────────────

local gw = Codec.encode_sensitive({
    id = "host:api.example.com",
    config = "server { }",
    api_gw = {
        enabled = true,
        auth = {
            strategy = "jwt",
            jwt = { secret = "hmac-key-in-the-clear", alg = "HS256" },
            api_key = { keys_ref = "env://EDGE_KEYS" },
        },
        audit = { enabled = true },
    },
})

assert_eq(gw.api_gw.auth.jwt.secret, "hmac-key-in-the-clear",
    "an inline api_gw JWT secret is stored exactly as given — encoding it broke every JWT")
assert_eq(gw.api_gw.auth.jwt.alg, "HS256", "its siblings come through unchanged")
assert_eq(gw.api_gw.auth.api_key.keys_ref, "env://EDGE_KEYS", "and so do secret references")
assert_eq(gw.api_gw.enabled, true, "booleans survive the opaque copy")
assert_eq(gw.config, "B64(server { })",
    "the rest of the record is still encoded — api_gw is the exception, not a global off switch")

-- A `config` key nested inside api_gw is a policy field, not an nginx block.
local nested = Codec.encode_sensitive({ api_gw = { routes = { { config = "not nginx" } } } })
assert_eq(nested.api_gw.routes[1].config, "not nginx",
    "a `config` key inside api_gw is not mistaken for an nginx server block")

-- ─── strip_empty has the same reach ─────────────────────────────────────────

local stripped = Codec.strip_empty({
    id = "host:x",
    root = "",
    match = { rules = { path = "", country = "US" } },
    api_gw = { auth = { jwt = { issuer = "" } } },
})

assert_eq(stripped.root, nil, "an empty top-level field is still dropped")
assert_eq(stripped.match.rules.path, nil, "and an empty nested one")
assert_eq(stripped.match.rules.country, "US", "a set sibling survives")
assert_eq(stripped.api_gw.auth.jwt.issuer, "",
    "but an empty string inside api_gw is the caller's choice and is kept")

-- ─── non-table input ────────────────────────────────────────────────────────

assert_eq(Codec.encode_sensitive("not a table"), "not a table", "a scalar passes through encode")
assert_eq(Codec.strip_empty(nil), nil, "and nil passes through strip")

-- ─── wiring ─────────────────────────────────────────────────────────────────

-- The collision this guards against is real only while the schema keeps that
-- field. If it is ever renamed, this test should be revisited, not deleted.
local schema = assert(io.open("docs/api-gw.schema.json")):read("*a")
if not schema:find('"secret"', 1, true) then
    io.stderr:write("NOTE: api-gw.schema.json no longer defines `secret`; revisit OPAQUE_SUBTREES.\n")
end

if failures > 0 then
    io.stderr:write("test_codec: " .. failures .. " failure(s)\n")
    os.exit(1)
end
io.write("ok\n")
