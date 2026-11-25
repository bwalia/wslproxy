# Runbook: edge memory (lon1, lon2 / pop0)

What keeps OpenResty on the edges inside their RAM, how to read the memory
metrics, what to do when an edge is OOM-killed, and how to roll out a sizing
change. Background: the 2026-11-25 lon1 OOM (below).

| Edge | Host | RAM | Swap | vCPU | Workers |
|---|---|---|---|---|---|
| lon1 | `lon1.pop0.uk`, 195.20.255.201 (ssh `root`) | 4 GB (3873 MiB) | 2 GB file | 4 | 4 |
| lon2 / pop0 | `lon2.pop0.uk`, 85.190.106.189 (ssh `administrator`, sudo) | 8 GB (7936 MiB) | 2 GB file | 4 | 4 |

The swapfile and `Restart=on-failure` (`openresty.service.d/restart.conf`)
come from `diy-tax-return-infra/ansible/lon1-hardening.yml`, not this repo.

## Rules

- **Never hand-edit `/usr/local/openresty/nginx/conf/nginx.conf` on an edge.**
  It is rendered from `infra/ansible/roles/wslproxy/templates/nginx.conf.j2`
  (`roles/wslproxy/tasks/finalize.yml`). Sizing lives in role defaults
  (`roles/wslproxy/defaults/main.yml`) and per edge in
  `infra/ansible/host_vars/<edge>/vars.yaml`. The expected result for each edge
  is committed in `infra/ansible/rendered/<pop>.nginx.conf`, and CI
  (`edge-config-check.yml`) fails if the template and that file disagree.
- **Reload with `wslproxy-reload`, not `systemctl reload openresty`.** It runs
  `openresty -t`, then reloads at most once per 180 s; a sooner request is
  applied by `wslproxy-reload-pending.timer` once the interval passes.
  `wslproxy-reload --force` reloads now (still after `openresty -t`).
- **One edge at a time.** Check the other edge's `/healthz` returns 200 first.
- Never restart `systemd-networkd` or run `netplan apply` on an edge.

## Sizing variables

| Variable | Default | Renders as | Notes |
|---|---|---|---|
| `nginx_worker_processes` | 4 | `worker_processes` | One per vCPU. Each worker has its own Lua heap. |
| `nginx_worker_connections` | 4096 | `worker_connections` | Was 1024. |
| `nginx_worker_rlimit_nofile` | 65535 | `worker_rlimit_nofile` | ≥ 2 × connections (client + upstream fd). |
| `nginx_worker_shutdown_timeout` | 60s | `worker_shutdown_timeout` | See below. `""` = unset (old behaviour). |
| `nginx_shm_prometheus_metrics` | 150M | `lua_shared_dict prometheus_metrics` | |
| `nginx_shm_auto_ssl` | 100m | `lua_shared_dict auto_ssl` | |
| `nginx_shm_wsl_cache` | 100m | `lua_shared_dict wsl_cache` | |
| `nginx_shm_wsl_cache_keys` | 10m | `lua_shared_dict wsl_cache_keys` | |
| `nginx_shm_wsl_api_gw` | 20m | `lua_shared_dict wsl_api_gw` | |
| `nginx_shm_wsl_bot_defense` | 20m | `lua_shared_dict wsl_bot_defense` | |
| `nginx_shm_waf_events` | 10m | `lua_shared_dict waf_events` | |
| `nginx_ssl_session_cache_size` | 50m | `ssl_session_cache shared:SSL:` | |
| `wslproxy_reload_min_interval` | 180 | `/etc/default/wslproxy-reload` | Keep above the shutdown timeout. |

The defaults are what both edges ran on 2026-11-25, except the deliberate
additions (connections, rlimit, shutdown timeout). To change one:

```sh
$EDITOR infra/ansible/host_vars/lon1.pop0.uk/vars.yaml   # e.g. nginx_worker_processes: 3
scripts/check-edge-nginx-render.sh --update             # rewrites infra/ansible/rendered/
git diff infra/ansible/rendered/                        # exactly what the edge will run
```

