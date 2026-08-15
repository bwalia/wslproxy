-- WAF enforcement stages that run BEFORE signature matching.
-- These implement positive-security and protocol/API controls that a signature
-- list cannot express: an allow-list of methods, forbidden file types, IP/geo
-- lists, JWT algorithm policy, JSON body shape limits and brute-force velocity.
--
-- Each stage is a pure function of (policy, ctx) and returns a *finding* table
-- {stage, code, category, severity, target, detail} when the request violates
-- the policy, or nil when it is acceptable. Stages never block directly — the
-- engine decides block vs alarm from the effective enforcement mode — and every
-- stage is written to be allocation-light and to fail-open on its own errors.

local _M = {}
local cjson = Cjson or require("cjson")

-- ---- helpers ---------------------------------------------------------------

-- IPv4 CIDR / exact membership. Returns true if ip is inside cidr.
local function ip_in_cidr(ip, cidr)
    if not ip or not cidr then return false end
    if ip == cidr then return true end
    local net, bits = cidr:match("^([%d%.]+)/(%d+)$")
    if not net then return false end
    bits = tonumber(bits)
    local function to_int(a)
        local o1, o2, o3, o4 = a:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
        if not o1 then return nil end
        return ((tonumber(o1) * 256 + tonumber(o2)) * 256 + tonumber(o3)) * 256 + tonumber(o4)
    end
    local ii, ni = to_int(ip), to_int(net)
    if not ii or not ni then return false end
    if bits <= 0 then return true end
    if bits > 32 then bits = 32 end
    local mask = bits == 32 and 0xFFFFFFFF or (0xFFFFFFFF - (2 ^ (32 - bits) - 1))
    return (ii % 0x100000000) - (ii % (2 ^ (32 - bits))) == (ni % 0x100000000) - (ni % (2 ^ (32 - bits)))
end

local function base64url_decode(s)
    if not s then return nil end
    s = s:gsub("-", "+"):gsub("_", "/")
    local pad = #s % 4
    if pad == 2 then s = s .. "==" elseif pad == 3 then s = s .. "=" elseif pad == 1 then return nil end
    return ngx.decode_base64(s)
end

local function json_depth(v, cap, d)
    d = d or 1
    if d > cap then return d end
    if type(v) ~= "table" then return d end
    local maxd = d
    for _, child in pairs(v) do
        local cd = json_depth(child, cap, d + 1)
        if cd > maxd then maxd = cd end
        if maxd > cap then return maxd end
    end
    return maxd
end

local function smuggling_finding(detail)
    return { stage = "smuggling", code = "VIOL_SMUGGLING", category = "protocol",
             severity = "high", target = "headers", detail = detail }
end

-- ---- stages ----------------------------------------------------------------

-- HTTP request-smuggling / desync guard (RFC 7230 §3.3.3, CWE-444).
-- Request smuggling works by making a front-end proxy and a back-end server
-- disagree on where one request ends and the next begins. The primitives are
-- all header *ambiguity*: a Content-Length together with a Transfer-Encoding
-- (CL.TE / TE.CL), duplicate Transfer-Encoding or Content-Length headers
-- (TE.TE), or a Transfer-Encoding value obfuscated so one hop treats it as
-- chunked and the other does not. A single-target signature cannot express a
-- relationship *between* headers, so this is a first-class stage; it complements
-- waf-rule-smuggling-001, which catches a smuggled request line embedded in the
-- body. nginx's own strict parser rejects the crudest CL+TE frame before Lua
-- runs, so this is defence-in-depth — most valuable at the inner edge of a
-- two-proxy topology, where a forwarded Transfer-Encoding header can still
-- reach this layer.
--
--   policy.smuggling = { enforce = true, allowChunked = true }
--
-- Presence of the block enables the stage; enforce:false disables it without
-- removing the config. allowChunked:false additionally rejects a clean chunked
-- upload for edges that never expect one.
function _M.smuggling_check(policy, ctx)
    local s = policy.smuggling
    if not s or s.enforce == false then return nil end
    local h = ctx.headers or {}
    local te = h["transfer-encoding"]
    local cl = h["content-length"]

    -- Duplicate headers arrive from ngx.req.get_headers as an array value.
    if type(te) == "table" then
        return smuggling_finding("duplicate Transfer-Encoding header")
    end
    if type(cl) == "table" then
        return smuggling_finding("duplicate Content-Length header")
    end
    -- Content-Length AND Transfer-Encoding together — the CL.TE/TE.CL primitive.
    if te and te ~= "" and cl and cl ~= "" then
        return smuggling_finding("Content-Length with Transfer-Encoding")
    end
    if te and te ~= "" then
        local norm = te:lower():gsub("^%s+", ""):gsub("%s+$", "")
        -- Anything that is not a clean "chunked" is obfuscation: "xchunked",
        -- "chunked, identity", a leading tab/space, a trailing comma, etc.
        if norm ~= "chunked" then
            return smuggling_finding("obfuscated Transfer-Encoding: " .. te)
        end
        if s.allowChunked == false then
            return smuggling_finding("Transfer-Encoding: chunked not permitted on this edge")
        end
    end
    -- Multi-valued or non-numeric Content-Length (e.g. "5, 6", " 5 x").
    if cl and cl ~= "" and not cl:match("^%s*%d+%s*$") then
        return smuggling_finding("malformed Content-Length: " .. cl)
    end
    return nil
