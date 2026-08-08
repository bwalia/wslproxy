#!/usr/bin/env bash
# Export a rule, tweak priority with jq, dry-run push, apply, then check nginx.
set -euo pipefail

BASE="${WSLPROXY_BASE_URL:-https://lon1.pop0.uk}"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT

CLI="${WSLPROXY_CLI:-wslproxy-cli}"

echo "==> pull rules from ${BASE}"
"${CLI}" pull -d "$DIR" --base-url "$BASE" --resources rules ${FILTER:+--filter "$FILTER"}

mapfile -t FILES < <(find "$DIR/rules" -name '*.json' -type f | head -n 1)
if [[ ${#FILES[@]} -eq 0 || ! -f "${FILES[0]}" ]]; then
  echo "No rules pulled (set FILTER=name=... or login first)" >&2
  exit 1
fi
FILE="${FILES[0]}"
echo "==> editing ${FILE}"
TMP="${DIR}/tmp.json"
jq '.priority = (.priority // 100)' "$FILE" > "$TMP"
mv "$TMP" "$FILE"

echo "==> dry-run push"
"${CLI}" push -d "$DIR" --base-url "$BASE" --resources rules --dry-run --diff -o json

echo "==> push"
"${CLI}" push -d "$DIR" --base-url "$BASE" --resources rules --yes

echo "==> check nginx"
"${CLI}" check nginx --base-url "$BASE"