### `worker_shutdown_timeout` and long-lived connections

After a reload the old workers stop accepting and finish what they have. With
no timeout they wait for **every** connection to close, including idle
keepalives, WebSockets and long `docker push` / `pull` streams through the
registry vhosts. That is how three reloads in 20 min left three generations
(11 workers) alive on lon1.

With `60s`, connections still open 60 s after a reload are closed: a WebSocket
that straddles a reload is cut and its client must reconnect, and a registry
blob upload or download that takes longer than 60 s from the reload will fail
and be retried by the docker client. If a tenant depends on streams longer than
that surviving reloads, raise it for that edge (e.g. `300s`) and re-check the
memory budget, since each extra second keeps a second generation alive.

## Memory budget

The rule: `workers × per-worker private memory × 2 generations (during a
reload) + shared memory + dashboard + OS` must stay under about **3.2 GB** on
lon1 (4 GB, leaving page cache and headroom). lon2 has 8 GB and the same
config, so lon1 is the binding case.

| Item | lon1 budget | Evidence (2026-11-25) |
|---|---|---|
| OS, journald, sshd, dockerd, sockproc | 350 MB | `ps`: journald 56 MB, dockerd 40 MB on lon1 |
| Next.js dashboard (`next-server`) | 450 MB | 194 MB now; ~450 MB in the OOM report |
| Shared memory: lua_shared_dicts (~426 MB) + SSL session cache 50 MB + docker_blobs keys_zone 20 MB | 500 MB (ceiling; only touched pages are resident) | sizes from the live nginx.conf |
| Workers: 4 × 200 MB private | 800 MB | fresh workers 20–30 MB anon; lon1 workers 56–70 MB anon at 26 min |
| Second generation during a reload (≤ 60 s): 4 × 200 MB | 800 MB | `worker_shutdown_timeout 60s` |
| **Total** | **2.9 GB** | below 3.2 GB |
| IP2Location BIN (167 MB) | page cache, reclaimable | opened per worker and read with seek+read: not in the Lua heap (×4 is not a concern) |

So **200 MiB private memory per worker** is the line. The alerts in
`monitoring/grafana/alerts/prometheus-rules.yml` (group `wslproxy-edge-memory`)
warn at 150 MiB Lua heap and page at 250 MiB `RssAnon`. Before the fix, lon1's
workers reached 300–360 MB anon after 3 days, and 3 generations × 4 workers did
not fit.

Each concurrent upload on the two registry locations can also hold
`client_body_buffer_size 10m` in RAM; 20 parallel pushes are another 200 MB.

## Reading the memory metrics

From `api/memory_metrics.lua`, every 15 s, on the admin `/metrics` endpoint
(port 7691 on the edges, allow-listed IPs only):

| Metric | Meaning |
|---|---|
| `wslproxy_worker_lua_heap_bytes{worker}` | `collectgarbage("count")` of that worker. Includes garbage not yet collected, so it saw-tooths; watch the troughs. |
| `wslproxy_worker_rss_anon_bytes{worker}` | Private resident memory (Lua heap + C allocations). The number the budget is about. |
| `wslproxy_worker_rss_bytes{worker}` | VmRSS. Also counts shared-dict pages the worker touched, so it is higher and over-counts across workers. |
| `wslproxy_shdict_capacity_bytes{dict}` / `wslproxy_shdict_free_bytes{dict}` | Size and free pages of each `lua_shared_dict`. A dict with no free pages evicts LRU entries; it does not error. |
| `wslproxy_nginx_workers_shutting_down` | Old-generation workers still draining. Should be 0 except for ≤ 60 s after a reload. |
| `wslproxy_host_swap_used_bytes`, `wslproxy_host_mem_available_bytes` | Host memory. |

PromQL to start with:

```promql
max by (instance, worker) (wslproxy_worker_rss_anon_bytes) / 2^20      # MiB per worker
deriv(min_over_time(wslproxy_worker_lua_heap_bytes[30m])[6h:5m]) * 86400 / 2^20   # heap growth MiB/day
1 - wslproxy_shdict_free_bytes / wslproxy_shdict_capacity_bytes         # dict fill
```

