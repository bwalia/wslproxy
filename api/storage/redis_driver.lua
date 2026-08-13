-- Redis hash driver. Keys match the historical api.lua layout:
--   servers_{env}, request_rules_{env}, secrets_{env}, ...
--   users (no env suffix)

local cjson = Cjson or require("cjson")
local Driver = require("storage.driver")
local Query = require("storage.query")

local _M = {}

local NGX_NULL = (ngx and ngx.null) or {}

local function is_null(v)
    if v == nil or v == NGX_NULL then
        return true
    end
    if ngx and v == ngx.null then
        return true
    end
    return false
end

local function decode_record(raw)
    if is_null(raw) or raw == "" then
        return nil
    end
    if type(raw) == "table" then
        return raw
    end
    local ok, decoded = pcall(cjson.decode, raw)
    if ok and type(decoded) == "table" then
        return decoded
    end
    return nil, "invalid json"
end

function _M.new(opts)
    opts = opts or {}
    local self = {
        settings = opts.settings,
        red = opts.red,
    }
    setmetatable(self, { __index = _M })
    return self
end

function _M:connect()
    if self.red then
        return self.red
    end
    local ok_req, redis = pcall(require, "resty.redis")
    if not ok_req or not redis then
        return nil, "resty.redis not available"
    end
    local red = redis:new()
    red:set_timeout(1000)
    local settings = self.settings or {}
    local env = settings.env_vars or {}
    local host = env.REDIS_HOST or os.getenv("REDIS_HOST") or "127.0.0.1"
    local port = tonumber(env.REDIS_PORT or os.getenv("REDIS_PORT")) or 6379
    local ok, err = red:connect(host, port)
    if not ok then
        return nil, err or "redis connect failed"
    end
    self.red = red
    return red
end

function _M:get(resource, env, id)
    local red, err = self:connect()
    if not red then
        return nil, err
    end
    local hash, herr = Driver.redis_hash(resource, env)
    if not hash then
        return nil, herr
    end
    local raw, gerr = red:hget(hash, tostring(id))
    if gerr then
        return nil, gerr
    end
    return decode_record(raw)
end

function _M:list(resource, env, filter, sort, pagination)
    local red, err = self:connect()
    if not red then
        return nil, err
    end
    local hash, herr = Driver.redis_hash(resource, env)
    if not hash then
        return nil, herr
    end
    local all, lerr = red:hgetall(hash)
    if lerr then
        return nil, lerr
    end
    local records = {}
    if type(all) == "table" then
        -- redis hgetall returns {k1, v1, k2, v2, ...}
        for i = 1, #all, 2 do
            local rec = decode_record(all[i + 1])
            if rec then
                rec.id = rec.id or all[i]
                records[#records + 1] = rec
            end
        end
    end
    local page, total = Query.paginate(records, filter, sort, pagination)
    return { records = page, total = total }
end

function _M:create(resource, env, id, record)
    return self:update(resource, env, id, record)
end

function _M:update(resource, env, id, record)
    local red, err = self:connect()
    if not red then
        return nil, err
    end
    local hash, herr = Driver.redis_hash(resource, env)
    if not hash then
        return nil, herr
    end
    if type(record) ~= "table" then
        return nil, "record must be a table"
    end
    record.id = record.id or id
    local ok, werr = red:hset(hash, tostring(id), cjson.encode(record))
    if not ok then
        return nil, werr or "redis hset failed"
    end
    return record
end

function _M:delete(resource, env, id)
    local red, err = self:connect()
    if not red then
        return nil, err
    end
    local hash, herr = Driver.redis_hash(resource, env)
    if not hash then
        return nil, herr
    end
    local ok, derr = red:hdel(hash, tostring(id))
    if not ok then
        return nil, derr or "redis hdel failed"
    end
    return true
end

function _M:exists(resource, env, id)
    local red, err = self:connect()
    if not red then
        return false, err
    end
    local hash, herr = Driver.redis_hash(resource, env)
    if not hash then
        return false, herr
    end
    local n, eerr = red:hexists(hash, tostring(id))
    if eerr then
        return false, eerr
    end
    return n == 1 or n == true
end

function _M:health()
    local t0 = os.clock()
    local red, err = self:connect()
    if not red then
        return { ok = false, latency_ms = 0, detail = tostring(err) }
    end
    local pong, perr = red:ping()
    local ms = (os.clock() - t0) * 1000
    if not pong then
        return { ok = false, latency_ms = ms, detail = tostring(perr or "ping failed") }
    end
    return { ok = true, latency_ms = ms, detail = "redis" }
end

return _M
