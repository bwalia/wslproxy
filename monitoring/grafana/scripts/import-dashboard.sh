#!/usr/bin/env bash
# Import the WSLProxy SRE dashboard into Grafana via the HTTP API.
#
# Usage:
#   GRAFANA_URL=https://int-grafana.diytaxreturn.co.uk \
#   GRAFANA_API_TOKEN=glsa_xxx \
#   ./import-dashboard.sh
#
# The token needs the Editor role (dashboards:write) on the target folder.
# Create one under Administration -> Service accounts.
set -euo pipefail

GRAFANA_URL="${GRAFANA_URL:-https://int-grafana.diytaxreturn.co.uk}"
FOLDER_UID="${FOLDER_UID:-afmpjjn28j4zkc}"
DASHBOARD_JSON="$(dirname "$0")/../dashboards/wslproxy-sre-dashboard.json"

if [[ -z "${GRAFANA_API_TOKEN:-}" ]]; then
  echo "ERROR: set GRAFANA_API_TOKEN (service account token with Editor role)" >&2
  exit 1
fi
if [[ ! -f "$DASHBOARD_JSON" ]]; then
  echo "ERROR: $DASHBOARD_JSON not found — run generate_dashboard.py first" >&2
  exit 1
fi

# Verify the folder exists and we can see it.
folder_title=$(curl -sf -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
  "$GRAFANA_URL/api/folders/$FOLDER_UID" | jq -r '.title // empty') || {
  echo "ERROR: cannot read folder $FOLDER_UID — check token/permissions" >&2
  exit 1
}
echo "Importing into folder: ${folder_title:-$FOLDER_UID}"

payload=$(jq -n --slurpfile dash "$DASHBOARD_JSON" --arg folder "$FOLDER_UID" '
  { dashboard: ($dash[0] + {id: null}),
    folderUid: $folder,
    overwrite: true,
    message: "Provisioned by monitoring/grafana/scripts/import-dashboard.sh" }')

resp=$(curl -sf -X POST \
  -H "Authorization: Bearer $GRAFANA_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$payload" \
  "$GRAFANA_URL/api/dashboards/db")

echo "$resp" | jq .
url=$(echo "$resp" | jq -r .url)
echo
echo "Dashboard: $GRAFANA_URL$url"
