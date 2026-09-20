#!/usr/bin/env python3
"""Generate the WSLProxy Grafana dashboard suite into dashboards/.

The dashboards target the metrics the OpenResty exporter serves at
/metrics on every edge (see api/prometheus_metrics.lua), scraped by the
central obs Prometheus under job="wslproxy-edges" with a `pop` label per
edge (lon1, pop1, ...). Re-run after editing and commit the JSONs:

    python3 observability/grafana/generate_dashboards.py
"""
import json
import os

OUT = os.path.join(os.path.dirname(__file__), "dashboards")
DS = {"type": "prometheus", "uid": "prometheus"}
JOB = 'job="wslproxy-edges"'
POP = 'pop=~"$pop"'
SEL = f"{JOB}, {POP}"
_id = 0


def nid():
    global _id
    _id += 1
    return _id


def target(expr, legend="", ref="A", instant=False, fmt="time_series"):
    t = {"refId": ref, "expr": expr, "legendFormat": legend, "datasource": DS}
    if instant:
        t["instant"] = True
        t["range"] = False
    if fmt != "time_series":
        t["format"] = fmt
    return t


def panel(ptype, title, gridPos, targets, unit="short", **kw):
    p = {
        "id": nid(),
        "type": ptype,
        "title": title,
        "gridPos": gridPos,
        "datasource": DS,
        "targets": targets,
        "fieldConfig": {
            "defaults": {"unit": unit, "custom": {}, "color": {"mode": "palette-classic"}},
            "overrides": kw.pop("overrides", []),
        },
        "options": kw.pop("options", {}),
    }
    p.update(kw)
    return p


def ts(title, gridPos, targets, unit="short", stacked=False, fillOpacity=8, **kw):
    p = panel("timeseries", title, gridPos, targets, unit, **kw)
    p["fieldConfig"]["defaults"]["custom"] = {
        "drawStyle": "line",
        "lineWidth": 1,
        "fillOpacity": fillOpacity,
        "showPoints": "never",
        "stacking": {"mode": "normal" if stacked else "none"},
    }
    p["options"] = {
        "legend": {"displayMode": "table", "placement": "bottom",
                   "calcs": ["mean", "max", "lastNotNull"]},
        "tooltip": {"mode": "multi", "sort": "desc"},
    }
    return p


def stat(title, gridPos, targets, unit="short", thresholds=None, decimals=None):
    p = panel("stat", title, gridPos, targets, unit)
    if decimals is not None:
        p["fieldConfig"]["defaults"]["decimals"] = decimals
    p["fieldConfig"]["defaults"]["color"] = {"mode": "thresholds"}
    p["fieldConfig"]["defaults"]["thresholds"] = thresholds or {
        "mode": "absolute", "steps": [{"color": "green", "value": None}]}
    p["options"] = {
        "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
        "orientation": "auto", "textMode": "auto", "colorMode": "value",
        "graphMode": "area", "justifyMode": "auto",
    }
    return p


def table(title, gridPos, targets, unit="short", overrides=None, transformations=None):
    p = panel("table", title, gridPos, targets, unit, overrides=overrides or [])
    p["options"] = {"showHeader": True, "sortBy": []}
    if transformations:
        p["transformations"] = transformations
    return p


def pop_var():
    return {
        "name": "pop", "label": "Edge (pop)", "type": "query", "datasource": DS,
        "query": {"query": f'label_values(up{{{JOB}}}, pop)', "refId": "var-pop"},
        "refresh": 2, "includeAll": True, "multi": True, "sort": 1,
        "current": {"selected": True, "text": ["All"], "value": ["$__all"]},
    }


def host_var():
    return {
        "name": "host", "label": "Virtual host", "type": "query", "datasource": DS,
        "query": {"query": f'label_values(nginx_http_requests_total{{{JOB}, {POP}}}, host)',
                  "refId": "var-host"},
        "refresh": 2, "includeAll": True, "multi": True, "sort": 1,
        "current": {"selected": True, "text": ["All"], "value": ["$__all"]},
    }


