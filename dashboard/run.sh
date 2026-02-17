#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# Build
CGO_ENABLED=0 go build -o bin/dashboard ./cmd/dashboard/

# Run with defaults (override via env vars or args)
ADDR="${ADDR:-:8090}"
MCP_URL="${MCP_URL:-http://localhost:8080}"
MCP_API_KEY="${MCP_API_KEY:-}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-password}"

exec ./bin/dashboard \
  -addr "$ADDR" \
  -mcp-url "$MCP_URL" \
  -mcp-key "$MCP_API_KEY" \
  -admin-pass "$ADMIN_PASSWORD" \
  "$@"
