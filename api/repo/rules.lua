local Generic = require("repo.generic")

local RESOURCE = "rules"

local _M = {}

function _M.get(env, id)
    return Generic.get(RESOURCE, env, id)
end

function _M.list(env, filter, sort, pagination)
    return Generic.list(RESOURCE, env, filter, sort, pagination)
end

function _M.create(env, id, record, opts)
    record._schema_version = record._schema_version or 2
    opts = opts or {}
    if opts.encode_sensitive == nil then opts.encode_sensitive = true end
    return Generic.create(RESOURCE, env, id, record, opts)
end

function _M.update(env, id, record, opts)
    record._schema_version = record._schema_version or 2
    opts = opts or {}
    if opts.encode_sensitive == nil then opts.encode_sensitive = true end
    return Generic.update(RESOURCE, env, id, record, opts)
end

function _M.delete(env, id)
    return Generic.delete(RESOURCE, env, id)
end

function _M.exists(env, id)
    return Generic.exists(RESOURCE, env, id)
end

return _M
