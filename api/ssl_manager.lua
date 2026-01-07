-- SSL Manager Module for wslproxy
-- Handles SSL certificate configuration and Let's Encrypt integration
-- Supports both Redis and disk storage based on settings.storage_type
-- Works with resty.auto-ssl for automatic certificate issuance

local _M = {}

local cjson = require("cjson")
local lfs = LFS

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- Get settings from settings.json
local function get_settings()
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
        ngx.log(ngx.WARN, "SSL Manager: Failed to load settings: ", tostring(err))
    end
    return settings
end

-- Get Redis connection settings
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

-- Check if storage type is Redis
local function is_redis_storage()
    local settings = get_settings()
    return settings and settings.storage_type == "redis"
end

-- Helper function to check if directory exists
local function is_directory_exists(path)
    local ok, attr = pcall(function()
        return lfs.attributes(path)
    end)
    if ok and attr then
        return attr.mode == "directory"
    end
    return false
end

-- Helper function to create directory recursively
local function create_directory(path)
    if is_directory_exists(path) then
        return true
    end

    -- Create parent directory first
    local parent = path:match("^(.*)/[^/]+/?$")
    if parent and not is_directory_exists(parent) then
        create_directory(parent)
    end

    local ok, err = pcall(function()
        lfs.mkdir(path)
    end)

    return ok, err
end

-- Get SSL config file path for disk storage
local function get_ssl_config_path(server_name)
    return configPath .. "data/ssl/" .. server_name .. ".json"
end

-- Get SSL config directory
local function get_ssl_config_dir()
    return configPath .. "data/ssl"
end

-- Connect to Redis with error handling
local function connect_redis()
    local ok, redis = pcall(require, "resty.redis")
    if not ok then
        return nil, "Redis module not available"
    end

    local red = redis:new()
    red:set_timeout(5000)

    local redisHost, redisPort = get_redis_config()
    local connect_ok, connect_err = red:connect(redisHost, redisPort)
    if not connect_ok then
        return nil, "Failed to connect to Redis: " .. (connect_err or "unknown error")
    end

    return red, nil
end

-- Store SSL configuration in Redis
local function store_ssl_config_redis(server_name, ssl_config)
    local red, err = connect_redis()
    if not red then
        return nil, err
    end

    local ok, set_err

    -- Store SSL configuration as separate keys for easy lookup
    ok, set_err = red:set(server_name .. ":ssl_enabled", ssl_config.ssl_enabled and "true" or "false")
    if not ok then
        red:set_keepalive(10000, 100)
        return nil, "Failed to store ssl_enabled: " .. (set_err or "unknown error")
    end

    if ssl_config.ssl_email then
        ok, set_err = red:set(server_name .. ":ssl_email", ssl_config.ssl_email)
        if not ok then
            red:set_keepalive(10000, 100)
            return nil, "Failed to store ssl_email: " .. (set_err or "unknown error")
        end
    end

    ok, set_err = red:set(server_name .. ":ssl_auto_renew", (ssl_config.ssl_auto_renew ~= false) and "true" or "false")
    if not ok then
        red:set_keepalive(10000, 100)
        return nil, "Failed to store ssl_auto_renew: " .. (set_err or "unknown error")
    end

    ok, set_err = red:set(server_name .. ":ssl_force_https", (ssl_config.ssl_force_https ~= false) and "true" or "false")
    if not ok then
        red:set_keepalive(10000, 100)
        return nil, "Failed to store ssl_force_https: " .. (set_err or "unknown error")
    end

    -- Store staging mode (default to true for safety)
    ok, set_err = red:set(server_name .. ":ssl_staging", (ssl_config.ssl_staging ~= false) and "true" or "false")
    if not ok then
        red:set_keepalive(10000, 100)
        return nil, "Failed to store ssl_staging: " .. (set_err or "unknown error")
    end

    red:set_keepalive(10000, 100)
    return true, nil
end

-- Store SSL configuration on disk
local function store_ssl_config_disk(server_name, ssl_config)
    local ssl_dir = get_ssl_config_dir()

    -- Create SSL directory if it doesn't exist
    if not is_directory_exists(ssl_dir) then
        local dir_ok, dir_err = create_directory(ssl_dir)
        if not dir_ok then
            return nil, "Failed to create SSL config directory: " .. tostring(dir_err)
        end
    end

    local file_path = get_ssl_config_path(server_name)

    local config_data = {
        server_name = server_name,
        ssl_enabled = ssl_config.ssl_enabled or false,
        ssl_email = ssl_config.ssl_email or "",
        ssl_auto_renew = ssl_config.ssl_auto_renew ~= false,
        ssl_force_https = ssl_config.ssl_force_https ~= false,
        ssl_staging = ssl_config.ssl_staging ~= false,  -- Default to staging for safety
        updated_at = os.time()
    }

    local ok, write_err = pcall(function()
        local file = io.open(file_path, "w")
        if file then
            file:write(cjson.encode(config_data))
            file:close()
        else
            error("Could not open file for writing")
        end
    end)

    if not ok then
        return nil, "Failed to write SSL config to disk: " .. tostring(write_err)
    end

    return true, nil
