-- Storage driver contract.
--
-- Every backend (disk, redis, pgsql) implements:
--   get(resource, env, id)                 → record|nil, err
--   list(resource, env, filter, sort, pag) → {records, total}|nil, err
--   create(resource, env, id, record)      → record|nil, err
--   update(resource, env, id, record)      → record|nil, err
--   delete(resource, env, id)              → true|nil, err
--   exists(resource, env, id)              → boolean, err
--   health()                               → {ok=bool, latency_ms=n, detail=s}
--
-- Records are always Lua tables. Drivers never return JSON strings.
-- `env` is the profile id (prod/int/test/...). Global resources
-- (users, pops) ignore env for the on-disk path / redis key suffix.

local _M = {}

_M.RESOURCES = {
    servers      = { redis = "servers",        disk = "servers",      scoped = true,  redis_scoped = true },
    rules        = { redis = "request_rules",  disk = "rules",        scoped = true,  redis_scoped = true },
    secrets      = { redis = "secrets",        disk = "secrets",      scoped = true,  redis_scoped = true },
    instances    = { redis = "instances",      disk = "instances",    scoped = true,  redis_scoped = true },
    upstreams    = { redis = "upstreams",      disk = "upstreams",    scoped = true,  redis_scoped = true },
    waf_rules    = { redis = "waf_rules",      disk = "waf_rules",    scoped = true,  redis_scoped = true },
    waf_policies = { redis = "waf_policies",   disk = "waf_policies", scoped = true,  redis_scoped = true },
    waf_events   = { redis = "waf_events",     disk = "waf_events",   scoped = true,  redis_scoped = true },
    users        = { redis = "users",          disk = "users",        scoped = false, redis_scoped = false, array_file = true },
    pops         = { redis = "pops",           disk = "pops",         scoped = false, redis_scoped = false },
    bookmarks    = { redis = "bookmarks",      disk = "bookmarks",    scoped = false, redis_scoped = false, array_file = true },
    profiles     = { redis = "profiles",       disk = "profiles",     scoped = false, redis_scoped = false },
    company_logo = { redis = "company_logo",   disk = "company_logo", scoped = false, redis_scoped = false },
}

function _M.meta(resource)
    return _M.RESOURCES[resource]
end

function _M.redis_hash(resource, env)
    local m = _M.RESOURCES[resource]
    if not m then
        return nil, "unknown resource: " .. tostring(resource)
    end
    if m.redis_scoped then
        return m.redis .. "_" .. tostring(env or "prod")
    end
    return m.redis
end

function _M.disk_dir(config_path, resource, env)
    local m = _M.RESOURCES[resource]
    if not m then
        return nil, "unknown resource: " .. tostring(resource)
    end
    local root = config_path or "/opt/nginx/"
    if root:sub(-1) ~= "/" then
        root = root .. "/"
    end
    if m.array_file then
        return root .. "data/" .. m.disk .. ".json", true
    end
    if m.scoped then
        return root .. "data/" .. m.disk .. "/" .. tostring(env or "prod")
    end
    return root .. "data/" .. m.disk
end

function _M.not_impl(name)
    return nil, "driver method not implemented: " .. tostring(name)
end

return _M
