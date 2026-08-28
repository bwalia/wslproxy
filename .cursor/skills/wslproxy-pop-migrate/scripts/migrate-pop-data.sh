#!/usr/bin/env bash
# Migrate WSL Proxy servers/, rules/, and ssl/ from Source POP → Target POP.
# Never overwrites existing files on the target. Reloads openresty when --reload.
set -euo pipefail

SOURCE=""
TARGET=""
REMOTE_DATA="/opt/nginx/data"
WORK_ROOT=""
DO_RELOAD=0
TREES=(servers rules ssl)

usage() {
  cat <<'EOF'
Usage: migrate-pop-data.sh --source USER@HOST --target USER@HOST [options]

  --source USER@HOST   Source POP SSH target (required)
  --target USER@HOST   Target POP SSH target (required)
  --data-root PATH     Remote data dir (default: /opt/nginx/data)
  --work-dir PATH      Local work root (default: repo root / cwd)
  --reload             systemctl reload openresty on target after install
  --trees LIST         Comma-separated trees (default: servers,rules,ssl)
  -h, --help           Show help

Example:
  ./migrate-pop-data.sh \
    --source administrator@85.190.106.189 \
    --target admin@18.133.126.242 \
    --reload
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --source) SOURCE="$2"; shift 2 ;;
    --target) TARGET="$2"; shift 2 ;;
    --data-root) REMOTE_DATA="$2"; shift 2 ;;
    --work-dir) WORK_ROOT="$2"; shift 2 ;;
    --reload) DO_RELOAD=1; shift ;;
    --trees) IFS=',' read -r -a TREES <<< "$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "Unknown arg: $1" >&2; usage; exit 1 ;;
  esac
done

[[ -n "$SOURCE" && -n "$TARGET" ]] || { echo "ERROR: --source and --target required" >&2; usage; exit 1; }

# Refuse accidental omission of ssl when using default trees
has_ssl=0
for t in "${TREES[@]}"; do [[ "$t" == "ssl" ]] && has_ssl=1; done
if [[ $has_ssl -eq 0 ]]; then
  echo "WARNING: 'ssl' not in --trees. Auto-ssl will reject new domains (domain not allowed)." >&2
  echo "         Continuing anyway because you overrode --trees." >&2
fi

if [[ -z "$WORK_ROOT" ]]; then
  # Prefer git repo root if available
  if WORK_ROOT=$(git rev-parse --show-toplevel 2>/dev/null); then
    :
  else
    WORK_ROOT=$(pwd)
  fi
fi

SRC_LOCAL="$WORK_ROOT/Source POP"
TGT_LOCAL="$WORK_ROOT/Target POP"
MIG="$WORK_ROOT/Migration-to-copy"

ssh_opts=(-o BatchMode=yes -o ConnectTimeout=20)

echo "==> Probing Source $SOURCE"
ssh "${ssh_opts[@]}" "$SOURCE" "hostname; ls '$REMOTE_DATA' >/dev/null; du -sh '$REMOTE_DATA'/servers '$REMOTE_DATA'/rules '$REMOTE_DATA'/ssl 2>/dev/null || true"
echo "==> Probing Target $TARGET"
ssh "${ssh_opts[@]}" "$TARGET" "hostname; ls '$REMOTE_DATA' >/dev/null; du -sh '$REMOTE_DATA'/servers '$REMOTE_DATA'/rules '$REMOTE_DATA'/ssl 2>/dev/null || true"

mkdir -p "$SRC_LOCAL" "$TGT_LOCAL" "$MIG"
rm -rf "$MIG"
mkdir -p "$MIG"

echo "==> Downloading Source → $SRC_LOCAL"
rsync -az --delete -e "ssh ${ssh_opts[*]}" "$SOURCE:$REMOTE_DATA/" "$SRC_LOCAL/" || true

echo "==> Downloading Target → $TGT_LOCAL"
# Do not --delete Target mirror from a partial pull; keep what we get
rsync -az -e "ssh ${ssh_opts[*]}" "$TARGET:$REMOTE_DATA/" "$TGT_LOCAL/" || true

SKIPPED=0
COPIED=0
SUMMARY_FILE=$(mktemp)

