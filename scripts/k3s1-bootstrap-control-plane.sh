#!/usr/bin/env bash
# Bootstrap WSLProxy control-plane storage on k3s1, then materialize the
# Kubernetes Secrets that the helm chart mounts:
#
#   openresty.settings.existingSecret = wslproxy-settings  (key: settings.json)
#   openresty.pgsql.existingSecret     = wslproxy-pgsql
#     keys: pg_host, pg_port, pg_database, pg_user, pg_password
#
# Secret source order (same idea as CI secrets_mode=vault_or_sops):
#   1) Vault  — https://vault.workstation.co.uk  (WSLVault API)
#   2) SOPS   — infra/secrets/<env>/settings.sops.json  (requires sops + SOPS_AGE_KEY)
#   3) fail
#
# Steps:
#   1) Zalando Postgres (wslproxy-db) in wslproxy-system
#   2) Resolve settings (+ optional pgsql overlay) via Vault → SOPS
#   3) Apply Secrets wslproxy-pgsql + wslproxy-settings for helm
#   4) Run schema migrations
#
# Requires:
#   KUBECONFIG (or in-cluster SA) with rights from deploy/ring-promoter/k3s1-rbac.yaml
#   VAULT_ADDR + VAULT_TOKEN  preferred; if Vault miss/unavailable, SOPS_AGE_KEY
#   Note: vault-ui.workstation.co.uk is the SPA only; /v1/* is on vault.workstation.co.uk.
#
# Vault paths (WSLVault stores JSON as a base64 string in `data`):
#   secret/data/wslproxy/<env>/settings.json
#   secret/data/wslproxy/<env>/pgsql           — optional overlay
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
VAULT_ADDR="${VAULT_ADDR:-https://vault.workstation.co.uk}"
VAULT_SETTINGS_PATH="${VAULT_SETTINGS_PATH:-secret/data/wslproxy/${VAULT_ENV}/settings.json}"
VAULT_PGSQL_PATH="${VAULT_PGSQL_PATH:-secret/data/wslproxy/${VAULT_ENV}/pgsql}"
SOPS_SETTINGS_PATH="${SOPS_SETTINGS_PATH:-${ROOT}/infra/secrets/${VAULT_ENV}/settings.sops.json}"
IN_CLUSTER_HOST="${CLUSTER}.${NS}.svc.cluster.local"
PGPORT=5432
SECRETS_SOURCE=""

# ── Vault helpers (WSLVault base64 + HashiCorp KV v2) ─────────────────────

vault_get() {
  local path="$1"
  local url="${VAULT_ADDR%/}/v1/${path#/}"
  local code
  if [[ -z "${VAULT_TOKEN:-}" ]]; then
    return 1
  fi
  code="$(curl -sS -o /tmp/vault-body.json -w '%{http_code}' \
    -H "X-Vault-Token: ${VAULT_TOKEN}" \
    -H "Accept: application/json" \
    "$url" || true)"
  if [[ "$code" != "200" ]]; then
    return 1
  fi
  jq -e '
    if (.data | type) == "string" then
      (.data | @base64d | fromjson)
    elif (.data.data | type) == "object" then
      .data.data
    elif (.data.data | type) == "string" then
      (.data.data | @base64d | fromjson)
    else
      error("unsupported Vault payload shape")
    end
  ' /tmp/vault-body.json
}

vault_settings_usable() {
  # Require non-empty object, super_user, and matching env_profile.
  jq -e --arg env "$VAULT_ENV" \
    '(type == "object") and (length > 0) and (.super_user != null) and (.env_profile == $env)' \
    >/dev/null 2>&1
}

# ── SOPS fallback ─────────────────────────────────────────────────────────

ensure_sops() {
  if command -v sops >/dev/null 2>&1; then
    return 0
  fi
  echo "==> installing sops binary for fallback decrypt"
  local ver="v3.9.4"
  local arch
  case "$(uname -m)" in
    x86_64|amd64) arch=amd64 ;;
    aarch64|arm64) arch=arm64 ;;
    *) echo "unsupported arch for sops fallback: $(uname -m)" >&2; return 1 ;;
  esac
  curl -fsSL "https://github.com/getsops/sops/releases/download/${ver}/sops-${ver}.linux.${arch}" \
    -o /tmp/sops
  chmod +x /tmp/sops
  export PATH="/tmp:${PATH}"
}