end

-- Method allow-list: any method not in policy.methods.allow is rejected.
function _M.method_check(policy, ctx)
    local m = policy.methods
    if not m or not m.allow then return nil end
    local allowed = false
    for _, a in ipairs(m.allow) do
        if a == ctx.method then allowed = true break end
    end
    if allowed then return nil end
    return { stage = "method", code = "VIOL_METHOD", category = "protocol",
             severity = "high", target = "method", detail = "method not allowed: " .. ctx.method }
end

-- Filetype deny-list: block requests whose path ends in a forbidden extension
-- (source, backup, secret and VCS artefacts).
function _M.filetype_check(policy, ctx)
    local ft = policy.filetypes
    if not ft or not ft.deny then return nil end
    local path = (ctx.path or ""):lower()
    for _, ext in ipairs(ft.deny) do
        local e = ext:lower()
        -- match ".env" as suffix or as a path segment like "/.git/"
        if path:sub(-#e) == e or path:find(e:gsub("%.", "%%.") .. "/", 1) then
            return { stage = "filetype", code = "VIOL_FILETYPE", category = "protocol",
                     severity = "medium", target = "url", detail = "forbidden filetype: " .. ext }
        end
    end
    return nil
end

-- IP allow/deny lists, then geo country deny. Allow-list membership short-circuits.
function _M.ip_geo_check(policy, ctx)
    local il = policy.ipLists
    if il then
        if il.allow then
            for _, c in ipairs(il.allow) do if ip_in_cidr(ctx.ip, c) then return nil end end
        end
        if il.deny then
            for _, c in ipairs(il.deny) do
                if ip_in_cidr(ctx.ip, c) then
                    return { stage = "ip", code = "VIOL_IP_DENY", category = "reputation",
                             severity = "high", target = "ip", detail = "ip on deny list: " .. tostring(ctx.ip) }
                end
            end
        end
    end
    local geo = policy.geo
    if geo and geo.denyCountries and #geo.denyCountries > 0 then
        local ok, ip2location = pcall(require, "ip2location")
        if ok and ip2location then
            local okc, res = pcall(function()
                local db = ip2location:new(policy.geo.db or "/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN")
                local r = db:get_all(ctx.ip)
                db:close()
                return r and r.country_short
            end)
            if okc and res then
                for _, cc in ipairs(geo.denyCountries) do
                    if cc == res then
                        return { stage = "geo", code = "VIOL_GEO", category = "reputation",
                                 severity = "high", target = "ip", detail = "country denied: " .. res }
                    end
                end
            end
        end
    end
    return nil
end

-- JWT algorithm policy. Only applies when a bearer token is present. Enforces a
-- deny-list (e.g. "none", "HS256") and, if set, a require-list of allowed algs.
-- This is a first-class check, not a regex: it decodes the JWT header.
function _M.jwt_check(policy, ctx)
    local j = policy.jwt
    if not j then return nil end
    local hdr = ctx.headers[(j.header or "authorization"):lower()]
    if type(hdr) == "table" then hdr = hdr[1] end
    if not hdr or hdr == "" then return nil end
    local token = hdr:match("^[Bb]earer%s+(.+)$") or hdr
    local h = token:match("^([^%.]+)%.")
    if not h then return nil end
    local decoded = base64url_decode(h)
    if not decoded then return nil end
    local ok, header = pcall(cjson.decode, decoded)
    if not ok or type(header) ~= "table" or not header.alg then return nil end
    local alg = tostring(header.alg)
    if j.denyAlg then
        for _, d in ipairs(j.denyAlg) do
            if d:lower() == alg:lower() then
                return { stage = "jwt", code = "VIOL_JWT_ALG", category = "broken-auth",
                         severity = "high", target = "headers", detail = "jwt alg denied: " .. alg }
            end
        end
    end
    if j.requireAlg then
        local okalg = false
        for _, r in ipairs(j.requireAlg) do if r:lower() == alg:lower() then okalg = true break end end
        if not okalg then
            return { stage = "jwt", code = "VIOL_JWT_ALG", category = "broken-auth",
                     severity = "high", target = "headers", detail = "jwt alg not permitted: " .. alg }
        end
    end
    return nil
end

-- JSON body profile: enforce a maximum byte size and nesting depth on JSON
-- request bodies (a cheap defence against parser-abuse and nested-object DoS).
function _M.json_profile_check(policy, ctx)
    local p = policy.jsonProfile
    if not p then return nil end
    local ct = ctx.headers["content-type"]
    if type(ct) == "table" then ct = ct[1] end
    if not ct or not ct:find("json", 1, true) then return nil end
    local body = ctx.body
    if not body or body == "" then return nil end
    if p.maxBytes and #body > p.maxBytes then
        return { stage = "json", code = "VIOL_JSON_SIZE", category = "protocol",
                 severity = "medium", target = "body", detail = "json body exceeds " .. p.maxBytes .. " bytes" }
    end
    if p.maxDepth then
        local ok, parsed = pcall(cjson.decode, body)
        if ok and type(parsed) == "table" then
            local d = json_depth(parsed, p.maxDepth + 1, 1)
            if d > p.maxDepth then
                return { stage = "json", code = "VIOL_JSON_DEPTH", category = "protocol",
                         severity = "medium", target = "body", detail = "json depth exceeds " .. p.maxDepth }
            end
        end
    end
    return nil
end

-- Brute-force velocity control. For each configured path, count requests per
-- client key within a sliding window (shared dict); over the threshold → finding.
-- Counts attempts (request-phase), which is what a velocity control observes.
function _M.brute_force_check(policy, ctx)
    local rules = policy.bruteForce
    if not rules then return nil end
    local dict = ngx.shared.wsl_cache
    if not dict then return nil end
    for _, r in ipairs(rules) do
        local rpath = r.path or "/"
        if ctx.path == rpath or ctx.path:sub(1, #rpath) == rpath then
            local parts = { "bf", rpath }
            for _, kb in ipairs(r.keyBy or { "ip" }) do
                if kb == "ip" then
                    parts[#parts + 1] = ctx.ip
                elseif r.paramFrom == "arg" or kb == r.usernameParam then
                    parts[#parts + 1] = tostring(ctx.args[kb] or "")
                end
            end
            local key = table.concat(parts, ":")
            local window = r.windowSec or 60
            local newval, err = dict:incr(key, 1, 0, window)
            if newval and newval > (r.maxAttempts or 5) then
                return { stage = "bruteforce", code = "VIOL_BRUTE_FORCE", category = "brute-force",
                         severity = "high", target = "url",
                         detail = string.format("%d attempts on %s in %ds (max %d)",
                                                newval, rpath, window, r.maxAttempts or 5),
                         action_hint = r.action }
            end
        end
    end
    return nil
end

-- OpenAPI positive security: allow only request path+method pairs declared in
-- the policy's OpenAPI surface; everything else under basePath is rejected.
-- This is the inverse of signatures — a request is denied unless it is known.
-- Path templates support {param} segments (matched as a single path segment).
--
-- policy.openapi = {
--   basePath = "/api",                         -- only enforce under this prefix
--   paths = { {path="/api/accounts/{id}", methods={"GET"}}, ... },
-- }
local function template_to_pattern(tpl)
    local segs = {}
    -- Only non-empty segments, so a leading "/" does not create an empty first
    -- element (which would produce a spurious "//" in the anchored pattern).
    for seg in tpl:gmatch("[^/]+") do
        if seg:match("^{.-}$") then
            segs[#segs + 1] = "[^/]+"
        else
            -- escape Lua-pattern magic chars in the literal segment
            segs[#segs + 1] = seg:gsub("[%^%$%(%)%%%.%[%]%*%+%-%?]", "%%%1")
        end
    end
    return "^/" .. table.concat(segs, "/") .. "$"
end

function _M.openapi_check(policy, ctx)
    local spec = policy.openapi
    if not spec or not spec.paths then return nil end
    local base = spec.basePath
    local path = ctx.path or "/"
    if base and path:sub(1, #base) ~= base then return nil end -- outside the API surface

    local path_known, method_ok = false, false
    for _, p in ipairs(spec.paths) do
        local pat = p._pattern
        if not pat then pat = template_to_pattern(p.path); p._pattern = pat end
        if path:match(pat) then
            path_known = true
            for _, m in ipairs(p.methods or {}) do
                if m == "*" or m == ctx.method then method_ok = true break end
            end
            if method_ok then break end
        end
    end

    if not path_known then
        return { stage = "openapi", code = "VIOL_OPENAPI_PATH", category = "positive-security",
                 severity = "medium", target = "url", detail = "undeclared endpoint: " .. path }
    end
    if not method_ok then
        return { stage = "openapi", code = "VIOL_OPENAPI_METHOD", category = "positive-security",
                 severity = "medium", target = "url",
                 detail = ctx.method .. " not declared for " .. path }
    end
    return nil
end

-- Ordered list the engine walks. Order matters: cheap/structural checks first,
-- then positive-security (OpenAPI), then signatures (in the engine).
_M.PIPELINE = {
    { name = "method", fn = _M.method_check },
    { name = "filetype", fn = _M.filetype_check },
    { name = "smuggling", fn = _M.smuggling_check },
    { name = "ip_geo", fn = _M.ip_geo_check },
    { name = "jwt", fn = _M.jwt_check },
    { name = "json", fn = _M.json_profile_check },
    { name = "bruteforce", fn = _M.brute_force_check },
    { name = "openapi", fn = _M.openapi_check },
}

return _M
