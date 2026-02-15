# Claude Agent Integration with WSLProxy MCP Server

This document demonstrates how to use **Claude** (via the Claude Desktop app or API) as an AI agent that interacts with WSLProxy through the Model Context Protocol (MCP).

## Why MCP Instead of Raw REST?

| Aspect | Raw REST API | MCP Protocol |
|--------|-------------|--------------|
| Discovery | Read Swagger docs, parse endpoints manually | `resources/list` returns structured catalog |
| Schema Understanding | Parse OpenAPI YAML, infer types | Typed resources with explicit schemas |
| Authentication | Varies per endpoint, JWT + cookies | Single API key, consistent across all resources |
| Error Handling | Different formats per endpoint | Standardized JSON-RPC error codes |
| Agent Safety | No built-in guardrails | Read-only mode, secret redaction, tool gating |
| Relationship Navigation | Manual URL construction | Resource relationships with typed references |

MCP provides a **single, consistent, AI-optimized interface** to all gateway functionality.

---

## Setup: Claude Desktop Configuration

Add WSLProxy as an MCP server in `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "wslproxy": {
      "url": "https://your-wslproxy:8080/mcp/jsonrpc",
      "headers": {
        "X-MCP-API-Key": "your-mcp-api-key"
      }
    }
  }
}
```

Once configured, Claude can automatically discover and use all WSLProxy MCP resources.

---

## Agent Flow 1: MCP Discovery

Claude starts by discovering what the MCP server offers.

### Step 1: Initialize Session

**Claude sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "initialize",
  "params": {
    "protocolVersion": "2025-03-26",
    "clientInfo": {
      "name": "claude-desktop",
      "version": "1.0.0"
    }
  }
}
```

**WSLProxy responds:**
```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "protocolVersion": "2025-03-26",
    "serverInfo": {
      "name": "wslproxy-mcp",
      "version": "1.0.0"
    },
    "capabilities": {
      "resources": {
        "subscribe": false,
        "listChanged": false
      }
    }
  }
}
```

### Step 2: Discover Available Resources

**Claude sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "resources/list"
}
```

**WSLProxy responds:**
```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": {
    "resources": [
      {
        "uri": "wslproxy://resources/servers",
        "name": "HTTP Servers",
        "description": "Virtual host / server configurations managed by WSLProxy",
        "mimeType": "application/json"
      },
      {
        "uri": "wslproxy://resources/rules",
        "name": "Security Rules & Routes",
        "description": "HTTP routing rules and security policies applied to incoming requests",
        "mimeType": "application/json"
      },
      {
        "uri": "wslproxy://resources/health",
        "name": "Health & Status",
        "description": "Current health status of the WSLProxy gateway",
        "mimeType": "application/json"
      },
      {
        "uri": "wslproxy://resources/metrics",
        "name": "Metrics Summary",
        "description": "Aggregated traffic metrics, latency distributions, error rates (non-PII)",
        "mimeType": "application/json"
      }
    ]
  }
}
```

---

## Agent Flow 2: Listing Routes (Servers)

A user asks Claude: *"What servers are configured in WSLProxy?"*

**Claude sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "resources/read",
  "params": {
    "uri": "wslproxy://resources/servers"
  }
}
```

**WSLProxy responds:**
```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "contents": [
      {
        "uri": "wslproxy://resources/servers",
        "mimeType": "application/json",
        "text": "{\"type\":\"wslproxy.server.list\",\"count\":2,\"items\":[{\"type\":\"wslproxy.server\",\"id\":\"abc-123\",\"attributes\":{\"server_name\":\"api.example.com\",\"profile_id\":\"prod\",\"ssl_enabled\":true,\"config_status\":true},\"relationships\":{\"profile\":{\"type\":\"wslproxy.profile\",\"id\":\"prod\"}}},{\"type\":\"wslproxy.server\",\"id\":\"def-456\",\"attributes\":{\"server_name\":\"staging.example.com\",\"profile_id\":\"staging\",\"ssl_enabled\":false,\"config_status\":true},\"relationships\":{\"profile\":{\"type\":\"wslproxy.profile\",\"id\":\"staging\"}}}]}"
      }
    ]
  }
}
```

**Claude's response to the user:**
> You have 2 servers configured in WSLProxy:
>
> 1. **api.example.com** (prod) — SSL enabled, config active
> 2. **staging.example.com** (staging) — No SSL, config active
>
> The production server has SSL/TLS enabled. Would you like me to check the SSL configuration details or look at the security rules?

---

## Agent Flow 3: Inspecting a Single Resource

A user asks: *"Show me the security rules for production"*

**Claude sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "resources/read",
  "params": {
    "uri": "wslproxy://resources/rules",
    "profile_id": "prod"
  }
}
```

