#!/usr/bin/env bash
# One-time bootstrap for the wslproxy Ring Promoter instance on k3s1.
#
# Creates what CI deliberately never creates:
#   * database + role ringpromoter_wsl on the shared ring-system/ring-promoter-db
#     (same pattern as ringpromoter_ws / ringpromoter_training)
#   * Secret wslproxy-ring-promoter/ring-promoter (RP_API_TOKEN, RP_DB_DSN)
#   * GitHub secrets RP_URL + RP_TOKEN on bwalia/wslproxy, so
#     deploy-control-plane-k3s1.yml seeds this instance
#
# Idempotent: an existing Secret is left alone (re-running never rotates the
# token or the DB password). Pass --rotate to mint new values.
#
# Usage:
#   KUBECONFIG=~/.kube/k3s1.yaml scripts/ring-promoter-bootstrap.sh [--rotate] [--no-gh]
set -euo pipefail

NS=wslproxy-ring-promoter
DB_NS=ring-system
DB_POD=ring-promoter-db-0
DB_NAME=ringpromoter_wsl
DB_USER=ringpromoter_wsl
RP_URL=https://rp.wslproxy.com
REPO=bwalia/wslproxy
ROTATE=0
SET_GH=1

for arg in "$@"; do
  case "$arg" in
    --rotate) ROTATE=1 ;;
    --no-gh)  SET_GH=0 ;;
    *) echo "unknown argument: $arg" >&2; exit 2 ;;
  esac
done

here="$(cd "$(dirname "$0")/.." && pwd)"
kubectl apply -f "$here/deploy/ring-promoter/namespace.yaml"

if kubectl -n "$NS" get secret ring-promoter >/dev/null 2>&1 && [ "$ROTATE" = 0 ]; then
  echo "secret $NS/ring-promoter already exists — leaving it (use --rotate to replace)"
  exit 0
fi

rand() { openssl rand -hex "$1"; }
DB_PASS="$(rand 24)"
API_TOKEN="$(rand 32)"

echo "==> role + database $DB_NAME on $DB_NS/$DB_POD"
# Password goes in on stdin, never on the command line (visible in ps).
kubectl -n "$DB_NS" exec -i "$DB_POD" -c postgres -- \
  psql -U postgres -v ON_ERROR_STOP=1 -v user="$DB_USER" -v pass="$DB_PASS" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN', :'user')
  WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = :'user') \gexec
ALTER ROLE :"user" WITH LOGIN PASSWORD :'pass';
SQL
if ! kubectl -n "$DB_NS" exec "$DB_POD" -c postgres -- \
     psql -U postgres -Atc "SELECT 1 FROM pg_database WHERE datname='$DB_NAME'" | grep -q 1; then
  kubectl -n "$DB_NS" exec "$DB_POD" -c postgres -- \
    psql -U postgres -v ON_ERROR_STOP=1 -c "CREATE DATABASE $DB_NAME OWNER $DB_USER"
fi

DSN="postgres://${DB_USER}:${DB_PASS}@ring-promoter-db.${DB_NS}.svc.cluster.local:5432/${DB_NAME}?sslmode=require"

echo "==> secret $NS/ring-promoter"
kubectl -n "$NS" create secret generic ring-promoter \
  --from-literal=RP_API_TOKEN="$API_TOKEN" \
  --from-literal=RP_DB_DSN="$DSN" \
  --dry-run=client -o yaml | kubectl apply -f -

if [ "$SET_GH" = 1 ]; then
  echo "==> GitHub secrets RP_URL, RP_TOKEN on $REPO"
  gh secret set RP_URL --repo "$REPO" --body "$RP_URL"
  printf '%s' "$API_TOKEN" | gh secret set RP_TOKEN --repo "$REPO"
fi

if kubectl -n "$NS" get deploy ring-promoter >/dev/null 2>&1; then
  kubectl -n "$NS" rollout restart deploy/ring-promoter
fi
echo "done. Deploy the instance: gh workflow run deploy-ring-promoter.yml --repo $REPO"
