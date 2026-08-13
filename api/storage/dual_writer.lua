-- Dual writer: primary (redis or pgsql) + disk.
-- Writes go primary first, then disk. Disk failure rolls the primary
-- write back. Reads prefer primary and fall back to disk.

local DiskDriver = require("storage.disk_driver")

local _M = {}

function _M.new(opts)
    opts = opts or {}
    if not opts.primary then
        error("dual_writer requires primary driver")
    end
    local self = {
        primary = opts.primary,
        disk = opts.disk or DiskDriver.new({ config_path = opts.config_path }),
        mode = opts.mode or "remote+disk",
    }
    setmetatable(self, { __index = _M })
    return self
end

function _M:get(resource, env, id)
    local rec, err = self.primary:get(resource, env, id)
    if rec then
        return rec
    end
    if err then
        if ngx and ngx.log then
            ngx.log(ngx.WARN, "dual_writer primary get failed, falling back to disk: ", tostring(err))
        end
    end
    return self.disk:get(resource, env, id)
end

function _M:list(resource, env, filter, sort, pagination)
    local res, err = self.primary:list(resource, env, filter, sort, pagination)
    if res then
        return res
    end
    if err and ngx and ngx.log then
        ngx.log(ngx.WARN, "dual_writer primary list failed, falling back to disk: ", tostring(err))
    end
    return self.disk:list(resource, env, filter, sort, pagination)
end

function _M:create(resource, env, id, record)
    local prev = select(1, self.primary:get(resource, env, id))
    local rec, err = self.primary:create(resource, env, id, record)
    if not rec then
        return nil, err
    end
    local disk_rec, disk_err = self.disk:create(resource, env, id, record)
    if not disk_rec then
        if prev then
            self.primary:update(resource, env, id, prev)
        else
            self.primary:delete(resource, env, id)
        end
        return nil, disk_err or "disk write failed"
    end
    return rec
end

function _M:update(resource, env, id, record)
    local prev = select(1, self.primary:get(resource, env, id))
    local rec, err = self.primary:update(resource, env, id, record)
    if not rec then
        return nil, err
    end
    local disk_rec, disk_err = self.disk:update(resource, env, id, record)
    if not disk_rec then
        if prev then
            self.primary:update(resource, env, id, prev)
        else
            self.primary:delete(resource, env, id)
        end
        return nil, disk_err or "disk write failed"
    end
    return rec
end

function _M:delete(resource, env, id)
    local prev = select(1, self.primary:get(resource, env, id))
    local ok, err = self.primary:delete(resource, env, id)
    if not ok then
        return nil, err
    end
    local dok, derr = self.disk:delete(resource, env, id)
    if not dok then
        if prev then
            self.primary:update(resource, env, id, prev)
        end
        return nil, derr or "disk delete failed"
    end
    return true
end

function _M:exists(resource, env, id)
    local ok, err = self.primary:exists(resource, env, id)
    if ok then
        return true
    end
    if err then
        return self.disk:exists(resource, env, id)
    end
    return self.disk:exists(resource, env, id)
end

function _M:health()
    local p = self.primary:health()
    local d = self.disk:health()
    return {
        ok = p.ok and d.ok,
        latency_ms = (p.latency_ms or 0) + (d.latency_ms or 0),
        detail = (p.detail or "?") .. "+" .. (d.detail or "disk"),
        primary = p,
        disk = d,
    }
end

return _M
