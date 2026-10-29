-- api/bot_defense/session.lua
-- Signed session cookie and proof-of-work challenge tokens. Only OpenResty
-- built-ins: ngx.hmac_sha1 for the MACs (HMAC-SHA1 is sound as a MAC),
-- resty.sha256 for the proof of work, resty.random for ids.
--
-- Both are bound to the client — its IP prefix (or exact IP) and its
-- User-Agent — so a cookie or a solved challenge copied to another bot is
-- worthless.

local M = {}

local ok_b64, B64 = pcall(require, "ngx.base64")

local function b64url(s)
    if ok_b64 and B64.encode_base64url then return B64.encode_base64url(s) end
    return (ngx.encode_base64(s):gsub("%+", "-"):gsub("/", "_"):gsub("=", ""))
end

local function unb64url(s)
    if type(s) ~= "string" or s == "" or s:find("[^%w%-_]") then return nil end
    if ok_b64 and B64.decode_base64url then return B64.decode_base64url(s) end
    local b = s:gsub("%-", "+"):gsub("_", "/")
    local pad = #b % 4
    if pad == 1 then return nil end
    if pad > 0 then b = b .. string.rep("=", 4 - pad) end
    return ngx.decode_base64(b)
end
M.b64url, M.unb64url = b64url, unb64url

local function mac(secret, data) return ngx.hmac_sha1(secret, data) end

--- Constant-time string comparison, so a forged MAC cannot be found byte by
--- byte from response timing.
local function same(a, b)
    if type(a) ~= "string" or type(b) ~= "string" or #a ~= #b then return false end
    local diff = 0
    for i = 1, #a do
        if a:byte(i) ~= b:byte(i) then diff = diff + 1 end
    end
    return diff == 0
end
M.same = same

function M.random_id(n)
    n = n or 12
    local ok, Random = pcall(require, "resty.random")
    local bytes = ok and Random.bytes(n, true) or nil
    if not bytes then
        local t = {}
        for i = 1, n do t[i] = string.char(math.random(0, 255)) end
        bytes = table.concat(t)
    end
    return b64url(bytes)
end

--- The part of the client a cookie is bound to.
function M.ip_key(ip, binding)
    if binding == "none" or not ip then return "" end
    if binding == "exact" then return ip end
    local a, b, c = ip:match("^(%d+)%.(%d+)%.(%d+)%.%d+$")
    if a then return a .. "." .. b .. "." .. c end
    -- IPv6: the /64 a household or a phone sits in.
    local h = {}
    for part in (ip:gsub("::.*$", "") .. ":"):gmatch("([^:]*):") do
        h[#h + 1] = part
        if #h == 4 then break end
    end
    return table.concat(h, ":")
end

local function bind(ip_key, ua)
    return ngx.md5((ip_key or "") .. "|" .. (ua or "")):sub(1, 16)
end
M.bind = bind

local function sign(secret, payload)
    return b64url(payload) .. "." .. b64url(mac(secret, payload))
end

local function open(secret, value)
    if type(value) ~= "string" or #value > 1024 then return nil end
    local p64, m64 = value:match("^([%w%-_]+)%.([%w%-_]+)$")
    if not p64 then return nil end
    local payload = unb64url(p64)
    if not payload or not same(unb64url(m64), mac(secret, payload)) then return nil end
    return payload
end

-- ─── session cookie ─────────────────────────────────────────────────────────
-- payload: "1|<vid>|<issued>|<expires>|<passed_until>|<bind>"

function M.issue(secret, vid, now, ttl, passed_until, ip_key, ua)
    local payload = table.concat({ "1", vid, math.floor(now), math.floor(now + ttl),
        math.floor(passed_until or 0), bind(ip_key, ua) }, "|")
    return sign(secret, payload)
end

--- @return table|nil { vid, issued, expires, passed } or nil, reason
function M.parse(secret, value, now, ip_key, ua)
    if not value or value == "" then return nil, "absent" end
    local payload = open(secret, value)
    if not payload then return nil, "invalid" end
    local v, vid, issued, expires, passed_until, b =
        payload:match("^(%d+)|([%w%-_]+)|(%d+)|(%d+)|(%d+)|(%x+)$")
    if v ~= "1" then return nil, "invalid" end
    if tonumber(expires) <= now then return nil, "expired" end
    if b ~= bind(ip_key, ua) then return nil, "rebound" end
    return {
        vid = vid,
        issued = tonumber(issued),
        expires = tonumber(expires),
        passed_until = tonumber(passed_until),
        passed = tonumber(passed_until) > now,
    }
end

-- ─── proof-of-work challenge ────────────────────────────────────────────────
-- token payload: "1|<expires>|<difficulty>|<bind>|<nonce>|<return path>"
-- The browser finds n such that sha256(token .. ":" .. n) starts with
-- `difficulty` zero bits; the server checks it with a single hash.

--- Only same-site paths: never "//host" or a scheme, so a solved challenge
--- cannot be turned into an open redirect.
function M.safe_return(path)
    if type(path) ~= "string" or path:sub(1, 1) ~= "/" or path:sub(1, 2) == "//"
        or path:find("[%c\\]") or #path > 2048 then
        return "/"
    end
    return path
end

function M.challenge_token(secret, now, ttl, difficulty, ip_key, ua, return_path)
    local payload = table.concat({ "1", math.floor(now + ttl), difficulty, bind(ip_key, ua),
        M.random_id(9), M.safe_return(return_path) }, "|")
    return sign(secret, payload)
end

function M.leading_zero_bits(digest)
    local bits = 0
    for i = 1, #digest do
        local byte = digest:byte(i)
        if byte == 0 then
            bits = bits + 8
        else
            local b = 128
            while b > 0 and byte < b do
                bits = bits + 1
                b = b / 2
            end
            return bits
        end
    end
    return bits
end

local function sha256(s)
    local Sha = require("resty.sha256")
    local h = Sha:new()
    h:update(s)
    return h:final()
end
M.sha256 = sha256

--- Check a solution.
--- @return table|nil { return_path, expires, difficulty } or nil, reason
function M.verify_solution(secret, token, nonce, now, ip_key, ua)
    local payload = open(secret, token)
    if not payload then return nil, "bad_token" end
    local v, expires, difficulty, b, _, ret =
        payload:match("^(%d+)|(%d+)|(%d+)|(%x+)|([%w%-_]+)|(.+)$")
    if v ~= "1" then return nil, "bad_token" end
    if tonumber(expires) <= now then return nil, "expired" end
    if b ~= bind(ip_key, ua) then return nil, "rebound" end
    if type(nonce) ~= "string" or not nonce:match("^%d+$") or #nonce > 16 then
        return nil, "bad_nonce"
    end
    if M.leading_zero_bits(sha256(token .. ":" .. nonce)) < tonumber(difficulty) then
        return nil, "insufficient_work"
    end
    return { return_path = M.safe_return(ret), expires = tonumber(expires), difficulty = tonumber(difficulty) }
end

return M
