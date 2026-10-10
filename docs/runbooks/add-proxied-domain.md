# Runbook: add a proxied domain

How to add a new public hostname (vhost) to the wslproxy edge, the way
`dockpilot.workstation.co.uk` and `promptpilot.workstation.co.uk` were added.

## The pieces

| What | Path | Use |
|------|------|-----|
| Prompt | [`docs/prompts/add-proxied-domain.md`](../prompts/add-proxied-domain.md) | A fill-in prompt for one domain, plus a table version for adding several at once. |
| Skill | [`.claude/skills/wslproxy-add-domain/SKILL.md`](../../.claude/skills/wslproxy-add-domain/SKILL.md) | Run with `/wslproxy-add-domain` in Claude Code from the repo root. Explains how the edge works, the inputs and credential files needed, the steps, known problems, and how to undo a domain. |
| Helper script | [`.claude/skills/wslproxy-add-domain/scripts/add_domain.py`](../../.claude/skills/wslproxy-add-domain/scripts/add_domain.py) | Repeats the promptpilot setup in one command. Stdlib Python only. |

## Usage

```sh
add_domain.py --host foo.workstation.co.uk --backend 193.237.176.232:18096 --dry-run   # check first
add_domain.py --host foo.workstation.co.uk --backend 193.237.176.232:18096             # then for real
```

The stages run in this order:

1. `preflight`: the host doesn't already exist, lon1 can reach the backend, DNS resolves.
2. `generate`: builds the rule and server JSON.
3. `lon1`: installs the files on lon1 and reloads OpenResty.
4. `verify`: checks HTTPS (trusted cert, backend reached).
5. `lon2`: waits for the pop0/lon2 mirror (`wslproxy-edge-sync`, up to 5 min).
6. `cp`: imports into the cp.pop0.uk control plane with lon1's ids.
7. `dns`: creates the Cloudflare record as a copy of dockpilot's.

Use `--steps` to re-run only some of them, e.g. `--steps cp,dns`.

The script doesn't reload OpenResty. Servers and rules are read from disk on
every request, so a change is live on the next request.

### Backends that need HTTPS or a specific Host

Without a scheme, `--backend` tries http first and then https, and stores the
one that answers. A self-signed origin certificate is fine. If the app answers
`421 unknown host`, it only accepts certain Host headers. Pass
`--upstream-host <host[:port]>`, which is stored as the server's
`proxy_server_name`.

### Repoint an existing host

```sh
add_domain.py --host dev.workstation.co.uk --update \
    --backend https://193.237.176.232:17681 --upstream-host 192.168.1.177:7681
```

This updates CP first, then lon1, then checks HTTPS and waits for lon2. It
keeps the rule and server ids, and tags the server with `pop_ids` (lon1, pop0)
so the CP → git sync includes it. Servers without `pop_ids` are skipped by that
sync.

After it finishes, dispatch `Sync POP config from CP (Go → data/ → PR)` for
`lon1`, then for `pop0`. The script prints the commands. Each run opens a PR
that needs an approving review. Each run shows as failed at its last step,
"Merge PR into main", because of branch protection. That is expected, and the
PR is still updated. Don't bypass branch protection.

## Credentials

Store these in files with `chmod 600`. The script never prints them:

- `~/.config/wslproxy/cp.env`: `CP_API_USER=…` / `CP_API_PASSWD=…`
- `~/.config/cloudflare/token`: optional. Needs Zone:Read and DNS:Edit. Without it the `dns` stage is skipped, and the `*.workstation.co.uk` wildcard covers the host.
- SSH access to `root@195.20.255.201` (lon1) and `administrator@85.190.106.189` (lon2/pop0).

## What was tested

No real domain has been added with the script yet. All checks so far were read-only:

- A dry run for a made-up host produced a correct rule and server. The rule
  follows the repo's `hh-193-<app>-<port>` naming, the hostname is swapped
  inside the embedded config, and `pop_ids` is `lon1` + `pop0`.
- It refuses a LAN backend like `192.168.1.177:8095` and explains why the
  PoPs can't reach it. It also refuses a port that isn't forwarded (`18099`).
- It refuses to overwrite a domain that already exists, such as promptpilot.
- Re-running it on promptpilot reused lon1's existing rule id, and the HTTPS
  check passed.

## dev.workstation.co.uk (2026-10-10)

The first host repointed with `--update`. It used to go to
`187.77.179.206:8808` (the decommissioned acc host) and was down. Now it goes to
`https://193.237.176.232:17681`, forwarded to `https://192.168.1.177:7681`, with
`proxy_server_name: 192.168.1.177:7681`. Rule `dc1abb51-…` is renamed
`hh-193-dev-17681`. It returned 200 with a trusted certificate on lon1 and was
copied to lon2.

### Apps that check Origin (sshweb on dev.workstation)

Browser apps with CSRF or WebSocket origin checks reject requests from the
public hostname until the app knows that hostname. sshweb answered
`cross-origin request rejected` (API) and `403 origin not allowed`
(WebSocket). Fix it in the app, not at the proxy:

- Add `https://<fqdn>` to the app's origin allow-list. For sshweb that is
  `server.allowed_origins` in `~/.sshweb/config.yaml`, which also allows
  `Host: <fqdn>`. Then restart the app. It reads config only at startup.
- Don't overwrite the `Origin` header in wslproxy. The app would then also
  accept requests started by other websites (cross-site WebSocket hijacking,
  which is serious for a terminal).
- If the app uses the client IP for rate limiting or lockouts, add lon1
  (`195.20.255.201`) and lon2 (`85.190.106.189`) to its trusted proxies. Until
  the gateway's main location sends `X-Forwarded-For`, it only sends
  `X-Real-IP`, so every proxied user still looks like lon1 to the app.

## Fixes for problems hit with promptpilot

- Cloudflare in front of cp.pop0.uk blocks Python's default User-Agent
  (`error code: 1010`). The script sends its own User-Agent.
- lon1's server `config` is base64-encoded twice. The script detects how many
  layers there are.
- `scp`/sftp is disabled on lon1. Files are streamed over `ssh` + `tar`.
- `POST /api/servers` / `/api/rules` on CP create new ids. The script uses
  `/api/projects/import` so CP and lon1 keep the same ids.

## Still open from the promptpilot setup (2026-10-10)

- PRs [#1318](https://github.com/bwalia/wslproxy/pull/1318) and
  [#1319](https://github.com/bwalia/wslproxy/pull/1319) (CP → git sync) need approval.
- The explicit Cloudflare CNAME for promptpilot needs a token in
  `~/.config/cloudflare/token`. Once it's there, run:
  `add_domain.py --host promptpilot.workstation.co.uk --steps dns`
  This creates the record as a copy of dockpilot's.

## Rollback

See the Gotchas section of the skill. In short:

1. On lon1, delete `servers/prod/host:<fqdn>.json` and the rule file, then run `systemctl reload openresty`.
2. Delete the server and rule on CP, then re-run the CP → git sync.
3. Nothing is needed on lon2. It follows lon1.
