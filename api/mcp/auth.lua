-- MCP Authentication Module for WSLProxy
-- Handles API key validation for MCP endpoints
-- Supports both X-MCP-API-Key header and Bearer token auth

local _M = {}

local McpConfig = require("mcp.config")

-- Validate MCP authentication
-- Returns true if authenticated, false + error message otherwise
function _M.authenticate()
    local config = McpConfig.load()

    -- Check if MCP is enabled
    if not config.enabled then
        return false, "MCP server is not enabled", ngx.HTTP_SERVICE_UNAVAILABLE
    end

    -- If no API key is configured, MCP is open (development mode)
    -- In production, an API key should always be set
    if not config.api_key or config.api_key == "" then
        ngx.log(ngx.WARN, "MCP: No API key configured - running in open mode. Set mcp.api_key in settings.json for production.")
        return true, nil, nil
    end

    -- Check for API key in the configured header
    local api_key = ngx.req.get_headers()[config.api_key_header]

    -- Fallback: check Authorization Bearer header
    if not api_key then
        local auth_header = ngx.req.get_headers()["Authorization"]
        if auth_header then
            api_key = string.match(auth_header, "^Bearer%s+(.+)$")
        end
    end

    -- Fallback: check query parameter (for simple testing, not recommended for production)
    if not api_key then
        local args = ngx.req.get_uri_args()
        api_key = args["api_key"]
    end

    if not api_key or api_key == "" then
        return false, "Missing MCP API key. Provide via " .. config.api_key_header .. " header or Authorization: Bearer <key>", ngx.HTTP_UNAUTHORIZED
    end

    -- Constant-time comparison to prevent timing attacks
    if #api_key ~= #config.api_key then
        ngx.log(ngx.WARN, "MCP: Invalid API key attempt from ", ngx.var.remote_addr)
        return false, "Invalid MCP API key", ngx.HTTP_UNAUTHORIZED
    end

    local match = true
    for i = 1, #api_key do
        if string.byte(api_key, i) ~= string.byte(config.api_key, i) then
            match = false
        end
    end

    if not match then
        ngx.log(ngx.WARN, "MCP: Invalid API key attempt from ", ngx.var.remote_addr)
        return false, "Invalid MCP API key", ngx.HTTP_UNAUTHORIZED
    end

    return true, nil, nil
end

-- Check if the current request is allowed based on MCP mode
-- write_required: true if the operation requires write access
function _M.check_mode(write_required)
    local config = McpConfig.load()

    if write_required and McpConfig.is_read_only(config) then
        return false, "MCP server is in read-only mode. Write operations are not permitted.", ngx.HTTP_FORBIDDEN
    end

    return true, nil, nil
end

-- Enforce authentication and return error response if failed
function _M.enforce()
    local ok, err_msg, status_code = _M.authenticate()
    if not ok then
        ngx.status = status_code
        ngx.header.content_type = "application/json"
        ngx.say(Cjson.encode({
            error = {
                code = status_code,
                message = err_msg,
                type = "authentication_error"
            }
        }))
        ngx.exit(status_code)
        return false
    end
    return true
end

return _M
