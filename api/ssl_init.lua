-- ssl_init.lua
-- Initialize SSL domains cache at worker startup
-- Called from init_worker_by_lua_block in nginx.conf
-- This is needed because init_by_lua cannot use cosockets (Redis)
--
-- For disk storage: reconciles server configs with SSL config files.
-- If a server has ssl_enabled=true but no SSL config file exists,
-- the missing file is created and the domain is added to the shared dict.

local _M = {}

local cjson = require("cjson")
local lfs = LFS

local function get_config_path()
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
    -- Ensure trailing slash
    if configPath:sub(-1) ~= "/" then
        configPath = configPath .. "/"
    end
    return configPath
end

local function get_settings()
    local configPath = get_config_path()
    local settings = {}
    local ok, err = pcall(function()
        local readSettings = io.open(configPath .. "data/settings.json", "rb")
        if readSettings then
            local jsonString = readSettings:read("*a")
            readSettings:close()
            if jsonString and jsonString ~= "" then
                settings = cjson.decode(jsonString)
            end
        end
    end)
    if not ok then
        ngx.log(ngx.WARN, "ssl_init: Failed to load settings: ", tostring(err))
    end
    return settings
end

local function get_redis_config()
    local redisHost = os.getenv("REDIS_HOST") or "localhost"
    local redisPort = tonumber(os.getenv("REDIS_PORT")) or 6379

    local settings = get_settings()
    if settings and settings.env_vars then
        if settings.env_vars.REDIS_HOST then
            redisHost = settings.env_vars.REDIS_HOST
        end
        if settings.env_vars.REDIS_PORT then
            redisPort = tonumber(settings.env_vars.REDIS_PORT) or 6379
        end
    end

    return redisHost, redisPort
end

-- Reconcile server configs with SSL config files (disk storage mode)
-- Scans all server config files for ssl_enabled=true and ensures
-- a corresponding SSL config file exists in data/ssl/
local function reconcile_disk_ssl_configs(shd)
    local configPath = get_config_path()
    local servers_dir = configPath .. "data/servers/"
    local ssl_dir = configPath .. "data/ssl/"

    -- Check if servers directory exists
    local dir_ok, dir_attr = pcall(function()
        return lfs.attributes(servers_dir)
    end)
    if not dir_ok or not dir_attr or dir_attr.mode ~= "directory" then
        ngx.log(ngx.INFO, "ssl_init: Servers directory not found: ", servers_dir)
        return 0
    end

    -- Ensure SSL directory exists
    local ssl_dir_ok, ssl_dir_attr = pcall(function()
        return lfs.attributes(ssl_dir)
    end)
    if not ssl_dir_ok or not ssl_dir_attr then
        local mkdir_ok = pcall(function() lfs.mkdir(ssl_dir) end)
        if not mkdir_ok then
            ngx.log(ngx.WARN, "ssl_init: Could not create SSL directory: ", ssl_dir)
            return 0
        end
    end

    local domains_reconciled = 0

    -- Iterate through profile directories (e.g., prod, staging)
    local profile_ok, profile_err = pcall(function()
        for profile_dir in lfs.dir(servers_dir) do
            if profile_dir ~= "." and profile_dir ~= ".." then
                local profile_path = servers_dir .. profile_dir
                local prof_attr = lfs.attributes(profile_path)
                if prof_attr and prof_attr.mode == "directory" then
                    -- Scan server config files in this profile
                    for server_file in lfs.dir(profile_path) do
                        if server_file:match("^host:.*%.json$") then
                            local file_path = profile_path .. "/" .. server_file
                            local read_ok, content = pcall(function()
                                local f = io.open(file_path, "rb")
                                if f then
                                    local c = f:read("*a")
                                    f:close()
                                    return c
                                end
                                return nil
                            end)

                            if read_ok and content and content ~= "" then
                                local parse_ok, server_config = pcall(cjson.decode, content)
                                if parse_ok and server_config and server_config.ssl_enabled == true then
                                    local server_name = server_config.server_name
                                    if server_name and server_name ~= "" then
                                        -- Check if SSL config file exists
                                        local ssl_file_path = ssl_dir .. server_name .. ".json"
                                        local ssl_file_attr = lfs.attributes(ssl_file_path)

                                        if not ssl_file_attr then
                                            -- SSL config file missing - create it
                                            ngx.log(ngx.WARN, "ssl_init: Missing SSL config for domain with ssl_enabled=true: ", server_name, " - creating it now")
                                            local ssl_config = {
                                                server_name = server_name,
                                                ssl_enabled = true,
                                                ssl_email = server_config.ssl_email or "",
                                                ssl_auto_renew = server_config.ssl_auto_renew ~= false,
                                                ssl_force_https = server_config.ssl_force_https ~= false,
                                                ssl_staging = server_config.ssl_staging ~= false,
                                                updated_at = os.time()
                                            }
                                            local write_ok, write_err = pcall(function()
                                                local f = io.open(ssl_file_path, "w")
                                                if f then
                                                    f:write(cjson.encode(ssl_config))
                                                    f:close()
                                                else
                                                    error("Could not open file: " .. ssl_file_path)
                                                end
                                            end)
                                            if write_ok then
                                                ngx.log(ngx.INFO, "ssl_init: Created missing SSL config: ", ssl_file_path)
                                            else
                                                ngx.log(ngx.ERR, "ssl_init: Failed to create SSL config: ", ssl_file_path, " - ", tostring(write_err))
                                            end
                                        end

                                        -- Ensure domain is in the shared dict cache
                                        if shd and not shd:get(server_name) then
                                            local set_ok, set_err = shd:set(server_name, true)
                                            if set_ok then
                                                domains_reconciled = domains_reconciled + 1
                                                ngx.log(ngx.INFO, "ssl_init: Reconciled SSL domain to cache: ", server_name)
                                            else
                                                ngx.log(ngx.WARN, "ssl_init: Failed to add reconciled domain: ", server_name, " - ", tostring(set_err))
                                            end
                                        end
                                    end
                                end
                            end
                        end
                    end
                end
            end
        end
    end)

    if not profile_ok then
        ngx.log(ngx.WARN, "ssl_init: Error during SSL reconciliation: ", tostring(profile_err))
    end

    return domains_reconciled
