# WSL Proxy — Backend Health · Panel Reference

Every panel, its Grafana type, purpose, and the exact PromQL it runs. All queries
use only metrics verified to exist on `https://prod-our.wslproxy.com/metrics`
(see [METRICS_INVENTORY.md](./METRICS_INVENTORY.md)). Template vars: `$host`,
`$backend`, `$rule`, `$instance`, `$__range` (Grafana range macro).

Colour convention throughout: 🟢 healthy · 🟡 warning · 🔴 critical · ⚪ unknown.

---

## ℹ️ Dashboard Info
| Panel | Type | PromQL / Source |
|---|---|---|
| Overview | Text | Static: project/env/datasource/endpoint/version |
| Last Refresh | Stat | `vector(time()*1000)` rendered as ISO time |
| Active vHosts | Stat | `count(count by (host) (nginx_http_requests_total))` |
| Scrape Target Up | Stat | `up{instance=~"$instance"}` |

## Row 1 · Executive Overview
| Panel | Type | PromQL |
|---|---|---|
| Backends (observed) | Stat | `count(count by (backend_label) (wslproxy_backend_requests_total))` — counts backends that have **served traffic**; lower than the admin UI's configured count because zero-traffic backends emit no metric and a shared address dedupes to one label. |
| Healthy Backends | Stat | `count(wslproxy_backend_healthy == 1) or vector(0)` |
| Unhealthy Backends | Stat (bg) | `count(wslproxy_backend_healthy == 0) or vector(0)` |
| Rules (observed) | Stat | `count(count by (rule_id) (wslproxy_backend_requests_total))` — rules that routed ≥1 request. |
| Active Rules (5m) | Stat | `count(count by (rule_id) (rate(wslproxy_backend_requests_total[5m]) > 0)) or vector(0)` |
| Total Requests | Stat | `sum(nginx_http_requests_total)` |
| Requests / sec | Stat+spark | `sum(rate(nginx_http_requests_total[5m]))` |
| Error Rate % | Stat (bg) | `100 * sum(rate(nginx_http_errors_total[5m])) / clamp_min(sum(rate(nginx_http_requests_total[5m])),1)` |
| Availability % | Gauge | `100 * (1 - sum(rate(nginx_http_5xx_errors_total[5m])) / clamp_min(sum(rate(nginx_http_requests_total[5m])),1))` |
| Backend Fleet Status | Stat (bg) | `min(wslproxy_backend_healthy)` → ALL HEALTHY / DEGRADED |

## Row 2 · Backend Health (Table)
One row per `backend_label`, joined via `merge` transform, sorted by Requests desc.
| Column | PromQL |
|---|---|
| Requests | `sum by (backend_label) (wslproxy_backend_requests_total)` |
| 5xx (range) | `sum by (backend_label) (increase(wslproxy_backend_requests_total{status=~"5.."}[$__range]))` |
| Error % | `100 * sum by (backend_label) (rate(...{status=~"5.."}[5m])) / clamp_min(sum by (backend_label) (rate(...[5m])),0.0001)` |
| p95 Latency | `histogram_quantile(0.95, sum by (backend_label, le) (rate(wslproxy_backend_response_seconds_bucket[5m])))` |
| Healthy | `max by (backend_label) (wslproxy_backend_healthy)` → colour-mapped |
| Req/s | `sum by (backend_label) (rate(wslproxy_backend_requests_total[5m]))` |

> `Last Seen` / `Uptime` from the brief are **not exported** by lua-prometheus, so
> those columns are omitted rather than faked.

