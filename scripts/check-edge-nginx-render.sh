#!/usr/bin/env bash
# Render the prod nginx.conf template for each edge and compare it with the
# committed expected render in infra/ansible/rendered/<pop>.nginx.conf.
#
#   scripts/check-edge-nginx-render.sh            # CI: fail on any difference
#   scripts/check-edge-nginx-render.sh --update   # rewrite the expected renders
#
# Purely local: it runs ansible against localhost only and never connects to
# an edge. A template or per-edge var change therefore shows up in the PR as a
# diff of the rendered file, which is exactly what the edge will run.
#
# To compare with what an edge runs now (read-only), see
# docs/runbooks/edge-memory.md ("Is the edge running the template?").
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
ANSIBLE_DIR="$ROOT/infra/ansible"
OUT_DIR="$ANSIBLE_DIR/rendered"
# <pop name>=<host_vars directory>
EDGES=("lon1=lon1.pop0.uk" "pop0=85.190.106.189")

update=0
case "${1:-}" in
  --update) update=1 ;;
  "") ;;
  *) echo "usage: $0 [--update]" >&2; exit 2 ;;
esac

command -v ansible-playbook >/dev/null || {
  echo "ansible-playbook not found (pip install ansible-core)" >&2; exit 2; }

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

rc=0
for kv in "${EDGES[@]}"; do
  pop="${kv%%=*}"; edge="${kv#*=}"
  out="$tmp/$pop.nginx.conf"
  # wslproxy_version is pinned empty: a real deploy passes the git tag, which
  # only changes the `Server: wslproxy/<version>` header line.
  if ! ANSIBLE_LOCALHOST_WARNING=False ANSIBLE_INVENTORY_UNPARSED_WARNING=False \
      ansible-playbook "$ANSIBLE_DIR/render-nginx-conf.yml" \
        -e "edge=$edge" -e "out=$out" -e "wslproxy_version=" >"$tmp/$pop.log" 2>&1; then
    cat "$tmp/$pop.log" >&2
    echo "FAIL: could not render nginx.conf for $pop ($edge)" >&2
    rc=1; continue
  fi
  expected="$OUT_DIR/$pop.nginx.conf"
  if [ "$update" = 1 ]; then
    mkdir -p "$OUT_DIR"
    cp "$out" "$expected"
    echo "updated $expected"
  elif ! diff -u "$expected" "$out"; then
    echo "FAIL: $pop render differs from infra/ansible/rendered/$pop.nginx.conf." >&2
    echo "      If the change is intended, run $0 --update and commit the result." >&2
    rc=1
  else
    echo "ok: $pop render matches infra/ansible/rendered/$pop.nginx.conf"
  fi
done
exit $rc
