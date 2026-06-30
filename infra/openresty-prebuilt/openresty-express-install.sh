#!/usr/bin/env bash
#
# openresty-express-install.sh
# ----------------------------------------------------------------------------
# Build (or pull) a Docker image that has OpenResty + all wslproxy Lua deps
# precompiled, EXTRACT the /usr/local/openresty tree out of it, and install
# it on a bare-metal target (e.g. pop0) — instead of compiling OpenResty from
# source on every host. Then sync the app code (api/ + html/) and reload.
#
# No registry/artifact push: everything is local docker build + docker cp +
# rsync over SSH.
#
# WHY THIS IS SAFE ON A LIVE HOST:
#   - The OpenResty tree is rsynced with nginx/conf, nginx/html and nginx/logs
#     EXCLUDED, so the host's real templated nginx.conf, server confs and app
#     code are never overwritten by the image's defaults.
#   - App code (api/, html/) is synced separately from the git checkout — the
#     source of truth — exactly where Ansible's deploy_app.yml puts it.
#   - `openresty -t` is run before any restart; a bad config aborts the deploy.
#
# REQUIREMENTS:
#   - Local: docker, rsync, ssh.
#   - The image BASE_IMAGE must match the target's glibc/arch (Debian 13 by
#     default). Mismatch (e.g. Alpine/musl image -> Debian host) = nginx won't run.
#
# USAGE:
#   ./openresty-express-install.sh [MODE]
#
#   MODE (default: full):
#     full     build/pull image -> extract -> install OpenResty tree on target
#              -> sync api/ + html/ -> openresty -t -> restart
#     code     sync api/ + html/ to target -> reload   (the frequent path:
#              "lua or html files changed")
#     build    build the image only (no target changes)
#     extract  build/pull + extract the tree to a local tarball (no target)
#
# CONFIG (override via env):
#   TARGET=bwalia@187.124.112.155   # pop0 (user@host)
#   IMAGE=wslproxy-openresty:1.29.2.1
#   BASE_IMAGE=debian:13            # MUST match the target OS/glibc
#   PULL=0                          # 1 = docker pull IMAGE instead of build
#   SSH_OPTS="-o ConnectTimeout=15"
#
# EXAMPLES:
#   TARGET=bwalia@187.124.112.155 ./openresty-express-install.sh full
#   TARGET=bwalia@187.124.112.155 ./openresty-express-install.sh code
# ----------------------------------------------------------------------------
set -euo pipefail

MODE="${1:-full}"

# ── Config ──
TARGET="${TARGET:-bwalia@187.124.112.155}"          # pop0
IMAGE="${IMAGE:-wslproxy-openresty:1.29.2.1}"
BASE_IMAGE="${BASE_IMAGE:-debian:13}"
OPENRESTY_VERSION="${OPENRESTY_VERSION:-1.29.2.1}"
# Target CPU arch. pop0 is x86_64, so default linux/amd64. On Apple Silicon
# this builds under emulation (slower) but produces a binary that RUNS on the
# amd64 host — building native arm64 here would be unusable on pop0.
PLATFORM="${PLATFORM:-linux/amd64}"
PULL="${PULL:-0}"
PREFIX="/usr/local/openresty"
SSH_OPTS="${SSH_OPTS:--o ConnectTimeout=15}"

# Repo root = two levels up from this script (infra/openresty-prebuilt/..).
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
STAGING="$(mktemp -d)"
trap 'rm -rf "$STAGING"' EXIT

