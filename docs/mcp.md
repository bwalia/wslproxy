# MCP (Model Context Protocol) Server Support for WSLProxy

## Overview

WSLProxy includes a built-in **MCP (Model Context Protocol) server** that allows AI agents to securely discover, read, and interact with the gateway's configuration, routing rules, health status, and traffic metrics.

MCP is an open standard that enables AI assistants (Claude, GPT, Cursor, custom agents) to programmatically access structured data from external systems. WSLProxy's MCP implementation follows a **read-first, safe-by-default** design philosophy.

## Why MCP Support?

- **AI-Native Operations**: Enable AI agents to understand your proxy configuration, diagnose issues, and suggest optimizations
- **Structured Discovery**: Agents can discover available data through standardized endpoints rather than parsing documentation
- **Enterprise Security**: Token-based auth, read-only mode by default, automatic secret redaction
- **Observability Integration**: Expose traffic metrics, error rates, and health status to AI monitoring agents

## Architecture

```
AI Agent (Claude/GPT/Cursor)
       │
       ▼
  /mcp/* endpoints (NGINX location block)
       │
       ▼
  mcp/handler.lua (Router)
       │
       ├── mcp/auth.lua (API key validation)
       ├── mcp/config.lua (Configuration loader)
       ├── mcp/resources.lua (Data providers)
       └── mcp/tools.lua (Feature-flagged actions)
```

All MCP code lives in `api/mcp/` and integrates with existing WSLProxy modules without duplicating business logic.

## Endpoints

### Core MCP Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/mcp/manifest` | GET | MCP server manifest (discovery) |
| `/mcp/capabilities` | GET | Detailed capability listing |
| `/mcp/resources` | GET | List all available resources |
| `/mcp/resources/{id}` | GET | Fetch a specific resource |
| `/mcp/tools` | GET | List available tools |
| `/mcp/tools/{name}` | POST | Execute a tool |
| `/mcp/jsonrpc` | POST | Full JSON-RPC 2.0 endpoint |

### Available Resources

| Resource ID | Description | Category |
|-------------|-------------|----------|
| `servers` | Virtual host / server configurations | Configuration |
| `rules` | Security rules and HTTP routing policies | Configuration |
| `upstreams` | Backend upstream server pools | Configuration |
| `profiles` | Environment profiles (dev/staging/prod) | Configuration |
| `ssl` | SSL/TLS certificate configurations | Security |
| `cache` | Static content cache configurations | Performance |
| `health` | Gateway health status and worker info | Observability |
| `metrics` | Traffic metrics, latency, error rates | Observability |
| `settings` | Non-sensitive gateway settings | Configuration |

### Available Tools (Feature-Flagged)

| Tool Name | Description | Read-Only Safe |
|-----------|-------------|----------------|
| `validate_config` | Run `openresty -t` syntax check | Yes |
| `get_error_logs` | Fetch recent error logs (redacted) | Yes |
| `reload_config` | Reload NGINX config (dry-run first) | No (requires read-write mode) |

## Configuration

### settings.json

Add an `mcp` section to your `settings.json`:

```json
{
  "mcp": {
    "enabled": true,
    "mode": "read-only",
    "tools_enabled": false,
    "api_key": "your-secure-api-key-here",
    "api_key_header": "X-MCP-API-Key",
    "rate_limit": 100,
    "redact_secrets": true
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable MCP server |
| `mode` | string | `"read-only"` | `"read-only"` or `"read-write"` |
| `tools_enabled` | boolean | `false` | Enable MCP tools |
| `api_key` | string | `null` | API key for authentication |
| `api_key_header` | string | `"X-MCP-API-Key"` | Header name for API key |
| `rate_limit` | number | `100` | Max requests per minute |
| `redact_secrets` | boolean | `true` | Auto-redact sensitive fields |

### Environment Variable Overrides

Environment variables take highest priority:

```bash
MCP_ENABLED=true          # Enable MCP server
MCP_MODE=read-only        # Set operation mode
MCP_API_KEY=my-secret-key # Set API key
MCP_TOOLS_ENABLED=false   # Enable/disable tools
```

## Security Model

### Authentication

MCP endpoints support three authentication methods (checked in order):

1. **Custom Header**: `X-MCP-API-Key: your-api-key`
2. **Bearer Token**: `Authorization: Bearer your-api-key`
3. **Query Parameter**: `?api_key=your-api-key` (development only)

If no API key is configured, MCP runs in open mode (suitable for development). **Always set an API key in production.**

### Read-Only Mode (Default)

By default, MCP operates in `read-only` mode:
- All resource reads are permitted
- Tool execution (write operations) is blocked
- Config reload requires explicit `read-write` mode

### Secret Redaction

All responses automatically redact sensitive fields:
- Passwords, API keys, tokens, secrets
- JWT passphrases
- AWS credentials
- SSL private keys

Redacted fields appear as `"[REDACTED]"` in responses.

### Network Restrictions

MCP endpoints are served on the admin port (8080) alongside the existing management API. They are **not** exposed on the public-facing proxy ports (80/443).

## Usage Examples

### curl Examples

**Get the MCP manifest:**

```bash
curl -H "X-MCP-API-Key: your-key" \
  https://your-wslproxy:8080/mcp/manifest
