#!/usr/bin/env bash
# Compatibility wrapper — prefer scripts/k3s1-bootstrap-control-plane.sh
# (Vault-backed settings + Zalando + migrations).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
exec "${ROOT}/scripts/k3s1-bootstrap-control-plane.sh" "$@"
