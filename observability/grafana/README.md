# WSLProxy Grafana dashboards

Dashboards-as-code for the metrics every WSLProxy edge exports at
`/metrics` (see `api/prometheus_metrics.lua`). Deployed to the central
obs Grafana at **https://grafana.workstation.co.uk** (folder *WSLProxy*).

## The suite

| Dashboard (uid) | What it shows |
|---|---|
| `wslproxy-edge-overview` | Golden signals per edge: RPS, 4xx/5xx rates, latency percentiles, connections, response sizes |
| `wslproxy-backends` | Rule-routed backend health/throughput/latency (`wslproxy_backend_*`) + raw nginx upstreams (`nginx_proxy_*`) |
| `wslproxy-cache` | Hit ratio, hits/misses/stores/bypasses, per-host and per-extension breakdowns |
| `wslproxy-vhosts` | Per-domain traffic, errors, p95, endpoint breakdown; `$host` variable |
| `wslproxy-security` | Suspicious requests, WAF inspection cost, 403 blocks, top client IPs, login failures |
| `wslproxy-admin-api` | Control-plane `/api` usage, error rates, auth attempts |

All dashboards have a `$pop` variable (edge selector). Data source is the
obs Prometheus (uid `prometheus`), which scrapes the edges under
`job="wslproxy-edges"` — the scrape job lives in
`diy-tax-return-infra/kubernetes/observability/values-kube-prometheus-stack.yaml`.
To monitor a new edge, add its `host:443` there (with a `pop` label) and
re-run that repo's bootstrap script; the dashboards pick it up
automatically via the `pop` label.

## Editing

The JSONs in `dashboards/` are **generated** — edit
`generate_dashboards.py`, regenerate, and commit both:

```console
$ python3 observability/grafana/generate_dashboards.py
```

(The deploy workflow fails if the JSONs are stale relative to the
generator.) Ad-hoc edits made in the Grafana UI are overwritten on the
next deploy — port them into the generator.

## Deploying

Merging to `main` with changes under `observability/grafana/**` triggers
`.github/workflows/deploy-grafana-dashboards.yml`, which upserts every
dashboard through the Grafana HTTP API (stable uids, `overwrite: true`)
and smoke-checks each one. Manual run: dispatch that workflow, or:

```console
$ GRAFANA_URL=https://grafana.workstation.co.uk \
  GRAFANA_USER=admin GRAFANA_PASSWORD=... \
  ./observability/grafana/deploy.sh
```

Credentials: repo secret `GRAFANA_ADMIN_PASSWORD` (admin password of the
target Grafana — the `obs-grafana-admin` secret in the k3s1 `prod`
namespace), optional repo variable `GRAFANA_URL`.
