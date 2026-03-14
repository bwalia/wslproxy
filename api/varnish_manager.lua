-- Varnish Manager Module for WSL Proxy
-- Handles per-server Varnish reverse proxy/cache configuration
-- Supports both Redis and disk storage based on settings.storage_type
-- Manages Varnish config, VCL snippets, and deployment status

local _M = {}

local cjson = require("cjson")
local lfs = LFS

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- Default Varnish configuration per server
local DEFAULT_VARNISH_CONFIG = {
    varnish_enabled = false,

    -- Varnish listener
    listen_port = 6081,
    listen_address = "127.0.0.1",
    admin_listen_port = 6082,
    admin_listen_address = "127.0.0.1",

    -- Backend (origin) settings - auto-populated from server config if empty
    backend_host = "",
    backend_port = 80,
    backend_connect_timeout = "5s",
    backend_first_byte_timeout = "30s",
    backend_between_bytes_timeout = "5s",

    -- Cache behavior
    cache_ttl_default = 120,   -- seconds
    cache_grace = 3600,        -- seconds
    cache_keep = 7200,         -- seconds

    -- Resource limits
    cache_size = "256m",
    thread_pool_min = 5,
    thread_pool_max = 1000,
    thread_pool_timeout = 300,
    workspace_client = 64000,
    workspace_backend = 131072,

    -- Health check (probe)
    health_check_enabled = true,
    health_check_url = "/health",
    health_check_interval = "5s",
    health_check_timeout = "2s",
    health_check_threshold = 3,
    health_check_window = 5,

    -- Logging
    logging_enabled = true,
    log_format = "varnishncsa"
}

-- Valid VCL hook points for snippet injection
local VALID_HOOK_POINTS = {
    vcl_init = true,
    vcl_recv = true,
    vcl_hash = true,
    vcl_hit = true,
    vcl_miss = true,
    vcl_backend_fetch = true,
    vcl_backend_response = true,
    vcl_deliver = true,
    vcl_synth = true
}

-- ============================================================
-- Internal helpers (mirrors cache_manager.lua patterns)
-- ============================================================

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
        ngx.log(ngx.WARN, "Varnish Manager: Failed to load settings: ", tostring(err))
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

local function is_redis_storage()
    local settings = get_settings()
    return settings and settings.storage_type == "redis"
end

local function is_directory_exists(path)
    local ok, attr = pcall(function()
        return lfs.attributes(path)
    end)
    if ok and attr then
        return attr.mode == "directory"
    end
    return false
end

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

local function get_varnish_config_path(server_name)
    return configPath .. "data/varnish/" .. server_name .. ".json"
end

local function get_varnish_config_dir()
    return configPath .. "data/varnish"
end

local function get_vcl_dir()
    return configPath .. "data/varnish/vcl"
end

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

local function release_redis(red)
    if red then
        red:set_keepalive(10000, 100)
    end
end

-- Generate a simple UUID for snippet IDs
local function generate_uuid()
    local template = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
    return string.gsub(template, "[xy]", function(c)
        local v = (c == "x") and math.random(0, 0xf) or math.random(8, 0xb)
        return string.format("%x", v)
    end)
end

-- ============================================================
-- Public API Functions
-- ============================================================

-- Get Varnish configuration for a server
function _M.get_varnish_config(server_name)
    if not server_name or server_name == "" then
        return nil, "Server name is required"
    end

    if is_redis_storage() then
        local red, err = connect_redis()
        if not red then
            ngx.log(ngx.WARN, "Varnish Manager: Redis not available, falling back to disk: ", tostring(err))
        else
            local cache_key = server_name .. ":varnish_config"
            local cache_data = red:get(cache_key)
            release_redis(red)

            if cache_data and cache_data ~= ngx.null then
                local ok, config = pcall(cjson.decode, cache_data)
                if ok and config then
                    return config, nil
                end
            end
            return nil, "Varnish config not found"
        end
    end

    -- Disk storage
    local config_path = get_varnish_config_path(server_name)
    local file = io.open(config_path, "rb")
    if not file then
        return nil, "Varnish config not found"
    end

    local content = file:read("*a")
    file:close()

    if not content or content == "" then
        return nil, "Varnish config is empty"
    end

    local ok, config = pcall(cjson.decode, content)
    if not ok then
        return nil, "Failed to parse Varnish config"
    end

    return config, nil
end