echo "==> Staging missing files only"
for tree in "${TREES[@]}"; do
  if [[ ! -d "$SRC_LOCAL/$tree" ]]; then
    echo "  skip tree (missing on Source): $tree"
    continue
  fi
  tree_copied=0
  tree_skipped=0
  while IFS= read -r -d '' f; do
    rel="${f#"$SRC_LOCAL/"}"
    if [[ -e "$TGT_LOCAL/$rel" ]]; then
      SKIPPED=$((SKIPPED + 1))
      tree_skipped=$((tree_skipped + 1))
    else
      mkdir -p "$MIG/$(dirname "$rel")"
      cp "$f" "$MIG/$rel"
      COPIED=$((COPIED + 1))
      tree_copied=$((tree_copied + 1))
    fi
  done < <(find "$SRC_LOCAL/$tree" -type f -print0 2>/dev/null)
  echo "$tree $tree_copied $tree_skipped" >> "$SUMMARY_FILE"
done

echo "Staged to copy: $COPIED"
echo "Already on Target (skip): $SKIPPED"
while read -r tree tree_copied tree_skipped; do
  echo "  $tree: copy=$tree_copied skip=$tree_skipped"
done < "$SUMMARY_FILE"
rm -f "$SUMMARY_FILE"

if [[ $COPIED -eq 0 ]]; then
  echo "==> Nothing to push."
  exit 0
fi

push_tree_rsync() {
  local tree="$1"
  [[ -d "$MIG/$tree" ]] || return 0
  echo "==> Push $tree via rsync --ignore-existing"
  rsync -az --ignore-existing -e "ssh ${ssh_opts[*]}" \
    "$MIG/$tree/" "$TARGET:$REMOTE_DATA/$tree/" || true
}

push_ssl_sudo() {
  [[ -d "$MIG/ssl" ]] || return 0
  echo "==> Push ssl via /tmp + sudo (directory often not writable by SSH user)"
  rsync -az -e "ssh ${ssh_opts[*]}" "$MIG/ssl/" "$TARGET:/tmp/ssl-migrate/"
  ssh "${ssh_opts[@]}" "$TARGET" "REMOTE_DATA='$REMOTE_DATA' bash -s" <<'EOF'
set -euo pipefail
SRC=/tmp/ssl-migrate
DEST="${REMOTE_DATA}/ssl"
sudo mkdir -p "$DEST"
copied=0
skipped=0
shopt -s nullglob
for f in "$SRC"/*; do
  [ -f "$f" ] || continue
  base=$(basename "$f")
  if [ -e "$DEST/$base" ]; then
    skipped=$((skipped + 1))
  else
    sudo cp "$f" "$DEST/$base"
    sudo chown www-data:root "$DEST/$base"
    sudo chmod 664 "$DEST/$base"
    copied=$((copied + 1))
  fi
done
echo "ssl remote install: copied=$copied skipped=$skipped"
rm -rf /tmp/ssl-migrate
EOF
}

for tree in "${TREES[@]}"; do
  if [[ "$tree" == "ssl" ]]; then
    push_ssl_sudo
  else
    push_tree_rsync "$tree"
  fi
done

echo "==> Fix ownership on Target"
ssh "${ssh_opts[@]}" "$TARGET" \
  "sudo chown -R www-data:root '$REMOTE_DATA'/servers '$REMOTE_DATA'/rules '$REMOTE_DATA'/ssl 2>/dev/null || true"

# Refresh local Target mirror for staged trees
for tree in "${TREES[@]}"; do
  [[ -d "$MIG/$tree" ]] || continue
  mkdir -p "$TGT_LOCAL/$tree"
  rsync -a --ignore-existing "$MIG/$tree/" "$TGT_LOCAL/$tree/"
done

if [[ $DO_RELOAD -eq 1 ]]; then
  echo "==> Reloading openresty on Target (refresh ssl_domains shared dict)"
  ssh "${ssh_opts[@]}" "$TARGET" 'sudo systemctl reload openresty && systemctl is-active openresty'
else
  echo "==> NOTE: run with --reload (or: ssh $TARGET 'sudo systemctl reload openresty')"
  echo "    New ssl/*.json files are ignored until workers reload."
fi

echo "==> Done"
echo "Local dumps: $SRC_LOCAL | $TGT_LOCAL | $MIG"
