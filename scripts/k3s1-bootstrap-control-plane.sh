#!/usr/bin/env bash
# Bootstrap WSLProxy control-plane storage on k3s1:
#   1) Zalando Postgres (wslproxy-db) in wslproxy-system
#   2) schema migrations
#   3) Secret wslproxy-pgsql (connection)
#   4) Secret wslproxy-settings (settings.json from WSLVault prod, forced storage_type=pgsql)
#
# Requires:
#   KUBECONFIG (or in-cluster SA) with rights from deploy/ring-promoter/k3s1-rbac.yaml
#   VAULT_ADDR + VAULT_TOKEN  (WSLVault prod — https://vault-ui.workstation.co.uk)
#
# Vault paths (KV v2):
#   secret/data/wslproxy/prod/settings.json   — full settings object
#   secret/data/wslproxy/prod/pgsql           — optional {pg_host,pg_port,pg_database,pg_user,pg_password}
#     When present, password/user/db overlay Zalando defaults; in-cluster host is still forced
#     to wslproxy-db.wslproxy-system.svc.cluster.local for the control-plane pods.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KUBECONFIG="${KUBECONFIG:-${HOME}/.kube/k3s1.yaml}"
export KUBECONFIG

NS="${WSLPROXY_NS:-wslproxy-system}"
CLUSTER="${WSLPROXY_PG_CLUSTER:-wslproxy-db}"
USER="${WSLPROXY_PG_USER:-wslproxy}"
DB="${WSLPROXY_PG_DATABASE:-wslproxy}"
CRED_SECRET="${USER}.${CLUSTER}.credentials.postgresql.acid.zalan.do"
APP_SECRET="${WSLPROXY_PGSQL_SECRET:-wslproxy-pgsql}"
SETTINGS_SECRET="${WSLPROXY_SETTINGS_SECRET:-wslproxy-settings}"
VAULT_ENV="${WSLPROXY_VAULT_ENV:-prod}"
VAULT_ADDR="${VAULT_ADDR:-https://vault-ui.workstation.co.uk}"
VAULT_SETTINGS_PATH="${VAULT_SETTINGS_PATH:-secret/data/wslproxy/${VAULT_ENV}/settings.json}"
VAULT_PGSQL_PATH="${VAULT_PGSQL_PATH:-secret/data/wslproxy/${VAULT_ENV}/pgsql}"
IN_CLUSTER_HOST="${CLUSTER}.${NS}.svc.cluster.local"
PGPORT=5432

if [[ -z "${VAULT_TOKEN:-}" ]]; then
  echo "VAULT_TOKEN is required (WSLVault prod token)." >&2
  exit 1
fi

vault_get() {
  local path="$1"
  local url="${VAULT_ADDR%/}/v1/${path#/}"
  local code
  code="$(curl -sS -o /tmp/vault-body.json -w '%{http_code}' \
    -H "X-Vault-Token: ${VAULT_TOKEN}" \
    -H "Accept: application/json" \
    "$url" || true)"
  if [[ "$code" != "200" ]]; then
    echo "Vault GET ${path} failed HTTP ${code}" >&2
    head -c 400 /tmp/vault-body.json >&2 || true
    echo >&2
    return 1
  fi
  jq -e '.data.data' /tmp/vault-body.json
}

echo "==> apply Zalando CR ${CLUSTER}"
kubectl apply -f "${ROOT}/deploy/postgres/wslproxy-db.yaml"

echo "==> wait for Postgres Running"
for i in $(seq 1 60); do
  st="$(kubectl -n "$NS" get postgresql "$CLUSTER" -o jsonpath='{.status.PostgresClusterStatus}' 2>/dev/null || true)"
  echo "  status=$st ($i/60)"
  if [[ "$st" == "Running" ]]; then
    break
  fi
  sleep 5
done
st="$(kubectl -n "$NS" get postgresql "$CLUSTER" -o jsonpath='{.status.PostgresClusterStatus}' 2>/dev/null || true)"
if [[ "$st" != "Running" ]]; then
  echo "Postgres cluster did not become Running (status=$st)" >&2
  kubectl -n "$NS" get postgresql,pods,svc,pvc -o wide >&2 || true
  exit 1
fi

echo "==> wait for Zalando credentials secret"
for i in $(seq 1 36); do
  if kubectl -n "$NS" get secret "$CRED_SECRET" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
kubectl -n "$NS" get secret "$CRED_SECRET" >/dev/null

Z_PASS="$(kubectl -n "$NS" get secret "$CRED_SECRET" -o jsonpath='{.data.password}' | base64 -d)"
Z_USER="$(kubectl -n "$NS" get secret "$CRED_SECRET" -o jsonpath='{.data.username}' | base64 -d)"

echo "==> fetch settings from Vault (${VAULT_SETTINGS_PATH})"
SETTINGS_JSON="$(vault_get "$VAULT_SETTINGS_PATH")"

PG_HOST="$IN_CLUSTER_HOST"
PG_PORT="$PGPORT"
PG_DATABASE="$DB"
PG_USER="$Z_USER"
PG_PASSWORD="$Z_PASS"