Heap growth that does not level off is a leak. The usual cause is a
Prometheus label taken from the request: nginx-lua-prometheus keeps every
series it has seen in a per-worker table (`metric.lookup`, plus a key index
of every key in the dict) and never prunes them, and the
`prometheus_metrics` dict survives reloads, so every new worker loads them
all again. Only a restart (not a reload) empties it.

## The 2026-11-25 lon1 OOM, and what was found

- 15:34, 15:36, 15:54: three reloads, each a few seconds after a root ssh
  login from 193.237.176.232. No `worker_shutdown_timeout`, so three worker
  generations (11 workers) were alive. 15:56:10: OOM kill; `Restart=no` at the
  time, so about 10 min down. lon1 reloaded 17 times between 22 and 25 Nov;
  lon2 about 145 times, all from `wslproxy-edge-sync` on real `servers/`
  changes (rsync `--checksum`, so not false positives).
- `worker_processes` was hand-edited 1 → 4 on 2026-11-22 08:53 on both edges,
  but the template had already been changed to `nginx_worker_processes: 4`
  (commit 5e8b2c20, 08:27 the same day). A render of the template matched both
  live files except for three comment lines. The stale first-line comment
  (`roles/luarocks/templates/nginx.conf.j2`, which never existed) is fixed.
- Per-worker Lua growth, found by auditing `api/` and checked against live
  series counts (`/metrics` on each edge, read-only):
  1. `nginx_http_requests_by_ip_total{ip,host}` (`log_handler.lua`): one
     series per client IP × host, unbounded. lon2: 21.5k of 117k series after
     8.6 days, 19.4k distinct IPs; lon1: 1.7k after 30 min. **Removed**, along
     with the never-used `nginx_http_rate_limited_total{host,ip}`.
  2. `host` label was the raw `Host` header on catch-all server blocks
     (scanners send random ones), and `method` was client-controlled; both go
     into three histograms (21 series per label set). Now the configured
     server name (`ngx.ctx.metric_host`, set in `gateway_ack.lua`) or the
     server block's `server_name`, else `_unmatched`; methods outside the usual
     seven become `OTHER`.
  3. `upstream` label was `$upstream_addr`: resolved IPs (S3 / CDN rotate)
     and retry lists. Now the configured backend label / redirect URI.
  4. `rule_matcher.lua` built an `IP2location` reader (open file + ~60-field
     table) on every country-rule evaluation and never closed it. Now one per
     worker.
  5. `ip_cidr.lua`'s parse cache was filled by the bot-defense datacenter list
     loader (up to 500k lines, every list version kept). The loader now
     bypasses the cache.
  Ruled out: module-level config caches (none; server / rule JSON is
  re-read per request), WAF policy cache (keyed by config ids), bot defense
  `log_marks` (reset at 1000), globals (init-time only), timers (init-time
  only), IP2Location BIN (file reads, not heap).
- On the first start of the new code, worker 0 deletes the series of the
  removed metric and of the old upstream-IP labels from the shared dict, once
  per dict lifetime (`prometheus_metrics.purge_legacy_series`). The
  remaining host-label junk from before goes at the next restart.

Reproduce locally (Docker, no edge involved): `test/memory/heap/run.sh`
replays edge-like traffic through the real `log_handler.lua` and
`prometheus_metrics.lua` with 2 workers and prints each worker's Lua heap
after a full GC (see "Heap harness results" below).

## When an edge was OOM-killed

1. It should already be back: `Restart=on-failure` restarts it after 5 s.
   Check the other edge first, then this one:
   ```sh
   curl -sk -o /dev/null -w '%{http_code}\n' https://lon2.pop0.uk/healthz
   curl -sk -o /dev/null -w '%{http_code}\n' https://lon1.pop0.uk/healthz
   systemctl is-active openresty
   ```
2. Confirm it was memory: `journalctl -u openresty --since -1h | grep -i oom`,
   `journalctl -k --since -1h | grep -i 'killed process'`.
