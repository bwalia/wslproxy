-- Storage bootstrap. Picks disk / redis / pgsql from settings.storage_type.
-- Redis and pgsql modes wrap the remote driver in a dual_writer so every
-- CRUD mutation still emits on-disk JSON (request-path source of truth).

local Helper = require("helpers")
local DiskDriver = require("storage.disk_driver")
local RedisDriver = require("storage.redis_driver")
local PgsqlDriver = require("storage.pgsql_driver")
local DualWriter = require("storage.dual_writer")

local _M = {
    type = "disk",
    driver = nil,
    settings = nil,
}

local function config_path()
    local p = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
    if p:sub(-1) ~= "/" then
        p = p .. "/"
    end
    return p
end

local function load_settings(existing)
    if existing and type(existing) == "table" then
        return existing
    end
    local ok, settings = pcall(Helper.settings)
    if ok and type(settings) == "table" then
        return settings
    end
    return {}
end

function _M.init(settings)
    settings = load_settings(settings)
    _M.settings = settings
    local stype = settings.storage_type or "disk"
    _M.type = stype
    local cpath = config_path()
    local disk = DiskDriver.new({ config_path = cpath })

    if stype == "redis" then
        local primary = RedisDriver.new({ settings = settings })
        local red, err = primary:connect()
        if not red then
            if ngx then
                ngx.log(ngx.ERR, "redis storage connect failed: ", tostring(err))
                if ngx.status then
                    -- per-request bootstrap (api.lua): fail the request
                end
            end
            error("redis storage unavailable: " .. tostring(err))
        end
        _M.driver = DualWriter.new({ primary = primary, disk = disk, mode = "redis+disk" })
    elseif stype == "pgsql" then
        local primary = PgsqlDriver.new({ settings = settings })
        local pg, err = primary:connect()
        if not pg then
            if ngx and ngx.log then
                ngx.log(ngx.EMERG, "pgsql storage connect failed: ", tostring(err))
            end
            error("pgsql storage unavailable: " .. tostring(err))
        end
        _M.driver = DualWriter.new({ primary = primary, disk = disk, mode = "pgsql+disk" })
    else
        _M.type = "disk"
        _M.driver = disk
    end
    return _M.driver
end

function _M.get_driver()
    if not _M.driver then
        _M.init()
    end
    return _M.driver
end

function _M.health()
    local d = _M.get_driver()
    local h = d:health()
    h.storage_type = _M.type
    return h
end

return _M