def dashboard(uid, title, panels, variables=None, description=""):
    return {
        "uid": uid,
        "title": title,
        "description": description,
        "tags": ["wslproxy", "generated"],
        "timezone": "browser",
        "schemaVersion": 39,
        "refresh": "30s",
        "time": {"from": "now-6h", "to": "now"},
        "editable": True,
        "templating": {"list": variables or [pop_var()]},
        "panels": panels,
    }


RATE = "$__rate_interval"


def q(metric, extra="", rng=RATE):
    filt = SEL + (", " + extra if extra else "")
    return f"rate({metric}{{{filt}}}[{rng}])"


def hq(quant, bucket, by="", extra=""):
    filt = SEL + (", " + extra if extra else "")
    grp = "le" + (", " + by if by else "")
    return (f"histogram_quantile({quant}, sum by ({grp}) "
            f"(rate({bucket}{{{filt}}}[{RATE}])))")


# ── 1. Edge Overview ────────────────────────────────────────────────────────
overview = dashboard(
    "wslproxy-edge-overview", "WSLProxy / Edge Overview",
    [
        stat("Requests / sec", {"h": 4, "w": 4, "x": 0, "y": 0},
             [target(f"sum({q('nginx_http_requests_total')})")], "reqps", decimals=1),
        stat("5xx error rate", {"h": 4, "w": 4, "x": 4, "y": 0},
             [target(f"sum({q('nginx_http_5xx_errors_total')}) / sum({q('nginx_http_requests_total')})")],
             "percentunit",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "yellow", "value": 0.01},
                                            {"color": "red", "value": 0.05}]}, decimals=2),
        stat("4xx error rate", {"h": 4, "w": 4, "x": 8, "y": 0},
             [target(f"sum({q('nginx_http_4xx_errors_total')}) / sum({q('nginx_http_requests_total')})")],
             "percentunit",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "yellow", "value": 0.05},
                                            {"color": "red", "value": 0.20}]}, decimals=2),
        stat("p95 latency", {"h": 4, "w": 4, "x": 12, "y": 0},
             [target(hq("0.95", "nginx_http_request_duration_seconds_bucket"))], "s",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "yellow", "value": 0.5},
                                            {"color": "red", "value": 2}]}, decimals=3),
        stat("Active connections", {"h": 4, "w": 4, "x": 16, "y": 0},
             [target(f"sum(nginx_http_connections{{{SEL}}})")], "short"),
        stat("Edges up", {"h": 4, "w": 4, "x": 20, "y": 0},
             [target(f"count(up{{{SEL}}} == 1)")], "short",
             {"mode": "absolute", "steps": [{"color": "red", "value": None},
                                            {"color": "green", "value": 2}]}),
        ts("Requests/sec by edge", {"h": 8, "w": 12, "x": 0, "y": 4},
           [target(f"sum by (pop) ({q('nginx_http_requests_total')})", "{{pop}}")], "reqps"),
        ts("Requests/sec by status", {"h": 8, "w": 12, "x": 12, "y": 4},
           [target(f"sum by (status) ({q('nginx_http_requests_total')})", "{{status}}")],
           "reqps", stacked=True),
        ts("Request latency percentiles", {"h": 8, "w": 12, "x": 0, "y": 12},
           [target(hq("0.50", "nginx_http_request_duration_seconds_bucket"), "p50", "A"),
            target(hq("0.90", "nginx_http_request_duration_seconds_bucket"), "p90", "B"),
            target(hq("0.99", "nginx_http_request_duration_seconds_bucket"), "p99", "C")], "s"),
        ts("Errors/sec (4xx vs 5xx) by edge", {"h": 8, "w": 12, "x": 12, "y": 12},
           [target(f"sum by (pop) ({q('nginx_http_4xx_errors_total')})", "4xx {{pop}}", "A"),
            target(f"sum by (pop) ({q('nginx_http_5xx_errors_total')})", "5xx {{pop}}", "B")], "reqps"),
        ts("Connections by state", {"h": 8, "w": 8, "x": 0, "y": 20},
           [target(f"sum by (state) (nginx_http_connections{{{SEL}}})", "{{state}}")], "short"),
        ts("p95 response size", {"h": 8, "w": 8, "x": 8, "y": 20},
           [target(hq("0.95", "nginx_http_response_size_bytes_bucket", "pop"), "{{pop}}")], "bytes"),
        ts("Requests/sec by method", {"h": 8, "w": 8, "x": 16, "y": 20},
           [target(f"sum by (method) ({q('nginx_http_requests_total')})", "{{method}}")],
           "reqps", stacked=True),
    ],
    description="Golden signals for every WSLProxy edge: traffic, errors, latency, saturation.",
)