-- Save Varnish configuration for a server
function _M.save_varnish_config(server_name, config)
    if not server_name or server_name == "" then
        return false, "Server name is required"
    end

    if not config then
        return false, "Config is required"
    end

    -- Merge with defaults
    local full_config = {}
    for k, v in pairs(DEFAULT_VARNISH_CONFIG) do
        full_config[k] = v
    end
    for k, v in pairs(config) do
        full_config[k] = v
    end

    -- Preserve snippets if they exist in config
    if config.snippets then
        full_config.snippets = config.snippets
    elseif not full_config.snippets then
        full_config.snippets = {}
    end

    -- Preserve deploy status
    if config.deploy_status then
        full_config.deploy_status = config.deploy_status
    elseif not full_config.deploy_status then
        full_config.deploy_status = {
            state = "idle",
            last_deployed_at = nil,
            last_vcl_label = nil,
            last_error = nil
        }
    end

    -- Add metadata
    full_config.server_name = server_name
    full_config.updated_at = os.time()

    local json_config = cjson.encode(full_config)

    if is_redis_storage() then
        local red, err = connect_redis()
        if red then
            local cache_key = server_name .. ":varnish_config"
            local ok, set_err = red:set(cache_key, json_config)
            release_redis(red)

            if ok then
                ngx.log(ngx.INFO, "Varnish Manager: Saved config for ", server_name, " to Redis")
                return true, nil
            else
                ngx.log(ngx.WARN, "Varnish Manager: Failed to save to Redis: ", tostring(set_err))
            end
        end
    end

    -- Disk storage
    local varnish_dir = get_varnish_config_dir()
    if not is_directory_exists(varnish_dir) then
        create_directory(varnish_dir)
    end

    local config_path = get_varnish_config_path(server_name)
    local file, err = io.open(config_path, "wb")
    if not file then
        return false, "Failed to open file: " .. tostring(err)
    end

    file:write(json_config)
    file:close()

    ngx.log(ngx.INFO, "Varnish Manager: Saved config for ", server_name, " to disk")
    return true, nil
end

-- Enable Varnish for a server
function _M.enable_varnish(server_name, options)
    options = options or {}

    -- Get existing config or use defaults
    local existing_config = _M.get_varnish_config(server_name) or {}

    -- Merge: defaults -> existing -> new options
    local config = {}
    for k, v in pairs(DEFAULT_VARNISH_CONFIG) do
        config[k] = v
    end
    for k, v in pairs(existing_config) do
        config[k] = v
    end
    for k, v in pairs(options) do
        config[k] = v
    end

    config.varnish_enabled = true

    return _M.save_varnish_config(server_name, config)
end

-- Disable Varnish for a server
function _M.disable_varnish(server_name)
    local existing_config = _M.get_varnish_config(server_name) or {}
    existing_config.varnish_enabled = false

    return _M.save_varnish_config(server_name, existing_config)
end

-- Quick check if Varnish is enabled for a server
function _M.is_varnish_enabled(server_name)
    local config = _M.get_varnish_config(server_name)
    return config and config.varnish_enabled == true
end

-- Get default Varnish configuration
function _M.get_default_config()
    local config = {}
    for k, v in pairs(DEFAULT_VARNISH_CONFIG) do
        config[k] = v
    end
    config.snippets = {}
    config.deploy_status = {
        state = "idle",
        last_deployed_at = nil,
        last_vcl_label = nil,
        last_error = nil
    }
    return config
end

-- ============================================================
-- Snippet Management
-- ============================================================

-- Get all snippets for a server
function _M.get_snippets(server_name)
    local config = _M.get_varnish_config(server_name)
    if config and config.snippets then
        return config.snippets, nil
    end
    return {}, nil
end

-- Get a single snippet by ID
function _M.get_snippet(server_name, snippet_id)
    local snippets = _M.get_snippets(server_name)
    for _, snippet in ipairs(snippets) do
        if snippet.id == snippet_id then
            return snippet, nil
        end
    end
    return nil, "Snippet not found: " .. tostring(snippet_id)
end

-- Save (create or update) a snippet
function _M.save_snippet(server_name, snippet)
    if not snippet then
        return false, "Snippet is required"
    end
    if not snippet.name or snippet.name == "" then
        return false, "Snippet name is required"
    end
    if not snippet.hook_point or not VALID_HOOK_POINTS[snippet.hook_point] then
        return false, "Invalid hook_point. Valid options: vcl_init, vcl_recv, vcl_hash, vcl_hit, vcl_miss, vcl_backend_fetch, vcl_backend_response, vcl_deliver, vcl_synth"
    end
    if not snippet.content or snippet.content == "" then
        return false, "Snippet content is required"
    end

    local config = _M.get_varnish_config(server_name)
    if not config then
        config = _M.get_default_config()
    end
    if not config.snippets then
        config.snippets = {}
    end

    -- Set defaults
    if snippet.enabled == nil then
        snippet.enabled = true
    end
    if not snippet.priority then
        snippet.priority = 100
    end

    -- Check if updating existing snippet
    local found = false
    if snippet.id then
        for i, existing in ipairs(config.snippets) do
            if existing.id == snippet.id then
                config.snippets[i] = snippet
                found = true
                break
            end
        end
    end

    -- Create new snippet if not found
    if not found then
        snippet.id = snippet.id or generate_uuid()
        snippet.created_at = os.time()
        table.insert(config.snippets, snippet)
    end

    snippet.updated_at = os.time()

    -- Mark config as having pending changes
    if config.deploy_status and config.deploy_status.state == "deployed" then
        config.deploy_status.state = "pending_changes"
    end

    return _M.save_varnish_config(server_name, config)
