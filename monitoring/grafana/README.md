# WSLProxy — Enterprise SRE Dashboard

Production-grade Grafana dashboard, alert rules and provisioning for 24×7 SRE
operation of the WSLProxy platform, following Google SRE practice (golden
signals, SLI/SLO, error budgets, multi-window burn rates).

```
monitoring/
├── grafana/
│   ├── generate_dashboard.py            # source of truth — regenerates the JSON
│   ├── dashboards/
│   │   └── wslproxy-sre-dashboard.json  # importable dashboard (uid: wslproxy-sre)
│   ├── alerts/
│   │   └── prometheus-rules.yml         # Prometheus-evaluated alert + recording rules
│   ├── provisioning/
│   │   ├── dashboards/wslproxy.yml      # Grafana file-provisioning provider
│   │   └── alerting/wslproxy-alert-rules.yml   # Grafana-managed alert rules
│   └── scripts/
│       └── import-dashboard.sh          # push via Grafana HTTP API
└── prometheus/
    └── scrape-config-example.yml        # scrape jobs (wslproxy, node, blackbox)
```

## Quick start

The target folder is **WSLProxy Monitoring**
(`https://int-grafana.diytaxreturn.co.uk/dashboards/f/afmpjjn28j4zkc/`).

```bash
# 1. Ensure Prometheus scrapes https://prod-our-v1.wslproxy.com/metrics
#    (see monitoring/prometheus/scrape-config-example.yml)

# 2. Import the dashboard (needs a service-account token with Editor role):
GRAFANA_API_TOKEN=glsa_xxx monitoring/grafana/scripts/import-dashboard.sh

# 3. Deploy ONE alerting flavour:
#    a) Prometheus-evaluated:  alerts/prometheus-rules.yml -> rule_files
#    b) Grafana-managed:       provisioning/alerting/wslproxy-alert-rules.yml
#       (sed -i 's/PROMETHEUS_UID/<ds-uid>/' first)
```

To change panels, edit `generate_dashboard.py` and re-run it — do not edit the
JSON by hand (it will be overwritten).

## Dashboard layout (17 sections)

| # | Row | Default | Contents |
|---|-----|---------|----------|
| 1 | Executive Overview | open | availability gauge, error budget left, SLO stats, active incidents, green/yellow/red health |
| 2 | Golden Signals | open | traffic (total/route/domain/backend), latency quantiles + heatmap, errors (4xx/5xx/backend/gateway/WAF), saturation |
| 3 | SLI | collapsed | availability, latency (<500ms), backend health, 2xx success-rate SLIs |
| 4 | SLO Tracking | collapsed | current vs target, 1h burn rate, budget left per SLO |
| 5 | Error Budget | collapsed | monthly/consumed/remaining budget, predicted exhaustion, trend |
| 6 | Burn Rate | collapsed | fast 5m/1h · medium 30m/6h · slow 6h/24h, thresholds 2/5/10 |
| 7 | Latency Analytics | collapsed | quantiles, heatmap, top-20 slow endpoints/backends, per-node |
| 8 | Backend Health | collapsed | availability table, unhealthy now, 24h trend, flapping, timeline |
| 9 | Infrastructure | collapsed | CPU/mem/disk/net/TCP/FDs (node_exporter) + native connection states |
| 10 | SSL/TLS | collapsed | cert expiry, <30d list, handshakes, probe failures |
| 11 | WAF | collapsed | blocks, attack categories, SQLi/XSS, geo blocks, rate limits, inspection latency |
| 12 | Cache | collapsed | hit rate, hits/misses/bypasses, size, top content, per-domain efficiency |
| 13 | Load Balancer | collapsed | per-backend traffic, distribution, CoV efficiency, skew, saturation, weights |
| 14 | API Gateway | collapsed | admin-plane request rates, auth/JWT failures, rate limits, top APIs |
| 15 | Regional Health | collapsed | per-node availability timeline, traffic, latency, failover events |
| 16 | Troubleshooting | collapsed | failed-request explorer, recent failures, error correlation, top failing routes/backends, incident timeline |
| 17 | Alerting | collapsed | severity counters, alert list, firing/pending table |

### Variables

| Variable | Meaning | Notes |
|----------|---------|-------|
| `$datasource` | **Environment** | pick the int / prod Prometheus |
| `$instance` | **Node / Region** | Prometheus `instance` label — pop0 (85.190.106.189), lon1 (lon1.pop0.uk) |
| `$host` | Service / Domain | `host` label (tenant vhost) |
| `$backend` | Backend | `backend_label` from the traffic router |
| `$endpoint`, `$status_code` | Route / Status filters | used by the Failed Requests Explorer |
| `$slo_availability` = 0.9995, `$slo_latency` = 0.95, `$slo_backend` = 0.999, `$latency_threshold` = 0.5 | SLO constants | hidden; change once, applies everywhere |

## SLI definitions

Failure = HTTP 5xx. Client aborts (499) are **not** failures.