end

-- Store SSL configuration for a domain
-- Automatically chooses storage based on settings.storage_type
function _M.store_ssl_config(server_name, ssl_config)
    if not server_name or server_name == "" then
        return nil, "Server name is required"
    end

    local use_redis = is_redis_storage()

    if use_redis then
        local ok, err = store_ssl_config_redis(server_name, ssl_config)
        if not ok then
            -- Fallback to disk if Redis fails
            ngx.log(ngx.WARN, "SSL Manager: Redis storage failed, falling back to disk: ", err)
            return store_ssl_config_disk(server_name, ssl_config)
        end
        return ok, err
    else
        return store_ssl_config_disk(server_name, ssl_config)
    end
end

-- Remove SSL configuration from Redis
local function remove_ssl_config_redis(server_name)
    local red, err = connect_redis()
    if not red then
        return nil, err
    end

    -- Remove all SSL-related keys
    red:del(server_name .. ":ssl_enabled")
    red:del(server_name .. ":ssl_email")
    red:del(server_name .. ":ssl_auto_renew")
    red:del(server_name .. ":ssl_force_https")
    red:del(server_name .. ":ssl_staging")

    red:set_keepalive(10000, 100)
    return true, nil
end

-- Remove SSL configuration from disk
local function remove_ssl_config_disk(server_name)
    local file_path = get_ssl_config_path(server_name)

    local ok, err = pcall(function()
        os.remove(file_path)
    end)

    if not ok then
        -- File might not exist, which is fine
        ngx.log(ngx.INFO, "SSL Manager: Could not remove SSL config file (may not exist): ", tostring(err))
    end

    return true, nil
end

-- Remove SSL configuration for a domain
function _M.remove_ssl_config(server_name)
    if not server_name or server_name == "" then
        return nil, "Server name is required"
    end

    local use_redis = is_redis_storage()

    if use_redis then
        local ok, err = remove_ssl_config_redis(server_name)
        if not ok then
            ngx.log(ngx.WARN, "SSL Manager: Failed to remove from Redis, trying disk: ", err)
        end
        -- Also try to remove from disk in case it exists there
        remove_ssl_config_disk(server_name)
        return true, nil
    else
        return remove_ssl_config_disk(server_name)
    end
end

-- Get SSL configuration from Redis
local function get_ssl_config_redis(server_name)
    local red, err = connect_redis()
    if not red then
        return nil, err
    end

    local ssl_config = {}

    local ssl_enabled = red:get(server_name .. ":ssl_enabled")
    ssl_config.ssl_enabled = (ssl_enabled == "true")

    local ssl_email = red:get(server_name .. ":ssl_email")
    if ssl_email and ssl_email ~= ngx.null then
        ssl_config.ssl_email = ssl_email
    end

    local ssl_auto_renew = red:get(server_name .. ":ssl_auto_renew")
    ssl_config.ssl_auto_renew = (ssl_auto_renew ~= "false")

    local ssl_force_https = red:get(server_name .. ":ssl_force_https")
    ssl_config.ssl_force_https = (ssl_force_https ~= "false")

    local ssl_staging = red:get(server_name .. ":ssl_staging")
    ssl_config.ssl_staging = (ssl_staging ~= "false")  -- Default to staging

    red:set_keepalive(10000, 100)

    return ssl_config, nil
end

-- Get SSL configuration from disk
local function get_ssl_config_disk(server_name)
    local file_path = get_ssl_config_path(server_name)

    local ssl_config = {
        ssl_enabled = false,
        ssl_email = nil,
        ssl_auto_renew = true,
        ssl_force_https = true,
        ssl_staging = true  -- Default to staging for safety
    }

    local ok, result = pcall(function()
        local file = io.open(file_path, "rb")
        if file then
            local content = file:read("*a")
            file:close()
            if content and content ~= "" then
                return cjson.decode(content)
            end
        end
        return nil
    end)

    if ok and result then
        ssl_config.ssl_enabled = result.ssl_enabled or false
        ssl_config.ssl_email = result.ssl_email
        ssl_config.ssl_auto_renew = result.ssl_auto_renew ~= false
        ssl_config.ssl_force_https = result.ssl_force_https ~= false
        ssl_config.ssl_staging = result.ssl_staging ~= false  -- Default to staging
    end

    return ssl_config, nil
