# WSLProxy MCP Server

WSLProxy exposes its configuration and management surface as a **Model Context
Protocol** (MCP) server, so AI clients like Claude Desktop, Claude Code, Cursor,
ChatGPT Desktop, and any other MCP-aware client can manage your gateway
through natural language conversation — read servers and rules, create or
update them, attach rules to servers, run health checks, and more.

> *"Create a server for `api.example.com` in the int profile with SSL+auto-renew,
> then attach a 305 rule that proxies all paths to `https://backend.internal:8080`
> and strips the prefix."*

…becomes three tool calls. No clicking through the dashboard, no hand-writing
nginx config, no remembering field names.

---

## Table of Contents

- [What's exposed](#whats-exposed)
- [Prerequisites](#prerequisites)
- [Endpoint URLs](#endpoint-urls)
- [Integrate with Claude Desktop](#integrate-with-claude-desktop)
- [Integrate with Claude Code (CLI)](#integrate-with-claude-code-cli)
- [Integrate with Cursor / other MCP clients](#integrate-with-cursor--other-mcp-clients)
- [Direct HTTP (no MCP client)](#direct-http-no-mcp-client)
- [Tool reference](#tool-reference)
- [Resource reference](#resource-reference)
- [Safety patterns](#safety-patterns)
- [Troubleshooting](#troubleshooting)

---

## What's exposed

Three classes of capability:

- **Resources** (read-only, URL-based) — `wslproxy://resources/servers`,
  `wslproxy://resources/rules`, `wslproxy://resources/health`, etc. Lets the AI
  *look up* current state.
- **Tools** (action-based) — `create_server`, `delete_rule`, `bind_waf_policy`,
  `reload_config`, etc. Lets the AI *make changes*, gated by a write-mode flag.
- **Schemas** (introspection) — JSON Schema definitions for each tool's input
  shape, so MCP clients can render proper UIs and validate calls.

The full surface as of writing: **18 tools, 8+ resources** — see the [Tool
reference](#tool-reference) below for the catalogue.

---

## Prerequisites

### 1. Enable MCP in `data/settings.json`

```jsonc
{
  "mcp": {
    "enabled": true,
    "mode": "read-only",          // start here — flip to "write" later
    "api_key": "",                // see below
    "api_key_header": "X-MCP-API-Key",
    "tools_enabled": true,        // false = no tools, even resources won't list them
    "rate_limit": 100,            // per-minute soft cap
    "redact_secrets": true
  }
}
```

### 2. Generate an API key

There's no provisioning system — pick any long random string yourself:

```sh
# Any of these work
openssl rand -base64 48 | tr -d '/+=' | head -c 64
python3 -c "import secrets; print(secrets.token_urlsafe(48))"
uuidgen | tr -d '-' && uuidgen | tr -d '-'
```

Paste the value into `mcp.api_key` in `data/settings.json`. You'll use the
same string in your MCP client config (Claude Desktop, Code, etc.).

If `api_key` is empty, MCP runs in **open dev mode** — no auth required.
Useful for local testing on a closed network. **Never deploy this to
production** with an empty key.

### 3. Reload OpenResty

```sh
docker exec wslproxy-local /usr/local/openresty/bin/openresty -s reload
# or on a bare-metal install:
sudo systemctl reload openresty
```

### 4. Smoke-test from your terminal

```sh
KEY="<paste-your-key>"
curl -sS -H "X-MCP-API-Key: $KEY" "http://localhost:18280/mcp/tools" \
  | python3 -m json.tool | head -10
```

Should print a JSON object with `result.tools[]` — the catalogue of registered
tools. If you see this, the server is healthy and you can integrate with any
MCP client.

---

## Endpoint URLs

The MCP server runs on the admin port (default `18280` in docker dev, `9069`
on prod). Two interfaces:

| URL | Style | Used by |
|---|---|---|
| `/mcp/` | REST manifest | Browser / direct curl exploration |
| `/mcp/tools` | REST: GET to list, POST `/mcp/tools/{name}` to invoke | curl scripts, simple integrations |
| `/mcp/resources` | REST: GET to list, GET `/mcp/resources/{id}` to read | curl scripts |
| `/mcp/jsonrpc` | **JSON-RPC 2.0** — `initialize`, `tools/list`, `tools/call`, `resources/list`, `resources/read` | **Standard MCP clients** (Claude Desktop, Code, Cursor) |

Most AI clients speak JSON-RPC over the **Streamable HTTP** transport — they
all want `/mcp/jsonrpc`. The REST endpoints are for human/script convenience.

Auth on both interfaces: `X-MCP-API-Key: <your-key>` header.

---

## Integrate with Claude Desktop

> Custom MCP servers require **Claude Pro or Max**. Claude Desktop on Free
> launches the MCP process but ignores its tools — see [Troubleshooting →
> Connected but no tools](#claude-desktop-says-it-has-no-mcp-tools).

### 1. Install `mcp-remote` (the stdio↔HTTP bridge)

Claude Desktop launches MCP servers as stdio subprocesses, but WSLProxy is an
HTTP server. The [`mcp-remote`](https://github.com/geelen/mcp-remote) package
bridges the two and is the standard pattern for HTTP-backed MCP servers.

You need **Node.js ≥ 20** (Node 18 will crash with `ReferenceError: File is
not defined`). Verify:

```sh
node --version
# Need v20.18+ at minimum.  v22.x is the safe pick.
```

### 2. Edit `claude_desktop_config.json`

| OS | Path |
|---|---|
| macOS | `~/Library/Application Support/Claude/claude_desktop_config.json` |
| Windows | `%APPDATA%\Claude\claude_desktop_config.json` |
| Linux | `~/.config/Claude/claude_desktop_config.json` |

Add (or merge) this entry:

```jsonc
{
  "mcpServers": {
    "wslproxy": {
      "command": "/Users/<you>/.nvm/versions/node/v22.16.0/bin/npx",
      "args": [
        "-y", "mcp-remote",
        "http://localhost:18280/mcp/jsonrpc",
        "--header", "X-MCP-API-Key:${WSLPROXY_MCP_KEY}"
      ],
      "env": {
        "WSLPROXY_MCP_KEY": "<paste-the-same-key-from-settings.json>",
        "PATH": "/Users/<you>/.nvm/versions/node/v22.16.0/bin:/usr/local/bin:/usr/bin:/bin"
      }
    }
  }
}
```

**Why the absolute path + PATH override**: nvm users hit a classic gotcha
where `npx` launches Node via a shebang that re-resolves through `PATH`.
Without the explicit absolute path *and* PATH override, the wrong Node
version wins and `undici` (mcp-remote's HTTP dependency) crashes on
`ReferenceError: File is not defined`. The override is bulletproof; the
inconvenience is one line of config.

### 3. Restart Claude Desktop

Full quit (⌘Q on macOS, not just close the window) → reopen. The MCP
indicator should turn green / show `wslproxy: running`.

### 4. Verify in a chat

> *"What MCP tools do you have access to from wslproxy?"*

Claude should enumerate the 18 tools. If it says it has no tools and you're
on Pro, see [Troubleshooting](#troubleshooting).

---

## Integrate with Claude Code (CLI)

Claude Code supports MCP on **all plans** (Free, Pro, Max — Claude Code is
billed via API usage, not the Desktop subscription tier). This is the most
flexible option for ops work.

### Add the server

Use the `--` separator so claude doesn't consume the `--header` flag itself:

```sh
claude mcp add wslproxy \
  /Users/<you>/.nvm/versions/node/v22.16.0/bin/npx \
  -- \
  -y mcp-remote http://localhost:18280/mcp/jsonrpc \
  --header "X-MCP-API-Key:<your-key>"
```

Scope options:

| Flag | Effect |
|---|---|
| (default) | Project-local — config lives at `~/.claude.json` under the project entry, only active when running `claude` from this project's directory |
| `--scope user` | Global to your account — active from any directory |
| `--scope local` | Same as default |

### Verify

```sh
claude mcp list
# Should show:  wslproxy: ... ✓ Connected
```

### Use it

In any `claude` session inside this project:

> *"Use the wslproxy MCP tools to list all servers in the int profile and
> tell me which ones have SSL enabled."*

The AI will call `resources/read wslproxy://resources/servers`, parse the
JSON, and summarise. To exercise write tools:

> *"Create a server for `test.example.com` in the int profile, no SSL, with
> a 305 rule that proxies everything to `https://backend.local:8080`. Use
> dry_run first."*

---

## Integrate with Cursor / other MCP clients

The protocol is the same. Any MCP-aware client that supports Streamable HTTP
transport can connect — config syntax varies but the substance is identical.

### Cursor

Settings → MCP → "Add new MCP server":

```jsonc
{
  "wslproxy": {
    "url": "http://localhost:18280/mcp/jsonrpc",
    "headers": {
      "X-MCP-API-Key": "<your-key>"
    }
  }
}
```

Cursor supports direct HTTP MCP without needing `mcp-remote` as a bridge.

### Continue.dev / Cline / Roo Code

Same pattern — most use a JSON config with `url` + `headers` for direct HTTP,
or `command` + `args` for the `mcp-remote` stdio bridge approach. Check the
client's MCP docs for the exact field names.

### Any custom client (Python, Go, TypeScript)

The official MCP SDKs all support Streamable HTTP transport. Point them at
`/mcp/jsonrpc` with the `X-MCP-API-Key` header and call `initialize` →
`tools/list` → `tools/call` per the [MCP spec](https://modelcontextprotocol.io).

---

## Direct HTTP (no MCP client)

For scripts, CI/CD, or quick experimentation — you don't need an AI client at
all. Hit the HTTP API directly.

### List tools

```sh
curl -sS -H "X-MCP-API-Key: $KEY" "http://localhost:18280/mcp/tools" \
  | python3 -m json.tool
```

### Read a resource

```sh
curl -sS -H "X-MCP-API-Key: $KEY" \
  "http://localhost:18280/mcp/resources/servers?profile_id=int" \
  | python3 -m json.tool
```

### Execute a tool

```sh
curl -sS -H "X-MCP-API-Key: $KEY" -H 'Content-Type: application/json' \
  -X POST "http://localhost:18280/mcp/tools/create_server" \
  -d '{
    "server_name": "test.example.com",
    "profile_id": "int",
    "ssl_enabled": false,
    "dry_run": true
  }' \
  | python3 -m json.tool
```

### JSON-RPC variant (same as MCP clients use)

```sh
curl -sS -H "X-MCP-API-Key: $KEY" -H 'Content-Type: application/json' \
  -X POST "http://localhost:18280/mcp/jsonrpc" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "tools/call",
    "params": {
      "name": "create_server",
      "arguments": {
        "server_name": "test.example.com",
        "profile_id": "int",
        "ssl_enabled": false,
        "dry_run": true
      }
    }
  }' \
  | python3 -m json.tool
```

---

## Tool reference

| Tool | Purpose | Write tool? | Notes |
|---|---|---|---|
| `validate_config` | Run `openresty -t` syntax check | No | Safe to call anytime |
| `get_error_logs` | Tail recent error log lines | No | Filtered to last N lines |
| `reload_config` | Reload nginx (`openresty -s reload`) | Yes | Supports `dry_run: true` |
| `bind_waf_policy` | Attach a WAF policy to a server | Yes | Idempotent |
| `unbind_waf_policy` | Detach a WAF policy from a server | Yes | |
| `test_waf_rule` | Run a request through WAF without applying | No | |
| `update_traffic_split` | Adjust weighted-routing percentages | Yes | |
| `promote_backend` | 100% traffic to a single backend | Yes | |
| `rollback_backend` | Revert to single-backend routing | Yes | |
| `deploy_varnish` | Generate + deploy Varnish VCL | Yes | Supports `dry_run` |
| `purge_varnish` | Flush cached content | Yes | |
| **`create_server`** | Create a new Virtual Server with generated nginx block | Yes | Defaults `config_status: false` (staged); pass `activate: true` to go live |
| **`create_rule`** | Create a new routing rule (200/301/302/305/306/403) | Yes | Pass `servers: [...]` to attach in one call |
| **`attach_rule`** | Attach an existing rule to a server | Yes | Choose `method: "rules"` (primary AND) or `match_cases` (additive AND/OR). Idempotent. |
| **`update_server`** | Partial update of an existing server | Yes | Forbids `server_name`/`profile_id` changes; auto-regenerates nginx config block when SSL flags change |
| **`update_rule`** | Partial update of an existing rule | Yes | No_op response when nothing actually differs |
| **`delete_server`** | Delete a server and detach from referencing rules | Yes | **Destructive** — requires `confirm: true` or returns preview |
| **`delete_rule`** | Delete a rule and strip from every server's `rules` + `match_cases` | Yes | **Destructive** — requires `confirm: true` or returns preview |

**Bold = added in this MCP CRUD pass.**

### Write-mode gate

Tools marked "Write tool? Yes" only execute when `mcp.mode` is `"write"`. In
`read-only` mode they return:

```jsonc
{
  "error": {
    "code": 400,
    "message": "Tool 'create_server' requires write mode. MCP is currently in read-only mode.",
    "type": "tool_error"
  }
}
```

Flip in `data/settings.json` → `mcp.mode: "write"` → reload openresty.

---

## Resource reference

| URI | Returns |
|---|---|
| `wslproxy://resources/servers` | Virtual servers (filterable by `profile_id`) |
| `wslproxy://resources/rules` | Routing rules |
| `wslproxy://resources/upstreams` | Upstream backend definitions |
| `wslproxy://resources/profiles` | Environment profiles (prod / int / etc.) |
| `wslproxy://resources/ssl_configs` | SSL cert / domain settings |
| `wslproxy://resources/cache_configs` | Cache + Varnish settings |
| `wslproxy://resources/health` | Backend health from active health checks |
| `wslproxy://resources/metrics_summary` | Prometheus-style metrics digest |
| `wslproxy://resources/gateway_config` | Global gateway settings |
| `wslproxy://resources/traffic_splits` | Current weighted routing + canary state |

All resources are **read-only** and work in any MCP mode (including
`read-only`). Use them for inspection and reporting.

---

## Safety patterns

The tools are designed around three principles:

### 1. `dry_run` for creates/updates

```jsonc
{ "server_name": "foo.example.com", "profile_id": "int", "dry_run": true }
```

Returns the JSON that *would* be written, plus a decoded preview of the nginx
config block. No files are touched. Useful for showing a proposed change to a
human before commit.

### 2. `confirm: true` for deletes

```jsonc
{ "server_id": "host:foo.example.com", "profile_id": "int" }
// → returns: { "preview": true, "would_remove": {...}, "would_detach_from_rules": [...] }

{ "server_id": "host:foo.example.com", "profile_id": "int", "confirm": true }
// → actually deletes
```

The inverse default: deletes default to preview, you have to opt in to commit.
Mirrors `rm -i` semantics — destructive actions need explicit confirmation.

### 3. Staged servers by default

`create_server` defaults to `config_status: false` — the JSON is persisted,
but no `.conf` is written to `/opt/nginx/conf.d/` and no reload signal fires.
The server is **staged** and won't receive traffic until activated. Pass
`activate: true` to go live immediately (or call `update_server config_status:
true` later, plus `reload_config`).

This makes "Claude accidentally created the wrong server" survivable — it just
sits in `data/servers/{profile}/` waiting for review.

### Other defence in depth

- **Idempotency** — duplicate creates return a 409-shape error with the
  existing id rather than corrupting state.
- **Conflict detection** — `attach_rule` checks both `rules` AND `match_cases`
  before writing to avoid the double-evaluation footgun.
- **Cross-reference cleanup** — `delete_server` cascade-detaches from rules'
  `servers` arrays; `delete_rule` strips itself from every server's `rules` +
  `match_cases`. No dangling pointers.
- **Audit log** — every successful mutation logs to
  `data/audit/YYYY-MM/DD.json` (NDJSON) with `source: "mcp"` so MCP-driven
  changes are filterable from operator-driven changes.

---

## Troubleshooting

### "Server disconnected" / `ReferenceError: File is not defined`

You're hitting the Node 18 + `undici` incompatibility. `mcp-remote`'s HTTP
library requires Node ≥ 20.18.

**Fix**: in `claude_desktop_config.json`, set the absolute path to a Node 22+
`npx` AND override `PATH` in the env block so the shebang inside `mcp-remote`
finds the right Node:

```jsonc
{
  "command": "/Users/<you>/.nvm/versions/node/v22.16.0/bin/npx",
  "env": {
    "PATH": "/Users/<you>/.nvm/versions/node/v22.16.0/bin:/usr/local/bin:/usr/bin:/bin",
    "WSLPROXY_MCP_KEY": "..."
  }
}
```

### Claude Desktop says it has no MCP tools

Two likely causes:

1. **Free plan** — custom MCP servers require Claude Pro/Max. The integration
   wires up and the logs look healthy, but the LLM never sees the tools.
   Upgrade, or use Claude Code instead (free tier; pay-per-API-use).

2. **Per-chat UI toggle** — newer Claude Desktop versions require enabling MCP
   servers per chat. Look for a 🔧 / 🔌 / "Search and tools" icon near the
   message input and confirm `wslproxy` is checked.

### `Failed to connect` in `claude mcp list`

Usually missing `--header` because `claude mcp add` consumed it. **Use the
`--` separator** to pass args through:

```sh
claude mcp add wslproxy \
  /path/to/npx \
  -- \
  -y mcp-remote http://localhost:18280/mcp/jsonrpc \
  --header "X-MCP-API-Key:<key>"
```

Then verify with `claude mcp get wslproxy` — the `Args:` line should show the
full `--header X-MCP-API-Key:...` string.

### `tools/list` returns the manifest instead of tools

You're POSTing to `/mcp/` instead of `/mcp/jsonrpc`. The root path serves the
manifest for any method; `tools/list` is dispatched by JSON-RPC method only at
`/mcp/jsonrpc`.

### Tool returns "requires write mode"

`data/settings.json` has `mcp.mode: "read-only"`. Flip to `"write"` and
reload openresty.

### Rule created but server's `rules` field is empty

Pre-fix bug — `create_rule` used to attach via `match_cases` instead of
`rules`. Fixed in the same PR that introduced the CRUD tools. If you have
existing MCP-created servers showing this shape, you can migrate them with
a one-liner Python script:

```py
import json
p = 'data/servers/{profile}/host:{name}.json'
s = json.load(open(p))
mc = s.get('match_cases') or []
moved = [e['statement'] for e in mc if isinstance(e, dict) and e.get('condition') == 'and']
existing = s.get('rules') or []
if isinstance(existing, str): existing = [existing]
s['rules'] = existing + [r for r in moved if r not in existing]
s['match_cases'] = [e for e in mc if not (isinstance(e, dict) and e.get('condition') == 'and' and e.get('statement') in moved)] or {}
json.dump(s, open(p, 'w'), indent=4)
```

### Connection works, MCP server says "no tools registered"

Check `data/settings.json` → `mcp.tools_enabled: true`. Without it, only
resources are exposed.

---

## Implementation notes

For developers extending this:

- **All tool code is in [`tools.lua`](./tools.lua)** — `TOOL_REGISTRY` table
  declares the catalogue; `_M.execute` dispatches by name.
- **Resources are in [`resources.lua`](./resources.lua)** — one function per
  resource URI.
- **Auth is in [`auth.lua`](./auth.lua)** — header validation + write-mode
  gate.
- **Routing is in [`handler.lua`](./handler.lua)** — URL path dispatch for
  REST endpoints + JSON-RPC method dispatch.
- **Audit logging** uses the same `audit_logger` module the dashboard +
  versioning system use — see `api/audit_logger.lua`.

To add a new tool:

1. Add an entry to `_M.TOOL_REGISTRY` in `tools.lua` (name, description,
   inputSchema, annotations).
2. Implement `_M.<tool_name>(params)` returning `{tool=..., result=...,
   isError=...}`.
3. Add to the `tool_handlers` dispatch table inside `_M.execute`.
4. If it writes, add to the `write_tools` allowlist in the same function.
5. Reload openresty (`openresty -s reload`).
6. Verify with `curl -H "X-MCP-API-Key: $KEY" http://localhost:18280/mcp/tools`.

Tests live in [`tests/`](./tests/) — follow the existing pattern when adding
coverage for new tools.
