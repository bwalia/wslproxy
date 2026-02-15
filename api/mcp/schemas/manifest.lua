-- MCP Manifest Schema
-- Defines the structure of the MCP server manifest returned by /mcp/manifest
-- Follows JSON-RPC 2.0 envelope with MCP protocol specification

local _M = {
    type = "wslproxy.mcp.manifest",
    version = "1.0.0",
    description = "MCP server manifest describing protocol version, server identity, and capabilities"
}

_M.properties = {
    jsonrpc = {
        type = "string",
        required = true,
        description = "JSON-RPC protocol version, always '2.0'",
        enum = {"2.0"}
    },
    result = {
        type = "object",
        required = true,
        description = "Manifest result payload",
        properties = {
            protocolVersion = {
                type = "string",
                required = true,
                description = "MCP protocol version (e.g., '2025-03-26')"
            },
            serverInfo = {
                type = "object",
                required = true,
                description = "Server identity and metadata",
                properties = {
                    name = {
                        type = "string",
                        required = true,
                        description = "Server identifier (e.g., 'wslproxy-mcp')"
                    },
                    version = {
                        type = "string",
                        required = true,
                        description = "Server implementation version (semver)"
                    },
                    description = {
                        type = "string",
                        required = true,
                        description = "Human-readable server description"
                    },
                    vendor = {
                        type = "string",
                        required = false,
                        description = "Vendor name"
                    },
                    homepage = {
                        type = "string",
                        required = false,
                        description = "Server homepage URL"
                    }
                }
            },
            capabilities = {
                type = "object",
                required = true,
                description = "Declared server capabilities",
                properties = {
                    resources = {
                        type = "object",
                        required = true,
                        description = "Resource capability declaration",
                        properties = {
                            subscribe = {
                                type = "boolean",
                                required = true,
                                description = "Whether resource subscriptions are supported"
                            },
                            listChanged = {
                                type = "boolean",
                                required = true,
                                description = "Whether listChanged notifications are supported"
                            }
                        }
                    },
                    tools = {
                        type = "object",
                        required = false,
                        description = "Tool capability declaration (null if tools disabled)",
                        properties = {
                            listChanged = {
                                type = "boolean",
                                required = false,
                                description = "Whether tool list change notifications are supported"
                            }
                        }
                    }
                }
            },
            instructions = {
                type = "string",
                required = true,
                description = "Instructions for AI agents on how to use this MCP server"
            }
        }
    }
}

-- Example manifest conforming to this schema
_M.example = {
    jsonrpc = "2.0",
    result = {
        protocolVersion = "2025-03-26",
        serverInfo = {
            name = "wslproxy-mcp",
            version = "1.0.0",
            description = "WSLProxy MCP Server - AI-accessible API gateway management interface",
            vendor = "WSLProxy",
            homepage = "https://www.wslproxy.com/"
        },
        capabilities = {
            resources = {
                subscribe = false,
                listChanged = false
            }
        },
        instructions = "Use /mcp/resources to discover available data, and /mcp/resources/{id} to fetch specific resources."
    }
}

return _M
