-- Cache Manager Module for WSL Proxy
-- Handles static content caching configuration per server
-- Supports both Redis and disk storage based on settings.storage_type
-- Caches static files like .js, .css, fonts, images, etc.

local _M = {}

local cjson = require("cjson")
local lfs = LFS

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- Default cache configuration
local DEFAULT_CACHE_CONFIG = {
    cache_enabled = false,
    cache_ttl = 3600,  -- 1 hour default TTL in seconds
    cache_max_size = "100m",  -- Maximum cache size
    cache_inactive = "60m",  -- Remove cached items after 60 minutes of inactivity
    cache_valid_codes = { 200, 301, 302 },  -- HTTP codes to cache
    cache_bypass_cookie = "",  -- Cookie name to bypass cache (e.g., "nocache")
    cache_bypass_header = "",  -- Header name to bypass cache (e.g., "X-No-Cache")
    cache_bypass_auth = false,  -- Allow caching even with Authorization header (e.g. S3 signed origins)
    -- File types to cache (MIME types and extensions)
    cached_extensions = {
        -- JavaScript
        "js", "mjs",
        -- CSS
        "css",
        -- Fonts
        "woff", "woff2", "ttf", "otf", "eot",
        -- Images
        "jpg", "jpeg", "png", "gif", "ico", "svg", "webp", "avif",
        -- Documents
        "pdf", "doc", "docx", "xls", "xlsx",
        -- Media
        "mp3", "mp4", "webm", "ogg",
        -- Other static
        "html", "json", "xml", "txt", "map"
    },
    -- MIME types to cache
    cached_mime_types = {
        "text/html",
        "text/css",
        "text/javascript",
        "application/javascript",
        "application/x-javascript",
        "application/json",
        "application/xml",
        "image/jpeg",
        "image/png",
        "image/gif",
        "image/svg+xml",
        "image/webp",
        "image/x-icon",
        "font/woff",
        "font/woff2",
        "font/ttf",
        "font/otf",
        "application/font-woff",
        "application/font-woff2",
        "application/vnd.ms-fontobject",
        "audio/mpeg",
        "video/mp4",
        "video/webm"
    }
}

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
        ngx.log(ngx.WARN, "Cache Manager: Failed to load settings: ", tostring(err))
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

    local parent = path:match("^(.*)/[^/]+/?$")
    if parent and not is_directory_exists(parent) then
        create_directory(parent)
    end

    local ok, err = pcall(function()
        lfs.mkdir(path)
    end)

    return ok, err
end

-- Get cache config file path for disk storage
local function get_cache_config_path(server_name)
    return configPath .. "data/cache/" .. server_name .. ".json"
end

-- Get cache config directory
local function get_cache_config_dir()
    return configPath .. "data/cache"
end

-- Connect to Redis with error handling
local function connect_redis()
    local ok, redis = pcall(require, "resty.redis")
    if not ok then
        return nil, "Redis module not available"
    end

    local redisHost, redisPort = get_redis_config()
    local red = redis:new()
    red:set_timeout(5000)

    local conn_ok, conn_err = red:connect(redisHost, redisPort)
    if not conn_ok then
        return nil, "Failed to connect to Redis: " .. tostring(conn_err)
    end

    return red
end

-- Release Redis connection back to pool
local function release_redis(red)
    if red then
        red:set_keepalive(10000, 100)
    end
end

-- ============================================================
-- Public API Functions
-- ============================================================

-- Get cache configuration for a server (from Redis or disk)
function _M.get_cache_config(server_name)
    if not server_name or server_name == "" then
        return nil, "Server name is required"
    end

    if is_redis_storage() then
        -- Redis storage
        local red, err = connect_redis()
        if not red then
            ngx.log(ngx.WARN, "Cache Manager: Redis not available, falling back to disk: ", tostring(err))
            -- Fall through to disk storage
        else
            local cache_key = server_name .. ":cache_config"
            local cache_data = red:get(cache_key)
            release_redis(red)

            if cache_data and cache_data ~= ngx.null then
                local ok, config = pcall(cjson.decode, cache_data)
                if ok and config then
                    return config, nil
                end
            end
            -- Not found in Redis, return default
            return nil, "Cache config not found"
        end
    end

    -- Disk storage
    local config_path = get_cache_config_path(server_name)
    local file = io.open(config_path, "rb")
    if not file then
        return nil, "Cache config not found"
    end

    local content = file:read("*a")
    file:close()

    if not content or content == "" then
        return nil, "Cache config is empty"
    end

    local ok, config = pcall(cjson.decode, content)
    if not ok then
        return nil, "Failed to parse cache config"
    end

    return config, nil
end

