#!/usr/bin/env bash
# Materialize a POP export bundle into infra/configuration/pops/<pop_id>/.
#
# Modes:
#   api  — GET $CP_URL/api/configuration/export?pop_id=&env=  (Bearer $CP_TOKEN)
#   repo — filter local data/{servers,rules,...}/<env> by server.pop_ids (offline)
#
# Usage:
#   CP_URL=https://cp.pop0.uk CP_TOKEN=… ./scripts/materialize-pop-export.sh api lon1 prod
#   ./scripts/materialize-pop-export.sh repo lon1 prod
set -euo pipefail

MODE="${1:-}"
POP_ID="${2:-}"
ENV_PROFILE="${3:-prod}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT="${ROOT}/infra/configuration/pops/${POP_ID}"

if [[ -z "$MODE" || -z "$POP_ID" ]]; then
  echo "usage: $0 api|repo <pop_id> [env]" >&2
  exit 2
fi

command -v jq >/dev/null || { echo "jq required" >&2; exit 1; }

rm -rf "${OUT}"
mkdir -p "${OUT}"/{servers,rules,waf_policies,waf_rules,secrets}

write_array_to_dir() {
  local kind="$1"
  local json_array="$2"
  local dir="${OUT}/${kind}"
  mkdir -p "$dir"
  local n
  n="$(jq 'length' <<<"$json_array")"
  local i=0
  while [[ "$i" -lt "$n" ]]; do
    local rec id safe
    rec="$(jq -c --argjson i "$i" '.[$i]' <<<"$json_array")"
    id="$(jq -r '.id // empty' <<<"$rec")"
    if [[ -z "$id" ]]; then
      i=$((i + 1))
      continue
    fi
    safe="$(printf '%s' "$id" | tr -c 'A-Za-z0-9._:@A-Za-z0-9_-' '_')"
    jq -S . <<<"$rec" >"${dir}/${safe}.json"
    i=$((i + 1))
  done
}

if [[ "$MODE" == "api" ]]; then
  : "${CP_URL:?CP_URL required for api mode}"
  : "${CP_TOKEN:?CP_TOKEN required for api mode}"
  CP_URL="${CP_URL%/}"
  URL="${CP_URL}/api/configuration/export?pop_id=${POP_ID}&env=${ENV_PROFILE}"
  echo "Fetching ${URL}"
  HTTP_CODE="$(curl -sS -o /tmp/pop-export.json -w '%{http_code}' \
    -H "Authorization: Bearer ${CP_TOKEN}" \
    -H "Accept: application/json" \
    "$URL")"
  if [[ "$HTTP_CODE" != "200" ]]; then
    echo "export failed HTTP ${HTTP_CODE}" >&2
    head -c 2000 /tmp/pop-export.json >&2 || true
    exit 1
  fi
  jq -e --arg p "$POP_ID" '.data.manifest.pop_id == $p' /tmp/pop-export.json >/dev/null
  jq -S '.data.manifest' /tmp/pop-export.json >"${OUT}/manifest.json"
  for kind in servers rules waf_policies waf_rules secrets; do
    write_array_to_dir "$kind" "$(jq -c --arg k "$kind" '.data[$k] // []' /tmp/pop-export.json)"
  done

elif [[ "$MODE" == "repo" ]]; then
  python3 - "$ROOT" "$POP_ID" "$ENV_PROFILE" "$OUT" <<'PY'
import json, hashlib, os, sys, uuid
from pathlib import Path
from datetime import datetime, timezone

root, pop_id, env, out = Path(sys.argv[1]), sys.argv[2], sys.argv[3], Path(sys.argv[4])
servers_dir = root / "data" / "servers" / env
if not servers_dir.is_dir():
    sys.exit(f"missing {servers_dir}")

def load_json(p):
    with open(p) as f:
        return json.load(f)

def pop_match(srv):
    ids = srv.get("pop_ids")
    if isinstance(ids, list):
        return pop_id in ids
    if isinstance(ids, dict):
        return pop_id in ids.values() or (pop_id in ids and ids[pop_id])
    return False

