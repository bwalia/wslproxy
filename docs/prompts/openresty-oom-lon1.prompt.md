# Prompt: stop OpenResty running out of memory on the edges (GitOps fix)

Use this in the **wslproxy** repo. Goal: lon1 and lon2 never OOM again,
every nginx / OpenResty setting on the edges comes from this repo's templates
(no hand edits), and Lua memory growth per worker is found and fixed. All
changes go through git → PR → the normal deploy path, not SSH edits.

Read `CLAUDE.md` first (storage layer, "pop0 mirrors lon1", gotchas 16, 22, 26),
`infra/ansible/roles/wslproxy/templates/nginx.conf.j2`, `infra/ansible/`
deploy playbooks, `infra/edge-sync/`, `api/init.lua`, the
`init_worker_by_lua_block` in the template, and every module that keeps
module-level tables (`cache_manager.lua`, `gateway_pipeline.lua`,
`bot_defense/`, `traffic_router.lua`, `metrics*`, `dns_access.lua`,
IP2Location loading).

**Safety:** read-only on lon1 / lon2 unless the owner approves. Never restart
`systemd-networkd` or run `netplan apply` on an edge (two outages on
2026-11-22, see `diy-tax-return-infra/ansible/lon1-hardening.yml`). Never
reload or restart both edges together. Check that the other edge's `/healthz`
returns 200 before touching one. Never print secrets or `settings.json`.

## What happened (2026-11-25, 15:56:10 UTC)

lon1 (`lon1.pop0.uk`, 195.20.255.201, 4 vCPU, **4 GB RAM, no swap at the
time**) had OpenResty **OOM-killed**. systemd had `Restart=no`, so the front
door for ~440 server rows was down for **~10 min** until it was started by hand.

From the kernel OOM report and the unit:

- Three reloads in 20 min (15:34, 15:36, 15:54). **Three generations of
  workers were alive at once (11 workers)**, because there's no
  `worker_shutdown_timeout`, so old workers wait for every long-lived
  connection to close.
- Each worker held **~300–360 MB of anon (Lua heap)** plus ~230 MB of
  shared memory. Fresh workers start at **~20 MB anon**. The oldest
  generation had lived ~3 days since the 22 Nov 12:15 reload, so the
  growth is roughly **100 MB per worker per day**, which looks like a leak or
  unbounded caching in Lua.
- The Next.js dashboard (`next-server`) used another ~450 MB.
- **`worker_processes` was changed by hand from 1 to 4** on lon1 at
  2026-11-22 08:53 UTC (backup on the box:
  `/usr/local/openresty/nginx/conf/nginx.conf.bak-20261122-workers`, via an
  SSH login from 193.237.176.232). That multiplied per-worker Lua memory by 4.
  The template `infra/ansible/roles/wslproxy/templates/nginx.conf.j2` still
  says `worker_processes 1`, so the next config deploy would quietly
  revert lon1 to 1 worker. **lon2 (pop0) also runs 4 workers.** Other
  copies disagree too: `nginx.conf` and `custom/conf.d/nginx.conf` say 5,
  and the ingress-controller copies say `auto`.

Safety nets already applied from `diy-tax-return-infra` (`ansible/lon1-hardening.yml`)
on lon1 and lon2. Keep them, and don't duplicate them here unless you move
ownership on purpose:
- `/etc/systemd/system/openresty.service.d/restart.conf`: `Restart=on-failure`,
  `RestartSec=5`, `StartLimitBurst=5` / 300 s
- 2 GB `/swapfile`, `vm.swappiness=10`

### Live config snapshot on lon1 (re-check before acting)

- OpenResty 1.29.2.1, `worker_processes 4`, `worker_connections 1024`, no
  `worker_rlimit_nofile` (systemd `LimitNOFILE=1048576`), no
  `worker_shutdown_timeout`, `keepalive_timeout 65`, `http2 on`.
- `lua_shared_dict` total ≈ **426 MB**: `prometheus_metrics 150M`,
  `auto_ssl 100M`, `wsl_cache 100M`, `wsl_api_gw 20M`, `wsl_bot_defense 20M`,
  `waf_events 10M`, `wsl_cache_keys 10M`, plus small ones. Also
  `ssl_session_cache shared:SSL:50m` and `docker_blobs_cache` keys_zone 20m
  (`max_size=10g`).
- `client_body_buffer_size 10m` on two registry locations: each concurrent
  upload can buffer up to 10 MB in RAM.
- IP2Location DB11 IPv6 BIN is **167 MB**. Find out whether each worker loads
  it into its own heap (×4) or memory-maps it.
