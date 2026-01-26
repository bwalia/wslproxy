-- ssl_init.lua
-- Initialize SSL domains cache from Redis at worker startup
-- Called from init_worker_by_lua_block in nginx.conf
-- This is needed because init_by_lua cannot use cosockets (Redis)

local _M = {}

local cjson = require("cjson")

local function get_settings()
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
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

    -- Only proceed with Redis loading if using Redis storage
    if not settings or settings.storage_type ~= "redis" then
        ngx.log(ngx.INFO, "ssl_init: Not using Redis storage, skipping Redis SSL domain loading")
        return
    end

    -- Connect to Redis
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
