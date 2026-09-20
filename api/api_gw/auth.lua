-- api/api_gw/auth.lua
-- Optional edge authentication.
--
-- The default is `passthrough`: WSLProxy forwards the credential untouched and
-- the origin stays authoritative. That is deliberate — an edge gateway that
-- re-implements an app's authorisation model ends up disagreeing with it, and
-- the disagreement is always discovered in production. A tenant opts into
-- enforcement per route, and only for the coarse checks an edge can actually
-- get right: is there a credential, is it well-formed, does it verify against
-- a key we hold, is it in date.
--
-- Strategies:
--   passthrough — forward as-is (default). Still resolves a consumer id for
--                 rate-limit keying when the tenant asks for it.
--   none        — the route is public; no credential expected.
--   jwt         — verify the signature and the registered claims.
--   api_key     — match a shared key from a header or query parameter.
--
-- Secrets never live in the tenant JSON in git: `secret://<id>#<key>` resolves
-- through the existing secret store, `env://NAME` reads the process env.

local M = {}

local Config = require("api_gw.config")
local Keys = require("api_gw.keys")
local Response = require("api_gw.response")

M.MODULE = "auth"

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
if configPath:sub(-1) ~= "/" then configPath = configPath .. "/" end

-- ─── secret material ────────────────────────────────────────────────────────

--- Resolve a config value that may be a literal, `env://NAME`, or
--- `secret://<record>#<key>`. Returns nil (never the ref string) on failure,
--- so a broken ref can only ever fail a comparison, never satisfy one.
function M.resolve_secret(value, profile_id)
    if type(value) ~= "string" or value == "" then return nil end
    if value:sub(1, 6) == "env://" then
        local name = value:sub(7)
        local v = os.getenv(name)
        if not v or v == "" then
            ngx.log(ngx.ERR, "[api_gw.auth] env var ", name, " is empty — credential check will fail closed")
            return nil
        end
        return v
    end
    if value:sub(1, 9) == "secret://" then
        local ok, SecretResolver = pcall(require, "secret_resolver")
        if not ok then return nil end
        local resolved = SecretResolver.resolve(value, configPath, profile_id or "prod")
        if not resolved or resolved == value then return nil end
        return resolved
    end
    return value
end

--- Constant-time-ish string compare. Lua cannot guarantee timing properties,
--- but comparing every byte removes the trivial early-exit signal that `==`
--- on interned strings can expose through length-prefix behaviour.
function M.secure_equals(a, b)
    if type(a) ~= "string" or type(b) ~= "string" then return false end
    if #a ~= #b then return false end
    local diff = 0
    for i = 1, #a do
        if a:byte(i) ~= b:byte(i) then diff = diff + 1 end
    end
    return diff == 0
end

-- ─── credential extraction ──────────────────────────────────────────────────

--- Pull a bearer token from the configured header (or cookie).
function M.extract_token(cfg_jwt, ctx)
    local header_name = (cfg_jwt.header or "Authorization"):lower()
    local v = ctx.headers and ctx.headers[header_name]
    if type(v) == "table" then v = v[1] end
    if type(v) == "string" and v ~= "" then
        local token = v:match("^%s*[Bb]earer%s+(.-)%s*$")
        if token and token ~= "" then return token end
        if header_name ~= "authorization" then
            -- A dedicated header may carry a bare token.
            return v:match("^%s*(.-)%s*$")
        end
    end
    if cfg_jwt.cookie and ngx and ngx.var then
        local cookie = ngx.var["cookie_" .. cfg_jwt.cookie:gsub("%-", "_")]
        if cookie and cookie ~= "" then return cookie end
    end
    return nil
end

function M.extract_api_key(cfg_key, ctx)
    local header_name = (cfg_key.header or "X-API-Key"):lower()
    local v = ctx.headers and ctx.headers[header_name]
    if type(v) == "table" then v = v[1] end
    if type(v) == "string" and v ~= "" then return v end
    if cfg_key.query_param and ctx.args then
        local q = ctx.args[cfg_key.query_param]
        if type(q) == "table" then q = q[1] end
        if type(q) == "string" and q ~= "" then return q end
    end
    return nil
end

-- ─── claims ─────────────────────────────────────────────────────────────────

--- Decode the payload segment of a JWS without verifying it.
--- Never used for an allow decision; only for rate-limit keying, and only
--- when the tenant left `allow_unverified_subject` on.
function M.unverified_claims(token)
    if type(token) ~= "string" then return nil end
    local payload_seg = token:match("^[^%.]+%.([^%.]+)")
    if not payload_seg then return nil end
    local RequestSecurity = require("api_gw.request_security")
    local json = RequestSecurity.b64url_decode(payload_seg)
    if not json then return nil end
    local cjson = Cjson or require("cjson")
    local ok, decoded = pcall(cjson.decode, json)
    if not ok or type(decoded) ~= "table" then return nil end
    return decoded
end

--- Validate the registered claims an edge can check without app knowledge.
--- @return boolean ok, string|nil reason
function M.validate_claims(claims, cfg_jwt, now_ts)
    if type(claims) ~= "table" then return false, "no_claims" end
    local leeway = cfg_jwt.leeway or 0
    now_ts = now_ts or os.time()

    local exp = tonumber(claims.exp)
    if exp and now_ts > (exp + leeway) then return false, "expired" end

    local nbf = tonumber(claims.nbf)
    if nbf and now_ts < (nbf - leeway) then return false, "not_yet_valid" end

    if cfg_jwt.issuer and claims.iss ~= cfg_jwt.issuer then
        return false, "issuer_mismatch"
    end

    if cfg_jwt.audience then
        local aud = claims.aud
        local ok = false
        if type(aud) == "string" then
            ok = (aud == cfg_jwt.audience)
        elseif type(aud) == "table" then
            for _, a in ipairs(aud) do
                if a == cfg_jwt.audience then ok = true break end
            end
        end
        if not ok then return false, "audience_mismatch" end
    end

    return true, nil
