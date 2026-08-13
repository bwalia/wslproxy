-- Repository facade used by the admin API (api.lua).
-- Resource-specific modules handle encode/side-effect policy; persistence
-- always goes through the storage driver (disk, or redis/pgsql + disk).

local Generic = require("repo.generic")
local Servers = require("repo.servers")
local Rules = require("repo.rules")
local Secrets = require("repo.secrets")
local Storage = require("storage")

local _M = {
    servers = Servers,
    rules = Rules,
    secrets = Secrets,
}

local SPECIAL = {
    servers = Servers,
    rules = Rules,
    secrets = Secrets,
}

function _M.for_resource(resource)
    return SPECIAL[resource]
end

function _M.get(resource, env, id)
    local spec = SPECIAL[resource]
    if spec then
        return spec.get(env, id)
    end
    return Generic.get(resource, env, id)
end

function _M.list(resource, env, filter, sort, pagination)
    local spec = SPECIAL[resource]
    if spec then
        return spec.list(env, filter, sort, pagination)
    end
    return Generic.list(resource, env, filter, sort, pagination)
end

function _M.create(resource, env, id, record)
    local spec = SPECIAL[resource]
    if spec then
        return spec.create(env, id, record)
    end
    return Generic.create(resource, env, id, record)
end

function _M.update(resource, env, id, record)
    local spec = SPECIAL[resource]
    if spec then
        return spec.update(env, id, record)
    end
    return Generic.update(resource, env, id, record)
end

function _M.delete(resource, env, id)
    local spec = SPECIAL[resource]
    if spec then
        return spec.delete(env, id)
    end
    return Generic.delete(resource, env, id)
end

function _M.exists(resource, env, id)
    local spec = SPECIAL[resource]
    if spec then
        return spec.exists(env, id)
    end
    return Generic.exists(resource, env, id)
end

function _M.save(resource, env, id, record, opts)
    opts = opts or {}
    -- Always upsert through generic so callers that already encoded
    -- (CreateUpdateRecord) can skip a second encode pass.
    return Generic.update(resource, env, id, record, opts)
end

function _M.scan(resource, env)
    return Generic.scan(resource, env)
end

function _M.health()
    return Storage.health()
end

function _M.storage_type()
    Storage.get_driver()
    return Storage.type
end

return _M
