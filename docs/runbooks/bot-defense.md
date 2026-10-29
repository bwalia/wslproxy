# Runbook: Bot Defense

Reference: `docs/bot-defense.md`. Code: `api/bot_defense/`.

## Kill switches, fastest first

| Scope | How | Takes effect |
|---|---|---|
| One server | Admin UI → **Bot Management** → Overview → the server's mode → **off** (or its WAF tab), or set `"bot_defense": {"mode": "off"}` | Next request |
| One server, stop acting | Mode **monitor** (scores and forwards, never blocks) | Next request |
| One path | Add it to `skip_paths` | Next request |

pop0 mirrors lon1's server JSON every 5 minutes (`infra/edge-sync/`), so make
server changes on lon1. App-owned servers carry `bot_defense` in the app
repo's server JSON (CLAUDE.md gotcha 16), or the next import drops it.

## First rollout of the code

1. **Deploy `nginx` mode** to each edge. It adds `lua_shared_dict
   wsl_bot_defense` and the init/log hooks, and needs a restart. Then deploy
   `code` (`api/bot_defense/`).
   - Nothing changes for any host until a server sets `bot_defense`.
   - Responses for unprotected hosts were verified byte-identical to `main`.
2. **Same key on every edge.** By default the HMAC key is derived from
   `env_vars.JWT_SECURITY_PASSPHRASE`, which is shared per environment. If
   you set `settings.bot_defense.secret` instead, set the same value in every
   edge's SOPS settings (`infra/secrets/<env>/settings.sops.json`).
   Otherwise a visitor moving between lon1 and pop0 is challenged again.
3. **Optional: data-centre ranges.**
   1. Run `scripts/bot-defense-datacenter-ranges.sh >
      data/bot_defense/datacenter.cidr`.
   2. Set `"datacenter_file": "data/bot_defense/datacenter.cidr"` in
      `settings.bot_defense`.
   3. It is picked up within 30 seconds. Refresh it monthly.

Settings changed in **Bot Management → Settings & signals** are written to
`data/bot_defense/settings.json` on that edge only. Make the same change on
lon1 and pop0.

## Turning it on for a host

1. **`monitor` for a few days.** Watch **Bot Management → Events**,
   `wslproxy_bot_requests_total{class="suspect"|"bot"}` and the `botdef`
   lines. Every decision is visible; nothing is acted on.
   **Simulator** answers "would this client be blocked?" before you switch.
2. **Review false positives:**

   ```sh
   grep 'botdef {' /var/log/nginx/error.log | grep '"host":"<host>"' | tail -50
   ```

   Look for real users among `suspect`. The usual causes:
   - an API client or webhook → `skip_paths`
   - a monitoring probe → `skip_paths`
   - a corporate proxy stripping `Accept-Language` → lower that signal's
     weight in `settings.bot_defense.weights`
3. **`challenge`**: suspects get the browser check, and bots are blocked.
   - Put checkout, sign-up and gift-card pages in `challenge_paths`.
   - Put login endpoints in `login_paths`.
   - Put ad beacons and analytics in `monitor_paths`.
4. **`block`** only for hosts with no anonymous browser traffic.

API-only hosts: use `monitor` and let the app read `X-WSL-Bot-*`. A script
cannot run the browser check, so `challenge` would block legitimate
integrations.

## Watching it

```sh
curl -s http://127.0.0.1:8099/metrics | grep wslproxy_bot_
```

| Signal | Meaning | Action |
|---|---|---|
| `requests_total{class="human",action="challenge"}` rising | Humans on `challenge_paths`: expected. Elsewhere it is impossible. | — |
| `challenges_total{result="passed"}` ≪ challenges served | People are failing the check. | Check `result` labels. `rebound`: users switching networks mid-check (mobile) — consider `ip_binding: "none"`. `expired`: raise `challenge_ttl_s`. |
| `challenges_total{result="webdriver"}` or `{result="replay"}` | Automation trying the check. | Expected under attack. |
| `crawler_checks_total{result="unknown"}` high | DNS from the edge is failing. | Check `dns_nameservers` / `/etc/resolv.conf`. Claimed crawlers are scored as declared bots meanwhile, never as fake. |
| `errors_total` | An internal error, failed open. | Read the `[bot_defense]` ERR line and open an issue. |

## A user says they are blocked

1. Ask for the **Support ID** on the block or challenge page.
2. Find its decision: **Bot Management → Events**, filtered by host (last 500
   on that edge), or the log line:

   ```sh
   grep '<support id>' /var/log/nginx/error.log
   ```

   It has the class, score and signals.
3. Fix the cause: a path that needs `skip_paths`, a signal weight, or a
   limit for that host.

## Verifying a change

```sh
lua test/bot_defense/test_bot_defense.lua          # unit (plain Lua / LuaJIT)
test/bot_defense/integration/run.sh                # real OpenResty, 2 workers
python3 examples/wslproxy-bot-demo/test_bot_live.py   # live demo hosts
```
