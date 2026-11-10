#!/usr/bin/env bash
# Probe one host on one edge, by IP. Prints: <pop> <host> <status> <verdict>
# verdict: ok | NO_SERVER (edge answered "Host not configured") | BAD_WWW
# Used by .github/workflows/edge-guard.yml (run in parallel via xargs).
set -uo pipefail
pop="$1"; ip="$2"; host="$3"
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
code="$(curl -sk -o "$tmp/b" -D "$tmp/h" -w '%{http_code}' --connect-timeout 5 --max-time 10 \
  --resolve "$host:443:$ip" "https://$host/" 2>/dev/null)" || true
[ -n "$code" ] || code=000
verdict=ok
if grep -qi '^x-wsl-error: *no_server' "$tmp/h" 2>/dev/null || grep -q '<title>Host not configured</title>' "$tmp/b" 2>/dev/null; then
  verdict=NO_SERVER
fi
case "$host" in
  www.workstation.co.uk|workstation.co.uk)
    # Follow the locale redirect; the real page carries the site title.
    code="$(curl -skL -o "$tmp/b" -w '%{http_code}' --connect-timeout 5 --max-time 15 \
      --resolve "$host:443:$ip" "https://$host/" 2>/dev/null)" || code=000
    if [ "$verdict" = ok ] && { [ "$code" != 200 ] || ! grep -q '<title>[^<]*Workstation' "$tmp/b"; }; then
      verdict=BAD_WWW
    fi ;;
esac
echo "$pop $host $code $verdict"