end

-- Delete a snippet by ID
function _M.delete_snippet(server_name, snippet_id)
    if not snippet_id or snippet_id == "" then
        return false, "Snippet ID is required"
    end

    local config = _M.get_varnish_config(server_name)
    if not config or not config.snippets then
        return false, "No snippets found"
    end

    local new_snippets = {}
    local found = false
    for _, snippet in ipairs(config.snippets) do
        if snippet.id == snippet_id then
            found = true
        else
            table.insert(new_snippets, snippet)
        end
    end

    if not found then
        return false, "Snippet not found: " .. snippet_id
    end

    config.snippets = new_snippets

    -- Mark config as having pending changes
    if config.deploy_status and config.deploy_status.state == "deployed" then
        config.deploy_status.state = "pending_changes"
    end

    return _M.save_varnish_config(server_name, config)
end

-- ============================================================
-- Deploy Status Management
-- ============================================================

-- Get deployment status for a server
function _M.get_deploy_status(server_name)
    local config = _M.get_varnish_config(server_name)
    if config and config.deploy_status then
        return config.deploy_status, nil
    end
    return {
        state = "idle",
        last_deployed_at = nil,
        last_vcl_label = nil,
        last_error = nil
    }, nil
end

-- Update deployment status for a server
function _M.set_deploy_status(server_name, status)
    local config = _M.get_varnish_config(server_name)
    if not config then
        return false, "Varnish config not found for: " .. tostring(server_name)
    end

    config.deploy_status = status
    return _M.save_varnish_config(server_name, config)
end

-- ============================================================
-- VCL File Management
-- ============================================================

-- Save generated VCL to disk
function _M.save_generated_vcl(server_name, vcl_content)
    local vcl_dir = get_vcl_dir()
    if not is_directory_exists(vcl_dir) then
        create_directory(vcl_dir)
    end

    local vcl_path = vcl_dir .. "/" .. server_name .. ".vcl"
    local file, err = io.open(vcl_path, "wb")
    if not file then
        return false, "Failed to write VCL file: " .. tostring(err)
    end

    file:write(vcl_content)
    file:close()

    ngx.log(ngx.INFO, "Varnish Manager: Saved generated VCL for ", server_name)
    return true, vcl_path
end

-- Get last generated VCL content
function _M.get_generated_vcl(server_name)
    local vcl_path = get_vcl_dir() .. "/" .. server_name .. ".vcl"
    local file = io.open(vcl_path, "rb")
    if not file then
        return nil, "No generated VCL found"
    end

    local content = file:read("*a")
    file:close()
    return content, nil
end

-- ============================================================
-- Listing
-- ============================================================

-- List all Varnish configurations
function _M.list_varnish_configs()
    local configs = {}

    if is_redis_storage() then
        local red, err = connect_redis()
        if red then
            local keys = red:keys("*:varnish_config")
            if keys and type(keys) == "table" then
                for _, key in ipairs(keys) do
                    local server_name = key:match("^(.+):varnish_config$")
                    if server_name then
                        local config = _M.get_varnish_config(server_name)
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
    local varnish_dir = get_varnish_config_dir()
    if is_directory_exists(varnish_dir) then
        local ok, iter, dir = pcall(lfs.dir, varnish_dir)
        if ok and iter then
            for file in iter, dir do
                if file:match("%.json$") then
                    local server_name = file:gsub("%.json$", "")
                    local config = _M.get_varnish_config(server_name)
                    if config then
                        table.insert(configs, config)
                    end
                end
            end
        end
    end

    return configs
end

-- Delete Varnish configuration for a server
function _M.delete_varnish_config(server_name)
    if not server_name or server_name == "" then
        return false, "Server name is required"
    end

    if is_redis_storage() then
        local red, err = connect_redis()
        if red then
            local cache_key = server_name .. ":varnish_config"
            red:del(cache_key)
            release_redis(red)
            ngx.log(ngx.INFO, "Varnish Manager: Deleted config for ", server_name, " from Redis")
        end
    end

    -- Also delete from disk
    local config_path = get_varnish_config_path(server_name)
    os.remove(config_path)

    -- Delete generated VCL
    local vcl_path = get_vcl_dir() .. "/" .. server_name .. ".vcl"
    os.remove(vcl_path)

    return true, nil
end

-- ============================================================
-- Validation helpers
-- ============================================================

-- Get the list of valid hook points
function _M.get_valid_hook_points()
    local points = {}
    for k, _ in pairs(VALID_HOOK_POINTS) do
        table.insert(points, k)
    end
    table.sort(points)
    return points
end

-- Validate a hook point string
function _M.is_valid_hook_point(hook_point)
    return VALID_HOOK_POINTS[hook_point] == true
end

return _M
