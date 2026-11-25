#!/usr/bin/env sh
# Heap harness: real OpenResty, 2 workers, the real log_handler.lua +
# prometheus_metrics.lua, edge-like traffic. Prints per-worker Lua heap (KB,
# after a full GC) and the number of prometheus_metrics dict keys as traffic
# grows. Needs Docker and the local wslproxy image.
#
#   test/memory/heap/run.sh                    # current api/
#   API_DIR=/path/to/old/api test/memory/heap/run.sh   # e.g. before a fix
#
# PROM_LIB_DIR=<dir with prometheus.lua, prometheus_keys.lua,
# prometheus_resty_counter.lua> uses that library copy (e.g. the one in the
# prod image bwalia/wslproxy-openresty) instead of the image's own.
# HEAP_TOTAL / HEAP_STEP set the request count (default 200000 / 20000).
set -eu
ROOT=$(cd "$(dirname "$0")/../../.." && pwd)
IMAGE=${WSLPROXY_IMAGE:-wslproxy-wslproxy:latest}
API_DIR=${API_DIR:-$ROOT/api}
PROM_LIB_DIR=${PROM_LIB_DIR:-}
HARNESS=$ROOT/test/memory/heap

# Stream the inputs in with tar so this works where Docker cannot bind-mount
# the checkout (e.g. a macOS temp dir).
stage=$(mktemp -d)
trap 'rm -rf "$stage"' EXIT
mkdir -p "$stage/api" "$stage/harness" "$stage/promlib"
cp -R "$API_DIR/." "$stage/api/"
cp "$HARNESS/nginx.conf" "$HARNESS/load.lua" "$stage/harness/"
if [ -n "$PROM_LIB_DIR" ]; then cp "$PROM_LIB_DIR"/prometheus*.lua "$stage/promlib/"; fi

tar cf - -C "$stage" . | docker run --rm -i \
    -e HEAP_TOTAL="${HEAP_TOTAL:-200000}" -e HEAP_STEP="${HEAP_STEP:-20000}" \
    --entrypoint sh "$IMAGE" -c '
set -e
mkdir -p /heap && cd /heap && tar xf - && chmod -R a+rX /heap
mkdir -p /tmp/it/logs /tmp/it/body /tmp/it/proxy
openresty -p /tmp/it -c /heap/harness/nginx.conf
sleep 1
echo "# requests series worker0_heap_kb worker1_heap_kb"
resty /heap/harness/load.lua "$HEAP_TOTAL" "$HEAP_STEP"
openresty -p /tmp/it -c /heap/harness/nginx.conf -s quit || true
echo "--- error.log problems:"
grep -E "attempt to|runtime error|\[alert\]|\[crit\]|\[emerg\]" /tmp/it/logs/error.log | head -5 || echo none
'
