-- Server repository. Persistence via generic repo; nginx conf compile and
-- reboot-flag side-effects stay in api.lua (CreateUpdateRecord) so this
-- module does not pull Conf / openresty -t into the storage layer.

local Generic = require("repo.generic")

local RESOURCE = "servers"

local _M = {}

function _M.get(env, id)
    return Generic.get(RESOURCE, env, id)
end

function _M.list(env, filter, sort, pagination)
    return Generic.list(RESOURCE, env, filter, sort, pagination)
end

function _M.create(env, id, record, opts)
    opts = opts or {}
    if opts.encode_sensitive == nil then opts.encode_sensitive = true end
    return Generic.create(RESOURCE, env, id, record, opts)
end

function _M.update(env, id, record, opts)
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
