# GPT / OpenAI Agent Integration with WSLProxy MCP Server

This document demonstrates how to use **GPT-based agents** (OpenAI Assistants, custom GPT agents, or direct API calls) to interact with WSLProxy through its MCP REST endpoints.

## Why MCP Instead of Raw REST for GPT Agents?

| Challenge with Raw REST | How MCP Solves It |
|------------------------|-------------------|
| Agent must parse Swagger YAML to understand API | `/mcp/capabilities` provides structured discovery |
| Different auth per endpoint (JWT, session) | Single `X-MCP-API-Key` for all MCP resources |
| Responses vary in structure across endpoints | Typed resources (`wslproxy.server`, `wslproxy.rule`) with consistent schema |
| Sensitive data in responses | Automatic secret redaction (`[REDACTED]`) |
| No safety guardrails for mutations | Read-only mode by default, explicit tool gating |
| Agent must construct complex URLs | Simple `/mcp/resources/{id}` pattern |

---

## Setup: OpenAI Function Calling

Define WSLProxy MCP endpoints as functions for the OpenAI Assistants API:

```json
{
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "wslproxy_get_resources",
        "description": "List all available WSLProxy MCP resources (servers, rules, SSL, cache, health, metrics)",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "wslproxy_read_resource",
        "description": "Read a specific WSLProxy resource by ID. Available: servers, rules, upstreams, profiles, ssl, cache, health, metrics, settings",
        "parameters": {
          "type": "object",
          "properties": {
            "resource_id": {
              "type": "string",
              "enum": ["servers", "rules", "upstreams", "profiles", "ssl", "cache", "health", "metrics", "settings"],
              "description": "The resource to read"
            },
            "profile_id": {
              "type": "string",
              "description": "Environment profile filter (default: prod)",
              "default": "prod"
            }
          },
          "required": ["resource_id"]
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "wslproxy_get_capabilities",
        "description": "Get detailed MCP server capabilities including available resources, tools, and authentication info",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    },
    {
      "type": "function",
      "function": {
        "name": "wslproxy_get_health",
        "description": "Quick health check of the WSLProxy gateway",
        "parameters": {
          "type": "object",
          "properties": {},
          "required": []
        }
      }
    }
  ]
}
```

### Function Implementation (Python)

```python
import requests

WSLPROXY_MCP_URL = "https://your-wslproxy:8080/mcp"
MCP_API_KEY = "your-mcp-api-key"
HEADERS = {
    "X-MCP-API-Key": MCP_API_KEY,
    "Content-Type": "application/json"
}

def wslproxy_get_resources():
    """List all available MCP resources."""
    resp = requests.get(f"{WSLPROXY_MCP_URL}/resources", headers=HEADERS)
    return resp.json()

def wslproxy_read_resource(resource_id, profile_id="prod"):
    """Read a specific resource."""
    resp = requests.get(
        f"{WSLPROXY_MCP_URL}/resources/{resource_id}",
        params={"profile_id": profile_id},
        headers=HEADERS
    )
    return resp.json()

def wslproxy_get_capabilities():
    """Get server capabilities."""
    resp = requests.get(f"{WSLPROXY_MCP_URL}/capabilities", headers=HEADERS)
    return resp.json()

def wslproxy_get_health():
    """Quick health check."""
    resp = requests.get(f"{WSLPROXY_MCP_URL}/resources/health", headers=HEADERS)
    return resp.json()

# Route function calls from GPT
def handle_function_call(name, arguments):
    if name == "wslproxy_get_resources":
        return wslproxy_get_resources()
    elif name == "wslproxy_read_resource":
        return wslproxy_read_resource(**arguments)
    elif name == "wslproxy_get_capabilities":
        return wslproxy_get_capabilities()
    elif name == "wslproxy_get_health":
        return wslproxy_get_health()
```

---

## Agent Flow 1: Discovery and Capabilities

**User prompt:** "What can you tell me about my API gateway?"

**GPT calls:** `wslproxy_get_capabilities()`

**Response from WSLProxy:**
```json
{
  "server": "wslproxy-mcp",
  "version": "1.0.0",
  "protocol_version": "2025-03-26",
  "mode": "read-only",
  "schema_version": "1.0.0",
  "capabilities": {
    "resources": [
      {"id": "servers", "name": "HTTP Servers", "category": "configuration", "resource_type": "wslproxy.server"},
      {"id": "rules", "name": "Security Rules & Routes", "category": "configuration", "resource_type": "wslproxy.rule"},
      {"id": "upstreams", "name": "Upstreams / Backends", "category": "configuration", "resource_type": "wslproxy.upstream"},
      {"id": "ssl", "name": "SSL Configurations", "category": "security", "resource_type": "wslproxy.ssl"},
      {"id": "cache", "name": "Cache Configurations", "category": "performance", "resource_type": "wslproxy.cache"},
      {"id": "health", "name": "Health & Status", "category": "observability", "resource_type": "wslproxy.health"},
      {"id": "metrics", "name": "Metrics Summary", "category": "observability", "resource_type": "wslproxy.metrics"}
    ],
    "authentication": {"type": "api_key", "header": "X-MCP-API-Key"}
  }
}
```

