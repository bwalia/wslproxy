-- api/secret_resolver.lua
-- Resolve `secret://<record_id>#<key>` refs inside rule fields to the
-- plaintext value stored (encrypted) in data/secrets/<profile>/<id>.json.
--
-- Refs are opt-in: a rule field is either a plain inline value (as before)
-- or a ref string.  Runtime callers see plaintext either way, so downstream
-- code (rule_auth.lua, S3 signer, JWT verify) does not change.
--
-- Fail-open: missing key / missing record / decrypt failure → the field
-- resolves to nil and the ref is dropped.  Loud error log but the request
-- proceeds so a rule that also matches on non-auth conditions still
-- evaluates.  Auth checks that depend on the missing value will simply
-- fail their comparison — never silently succeed.

local M = {}

local REF_PREFIX = "secret://"

--- True if `v` is a secret-reference string.
function M.is_ref(v)
    return type(v) == "string" and v:sub(1, #REF_PREFIX) == REF_PREFIX
end

--- Parse a ref into { record_id, key }.  Returns nil, err on malformed input.
function M.parse_ref(v)
    if not M.is_ref(v) then
        return nil, "not a secret ref"
    end
    local body = v:sub(#REF_PREFIX + 1)
    local record_id, key = body:match("^([^#]+)#(.+)$")
    if not record_id or not key or record_id == "" or key == "" then
        return nil, "malformed ref (expected secret://<id>#<key>)"
    end
    return { record_id = record_id, key = key }
end

local function log_warn(msg, ref)
    if ngx and ngx.log then
        ngx.log(ngx.WARN, "[secret_resolver] ", msg, " ref=", tostring(ref))
    end
end

local function load_secret_file(config_path, profile, record_id)
    local path = config_path .. "data/secrets/" .. profile .. "/" .. record_id .. ".json"
    local f, ferr = io.open(path, "rb")
    if not f then return nil, "open failed: " .. tostring(ferr) end
    local content = f:read("*a")
    f:close()
    if not content or content == "" then return nil, "empty file" end
    local ok, decoded = pcall(Cjson.decode, content)
    if not ok then return nil, "json decode failed" end
    return decoded
end

local function get_cache()
    if not ngx or not ngx.ctx then return nil end
    ngx.ctx._secret_cache = ngx.ctx._secret_cache or {}
    return ngx.ctx._secret_cache
end

--- Resolve `v` if it is a secret ref, otherwise return `v` unchanged.
--- Returns (plaintext, nil) on success, (nil, err) on ref failure (caller
--- should treat the field as absent).  Non-ref values pass through:
--- (v, nil).
function M.resolve(v, config_path, profile)
    if not M.is_ref(v) then
        return v
    end
    local parsed, perr = M.parse_ref(v)
    if not parsed then
        log_warn(perr, v)
        return nil, perr
    end

    local cache = get_cache()
    local cache_key = profile .. "|" .. parsed.record_id .. "#" .. parsed.key
    if cache and cache[cache_key] ~= nil then
        local hit = cache[cache_key]
        if hit == false then return nil, "cached miss" end
        return hit
    end

    local record, lerr = load_secret_file(config_path, profile, parsed.record_id)
    if not record then
        log_warn("secret record load failed: " .. tostring(lerr), v)
        if cache then cache[cache_key] = false end
        return nil, lerr
    end

    if type(record.secrets) ~= "table" then
        log_warn("secret record has no `secrets` array", v)
        if cache then cache[cache_key] = false end
        return nil, "no secrets array"
    end

    local entry
    for _, s in ipairs(record.secrets) do
        if s.key == parsed.key then
            entry = s
            break
        end
    end
    if not entry then
        log_warn("secret key not found in record", v)
        if cache then cache[cache_key] = false end
        return nil, "key not found"
    end

    local plaintext
    if type(entry.value) == "table" and entry.value.encrypted then
        local Crypto = require("secrets_crypto")
        local pt, derr = Crypto.decrypt(entry.value)
        if not pt then
            log_warn("decrypt failed: " .. tostring(derr), v)
            if cache then cache[cache_key] = false end
            return nil, derr
        end
        plaintext = pt
    elseif type(entry.value) == "string" and entry.value ~= "" then
        -- Legacy Base64 storage
        plaintext = Base64.decode(entry.value)
    else
        plaintext = ""
    end

    if cache then cache[cache_key] = plaintext end
    return plaintext
end

--- Walk a rule's match.rules field, resolving any secret refs found in the
--- known-secret fields.  Mutates in place.  Config_path defaults to
--- `os.getenv("NGINX_CONFIG_DIR")` or `/opt/nginx/` (matches configPath in
--- init.lua) — but the caller almost always has it and should pass it.
local KNOWN_SECRET_FIELDS = {
    "jwt_token_validation_key",
    "amazon_s3_access_key",
    "amazon_s3_secret_key",
}

function M.resolve_rule_refs(rule_data, config_path, profile)
    if not rule_data or type(rule_data.match) ~= "table"
        or type(rule_data.match.rules) ~= "table" then
        return rule_data
    end
    config_path = config_path or (os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/")
    profile = profile or "prod"
    local rules = rule_data.match.rules
    for _, field in ipairs(KNOWN_SECRET_FIELDS) do
        local v = rules[field]
        if M.is_ref(v) then
            local resolved = M.resolve(v, config_path, profile)
            if resolved ~= nil then
                rules[field] = resolved
            else
                -- Drop the field: caller can treat "missing" as an auth
                -- check that cannot succeed, which is the correct fail-safe.
                rules[field] = nil
            end
        end
    end
    return rule_data
end

return M
