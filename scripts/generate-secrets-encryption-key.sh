#!/usr/bin/env bash
# Generate a fresh SECRETS_ENCRYPTION_KEY for encrypting rule/server secrets
# at rest.  Prints a base64 value ready to paste into
# data/settings.json under env_vars.
#
# Keep the printed value in THREE places:
#   1. data/settings.json env_vars (so OpenResty can read it)
#   2. Your password manager (1Password / Bitwarden / similar)
#   3. An offline copy (printed, in a drawer)
#
# LOSE THE KEY  →  LOSE EVERY ENCRYPTED SECRET.  There is no recovery.
#
# Rotate by generating a new key, re-encrypting all secrets, then invalidating
# the old key.  A rotation script is not built yet — cross that bridge when
# you get to it.

set -euo pipefail

if ! command -v openssl >/dev/null 2>&1; then
  echo "error: openssl not found" >&2
  exit 1
fi

# 32 raw bytes = 256-bit AES key.  base64-encoded for JSON-safe transport.
openssl rand -base64 32