# ── 2. Backends & Upstreams ─────────────────────────────────────────────────
backends = dashboard(
    "wslproxy-backends", "WSLProxy / Backends & Upstreams",
    [
        stat("Healthy backends", {"h": 4, "w": 6, "x": 0, "y": 0},
             [target(f"sum(wslproxy_backend_healthy{{{SEL}}})")], "short",
             {"mode": "absolute", "steps": [{"color": "green", "value": None}]}),
        stat("Unhealthy backends", {"h": 4, "w": 6, "x": 6, "y": 0},
             [target(f"count(wslproxy_backend_healthy{{{SEL}}} == 0) OR on() vector(0)")], "short",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "red", "value": 1}]}),
        stat("Backend p95 response", {"h": 4, "w": 6, "x": 12, "y": 0},
             [target(hq("0.95", "wslproxy_backend_response_seconds_bucket"))], "s", decimals=3),
        stat("Backend 5xx / sec", {"h": 4, "w": 6, "x": 18, "y": 0},
             [target(f"sum({q('wslproxy_backend_requests_total', 'status=~\"5..\"')}) OR on() vector(0)")],
             "reqps",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "red", "value": 1}]}, decimals=2),
        table("Backend health (rule-routed backends)", {"h": 9, "w": 24, "x": 0, "y": 4},
              [target(f"wslproxy_backend_healthy{{{SEL}}}", instant=True, fmt="table")],
              overrides=[{
                  "matcher": {"id": "byName", "options": "Value"},
                  "properties": [
                      {"id": "displayName", "value": "healthy"},
                      {"id": "mappings", "value": [
                          {"type": "value",
                           "options": {"0": {"text": "DOWN", "color": "red"},
                                       "1": {"text": "UP", "color": "green"}}}]},
                      {"id": "custom.cellOptions", "value": {"type": "color-background"}},
                  ]}],
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True, "__name__": True, "job": True,
                                    "instance": True, "address": True},
                  "renameByName": {}}}]),
        ts("Backend requests/sec by backend", {"h": 8, "w": 12, "x": 0, "y": 13},
           [target(f"sum by (backend_label) ({q('wslproxy_backend_requests_total')})",
                   "{{backend_label}}")], "reqps"),
        ts("Backend errors/sec (5xx) by backend", {"h": 8, "w": 12, "x": 12, "y": 13},
           [target(f"sum by (backend_label) ({q('wslproxy_backend_requests_total', 'status=~\"5..\"')})",
                   "{{backend_label}}")], "reqps"),
        ts("Backend p95 response time by backend", {"h": 8, "w": 12, "x": 0, "y": 21},
           [target(hq("0.95", "wslproxy_backend_response_seconds_bucket", "backend_label"),
                   "{{backend_label}}")], "s"),
        ts("Backend request status breakdown", {"h": 8, "w": 12, "x": 12, "y": 21},
           [target(f"sum by (status) ({q('wslproxy_backend_requests_total')})", "{{status}}")],
           "reqps", stacked=True),
        ts("nginx proxy requests/sec by upstream", {"h": 8, "w": 12, "x": 0, "y": 29},
           [target(f"sum by (upstream) ({q('nginx_proxy_requests_total')})", "{{upstream}}")], "reqps"),
        ts("nginx proxy p95 response time by upstream", {"h": 8, "w": 12, "x": 12, "y": 29},
           [target(hq("0.95", "nginx_proxy_response_time_seconds_bucket", "upstream"),
                   "{{upstream}}")], "s"),
    ],
    description="Traffic-router backends (rule-level) and raw nginx upstreams: health, throughput, latency, errors.",
)

