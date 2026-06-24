# MCP Gateway

Use WSLProxy as a **governed front door in front of external MCP (Model
Context Protocol) servers** — filesystem, GitHub, Slack, internal tools.
Clients connect to WSLProxy; WSLProxy inspects the JSON-RPC traffic and
enforces policy before proxying upstream.

> **Not the same as [the MCP _server_](../api/mcp/README.md).** That exposes
> WSLProxy's *own* management surface as MCP. This is the inverse: WSLProxy
> as a gateway *in front of other* MCP servers.

MCP rides JSON-RPC 2.0 over Streamable HTTP, which WSLProxy already
reverse-proxies. The gateway adds MCP-aware **governance**, entirely
request-side (inspect `tools/call` on the way in). No response rewriting,
so enabling it is just a rule change — no nginx reload-template churn.

## Capabilities (Phase 1)

| Capability | What it does |
|---|---|
| **Auth bridging** | Strip the client's inbound credential; the upstream MCP server's credential is injected via the server's `custom_headers`. Secrets stay server-side — clients never hold backend tokens. |
| **Tool / method allow-deny** | Block disallowed tool names (`tools/call`) or JSON-RPC methods. Allowlist or denylist. |
| **Audit** | Every `tools/call` logged to `data/audit/YYYY-MM/DD.json` (`action: mcp_tool_call`). |
| **Rate limiting** | Per-client, optionally per-tool, sliding window via the `wsl_cache` shared dict. |

## Setup

### 1. Inject the upstream MCP server's credential (server `custom_headers`)

On the gateway **server**, add the upstream's auth header so it's applied to
every proxied request:

```json
"custom_headers": [
  { "header_key": "Authorization", "header_value": "Bearer <UPSTREAM_MCP_TOKEN>" }
]
```

### 2. Add an `mcp_gateway` policy to the routing **rule**

The rule proxies (code `305`) to the upstream MCP server and carries the policy:

```json
"response": {
  "code": 305,
  "redirect_uri": "https://upstream-mcp.internal:8080",
  "mcp_gateway": {
    "enabled": true,
    "strip_client_auth": true,
    "tools":   { "mode": "deny", "list": ["delete_file", "exec"] },
    "methods": { "deny": ["resources/write"] },
    "audit":   true,
    "rate_limit": { "window": 60, "max": 120, "per_tool": { "search": 20 } }
  }
}
```

- `tools.mode`: `"allow"` (only listed tools pass) or `"deny"` (listed tools blocked; default).
- `methods.deny`: optional JSON-RPC method denylist (e.g. block all writes).
- `rate_limit`: `max` is the per-client default; `per_tool` overrides specific tools. `window` in seconds.
- `strip_client_auth`: drop the client's `Authorization` before proxying (used with step 1's `custom_headers`).

A denied or rate-limited call is answered with a standard **JSON-RPC error**
and never reaches the upstream.

## Verify (direct HTTP)

```sh
GW=https://your-gateway.example.com/mcp/jsonrpc

# Allowed tool -> reaches upstream
curl -s $GW -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call","params":{"name":"read_file","arguments":{"path":"/etc/hostname"}}}'

# Denied tool -> JSON-RPC error, upstream never hit (response has X-MCP-Gateway: deny)
curl -s $GW -H 'Content-Type: application/json' \
  -d '{"jsonrpc":"2.0","id":2,"method":"tools/call","params":{"name":"delete_file","arguments":{"path":"/"}}}'
# => {"jsonrpc":"2.0","id":2,"error":{"code":-32000,"message":"MCP gateway: tool 'delete_file' is not allowed by policy"}}
```

Point any MCP client (Claude Desktop/Code, Cursor, …) at the gateway URL
instead of the upstream — the protocol is unchanged; only the policy is added.

## Behaviour & safety

- **Fails open on what it can't inspect** — non-POST requests (e.g. the SSE
  GET stream), bodies buffered to disk, or non-JSON-RPC payloads pass through
  untouched. Governance applies to recognised `tools/call`/methods only.
- **Fails open on infra issues** — missing shared dict / audit module degrade
  gracefully rather than breaking traffic.
- Errors use HTTP `200` with a JSON-RPC `error` body, the convention MCP
  clients expect.

## Roadmap (not in Phase 1)

- Filter `tools/list` responses to the allowed set (response-side) so denied
  tools don't even appear in a client's catalogue.
- Multi-upstream **federation** — aggregate several MCP servers' tool
  catalogues under one endpoint with namespacing and per-tool dispatch.
- Per-subject identity (from JWT) for rate-limit/audit instead of client IP.
