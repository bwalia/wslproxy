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

After it finishes, dispatch `Sync POP config from CP (Go → data/ → PR)` for
`lon1`, then for `pop0`. The script prints the commands. Each run opens a PR
that needs an approving review. Don't bypass branch protection.

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
