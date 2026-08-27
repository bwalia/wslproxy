#!/usr/bin/env bash
# Provision Zalando Postgres for wslproxy-system on k3s1 and apply migrations.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KUBECONFIG="${KUBECONFIG:-${HOME}/.kube/k3s1.yaml}"
export KUBECONFIG
NS=wslproxy-system
CLUSTER=wslproxy-db
USER=wslproxy
DB=wslproxy
CRED_SECRET="${USER}.${CLUSTER}.credentials.postgresql.acid.zalan.do"
APP_SECRET=wslproxy-pgsql

echo "==> apply ${CLUSTER} CR"
kubectl apply -f "${ROOT}/deploy/postgres/wslproxy-db.yaml"

echo "==> wait for cluster Running"
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

echo "==> wait for credentials secret"
for i in $(seq 1 36); do
  if kubectl -n "$NS" get secret "$CRED_SECRET" >/dev/null 2>&1; then
    break
  fi
  sleep 5
done
kubectl -n "$NS" get secret "$CRED_SECRET" >/dev/null

PGPASSWORD="$(kubectl -n "$NS" get secret "$CRED_SECRET" -o jsonpath='{.data.password}' | base64 -d)"
PGUSER="$(kubectl -n "$NS" get secret "$CRED_SECRET" -o jsonpath='{.data.username}' | base64 -d)"
PGHOST="${CLUSTER}.${NS}.svc.cluster.local"
PGPORT=5432

echo "==> write ${APP_SECRET}"
kubectl -n "$NS" create secret generic "$APP_SECRET" \
  --from-literal=pg_host="$PGHOST" \
  --from-literal=pg_port="$PGPORT" \
  --from-literal=pg_database="$DB" \
  --from-literal=pg_user="$PGUSER" \
  --from-literal=pg_password="$PGPASSWORD" \
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
          value: ${PGHOST}
        - name: PGPORT
          value: "${PGPORT}"
        - name: PGUSER
          valueFrom:
            secretKeyRef:
              name: ${APP_SECRET}
              key: pg_user
        - name: PGDATABASE
          value: ${DB}
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

echo ""
echo "OK: ${CLUSTER} Running; migrations applied; secret/${APP_SECRET} ready."
echo "  host=${PGHOST} port=${PGPORT} db=${DB} user=${PGUSER}"
echo "  kubectl -n ${NS} get secret ${APP_SECRET} -o yaml"