**WSLProxy responds with typed rule resources:**
```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "contents": [
      {
        "uri": "wslproxy://resources/rules",
        "mimeType": "application/json",
        "text": "{\"type\":\"wslproxy.rule.list\",\"count\":1,\"items\":[{\"type\":\"wslproxy.rule\",\"id\":\"rule-789\",\"attributes\":{\"name\":\"Block_Non_EU\",\"profile_id\":\"prod\",\"priority\":1,\"match\":{\"rules\":{\"path_key\":\"starts_with\",\"path\":\"/api\",\"country_key\":\"not_equals\",\"country\":\"EU\"}},\"response\":{\"allow\":false,\"code\":403}}}]}"
      }
    ]
  }
}
```

**Claude's response:**
> There's 1 security rule active in production:
>
> **Block_Non_EU** (Priority 1)
> - Matches requests to `/api/*` from non-EU countries
> - Returns 403 Forbidden
>
> This rule blocks API access from outside the EU. Would you like to see traffic metrics to check how many requests are being blocked?

---

## Agent Flow 4: Reading Metrics Summary

A user asks: *"How is the gateway performing?"*

**Claude sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "resources/read",
  "params": {
    "uri": "wslproxy://resources/metrics"
  }
}
```

**WSLProxy responds:**
```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "contents": [
      {
        "uri": "wslproxy://resources/metrics",
        "mimeType": "application/json",
        "text": "{\"type\":\"wslproxy.metrics\",\"id\":\"current\",\"attributes\":{\"timestamp\":1739635200,\"datetime\":\"2026-02-15T12:00:00Z\",\"traffic\":{\"total_requests_24h\":45230,\"total_success_24h\":44100,\"total_errors_24h\":1130,\"success_rate\":97.5,\"avg_requests_per_hour\":1884},\"connections\":{\"reading\":2,\"writing\":5,\"waiting\":12,\"active\":19}}}"
      }
    ]
  }
}
```

**Claude's response:**
> The gateway is performing well:
>
> - **45,230 requests** in the last 24 hours
> - **97.5% success rate** (1,130 errors)
> - **~1,884 requests/hour** average
> - **19 active connections** right now (2 reading, 5 writing, 12 waiting)
>
> The error rate of 2.5% is worth investigating. Shall I pull the error log to check what's causing the failures?

---

## Agent Flow 5: Health Check

**Claude sends:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "resources/read",
  "params": {
    "uri": "wslproxy://resources/health"
  }
}
```

**WSLProxy responds:**
```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "contents": [
      {
        "uri": "wslproxy://resources/health",
        "mimeType": "application/json",
        "text": "{\"type\":\"wslproxy.health\",\"id\":\"current\",\"attributes\":{\"status\":\"healthy\",\"timestamp\":1739635200,\"datetime\":\"2026-02-15T12:00:00Z\",\"openresty\":{\"worker_pid\":1234,\"worker_count\":4},\"mcp\":{\"enabled\":true,\"mode\":\"read-only\",\"version\":\"2025-03-26\"},\"shared_dicts\":{\"prometheus_metrics\":{\"available\":true},\"traffic_stats\":{\"available\":true}}}}"
      }
    ]
  }
}
```

---

## Security Considerations

- Claude only has **read-only access** by default
- All passwords, API keys, and tokens are automatically **redacted** in responses
- The MCP API key is separate from the admin JWT — scoped only to MCP operations
- Tools (config validation, log access) require explicit enablement
- No server mutations are possible without switching to `read-write` mode

## Prompt Engineering Tips

When using Claude with WSLProxy MCP:

1. **Be specific about profiles**: "Show me prod servers" vs "Show me servers" (defaults to prod)
2. **Ask about relationships**: Claude can navigate from servers → rules → SSL configs
3. **Request health checks proactively**: Use health + metrics together for full picture
4. **Chain resource reads**: Claude can correlate data across multiple resources in one conversation