sops_get_settings() {
  if [[ ! -f "$SOPS_SETTINGS_PATH" ]]; then
    echo "SOPS file missing: ${SOPS_SETTINGS_PATH}" >&2
    return 1
  fi
  if [[ -z "${SOPS_AGE_KEY:-}" && -z "${SOPS_AGE_KEY_FILE:-}" ]]; then
    echo "SOPS_AGE_KEY (or SOPS_AGE_KEY_FILE) required for SOPS fallback" >&2
    return 1
  fi
  ensure_sops
  if [[ -n "${SOPS_AGE_KEY:-}" ]]; then
    export SOPS_AGE_KEY
  fi
  sops -d "$SOPS_SETTINGS_PATH"
}

# ── Resolve settings: Vault → SOPS ─────────────────────────────────────────

resolve_settings() {
  local raw=""
  # Status lines must go to stderr — this function's stdout is captured as JSON.
  if [[ -n "${VAULT_TOKEN:-}" ]]; then
    echo "==> try Vault settings (${VAULT_SETTINGS_PATH})" >&2
    if raw="$(vault_get "$VAULT_SETTINGS_PATH" 2>/dev/null)" \
      && printf '%s' "$raw" | vault_settings_usable; then
      # Write source path for parent (command substitution runs in a subshell).
      printf 'vault:%s\n' "$VAULT_SETTINGS_PATH" >/tmp/wslproxy-secrets-source.txt
      printf '%s' "$raw"
      return 0
    fi
    echo "  Vault settings unavailable or unusable — trying SOPS" >&2
  else
    echo "==> VAULT_TOKEN unset — trying SOPS" >&2
  fi

  echo "==> try SOPS settings (${SOPS_SETTINGS_PATH})" >&2
  raw="$(sops_get_settings)"
  if ! printf '%s' "$raw" | vault_settings_usable; then
    echo "ABORT: SOPS settings missing super_user or env_profile!='${VAULT_ENV}'" >&2
    return 1
  fi
  printf 'sops:%s\n' "$SOPS_SETTINGS_PATH" >/tmp/wslproxy-secrets-source.txt
  printf '%s' "$raw"
}