```

**List all resources:**

```bash
curl -H "X-MCP-API-Key: your-key" \
  https://your-wslproxy:8080/mcp/resources
```

**Read server configurations:**

```bash
curl -H "X-MCP-API-Key: your-key" \
  https://your-wslproxy:8080/mcp/resources/servers?profile_id=prod
```

**Read health status:**

```bash
curl -H "X-MCP-API-Key: your-key" \
  https://your-wslproxy:8080/mcp/resources/health
```

**Read traffic metrics:**

```bash
curl -H "X-MCP-API-Key: your-key" \
  https://your-wslproxy:8080/mcp/resources/metrics
```

**Validate configuration (tool):**

```bash
curl -X POST \
  -H "X-MCP-API-Key: your-key" \
  -H "Content-Type: application/json" \
  https://your-wslproxy:8080/mcp/tools/validate_config
```

**JSON-RPC endpoint:**

```bash
curl -X POST \
  -H "X-MCP-API-Key: your-key" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"resources/read","params":{"uri":"wslproxy://resources/health"}}' \
  https://your-wslproxy:8080/mcp/jsonrpc
```

### Claude Desktop / MCP Client Configuration

Add WSLProxy as an MCP server in your Claude Desktop config (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "wslproxy": {
      "url": "https://your-wslproxy:8080/mcp/jsonrpc",
      "headers": {
        "X-MCP-API-Key": "your-api-key"
      }
    }
  }
}
```

### Cursor IDE MCP Configuration

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "wslproxy": {
      "url": "https://your-wslproxy:8080/mcp/jsonrpc",
      "headers": {
        "X-MCP-API-Key": "your-api-key"
      }
    }
  }
}
```

### Example Agent Queries

Once connected, AI agents can ask questions like:

- "What servers are configured in the prod profile?"
- "Show me the current health status of the gateway"
- "What are the top error codes in the last 24 hours?"
- "List all SSL-enabled domains"
- "What security rules are applied to incoming requests?"
- "Check if the NGINX configuration is valid"
- "Show recent error log entries"

## AI Agent Compatibility

The MCP implementation is compatible with:

| Client | Transport | Status |
|--------|-----------|--------|
| Claude MCP Client | JSON-RPC over HTTP | Supported |
| OpenAI Agents (GPT) | REST API | Supported |
| Cursor IDE | JSON-RPC over HTTP | Supported |
| Custom Agents | REST or JSON-RPC | Supported |

### Response Design Principles

All MCP responses follow these principles for optimal AI agent consumption:

1. **Deterministic**: Same input always produces same output structure
2. **Explicit Schemas**: Every response uses well-defined JSON schemas
3. **Structured Data Only**: No free-form text where structured data is expected
4. **Self-Describing**: Resources include URIs, MIME types, and metadata
5. **Safe by Default**: Secrets redacted, read-only mode, rate-limited

## Troubleshooting

### MCP returns 503 "MCP server is not enabled"

Add `"mcp": {"enabled": true}` to your `settings.json` or set `MCP_ENABLED=true` environment variable.

### MCP returns 401 "Missing MCP API key"

Provide the API key via `X-MCP-API-Key` header or `Authorization: Bearer <key>` header.

### Tools return "MCP tools are disabled"

Set `"tools_enabled": true` in the MCP config and ensure `mode` is `"read-write"` for write operations like `reload_config`.

### Resources return empty arrays

Ensure the `NGINX_CONFIG_DIR` environment variable points to the correct data directory and that the profile directory (e.g., `data/servers/prod/`) contains JSON configuration files.

## API Reference

Full API documentation is available at:
- **Swagger UI**: `https://your-wslproxy:8080/swagger/`
- **OpenAPI Spec**: `https://your-wslproxy:8080/swagger/openapi.yaml`