- About 100 established client connections at the time of the snapshot.

## Tasks

1. **One source of truth for nginx.conf.** Make the deployed template
   (`infra/ansible/roles/wslproxy/templates/nginx.conf.j2`) produce exactly
   what lon1 / lon2 should run. Diff the template's render against the live
   files on both edges (read-only), list every difference, and bring each
   intended live change into the template. Delete or clearly mark the stale
   copies (`nginx.conf`, `custom/conf.d/nginx.conf`) so nobody edits the wrong
   file. Add a CI check that fails if the rendered template differs from a
   committed expected render for prod.
2. **Per-edge sizing as variables, not hand edits:** `worker_processes`
   (`auto`, or an explicit count per host), `worker_connections` (suggest
   4096) with `worker_rlimit_nofile` (e.g. 65535), **`worker_shutdown_timeout 60s`**
   (or another agreed value; long-lived WebSocket / registry streams get cut
   after it, so document that), and shared dict sizes in group_vars per edge.
   With 4 GB RAM, budget memory explicitly:
   `workers × (expected Lua heap) + 2 × generations during reload + shared dicts + dashboard + OS` < ~3.2 GB.
   Write that budget into the runbook.
3. **Find the Lua memory growth (root cause).** Reproduce locally
   (`test/bot_defense/integration/run.sh` style, real OpenResty, 2+ workers)
   by replaying realistic traffic across many hosts, and track
   `collectgarbage("count")` per worker over time. Add a small admin endpoint
   or metric: per-worker Lua heap KB, exported to Prometheus, plus RSS from
   `/proc/self/status`. Look for module-level tables keyed by host, IP, path,
   user agent or request id with no bound or TTL (bot-defense behaviour
   state, router state, api_gw state, DNS / Consul lookups, compiled regex or
   config caches, per-host config caches reloaded per request, metrics label
   sets with high-cardinality labels like path or IP). Fix with bounded LRU
   (`resty.lrucache` with a max item count) or shared dicts with TTLs.
   Prove the fix with a before/after heap graph.
4. **Check the shared-dict sizes.** Is `prometheus_metrics 150M` justified,
   or are high-cardinality labels filling it? Is `auto_ssl 100M` needed for
   ~440 hosts? Right-size them with evidence (`ngx.shared.DICT:free_space()` /
   capacity, exposed as metrics).
5. **Reload hygiene:** find what triggers lon1 reloads (16 between 22 and 25 Nov,
   3 in 20 min before the OOM): edge-sync, imports, cert issuance, config
   pushes. Debounce or coalesce them (at most one reload per N minutes)
   unless an operator forces one. lon2 (pop0) reloads up to every 5 min via
   `wslproxy-edge-sync`. Check that only real changes trigger it.
6. **Alerting:** alerts for an edge's OpenResty not active, worker RSS or
   Lua heap above a threshold, swap in use above ~200 MB, more than one
   worker generation alive for more than `worker_shutdown_timeout` + 1 min, and
   `/healthz` failing on either edge.
7. **Roll out via GitOps:** PR → CI → deploy with the normal playbook to
   **lon2 first**, watch heap and RSS for 24 h, then lon1. Use `openresty -t`
   before each reload. One edge at a time, and confirm the other edge's
   healthz first. Remove the hand-made `nginx.conf.bak-*` files on the edges
   only after the template-rendered config is live and verified.

## Deliverables

- PR(s): template as single source of truth, per-edge sizing vars,
  `worker_shutdown_timeout`, Lua memory fix(es) with tests, heap / RSS /
  shared-dict metrics, reload debounce, alerts.
- `docs/runbooks/edge-memory.md`: memory budget per edge, how to read the
  heap metrics, what to do on OOM (Restart=on-failure brings it back in 5 s;
  check generations with `ps -o pid,etimes,rss,cmd -C nginx`).
- A `CLAUDE.md` gotcha: "never hand-edit nginx.conf on an edge; worker
  count and dict sizes are per-edge vars", plus the 2026-11-25 OOM summary.

## Verification

- Rendered template == live `nginx.conf` on both edges (diff empty), and
  `worker_processes` is what the vars say.
- After a reload, old workers are gone within `worker_shutdown_timeout`
  (`ps -o pid,etimes,cmd -C nginx`).
- Per-worker Lua heap stays flat (±10%) over 24 h of production traffic on
  lon2, then on lon1.
- `curl -sk -o /dev/null -w '%{http_code}' https://lon1.pop0.uk/healthz` and
  the lon2 equivalent return 200 throughout. Spot-check `www.diytaxreturn.co.uk`
  (200) and `www.workstation.co.uk` (307).