3. Count generations and sizes (old generations show `is shutting down`):
   ```sh
   ps -o pid,ppid,etimes,rss,cmd -C nginx
   for p in $(pgrep -f 'nginx: worker'); do grep -E '^(RssAnon|RssShmem)' /proc/$p/status | tr '\n' ' '; echo; done
   ```
4. How many reloads, and who issued them:
   `journalctl -u openresty --since -2h | grep -c Reloaded`, then
   `journalctl --since <time-5s> --until <time+5s>` around each one (ssh
   logins, `wslproxy-edge-sync`, `wslproxy-reload` lines).
5. Look at the heap graph per worker before reloading anything. If one edge
   must shed memory, do a single `wslproxy-reload --force` on that edge only,
   after step 1's check of the other edge. A restart (not a reload) also
   empties the Prometheus dict; it drops that edge's connections, so only with
   the other edge healthy.

## Is the edge running the template?

Read-only check from a checkout:

```sh
scripts/check-edge-nginx-render.sh                     # template == committed renders
ssh root@195.20.255.201 cat /usr/local/openresty/nginx/conf/nginx.conf > /tmp/lon1.live.conf
diff infra/ansible/rendered/lon1.nginx.conf /tmp/lon1.live.conf
# lon2: ssh administrator@85.190.106.189 'cat /usr/local/openresty/nginx/conf/nginx.conf'
#       diff against infra/ansible/rendered/pop0.nginx.conf
```

The only expected difference is the `Server: wslproxy/<version>` line (the
renders pin the version empty; a CI deploy passes the git tag). On
2026-11-25 both live files showed `Server: wslproxy/` with no version, so the
deploy that wrote them passed an empty `WSLPROXY_VERSION`.

## Rollout plan (needs owner approval; nothing in this PR is deployed)

Order: **lon2 first, 24 h watch, then lon1.** Never both at once.

0. Merge the PR after review; CI `edge-config-check` green.
1. **lon2, preparation.** `curl https://lon1.pop0.uk/healthz` → 200. Note
   lon2's current `ps -o pid,etimes,rss,cmd -C nginx` and `free -m`.
2. **lon2, deploy** through the normal path: delivery pipeline / 
   `deploy-environment.yml` with `TARGET_HOST=85.190.106.189`, mode `nginx`
   (the template, `reload_guard.yml`, the IP2Location script) and `code`
   (`api/`). Install the new `infra/edge-sync/wslproxy-edge-sync` on lon2
   (`/usr/local/sbin/`, as in `infra/edge-sync/README.md`).
   The role's handler restarts OpenResty after the playbook's own
   `openresty -t`; if doing it by hand: `openresty -t && wslproxy-reload --force`.
3. **lon2, verify:**
   - `diff` live vs `infra/ansible/rendered/pop0.nginx.conf` (only the Server line)
   - `grep -E 'worker_(processes|connections|shutdown_timeout|rlimit)' /usr/local/openresty/nginx/conf/nginx.conf`
   - after one reload, `ps -o pid,etimes,cmd -C nginx` shows no
     `shutting down` worker after 60 s
   - `curl -s http://127.0.0.1:7691/metrics | grep -E '^wslproxy_(worker|shdict|host|nginx)'`
   - `systemctl list-timers wslproxy-reload-pending.timer`, `journalctl -t wslproxy-reload`
   - `https://lon2.pop0.uk/healthz` 200, `www.diytaxreturn.co.uk` 200,
     `www.workstation.co.uk` 307 via lon2
4. **Watch 24 h:** per-worker `wslproxy_worker_rss_anon_bytes` and the heap
   troughs stay flat (±10%); series count in `/metrics` levels off.
5. **lon1:** repeat 1–4 with the roles swapped (`curl https://lon2.pop0.uk/healthz`
   first; `TARGET_HOST=lon1.pop0.uk`; diff against `rendered/lon1.nginx.conf`).
   Remember gotcha 22: lon1 is exempt from repo data pushes.
