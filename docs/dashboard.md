# WSLProxy Operations Dashboard

## Overview

Golang-based operations dashboard for WSLProxy using MCP as the primary backend integration layer. Designed for Ops/SRE/Platform engineers who need governed, auditable control over the WSLProxy gateway without direct access to internal APIs.

## Architecture

```
┌─────────────────────────────────────────────────┐
│                 Browser (Ops User)               │
│         HTML Templates + Minimal JS              │
└─────────────────┬───────────────────────────────┘
                  │ HTTP
┌─────────────────▼───────────────────────────────┐
│            Go Dashboard Server (:8090)           │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │   Auth   │ │   RBAC   │ │  Workflow Engine  │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌──────────┐ ┌──────────┐ ┌──────────────────┐ │
│  │  k3s Mgr │ │ Observer │ │   UI Handlers    │ │
│  └──────────┘ └──────────┘ └──────────────────┘ │
│  ┌────────────────────────────────────────────┐  │
│  │            MCP Client Library              │  │
│  └──────────────┬─────────────────────────────┘  │
└─────────────────┼───────────────────────────────┘
                  │ HTTP (MCP Protocol)
┌─────────────────▼───────────────────────────────┐
│         WSLProxy MCP Server (:8080)              │
│    /mcp/manifest, /mcp/resources, /mcp/tools     │
└─────────────────┬───────────────────────────────┘
                  │
┌─────────────────▼───────────────────────────────┐
│         WSLProxy (OpenResty Gateway)             │
└─────────────────────────────────────────────────┘
```

## MCP Interaction Model

The dashboard communicates with WSLProxy exclusively through the MCP protocol. It never bypasses MCP to call internal APIs directly.

### Read Operations

Read operations use MCP resources via `GET /mcp/resources/{type}`. The following resource types are mapped:

- `servers` — Virtual server configurations
- `rules` — Routing rules
- `upstreams` — Backend upstream definitions
- `profiles` — Configuration profiles
- `ssl` — SSL/TLS certificates and settings
- `cache` — Cache configuration and statistics
- `health` — Health check status
- `metrics` — Runtime metrics and counters
- `settings` — Global settings

### Write Operations

Write operations use MCP tools via `POST /mcp/tools/{name}`. All mutations follow an approval workflow:

1. **Dry-run** — The change is validated without applying
2. **Human approval** — An admin reviews and approves (or rejects with reason)
3. **Apply** — The approved change is applied via MCP

Available tools:

- `validate_config` — Validate a configuration change without applying
- `get_error_logs` — Retrieve recent error logs
- `reload_config` — Trigger an OpenResty configuration reload

### Design Constraint

The dashboard NEVER bypasses MCP to call internal APIs directly. All proxy interaction is mediated through the MCP protocol, ensuring a single auditable control plane.

## Getting Started

### Prerequisites

- Go 1.22+
- WSLProxy instance with MCP enabled

### Quick Start

```bash
cd dashboard
go build -o bin/dashboard ./cmd/dashboard/
./bin/dashboard \
  -addr :8090 \
  -mcp-url http://localhost:8080 \
  -mcp-key your-mcp-api-key \
  -admin-pass your-admin-password
```

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| MCP_API_KEY | MCP API key for auth | (none) |
| ADMIN_PASSWORD | Initial admin password | admin |

### CLI Flags

| Flag | Description | Default |
|------|-------------|---------|
| -addr | Listen address | :8090 |
| -mcp-url | WSLProxy MCP base URL | http://localhost:8080 |
| -mcp-key | MCP API key | (env) |
| -admin-pass | Admin password | (env) |
| -read-only | Start in read-only mode | false |

### Default Users

| Username | Password | Role |
|----------|----------|------|
| admin | (set via flag/env) | Admin |
| operator | operator | Operator |
| viewer | viewer | Viewer |

## Security Design

### Authentication

- Session-based auth with secure random tokens
- 24-hour session expiry
- Cookie-based session management
- Pluggable: local users initially, SSO hooks planned

### RBAC

| Role | Permissions |
|------|------------|
| Viewer | View config, metrics, logs |
| Operator | + Edit config, add routes, create change requests |
| Admin | + Approve/reject changes, manage users, manage ingress |

### Safety Controls

- Read-only mode toggle
- All write operations require approval workflow
- Dry-run before apply
- Full audit trail (who, what, when, why)
- No silent changes, no auto-apply
- No secret exposure (MCP redacts sensitive fields)
- No direct OpenResty reloads outside MCP

## Ops Workflows

### Adding a Route

1. Navigate to Routes page
2. Fill in route details (host, path, backend, port)
3. Submit creates a Change Request
4. Admin reviews and approves (or rejects with reason)
5. Approved change is applied via MCP tool
6. Metrics page shows impact

### Configuration Management

1. Browse config via Config page (reads MCP resources)
2. View detailed config for each resource type
3. All changes follow the approval workflow

### Ingress Management

1. View k3s cluster status
2. View ingress rules
3. Install/configure ingress via approval workflow

## Directory Structure

```
dashboard/
├── cmd/dashboard/          # Main entry point
│   └── main.go
├── internal/
│   ├── mcp/               # MCP client library
│   │   ├── client.go
│   │   ├── types.go
│   │   ├── client_test.go
│   │   └── integration_test.go
│   ├── auth/              # Authentication
│   │   ├── auth.go
│   │   ├── middleware.go
│   │   └── auth_test.go
│   ├── rbac/              # Role-based access control
│   │   ├── rbac.go
│   │   └── rbac_test.go
│   ├── workflows/         # Approval workflow engine
│   │   ├── workflows.go
│   │   └── workflows_test.go
│   ├── k3s/               # k3s cluster integration
│   │   ├── k3s.go
│   │   └── k3s_test.go
│   ├── observability/     # Metrics, health, logs
│   │   ├── observability.go
│   │   └── observability_test.go
│   └── ui/                # HTTP handlers
│       ├── handlers.go
│       └── e2e_test.go
├── web/
│   ├── templates/         # HTML templates (12 files)
│   └── static/            # Static assets
├── go.mod
└── go.sum
```

## Testing

```bash
# Run all tests
cd dashboard && go test ./... -v

# Run only MCP client tests
go test ./internal/mcp/... -v

# Run integration tests
go test ./internal/mcp/... -run Integration -v

# Run end-to-end tests
go test ./internal/ui/... -run E2E -v
```

## Disaster Recovery

### Dashboard Failure

- Dashboard is stateless; restart recovers all state
- In-memory sessions/change requests are lost on restart (design for statelessness)
- WSLProxy continues to operate independently of dashboard

### MCP Server Unreachable

- Dashboard gracefully degrades showing error messages
- No destructive operations possible when MCP is down
- Health endpoint returns degraded status

### Configuration Rollback

- All changes are tracked in audit log
- Rollback by creating a new change request with previous config
- k3s ingress supports rollback via approval workflow

## Design Principles

> **MCP is the contract.** The dashboard is a governed human interface. WSLProxy is the execution engine.

- All proxy interaction goes through MCP
- Human-in-the-loop for all mutations
- Safety by default (read-only mode, approval workflows)
- Designed for enterprise Ops teams under pressure