end

function _M.init()
    local settings = get_settings()

    local shd = ngx.shared.ssl_domains
    if not shd then
        ngx.log(ngx.WARN, "ssl_init: Shared dict 'ssl_domains' not available")
        return
    end

    -- Check if admin domain (FRONT_URL) should have SSL enabled
    -- This allows the admin panel itself to get SSL certificates
    local front_url = os.getenv("FRONT_URL")
    if front_url and front_url ~= "" then
        -- Extract domain from URL (remove protocol and trailing slash)
        local admin_domain = front_url:gsub("^https?://", ""):gsub("/$", "")
        -- Remove port if present
        admin_domain = admin_domain:gsub(":%d+$", "")

        if admin_domain and admin_domain ~= "" then
            -- Check settings for admin_ssl_enabled flag
            local admin_ssl_enabled = settings and settings.admin_ssl_enabled
            if admin_ssl_enabled then
                local set_ok, set_err = shd:set(admin_domain, true)
                if set_ok then
                    ngx.log(ngx.INFO, "ssl_init: Added admin domain to SSL cache: ", admin_domain)
                else
                    ngx.log(ngx.WARN, "ssl_init: Failed to add admin domain: ", admin_domain, " - ", tostring(set_err))
                end
            end
        end
    end

    -- For disk storage mode: reconcile server configs with SSL config files
    -- This catches cases where a server has ssl_enabled=true but the SSL
    -- config file was never created (e.g., created before SSL code was deployed)
    if not settings or settings.storage_type ~= "redis" then
        ngx.log(ngx.INFO, "ssl_init: Disk storage mode - running SSL config reconciliation")
        local reconciled = reconcile_disk_ssl_configs(shd)
        if reconciled > 0 then
            ngx.log(ngx.WARN, "ssl_init: Reconciled ", reconciled, " SSL domains from server configs (missing SSL config files were created)")
        else
            ngx.log(ngx.INFO, "ssl_init: SSL reconciliation complete - no missing configs found")
        end
        return
    end

    -- Connect to Redis (for Redis storage mode)
    local redis_ok, redis = pcall(require, "resty.redis")
    if not redis_ok then
        ngx.log(ngx.WARN, "ssl_init: Redis module not available")
        return
    end

    local red = redis:new()
    red:set_timeout(5000)

    local redisHost, redisPort = get_redis_config()
    local ok, err = red:connect(redisHost, redisPort)
    if not ok then
        ngx.log(ngx.WARN, "ssl_init: Failed to connect to Redis: ", tostring(err))
        return
    end

    -- Scan for all ssl_enabled keys in Redis
    local cursor = "0"
    local domains_loaded = 0

    repeat
        local res, scan_err = red:scan(cursor, "MATCH", "*:ssl_enabled", "COUNT", 100)
        if not res then
            ngx.log(ngx.WARN, "ssl_init: Redis SCAN failed: ", tostring(scan_err))
            break
        end

        cursor = res[1]
        local keys = res[2]

        for _, key in ipairs(keys) do
            -- Extract domain from key (format: "domain:ssl_enabled")
            local domain = key:match("^(.+):ssl_enabled$")
            if domain then
                -- Check if SSL is enabled for this domain
                local ssl_enabled = red:get(key)
                if ssl_enabled == "true" or ssl_enabled == "1" then
                    -- Add to shared dict
                    local set_ok, set_err = shd:set(domain, true)
                    if set_ok then
                        domains_loaded = domains_loaded + 1
                        ngx.log(ngx.INFO, "ssl_init: Loaded SSL domain from Redis: ", domain)
                    else
                        ngx.log(ngx.WARN, "ssl_init: Failed to add domain to shared dict: ", domain, " - ", tostring(set_err))
                    end
                end
            end
        end
    until cursor == "0"

    red:set_keepalive(10000, 100)

    ngx.log(ngx.INFO, "ssl_init: Loaded ", domains_loaded, " SSL domains from Redis")
end

return _M
