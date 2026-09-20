-- api/api_gw/request_security.lua
-- Correlation IDs, content-type enforcement, body-size limits and an optional
-- soft check on the shape of a bearer token.
--
-- Split into two stages because the correlation ID has to exist before
-- anything else can log or deny:
--   correlate()  runs first in the pipeline
--   enforce()    runs after IVT, once obvious abuse is already gone
--
-- Everything except correlation is opt-in.  A tenant that only wants request
-- IDs gets exactly that.

local M = {}

local Config = require("api_gw.config")
local Response = require("api_gw.response")

M.MODULE = "request_security"

-- ─── correlation id ─────────────────────────────────────────────────────────

-- Conservative: what we echo back to a caller and put in structured logs must
-- not be able to carry a newline, a quote or a control character.
local SAFE_ID = "^[A-Za-z0-9%._:%-]+$"

--- Is an inbound correlation ID safe to adopt?
function M.valid_id(v, max_length)
    if type(v) ~= "string" or v == "" then return false end
    if #v > (max_length or 128) then return false end
    return v:match(SAFE_ID) ~= nil
end

local function random_hex(bytes)
    -- ngx.md5 of a high-entropy seed is plenty for a request correlation id;
    -- this is a trace handle, not a token.
    local seed
    if ngx and ngx.var then
        seed = table.concat({
            tostring(ngx.now and ngx.now() or os.time()),
            tostring(ngx.var.connection or ""),
            tostring(ngx.var.connection_requests or ""),
            tostring(ngx.var.remote_port or ""),
            tostring(math.random(1, 2 ^ 31 - 1)),
        }, "-")
    else
        seed = tostring(os.time()) .. "-" .. tostring(math.random(1, 2 ^ 31 - 1))
    end
    if ngx and ngx.md5 then
        return ngx.md5(seed):sub(1, bytes * 2)
    end
    -- Test fallback: deterministic-length hex from the seed.
    local h = 5381
    local out = {}
    for i = 1, bytes do
        for j = 1, #seed do
            h = (h * 33 + seed:byte(j) + i) % 4294967296
        end
        out[#out + 1] = string.format("%02x", h % 256)
    end
    return table.concat(out)
end

function M.generate_id()
    return random_hex(16)
end

--- Stage 1: establish ctx.correlation_id and propagate it upstream.
function M.correlate(cfg, ctx)
    local c = cfg.request_security.correlation
    if not c.enabled then return nil end

    local inbound
    if c.accept_inbound then
        inbound = ctx.headers and ctx.headers[c.header:lower()]
        if type(inbound) == "table" then inbound = inbound[1] end
    end

    local id
    if M.valid_id(inbound, c.max_length) then
        id = inbound
        ctx.correlation_inbound = true
    else
        id = M.generate_id()
        ctx.correlation_inbound = false
    end

    ctx.correlation_id = id
    ctx.correlation_header = c.header

    -- Upstream always sees the canonical value, including when we replaced a
    -- malformed inbound one.
    if ngx and ngx.req and ngx.req.set_header then
        ngx.req.set_header(c.header, id)
    end
    if c.echo_downstream then
        ctx.response_headers[c.header] = id
    end
    return nil
end

-- ─── content type ───────────────────────────────────────────────────────────

--- Media type without parameters, lower-cased. "application/json; charset=..."
--- becomes "application/json".
function M.media_type(content_type)
    if type(content_type) ~= "string" then return nil end
    local base = content_type:match("^%s*([^;]+)")
    if not base then return nil end
    return base:match("^%s*(.-)%s*$"):lower()
end

--- True when the media type is allowed. `multipart/form-data` is matched on
--- its base type so the boundary parameter does not have to be enumerated.
function M.content_type_allowed(allow_set, content_type)
    local mt = M.media_type(content_type)
    if not mt then return false end
    if allow_set[mt] then return true end
    -- Allow "application/*"-style wildcards.
    local family = mt:match("^([^/]+)/")
    if family and allow_set[family .. "/*"] then return true end
    return allow_set["*/*"] == true
end

-- ─── token typ ──────────────────────────────────────────────────────────────

local function b64url_decode(s)
    s = s:gsub("-", "+"):gsub("_", "/")
    local pad = #s % 4
    if pad == 2 then s = s .. "=="
    elseif pad == 3 then s = s .. "="
    elseif pad == 1 then return nil end
    local ok, decoded = pcall(function()
        if ngx and ngx.decode_base64 then return ngx.decode_base64(s) end
        return Base64 and Base64.decode(s) or nil
    end)
    if not ok then return nil end
    return decoded
end
M.b64url_decode = b64url_decode

--- Read the `typ` field out of a JWS header segment without verifying the
--- signature.  Used only for the advisory shape check; nothing security-
--- relevant is decided from it.
function M.token_typ(authorization)
    if type(authorization) ~= "string" then return nil end
    local token = authorization:match("^%s*[Bb]earer%s+(.+)%s*$") or authorization
    local header_seg = token:match("^([^%.]+)%.")
    if not header_seg then return nil end
    local json = b64url_decode(header_seg)
    if not json then return nil end
    local cjson = Cjson or require("cjson")
    local ok, decoded = pcall(cjson.decode, json)
    if not ok or type(decoded) ~= "table" then return nil end
    if type(decoded.typ) ~= "string" then return nil end
    return decoded.typ
end

-- ─── stage 2 ────────────────────────────────────────────────────────────────

--- Stage 2: content-type, body size, token typ.
--- @return table|nil decision
function M.enforce(cfg, ctx, policy)
    local rs = cfg.request_security
    local method = (ctx.method or "GET"):upper()

    -- Content-Type enforcement, skipped on exempt paths (uploads, webhooks
    -- that post form-encoded bodies, and so on).
    local ct = rs.content_type
    if ct.enforce and ct.methods[method]
        and not Config.path_in_list(ct.exempt_paths, ctx.uri) then
        local header = ctx.headers and ctx.headers["content-type"]
        if type(header) == "table" then header = header[1] end
        -- A body-less POST has nothing to type-check.
        local declared_len = tonumber(ctx.headers and ctx.headers["content-length"])
        if declared_len ~= 0 then
            if not M.content_type_allowed(ct.allow, header) then
                return Response.deny(ct.status, "unsupported_media_type",
                    "Content-Type is not accepted for this route.",
                    { module = M.MODULE, detail = { media_type = M.media_type(header) } })
            end
        end
    end

    -- Body size.  Content-Length is the only cheap signal available in the
    -- rewrite phase; nginx's own client_max_body_size is the backstop for
    -- chunked requests that never declare a length.
    local max_body = policy.max_body_bytes or 0
    if max_body and max_body > 0 then
        local len = ctx.headers and ctx.headers["content-length"]
        if type(len) == "table" then len = len[1] end
        len = tonumber(len)
        if len and len > max_body then
            return Response.deny(rs.body_status, "payload_too_large",
                "Request body exceeds the limit for this route.",
                { module = M.MODULE, detail = { limit = max_body, declared = len } })
        end
        if not len and rs.require_content_length
            and (method == "POST" or method == "PUT" or method == "PATCH") then
            return Response.deny(411, "length_required",
                "Content-Length is required for this route.",
                { module = M.MODULE })
        end
    end

    -- Advisory token shape check.  Config-driven; no app-specific claim names.
    local tt = rs.token_typ
    if tt.enabled and tt.mode ~= "disabled" then
        local auth = ctx.headers and ctx.headers[tt.header:lower()]
        if type(auth) == "table" then auth = auth[1] end
        if auth and auth ~= "" then
            local typ = M.token_typ(auth)
            local ok = typ ~= nil and tt.expect[typ:lower()] == true
            if not ok then
                ctx.findings[#ctx.findings + 1] = {
                    module = M.MODULE, signal = "token_typ", value = typ or "unparsed",
                }
                if tt.mode == "block" then
                    return Response.deny(400, "invalid_token_type",
                        "Token type is not accepted for this route.",
                        { module = M.MODULE })
                end
            end
        end
    end

    return nil
end

return M
