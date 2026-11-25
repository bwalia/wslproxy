#!/usr/bin/env bash
# Unit test for infra/edge-reload/wslproxy-reload. Never touches OpenResty:
# the test and reload commands are stubs that append to a log.
#
#   bash test/edge_reload/test_wslproxy_reload.sh
#
# Needs bash + flock (util-linux). On macOS run it in a container:
#   docker run --rm -v "$PWD:/w" -w /w debian:stable-slim bash test/edge_reload/test_wslproxy_reload.sh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SCRIPT="$ROOT/infra/edge-reload/wslproxy-reload"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

export WSLPROXY_RELOAD_STATE_DIR="$work/state"
export WSLPROXY_RELOAD_LOCK="$work/lock"
export WSLPROXY_RELOAD_MIN_INTERVAL=180
export WSLPROXY_RELOAD_SYSLOG=0
export WSLPROXY_OPENRESTY_TEST_CMD="$work/fake-test"
export WSLPROXY_RELOAD_CMD="$work/fake-reload"
CALLS="$work/calls"

cat > "$work/fake-test" <<EOF
#!/bin/sh
echo test >> "$CALLS"
[ ! -f "$work/broken" ]
EOF
cat > "$work/fake-reload" <<EOF
#!/bin/sh
echo reload >> "$CALLS"
EOF
chmod +x "$work/fake-test" "$work/fake-reload"

fail=0
pass=0
reloads() { grep -c '^reload$' "$CALLS" 2>/dev/null || true; }
check() {
  local name="$1" want="$2" got="$3"
  if [ "$want" = "$got" ]; then pass=$((pass + 1)); echo "ok   $name"
  else fail=$((fail + 1)); echo "FAIL $name: want '$want', got '$got'"; fi
}
run() { WSLPROXY_RELOAD_NOW="$1" "$SCRIPT" "${@:2}" >/dev/null; }

# 1. First reload ever goes straight through (after openresty -t).
run 1000 --reason first
check "first reload runs" 1 "$(reloads)"
check "openresty -t ran before it" "test reload" "$(tr '\n' ' ' < "$CALLS" | sed 's/ $//')"

# 2. A second reload 30 s later is deferred, not run.
run 1030 --reason second
check "reload within interval is deferred" 1 "$(reloads)"
check "deferred reload leaves a pending flag" yes "$([ -f "$work/state/pending" ] && echo yes || echo no)"

# 3. Several more inside the window coalesce into the same pending flag.
run 1040 --reason third
run 1050 --reason fourth
check "burst still only one reload" 1 "$(reloads)"

# 4. The timer does nothing until the interval has passed...
run 1100 --pending
check "--pending waits for the interval" 1 "$(reloads)"

# 5. ...then applies all the coalesced requests in ONE reload.
run 1181 --pending
check "--pending applies once interval passed" 2 "$(reloads)"
check "pending flag cleared" no "$([ -f "$work/state/pending" ] && echo yes || echo no)"

# 6. --pending with nothing pending is a no-op.
run 2000 --pending
check "--pending with no flag does nothing" 2 "$(reloads)"

# 7. --force always reloads, even right after another reload.
run 2001 --reason a
run 2010 --force --reason operator
check "--force bypasses the debounce" 4 "$(reloads)"

# 8. A config that does not parse is never reloaded, forced or not, and a
#    debounced request stays pending so the timer retries it.
touch "$work/broken"
set +e
WSLPROXY_RELOAD_NOW=5000 "$SCRIPT" --force >/dev/null 2>&1; rc_force=$?
WSLPROXY_RELOAD_NOW=5000 "$SCRIPT" >/dev/null 2>&1; rc_norm=$?
WSLPROXY_RELOAD_NOW=6000 "$SCRIPT" --pending >/dev/null 2>&1; rc_pend=$?
set -e
check "broken config: --force refused" 1 "$rc_force"
check "broken config: normal refused" 1 "$rc_norm"
check "broken config: --pending refused" 1 "$rc_pend"
check "broken config: nothing reloaded" 4 "$(reloads)"
check "broken config: request kept pending" yes "$([ -f "$work/state/pending" ] && echo yes || echo no)"
rm -f "$work/broken"
run 6060 --pending
check "fixed config: pending reload applied" 5 "$(reloads)"

# 9. Bad interval is rejected.
set +e
WSLPROXY_RELOAD_MIN_INTERVAL=abc "$SCRIPT" >/dev/null 2>&1; rc=$?
set -e
check "non-numeric interval rejected" 2 "$rc"

# 10. The interval comes from the defaults file when the env var is unset.
echo "WSLPROXY_RELOAD_MIN_INTERVAL=10" > "$work/defaults"
before="$(reloads)"
WSLPROXY_RELOAD_MIN_INTERVAL="" WSLPROXY_RELOAD_DEFAULTS="$work/defaults" \
  WSLPROXY_RELOAD_NOW=7000 "$SCRIPT" >/dev/null
WSLPROXY_RELOAD_MIN_INTERVAL="" WSLPROXY_RELOAD_DEFAULTS="$work/defaults" \
  WSLPROXY_RELOAD_NOW=7011 "$SCRIPT" >/dev/null
check "defaults file sets the interval" $((before + 2)) "$(reloads)"

echo "passed=$pass failed=$fail"
[ "$fail" = 0 ]