6. Only after both edges run the rendered config and it is verified: remove
   the hand-made `nginx.conf.bak-*` files in `/usr/local/openresty/nginx/conf/`
   on each edge (`bak-20261122-workers`, `bak.botdefense.*`, `bak.xff.*`).

Rollback: redeploy the previous commit through the same path, one edge at a
time; or on the box, the previous rendered file is in git
(`git show <old>:infra/ansible/rendered/<pop>.nginx.conf`), then
`openresty -t && wslproxy-reload --force`.

## Shared-dict sizing (recommendation)

No defaults were changed. Evidence so far:

- `prometheus_metrics 150M`: on lon2, 117k series in 8.6 days produced a
  11.6 MB text scrape; the dict holds roughly the same keys plus values, so it
  is far from full, and most of those series were the unbounded labels this
  PR removes. Expect a large drop after the next restart. **Recommendation:**
  after 7 days on the new code read `wslproxy_shdict_free_bytes{dict="prometheus_metrics"}`;
  if under 30% is used, set `nginx_shm_prometheus_metrics: 64M` per edge.
- `auto_ssl 100m`: ~440 hosts × (cert + key + chain ≈ 6–8 KB) ≈ 3–4 MB.
  **Recommendation:** after the free-space metric confirms it, `32m` is ample.
  (Shared pages that were never touched cost no RAM, so this is headroom more
  than a saving.)
- `wsl_cache 100m`: content cache; keep, it is sized for content.
- Read the free-space metric for a week before shrinking any of them.

## Heap harness results

`test/memory/heap/run.sh`, run locally on 2026-11-25 (Docker image
`wslproxy-wslproxy:latest`, OpenResty 1.31.1.1 arm64, 2 workers, the
nginx-lua-prometheus copy from the prod image `bwalia/wslproxy-openresty:1.29.2.1`
via `PROM_LIB_DIR`, a 64 MB `prometheus_metrics` dict). Traffic: 440 configured
hosts (70%), scanners with random Host headers (30%), random client IPs, 3%
junk methods. Heap is `collectgarbage("count")` after a full GC, per worker.
"Before" is `api/` at the base commit (`API_DIR=...`), "after" is this branch.

| Requests | Before: dict keys | Before: heap w0 / w1 (MB) | After: dict keys | After: heap w0 / w1 (MB) |
|---:|---:|---:|---:|---:|
| 0 | 10 | 0 / 0 | 35 | 0 / 0 |
| 20,000 | 196,132 | 87 / 95 | 37,451 | 36 / 37 |
| 40,000 | 260,579 | 132 / 141 | 41,959 | 43 / 44 |
| 60,000 | 260,579 | 164 / 173 | 43,500 | 48 / 46 |
| 80,000 | 260,579 | 180 / 189 | 44,218 | 49 / 47 |
| 100,000 | 260,579 | 205 / 214 | 44,656 | 50 / 50 |
| 120,000 | 260,579 | 222 / 231 | 44,988 | 51 / 51 |
| 140,000 | 260,579 | 242 / 250 | 45,460 | 51 / 51 |
| 160,000 | 260,579 | 257 / 266 | 45,753 | 51 / 51 |
| 180,000 | 260,579 | 272 / 282 | 46,017 | 51 / 51 |
| 200,000 | 260,579 | 291 / 301 | 46,267 | 52 / 52 |

Before, the heap grows linearly with traffic and does not stop (about 300 MB
per worker after 200k requests, the size the lon1 workers had when they were
OOM-killed); the dict fills at 260k keys and the per-worker tables keep
growing anyway. After, the series count levels off at the bounded label space
(hosts × methods × endpoints × histogram buckets) and the heap flattens at
about 52 MB per worker. This is a synthetic replay, not production traffic:
the 24 h production check in the rollout plan is still the real test.

The remaining ~46k series are mostly the three per-host histograms (21 series
per label set). If per-worker memory needs to come down further, fewer
histogram buckets or dropping `method` from `nginx_http_request_duration_seconds`
are the next levers.
