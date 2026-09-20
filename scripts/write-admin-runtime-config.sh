#!/usr/bin/env bash
# Write admin SPA runtime-config.js from env or settings.json.
# Priority: WSLPROXY_API_URL > settings.admin.api_url > empty (SPA defaults to /api).
set -euo pipefail

OUT="${WSLPROXY_ADMIN_RUNTIME_CONFIG:-/usr/local/openresty/nginx/html/openresty-admin/dist/runtime-config.js}"
CONFIG_DIR="${NGINX_CONFIG_DIR:-/opt/nginx/}"
case "$CONFIG_DIR" in
  */) ;;
  *) CONFIG_DIR="${CONFIG_DIR}/" ;;
esac
SETTINGS="${CONFIG_DIR}data/settings.json"

API_URL="${WSLPROXY_API_URL:-}"

if [[ -z "$API_URL" && -f "$SETTINGS" ]] && command -v jq >/dev/null 2>&1; then
  API_URL="$(jq -r '.admin.api_url // empty' "$SETTINGS" 2>/dev/null || true)"
fi

# Normalize: strip trailing slash; allow empty
API_URL="$(printf '%s' "$API_URL" | sed 's:/*$::')"

mkdir -p "$(dirname "$OUT")"
ESC="$(printf '%s' "$API_URL" | sed 's/\\/\\\\/g; s/"/\\"/g')"

if [[ -n "$API_URL" ]]; then
  cat > "$OUT" <<EOF
window.__WSLPROXY_CONFIG__ = { apiUrl: "${ESC}" };
EOF
else
  cat > "$OUT" <<'EOF'
window.__WSLPROXY_CONFIG__ = {};
EOF
fi

echo "write-admin-runtime-config: wrote $OUT (apiUrl=${API_URL:-<default /api>})"
