#!/usr/bin/env bash
#
# api-gw-smoke.sh — smoke-test a WSLProxy api_gw deployment.
#
# Parameterised by BASE_URL; nothing in here is tenant-specific. Point it at
# any host that has `api_gw.enabled: true` and it reports what the gateway is
# actually doing, rather than asserting one tenant's expected policy.
#
# Usage:
#   BASE_URL=https://api.demo.example.com ./scripts/api-gw-smoke.sh
#   ./scripts/api-gw-smoke.sh https://api.demo.example.com
#
# Environment:
#   BASE_URL        target origin (required, or pass as $1)
#   API_PATH        a path that routes through the gateway   (default /)
#   HEALTH_PATH     a path expected to be public + unlimited (default /health)
#   ORIGIN          Origin header to test CORS with          (default https://smoke.invalid)
#   CORR_HEADER     correlation header name                  (default X-Correlation-ID)
#   API_KEY         sent as X-API-Key when set
#   BEARER          sent as "Authorization: Bearer $BEARER" when set
#   BURST           requests to fire at the rate limiter     (default 0 = skip)
#   CURL_OPTS       extra curl options (e.g. --resolve, -k)
#
# Exit status: 0 if every check that could run passed, 1 otherwise. Checks that
# cannot apply (no rate limiting configured, say) are reported SKIP, not FAIL.

set -uo pipefail

BASE_URL="${BASE_URL:-${1:-}}"
API_PATH="${API_PATH:-/}"
HEALTH_PATH="${HEALTH_PATH:-/health}"
ORIGIN="${ORIGIN:-https://smoke.invalid}"
CORR_HEADER="${CORR_HEADER:-X-Correlation-ID}"
BURST="${BURST:-0}"
CURL_OPTS="${CURL_OPTS:-}"

if [ -z "$BASE_URL" ]; then
    echo "usage: BASE_URL=https://host [API_PATH=/v1/ping] $0" >&2
    exit 2
fi
BASE_URL="${BASE_URL%/}"

pass=0; fail=0; skip=0
ok()   { printf '  \033[32mPASS\033[0m %s\n' "$1"; pass=$((pass+1)); }
no()   { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fail=$((fail+1)); }
meh()  { printf '  \033[33mSKIP\033[0m %s\n' "$1"; skip=$((skip+1)); }
head_() { printf '\n\033[1m%s\033[0m\n' "$1"; }

AUTH_ARGS=()
[ -n "${API_KEY:-}" ] && AUTH_ARGS+=(-H "X-API-Key: ${API_KEY}")
[ -n "${BEARER:-}" ]  && AUTH_ARGS+=(-H "Authorization: Bearer ${BEARER}")# bash 3.2 — still the default on macOS — treats "${arr[@]}" on an empty array
# as an unbound variable under `set -u`, so every expansion below is guarded
# with the ${arr[@]+...} form.

# Dump response headers + status for one request.
# fetch <path> [extra curl args...]
fetch() {
    local path="$1"; shift
    # shellcheck disable=SC2086
    curl -sS -o /dev/null -D - $CURL_OPTS ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "$@" "${BASE_URL}${path}" 2>/dev/null
}

status_of() { printf '%s\n' "$1" | awk 'NR==1{print $2}'; }
header_of() {
    # header_of <dump> <name> — case-insensitive, returns the value or nothing.
    printf '%s\n' "$1" | tr -d '\r' \
        | awk -v n="$(printf '%s' "$2" | tr '[:upper:]' '[:lower:]')" \
              'BEGIN{FS=": "} tolower($1)==n {sub(/^[^:]*: /,""); print; exit}'
}

echo "api_gw smoke test against ${BASE_URL}"

# ─── reachability ───────────────────────────────────────────────────────────

head_ "Reachability"
DUMP="$(fetch "$API_PATH")"
if [ -z "$DUMP" ]; then
    no "${API_PATH} did not respond — nothing else can be tested"
    exit 1
fi
STATUS="$(status_of "$DUMP")"
ok "${API_PATH} responded ${STATUS}"

# ─── correlation id ─────────────────────────────────────────────────────────

head_ "Correlation ID (request_security)"
CORR="$(header_of "$DUMP" "$CORR_HEADER")"
if [ -n "$CORR" ]; then
    ok "${CORR_HEADER} present: ${CORR}"
    SENT="smoke-$(date +%s)-$$"
    ECHOED="$(header_of "$(fetch "$API_PATH" -H "${CORR_HEADER}: ${SENT}")" "$CORR_HEADER")"
    if [ "$ECHOED" = "$SENT" ]; then
        ok "a well-formed inbound id is adopted and echoed"
    else
        no "inbound id '${SENT}' was not echoed (got '${ECHOED}')"
    fi
    BAD="$(header_of "$(fetch "$API_PATH" -H "${CORR_HEADER}: bad id with spaces")" "$CORR_HEADER")"
    if [ "$BAD" = "bad id with spaces" ]; then
        no "an unsafe inbound id was adopted verbatim — it should be replaced"
    else
        ok "an unsafe inbound id is replaced (got '${BAD}')"
    fi
else
    meh "${CORR_HEADER} not returned — correlation is off or echo_downstream is false"
fi

# ─── CORS ───────────────────────────────────────────────────────────────────

