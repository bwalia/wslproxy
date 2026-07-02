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
- Colour convention: 🟢 healthy · 🟡 warning · 🔴 critical · ⚪ unknown
- Cache hit-ratio convention: 🔴 <50% · 🟡 50–80% · 🟢 ≥80%

## Folder structure
```
dashboard/
├── docs/
│   ├── README.md              ← this file
│   ├── METRICS_INVENTORY.md   ← every real metric, categorised
│   ├── PANELS.md              ← every panel + its PromQL
│   └── VARIABLES.md           ← template variable definitions
├── grafana/
│   ├── dashboards/
│   │   ├── wsl-proxy-backend-health.json   ← backend-health dashboard
│   │   └── wsl-proxy-cache.json            ← cache dashboard
│   └── provisioning/
│       ├── dashboards/wslproxy.yaml        ← dashboard provider (loads the whole folder)
│       └── datasources/prometheus.yaml     ← Prometheus datasource
├── prometheus/
│   ├── rules/
│   │   ├── recording-rules.yaml            ← pre-computed aggregations (backend)
│   │   ├── alert-rules.yaml                ← SRE alerts (backend, mirrors thresholds)
│   │   └── cache-rules.yaml                ← cache recording + alert rules
│   └── scrape/scrape-config.yaml           ← scrape_config for the endpoint
└── scripts/
    ├── build_dashboard.py                  ← regenerates the backend-health JSON
    └── build_cache_dashboard.py            ← regenerates the cache JSON
```

Both dashboards live in the same `grafana/dashboards/` folder, so the provisioning
provider picks up the cache dashboard automatically — no config change needed. Add
the cache rules alongside the others:
```yaml
rule_files:
  - /etc/prometheus/rules/recording-rules.yaml
  - /etc/prometheus/rules/alert-rules.yaml
  - /etc/prometheus/rules/cache-rules.yaml
```

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

**Observed vs configured backends.** The Executive Overview shows **Backends (observed)** —
distinct backends that have actually served traffic (`wslproxy_backend_requests_total`
creates a series lazily on first request). This is normally **lower** than the admin UI's
configured-backend count: zero-traffic backends emit no metric and are invisible to
Prometheus, and one address shared by several rules dedupes to a single `backend_label`.
Prometheus cannot report the config-level total — that number lives in the admin API.
