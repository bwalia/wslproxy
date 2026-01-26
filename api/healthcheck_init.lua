-- healthcheck_init.lua
-- Initialize upstream health checks from configuration files
-- Called from init_worker_by_lua_block in nginx.conf

local _M = {}

function _M.init()
    local upstreams_base_path = "/opt/nginx/data/upstreams"

    -- Check if LFS is available (it's loaded globally in init.lua)
    local lfs = LFS
    if not lfs then
        local lfs_ok
        lfs_ok, lfs = pcall(require, "lfs")
        if not lfs_ok then
            ngx.log(ngx.WARN, "healthcheck_init: LuaFileSystem (lfs) not available, skipping dynamic health check loading")
            return
        end
    end

    -- Check if upstreams base directory exists
    local base_attr = lfs.attributes(upstreams_base_path)
    if not base_attr or base_attr.mode ~= "directory" then
        ngx.log(ngx.INFO, "healthcheck_init: Upstreams directory does not exist yet: ", upstreams_base_path)
        return
    end

    -- Iterate through environment directories
    for env_dir in lfs.dir(upstreams_base_path) do
        if env_dir ~= "." and env_dir ~= ".." then
            local env_path = upstreams_base_path .. "/" .. env_dir
            local env_attr = lfs.attributes(env_path)

            if env_attr and env_attr.mode == "directory" then
                local healthcheck_file = env_path .. "/healthcheck.lua"
                local f = io.open(healthcheck_file, "r")

                if f then
                    f:close()
                    local hc_ok, hc_err = pcall(dofile, healthcheck_file)
                    if hc_ok then
                        ngx.log(ngx.INFO, "healthcheck_init: Loaded health check config from: ", healthcheck_file)
                    else
                        ngx.log(ngx.WARN, "healthcheck_init: Failed to load health check config from ", healthcheck_file, ": ", tostring(hc_err))
                    end
                end
            end
        end
    end
end

return _M
