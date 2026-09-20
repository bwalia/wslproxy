---
name: wslproxy-pop-migrate
description: >-
  Migrate WSL Proxy servers, rules, and SSL allow-list files between POPs
  (source → target) without overwriting existing files. Use when the user
  asks to migrate/sync POP data, copy servers/rules between hosts, move
  domains from pop0 to pop1, or fix missing SSL after a POP migration.
disable-model-invocation: true
---

# WSL Proxy POP data migration

Migrate live gateway data from a **Source POP** to a **Target POP** so routing
and Let's Encrypt auto-ssl work on the target. OpenResty routes from JSON on
disk at request time — no `nginx -t` / reboot is required for servers+rules.

## Inputs (ask if missing)

| Input | Example |
|-------|---------|
| Source SSH | `administrator@85.190.106.189` (pop0) |
| Target SSH | `admin@18.133.126.242` (pop1) |
| Remote data root | `/opt/nginx/data` (default) |
| Local work dirs | `Source POP/`, `Target POP/` under repo root |

## Required trees (never skip)

Copy **all three** or SSL will not issue:

| Tree | Purpose |
|------|---------|
| `servers/` | Host records (`host:<domain>.json` + staged `conf/`) |
| `rules/` | Routing rules |
| **`ssl/`** | Auto-ssl allow-list (`<domain>.json`). **Missing this → `domain not allowed - using fallback`** |

Optional (only if user asks): `varnish/`, `upstreams/`, `waf_policies/`, `waf_rules/`.

**Never** copy `settings.json` / `.env` between POPs — those are host-specific secrets and `env_profile`.

## Hard rules

1. **Do not overwrite** files that already exist on Target (`rsync --ignore-existing` or skip-if-exists).
2. **Always include `ssl/`** with servers+rules.
3. After installing new `ssl/*.json`, **`sudo systemctl reload openresty`** on Target — `ssl_domains` shared dict only refreshes at worker start.
4. Fix ownership to `www-data:root` after copy.
5. Do not commit live dumps; keep them gitignored (`Source POP/`, `Target POP/`, `Migration-to-copy/`).

## Workflow

Prefer the script (low freedom / consistent):

```bash
# From repo:
.cursor/skills/wslproxy-pop-migrate/scripts/migrate-pop-data.sh \
  --source administrator@85.190.106.189 \
  --target admin@18.133.126.242 \
  --reload

# Same script also lives at:
#   .claude/skills/wslproxy-pop-migrate/scripts/migrate-pop-data.sh
```

Or follow the manual steps below.

### 1. Probe SSH + layout

```bash
ssh -o BatchMode=yes "$SOURCE" 'hostname; ls /opt/nginx/data/; du -sh /opt/nginx/data/{servers,rules,ssl}'
ssh -o BatchMode=yes "$TARGET" 'hostname; ls /opt/nginx/data/; du -sh /opt/nginx/data/{servers,rules,ssl}'
```

### 2. Download full data trees locally

```bash
mkdir -p "Source POP" "Target POP"
rsync -avz -e "ssh -o BatchMode=yes" "$SOURCE:/opt/nginx/data/" "Source POP/"
rsync -avz -e "ssh -o BatchMode=yes" "$TARGET:/opt/nginx/data/" "Target POP/"
# rsync exit 23 on Target is OK if settings.json is unreadable; servers/rules/ssl must succeed
```

### 3. Stage only missing files

For each of `servers`, `rules`, `ssl`:

- Walk Source files
- If the same relative path exists under Target → **skip**
- Else copy into `Migration-to-copy/<tree>/...`

### 4. Push to Target

**servers / rules** — often world-writable:

```bash
rsync -avz --ignore-existing -e "ssh -o BatchMode=yes" \
  Migration-to-copy/servers/ "$TARGET:/opt/nginx/data/servers/"
rsync -avz --ignore-existing -e "ssh -o BatchMode=yes" \
  Migration-to-copy/rules/ "$TARGET:/opt/nginx/data/rules/"
```

**ssl/** — often `www-data`-only (admin rsync fails with Permission denied). Stage to `/tmp` then sudo-install:

```bash
rsync -avz -e "ssh -o BatchMode=yes" Migration-to-copy/ssl/ "$TARGET:/tmp/ssl-migrate/"
ssh "$TARGET" 'bash -s' <<'EOF'
SRC=/tmp/ssl-migrate; DEST=/opt/nginx/data/ssl
for f in "$SRC"/*.json; do
  base=$(basename "$f")
  [ -e "$DEST/$base" ] && continue
  sudo cp "$f" "$DEST/$base"
  sudo chown www-data:root "$DEST/$base"
  sudo chmod 664 "$DEST/$base"
done
rm -rf /tmp/ssl-migrate
EOF
```

Then:

```bash
ssh "$TARGET" 'sudo chown -R www-data:root /opt/nginx/data/servers /opt/nginx/data/rules /opt/nginx/data/ssl'
```

### 5. Reload OpenResty (required for SSL)

```bash
ssh "$TARGET" 'sudo systemctl reload openresty'
```

Without this, `allow_domain` still returns false (shared dict stale) even though `ssl/<domain>.json` is on disk.

### 6. Verify

```bash
# DNS must point at Target
dig +short <domain> A

# Allow-list present
ssh "$TARGET" "test -f /opt/nginx/data/ssl/<domain>.json && echo ok"

# Cert should be Let's Encrypt (not CN=sni-support-required-for-valid-ssl)
echo | openssl s_client -connect <domain>:443 -servername <domain> 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates

# Must NOT keep logging: auto-ssl: domain not allowed - using fallback - <domain>
ssh "$TARGET" "sudo grep <domain> /usr/local/openresty/nginx/logs/error.log | tail -5"
```

Report: skipped counts, copied counts per tree, reload done, sample domain cert status.

## Why SSL breaks after servers-only migration

```
auto-ssl: domain not allowed - using fallback - argocd.fictionally.org
```

`lua-resty-auto-ssl` gates issuance on `ssl_domains` shared dict, populated from
`/opt/nginx/data/ssl/<domain>.json` — **not** from `servers/host:<domain>.json`
alone (`ssl_enabled: true` on the server is insufficient until the ssl allow-list
file exists and the dict is refreshed).

## Architecture notes (do not regress)

- Catch-all vhost + `gateway_ack.lua` reads `data/servers/` + `data/rules/` per request → live immediately after JSON copy.
- `config_status` / `conf.d` / reboot flags are **not** required for normal domain routing.
- 502 after a good LE cert = backend/upstream issue, not SSL.

## Checklist

```
- [ ] Source + Target SSH confirmed
- [ ] Local Source POP/ and Target POP/ dumps pulled
- [ ] Diff staged: servers + rules + ssl (missing only)
- [ ] Pushed with no overwrite
- [ ] ssl/ installed (sudo if needed)
- [ ] chown www-data:root
- [ ] systemctl reload openresty on Target
- [ ] Verified sample domain LE cert + no "domain not allowed"
- [ ] Dumps remain gitignored / not committed
```