# ── 3. Cache ────────────────────────────────────────────────────────────────
CACHE_HITS = q("nginx_cache_hits_total")
CACHE_MISS = q("nginx_cache_misses_total")
cache = dashboard(
    "wslproxy-cache", "WSLProxy / Cache",
    [
        stat("Cache hit ratio", {"h": 4, "w": 5, "x": 0, "y": 0},
             [target(f"sum({CACHE_HITS}) / (sum({CACHE_HITS}) + sum({CACHE_MISS}))")],
             "percentunit",
             {"mode": "absolute", "steps": [{"color": "red", "value": None},
                                            {"color": "yellow", "value": 0.5},
                                            {"color": "green", "value": 0.8}]}, decimals=2),
        stat("Hits / sec", {"h": 4, "w": 5, "x": 5, "y": 0},
             [target(f"sum({CACHE_HITS})")], "reqps", decimals=1),
        stat("Misses / sec", {"h": 4, "w": 5, "x": 10, "y": 0},
             [target(f"sum({CACHE_MISS})")], "reqps", decimals=1),
        stat("Stores / sec", {"h": 4, "w": 5, "x": 15, "y": 0},
             [target(f"sum({q('nginx_cache_stores_total')})")], "reqps", decimals=1),
        stat("Hosts with cache on", {"h": 4, "w": 4, "x": 20, "y": 0},
             [target(f"sum(nginx_cache_enabled{{{SEL}}})")], "short"),
        ts("Hit ratio over time", {"h": 8, "w": 12, "x": 0, "y": 4},
           [target(f"sum({CACHE_HITS}) / (sum({CACHE_HITS}) + sum({CACHE_MISS}))", "hit ratio")],
           "percentunit"),
        ts("Cache operations/sec", {"h": 8, "w": 12, "x": 12, "y": 4},
           [target(f"sum({CACHE_HITS})", "hits", "A"),
            target(f"sum({CACHE_MISS})", "misses", "B"),
            target(f"sum({q('nginx_cache_stores_total')})", "stores", "C"),
            target(f"sum({q('nginx_cache_bypasses_total')})", "bypasses", "D")],
           "reqps", stacked=True),
        ts("Top-10 hosts by cache hits", {"h": 8, "w": 12, "x": 0, "y": 12},
           [target(f"topk(10, sum by (host) ({CACHE_HITS}))", "{{host}}")], "reqps"),
        ts("Hit ratio by host (active hosts)", {"h": 8, "w": 12, "x": 12, "y": 12},
           [target(f"sum by (host) ({CACHE_HITS}) / "
                   f"(sum by (host) ({CACHE_HITS}) + sum by (host) ({CACHE_MISS}) > 0)",
                   "{{host}}")], "percentunit"),
        ts("Cache hits by file extension", {"h": 8, "w": 12, "x": 0, "y": 20},
           [target(f"sum by (extension) ({CACHE_HITS})", "{{extension}}")], "reqps", stacked=True),
        ts("Bypasses/sec by host", {"h": 8, "w": 12, "x": 12, "y": 20},
           [target(f"topk(10, sum by (host) ({q('nginx_cache_bypasses_total')}))", "{{host}}")],
           "reqps"),
    ],
    description="Static-content cache effectiveness: hit ratio, operations, per-host and per-extension breakdowns.",
)

