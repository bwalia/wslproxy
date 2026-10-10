---
name: wslproxy-add-domain
description: >-
  Add a new proxied domain (vhost) to the wslproxy edge the same way
  dockpilot/promptpilot.workstation.co.uk were added: live on lon1, mirrored
  to lon2 (pop0), imported into the control plane cp.pop0.uk, synced to git,
  plus an optional Cloudflare record. Use when the user asks to "add a
  domain", "expose <app> on <host>", "add a vhost like dockpilot", or point
  a new hostname at a backend/port.
disable-model-invocation: true
---

# Add a proxied domain to wslproxy

One command does the work; your job is to collect inputs, dry-run, run, and
report. Script: `.claude/skills/wslproxy-add-domain/scripts/add_domain.py`
(stdlib Python, reads secrets from files, never prints them).

## How the estate actually works (read before acting)

- **lon1** (`root@195.20.255.201`, `lon1.pop0.uk`) serves all public traffic.
  OpenResty reads JSON from `/opt/nginx/data/{servers,rules,ssl}/prod/`
  (`storage_type: disk`). DNS for `*.workstation.co.uk` is a wildcard CNAME
  to `pop0.wslproxy.com` → lon1.
- **lon2 = pop0** (`administrator@85.190.106.189`) copies lon1's data every
  5 min (`wslproxy-edge-sync.timer`). Never edit lon2 directly — it is reverted.
  lon2 shows the fallback cert while DNS points at lon1; that is expected.
- **cp.pop0.uk** is the source of truth for git, but it does **not** push to
  the POPs. Records are imported with `POST /api/projects/import` (keeps ids),
  then `cp-sync-pop-to-git.yml` mirrors CP into `data/` via PRs.
- **POPs cannot reach the office LAN.** A backend like `192.168.1.177:8095`
  will not work. Use the office public IP + a router port-forward, by
  convention `193.237.176.232:18xxx` → LAN host `:8xxx` (dockpilot 18090,
  promptpilot 18095). The script's preflight checks this from lon1.

## Inputs (ask if missing)

| Input | Example | Notes |
|-------|---------|-------|
| `--host` | `foo.workstation.co.uk` | New FQDN |
| `--backend` | `193.237.176.232:18096` or `https://193.237.176.232:17681` | Must answer from lon1. Without a scheme, http then https is tried, and the one that answers is stored (self-signed origin certs are fine). Or `--rule-id <id>` to share an existing rule (same backend) |
| `--upstream-host` | `192.168.1.177:7681` | Optional. Host header sent to the backend (stored as server `proxy_server_name`). Needed when the app answers `421 unknown host` to anything else |
| `--update` | | Repoint an **existing** host (`--backend` and/or `--upstream-host`). Ids are kept; runs CP first, then lon1, verify, lon2 |
| `--template` | `dockpilot.workstation.co.uk` (default) | lon1 server cloned (SSL/HTTPS settings) |
| `--dns-from` | `dockpilot.workstation.co.uk` (default) | Cloudflare record copied |

Credentials (files, chmod 600 — ask the user to create them, never paste
secrets into chat):

- `~/.config/wslproxy/cp.env` — `CP_API_USER=…` / `CP_API_PASSWD=…`
  (same values as the wslproxy GitHub secrets).
- `~/.config/cloudflare/token` — optional; Cloudflare token with Zone:Read +
  DNS:Edit on the zone. Without it the DNS step is skipped (wildcard covers
  `*.workstation.co.uk`).
- SSH keys for `root@195.20.255.201` and `administrator@85.190.106.189`.

## Procedure

1. **Dry run** (changes nothing; checks host is new, backend reachable from
   lon1, DNS, and builds the JSON):
   ```sh
   .claude/skills/wslproxy-add-domain/scripts/add_domain.py --host <fqdn> --backend <ip:port> --dry-run
   ```
   If the backend is unreachable, stop and tell the user which port-forward
   is needed. Do not fall back to a LAN IP.
