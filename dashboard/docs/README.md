# WSL Proxy — Grafana Dashboards

Production-grade Grafana dashboards + Prometheus rules for monitoring **WSL Proxy**.
Built **only** from metrics that actually exist on
`https://prod-our.wslproxy.com/metrics` (OpenResty `lua-prometheus`). No metric
names are invented — see [`METRICS_INVENTORY.md`](./METRICS_INVENTORY.md).

- **Dashboard 1:** `WSL Proxy - Backend Health` (uid `wslproxy-backend-health`)
  — 91 panels across 16 rows + info header · 8 template variables · 2 annotations
- **Dashboard 2:** `WSL Proxy - Cache` (uid `wslproxy-cache`)
  — static-content cache hit ratio, per-host/-extension breakdown, bypass reasons,
  stores by content-type · 6 template variables · 1 annotation
- **Dashboard 3:** `WSL Proxy - SRE (10 Layers)` (uid `wslproxy-sre-10layer`)
  — top-down SRE view in 10 layers: SLO + error-budget burn, the four golden signals
  (traffic/errors/latency/saturation), then edge → routing → backend → cache → security.
  A single at-a-glance "is the service healthy, and if not, which layer?" board.
- **Dashboard 4:** `WSL Proxy - Domain Deep-Dive` (uid `wslproxy-domain`)
  — developer view: pick one **Host** and see its whole story (traffic, errors, latency
  percentiles, top/slowest endpoints, cache, top client IPs) on one page. Backend/rule
  attribution isn't host-labelled in metrics, so that's a pointer to Backend Health + admin UI.
- Colour convention: 🟢 healthy · 🟡 warning · 🔴 critical · ⚪ unknown
- Cache hit-ratio convention: 🔴 <50% · 🟡 50–80% · 🟢 ≥80%
- SLO for the SRE dashboard's error-budget math: **99.9%** (edit `SLO` in `build_sre_dashboard.py`)

## Folder structure
```
dashboard/
├── docs/
│   ├── README.md              ← this file (build/structure/provisioning)
│   ├── DASHBOARD_GUIDE.md     ← reader's guide: what each dashboard is for + troubleshooting
│   ├── METRICS_INVENTORY.md   ← every real metric, categorised
│   ├── PANELS.md              ← every panel + its PromQL
│   └── VARIABLES.md           ← template variable definitions
├── grafana/
│   ├── dashboards/
│   │   ├── wsl-proxy-backend-health.json   ← backend-health dashboard
│   │   ├── wsl-proxy-cache.json            ← cache dashboard
│   │   ├── wsl-proxy-sre.json              ← 10-layer SRE dashboard
│   │   └── wsl-proxy-domain.json           ← per-domain deep-dive dashboard
│   └── provisioning/
│       ├── dashboards/wslproxy.yaml        ← dashboard provider (loads the whole folder)
│       └── datasources/prometheus.yaml     ← Prometheus datasource
├── prometheus/
│   ├── rules/
│   │   ├── recording-rules.yaml            ← pre-computed aggregations (backend)
│   │   ├── alert-rules.yaml                ← SRE alerts (backend, mirrors thresholds)
│   │   ├── cache-rules.yaml                ← cache recording + alert rules
│   │   └── sre-rules.yaml                  ← SLO error-budget burn + golden-signal alerts
│   └── scrape/scrape-config.yaml           ← scrape_config for the endpoint
└── scripts/
    ├── build_dashboard.py                  ← regenerates the backend-health JSON
    ├── build_cache_dashboard.py            ← regenerates the cache JSON
    ├── build_sre_dashboard.py              ← regenerates the 10-layer SRE JSON
    └── build_domain_dashboard.py           ← regenerates the domain deep-dive JSON
```

Both dashboards live in the same `grafana/dashboards/` folder, so the provisioning
provider picks up the cache dashboard automatically — no config change needed. Add
the cache rules alongside the others:
```yaml
rule_files:
  - /etc/prometheus/rules/recording-rules.yaml
  - /etc/prometheus/rules/alert-rules.yaml
  - /etc/prometheus/rules/cache-rules.yaml
  - /etc/prometheus/rules/sre-rules.yaml
```

**SLO error-budget alerts** (`sre-rules.yaml`) back the SRE dashboard. SLI = success
ratio `1 - 5xx/total`; SLO = 99.9% → budget 0.1%. Burn rate = `(5xx/total) / 0.001`.
Multi-window/multi-burn-rate alerts (Google SRE Workbook) fire only when a long AND a
short window both exceed the threshold: **14.4×** (page, 2% budget/1h), **6×** (page, 5%/6h),
**3×** (ticket, 10%/1d), **1×** (ticket, trending). Plus p95-latency, metric-emit-error,
and auth-failure/suspicious-surge alerts. The rules aggregate cluster-wide — add
`{env="prod"}` to the `nginx_http_*` selectors if you scrape multiple envs and want the
SLO to track prod only.

