#!/usr/bin/env bash
# Sync extracted S3 backup trees into the git data/ directory (prod profile).
# Used by .github/workflows/restore-prod-data-from-s3-to-git.yml
set -euo pipefail

RESTORE_ROOT="${1:?usage: dr-sync-s3-backup-to-data.sh <extracted-backup-root> [repo-data-dir]}"
DATA_ROOT="${2:-data}"

# S3 backup layout: servers/prod/, rules/prod/, … at RESTORE_ROOT
sync_tree() {
  local src_sub="$1"
  local dest_sub="$2"
  local src="${RESTORE_ROOT}/${src_sub}"
  local dest="${DATA_ROOT}/${dest_sub}"

  if [[ ! -d "${src}" ]]; then
    echo "skip ${dest_sub} (missing in backup: ${src})"
    return 0
  fi

  mkdir -p "${dest}"
  echo "rsync ${src}/ → ${dest}/"
  rsync -a --delete "${src}/" "${dest}/"
  local count
  count=$(find "${dest}" -type f | wc -l | tr -d ' ')
  echo "  ${count} file(s) in ${dest_sub}"
}

echo "=== DR sync: ${RESTORE_ROOT} → ${DATA_ROOT} ==="

sync_tree "servers/prod" "servers/prod"
sync_tree "rules/prod" "rules/prod"
sync_tree "waf_policies/prod" "waf_policies/prod"
sync_tree "waf_rules/prod" "waf_rules/prod"
sync_tree "upstreams/prod" "upstreams/prod"
# pops/ is not env-scoped on the host
if [[ -d "${RESTORE_ROOT}/pops" ]]; then
  sync_tree "pops" "pops"
fi

echo "=== Redacting rule secrets for git ==="
if [[ -d "${DATA_ROOT}/rules/prod" ]]; then
  find "${DATA_ROOT}/rules/prod" -name '*.json' -print0 | while IFS= read -r -d '' file; do
    if jq -e '.match.rules.amazon_s3_access_key // .match.rules.amazon_s3_secret_key' "$file" >/dev/null 2>&1; then
      tmp="${file}.dr-redact.tmp"
      jq '
        if .match.rules.amazon_s3_access_key then
          .match.rules.amazon_s3_access_key = "REDACTED_S3_ACCESS_KEY"
        else . end
        | if .match.rules.amazon_s3_secret_key then
          .match.rules.amazon_s3_secret_key = "REDACTED_S3_SECRET_KEY"
        else . end
      ' "$file" > "$tmp"
      mv "$tmp" "$file"
      echo "  redacted S3 keys: ${file}"
    fi
  done
fi

echo "=== Validate JSON ==="
find "${DATA_ROOT}/servers/prod" "${DATA_ROOT}/rules/prod" \
  "${DATA_ROOT}/waf_policies/prod" "${DATA_ROOT}/waf_rules/prod" \
  "${DATA_ROOT}/upstreams/prod" "${DATA_ROOT}/pops" \
  -name '*.json' 2>/dev/null | while read -r f; do
  jq empty "$f"
done

echo "✅ DR sync complete"