def collect_secret_ids(obj, acc, depth=0):
    if depth > 8:
        return
    if isinstance(obj, dict):
        for v in obj.values():
            collect_secret_ids(v, acc, depth + 1)
    elif isinstance(obj, list):
        for v in obj:
            collect_secret_ids(v, acc, depth + 1)
    elif isinstance(obj, str) and obj.startswith("secret://"):
        rest = obj[len("secret://"):]
        acc.add(rest.split("#", 1)[0])

servers, rule_ids, waf_policy_ids, secret_ids = [], set(), set(), set()
for p in sorted(servers_dir.glob("*.json")):
    srv = load_json(p)
    if not pop_match(srv):
        continue
    servers.append(srv)
    rules = srv.get("rules")
    if isinstance(rules, str):
        rule_ids.add(rules)
    elif isinstance(rules, list):
        rule_ids.update(r for r in rules if isinstance(r, str))
    for c in srv.get("match_cases") or []:
        if isinstance(c, dict):
            rid = c.get("statement") or c.get("rule_id") or c.get("id")
            if isinstance(rid, str):
                rule_ids.add(rid)
    wpid = srv.get("waf_policy_id")
    if isinstance(wpid, str) and wpid:
        waf_policy_ids.add(wpid)
    collect_secret_ids(srv, secret_ids)

rules, waf_policies, waf_rules, secrets = [], [], [], []
waf_rule_ids = set()
for rid in sorted(rule_ids):
    rp = root / "data" / "rules" / env / f"{rid}.json"
    if rp.is_file():
        rec = load_json(rp)
        rules.append(rec)
        collect_secret_ids(rec, secret_ids)
for wid in sorted(waf_policy_ids):
    wp = root / "data" / "waf_policies" / env / f"{wid}.json"
    if wp.is_file():
        rec = load_json(wp)
        waf_policies.append(rec)
        for item in rec.get("rules") or rec.get("rule_ids") or rec.get("waf_rules") or []:
            if isinstance(item, str):
                waf_rule_ids.add(item)
            elif isinstance(item, dict) and isinstance(item.get("id"), str):
                waf_rule_ids.add(item["id"])
for rid in sorted(waf_rule_ids):
    rp = root / "data" / "waf_rules" / env / f"{rid}.json"
    if rp.is_file():
        waf_rules.append(load_json(rp))
for sid in sorted(secret_ids):
    sp = root / "data" / "secrets" / env / f"{sid}.json"
    if sp.is_file():
        secrets.append(load_json(sp))

def write_kind(kind, records):
    d = out / kind
    d.mkdir(parents=True, exist_ok=True)
    for rec in records:
        rid = rec.get("id")
        if not rid:
            continue
        safe = "".join(c if c.isalnum() or c in "._:@-" else "_" for c in str(rid))
        with open(d / f"{safe}.json", "w") as f:
            json.dump(rec, f, sort_keys=True, indent=2)
            f.write("\n")

for kind, recs in (
    ("servers", servers),
    ("rules", rules),
    ("waf_policies", waf_policies),
    ("waf_rules", waf_rules),
    ("secrets", secrets),
):
    write_kind(kind, recs)

# content hash over sorted relative paths
h = hashlib.sha256()
paths = sorted(p for p in out.rglob("*.json") if p.name != "manifest.json")
for p in paths:
    h.update(p.relative_to(out).as_posix().encode())
    h.update(p.read_bytes())

manifest = {
    "pop_id": pop_id,
    "env_profile": env,
    "export_id": str(uuid.uuid4()),
    "content_sha256": h.hexdigest(),
    "source_host": "repo-data",
    "exported_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "record_counts": {
        "servers": len(servers),
        "rules": len(rules),
        "waf_policies": len(waf_policies),
        "waf_rules": len(waf_rules),
        "secrets": len(secrets),
    },
}
with open(out / "manifest.json", "w") as f:
    json.dump(manifest, f, sort_keys=True, indent=2)
    f.write("\n")
print(json.dumps(manifest, indent=2))
PY

else
  echo "unknown mode: $MODE (use api|repo)" >&2
  exit 2
fi

echo "Wrote ${OUT}"
if command -v jq >/dev/null 2>&1 && jq . "${OUT}/manifest.json" >/dev/null 2>&1; then
  jq . "${OUT}/manifest.json"
else
  python3 -m json.tool "${OUT}/manifest.json"
fi
