-- MCP Capabilities Schema
-- Defines the structure of the /mcp/capabilities response
-- Provides detailed discovery information for AI agents

local _M = {
    type = "wslproxy.mcp.capabilities",
    version = "1.0.0",
    description = "Detailed MCP server capabilities for agent discovery and integration"
}

_M.properties = {
    server = {
        type = "string",
        required = true,
        description = "Server identifier"
    },
    version = {
        type = "string",
        required = true,
        description = "Server implementation version"
    },
    protocol_version = {
        type = "string",
        required = true,
        description = "MCP protocol version"
    },
    mode = {
        type = "string",
        required = true,
        description = "Current operational mode",
        enum = {"read-only", "read-write"}
    },
    capabilities = {
        type = "object",
        required = true,
        description = "Capability declarations",
        properties = {
            resources = {
                type = "array",
                required = true,
                description = "Available resource type declarations",
                items = {
                    type = "object",
                    properties = {
                        id = { type = "string", required = true, description = "Resource type identifier" },
                        name = { type = "string", required = true, description = "Human-readable name" },
                        description = { type = "string", required = true, description = "Resource description" },
                        uri = { type = "string", required = true, description = "Resource URI pattern" },
                        mimeType = { type = "string", required = true, description = "Response MIME type" },
                        category = {
                            type = "string",
                            required = true,
                            description = "Resource category",
                            enum = {"configuration", "security", "performance", "observability"}
                        },
                        read_only = { type = "boolean", required = true, description = "Whether resource is read-only" }
                    }
                }
            },
            tools = {
                type = "array",
                required = false,
                description = "Available tool declarations (null if tools disabled)",
                items = {
                    type = "object",
                    properties = {
                        name = { type = "string", required = true, description = "Tool identifier" },
                        description = { type = "string", required = true, description = "Tool description" },
                        inputSchema = { type = "object", required = true, description = "JSON Schema for tool input" },
                        annotations = { type = "object", required = false, description = "Tool behavior annotations" }
                    }
                }
            },
            authentication = {
                type = "object",
                required = true,
                description = "Authentication requirements",
                properties = {
                    type = { type = "string", required = true, description = "Auth type (api_key, none)", enum = {"api_key", "none"} },
                    header = { type = "string", required = true, description = "Authentication header name" },
                    description = { type = "string", required = true, description = "Auth instructions" }
                }
            },
            rate_limiting = {
                type = "object",
                required = true,
                description = "Rate limiting configuration",
                properties = {
                    enabled = { type = "boolean", required = true },
                    max_requests_per_minute = { type = "number", required = true }
                }
            }
        }
    },
    metadata = {
        type = "object",
        required = true,
        description = "Server metadata and compatibility flags",
        properties = {
            ["x-ai-agent"] = { type = "boolean", required = true, description = "AI agent compatibility flag" },
            ["x-mcp-compatible"] = { type = "boolean", required = true, description = "MCP protocol compatibility flag" },
            platform = { type = "string", required = true, description = "Server platform (openresty)" },
            gateway_type = { type = "string", required = true, description = "Gateway type (api-proxy)" },
            documentation = { type = "string", required = false, description = "Documentation URL path" },
            mcp_documentation = { type = "string", required = false, description = "MCP documentation URL" }
        }
    }
}

return _M
