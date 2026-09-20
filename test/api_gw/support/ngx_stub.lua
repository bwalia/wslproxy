-- test/api_gw/support/ngx_stub.lua
-- A small OpenResty stand-in so the api_gw modules can run under plain Lua or
-- LuaJIT. It is deliberately thin: only the ngx surface api_gw actually uses.
--
-- Not a test file — it lives under support/ so `test/api_gw/*.lua` does not
-- pick it up as one.

local S = {}

-- ─── JSON ───────────────────────────────────────────────────────────────────

local function build_json()
    local ok, c = pcall(require, "cjson")
    if ok then return c end
    ok, c = pcall(require, "dkjson")
    if ok then return { encode = c.encode, decode = c.decode } end

    local function encode(v)
        local t = type(v)
        if t == "nil" then return "null" end
        if t == "boolean" then return v and "true" or "false" end
        if t == "number" then return tostring(v) end
        if t == "string" then return '"' .. v:gsub("\\", "\\\\"):gsub('"', '\\"') .. '"' end
        if t == "table" then
            local is_arr, n = true, 0
            for k in pairs(v) do
                n = n + 1
                if type(k) ~= "number" then is_arr = false end
            end
            local parts = {}
            if is_arr and n > 0 then
                for i = 1, n do parts[i] = encode(v[i]) end
                return "[" .. table.concat(parts, ",") .. "]"
            end
            for k, val in pairs(v) do
                parts[#parts + 1] = encode(tostring(k)) .. ":" .. encode(val)
            end
            return "{" .. table.concat(parts, ",") .. "}"
        end
        return "null"
    end

    local function decode(s)
        local pos = 1
        local function peek() return s:sub(pos, pos) end
        local function skip()
            while s:sub(pos, pos):match("%s") do pos = pos + 1 end
        end
        local parse
        local function parse_string()
            pos = pos + 1
            local out = {}
            while pos <= #s do
                local ch = s:sub(pos, pos)
                if ch == '"' then pos = pos + 1; break end
                if ch == "\\" then
                    pos = pos + 1
                    out[#out + 1] = s:sub(pos, pos)
                else
                    out[#out + 1] = ch
                end
                pos = pos + 1
            end
            return table.concat(out)
        end
        parse = function()
            skip()
            local ch = peek()
            if ch == '"' then return parse_string() end
            if ch == "{" then
                pos = pos + 1
                local obj = {}
                skip()
                if peek() == "}" then pos = pos + 1; return obj end
                while true do
                    skip()
                    local key = parse_string()
                    skip()
                    assert(peek() == ":", "expected :")
                    pos = pos + 1
                    obj[key] = parse()
                    skip()
                    if peek() == "}" then pos = pos + 1; break end
                    assert(peek() == ",", "expected ,")
                    pos = pos + 1
                end
                return obj
            end
            if ch == "[" then
                pos = pos + 1
                local arr = {}
                skip()
                if peek() == "]" then pos = pos + 1; return arr end
                while true do
                    arr[#arr + 1] = parse()
                    skip()
                    if peek() == "]" then pos = pos + 1; break end
                    assert(peek() == ",", "expected ,")
                    pos = pos + 1
                end
                return arr
            end
            if s:sub(pos, pos + 3) == "true" then pos = pos + 4; return true end
            if s:sub(pos, pos + 4) == "false" then pos = pos + 5; return false end
            if s:sub(pos, pos + 3) == "null" then pos = pos + 4; return nil end
            local num = s:match("^%-?%d+%.?%d*", pos)
            pos = pos + #num
            return tonumber(num)
        end
        return parse()
    end

    return { encode = encode, decode = decode }
end

-- ─── base64 ─────────────────────────────────────────────────────────────────

local B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/"

-- Written out longhand rather than using the well-travelled one-liner: that
-- version only encodes whole 3-byte groups and silently drops a 1- or 2-byte
-- tail, which produces a truncated JWS segment for any payload whose length is
-- not a multiple of three.
local function b64_encode(data)
    local out, i, n = {}, 1, #data
    while i <= n do
        local a, b, c = data:byte(i), data:byte(i + 1), data:byte(i + 2)
        local n1 = math.floor(a / 4)
        local n2 = (a % 4) * 16 + math.floor((b or 0) / 16)
        local n3 = ((b or 0) % 16) * 4 + math.floor((c or 0) / 64)
        local n4 = (c or 0) % 64
        out[#out + 1] = B64:sub(n1 + 1, n1 + 1)
        out[#out + 1] = B64:sub(n2 + 1, n2 + 1)
        out[#out + 1] = b and B64:sub(n3 + 1, n3 + 1) or "="
        out[#out + 1] = c and B64:sub(n4 + 1, n4 + 1) or "="
        i = i + 3
    end
    return table.concat(out)
end

local function b64_decode(data)
    data = tostring(data):gsub('[^' .. B64 .. '=]', '')
    local out = {}
    local bits, nbits = 0, 0
    for i = 1, #data do
        local ch = data:sub(i, i)
        if ch ~= '=' then
            local idx = B64:find(ch, 1, true)
            if idx then
                bits = bits * 64 + (idx - 1)
                nbits = nbits + 6
                if nbits >= 8 then
                    nbits = nbits - 8
                    local byte = math.floor(bits / (2 ^ nbits))
                    bits = bits % (2 ^ nbits)
                    out[#out + 1] = string.char(byte)
                end
            end
        end
    end
    return table.concat(out)
end

S.b64_encode = b64_encode
S.b64_decode = b64_decode

--- base64url with padding stripped, which is what a JWS segment looks like.
function S.b64url(s)
    return (b64_encode(s):gsub("%+", "-"):gsub("/", "_"):gsub("=", ""))
end

-- ─── fake shared dict ───────────────────────────────────────────────────────

--- An ngx.shared.DICT work-alike. Expiry is evaluated against the stub clock,
--- so a test can advance time without sleeping.
local function new_dict(clock)
    local store = {}
    local d = {}

    local function live(k)
        local e = store[k]
        if not e then return nil end
        if e.expires and clock() >= e.expires then
            store[k] = nil
            return nil
        end
        return e
    end

    function d:get(k)
        local e = live(k)
        if not e then return nil end
        return e.value, e.flags
    end

    function d:set(k, v, exptime)
        store[k] = { value = v, expires = (exptime and exptime > 0) and (clock() + exptime) or nil }
        return true
    end

    function d:add(k, v, exptime)
        if live(k) then return false, "exists" end
        return d:set(k, v, exptime)
    end

    function d:incr(k, step, init, init_ttl)
        local e = live(k)
        if not e then
            if init == nil then return nil, "not found" end
            local expires = (init_ttl and init_ttl > 0) and (clock() + init_ttl) or nil
            store[k] = { value = init + step, expires = expires }
            return init + step
        end
        e.value = e.value + step
        return e.value
    end

    function d:delete(k) store[k] = nil end

    function d:get_keys(_)
        local out = {}
        for k in pairs(store) do
            if live(k) then out[#out + 1] = k end
        end
        table.sort(out)
        return out
    end

    function d:flush_all() store = {} end

    -- Test-only introspection.
    function d:_raw() return store end

    return d
end
S.new_dict = new_dict

-- ─── PCRE → Lua pattern (small subset) ──────────────────────────────────────

--- Covers what api_gw configs realistically use in a path denylist: literals,
--- escaped dots, anchors, character classes and the common quantifiers.
--- Anything richer is a real-OpenResty concern; this only has to be faithful
--- enough for the contract tests.
local function pcre_to_lua(p)
    local out, i = {}, 1
    while i <= #p do
        local c = p:sub(i, i)
        if c == "\\" then
            local n = p:sub(i + 1, i + 1)
            if n == "." then out[#out + 1] = "%."
            elseif n == "d" then out[#out + 1] = "%d"
            elseif n == "w" then out[#out + 1] = "%w"
            elseif n == "s" then out[#out + 1] = "%s"
            elseif n == "/" then out[#out + 1] = "/"
            else out[#out + 1] = "%" .. n end
            i = i + 2
        elseif c == "-" or c == "%" then
            out[#out + 1] = "%" .. c
            i = i + 1
        else
            out[#out + 1] = c
            i = i + 1
        end
    end
    return table.concat(out)
end
S.pcre_to_lua = pcre_to_lua

-- ─── install ────────────────────────────────────────────────────────────────

--- Install the stub as _G.ngx (plus _G.Cjson and _G.Base64) and return a
--- handle for driving it from a test.
---
--- handle.time      current stub clock, in seconds (advance it directly)
--- handle.advance(n) move the clock forward
--- handle.logs      every ngx.log() call, as { level, message }
--- handle.dicts     the fake shared dicts by name
--- handle.reset()   clear dicts, logs, headers and ngx.ctx
function S.install(opts)
    opts = opts or {}
    local handle = { time = opts.start_time or 1700000000, logs = {}, dicts = {} }

    local function clock() return handle.time end
    handle.advance = function(n) handle.time = handle.time + n end

    for _, name in ipairs(opts.dicts or { "wsl_api_gw" }) do
        handle.dicts[name] = new_dict(clock)
    end

    local json = build_json()

    local ngx = {
        DEBUG = 8, INFO = 7, NOTICE = 6, WARN = 5, ERR = 4, EMERG = 1,
        OK = 0, HTTP_OK = 200, HTTP_FORBIDDEN = 403,
        null = setmetatable({}, { __tostring = function() return "null" end }),
        shared = handle.dicts,
        ctx = {},
        header = {},
        status = 200,
        var = { remote_addr = "203.0.113.9", uri = "/", request_time = "0.010", bytes_sent = "0" },
    }

    ngx.log = function(level, ...)
        local parts = {}
        for i = 1, select("#", ...) do parts[#parts + 1] = tostring((select(i, ...))) end
        handle.logs[#handle.logs + 1] = { level = level, message = table.concat(parts) }
    end
    ngx.now = clock
    ngx.time = function() return math.floor(clock()) end
    ngx.md5 = function(s)
        local h = 5381
        for i = 1, #s do h = (h * 33 + s:byte(i)) % 4294967296 end
        return string.format("%08x%08x%08x%08x", h, (h * 31) % 4294967296,
            (h * 17) % 4294967296, (h * 7) % 4294967296)
    end
    ngx.encode_base64 = b64_encode
    ngx.decode_base64 = b64_decode
    ngx.re = {
        find = function(subject, pattern, _)
            local ok, from = pcall(string.find, subject, pcre_to_lua(pattern))
            if not ok then return nil, nil, "bad pattern" end
            return from
        end,
    }

    handle.request = { headers = {}, method = "GET", uri = "/", args = {} }
    handle.cleared_headers = {}
    handle.set_headers = {}
    ngx.req = {
        get_headers = function() return handle.request.headers end,
        get_method = function() return handle.request.method end,
        get_uri_args = function() return handle.request.args end,
        set_header = function(k, v) handle.set_headers[k] = v end,
        clear_header = function(k) handle.cleared_headers[#handle.cleared_headers + 1] = k end,
    }

    handle.output = {}
    ngx.say = function(s) handle.output[#handle.output + 1] = tostring(s) end
    ngx.print = function(s) handle.output[#handle.output + 1] = tostring(s) end
    ngx.exit = function(status) handle.exited = status end
    ngx.redirect = function(uri, status) handle.redirected = { uri = uri, status = status } end

    _G.ngx = ngx
    _G.Cjson = json
    _G.Base64 = { encode = b64_encode, decode = b64_decode }
    handle.ngx = ngx
    handle.json = json

    handle.reset = function()
        for _, d in pairs(handle.dicts) do d:flush_all() end
        handle.logs = {}
        handle.output = {}
        handle.cleared_headers = {}
        handle.set_headers = {}
        handle.exited = nil
        ngx.ctx = {}
        ngx.header = {}
        ngx.status = 200
        handle.request.headers = {}
        handle.request.method = "GET"
        handle.request.args = {}
        local Store = package.loaded["api_gw.store"]
        if Store then Store.reset() end
    end

    return handle
end

--- Minimal request context matching api_gw.init.new_context, for unit-testing
--- one stage at a time without going through the façade.
function S.context(overrides)
    local ctx = {
        headers = {},
        args = {},
        method = "GET",
        uri = "/",
        peer_addr = "203.0.113.9",
        client_ip = "203.0.113.9",
        response_headers = {},
        findings = {},
        started_at = 0,
    }
    for k, v in pairs(overrides or {}) do ctx[k] = v end
    return ctx
end

return S