# ── 4. Virtual Hosts ────────────────────────────────────────────────────────
HOSTSEL = SEL + ', host=~"$host"'
vhosts = dashboard(
    "wslproxy-vhosts", "WSLProxy / Virtual Hosts",
    [
        ts("Top-15 hosts by requests/sec", {"h": 9, "w": 12, "x": 0, "y": 0},
           [target(f"topk(15, sum by (host) (rate(nginx_http_requests_total{{{HOSTSEL}}}[{RATE}])))",
                   "{{host}}")], "reqps"),
        ts("Errors/sec by host (4xx+5xx)", {"h": 9, "w": 12, "x": 12, "y": 0},
           [target(f"topk(15, sum by (host) (rate(nginx_http_errors_total{{{HOSTSEL}}}[{RATE}])))",
                   "{{host}}")], "reqps"),
        ts("p95 latency by host", {"h": 9, "w": 12, "x": 0, "y": 9},
           [target("histogram_quantile(0.95, sum by (le, host) "
                   f"(rate(nginx_http_request_duration_seconds_bucket{{{HOSTSEL}}}[{RATE}])))",
                   "{{host}}")], "s"),
        ts("5xx/sec by host", {"h": 9, "w": 12, "x": 12, "y": 9},
           [target(f"sum by (host) (rate(nginx_http_5xx_errors_total{{{HOSTSEL}}}[{RATE}]))",
                   "{{host}}")], "reqps"),
        table("Per-host traffic summary (1h)", {"h": 10, "w": 24, "x": 0, "y": 18},
              [target(f"sum by (host) (rate(nginx_http_requests_total{{{HOSTSEL}}}[1h]))",
                      ref="A", instant=True, fmt="table"),
               target(f"sum by (host) (rate(nginx_http_5xx_errors_total{{{HOSTSEL}}}[1h]))",
                      ref="B", instant=True, fmt="table"),
               target("histogram_quantile(0.95, sum by (le, host) "
                      f"(rate(nginx_http_request_duration_seconds_bucket{{{HOSTSEL}}}[1h])))",
                      ref="C", instant=True, fmt="table")],
              transformations=[
                  {"id": "joinByField", "options": {"byField": "host", "mode": "outer"}},
                  {"id": "organize", "options": {
                      "excludeByName": {"Time": True, "Time 1": True, "Time 2": True,
                                        "Time 3": True},
                      "renameByName": {"Value #A": "req/s", "Value #B": "5xx/s",
                                       "Value #C": "p95 (s)"}}}],
              overrides=[{"matcher": {"id": "byName", "options": "req/s"},
                          "properties": [{"id": "unit", "value": "reqps"},
                                         {"id": "decimals", "value": 3}]},
                         {"matcher": {"id": "byName", "options": "5xx/s"},
                          "properties": [{"id": "unit", "value": "reqps"},
                                         {"id": "decimals", "value": 3}]},
                         {"matcher": {"id": "byName", "options": "p95 (s)"},
                          "properties": [{"id": "unit", "value": "s"},
                                         {"id": "decimals", "value": 3}]}]),
        ts("Requests/sec by endpoint (selected hosts)", {"h": 9, "w": 24, "x": 0, "y": 28},
           [target(f"topk(15, sum by (endpoint) (rate(nginx_http_requests_total{{{HOSTSEL}}}[{RATE}])))",
                   "{{endpoint}}")], "reqps"),
    ],
    [pop_var(), host_var()],
    description="Per-domain view: which virtual hosts get the traffic, the errors, and the slow requests.",
)

# ── 5. Security & WAF ───────────────────────────────────────────────────────
security = dashboard(
    "wslproxy-security", "WSLProxy / Security & WAF",
    [
        stat("Suspicious req / sec", {"h": 4, "w": 6, "x": 0, "y": 0},
             [target(f"sum({q('nginx_http_suspicious_requests_total')}) OR on() vector(0)")],
             "reqps",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "yellow", "value": 0.5},
                                            {"color": "red", "value": 5}]}, decimals=2),
        stat("403 blocks / sec", {"h": 4, "w": 6, "x": 6, "y": 0},
             [target(f"sum({q('nginx_http_4xx_errors_total', 'status=\"403\"')}) OR on() vector(0)")],
             "reqps", decimals=2),
        stat("WAF p95 inspection", {"h": 4, "w": 6, "x": 12, "y": 0},
             [target(hq("0.95", "nginx_waf_inspection_duration_seconds_bucket"))], "s",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "yellow", "value": 0.01},
                                            {"color": "red", "value": 0.1}]}, decimals=4),
        stat("Failed logins / sec", {"h": 4, "w": 6, "x": 18, "y": 0},
             [target(f"sum({q('api_auth_attempts_total', 'result!=\"success\"')}) OR on() vector(0)")],
             "reqps", decimals=3),
        ts("Suspicious requests by reason", {"h": 8, "w": 12, "x": 0, "y": 4},
           [target(f"sum by (reason) ({q('nginx_http_suspicious_requests_total')})",
                   "{{reason}}")], "reqps", stacked=True),
        ts("Suspicious requests by host", {"h": 8, "w": 12, "x": 12, "y": 4},
           [target(f"topk(10, sum by (host) ({q('nginx_http_suspicious_requests_total')}))",
                   "{{host}}")], "reqps"),
        ts("Top-10 client IPs by request rate", {"h": 8, "w": 12, "x": 0, "y": 12},
           [target(f"topk(10, sum by (ip) ({q('nginx_http_requests_by_ip_total')}))",
                   "{{ip}}")], "reqps"),
        ts("403 blocks by host", {"h": 8, "w": 12, "x": 12, "y": 12},
           [target(f"topk(10, sum by (host) ({q('nginx_http_4xx_errors_total', 'status=\"403\"')}))",
                   "{{host}}")], "reqps"),
        ts("WAF inspection p95 by host", {"h": 8, "w": 12, "x": 0, "y": 20},
           [target(hq("0.95", "nginx_waf_inspection_duration_seconds_bucket", "host"),
                   "{{host}}")], "s"),
        ts("Auth attempts by result", {"h": 8, "w": 12, "x": 12, "y": 20},
           [target(f"sum by (result) ({q('api_auth_attempts_total')})", "{{result}}")],
           "reqps", stacked=True),
    ],
    description="Threat surface: suspicious traffic, WAF cost, blocked requests, noisy client IPs, login abuse.",
)

