#!/usr/bin/env bash
# Reconcile a target env's SOPS-encrypted super_user with the canonical
# admin login plaintext, so the hourly "Admin UI Login Tests" workflow
# (and the API test workflows) can actually log in.
#
# WHY THIS EXISTS
#   The admin login handler (api/api.lua) compares the STORED hash
#       settings.super_user.password
#   against
#       base64(sha256(<plaintext the client typed>))     (api/helpers.lua:hashPassword)
#   The 2026-06-29 SOPS/age secrets migration re-wrote prod's
#   settings.json with a super_user whose hash no longer corresponds to
#   the canonical LOGIN_EMAIL / LOGIN_PASSWORD repo secrets, so every
#   valid-credential login test has returned 401 ever since.
#
#   This script recomputes the hash from the KNOWN plaintext and writes
#   it (plus the email) back into infra/secrets/<env>/settings.sops.json,
#   re-encrypting in place.  Commit + redeploy that env and login works.
#
# REQUIREMENTS (run where the age PRIVATE key is available)
#   - sops + openssl on PATH
#   - SOPS_AGE_KEY exported (AGE_SECRET_KEY-1…) OR ~/.config/sops/age keys
#
# USAGE
#   ADMIN_EMAIL='admin@example.com' ADMIN_PASSWORD='<plaintext>' \
#     infra/secrets/reconcile-super-user.sh prod
#
#   # dry-run: show what would change, write nothing
#   DRY_RUN=1 ADMIN_EMAIL=... ADMIN_PASSWORD=... infra/secrets/reconcile-super-user.sh prod
set -euo pipefail

ENV="${1:?usage: reconcile-super-user.sh <env>   (int|test|acc|prod)}"
: "${ADMIN_EMAIL:?set ADMIN_EMAIL to the canonical admin login email (= LOGIN_EMAIL secret)}"
: "${ADMIN_PASSWORD:?set ADMIN_PASSWORD to the canonical admin login plaintext (= LOGIN_PASSWORD secret)}"

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILE="$REPO_ROOT/infra/secrets/$ENV/settings.sops.json"
[ -f "$FILE" ] || { echo "::error::$FILE not found"; exit 1; }
command -v sops >/dev/null    || { echo "::error::sops not on PATH"; exit 1; }
command -v openssl >/dev/null || { echo "::error::openssl not on PATH"; exit 1; }

# hashPassword() == base64(sha256(plaintext)) — see api/helpers.lua
HASH="$(printf '%s' "$ADMIN_PASSWORD" | openssl dgst -sha256 -binary | base64)"

# Read current values from the decrypted document (no plaintext printed).
CUR_EMAIL="$(sops --decrypt --extract '["super_user"]["email"]' "$FILE" 2>/dev/null || echo '<unset>')"
CUR_HASH="$(sops --decrypt --extract '["super_user"]["password"]' "$FILE" 2>/dev/null || echo '<unset>')"

email_ok=false; pass_ok=false
[ "$CUR_EMAIL" = "$ADMIN_EMAIL" ] && email_ok=true
[ "$CUR_HASH"  = "$HASH" ]        && pass_ok=true

echo "env=$ENV file=$FILE"
echo "  super_user.email    : $([ "$email_ok" = true ] && echo 'MATCH' || echo "MISMATCH (deployed='$CUR_EMAIL' expected='$ADMIN_EMAIL')")"
echo "  super_user.password : $([ "$pass_ok"  = true ] && echo 'MATCH' || echo 'MISMATCH (hash differs from base64(sha256(ADMIN_PASSWORD)))')"

if [ "$email_ok" = true ] && [ "$pass_ok" = true ]; then
  echo "Already reconciled — nothing to do.  If prod still 401s, redeploy the env so the file reaches /opt/nginx/data/settings.json."
  exit 0
fi

if [ "${DRY_RUN:-0}" = "1" ]; then
  echo "DRY_RUN=1 — would update super_user.email and super_user.password; writing nothing."
  exit 0
fi

sops --set "[\"super_user\"][\"email\"] \"$ADMIN_EMAIL\"" "$FILE"
sops --set "[\"super_user\"][\"password\"] \"$HASH\"" "$FILE"
echo "Updated $FILE (re-encrypted in place)."
echo
echo "Next steps:"
echo "  1. git add $FILE && git commit -m 'fix(secrets): reconcile $ENV super_user with canonical admin login'"
echo "  2. Redeploy $ENV so it lands on the host as /opt/nginx/data/settings.json"
echo "     (delivery/promotion pipeline with secrets_mode=sops, or DEPLOY_MODE=servers)."
echo "  3. Ensure the LOGIN_EMAIL / LOGIN_PASSWORD repo secrets equal ADMIN_EMAIL / ADMIN_PASSWORD"
echo "     (gh secret set LOGIN_EMAIL --repo bwalia/wslproxy ; gh secret set LOGIN_PASSWORD ...)."