## Architecture
```
prod-our.wslproxy.com/metrics  ──scrape──▶  Prometheus  ──PromQL──▶  Grafana dashboard
   (OpenResty lua-prometheus)              (rules+alerts)          (this repo)
```
> Grafana needs a **Prometheus server** (PromQL API). Pointing Grafana at the raw
> `/metrics` text will not work — `rate()` / `histogram_quantile()` need a TSDB.

## Quick start

### 1. Scrape the endpoint
Merge `prometheus/scrape/scrape-config.yaml` into your `prometheus.yml` and load the
rules:
```yaml
rule_files:
  - /etc/prometheus/rules/recording-rules.yaml
  - /etc/prometheus/rules/alert-rules.yaml
```

### 2. Provision Grafana (recommended)
```yaml
# docker-compose snippet
grafana:
  image: grafana/grafana:latest
  volumes:
    - ./dashboard/grafana/provisioning:/etc/grafana/provisioning
    - ./dashboard/grafana/dashboards:/var/lib/grafana/dashboards/wslproxy
```
Set the datasource URL in `provisioning/datasources/prometheus.yaml` to your
Prometheus server, then restart Grafana. The dashboard appears in the **WSL Proxy** folder.

### 3. Or import manually
Grafana → Dashboards → Import → upload
`grafana/dashboards/wsl-proxy-backend-health.json` → select your Prometheus datasource.

## Regenerating the dashboard
The JSON is generated from a script so it stays consistent and valid:
```bash
cd dashboard
python3 scripts/build_dashboard.py   # rewrites grafana/dashboards/wsl-proxy-backend-health.json
```

## Thresholds (SRE)
| Signal | 🟢 | 🟡 | 🔴 |
|---|---|---|---|
| Error rate | 0–1% | 1–5% | >5% |
| Latency (p95) | <100 ms | 100–300 ms | >300 ms |
| Availability | 100% | ≥99% | <99% |

These map 1:1 to the alert rules in `prometheus/rules/alert-rules.yaml`.

## Honest gaps (no backing metric)
The OpenResty exporter does **not** emit Go-runtime, process, or Prometheus-internal
metrics. Rows 11 (Go Runtime), 13 (Prometheus Scrape) and 14 (Resource Usage) therefore
carry explanatory notes and use the closest real signal (connection state, `up`,
`scrape_duration_seconds`). This is intentional — see `METRICS_INVENTORY.md`.

## All environments (both dashboards)
- **Show all environments, not just one.** `prometheus/scrape/scrape-config.yaml` now
  defines one job per environment (int / test / prod-pop0, plus a commented prod-lon1),
  each tagging its series with an `env` label. Apply it to the Prometheus your Grafana
  datasource points at, then use the **Environment** variable on **either** dashboard —
  leave it on **All** to aggregate every env, or pick one. If a dashboard only shows one
  env's data, its Prometheus is only scraping that one target (check `…:9090/api/v1/targets`).
- Both `WSL Proxy - Backend Health` and `WSL Proxy - Cache` inject `env=~"$env"` into every
  metric selector (defaults to All). `=~".*"` also matches series with no `env` label, so a
  single-target Prometheus still works unchanged. `up` / `scrape_*` panels keep their
  `instance` filter (those labels are Prometheus-synthesised, not from the endpoint).

## Cache dashboard: snapshot vs counters
- **The cache dashboard will not match the admin UI's Cache page — by design.** Grafana
  shows cumulative *event counters* (`nginx_cache_{hits,misses,stores,bypasses}_total`);
  the admin UI's `GET /api/cache/stats` shows a *live snapshot of current cache contents*
  (entry count, bytes, top URLs, Docker-blob disk cache). One stored object served 500×
  = 1 admin-UI entry but 1 store + 500 hits here. No cache size/entry/eviction/TTL metric
  exists on `/metrics`, so Grafana can't reproduce those numbers. The dashboard's top
  "read me" callout panel explains this and links to the admin UI.

**Observed vs configured backends.** The Executive Overview shows **Backends (observed)** —
distinct backends that have actually served traffic (`wslproxy_backend_requests_total`
creates a series lazily on first request). This is normally **lower** than the admin UI's
configured-backend count: zero-traffic backends emit no metric and are invisible to
Prometheus, and one address shared by several rules dedupes to a single `backend_label`.
Prometheus cannot report the config-level total — that number lives in the admin API.