end

-- Get SSL configuration for a domain
function _M.get_ssl_config(server_name)
    if not server_name or server_name == "" then
        return nil, "Server name is required"
    end

    local use_redis = is_redis_storage()

    if use_redis then
        local config, err = get_ssl_config_redis(server_name)
        if not config then
            -- Fallback to disk if Redis fails
            ngx.log(ngx.WARN, "SSL Manager: Redis read failed, trying disk: ", err)
            return get_ssl_config_disk(server_name)
        end
        return config, err
    else
        return get_ssl_config_disk(server_name)
    end
end

-- Check if SSL is enabled for a domain (optimized for allow_domain callback)
function _M.is_ssl_enabled(server_name)
    if not server_name or server_name == "" then
        return false
    end

    local use_redis = is_redis_storage()

    if use_redis then
        local red, err = connect_redis()
        if not red then
            -- Fallback to disk
            ngx.log(ngx.WARN, "SSL Manager: Redis unavailable for SSL check, trying disk: ", err)
            local config = get_ssl_config_disk(server_name)
            return config and config.ssl_enabled == true
        end

        local ssl_enabled = red:get(server_name .. ":ssl_enabled")
        red:set_keepalive(10000, 100)

        return (ssl_enabled == "true")
    else
        local config = get_ssl_config_disk(server_name)
        return config and config.ssl_enabled == true
    end
end

-- Check if staging mode is enabled for a domain
function _M.is_staging_enabled(server_name)
    if not server_name or server_name == "" then
        return true  -- Default to staging for safety
    end

    local use_redis = is_redis_storage()

    if use_redis then
        local red, err = connect_redis()
        if not red then
            -- Fallback to disk
            ngx.log(ngx.WARN, "SSL Manager: Redis unavailable for staging check, trying disk: ", err)
            local config = get_ssl_config_disk(server_name)
            return config and config.ssl_staging ~= false
        end

        local ssl_staging = red:get(server_name .. ":ssl_staging")
        red:set_keepalive(10000, 100)

        return (ssl_staging ~= "false")  -- Default to staging if not set
    else
        local config = get_ssl_config_disk(server_name)
        return config and config.ssl_staging ~= false
    end
end

-- Get certificate status for a domain
function _M.get_certificate_status(server_name)
    if not server_name or server_name == "" then
        return nil, "Server name is required"
    end

    local status = {
        ssl_enabled = false,
        ssl_staging = true,
        certificate_exists = false,
        certificate_expiry = nil,
        storage_type = is_redis_storage() and "redis" or "disk"
    }

    -- Get SSL config
    local ssl_config, config_err = _M.get_ssl_config(server_name)
    if ssl_config then
        status.ssl_enabled = ssl_config.ssl_enabled
        status.ssl_staging = ssl_config.ssl_staging ~= false
    end

    -- Check if certificate exists in auto-ssl storage (only if Redis is used)
    if is_redis_storage() then
        local red, redis_err = connect_redis()
        if red then
            -- auto-ssl stores certs with key pattern: auto-ssl:domain:latest
            local cert_key = "auto-ssl:" .. server_name .. ":latest"
            local cert_data = red:get(cert_key)
            if cert_data and cert_data ~= ngx.null then
                status.certificate_exists = true

                -- Try to get expiry info
                local expiry_key = "auto-ssl:" .. server_name .. ":expiry"
                local expiry = red:get(expiry_key)
                if expiry and expiry ~= ngx.null then
                    status.certificate_expiry = tonumber(expiry)
                end
            end

            red:set_keepalive(10000, 100)
        else
            ngx.log(ngx.WARN, "SSL Manager: Could not check certificate status in Redis: ", redis_err)
        end
    end

    return status, nil
end

-- Trigger certificate issuance for a domain (informational)
function _M.trigger_certificate_issuance(server_name)
    if not server_name or server_name == "" then
        return nil, "Server name is required"
    end

    local ssl_config, err = _M.get_ssl_config(server_name)
    if not ssl_config or not ssl_config.ssl_enabled then
        return nil, "SSL is not enabled for this domain"
    end

    ngx.log(ngx.INFO, "SSL Manager: Domain ", server_name, " is configured for SSL. Certificate will be issued on first HTTPS request.")

    return true, nil
end

return _M