head_ "CORS"
PRE="$(fetch "$API_PATH" -X OPTIONS -H "Origin: ${ORIGIN}" -H "Access-Control-Request-Method: POST")"
PRE_STATUS="$(status_of "$PRE")"
PRE_ALLOW="$(header_of "$PRE" "Access-Control-Allow-Origin")"
if [ -n "$PRE_ALLOW" ]; then
    ok "preflight from ${ORIGIN} allowed (${PRE_STATUS}, allow-origin: ${PRE_ALLOW})"
    if [ -n "$(header_of "$PRE" "Access-Control-Allow-Methods")" ]; then
        ok "preflight advertises allowed methods"
    else
        no "preflight allowed the origin but advertised no methods"
    fi
else
    ok "preflight from an unconfigured origin (${ORIGIN}) gets no allow-origin — expected unless you set ORIGIN to a real one"
fi
# A wildcard reflected back with credentials is a real misconfiguration.
if [ "$PRE_ALLOW" = "*" ] && [ "$(header_of "$PRE" "Access-Control-Allow-Credentials")" = "true" ]; then
    no "Allow-Origin '*' with Allow-Credentials 'true' — browsers reject this combination"
fi

# ─── rate limit ─────────────────────────────────────────────────────────────

head_ "Rate limiting"
RL_LIMIT="$(header_of "$DUMP" "RateLimit-Limit")"
RL_REMAIN="$(header_of "$DUMP" "RateLimit-Remaining")"
if [ -n "$RL_LIMIT" ]; then
    ok "RateLimit-Limit: ${RL_LIMIT}, Remaining: ${RL_REMAIN:-?}"
    if [ -n "$(header_of "$DUMP" "RateLimit-Reset")" ]; then
        ok "RateLimit-Reset present"
    else
        no "RateLimit-Limit present but RateLimit-Reset missing"
    fi
else
    meh "no RateLimit-* headers — the route's profile is unlimited or rate_limit is off"
fi

if [ "$BURST" -gt 0 ] 2>/dev/null; then
    echo "  firing ${BURST} requests at ${API_PATH}..."
    got429=0
    for _ in $(seq 1 "$BURST"); do
        # shellcheck disable=SC2086
        code="$(curl -sS -o /dev/null -w '%{http_code}' $CURL_OPTS ${AUTH_ARGS[@]+"${AUTH_ARGS[@]}"} "${BASE_URL}${API_PATH}" 2>/dev/null)"
        [ "$code" = "429" ] && { got429=1; break; }
    done
    if [ "$got429" = "1" ]; then
        RETRY="$(header_of "$(fetch "$API_PATH")" "Retry-After")"
        ok "the limiter engaged (429)${RETRY:+, Retry-After: ${RETRY}}"
    else
        meh "no 429 within ${BURST} requests — raise BURST or lower the profile's limit to verify"
    fi
else
    meh "burst test not run (set BURST=<n> to fire n requests)"
fi

# ─── health route ───────────────────────────────────────────────────────────

head_ "Health route policy"
HEALTH="$(fetch "$HEALTH_PATH")"
if [ -n "$HEALTH" ]; then
    HS="$(status_of "$HEALTH")"
    if [ "$HS" = "200" ] || [ "$HS" = "204" ]; then
        ok "${HEALTH_PATH} is reachable (${HS})"
    else
        meh "${HEALTH_PATH} returned ${HS} — it may not be carved out as a public route"
    fi
    if [ -n "$(header_of "$HEALTH" "RateLimit-Limit")" ]; then
        meh "${HEALTH_PATH} is rate limited — consider a route with rate_profile 'health'"
    else
        ok "${HEALTH_PATH} is not rate limited"
    fi
else
    meh "${HEALTH_PATH} did not respond"
fi

# ─── IVT ────────────────────────────────────────────────────────────────────

head_ "Invalid-traffic guard"
IVT="$(header_of "$DUMP" "X-WSL-IVT")"
if [ -n "$IVT" ]; then
    ok "X-WSL-IVT: ${IVT} (monitor mode)"
else
    meh "no X-WSL-IVT header — IVT is in audit/block/disabled mode, which is normal"
fi

TRACE_CODE="$(status_of "$(fetch "$API_PATH" -X TRACE)")"
case "$TRACE_CODE" in
    403) ok "TRACE is rejected with 403 (IVT block mode)" ;;
    405|501) ok "TRACE is refused upstream (${TRACE_CODE})" ;;
    "") meh "TRACE got no response" ;;
    *) meh "TRACE returned ${TRACE_CODE} — expected if IVT is in audit mode" ;;
esac

PROBE_CODE="$(status_of "$(fetch "/wp-admin/setup.php")")"
case "$PROBE_CODE" in
    403) ok "a scanner path is rejected with 403" ;;
    "") meh "the scanner path got no response" ;;
    *) meh "the scanner path returned ${PROBE_CODE} — expected if IVT is in audit mode" ;;
esac

# ─── credential leakage ─────────────────────────────────────────────────────

head_ "Response hygiene"
LEAKED=""
for h in Authorization Cookie X-API-Key; do
    [ -n "$(header_of "$DUMP" "$h")" ] && LEAKED="${LEAKED} ${h}"
done
if [ -n "$LEAKED" ]; then
    no "credential-bearing headers reflected on the response:${LEAKED}"
else
    ok "no credential headers reflected back"
fi

# ─── summary ────────────────────────────────────────────────────────────────

printf '\n\033[1mSummary\033[0m  %d passed, %d failed, %d skipped\n' "$pass" "$fail" "$skip"
[ "$fail" -eq 0 ] || exit 1