log()  { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
warn() { printf '\033[1;33m WARN\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31mERROR\033[0m %s\n' "$*" >&2; exit 1; }

require() { command -v "$1" >/dev/null 2>&1 || die "'$1' not found on PATH"; }

# Run a command on the target over SSH (no double-sudo password: target needs
# passwordless sudo, which our setup-runner-host.sh already configures).
rsh() { ssh $SSH_OPTS "$TARGET" "$@"; }

# ── Steps ───────────────────────────────────────────────────────────────────

build_image() {
  require docker
  if [ "$PULL" = "1" ]; then
    log "Pulling image $IMAGE ($PLATFORM)"
    docker pull --platform "$PLATFORM" "$IMAGE"
  else
    log "Building image $IMAGE (BASE_IMAGE=$BASE_IMAGE, OpenResty $OPENRESTY_VERSION, $PLATFORM)"
    DOCKER_BUILDKIT=1 docker build \
      --platform "$PLATFORM" \
      --build-arg "BASE_IMAGE=$BASE_IMAGE" \
      --build-arg "OPENRESTY_VERSION=$OPENRESTY_VERSION" \
      -t "$IMAGE" \
      "$SCRIPT_DIR"
  fi
}

extract_tree() {
  require docker
  log "Extracting $PREFIX from $IMAGE"
  local cid
  # create (not run) — cp only reads the filesystem, so no emulation needed
  # even when extracting an amd64 image on an arm64 host.
  cid="$(docker create --platform "$PLATFORM" "$IMAGE")"
  # docker cp streams a tar rooted at 'openresty/' -> unpack into STAGING.
  docker cp "$cid:$PREFIX" - | tar -x -C "$STAGING"
  docker rm -f "$cid" >/dev/null
  [ -x "$STAGING/openresty/nginx/sbin/nginx" ] || die "extracted tree missing nginx binary"
  log "Extracted $(du -sh "$STAGING/openresty" | cut -f1) to staging"
}

# Extract-only mode: leave a tarball next to the script for inspection.
extract_to_tarball() {
  build_image
  extract_tree
  local out="$SCRIPT_DIR/openresty-${OPENRESTY_VERSION}-${BASE_IMAGE//[:\/]/_}.tar.gz"
  log "Writing $out"
  tar -C "$STAGING" -czf "$out" openresty
  log "Done: $out"
}

ensure_target_runtime() {
  log "Ensuring runtime libs + www-data on target ($TARGET)"
  # Runtime libs matching the Dockerfile's runtime stage. PCRE2 first
  # (Debian 13), fall back to pcre3 for older targets.
  rsh 'sudo DEBIAN_FRONTEND=noninteractive apt-get update -qq && \
       sudo DEBIAN_FRONTEND=noninteractive apt-get install -y -qq \
         libssl3 zlib1g ca-certificates rsync && \
       (sudo apt-get install -y -qq libpcre2-8-0 || sudo apt-get install -y -qq libpcre3) ; \
       id -u www-data >/dev/null 2>&1 || sudo useradd -r -s /usr/sbin/nologin www-data || true'
}

install_tree() {
  require rsync
  ensure_target_runtime
  log "Rsyncing OpenResty tree -> $TARGET:$PREFIX (preserving conf/html/logs)"
  # Exclude the host's real config, app code and runtime dirs so we update
  # only the binary + luajit + lualib + bin. --rsync-path=sudo lets rsync
  # write into root-owned /usr/local/openresty.
  rsync -az --delete \
    --exclude='/nginx/conf/' \
    --exclude='/nginx/html/' \
    --exclude='/nginx/logs/' \
    --rsh="ssh $SSH_OPTS" \
    --rsync-path="sudo rsync" \
    "$STAGING/openresty/" "$TARGET:$PREFIX/"

  # Re-create the convenience symlink + a PATH symlink for mc.
  rsh "sudo ln -sf $PREFIX/nginx/sbin/nginx /usr/bin/openresty ; \
       sudo ln -sf $PREFIX/bin/mc /usr/local/bin/mc 2>/dev/null || true ; \
       $PREFIX/nginx/sbin/nginx -v"
}

sync_app_code() {
  require rsync
  [ -d "$REPO_ROOT/api" ]  || die "missing $REPO_ROOT/api"
  [ -d "$REPO_ROOT/html" ] || die "missing $REPO_ROOT/html"
  log "Syncing html/ -> $TARGET:$PREFIX/nginx/html"
  rsync -az --rsh="ssh $SSH_OPTS" --rsync-path="sudo rsync" \
    "$REPO_ROOT/html/" "$TARGET:$PREFIX/nginx/html/"
  log "Syncing api/ -> $TARGET:$PREFIX/nginx/html/api"
  rsync -az --rsh="ssh $SSH_OPTS" --rsync-path="sudo rsync" \
    "$REPO_ROOT/api/" "$TARGET:$PREFIX/nginx/html/api/"
}

test_and_reload() {
  log "Testing config on target (openresty -t)"
  if ! rsh "sudo $PREFIX/nginx/sbin/nginx -t"; then
    die "openresty -t FAILED on target — NOT restarting (live config left running)"
  fi
  log "Reloading OpenResty on target"
  # Prefer systemd; fall back to a direct reload/start.
  rsh 'sudo systemctl reload openresty 2>/dev/null \
       || sudo systemctl restart openresty 2>/dev/null \
       || sudo /usr/local/openresty/nginx/sbin/nginx -s reload 2>/dev/null \
       || sudo /usr/local/openresty/nginx/sbin/nginx'
  log "Reloaded. Health:"
  rsh "curl -sf -o /dev/null -w 'HTTP %{http_code}\n' http://127.0.0.1:8080/health || echo 'health check did not return 200 (check manually)'"
}

# ── Dispatch ──
case "$MODE" in
  build)
    build_image
    ;;
  extract)
    extract_to_tarball
    ;;
  code)
    log "CODE mode: sync api/ + html/ to $TARGET and reload"
    sync_app_code
    test_and_reload
    ;;
  full)
    log "FULL mode: install prebuilt OpenResty + app code on $TARGET"
    build_image
    extract_tree
    install_tree
    sync_app_code
    test_and_reload
    ;;
  *)
    die "unknown MODE '$MODE' (use: full | code | build | extract)"
    ;;
esac

log "Done ($MODE)."