## Row 3 · Rules with Backends (Table)
Grouped by `rule_id` + `backend_label`, sorted by traffic. `Target` = the backend address.
| Column | PromQL |
|---|---|
| Requests | `sum by (rule_id, backend_label) (wslproxy_backend_requests_total)` |
| Failures | `sum by (rule_id, backend_label) (increase(...{status=~"[45].."}[$__range]))` |
| p95 Latency | `histogram_quantile(0.95, sum by (rule_id, backend_label, le) (rate(wslproxy_backend_response_seconds_bucket[5m])))` |
| Health | `max by (rule_id, backend_label) (wslproxy_backend_healthy)` |
| Traffic % | `100 * sum by (rule_id, backend_label) (rate(...[5m])) / scalar(clamp_min(sum(rate(...[5m])),0.0001))` |

## Row 4 · Traffic
| Panel | Type | PromQL |
|---|---|---|
| Request & Response Rate | Time series | `sum(rate(nginx_http_requests_total{host=~"$host"}[5m]))` · `sum(rate(nginx_proxy_requests_total[5m]))` |
| Throughput in/out | Time series | `sum(rate(nginx_http_request_size_bytes_sum{host=~"$host"}[5m]))` · `..._response_size_bytes_sum...` |
| Peak Req/s (range) | Stat | `max_over_time(sum(rate(nginx_http_requests_total[5m]))[$__range:1m])` |
| Avg Req/s (range) | Stat | `avg_over_time(sum(rate(nginx_http_requests_total[5m]))[$__range:1m])` |
| Peak Backend Req/s | Stat | `max_over_time(sum(rate(wslproxy_backend_requests_total[5m]))[$__range:1m])` |

## Row 5 · Error Analysis
| Panel | Type | PromQL |
|---|---|---|
| Error Rates by Class | Time series | `sum(rate(nginx_http_4xx_errors_total{host=~"$host"}[5m]))`, `..._5xx_...`, `nginx_http_errors_total` |
| Backend Failures by Backend | Time series | `sum by (backend_label) (rate(wslproxy_backend_requests_total{status=~"5.."}[5m]))` |
| 4xx/sec, 5xx/sec | Stat | `sum(rate(nginx_http_4xx_errors_total[5m]))` / `..._5xx_...` |
| Success Rate % | Gauge | `100 * (1 - sum(rate(nginx_http_errors_total[5m]))/clamp_min(sum(rate(nginx_http_requests_total[5m])),1))` |
| Suspicious Requests /s | Stat | `sum(rate(nginx_http_suspicious_requests_total[5m]))` |
| Auth Failures /s | Stat | `sum(rate(api_auth_failures_total[5m]))` |
| Connection Aborts (499)/s | Stat | `sum(rate(wslproxy_backend_requests_total{status="499"}[5m]))` |

## Row 6 · Backend Latency
| Panel | Type | PromQL |
|---|---|---|
| Backend Latency Percentiles | Time series | `histogram_quantile(0.50|0.90|0.95|0.99, sum by (le) (rate(wslproxy_backend_response_seconds_bucket[5m])))` + avg via `_sum/_count` |
| Proxy Latency Percentiles | Time series | same shape on `nginx_proxy_response_time_seconds_bucket` |
| Backend Latency Distribution | Heatmap | `sum by (le) (rate(wslproxy_backend_response_seconds_bucket[5m]))` |

Latency spikes highlighted with a dashed threshold at 0.3s (300 ms).

## Row 7 · Backend Availability
| Panel | Type | PromQL |
|---|---|---|
| Backend Health State Timeline | State timeline | `wslproxy_backend_healthy` (per `backend_label`) |
| Fleet Availability % | Gauge | `100 * count(wslproxy_backend_healthy == 1) / clamp_min(count(wslproxy_backend_healthy),1)` |

## Row 8 · Backend Load Distribution
| Panel | Type | PromQL |
|---|---|---|
| Requests by Backend (share) | Bar gauge | `sum by (backend_label) (wslproxy_backend_requests_total)` |
| Traffic Rate by Backend | Bar gauge | `sum by (backend_label) (rate(wslproxy_backend_requests_total[5m]))` |
| Most Used Backend | Stat | `topk(1, sum by (backend_label) (wslproxy_backend_requests_total))` |
| Busiest Backend Now | Stat | `topk(1, sum by (backend_label) (rate(...[5m])))` |
| Least Used Backend | Stat | `bottomk(1, sum by (backend_label) (wslproxy_backend_requests_total))` |

