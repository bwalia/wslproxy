#!/usr/bin/env bash
# One-shot import of on-disk JSON into PostgreSQL typed tables.
# Does not change storage_type. Safe to re-run (upserts).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DATA_DIR="${DATA_DIR:-$ROOT/data}"

PGHOST="${PGHOST:-${WSLPROXY_PG_HOST:-127.0.0.1}}"
PGPORT="${PGPORT:-${WSLPROXY_PG_PORT:-5436}}"
PGUSER="${PGUSER:-${WSLPROXY_PG_USER:-wslproxy}}"
PGDATABASE="${PGDATABASE:-${WSLPROXY_PG_DB:-wslproxy}}"
export PGPASSWORD="${PGPASSWORD:-${WSLPROXY_PG_PASSWORD:-wslproxy_local_dev}}"

psql=(psql -h "$PGHOST" -p "$PGPORT" -U "$PGUSER" -d "$PGDATABASE" -v ON_ERROR_STOP=1)

echo "pg-import: data=$DATA_DIR → $PGUSER@$PGHOST:$PGPORT/$PGDATABASE"

python3 - "$DATA_DIR" <<'PY' | "${psql[@]}"
import json, os, sys, glob

data_dir = sys.argv[1]

def esc(s):
    if s is None:
        return "NULL"
    return "'" + str(s).replace("'", "''") + "'"

def json_esc(obj):
    return esc(json.dumps(obj, separators=(",", ":"))) + "::jsonb"

def bool_sql(v):
    if v is True:
        return "TRUE"
    if v is False:
        return "FALSE"
    return "NULL"

def load_json(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

scoped = {
    "servers": "servers",
    "rules": "rules",
    "secrets": "secrets",
    "instances": "instances",
    "upstreams": "upstreams",
    "waf_rules": "waf_rules",
    "waf_policies": "waf_policies",
    "waf_events": "waf_events",
}

print("BEGIN;")
for folder, table in scoped.items():
    for env_path in glob.glob(os.path.join(data_dir, folder, "*")):
        if not os.path.isdir(env_path) or os.path.basename(env_path) == "conf":
            continue
        env = os.path.basename(env_path)
        for path in glob.glob(os.path.join(env_path, "*.json")):
            rec = load_json(path)
            rid = rec.get("id") or os.path.splitext(os.path.basename(path))[0]
            rec["id"] = rid
            print(
                f"INSERT INTO {table} (id, env_profile, raw_json) VALUES "
                f"({esc(rid)}, {esc(env)}, {json_esc(rec)}) "
                f"ON CONFLICT (id, env_profile) DO UPDATE SET raw_json = EXCLUDED.raw_json;"
            )
            if table == "servers":
                print(f"UPDATE servers SET server_name = {esc(rec.get('server_name'))}, "
                      f"proxy_server_name = {esc(rec.get('proxy_server_name'))}, "
                      f"profile_id = {esc(rec.get('profile_id') or env)}, "
                      f"ssl_enabled = {bool_sql(rec.get('ssl_enabled'))}, "
                      f"waf_enabled = {bool_sql(rec.get('waf_enabled'))}, "
                      f"waf_policy_id = {esc(rec.get('waf_policy_id'))}, "
                      f"config_status = {bool_sql(rec.get('config_status'))} "
                      f"WHERE id = {esc(rid)} AND env_profile = {esc(env)};")
            if table == "rules":
                match = rec.get("match") or {}
                rules = match.get("rules") or {}
                response = match.get("response") or {}
                print(f"UPDATE rules SET name = {esc(rec.get('name'))}, "
                      f"priority = {int(rec.get('priority') or 0)}, "
                      f"path = {esc(rules.get('path'))}, "
                      f"path_key = {esc(rules.get('path_key'))}, "
                      f"status_code = {esc(response.get('code')) if response.get('code') is None else int(response.get('code'))}, "
                      f"schema_version = {int(rec.get('_schema_version') or 2)} "
                      f"WHERE id = {esc(rid)} AND env_profile = {esc(env)};")

users_path = os.path.join(data_dir, "users.json")
if os.path.isfile(users_path):
    users = load_json(users_path)
    if isinstance(users, dict):
        users = list(users.values()) if users and not isinstance(next(iter(users.values()), None), dict) else [
            dict(v, id=v.get("id", k)) for k, v in users.items() if isinstance(v, dict)
        ]
    for rec in users or []:
        if not isinstance(rec, dict):
            continue
        rid = rec.get("id")
        if not rid:
            continue
        print(
            f"INSERT INTO users (id, username, email, raw_json) VALUES "
            f"({esc(rid)}, {esc(rec.get('username') or rec.get('name'))}, {esc(rec.get('email'))}, {json_esc(rec)}) "
            f"ON CONFLICT (id) DO UPDATE SET raw_json = EXCLUDED.raw_json;"
        )

pops_dir = os.path.join(data_dir, "pops")
if os.path.isdir(pops_dir):
    for path in glob.glob(os.path.join(pops_dir, "*.json")):
        rec = load_json(path)
        rid = rec.get("id") or os.path.splitext(os.path.basename(path))[0]
        rec["id"] = rid
        print(
            f"INSERT INTO pops (id, name, status, raw_json) VALUES "
            f"({esc(rid)}, {esc(rec.get('name'))}, {esc(rec.get('status'))}, {json_esc(rec)}) "
            f"ON CONFLICT (id) DO UPDATE SET raw_json = EXCLUDED.raw_json;"
        )

print("COMMIT;")
PY

echo "pg-import: done"