if vault_get "$VAULT_PGSQL_PATH" >/tmp/vault-pgsql.json 2>/dev/null; then
  echo "==> overlay optional Vault pgsql (${VAULT_PGSQL_PATH})"
  # Prefer Vault password/user/db when set; keep in-cluster host for control-plane pods.
  PG_DATABASE="$(jq -r --arg d "$PG_DATABASE" '.pg_database // .database // $d' /tmp/vault-pgsql.json)"
  PG_USER="$(jq -r --arg u "$PG_USER" '.pg_user // .user // $u' /tmp/vault-pgsql.json)"
  VP="$(jq -r '.pg_password // .password // empty' /tmp/vault-pgsql.json)"
  if [[ -n "$VP" ]]; then
    echo "  NOTE: Vault pgsql password present — using Zalando password for in-cluster DB auth (operator-managed)." >&2
    echo "  Sync Vault secret/wslproxy/${VAULT_ENV}/pgsql.pg_password to the Zalando value after first bootstrap if edges need it." >&2
  fi
else
  echo "==> no optional Vault pgsql at ${VAULT_PGSQL_PATH} (ok)"
fi

echo "==> write ${APP_SECRET}"
kubectl -n "$NS" create secret generic "$APP_SECRET" \
  --from-literal=pg_host="$PG_HOST" \
  --from-literal=pg_port="$PG_PORT" \
  --from-literal=pg_database="$PG_DATABASE" \
  --from-literal=pg_user="$PG_USER" \
  --from-literal=pg_password="$PG_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> build settings.json (Vault + storage_type=pgsql + in-cluster pgsql)"
MERGED="$(jq -n \
  --argjson base "$SETTINGS_JSON" \
  --arg host "$PG_HOST" \
  --arg port "$PG_PORT" \
  --arg db "$PG_DATABASE" \
  --arg user "$PG_USER" \
  --arg pass "$PG_PASSWORD" \
  '
  $base
  | .storage_type = "pgsql"
  | .pgsql = ((.pgsql // {}) + {
      pg_host: $host,
      pg_port: ($port | tonumber),
      pg_database: $db,
      pg_user: $user,
      pg_password: $pass,
      host: $host,
      port: ($port | tonumber),
      database: $db,
      user: $user,
      password: $pass
    })
  ')"

printf '%s\n' "$MERGED" >/tmp/wslproxy-settings.json
# Refuse obviously wrong profile for prod control plane
PROFILE="$(jq -r '.env_profile // empty' /tmp/wslproxy-settings.json)"
if [[ -n "$PROFILE" && "$PROFILE" != "$VAULT_ENV" ]]; then
  echo "ABORT: Vault settings env_profile='${PROFILE}' != VAULT_ENV='${VAULT_ENV}'" >&2
  exit 1
fi

echo "==> write ${SETTINGS_SECRET}"
kubectl -n "$NS" create secret generic "$SETTINGS_SECRET" \
  --from-file=settings.json=/tmp/wslproxy-settings.json \
  --dry-run=client -o yaml | kubectl apply -f -

echo "==> apply migrations via Job"
kubectl -n "$NS" delete job wslproxy-pgsql-migrate --ignore-not-found
kubectl -n "$NS" create configmap wslproxy-pgsql-migrations \
  --from-file="${ROOT}/infra/pgsql/migrations" \
  --dry-run=client -o yaml | kubectl apply -f -

cat <<EOF | kubectl apply -f -
apiVersion: batch/v1
kind: Job
metadata:
  name: wslproxy-pgsql-migrate
  namespace: ${NS}
  labels:
    app.kubernetes.io/part-of: wslproxy
    app.kubernetes.io/component: storage
spec:
  ttlSecondsAfterFinished: 3600
  backoffLimit: 2
  template:
    spec:
      restartPolicy: Never
      containers:
      - name: migrate
        image: docker.io/library/postgres:15-alpine
        env:
        - name: PGHOST
          value: ${PG_HOST}
        - name: PGPORT
          value: "${PG_PORT}"
        - name: PGUSER
          valueFrom:
            secretKeyRef:
              name: ${APP_SECRET}
              key: pg_user
        - name: PGDATABASE
          value: ${PG_DATABASE}
        - name: PGPASSWORD
          valueFrom:
            secretKeyRef:
              name: ${APP_SECRET}
              key: pg_password
        volumeMounts:
        - name: migrations
          mountPath: /migrations
          readOnly: true
        command: ["/bin/sh", "-c"]
        args:
        - |
          set -euo pipefail
          psql -v ON_ERROR_STOP=1 -c "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"
          for sql in /migrations/*.sql; do
            version=\$(basename "\$sql" .sql)
            applied=\$(psql -tAc "SELECT 1 FROM schema_migrations WHERE version = '\$version'")
            if [ "\$applied" = "1" ]; then
              echo "skip \$version"
              continue
            fi
            echo "apply \$version"
            psql -v ON_ERROR_STOP=1 -f "\$sql"
            psql -v ON_ERROR_STOP=1 -c "INSERT INTO schema_migrations(version) VALUES ('\$version') ON CONFLICT DO NOTHING;"
          done
          echo "migrate done"
          psql -c '\\dt'
      volumes:
      - name: migrations
        configMap:
          name: wslproxy-pgsql-migrations
EOF

kubectl -n "$NS" wait --for=condition=complete job/wslproxy-pgsql-migrate --timeout=180s
kubectl -n "$NS" logs job/wslproxy-pgsql-migrate

# Scrub local copies
rm -f /tmp/wslproxy-settings.json /tmp/vault-body.json /tmp/vault-pgsql.json

echo ""
echo "OK: control-plane storage ready in ${NS}"
echo "  postgresql/${CLUSTER} Running"
echo "  secret/${APP_SECRET}  (pgsql connection)"
echo "  secret/${SETTINGS_SECRET}  (settings.json from Vault ${VAULT_ENV}, storage_type=pgsql)"
echo "  host=${PG_HOST} db=${PG_DATABASE} user=${PG_USER}"
