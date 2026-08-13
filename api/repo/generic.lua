-- Generic repository: encode on write, persist via the storage driver,
-- return Lua tables. Resource-specific repos wrap this for side-effects.

local Storage = require("storage")
local Codec = require("repo.codec")

local _M = {}

local function driver()
    return Storage.get_driver()
end

function _M.get(resource, env, id)
    return driver():get(resource, env, id)
end

function _M.list(resource, env, filter, sort, pagination)
    return driver():list(resource, env, filter, sort, pagination)
end

function _M.create(resource, env, id, record, opts)
    opts = opts or {}
    local rec = record
    if not opts.skip_strip then
        rec = Codec.strip_empty(rec)
    end
    if opts.encode_sensitive then
        rec = Codec.encode_sensitive(rec)
    end
    rec.id = rec.id or id
    return driver():create(resource, env, id, rec)
end

function _M.update(resource, env, id, record, opts)
    opts = opts or {}
    local rec = record
    if not opts.skip_strip then
        rec = Codec.strip_empty(rec)
    end
    if opts.encode_sensitive then
        rec = Codec.encode_sensitive(rec)
    end
    rec.id = rec.id or id
    return driver():update(resource, env, id, rec)
end

function _M.delete(resource, env, id)
    return driver():delete(resource, env, id)
end

function _M.exists(resource, env, id)
    return driver():exists(resource, env, id)
end

function _M.scan(resource, env)
    local res, err = driver():list(resource, env, {}, {}, nil)
    if not res then
        return nil, err
    end
    return res.records or {}
end

return _M
