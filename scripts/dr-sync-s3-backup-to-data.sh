#!/usr/bin/env bash
# Sync extracted S3 backup trees into the git data/ directory (prod profile).
# Used by .github/workflows/restore-prod-data-from-s3-to-git.yml
#
# This script is the last thing standing between the live prod data and a
# PUBLIC git repository, so it redacts the S3 signing keys out of the rules
# before they are staged -- and then re-checks its own work.
#
# It did not always. Until 2026-09-21 the redaction pass matched `*.json`
# only, while the prod host leaves editor droppings beside each rule
# (`<uuid>.json.<pid>.<date>~`, `<uuid>.json.bak.<ts>`). Those end in `~`, so
# they were rsync'd into data/rules/prod/ unredacted and committed with a live
# access key id and secret in e4bae60f. GitHub's secret scanner reported it to
# AWS, AWS deleted the key, and every S3 workflow in this repo has failed with
# `InvalidClientTokenId` ever since -- one day after the key was rotated in,
# because the successful sync is what published its replacement.
#
# Three changes keep that from repeating, in order of how much they are
# trusted: the junk never syncs, the redaction covers every file rather than
# the ones named `.json`, and a scan fails the run if a credential survives
# both.
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
  # The prod host writes editor/backup droppings next to the live files. They
  # are not configuration, nothing loads them (rule_loader reads `{uuid}.json`
  # and `host:{name}.json`), and they are how an unredacted credential reached
  # a public repo. Drop them here rather than trying to clean up later.
  rsync -a --delete \
    --exclude='*~' \
    --exclude='*.bak' \
    --exclude='*.bak.*' \
    --exclude='*.swp' \
    --exclude='*.tmp' \
    --exclude='*.dr-redact.tmp' \
    "${src}/" "${dest}/"
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
# Every file, not just `*.json`. The exclusions above should mean there is
# nothing else left in the tree, but the redaction is the security control and
# the exclusion list is only a tidy-up: a name this script has not thought of
# must still get redacted, not skipped. `jq -e` already fails closed on
# anything that is not JSON carrying those fields.
if [[ -d "${DATA_ROOT}/rules/prod" ]]; then
  find "${DATA_ROOT}/rules/prod" -type f -print0 | while IFS= read -r -d '' file; do
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

# The trees this script stages -- the ones the workflow goes on to `git add`.
# Built once and reused by the two checks below. Only directories that exist:
# `find` exits non-zero on a missing path, and with `pipefail` that aborted
# the whole script before either check ran whenever a tree was absent from the
# backup (pops/ is optional by design, and 2>/dev/null hid the reason).
STAGED_DIRS=()
for sub in servers/prod rules/prod waf_policies/prod waf_rules/prod upstreams/prod pops; do
  [[ -d "${DATA_ROOT}/${sub}" ]] && STAGED_DIRS+=("${DATA_ROOT}/${sub}")
done

echo "=== Validate JSON ==="
if [[ ${#STAGED_DIRS[@]} -gt 0 ]]; then
  while IFS= read -r -d '' f; do
    jq empty "$f"
  done < <(find "${STAGED_DIRS[@]}" -name '*.json' -print0)
fi

echo "=== Secret scan (fails the run) ==="
# The backstop. Redaction is per-field and per-known-key; this is a blunt scan
# of the whole staged tree for credential shapes, and it exits non-zero rather
# than letting a PR carry one to a public repo. A finding here means the
# redaction above missed a field or a file, not that the scan is too strict:
# widen the redaction, never this gate.
#
# Patterns:
#   AKIA…/ASIA…/AIDA…/AROA… — AWS access key ids (20 chars, fixed prefix)
#   amazon_s3_secret_key    — the paired secret, whatever shape it takes
# Scoped to STAGED_DIRS. Scanning all of ${DATA_ROOT} would also read files
# that are gitignored and never leave the runner (data/settings.json holds
# real secrets by design), and the self-hosted test runner keeps its workspace
# between runs.
leaked=0
if [[ ${#STAGED_DIRS[@]} -gt 0 ]]; then
  while IFS= read -r -d '' file; do
    # No \b: it is a GNU grep extension and this gate must not depend on
    # which runner it lands on. The fixed 4-char prefixes are specific enough.
    if grep -qE '(AKIA|ASIA|AIDA|AROA)[A-Z0-9]{16}' "$file"; then
      echo "::error::AWS access key id found in ${file}"
      leaked=1
    fi
    if grep -q 'amazon_s3_secret_key' "$file" && ! grep -q 'REDACTED_S3_SECRET_KEY' "$file"; then
      echo "::error::unredacted amazon_s3_secret_key in ${file}"
      leaked=1
    fi
  done < <(find "${STAGED_DIRS[@]}" -type f -print0)
fi

if [[ "${leaked}" -ne 0 ]]; then
  echo ""
  echo "Refusing to stage live AWS credentials into git."
  echo "This repository is public; a key committed here is read by GitHub's"
  echo "secret scanner, reported to AWS, and deleted within the day."
  echo "See docs/runbooks/s3-credential-rotation.md."
  exit 1
fi
echo "✅ No AWS credentials in the staged trees"

echo "✅ DR sync complete"
