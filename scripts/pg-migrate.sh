#!/usr/bin/env bash
# Apply additive PostgreSQL migrations. Never DROPs. Idempotent.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
MIGRATIONS_DIR="${MIGRATIONS_DIR:-$ROOT/infra/pgsql/migrations}"

PGHOST="${PGHOST:-${WSLPROXY_PG_HOST:-127.0.0.1}}"
PGPORT="${PGPORT:-${WSLPROXY_PG_PORT:-5436}}"
PGUSER="${PGUSER:-${WSLPROXY_PG_USER:-wslproxy}}"
PGDATABASE="${PGDATABASE:-${WSLPROXY_PG_DB:-wslproxy}}"
export PGPASSWORD="${PGPASSWORD:-${WSLPROXY_PG_PASSWORD:-wslproxy_local_dev}}"

echo "pg-migrate: host=$PGHOST port=$PGPORT db=$PGDATABASE user=$PGUSER"
echo "pg-migrate: dir=$MIGRATIONS_DIR"

psql=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1)

"${psql[@]}" -c "CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW());"

shopt -s nullglob
for sql in "$MIGRATIONS_DIR"/*.sql; do
  version="$(basename "$sql" .sql)"
  applied="$("${psql[@]}" -tAc "SELECT 1 FROM schema_migrations WHERE version = '$version'")"
  if [[ "$applied" == "1" ]]; then
    echo "skip $version (already applied)"
    continue
  fi
  echo "apply $version"
  "${psql[@]}" -f "$sql"
done

echo "pg-migrate: done"