## Row 9 · Health Checks
| Panel | Type | PromQL |
|---|---|---|
| Health Check Status History | Status history | `wslproxy_backend_healthy` |
| Backends Passing / Failing | Stat | `count(wslproxy_backend_healthy == 1|0) or vector(0)` |

> Health-check duration / last-check time are not exported — noted in-panel.

## Row 10 · Request Distribution (Pie)
| Panel | PromQL |
|---|---|
| Requests by Backend | `sum by (backend_label) (wslproxy_backend_requests_total)` |
| Requests by Rule | `sum by (rule_id) (wslproxy_backend_requests_total)` |
| Errors by Backend | `sum by (backend_label) (increase(...{status=~"[45].."}[$__range]))` |
| Requests by HTTP Status | `sum by (status) (wslproxy_backend_requests_total)` |
| Requests by Method | `sum by (method) (nginx_http_requests_total)` |
| Cache Hit vs Miss | `sum(nginx_cache_hits_total)` vs `sum(nginx_cache_misses_total)` |

## Row 11 · Go Runtime
Text panel only — **no `go_*` metrics exist** (OpenResty lua exporter, not Go).

## Row 12 · HTTP Metrics
| Panel | Type | PromQL |
|---|---|---|
| HTTP Requests by Status Class | Time series (stack) | `sum by (status) (rate(nginx_http_requests_total{host=~"$host"}[5m]))` |
| nginx Connection States | Time series | `nginx_http_connections` (per `state`) |
| Top Endpoints by Requests | Bar gauge | `topk(10, sum by (endpoint) (nginx_http_requests_total))` |
| HTTP Status Code Breakdown | Table | `sum by (status) (nginx_http_requests_total)` |

## Row 13 · Prometheus Scrape
`up`, `scrape_duration_seconds`, `scrape_samples_scraped` — **synthesised by the
scraping Prometheus**, empty if Grafana queries the endpoint directly.

## Row 14 · Resource Usage
No `process_*` metrics exist. Substitutes: `nginx_http_connections{state="active"|"waiting"}`,
`nginx_metric_errors_total`, `sum by (status) (rate(api_calls_total[5m]))`.

## Row 15 · Alerts
Grafana `alertlist` panel (firing/pending) + threshold legend text. Rules live in
`prometheus/rules/alert-rules.yaml`.

## Row 16 · Useful Panels
| Panel | PromQL |
|---|---|
| Top Error Backends | `topk(10, sum by (backend_label) (increase(...{status=~"5.."}[$__range])))` |
| Slowest Backends (p95) | `topk(10, histogram_quantile(0.95, sum by (backend_label, le) (rate(...bucket[5m]))))` |
| Rule Utilisation | `topk(10, sum by (rule_id) (rate(wslproxy_backend_requests_total[5m])))` |
| HTTP Request Duration Heatmap | `sum by (le) (rate(nginx_http_request_duration_seconds_bucket{host=~"$host"}[5m]))` |
| Request Rate Heatmap | `sum by (le) (rate(nginx_proxy_response_time_seconds_bucket[5m]))` |
| Backend Saturation | `sum by (backend_label) (rate(wslproxy_backend_requests_total[5m]))` |
| Cache Hit Ratio by Host | `100 * sum by (host) (rate(nginx_cache_hits_total[5m])) / clamp_min(sum by (host) (rate(hits)+rate(misses)),0.0001)` |

---

## Annotations
- **Backend went unhealthy** — `changes(wslproxy_backend_healthy[2m]) > 0 and wslproxy_backend_healthy == 0` (red markers, enabled).
- **5xx spike** — `sum(rate(nginx_http_5xx_errors_total[2m])) > 0.5` (orange, off by default).