**GPT's response:**
> Your WSLProxy API gateway exposes 7 resource types I can access:
>
> **Configuration:** Servers, Security Rules, Upstreams
> **Security:** SSL Certificates
> **Performance:** Cache Configs
> **Observability:** Health Status, Traffic Metrics
>
> I'm currently in read-only mode, so I can inspect everything but won't make any changes. What would you like to explore?

---

## Agent Flow 2: Listing Routes

**User prompt:** "Show me all configured routes"

**GPT calls:** `wslproxy_read_resource(resource_id="servers", profile_id="prod")`

**Response (parsed):**
```json
{
  "type": "wslproxy.server.list",
  "count": 3,
  "items": [
    {
      "type": "wslproxy.server",
      "id": "srv-001",
      "attributes": {
        "server_name": "api.example.com",
        "profile_id": "prod",
        "ssl_enabled": true,
        "cache_enabled": false
      }
    },
    {
      "type": "wslproxy.server",
      "id": "srv-002",
      "attributes": {
        "server_name": "app.example.com",
        "profile_id": "prod",
        "ssl_enabled": true,
        "cache_enabled": true
      }
    },
    {
      "type": "wslproxy.server",
      "id": "srv-003",
      "attributes": {
        "server_name": "docs.example.com",
        "profile_id": "prod",
        "ssl_enabled": true,
        "cache_enabled": true
      }
    }
  ]
}
```

**GPT's response:**
> You have 3 production routes configured:
>
> | Server | SSL | Cache |
> |--------|-----|-------|
> | api.example.com | Yes | No |
> | app.example.com | Yes | Yes |
> | docs.example.com | Yes | Yes |
>
> All servers have SSL enabled. The API server doesn't use caching (expected for dynamic content). Would you like to drill into the security rules for any of these?

---

## Agent Flow 3: Reading Metrics

**User prompt:** "Are there any performance issues?"

**GPT calls:** `wslproxy_get_health()` and `wslproxy_read_resource(resource_id="metrics")`

**GPT combines both responses and says:**
> Here's the gateway performance snapshot:
>
> **Health:** Healthy (4 workers running)
> **Traffic (24h):** 128,450 requests, 99.1% success rate
> **Active connections:** 45 (8 reading, 12 writing, 25 waiting)
> **Average latency:** p50=12ms, p95=89ms, p99=245ms
>
> The p99 latency of 245ms is elevated — this might indicate some slow upstream responses. The error rate of 0.9% is within normal range. Want me to check the error logs or specific upstream health?

---

## Agent Flow 4: Investigating SSL

**User prompt:** "Check our SSL certificate status"

**GPT calls:** `wslproxy_read_resource(resource_id="ssl")`

**Response (parsed):**
```json
{
  "type": "wslproxy.ssl.list",
  "count": 3,
  "items": [
    {
      "type": "wslproxy.ssl",
      "id": "api.example.com",
      "attributes": {
        "domain": "api.example.com",
        "ssl_enabled": true,
        "ssl_auto_renew": true,
        "ssl_force_https": true
      }
    },
    {
      "type": "wslproxy.ssl",
      "id": "app.example.com",
      "attributes": {
        "domain": "app.example.com",
        "ssl_enabled": true,
        "ssl_auto_renew": true,
        "ssl_force_https": true
      }
    },
    {
      "type": "wslproxy.ssl",
      "id": "docs.example.com",
      "attributes": {
        "domain": "docs.example.com",
        "ssl_enabled": true,
        "ssl_auto_renew": false,
        "ssl_force_https": false
      }
    }
  ]
}
```

**GPT's response:**
> SSL status for your 3 domains:
>
> | Domain | SSL | Auto-Renew | Force HTTPS |
> |--------|-----|-----------|-------------|
> | api.example.com | Yes | Yes | Yes |
> | app.example.com | Yes | Yes | Yes |
> | docs.example.com | Yes | **No** | **No** |
>
> **Warning:** `docs.example.com` does not have auto-renewal enabled and doesn't force HTTPS. This means:
> 1. The certificate could expire if not manually renewed
> 2. Users can access the site over plain HTTP
>
> I recommend enabling both. Would you like me to note this for your team?

---

## Custom GPT System Prompt

If building a custom GPT with WSLProxy MCP access:

```
You are an API gateway operations assistant with access to WSLProxy via MCP.

When the user asks about their gateway:
1. First check /mcp/capabilities to understand available resources
2. Read relevant resources to answer their question
3. Always provide context about what mode you're in (read-only vs read-write)
4. Flag any security concerns (SSL misconfigurations, high error rates)
5. Never expose raw API keys or tokens — they are automatically redacted

Available resources: servers, rules, upstreams, profiles, ssl, cache, health, metrics, settings

When reporting issues, provide:
- Current values
- Recommended values
- Impact of not fixing
```

---

## Rate Limiting

The MCP server enforces rate limiting (default: 100 requests/minute). For GPT agents that make many calls:

- Cache discovery calls (`capabilities`, `resources/list`)
- Batch related reads in a single conversation turn
- Use the JSON-RPC endpoint for complex multi-resource queries

## Error Handling

GPT agents should handle these MCP error responses:

| Status | Meaning | Agent Action |
|--------|---------|-------------|
| 401 | Missing/invalid API key | Check API key configuration |
| 403 | Read-only mode violation | Inform user that writes are disabled |
| 404 | Resource not found | Suggest valid resource IDs |
| 429 | Rate limited | Wait and retry with backoff |
| 503 | MCP disabled | Inform user to enable MCP |