# ── 6. Admin API ────────────────────────────────────────────────────────────
admin_api = dashboard(
    "wslproxy-admin-api", "WSLProxy / Admin API",
    [
        stat("API calls / sec", {"h": 4, "w": 6, "x": 0, "y": 0},
             [target(f"sum({q('api_calls_total')})")], "reqps", decimals=2),
        stat("API error rate", {"h": 4, "w": 6, "x": 6, "y": 0},
             [target(f"sum({q('api_calls_total', 'status=~\"[45]..\"')}) / sum({q('api_calls_total')})")],
             "percentunit",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "yellow", "value": 0.05},
                                            {"color": "red", "value": 0.25}]}, decimals=2),
        stat("Logins ok / sec", {"h": 4, "w": 6, "x": 12, "y": 0},
             [target(f"sum({q('api_auth_attempts_total', 'result=\"success\"')}) OR on() vector(0)")],
             "reqps", decimals=3),
        stat("Logins failed / sec", {"h": 4, "w": 6, "x": 18, "y": 0},
             [target(f"sum({q('api_auth_attempts_total', 'result!=\"success\"')}) OR on() vector(0)")],
             "reqps",
             {"mode": "absolute", "steps": [{"color": "green", "value": None},
                                            {"color": "red", "value": 0.1}]}, decimals=3),
        ts("Top-15 API endpoints by rate", {"h": 9, "w": 12, "x": 0, "y": 4},
           [target(f"topk(15, sum by (endpoint) ({q('api_calls_total')}))", "{{endpoint}}")],
           "reqps"),
        ts("API calls by status", {"h": 9, "w": 12, "x": 12, "y": 4},
           [target(f"sum by (status) ({q('api_calls_total')})", "{{status}}")],
           "reqps", stacked=True),
        ts("API 4xx/5xx by endpoint", {"h": 9, "w": 12, "x": 0, "y": 13},
           [target(f"topk(10, sum by (endpoint) ({q('api_calls_total', 'status=~\"[45]..\"')}))",
                   "{{endpoint}}")], "reqps"),
        ts("API calls by method", {"h": 9, "w": 12, "x": 12, "y": 13},
           [target(f"sum by (method) ({q('api_calls_total')})", "{{method}}")],
           "reqps", stacked=True),
    ],
    description="Control-plane usage: /api endpoint traffic, error rates, and login activity.",
)

ALL = [overview, backends, cache, vhosts, security, admin_api]

if __name__ == "__main__":
    os.makedirs(OUT, exist_ok=True)
    for d in ALL:
        path = os.path.join(OUT, d["uid"] + ".json")
        with open(path, "w") as f:
            json.dump(d, f, indent=2, sort_keys=True)
            f.write("\n")
        print(f"wrote {path} ({len(d['panels'])} panels)")
