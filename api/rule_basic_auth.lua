-- rule_basic_auth.lua
-- HTTP Basic authentication as a gate on the WINNING rule.
--
-- Why a gate and not a rule_matcher condition: a failed condition only means
-- "this rule did not match", which ends in the no-rule 403/error page. Basic
-- auth has to answer 401 + WWW-Authenticate so the browser shows its login
-- prompt, so it runs after RuleSelector picks the winner (gateway_ack.lua),
-- before the pipeline (rate limit / WAF) and before anything is proxied.
--
-- Rule config (match.rules.basic_auth). Absent or enabled=false -> no change.
--
--   "basic_auth": {
--     "enabled": true,
--     "realm": "Portfolio Lab (test)",
--     "users": [
--       { "username": "tester", "password_sha256": "<64 hex chars>" }
--     ],
--     "exempt_paths": ["/healthz"]
--   }
--
-- password_sha256 is the lowercase hex SHA-256 of the password, so the rule
-- JSON (committed to git, synced between edges) never carries the password.
-- Generate with:  printf '%s' 'the-password' | shasum -a 256
-- The key is deliberately NOT called "password": repo/codec.lua base64-encodes
-- any field named password at any depth on save.
--
-- exempt_paths: exact paths, or prefixes when the entry ends with "/" or "*"
-- (e.g. "/healthz" for Ring Promoter / uptime checks, "/.well-known/").
--
-- Fails CLOSED: enabled with no valid user entries denies everyone (logged).
-- On success the Authorization header is removed before proxying, so the
-- edge credentials are never forwarded to the origin.
--
-- Caching: requests carrying Authorization are never cached (cache_handler),
-- but the cache is consulted before rules run. Do not enable basic_auth on a
-- server that already has cached pages without purging its cache first, and
-- never set cache_bypass_auth on such a server.

local M = {}

local HEX64 = "^%x+$"

local function is_empty(s)
    return s == nil or s == "" or type(s) == "userdata"
end

--- Normalise the rule's basic_auth block. Returns nil when auth is off.
--- @param rules table  match.rules (or the enriched rule_match copy)
function M.config(rules)
    if type(rules) ~= "table" then return nil end
    local cfg = rules.basic_auth
    if type(cfg) ~= "table" then return nil end
    if cfg.enabled == false then return nil end

    local users = {}
    if type(cfg.users) == "table" then
        for _, u in ipairs(cfg.users) do
            if type(u) == "table" and not is_empty(u.username) and type(u.password_sha256) == "string" then
                local h = u.password_sha256:lower()
                if #h == 64 and h:match(HEX64) then
                    users[tostring(u.username)] = h
                end
            end
        end
    end

    local exempt = {}
    if type(cfg.exempt_paths) == "table" then
        for _, p in ipairs(cfg.exempt_paths) do
            if type(p) == "string" and p ~= "" then table.insert(exempt, p) end
        end
    end

    local realm = is_empty(cfg.realm) and "Restricted" or tostring(cfg.realm)
    realm = realm:gsub('[\\"]', ""):gsub("[%c]", "")

    return { realm = realm, users = users, exempt_paths = exempt }
end

--- True if `uri` (path only, no query) is exempt from the gate.
function M.is_exempt(cfg, uri)
    if type(uri) ~= "string" then return false end
    for _, p in ipairs(cfg.exempt_paths) do
        local last = p:sub(-1)
        if last == "*" then
            local prefix = p:sub(1, -2)
            if uri:sub(1, #prefix) == prefix then return true end
        elseif last == "/" and #p > 1 then
            if uri:sub(1, #p) == p then return true end
        elseif uri == p then
            return true
        end
    end
    return false
end

--- Parse "Basic <base64>" into user, password. Returns nil on anything else.
--- @param b64decode function  base64 decoder (ngx.decode_base64 at runtime)
function M.parse_authorization(header, b64decode)
    if type(header) ~= "string" then return nil end
    local token = header:match("^%s*[Bb][Aa][Ss][Ii][Cc]%s+(%S+)%s*$")
    if not token then return nil end
    local decoded = b64decode(token)
    if type(decoded) ~= "string" then return nil end
    local user, pass = decoded:match("^([^:]*):(.*)$")
    if not user then return nil end
    return user, pass
end

-- Compare two equal-length hex digests without an early exit.
local function digest_eq(a, b)
    if type(a) ~= "string" or type(b) ~= "string" or #a ~= #b then return false end
    local diff = 0
    for i = 1, #a do
        if a:byte(i) ~= b:byte(i) then diff = diff + 1 end
    end
    return diff == 0
end

--- Check credentials against the config.
--- @param sha256_hex function  password -> lowercase hex digest
function M.verify(cfg, user, pass, sha256_hex)
    if user == nil or pass == nil then return false end
    local want = cfg.users[user]
    -- Hash even for unknown users so timing does not reveal valid usernames.
    local got = sha256_hex(pass)
    if not want then
        digest_eq(got, got)
        return false
    end
    return digest_eq(got, want)
end

local function resty_sha256_hex(s)
    local sha256 = require("resty.sha256")
    local str = require("resty.string")
    local h = sha256:new()
    h:update(s)
    return str.to_hex(h:final())
end

--- Decide for the current request. Pure: returns "pass" | "exempt" | "deny"
--- plus a short reason, so it can be unit-tested without nginx.
function M.decide(cfg, uri, authorization, b64decode, sha256_hex)
    if not cfg then return "pass", "not configured" end
    if M.is_exempt(cfg, uri) then return "exempt", "exempt path" end
    if next(cfg.users) == nil then return "deny", "no valid users configured" end
    local user, pass = M.parse_authorization(authorization, b64decode)
    if not user then return "deny", "missing or malformed credentials" end
    if M.verify(cfg, user, pass, sha256_hex) then return "pass", "ok" end
    return "deny", "bad credentials"
end

--- Enforce on the current request (nginx runtime).
--- Returns true when the request may continue. On deny it has already sent
--- the 401 and the caller must stop (gateway_ack returns).
function M.enforce(rule_match)
    local cfg = M.config(rule_match)
    if not cfg then return true end

    local verdict, reason = M.decide(cfg, ngx.var.uri, ngx.req.get_headers()["Authorization"],
        ngx.decode_base64, resty_sha256_hex)

    if verdict == "pass" then
        ngx.req.clear_header("Authorization")
        return true
    end
    if verdict == "exempt" then
        return true
    end

    if reason == "no valid users configured" then
        ngx.log(ngx.ERR, "[basic_auth] rule ", tostring(rule_match.id), " has basic_auth enabled but no valid users; denying")
    end
    ngx.status = ngx.HTTP_UNAUTHORIZED
    ngx.header["WWW-Authenticate"] = 'Basic realm="' .. cfg.realm .. '", charset="UTF-8"'
    ngx.header["Cache-Control"] = "no-store"
    ngx.header["Content-Type"] = "text/html; charset=utf-8"
    ngx.say("<!doctype html><title>401 Authorization Required</title><h1>401 Authorization Required</h1>")
    ngx.exit(ngx.HTTP_UNAUTHORIZED)
    return false
end

return M
