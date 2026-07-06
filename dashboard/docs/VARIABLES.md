# WSL Proxy — Dashboard Variables

Defined in the dashboard `templating.list`. All query variables use
`label_values(...)` against real metrics/labels on the endpoint.

| Variable | Label | Type | Definition | Notes |
|---|---|---|---|---|
| `$datasource` | Datasource | datasource | `prometheus` | Pick the Prometheus that scrapes the endpoint. |
| `$environment` | Environment | custom | `Production` | Static — the endpoint has no `env` label. |
| `$job` | Job | query | `label_values(nginx_http_requests_total, job)` | From the scrape job; multi + All. |
| `$instance` | Instance | query | `label_values(nginx_http_requests_total, instance)` | Scrape target; used by Row 13 panels. |
| `$host` | Host (vHost) | query | `label_values(nginx_http_requests_total, host)` | The real per-vhost selector; used in Rows 4/5/12/16. |
| `$backend` | Backend | query | `label_values(wslproxy_backend_requests_total, backend_label)` | Backend address/label. |
| `$rule` | Rule | query | `label_values(wslproxy_backend_requests_total, rule_id)` | Routing rule UUID. |
| `$namespace` | Namespace | query | `label_values(namespace)` | **No `namespace` label on this endpoint** — resolves to *None* unless scraped inside k8s with relabeling. Kept per the brief. |

All query variables: `multi: true`, `includeAll: true`, `allValue: ".*"`, `refresh: On Time Range Change`.

## Why some variables can be empty
`$job`, `$instance` come from the **Prometheus scrape config**, not the endpoint —
they populate once a Prometheus server scrapes `prod-our.wslproxy.com/metrics`.
`$namespace` has no backing label at all on this OpenResty exporter; it is present
only to satisfy the requested variable list and will show *None* outside k8s.
