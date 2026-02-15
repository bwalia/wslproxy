-- MCP Error Schema
-- Defines the structure of error responses from the MCP server
-- Follows JSON-RPC 2.0 error conventions

local _M = {
    type = "wslproxy.mcp.error",
    version = "1.0.0",
    description = "MCP error response following JSON-RPC 2.0 conventions"
}

_M.properties = {
    error = {
        type = "object",
        required = true,
        description = "Error details",
        properties = {
            code = {
                type = "number",
                required = true,
                description = "HTTP status code or JSON-RPC error code"
            },
            message = {
                type = "string",
                required = true,
                description = "Human-readable error message"
            },
            type = {
                type = "string",
                required = true,
                description = "Error type classifier",
                enum = {
                    "authentication_error",
                    "authorization_error",
                    "request_error",
                    "resource_not_found",
                    "tool_error",
                    "validation_error",
                    "internal_error",
                    "not_found",
                    "parse_error",
                    "invalid_request",
                    "method_not_found",
                    "rate_limit_exceeded",
                    "service_unavailable"
                }
            },
            details = {
                type = "object",
                required = false,
                description = "Additional error details (e.g., validation errors)"
            }
        }
    }
}

-- Standard JSON-RPC error codes
_M.codes = {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    -- Custom MCP error codes
    RESOURCE_NOT_FOUND = -32002,
    TOOL_EXECUTION_ERROR = -32003,
    AUTHENTICATION_REQUIRED = -32004,
    READ_ONLY_MODE = -32005,
    TOOLS_DISABLED = -32006,
    RATE_LIMITED = -32007
}

-- Example error responses for documentation
_M.examples = {
    authentication = {
        error = {
            code = 401,
            message = "Missing MCP API key. Provide via X-MCP-API-Key header or Authorization: Bearer <key>",
            type = "authentication_error"
        }
    },
    not_found = {
        error = {
            code = 404,
            message = "Unknown resource: nonexistent",
            type = "resource_not_found"
        }
    },
    read_only = {
        error = {
            code = 403,
            message = "MCP server is in read-only mode. Write operations are not permitted.",
            type = "authorization_error"
        }
    },
    tools_disabled = {
        error = {
            code = 400,
            message = "MCP tools are disabled. Set mcp.tools_enabled=true in settings.json",
            type = "tool_error"
        }
    }
}

return _M