resolve_pgsql_overlay() {
  # Optional overlay object → /tmp/pgsql-overlay.json (or empty file).
  : >/tmp/pgsql-overlay.json
  if [[ -n "${VAULT_TOKEN:-}" ]] && vault_get "$VAULT_PGSQL_PATH" >/tmp/pgsql-overlay.json 2>/dev/null; then
    echo "==> pgsql overlay from Vault (${VAULT_PGSQL_PATH})"
    return 0
  fi
  # Fall back to .pgsql from the resolved settings object
  if jq -e '.pgsql | type == "object"' /tmp/wslproxy-settings-raw.json >/dev/null 2>&1; then
    echo "==> pgsql overlay from settings.pgsql (${SECRETS_SOURCE})"
    jq '.pgsql' /tmp/wslproxy-settings-raw.json >/tmp/pgsql-overlay.json
    return 0
  fi
  echo "==> no pgsql overlay (using Zalando defaults)"
  echo '{}' >/tmp/pgsql-overlay.json
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

SETTINGS_JSON="$(resolve_settings)"
printf '%s\n' "$SETTINGS_JSON" >/tmp/wslproxy-settings-raw.json
SECRETS_SOURCE="$(cat /tmp/wslproxy-secrets-source.txt 2>/dev/null || true)"
echo "==> secrets source: ${SECRETS_SOURCE}"

PG_HOST="$IN_CLUSTER_HOST"
PG_PORT="$PGPORT"
PG_DATABASE="$DB"
PG_USER="$Z_USER"
# In-cluster pods must use the Zalando-managed password (operator rotates it).
PG_PASSWORD="$Z_PASS"

resolve_pgsql_overlay
PG_DATABASE="$(jq -r --arg d "$PG_DATABASE" '.pg_database // .database // $d' /tmp/pgsql-overlay.json)"
PG_USER="$(jq -r --arg u "$PG_USER" '.pg_user // .user // $u' /tmp/pgsql-overlay.json)"
VP="$(jq -r '.pg_password // .password // empty' /tmp/pgsql-overlay.json)"
if [[ -n "$VP" && "$VP" != "$Z_PASS" ]]; then
  echo "  NOTE: overlay has pg_password — keeping Zalando password for in-cluster Secret ${APP_SECRET}." >&2
  echo "  Sync Vault/SOPS pgsql.pg_password to the Zalando value if VM edges need the same DB." >&2
fi

# ── Deploy helm Secrets (must match ingress-controller/deploy/helm values) ─

echo "==> apply Secret ${APP_SECRET} (helm openresty.pgsql.existingSecret)"
kubectl -n "$NS" create secret generic "$APP_SECRET" \
  --from-literal=pg_host="$PG_HOST" \
  --from-literal=pg_port="$PG_PORT" \
  --from-literal=pg_database="$PG_DATABASE" \
  --from-literal=pg_user="$PG_USER" \
  --from-literal=pg_password="$PG_PASSWORD" \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" label secret "$APP_SECRET" \
  app.kubernetes.io/part-of=wslproxy \
  app.kubernetes.io/component=storage \
  --overwrite

echo "==> build settings.json (source=${SECRETS_SOURCE}, storage_type=pgsql, in-cluster pgsql)"
MERGED="$(jq -n \
  --slurpfile base /tmp/wslproxy-settings-raw.json \
  --arg host "$PG_HOST" \
  --arg port "$PG_PORT" \
  --arg db "$PG_DATABASE" \
  --arg user "$PG_USER" \
  --arg pass "$PG_PASSWORD" \
  --arg src "$SECRETS_SOURCE" \
  '
  $base[0]
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
  | .secrets_source = $src
  ')"

printf '%s\n' "$MERGED" >/tmp/wslproxy-settings.json
PROFILE="$(jq -r '.env_profile // empty' /tmp/wslproxy-settings.json)"
if [[ -n "$PROFILE" && "$PROFILE" != "$VAULT_ENV" ]]; then
  echo "ABORT: settings env_profile='${PROFILE}' != VAULT_ENV='${VAULT_ENV}'" >&2
  exit 1
fi

echo "==> apply Secret ${SETTINGS_SECRET} (helm openresty.settings.existingSecret, key settings.json)"
kubectl -n "$NS" create secret generic "$SETTINGS_SECRET" \
  --from-file=settings.json=/tmp/wslproxy-settings.json \
  --dry-run=client -o yaml | kubectl apply -f -
kubectl -n "$NS" label secret "$SETTINGS_SECRET" \
  app.kubernetes.io/part-of=wslproxy \
  app.kubernetes.io/component=storage \
  --overwrite

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
      # CNI overlay between LAN workers and cloud003 (edge) is flaky; Postgres
      # lives on cloud003 — pin migrate there (same as values-control-plane-cloud003).
      nodeName: cloud003
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

rm -f /tmp/wslproxy-settings.json /tmp/wslproxy-settings-raw.json \
  /tmp/vault-body.json /tmp/pgsql-overlay.json /tmp/sops \
  /tmp/wslproxy-secrets-source.txt

echo "==> control-plane storage ready (source=${SECRETS_SOURCE})"
echo "  secret/${SETTINGS_SECRET}  → helm openresty.settings.existingSecret"
echo "  secret/${APP_SECRET}       → helm openresty.pgsql.existingSecret"
echo "  postgresql/${CLUSTER} status=Running"
echo "  Next: helm upgrade with --set openresty.settings.existingSecret=${SETTINGS_SECRET} --set openresty.pgsql.existingSecret=${APP_SECRET}"