-- Save cache configuration for a server
function _M.save_cache_config(server_name, config)
    if not server_name or server_name == "" then
        return false, "Server name is required"
    end

    if not config then
        return false, "Config is required"
    end

    -- Merge with defaults
    local full_config = {}
    for k, v in pairs(DEFAULT_CACHE_CONFIG) do
        full_config[k] = v
    end
    for k, v in pairs(config) do
        full_config[k] = v
    end

    -- Add metadata
    full_config.server_name = server_name
    full_config.updated_at = os.time()

    local json_config = cjson.encode(full_config)

    if is_redis_storage() then
        -- Redis storage
        local red, err = connect_redis()
        if red then
            local cache_key = server_name .. ":cache_config"
            local ok, set_err = red:set(cache_key, json_config)
            release_redis(red)

            if ok then
                ngx.log(ngx.INFO, "Cache Manager: Saved cache config for ", server_name, " to Redis")
                return true, nil
            else
                ngx.log(ngx.WARN, "Cache Manager: Failed to save to Redis: ", tostring(set_err))
            end
        end
        -- Fall through to disk on Redis failure
    end

    -- Disk storage
    local cache_dir = get_cache_config_dir()
    if not is_directory_exists(cache_dir) then
        create_directory(cache_dir)
    end

    local config_path = get_cache_config_path(server_name)
    local file, err = io.open(config_path, "wb")
    if not file then
        return false, "Failed to open file: " .. tostring(err)
    end

    file:write(json_config)
    file:close()

    ngx.log(ngx.INFO, "Cache Manager: Saved cache config for ", server_name, " to disk")
    return true, nil
end

-- Enable caching for a server
function _M.enable_cache(server_name, options)
    options = options or {}
    
    -- Get existing config or use defaults
    local existing_config = _M.get_cache_config(server_name) or {}
    
    -- Merge options
    local config = {}
    for k, v in pairs(DEFAULT_CACHE_CONFIG) do
        config[k] = v
    end
    for k, v in pairs(existing_config) do
        config[k] = v
    end
    for k, v in pairs(options) do
        config[k] = v
    end
    
    config.cache_enabled = true
    
    return _M.save_cache_config(server_name, config)
end

-- Disable caching for a server
function _M.disable_cache(server_name)
    local existing_config = _M.get_cache_config(server_name) or {}
    existing_config.cache_enabled = false
    
    return _M.save_cache_config(server_name, existing_config)
end

-- Check if caching is enabled for a server
function _M.is_cache_enabled(server_name)
    local config = _M.get_cache_config(server_name)
    return config and config.cache_enabled == true
end

-- Get list of all servers with cache configuration
function _M.list_cache_configs()
    local configs = {}

    if is_redis_storage() then
        local red, err = connect_redis()
        if red then
            local keys = red:keys("*:cache_config")
            if keys and type(keys) == "table" then
                for _, key in ipairs(keys) do
                    local server_name = key:match("^(.+):cache_config$")
                    if server_name then
                        local config = _M.get_cache_config(server_name)
                        if config then
                            table.insert(configs, config)
                        end
                    end
                end
            end
            release_redis(red)
            return configs
        end
    end

    -- Disk storage
    local cache_dir = get_cache_config_dir()
    if is_directory_exists(cache_dir) then
        local ok, iter, dir = pcall(lfs.dir, cache_dir)
        if ok and iter then
            for file in iter, dir do
                if file:match("%.json$") then
                    local server_name = file:gsub("%.json$", "")
                    local config = _M.get_cache_config(server_name)
                    if config then
                        table.insert(configs, config)
                    end
                end
            end
        end
    end

    return configs
end

-- Delete cache configuration for a server
function _M.delete_cache_config(server_name)
    if not server_name or server_name == "" then
        return false, "Server name is required"
    end

    if is_redis_storage() then
        local red, err = connect_redis()
        if red then
            local cache_key = server_name .. ":cache_config"
            red:del(cache_key)
            release_redis(red)
            ngx.log(ngx.INFO, "Cache Manager: Deleted cache config for ", server_name, " from Redis")
        end
    end

    -- Also delete from disk
    local config_path = get_cache_config_path(server_name)
    os.remove(config_path)

    return true, nil
end

-- Get default cache configuration
function _M.get_default_config()
    return DEFAULT_CACHE_CONFIG
end

-- Check if a file extension should be cached
function _M.should_cache_extension(server_name, extension)
    if not extension then
        return false
    end

    local config = _M.get_cache_config(server_name)
    if not config or not config.cache_enabled then
        return false
    end

    extension = extension:lower():gsub("^%.", "")
    local cached_extensions = config.cached_extensions or DEFAULT_CACHE_CONFIG.cached_extensions

    for _, ext in ipairs(cached_extensions) do
        if ext == extension then
            return true
        end
    end

    return false
end

-- Check if a MIME type should be cached
function _M.should_cache_mime_type(server_name, mime_type)
    if not mime_type then
        return false
    end

    local config = _M.get_cache_config(server_name)
    if not config or not config.cache_enabled then
        return false
    end

    mime_type = mime_type:lower()
    local cached_mime_types = config.cached_mime_types or DEFAULT_CACHE_CONFIG.cached_mime_types

    for _, mt in ipairs(cached_mime_types) do
        if mt == mime_type or mime_type:find(mt, 1, true) then
            return true
        end
    end

    return false
end

-- Get cache TTL for a server
function _M.get_cache_ttl(server_name)
    local config = _M.get_cache_config(server_name)
    if config and config.cache_ttl then
        return config.cache_ttl
    end
    return DEFAULT_CACHE_CONFIG.cache_ttl
end

return _M
