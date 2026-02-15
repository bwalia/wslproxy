# MCP Write-Enabled Roadmap for WSLProxy

## Overview

This document outlines the phased approach to enabling **write operations** through the WSLProxy MCP server. The current implementation is **read-only by design**. Write capabilities will be introduced incrementally with strong guardrails to ensure safety, auditability, and compliance.

---

## Phased Enablement

### Phase 1: Read-Only (Current — v1.0)

**Status:** Implemented

**Scope:**
- All configuration resources are read-only
- Automatic secret redaction in all responses
- API key authentication
- No mutation of any gateway state
- Tools limited to read-only operations (config validation, log viewing)

**Guardrails:**
- `mcp.mode = "read-only"` (default)
- Tools gated by `mcp.tools_enabled` flag
- No write-capable tool can execute when `mode = "read-only"`

---

### Phase 2: Dry-Run Tools (v1.1)

**Target:** Next release

**Scope:**
- Introduce dry-run versions of write operations
- Every mutation tool returns a **preview** of what would change, without applying it
- New tools:
  - `preview_server_config` — Show generated NGINX config for a server
  - `diff_config` — Show diff between current and proposed configuration
  - `validate_rule` — Validate a security rule without creating it

**New Features:**
- Change preview / diff format for AI agent consumption
- Structured diff output (not raw text diffs)

**Guardrails:**
- All dry-run tools marked with `readOnlyHint: true`
- No side effects on any dry-run call
- Results include `"applied": false` flag
- Rate-limited to prevent resource exhaustion

**Example dry-run response:**
```json
{
  "tool": "preview_server_config",
  "result": {
    "applied": false,
    "preview_type": "diff",
    "current": "server { listen 80; server_name old.example.com; ... }",
    "proposed": "server { listen 80; server_name new.example.com; ... }",
    "changes": [
      {"field": "server_name", "from": "old.example.com", "to": "new.example.com"}
    ],
    "validation": {"valid": true, "warnings": []}
  }
}
```

---

### Phase 3: Human-Approved Writes (v1.2)

**Target:** Q3 2026

**Scope:**
- AI agent can **propose** changes via MCP
- Changes are queued in a **pending changes** store
- A human operator must **approve** via the admin UI or CLI
- Only approved changes are applied

**New Endpoints:**
- `POST /mcp/tools/propose_change` — Submit a change proposal
- `GET /mcp/resources/pending_changes` — List pending proposals
- `POST /mcp/tools/approve_change` — Approve (human-only, not AI-callable)
- `POST /mcp/tools/reject_change` — Reject a proposal

**Workflow:**
```
AI Agent                    WSLProxy MCP                    Human Admin
    |                            |                               |
    |-- propose_change --------->|                               |
    |                            |-- store in pending queue ---->|
    |                            |                               |
    |                            |<----- review & approve -------|
    |                            |                               |
    |                            |-- apply change ------------->|
    |<-- change_applied ---------|                               |
```

**Guardrails:**
- Proposals have a TTL (expire after 24h if not approved)
- Each proposal includes: who proposed it, what changes, why, and a diff
- Approval requires a separate, higher-privilege token
- AI agents **cannot** approve their own proposals
- Maximum 10 pending proposals at a time

---

### Phase 4: Policy-Controlled Autonomous Writes (v2.0)

**Target:** Q1 2027

**Scope:**
- AI agents can execute **pre-approved** change patterns autonomously
- Changes must match a **policy definition** that specifies:
  - Which resources can be modified
  - Which fields can change
  - Value constraints (e.g., TTL must be between 60-86400)
  - Time windows for changes
  - Maximum change frequency

**Policy Example:**
```json
{
  "policy_name": "cache_tuning",
  "allowed_resources": ["cache"],
  "allowed_operations": ["update"],
  "field_constraints": {
    "cache_ttl": {"min": 60, "max": 86400},
    "cache_enabled": {"allowed_values": [true, false]}
  },
  "time_window": {"start": "02:00", "end": "06:00", "timezone": "UTC"},
  "max_changes_per_hour": 5,
  "require_dry_run": true,
  "auto_rollback_on_error": true
}
```

**New Features:**
- Policy engine for change authorization
- Automatic rollback on health check failure after change
- Change batching (group related changes into atomic operations)
- Post-change health verification

**Guardrails:**
- Policies are defined by human operators, not AI agents
- Every autonomous change is logged with full audit trail
- Automatic rollback if health check fails within 5 minutes of change
- Kill switch to immediately disable all autonomous writes
- Maximum scope per policy (e.g., only cache configs, not routing)
- Notification on every autonomous change (Slack, email, webhook)

---

## Guardrail Details