2. **Confirm with the user** (this publishes a public hostname), then run all
   steps:
   ```sh
   .claude/skills/wslproxy-add-domain/scripts/add_domain.py --host <fqdn> --backend <ip:port>
   ```
   Steps: `preflight,generate,lon1,verify,lon2,cp,dns`. Re-run a subset with
   `--steps cp,dns` etc.; an existing lon1 host is reused (same rule id), never
   overwritten.

   **Host already exists** (preflight refuses): repoint it instead, e.g.
   ```sh
   .claude/skills/wslproxy-add-domain/scripts/add_domain.py --host dev.workstation.co.uk --update \
       --backend https://193.237.176.232:17681 --upstream-host 192.168.1.177:7681 [--rule-name hh-193-dev-17681]
   ```
   It patches CP's own records and lon1's separately (CP stores server
   `config` with one base64 layer, lon1 with two; never push one over the
   other), and adds `pop_ids` so the CP→git sync picks the host up.
3. **Mirror CP into git** — the script prints the commands:
   ```sh
   gh workflow run 'Sync POP config from CP (Go → data/ → PR)' -R bwalia/wslproxy -f pop_id=lon1 -f env_profile=prod
   gh workflow run 'Sync POP config from CP (Go → data/ → PR)' -R bwalia/wslproxy -f pop_id=pop0 -f env_profile=prod
   ```
   Run them one after the other. The run shows as failed because its last step,
   "Merge PR into main", hits branch protection ("At least 1 approving review
   is required") — that is expected; the PR is updated;
   give the user the PR links (`gh pr list -R bwalia/wslproxy --search 'cp-sync in:head'`)
   to approve. Do not bypass review. Mention any unrelated CP drift in the PR
   diff (`gh pr diff <n> --name-only`).
4. **Report**: URL, backend, rule id/name, lon1 HTTPS result, lon2 mirror,
   CP read-back, DNS action, PR links. If the backend app has auth, remind the
   user it is now internet-facing.

## Gotchas

- Cloudflare in front of cp.pop0.uk 403s Python's default User-Agent
  ("error code: 1010"); the script sends its own UA.
- CP `POST /api/servers` / `/api/rules` mint new ids; use the import endpoint
  so CP and lon1 share ids. Mutations need `x-platform: openresty-admin-next`.
- lon1 server `config` is base64 encoded twice; the script detects the layers.
- No reload is needed: servers and rules are read from disk per request, so a
  change on lon1 is live on the next request.
- `cp-sync-pop` exports only servers whose `pop_ids` include the POP. An
  untagged server (`pop_ids: null`, e.g. older hosts) silently never reaches
  git; `--update` tags it.
- HTTPS origins: `redirect_uri` must carry `https://`, because
  `gateway_resp.lua` takes the upstream scheme from it. lon1 uses
  `proxy_ssl_verify off`, and no SNI is sent for an IP, so the origin cert's
  CN/SAN doesn't matter.
- `421 unknown host` from an origin means it checks Host against an
  allow-list (dev.workstation's app only accepts `192.168.1.177:7681`). Set
  `--upstream-host`; don't change the origin cert.
- Let's Encrypt (HTTP-01) needs DNS → lon1 with the Cloudflare proxy **off**;
  the first HTTPS hit takes ~30–60 s. Don't flip `ssl_staging` on prod.
- `scp`/sftp is disabled on lon1; the script streams files over `ssh` + tar.
- `deploy-wslproxy-virtual-servers.yml` (on `release`) rsyncs git over lon1 —
  another reason to land the CP→git PRs promptly.
- `--update` leaves `<file>.bak.<epoch>` beside each lon1 file it changes.
- Rollback: delete `servers/prod/host:<fqdn>.json` and the rule file on lon1,
  `systemctl reload openresty`; delete the server and rule on CP via the
  cp.pop0.uk admin UI, then re-run the CP→git sync; lon2 follows lon1.
