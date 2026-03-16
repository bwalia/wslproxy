#!/bin/bash
# WSLProxy Storage Migration Tool
# Migrates configuration from disk (JSON files) or Redis to PostgreSQL
#
# Usage:
#   ./infra/db/migrate.sh --from disk --to pgsql
#   ./infra/db/migrate.sh --from disk --to pgsql --env prod
#   ./infra/db/migrate.sh --from disk --to pgsql --dry-run
#
# Environment variables (override defaults):
#   WSLPROXY_PG_HOST     PostgreSQL host     (default: localhost)
#   WSLPROXY_PG_PORT     PostgreSQL port     (default: 5432)
#   WSLPROXY_PG_DB       PostgreSQL database (default: wslproxy)
#   WSLPROXY_PG_USER     PostgreSQL user     (default: wslproxy)
#   WSLPROXY_PG_PASSWORD PostgreSQL password (default: wslproxy_local_dev)
#   DATA_DIR             Path to data dir    (default: ./data)

set -euo pipefail

# ─── Defaults ────────────────────────────────────────────────────────────────
FROM_BACKEND="disk"
TO_BACKEND="pgsql"
ENV_PROFILE="prod"
DRY_RUN=false
DATA_DIR="${DATA_DIR:-$(cd "$(dirname "$0")/../.." && pwd)/data}"

PG_HOST="${WSLPROXY_PG_HOST:-localhost}"
PG_PORT="${WSLPROXY_PG_PORT:-5432}"
PG_DB="${WSLPROXY_PG_DB:-wslproxy}"
PG_USER="${WSLPROXY_PG_USER:-wslproxy}"
PG_PASSWORD="${WSLPROXY_PG_PASSWORD:-wslproxy_local_dev}"

# ─── Colours ─────────────────────────────────────────────────────────────────
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'

# ─── Parse arguments ─────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
    case "$1" in
        --from)    FROM_BACKEND="$2"; shift 2 ;;
        --to)      TO_BACKEND="$2";   shift 2 ;;
        --env)     ENV_PROFILE="$2";  shift 2 ;;
        --dry-run) DRY_RUN=true;      shift ;;
        --data-dir) DATA_DIR="$2";    shift 2 ;;
        -h|--help)
            sed -n '2,20p' "$0"
            exit 0 ;;
        *) echo -e "${RED}Unknown option: $1${NC}"; exit 1 ;;
    esac
done

# ─── Validation ──────────────────────────────────────────────────────────────
if [[ "$FROM_BACKEND" != "disk" && "$FROM_BACKEND" != "redis" ]]; then
    echo -e "${RED}--from must be 'disk' or 'redis'${NC}"; exit 1
fi
if [[ "$TO_BACKEND" != "pgsql" ]]; then
    echo -e "${RED}--to only supports 'pgsql' currently${NC}"; exit 1
fi
if ! command -v psql &>/dev/null; then
    echo -e "${RED}psql not found. Install PostgreSQL client tools.${NC}"; exit 1
fi
if ! command -v jq &>/dev/null; then
    echo -e "${RED}jq not found. Install jq for JSON processing.${NC}"; exit 1
fi

# ─── PG helper ───────────────────────────────────────────────────────────────
pg_exec() {
    PGPASSWORD="$PG_PASSWORD" psql -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" "$@"
}

pg_upsert() {
    local resource_type="$1"
    local resource_name="$2"
    local env_profile="$3"
    local payload="$4"

    local escaped_payload
    escaped_payload=$(echo "$payload" | sed "s/'/''/g")

    local sql="INSERT INTO config_store (resource_type, resource_name, env_profile, payload)
        VALUES ('${resource_type}', '${resource_name}', '${env_profile}', '${escaped_payload}'::jsonb)
        ON CONFLICT (resource_type, resource_name, env_profile)
        WHERE status = 'active'
        DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW();"

    if $DRY_RUN; then
        echo -e "${BLUE}  [dry-run] UPSERT ${resource_type}/${resource_name} (${env_profile})${NC}"
    else
        echo "$sql" | pg_exec -q
    fi
}

# ─── Test PG connection ───────────────────────────────────────────────────────
echo -e "${GREEN}[migrate] Testing PostgreSQL connection to ${PG_HOST}:${PG_PORT}/${PG_DB}...${NC}"
if ! pg_exec -c "SELECT 1" -q > /dev/null 2>&1; then
    echo -e "${RED}Cannot connect to PostgreSQL. Check credentials and that the service is running.${NC}"
    exit 1
fi
echo -e "${GREEN}[migrate] Connection OK${NC}"
echo ""

# ─── Migrate from disk ───────────────────────────────────────────────────────
migrate_disk_to_pgsql() {
    local total=0 ok=0 err=0

    echo -e "${GREEN}[migrate] Source: disk (${DATA_DIR})${NC}"
    echo -e "${GREEN}[migrate] Target: PostgreSQL${NC}"
    echo -e "${GREEN}[migrate] Environment profile: ${ENV_PROFILE}${NC}"
    $DRY_RUN && echo -e "${YELLOW}[migrate] DRY RUN — no data will be written${NC}"
    echo ""

    # Resource types and their directories
    declare -A RESOURCE_DIRS=(
        ["servers"]="servers/${ENV_PROFILE}"
        ["request_rules"]="rules/${ENV_PROFILE}"
        ["waf_rules"]="waf_rules"
        ["waf_policies"]="waf_policies"
        ["bookmarks"]="bookmarks"
    )

    for resource_type in "${!RESOURCE_DIRS[@]}"; do
        local dir="${DATA_DIR}/${RESOURCE_DIRS[$resource_type]}"
        if [[ ! -d "$dir" ]]; then
            echo -e "${YELLOW}  [skip] ${dir} — directory not found${NC}"
            continue
        fi

        local file_count
        file_count=$(find "$dir" -maxdepth 1 -name '*.json' | wc -l | tr -d ' ')
        if [[ "$file_count" -eq 0 ]]; then
            echo -e "${YELLOW}  [skip] ${resource_type} — no JSON files in ${dir}${NC}"
            continue
        fi

        echo -e "${BLUE}  Migrating ${resource_type} (${file_count} files from ${dir})...${NC}"

        while IFS= read -r -d '' filepath; do
            local filename basename resource_name payload
            filename=$(basename "$filepath")
            resource_name="${filename%.json}"

            # Validate JSON
            if ! payload=$(jq -c '.' "$filepath" 2>/dev/null); then
                echo -e "${RED}    [error] invalid JSON: ${filepath}${NC}"
                ((err++)) || true
                continue
            fi

            total=$((total + 1))
            pg_upsert "$resource_type" "$resource_name" "$ENV_PROFILE" "$payload"
            echo -e "    [ok] ${resource_type}/${resource_name}"
            ok=$((ok + 1))
        done < <(find "$dir" -maxdepth 1 -name '*.json' -print0)
        echo ""
    done

    echo -e "${GREEN}[migrate] Complete: ${ok}/${total} migrated, ${err} errors${NC}"
    if [[ $err -gt 0 ]]; then exit 1; fi
}

# ─── Run ─────────────────────────────────────────────────────────────────────
if [[ "$FROM_BACKEND" == "disk" ]]; then
    migrate_disk_to_pgsql
else
    echo -e "${RED}Redis → pgsql migration not yet implemented.${NC}"
    exit 1
fi