### RBAC + Scoped Tokens

| Token Scope | Permissions |
|------------|-------------|
| `mcp:read` | Read all resources, list tools |
| `mcp:tools:readonly` | Execute read-only tools (validate, logs) |
| `mcp:tools:dryrun` | Execute dry-run tools (Phase 2) |
| `mcp:propose` | Submit change proposals (Phase 3) |
| `mcp:approve` | Approve/reject proposals (human-only) |
| `mcp:write:policy` | Execute policy-controlled writes (Phase 4) |
| `mcp:admin` | Full access including policy management |

Token scopes are cumulative. An agent with `mcp:propose` also has `mcp:read` and `mcp:tools:readonly`.

### Mandatory Dry-Run

For all write operations (Phase 2+):
1. Every write tool **must** accept a `dry_run` parameter
2. First call **must** be `dry_run: true`
3. The dry-run result includes a `change_id` that must be referenced in the actual write
4. This prevents "phantom writes" — you can't write without seeing the preview first

### Change Diff Previews

Every proposed change includes:
- **Structured diff**: Field-level before/after comparison
- **NGINX config diff**: Generated config diff (if applicable)
- **Impact assessment**: Which servers/rules are affected
- **Risk level**: low/medium/high based on change scope

### Approval Workflows

Phase 3+ approval chain:
1. AI agent proposes change with justification
2. Change is queued with unique `proposal_id`
3. Notification sent to admin channel
4. Admin reviews diff and impact
5. Admin approves or rejects (with reason)
6. If approved, change is applied atomically
7. Post-change health check runs automatically
8. Result is recorded in audit log

### Audit Logs

Every MCP operation is logged:
```json
{
  "timestamp": "2026-02-15T12:00:00Z",
  "event_type": "mcp.tool.execute",
  "agent_id": "claude-desktop-user-123",
  "tool": "reload_config",
  "params": {"dry_run": false},
  "result": "success",
  "ip_address": "10.0.1.50",
  "token_scope": "mcp:tools:dryrun",
  "change_id": "chg-abc-123"
}
```

### Rate Limits

| Operation Type | Default Limit |
|---------------|---------------|
| Resource reads | 100/minute |
| Read-only tools | 30/minute |
| Dry-run tools | 10/minute |
| Change proposals | 5/minute |
| Autonomous writes | Policy-defined |

### Kill Switch

Emergency disable of all MCP write operations:

```bash
# Immediate disable via environment variable
export MCP_MODE=read-only

# Or via API
curl -X POST -H "Authorization: Bearer $ADMIN_TOKEN" \
  https://wslproxy:8080/api/settings \
  -d '{"mcp": {"mode": "read-only", "tools_enabled": false}}'
```

The kill switch:
- Takes effect within 1 second (next request)
- Does not require NGINX reload
- Preserves all configuration
- Is logged in audit trail

---

## What AI Agents Must NEVER Do

The following operations are **permanently prohibited** through MCP, regardless of mode or policy:

1. **Delete production server configurations** — Server deletion requires admin UI
2. **Modify authentication credentials** — API keys, JWT secrets, passwords are never writable via MCP
3. **Disable security rules globally** — Individual rule changes only, no bulk disable
4. **Access or modify SSL private keys** — Private key material is never exposed or writable
5. **Modify MCP's own configuration** — MCP cannot grant itself more permissions
6. **Execute arbitrary shell commands** — Only pre-defined, audited tools
7. **Access other tenants' data** — Multi-tenant isolation is enforced at the data layer
8. **Bypass rate limits** — Even with highest-privilege token
9. **Disable audit logging** — Audit trail is immutable
10. **Modify NGINX core configuration** — Only server blocks and routing rules, not worker processes or core directives

---

## Migration Path

For organizations moving from Phase 1 to later phases:

1. **Phase 1 → 2**: No breaking changes. Add `mcp.dry_run_tools_enabled: true` to settings.json
2. **Phase 2 → 3**: Deploy pending changes store (Redis-backed). Update API keys with `mcp:propose` scope
3. **Phase 3 → 4**: Define policies in `data/mcp-policies/`. Requires audit log infrastructure

Each phase is **backward-compatible** — read-only agents continue to work unchanged.

---

## Timeline

| Phase | Version | Target | Key Deliverable |
|-------|---------|--------|-----------------|
| 1 | v1.0 | Current | Read-only MCP, typed schemas, resource mappers |
| 2 | v1.1 | Q2 2026 | Dry-run tools, change previews |
| 3 | v1.2 | Q3 2026 | Human-approved writes, proposal queue |
| 4 | v2.0 | Q1 2027 | Policy-controlled autonomous writes |
