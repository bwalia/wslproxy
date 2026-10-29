#!/usr/bin/env sh
# Bot Defense integration harness: real OpenResty (real HMAC, SHA-256, shared
# dicts, two workers) against a mock origin. Needs Docker and the local
# wslproxy image.
#
#   test/bot_defense/integration/run.sh
#
# WSLPROXY_IMAGE overrides the image (default wslproxy-wslproxy:latest).
# IT_OUT=<dir> keeps the nginx error.log there for inspection.
set -eu

ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
IMAGE=${WSLPROXY_IMAGE:-wslproxy-wslproxy:latest}
OUT=${IT_OUT:-}
OUT_MOUNT=""
if [ -n "$OUT" ]; then
    mkdir -p "$OUT"
    OUT_MOUNT="-v $OUT:/out"
fi

# shellcheck disable=SC2086
docker run --rm \
    -v "$ROOT/api:/api:ro" \
    -v "$ROOT/test/bot_defense/integration:/harness:ro" \
    $OUT_MOUNT \
    --entrypoint sh "$IMAGE" -c '
set -e
mkdir -p /tmp/it/logs /tmp/it/data /tmp/it/body /tmp/it/proxy
cp /harness/settings.json /tmp/it/data/settings.json
NGINX_CONFIG_DIR=/tmp/it/ openresty -p /tmp/it -c /harness/nginx.conf
sleep 1
rc=0
resty /harness/check.lua || rc=$?
openresty -p /tmp/it -c /harness/nginx.conf -s quit || true
sleep 1
if [ -d /out ]; then cp /tmp/it/logs/error.log /out/error.log; fi
echo "--- error.log problems (Lua errors, crit, alert):"
if grep -E "attempt to|runtime error|lua entry thread aborted|\[alert\]|\[crit\]|\[emerg\]" /tmp/it/logs/error.log; then rc=1; else echo "none"; fi
echo "--- Bot Defense log lines (count, message):"
grep -oE "\[bot_defense\][^,]*|botdef \{\"[a-z]+\"" /tmp/it/logs/error.log | cut -c1-120 | sort | uniq -c | sort -rn | head -15
exit $rc
'
