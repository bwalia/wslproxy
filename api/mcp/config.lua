-- MCP Configuration Module for WSLProxy
-- Reads MCP settings from settings.json and environment variables
-- Provides centralized configuration access for all MCP handlers

local _M = {}

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- Default MCP configuration
local DEFAULT_CONFIG = {
    enabled = false,
    mode = "read-only",           -- "read-only" or "read-write"
    tools_enabled = false,        -- Feature flag for MCP tools
    api_key_header = "X-MCP-API-Key",
    rate_limit = 100,             -- requests per minute
    version = "2025-03-26",       -- MCP protocol version
    server_name = "wslproxy-mcp",
    server_version = "1.0.0",
    max_resource_items = 1000,
    redact_secrets = true,
    log_level = "info"
}

-- Load MCP configuration from settings.json
function _M.load()
    local config = {}
    for k, v in pairs(DEFAULT_CONFIG) do
        config[k] = v
    end

    -- Try to load from settings.json
    local ok, settings = pcall(function()
        local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
        if readSettings == nil then
            return nil
        end
        local jsonString = readSettings:read("*a")
        readSettings:close()
        if jsonString and jsonString ~= "" then
            return Cjson.decode(jsonString)
        end
        return nil
    end)

    if ok and settings and settings.mcp then
        local mcp = settings.mcp
        if mcp.enabled ~= nil then
            config.enabled = mcp.enabled
        end
        if mcp.mode then
            config.mode = mcp.mode
        end
        if mcp.tools_enabled ~= nil then
            config.tools_enabled = mcp.tools_enabled
        end
        if mcp.api_key then
            config.api_key = mcp.api_key
        end
        if mcp.api_key_header then
            config.api_key_header = mcp.api_key_header
        end
        if mcp.rate_limit then
            config.rate_limit = tonumber(mcp.rate_limit) or DEFAULT_CONFIG.rate_limit
        end
        if mcp.redact_secrets ~= nil then
            config.redact_secrets = mcp.redact_secrets
        end
        if mcp.log_level then
            config.log_level = mcp.log_level
        end
    end

    -- Environment variable overrides (highest priority)
    local env_enabled = os.getenv("MCP_ENABLED")
    if env_enabled ~= nil then
        config.enabled = (env_enabled == "true" or env_enabled == "1")
    end

    local env_mode = os.getenv("MCP_MODE")
    if env_mode then
        config.mode = env_mode
    end

    local env_tools = os.getenv("MCP_TOOLS_ENABLED")
    if env_tools ~= nil then
        config.tools_enabled = (env_tools == "true" or env_tools == "1")
    end

    local env_api_key = os.getenv("MCP_API_KEY")
    if env_api_key and env_api_key ~= "" then
        config.api_key = env_api_key
    end

    return config
end

-- Check if MCP is in read-only mode
function _M.is_read_only(config)
    return config.mode == "read-only"
end

-- Check if MCP tools are enabled
function _M.are_tools_enabled(config)
    return config.tools_enabled == true and not _M.is_read_only(config)
end

return _M
