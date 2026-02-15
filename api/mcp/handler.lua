-- MCP Handler (Router) for WSLProxy
-- Main entry point for all /mcp/* requests
-- Implements MCP protocol endpoints: manifest, capabilities, resources, tools, schemas
-- Follows JSON-RPC over HTTP pattern with REST-friendly endpoints

local _M = {}

local cjson = Cjson
local McpConfig = require("mcp.config")
local McpAuth = require("mcp.auth")
local McpResources = require("mcp.resources")
local McpTools = require("mcp.tools")
local McpSchemas = require("mcp.schemas")
local McpMappers = require("mcp.mappers")

-- Standard MCP JSON response helper
local function json_response(data, status_code)
    status_code = status_code or ngx.HTTP_OK
    ngx.status = status_code
    ngx.header.content_type = "application/json"
    ngx.header["X-MCP-Server"] = "wslproxy"
    ngx.header["X-MCP-Version"] = "2025-03-26"
    ngx.header["X-MCP-Schema-Version"] = McpSchemas.VERSION
    ngx.header["Cache-Control"] = "no-store"
    ngx.say(cjson.encode(data))
end

-- Standard error response
local function error_response(message, status_code, error_type)
    json_response({
        error = {
            code = status_code,
            message = message,
            type = error_type or "request_error"
        }
    }, status_code)
end

-----------------------------------------------------------
-- GET /mcp/manifest
-- Returns the MCP server manifest describing this server
-----------------------------------------------------------
function _M.manifest()
    local config = McpConfig.load()

    json_response({
        jsonrpc = "2.0",
        result = {
            protocolVersion = config.version,
            serverInfo = {
                name = config.server_name,
                version = config.server_version,
                description = "WSLProxy MCP Server - AI-accessible API gateway management interface. Provides read-only access to proxy configuration, routing rules, SSL settings, traffic metrics, and health status.",
                vendor = "WSLProxy",
                homepage = "https://www.wslproxy.com/"
            },
            capabilities = {
                resources = {
                    subscribe = false,
                    listChanged = false
                },
                tools = config.tools_enabled and {
                    listChanged = false
                } or nil
            },
            instructions = "This MCP server exposes WSLProxy gateway configuration and status as read-only resources. Use /mcp/resources to discover available data, and /mcp/resources/{id} to fetch specific resources. Tools (validate_config, get_error_logs, reload_config) are available when tools_enabled is true. Use /mcp/schemas to inspect typed resource schemas."
        }
    })
end

-----------------------------------------------------------
-- GET /mcp/capabilities
-- Returns detailed capability information for agent discovery
-----------------------------------------------------------
function _M.capabilities()
    local config = McpConfig.load()

    local resource_types = {}
    for _, res in ipairs(McpResources.RESOURCE_REGISTRY) do
        local schema = McpMappers.get_resource_schema(res.id)
        table.insert(resource_types, {
            id = res.id,
            name = res.name,
            description = res.description,
            uri = res.uri,
            mimeType = res.mimeType,
            category = res.category,
            read_only = res.read_only,
            resource_type = McpMappers.get_resource_type(res.id),
            schema_available = schema ~= nil
        })
    end

    local tool_types = {}
    if config.tools_enabled then
        for _, tool in ipairs(McpTools.TOOL_REGISTRY) do
            table.insert(tool_types, {
                name = tool.name,
                description = tool.description,
                inputSchema = tool.inputSchema,
                annotations = tool.annotations
            })
        end
    end

    json_response({
        server = config.server_name,
        version = config.server_version,
        protocol_version = config.version,
        mode = config.mode,
        schema_version = McpSchemas.VERSION,
        capabilities = {
            resources = resource_types,
            tools = #tool_types > 0 and tool_types or nil,
            authentication = {
                type = (config.api_key and config.api_key ~= "") and "api_key" or "none",
                header = config.api_key_header,
                description = "Provide API key via " .. config.api_key_header .. " header or Authorization: Bearer <key>"
            },
            rate_limiting = {
                enabled = true,
                max_requests_per_minute = config.rate_limit
            }
        },
        metadata = {
            ["x-ai-agent"] = true,
            ["x-mcp-compatible"] = true,
            platform = "openresty",
            gateway_type = "api-proxy",
            documentation = "/swagger/",
            mcp_documentation = "https://www.wslproxy.com/docs/mcp"
        }
    })
end

-----------------------------------------------------------
-- GET /mcp/resources
-- Lists all available MCP resources
-----------------------------------------------------------
function _M.list_resources()
    local resources = {}
    for _, res in ipairs(McpResources.RESOURCE_REGISTRY) do
        table.insert(resources, {
            uri = res.uri,
            name = res.name,
            description = res.description,
            mimeType = res.mimeType,
            metadata = {
                category = res.category,
                read_only = res.read_only,
                resource_type = McpMappers.get_resource_type(res.id),
                ["x-ai-agent"] = true
            }
        })
    end

    json_response({
        jsonrpc = "2.0",
        result = {
            resources = resources
        }
    })
end

-----------------------------------------------------------
-- GET /mcp/resources/{id}
-- Fetches a specific resource by ID with typed mapping
-----------------------------------------------------------
function _M.get_resource(resource_id)
    local config = McpConfig.load()

    if not resource_id or resource_id == "" then
        error_response("Resource ID is required", ngx.HTTP_BAD_REQUEST)
        return
    end

    -- Get query parameters
    local args = ngx.req.get_uri_args()
    local params = {
        profile_id = args.profile_id or args.profile or "prod"
    }

    -- Fetch the raw resource data
    local data, err = McpResources.get_resource(resource_id, config, params)
    if err then
        error_response(err, ngx.HTTP_NOT_FOUND, "resource_not_found")
        return
    end

    -- Apply typed mapper
    local typed_data = McpMappers.to_mcp_resource(resource_id, data)

    -- Find resource metadata
    local resource_meta = nil
    for _, res in ipairs(McpResources.RESOURCE_REGISTRY) do
        if res.id == resource_id then
            resource_meta = res
            break
        end
    end

    json_response({
        jsonrpc = "2.0",
        result = {
            contents = {
                {
                    uri = resource_meta and resource_meta.uri or ("wslproxy://resources/" .. resource_id),
                    mimeType = "application/json",
                    data = typed_data
                }
            }
        }
    })
end

-----------------------------------------------------------
-- GET /mcp/tools
-- Lists available MCP tools
-----------------------------------------------------------
function _M.list_tools()
    local config = McpConfig.load()

    if not config.tools_enabled then
        json_response({
            jsonrpc = "2.0",
            result = {
                tools = {},
                message = "MCP tools are disabled. Set mcp.tools_enabled=true and mcp.mode='read-write' to enable."
            }
        })
        return
    end

    local tools = {}
    for _, tool in ipairs(McpTools.TOOL_REGISTRY) do
        table.insert(tools, {
            name = tool.name,
            description = tool.description,
            inputSchema = tool.inputSchema,
            annotations = tool.annotations
        })
    end

    json_response({
        jsonrpc = "2.0",
        result = {
            tools = tools
        }
    })
end

-----------------------------------------------------------
-- POST /mcp/tools/{name}
-- Execute a specific tool
-----------------------------------------------------------
function _M.execute_tool(tool_name)
    if not tool_name or tool_name == "" then
        error_response("Tool name is required", ngx.HTTP_BAD_REQUEST)
        return
    end

    -- Parse request body for tool parameters
    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    local params = {}
    if body and body ~= "" then
        local parse_ok, parsed = pcall(cjson.decode, body)
        if parse_ok and parsed then
            params = parsed
        end
    end

    -- Execute the tool
    local result, tool_err = McpTools.execute(tool_name, params)
    if tool_err then
        error_response(tool_err, ngx.HTTP_BAD_REQUEST, "tool_error")
        return
    end

    json_response({
        jsonrpc = "2.0",
        result = result
    })
end

-----------------------------------------------------------
-- GET /mcp/schemas
-- Lists all available MCP schemas
-----------------------------------------------------------
function _M.list_schemas()
    local schemas = McpSchemas.list_schemas()

    json_response({
        jsonrpc = "2.0",
        result = {
            schema_version = McpSchemas.VERSION,
            schemas = schemas
        }
    })
end

-----------------------------------------------------------
-- GET /mcp/schemas/{name}
-- Returns a specific schema definition
-----------------------------------------------------------
function _M.get_schema(schema_name)
    if not schema_name or schema_name == "" then
        error_response("Schema name is required", ngx.HTTP_BAD_REQUEST)
        return
    end

    local schema, err = McpSchemas.get_schema(schema_name)
    if err then
        -- Try resource-specific schema
        local mapper = McpMappers.registry[schema_name]
        if mapper and mapper.schema then
            schema = mapper.schema
        else
            error_response(err, ngx.HTTP_NOT_FOUND, "not_found")
            return
        end
    end

    json_response({
        jsonrpc = "2.0",
        result = {
            name = schema_name,
            schema = schema
        }
    })
end

-----------------------------------------------------------
-- POST /mcp/jsonrpc
-- JSON-RPC 2.0 endpoint for full MCP protocol compliance
-----------------------------------------------------------
function _M.jsonrpc()
    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    if not body or body == "" then
        error_response("Request body is required", ngx.HTTP_BAD_REQUEST, "parse_error")
        return
    end

    local ok, request = pcall(cjson.decode, body)
    if not ok or not request then
        error_response("Invalid JSON", ngx.HTTP_BAD_REQUEST, "parse_error")
        return
    end

    if request.jsonrpc ~= "2.0" then
        error_response("Only JSON-RPC 2.0 is supported", ngx.HTTP_BAD_REQUEST, "invalid_request")
        return
    end

    local method = request.method
    local params = request.params or {}
    local id = request.id

    local config = McpConfig.load()

    -- Route JSON-RPC methods
    local result, rpc_err

    if method == "initialize" then
        result = {
            protocolVersion = config.version,
            serverInfo = {
                name = config.server_name,
                version = config.server_version
            },
            capabilities = {
                resources = { subscribe = false, listChanged = false },
                tools = config.tools_enabled and { listChanged = false } or nil
            }
        }
    elseif method == "resources/list" then
        local resources = {}
        for _, res in ipairs(McpResources.RESOURCE_REGISTRY) do
            table.insert(resources, {
                uri = res.uri,
                name = res.name,
                description = res.description,
                mimeType = res.mimeType
            })
        end
        result = { resources = resources }
    elseif method == "resources/read" then
        local uri = params.uri
        if not uri then
            rpc_err = { code = -32602, message = "Missing required parameter: uri" }
        else
            -- Extract resource ID from URI (wslproxy://resources/{id})
            local resource_id = uri:match("wslproxy://resources/(.+)$")
            if not resource_id then
                rpc_err = { code = -32602, message = "Invalid resource URI format. Expected: wslproxy://resources/{id}" }
            else
                local data, fetch_err = McpResources.get_resource(resource_id, config, params)
                if fetch_err then
                    rpc_err = { code = -32002, message = fetch_err }
                else
                    -- Apply typed mapper
                    local typed_data = McpMappers.to_mcp_resource(resource_id, data)
                    result = {
                        contents = {
                            {
                                uri = uri,
                                mimeType = "application/json",
                                text = cjson.encode(typed_data)
                            }
                        }
                    }
                end
            end
        end
    elseif method == "tools/list" then
        local tools = {}
        if config.tools_enabled then
            for _, tool in ipairs(McpTools.TOOL_REGISTRY) do
                table.insert(tools, {
                    name = tool.name,
                    description = tool.description,
                    inputSchema = tool.inputSchema,
                    annotations = tool.annotations
                })
            end
        end
        result = { tools = tools }
    elseif method == "tools/call" then
        local tool_name = params.name
        local tool_arguments = params.arguments or {}
        if not tool_name then
            rpc_err = { code = -32602, message = "Missing required parameter: name" }
        else
            local tool_result, tool_err = McpTools.execute(tool_name, tool_arguments)
            if tool_err then
                rpc_err = { code = -32002, message = tool_err }
            else
                result = {
                    content = {
                        {
                            type = "text",
                            text = cjson.encode(tool_result)
                        }
                    },
                    isError = tool_result.isError or false
                }
            end
        end
    elseif method == "ping" then
        result = {}
    else
        rpc_err = { code = -32601, message = "Method not found: " .. tostring(method) }
    end

    -- Build JSON-RPC response
    local response = { jsonrpc = "2.0", id = id }
    if rpc_err then
        response.error = rpc_err
    else
        response.result = result
    end

    json_response(response)
end

-----------------------------------------------------------
-- Main router
-----------------------------------------------------------
function _M.route()
    -- Authenticate all MCP requests
    if not McpAuth.enforce() then
        return
    end

    local uri = ngx.var.uri
    local method = ngx.req.get_method()

    -- Parse the MCP path: /mcp/{action}/{id}
    local mcp_path = uri:match("^/mcp/(.*)$")
    if not mcp_path or mcp_path == "" then
        -- /mcp root - return manifest
        _M.manifest()
        return
    end

    -- Remove trailing slash
    mcp_path = mcp_path:gsub("/$", "")

    -- Route to handlers
    if mcp_path == "manifest" and method == "GET" then
        _M.manifest()

    elseif mcp_path == "capabilities" and method == "GET" then
        _M.capabilities()

    elseif mcp_path == "resources" and method == "GET" then
        _M.list_resources()

    elseif mcp_path:match("^resources/(.+)$") and method == "GET" then
        local resource_id = mcp_path:match("^resources/(.+)$")
        _M.get_resource(resource_id)

    elseif mcp_path == "tools" and method == "GET" then
        _M.list_tools()

    elseif mcp_path:match("^tools/(.+)$") and method == "POST" then
        local tool_name = mcp_path:match("^tools/(.+)$")
        _M.execute_tool(tool_name)

    elseif mcp_path == "schemas" and method == "GET" then
        _M.list_schemas()

    elseif mcp_path:match("^schemas/(.+)$") and method == "GET" then
        local schema_name = mcp_path:match("^schemas/(.+)$")
        _M.get_schema(schema_name)

    elseif mcp_path == "jsonrpc" and method == "POST" then
        _M.jsonrpc()

    else
        error_response("Not found: /mcp/" .. mcp_path, ngx.HTTP_NOT_FOUND, "not_found")
    end
end

return _M