| SLI | Formula (PromQL) |
|-----|------------------|
| Availability | `sum(rate(nginx_http_requests_total{status!~"5.."}[5m])) / sum(rate(nginx_http_requests_total[5m]))` |
| Latency | `sum(rate(nginx_http_request_duration_seconds_bucket{le="0.5"}[5m])) / sum(rate(nginx_http_request_duration_seconds_count[5m]))` — exact, `0.5` is a native bucket |
| Backend health | `sum(wslproxy_backend_healthy) / count(wslproxy_backend_healthy)` |
| Success rate | `sum(rate(nginx_http_requests_total{status=~"2.."}[5m])) / sum(rate(nginx_http_requests_total[5m]))` |

## SLO targets

| SLO | Target | 30d window |
|-----|--------|------------|
| Availability | 99.95 % | allows ~21.6 min of full outage / month |
| Latency | 95 % of requests < 500 ms | |
| Backend availability | 99.9 % | |
| SSL success | 99.99 % | requires blackbox_exporter probes |

## Error budget math

For a request-based SLO over a 30-day window:

```
budget          = (1 - SLO) × total_requests_30d        # allowed failures
consumed        = failed_requests_30d
remaining       = budget - consumed
remaining %     = 1 - consumed / budget
exhaustion days = remaining / failures_per_day(last 24h)
```

## Burn rate math

```
burn_rate(W) = (failed/total over window W) / (1 - SLO)
```

`burn = 1` → spending budget exactly at the sustainable rate;
`burn = 14.4` → a 30-day budget is gone in 2 days.

Multi-window pairs (both windows must exceed the threshold to fire — the short
window proves it is happening *now*, the long window proves it is not a blip):

| Class | Windows | Action |
|-------|---------|--------|
| Fast | 5m / 1h | page |
| Medium | 30m / 6h | page / urgent ticket |
| Slow | 6h / 24h | ticket |

Display thresholds: **warning > 2 · critical > 5 · emergency > 10**.

## Alert rules

| Alert | Condition | Severity |
|-------|-----------|----------|
| WSLProxyAvailabilityBelowTarget | 5m availability < 99.9 % | critical |
| WSLProxyErrorBudgetFastBurn | burn > 5 on 5m **and** 1h | critical |
| WSLProxyErrorBudgetSlowBurn | burn > 2 on 1h **and** 6h | warning |
| WSLProxyP99LatencyHigh | p99 > 1 s for 5m | warning |
| WSLProxyErrorRateHigh | 5xx > 5 % for 5m | critical |
| WSLProxyBackendHealthLow | healthy backends < 80 % | critical |
| WSLProxyBackendDown / Flapping | single backend down 5m / >4 transitions 30m | warning |
| WSLProxySSLCertExpiringSoon | cert expiry < 15 d (warning at < 30 d) | critical |
| WSLProxyNoTraffic / ScrapeDown / MetricExporterErrors | zero traffic / scrape failing / exporter dropping samples | critical / info |

## Data sources & dependencies

1. **WSLProxy exporter (required)** — `https://prod-our-v1.wslproxy.com/metrics`,
   implemented in `api/prometheus_metrics.lua`. Everything in sections 1–8 and
   11–17 runs on it. Some counter families (WAF blocks, SSL handshakes, rate
   limits, cache size) exist in the exporter but only appear after the first
   event — panels show "No data" until then, not an error.
2. **node_exporter (recommended)** — drives the Infrastructure row and the
   CPU/memory saturation panels. Install on both prod nodes (port 9100).
3. **blackbox_exporter (recommended)** — drives SSL cert-expiry panels and the
   `WSLProxySSLCertExpiringSoon` alert via `probe_ssl_earliest_cert_expiry`.
4. **`/system-status`** (`https://prod-our.wslproxy.com/system-status`) is the
   authenticated Next.js admin health page, **not** a JSON API — Grafana cannot
   scrape it directly. The backend-health data it displays comes from the same
   traffic-router state exported as `wslproxy_backend_healthy` /
   `wslproxy_backend_requests_total`, which section 8 uses. If you need the
   raw admin API (`/api/ha-status`, `/api/stats`) in Grafana, install the
   Infinity datasource and supply a JWT — note the 1-hour token expiry makes
   this fragile; the Prometheus route is preferred.

## Operational notes (incident workflow)

1. **Start at Executive Overview** — health stat + error budget tell you
   severity in 5 seconds.
2. **Golden Signals** — which signal moved first? Traffic spike → check WAF /
   rate limits; latency → Latency Analytics (remember the **two-layer timeout**:
   outer proxy *and* k3s ingress, CLAUDE.md §10); errors → Troubleshooting row.
3. **Failed Requests Explorer** — narrow by `$host` / `$endpoint` /
   `$status_code` to find the failing route, then Top Failing Backends.
4. **Backend Health timeline** — correlates origin failures with the incident;
   flapping table catches unstable origins. Routing **fails open**: an
   "unhealthy" backend still receives traffic if all backends are down.
5. **Production gotchas** that show up on this dashboard:
   - `worker_processes 1` in prod — a single stuck worker = zero traffic
     (`WSLProxyNoTraffic` fires; `curl http://127.0.0.1:8099/health` on the node).
   - Exporter shared-dict exhaustion (`nginx_metric_errors_total` panel in
     section 9) silently drops series.
   - Config changes apply via the cron reboot flag — a "config saved but no
     effect" report is usually the flag/cron, not the dashboard lying.
