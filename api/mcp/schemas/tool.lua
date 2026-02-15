-- MCP Tool Schemas
-- Defines the structure of MCP tools and tool execution results
-- Tools are feature-flagged and gated by MCP mode

local _M = {
    type = "wslproxy.mcp.tool",
    version = "1.0.0",
    description = "MCP tool definition with input schema and behavioral annotations"
}

-- Tool definition schema
_M.properties = {
    name = {
        type = "string",
        required = true,
        description = "Unique tool identifier"
    },
    description = {
        type = "string",
        required = true,
        description = "Human and agent-readable description of what the tool does"
    },
    inputSchema = {
        type = "object",
        required = true,
        description = "JSON Schema for tool input parameters",
        properties = {
            type = { type = "string", required = true, enum = {"object"} },
            properties = { type = "object", required = true },
            required = { type = "array", required = false }
        }
    },
    annotations = {
        type = "object",
        required = false,
        description = "Behavioral hints for AI agents",
        properties = {
            title = { type = "string", description = "Display title" },
            readOnlyHint = { type = "boolean", description = "Whether the tool only reads data" },
            destructiveHint = { type = "boolean", description = "Whether the tool can cause data loss" },
            idempotentHint = { type = "boolean", description = "Whether repeated calls are safe" },
            openWorldHint = { type = "boolean", description = "Whether the tool interacts with external systems" }
        }
    }
}

-----------------------------------------------------------
-- Tool-specific input/output schemas
-----------------------------------------------------------

-- validate_config tool
_M.validate_config = {
    type = "wslproxy.tool.validate_config",
    version = "1.0.0",
    description = "Validate OpenResty/NGINX configuration syntax",
    input = {
        type = "object",
        properties = {},
        required = {}
    },
    output = {
        type = "object",
        properties = {
            tool = { type = "string", description = "Tool name" },
            result = {
                type = "object",
                properties = {
                    valid = { type = "boolean", required = true, description = "Whether config syntax is valid" },
                    output = { type = "string", required = true, description = "Validation output text" },
                    timestamp = { type = "string", required = true, description = "ISO 8601 timestamp" }
                }
            },
            isError = { type = "boolean", description = "Whether the result represents an error" }
        }
    }
}

-- get_error_logs tool
_M.get_error_logs = {
    type = "wslproxy.tool.get_error_logs",
    version = "1.0.0",
    description = "Fetch recent error log entries with automatic redaction",
    input = {
        type = "object",
        properties = {
            lines = {
                type = "number",
                description = "Maximum number of lines to return",
                default = 100,
                minimum = 1,
                maximum = 500
            }
        },
        required = {}
    },
    output = {
        type = "object",
        properties = {
            tool = { type = "string" },
            result = {
                type = "object",
                properties = {
                    total_lines = { type = "number", description = "Total lines in log" },
                    returned_lines = { type = "number", description = "Lines returned" },
                    log_entries = { type = "array", description = "Redacted log lines" },
                    timestamp = { type = "string" }
                }
            },
            isError = { type = "boolean" }
        }
    }
}

-- reload_config tool
_M.reload_config = {
    type = "wslproxy.tool.reload_config",
    version = "1.0.0",
    description = "Reload NGINX configuration with mandatory pre-validation",
    input = {
        type = "object",
        properties = {
            dry_run = {
                type = "boolean",
                description = "If true, only validate without reloading",
                default = true
            }
        },
        required = {}
    },
    output = {
        type = "object",
        properties = {
            tool = { type = "string" },
            result = {
                type = "object",
                properties = {
                    reloaded = { type = "boolean", required = true, description = "Whether config was actually reloaded" },
                    dry_run = { type = "boolean", required = true, description = "Whether this was a dry run" },
                    validation = { type = "object", description = "Validation results" },
                    reload_output = { type = "string", description = "Reload command output (only if reloaded)" },
                    message = { type = "string", required = true, description = "Human-readable result message" },
                    timestamp = { type = "string", description = "ISO 8601 timestamp" }
                }
            },
            isError = { type = "boolean" }
        }
    }
}

-- Tool result envelope schema
_M.result_schema = {
    type = "wslproxy.mcp.tool_result",
    version = "1.0.0",
    description = "MCP tool execution result envelope",
    properties = {
        jsonrpc = { type = "string", required = true, enum = {"2.0"} },
        result = {
            type = "object",
            required = true,
            properties = {
                tool = { type = "string", required = true, description = "Tool that was executed" },
                result = { type = "object", required = true, description = "Tool-specific result data" },
                isError = { type = "boolean", required = true, description = "Whether execution resulted in an error" }
            }
        }
    }
}

return _M