end

-- ─── strategies ─────────────────────────────────────────────────────────────

local function verify_jwt(cfg, ctx)
    local j = cfg.auth.jwt
    local token = M.extract_token(j, ctx)
    if not token then
        return false, "missing_token", nil
    end

    local key = M.resolve_secret(j.secret_ref or j.secret, cfg.profile_id)
    if not key then
        -- No verification key: we cannot make a trustworthy decision. This is
        -- an operator error, and the honest response is to say so rather than
        -- to admit the request. Auth is the one place api_gw fails closed.
        ngx.log(ngx.ERR, "[api_gw.auth] jwt strategy has no usable key for tenant ",
            cfg.tenant, " — rejecting (configure api_gw.auth.jwt.secret_ref)")
        return false, "key_unavailable", nil
    end

    local JwtLib = JWT
    if not JwtLib then
        local ok, lib = pcall(require, "resty.jwt")
        if ok then JwtLib = lib end
    end
    if not JwtLib then
        ngx.log(ngx.ERR, "[api_gw.auth] resty.jwt is unavailable — rejecting")
        return false, "verifier_unavailable", nil
    end

    local ok, jwt_obj = pcall(JwtLib.verify, JwtLib, key, token)
    if not ok or type(jwt_obj) ~= "table" or jwt_obj.verified ~= true then
        return false, "signature_invalid", nil
    end

    local claims = jwt_obj.payload or {}
    local alg = jwt_obj.header and jwt_obj.header.alg
    if j.alg and alg and alg:upper() ~= j.alg:upper() then
        return false, "alg_mismatch", nil
    end

    local claims_ok, reason = M.validate_claims(claims, j,
        (ngx and ngx.time) and ngx.time() or os.time())
    if not claims_ok then
        return false, reason, nil
    end

    return true, nil, claims[j.claim_key or "sub"]
end

local function verify_api_key(cfg, ctx)
    local k = cfg.auth.api_key
    local presented = M.extract_api_key(k, ctx)
    if not presented then
        return false, "missing_api_key", nil
    end

    local candidates = {}
    for _, v in ipairs(k.keys or {}) do
        local resolved = M.resolve_secret(tostring(v), cfg.profile_id)
        if resolved then candidates[#candidates + 1] = resolved end
    end
    if k.keys_ref then
        local bundle = M.resolve_secret(k.keys_ref, cfg.profile_id)
        if bundle then
            for piece in tostring(bundle):gmatch("[^,%s]+") do
                candidates[#candidates + 1] = piece
            end
        end
    end

    if #candidates == 0 then
        ngx.log(ngx.ERR, "[api_gw.auth] api_key strategy has no usable keys for tenant ",
            cfg.tenant, " — rejecting")
        return false, "key_unavailable", nil
    end

    for _, candidate in ipairs(candidates) do
        if M.secure_equals(presented, candidate) then
            -- The consumer id is the key's digest, never the key.
            return true, nil, Keys.hash(cfg.tenant, presented)
        end
    end
    return false, "api_key_invalid", nil
end

-- ─── pipeline stage ─────────────────────────────────────────────────────────

--- Pipeline stage.
function M.run(cfg, ctx, policy)
    local a = cfg.auth
    ctx.auth = { strategy = policy.auth or a.strategy, result = "skipped" }

    -- A globally public path short-circuits every strategy. Checked before
    -- the route's own setting so a tenant can carve /health out of a
    -- blanket "/" protected route without reordering its route list.
    if Config.path_in_list(a.public_paths, ctx.uri) then
        ctx.auth.result = "public"
        return nil
    end

    local strategy = ctx.auth.strategy

    if strategy == "none" then
        ctx.auth.result = "public"
        return nil
    end

    if strategy == "passthrough" then
        ctx.auth.result = "passthrough"
        -- Resolve a best-effort consumer id so `key = "consumer"` and
        -- `key = "jwt.sub"` rate profiles still have something to key on.
        if a.allow_unverified_subject then
            local token = M.extract_token(a.jwt, ctx)
            local claims = token and M.unverified_claims(token)
            local sub = claims and claims[a.jwt.claim_key or "sub"]
            if sub then
                ctx.consumer = tostring(sub)
                ctx.consumer_verified = false
            end
        end
        return nil
    end

    -- If the tenant listed protected paths, a strategy only applies inside
    -- them; everything else stays passthrough.
    if #a.protected_paths > 0 and not Config.path_in_list(a.protected_paths, ctx.uri) then
        ctx.auth.result = "out_of_scope"
        return nil
    end

    local ok, reason, subject
    if strategy == "jwt" then
        ok, reason, subject = verify_jwt(cfg, ctx)
    elseif strategy == "api_key" then
        ok, reason, subject = verify_api_key(cfg, ctx)
    else
        ctx.auth.result = "unknown_strategy"
        return nil
    end

    if not ok then
        ctx.auth.result = "denied"
        ctx.auth.reason = reason
        local headers
        if strategy == "jwt" then
            headers = { ["WWW-Authenticate"] = 'Bearer realm="api", error="invalid_token"' }
        end
        -- `reason` is deliberately not echoed to the caller: "expired" vs
        -- "issuer_mismatch" is a probing oracle. It goes to the audit log.
        return Response.deny(a.status, "unauthorized",
            "Valid credentials are required for this route.",
            { module = M.MODULE, headers = headers, detail = { reason = reason } })
    end

    ctx.auth.result = "verified"
    if subject then
        ctx.consumer = tostring(subject)
        ctx.consumer_verified = true
    end
    return nil
end

return M
