#!/usr/bin/env python3
"""
Generate the "WSL Proxy - SRE (10 Layers)" Grafana dashboard JSON.

A single top-down SRE view organised into 10 layers — SLO first, then the four
golden signals, then the request path from edge to backend, then the supporting
concerns (cache, security, observability). Every PromQL expression uses ONLY
metrics that exist on https://prod-our.wslproxy.com/metrics (verified live — see
docs/METRICS_INVENTORY.md). No metric names are invented.

Layers:
  1  Service Level (SLO) & Golden-Signal Summary
  2  Edge / HTTP Front Door
  3  Traffic            (golden signal)
  4  Errors             (golden signal)
  5  Latency            (golden signal)
  6  Routing & Rules
  7  Backend / Upstream Health
  8  Saturation & Capacity   (golden signal)
  9  Cache Efficiency
  10 Security, Auth & Observability

Env-aware: every selector gets `env=~"$env"` injected at build time, so the
dashboard scopes to the Environment variable (defaults to All). `up`/`scrape_*`
keep their own instance filter.

Run:  python3 scripts/build_sre_dashboard.py
Out:  grafana/dashboards/wsl-proxy-sre.json
"""
import json
import os
import re

DS = {"type": "prometheus", "uid": "${datasource}"}

# SLO target used for the error-budget math on Layer 1.
SLO = 0.999                 # 99.9% availability target
BUDGET = round(1 - SLO, 6)  # 0.001 allowed error ratio (round off float noise)


# --------------------------------------------------------------- env filtering
ENV_METRICS = [
    "wslproxy_backend_requests_total", "wslproxy_backend_healthy",
    "wslproxy_backend_response_seconds_bucket", "wslproxy_backend_response_seconds_sum",
    "wslproxy_backend_response_seconds_count",
    "nginx_http_requests_total", "nginx_http_errors_total",
    "nginx_http_4xx_errors_total", "nginx_http_5xx_errors_total",
    "nginx_http_suspicious_requests_total", "nginx_http_request_size_bytes_sum",
    "nginx_http_response_size_bytes_sum", "nginx_http_request_duration_seconds_bucket",
    "nginx_http_connections", "nginx_http_requests_by_ip_total",
    "nginx_proxy_requests_total", "nginx_proxy_response_time_seconds_bucket",
    "nginx_cache_hits_total", "nginx_cache_misses_total", "nginx_cache_bypasses_total",
    "api_calls_total", "api_auth_attempts_total", "api_auth_failures_total",
    "nginx_waf_inspection_duration_seconds_bucket", "nginx_waf_inspection_duration_seconds_count",
    "nginx_metric_errors_total",
]
_ENV_RE = re.compile(
    r"\b(" + "|".join(sorted(map(re.escape, ENV_METRICS), key=len, reverse=True))
    + r")\b(\s*\{)?")


def _env_sub(m):
    metric, brace = m.group(1), m.group(2)
    if brace:
        return metric + brace + 'env=~"$env",'
    return metric + '{env=~"$env"}'


def inject_env(expr):
    return _ENV_RE.sub(_env_sub, expr)


# ---------------------------------------------------------------- layout helper
class Layout:
    def __init__(self):
        self.y = 0
        self.panels = []
        self._id = 0

    def nid(self):
        self._id += 1
        return self._id

    def row(self, title):
        self.panels.append({
            "id": self.nid(), "type": "row", "title": title, "collapsed": False,
            "gridPos": {"h": 1, "w": 24, "x": 0, "y": self.y}, "panels": []})
        self.y += 1

    def add(self, panel, w, h, x):
        panel["id"] = self.nid()
        panel["gridPos"] = {"h": h, "w": w, "x": x, "y": self.y}
        self.panels.append(panel)

    def newline(self, h):
        self.y += h


# ---------------------------------------------------------------- panel helpers
def target(expr, legend="", instant=False, fmt="time_series", ref="A"):
    return {"datasource": DS, "expr": expr, "legendFormat": legend,
            "instant": instant, "range": not instant, "format": fmt, "refId": ref}


def thresholds(steps):
    return {"mode": "absolute", "steps": steps}


def stat(title, targets, unit="short", decimals=None, color_mode="value",
         thr=None, mappings=None, text_mode="auto", graph=False, desc=""):
    fc = {"unit": unit, "mappings": mappings or [],
          "thresholds": thr or thresholds([{"color": "green", "value": None}]),
          "color": {"mode": "thresholds"}}
    if decimals is not None:
        fc["decimals"] = decimals
    return {"type": "stat", "title": title, "datasource": DS, "description": desc,
            "targets": targets, "fieldConfig": {"defaults": fc, "overrides": []},
            "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                        "orientation": "auto", "colorMode": color_mode,
                        "graphMode": "area" if graph else "none",
                        "justifyMode": "auto", "textMode": text_mode}}


def gauge(title, targets, unit="percent", thr=None, minv=0, maxv=100, desc=""):
    return {"type": "gauge", "title": title, "datasource": DS, "description": desc,
            "targets": targets,
            "fieldConfig": {"defaults": {"unit": unit, "min": minv, "max": maxv,
                                         "thresholds": thr or thresholds([{"color": "green", "value": None}]),
                                         "color": {"mode": "thresholds"}}, "overrides": []},
            "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                        "showThresholdLabels": False, "showThresholdMarkers": True}}


def bargauge(title, targets, unit="short", desc="", orientation="horizontal", thr=None):
    return {"type": "bargauge", "title": title, "datasource": DS, "description": desc,
            "targets": targets,
            "fieldConfig": {"defaults": {"unit": unit, "color": {"mode": "thresholds"},
                                         "thresholds": thr or thresholds([{"color": "green", "value": None}])},
                            "overrides": []},
            "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                        "orientation": orientation, "displayMode": "gradient",
                        "showUnfilled": True, "valueMode": "color"}}


def timeseries(title, targets, unit="short", desc="", stack=False, fill=10,
               legend_table=False, spike=None, draw="line"):
    custom = {"drawStyle": draw, "lineInterpolation": "smooth", "lineWidth": 2,
              "fillOpacity": fill, "gradientMode": "opacity", "spanNulls": False,
              "showPoints": "never", "pointSize": 5,
              "stacking": {"mode": "normal" if stack else "none", "group": "A"},
              "axisPlacement": "auto", "axisLabel": "", "scaleDistribution": {"type": "linear"}}
    fc = {"defaults": {"unit": unit, "color": {"mode": "palette-classic"}, "custom": custom},
          "overrides": []}
    legend = {"showLegend": True, "displayMode": "table" if legend_table else "list",
              "placement": "bottom", "calcs": ["mean", "max", "lastNotNull"] if legend_table else []}
    p = {"type": "timeseries", "title": title, "datasource": DS, "description": desc,
         "targets": targets, "fieldConfig": fc,
         "options": {"legend": legend, "tooltip": {"mode": "multi", "sort": "desc"}}}
    if spike is not None:
        fc["defaults"]["thresholds"] = thresholds([{"color": "green", "value": None},
                                                    {"color": "red", "value": spike}])
        custom["thresholdsStyle"] = {"mode": "dashed"}
    return p


def piechart(title, targets, unit="short", desc=""):
    return {"type": "piechart", "title": title, "datasource": DS, "description": desc,
            "targets": targets,
            "fieldConfig": {"defaults": {"unit": unit, "color": {"mode": "palette-classic"}}, "overrides": []},
            "options": {"pieType": "donut", "displayLabels": ["percent"],
                        "legend": {"showLegend": True, "displayMode": "table", "placement": "right",
                                   "values": ["value", "percent"]},
                        "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                        "tooltip": {"mode": "single", "sort": "desc"}}}


def statetimeline(title, targets, desc="", mappings=None, thr=None):
    return {"type": "state-timeline", "title": title, "datasource": DS, "description": desc,
            "targets": targets,
            "fieldConfig": {"defaults": {"custom": {"lineWidth": 0, "fillOpacity": 90, "insertNulls": False},
                                         "mappings": mappings or [], "color": {"mode": "thresholds"},
                                         "thresholds": thr or thresholds([{"color": "green", "value": None}])},
                            "overrides": []},
            "options": {"mergeValues": True, "showValue": "never", "alignValue": "center",
                        "rowHeight": 0.9,
                        "legend": {"showLegend": True, "displayMode": "list", "placement": "bottom"}}}


def heatmap(title, targets, desc="", unit="s"):
    return {"type": "heatmap", "title": title, "datasource": DS, "description": desc,
            "targets": targets,
            "options": {"calculate": False, "cellGap": 1, "color": {"scheme": "Spectral", "mode": "scheme"},
                        "yAxis": {"unit": unit}, "tooltip": {"show": True, "yHistogram": True},
                        "legend": {"show": True}},
            "fieldConfig": {"defaults": {"custom": {"scaleDistribution": {"type": "linear"}}}, "overrides": []}}


def text(title, content):
    return {"type": "text", "title": title, "datasource": None,
            "options": {"mode": "markdown", "content": content}, "transparent": False}


def table(title, targets, desc="", transformations=None, overrides=None):
    return {"type": "table", "title": title, "datasource": DS, "description": desc,
            "targets": targets, "transformations": transformations or [],
            "fieldConfig": {"defaults": {"custom": {"align": "auto", "cellOptions": {"type": "auto"},
                                                    "filterable": True, "inspect": False},
                                         "color": {"mode": "thresholds"},
                                         "thresholds": thresholds([{"color": "green", "value": None}])},
                            "overrides": overrides or []},
            "options": {"showHeader": True, "cellHeight": "sm",
                        "footer": {"show": False, "reducer": ["sum"], "fields": ""}}}


# ------------------------------------------------------------------ thresholds
ERR_THR = thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1},
                      {"color": "red", "value": 5}])
LAT_THR = thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 0.1},
                      {"color": "red", "value": 0.3}])
AVAIL_THR = thresholds([{"color": "red", "value": None}, {"color": "yellow", "value": 99},
                        {"color": "green", "value": 99.9}])
BURN_THR = thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1},
                       {"color": "red", "value": 10}])
RATIO_THR = thresholds([{"color": "red", "value": None}, {"color": "yellow", "value": 50},
                        {"color": "green", "value": 80}])
HEALTH_MAP = [{"type": "value", "options": {"0": {"text": "UNHEALTHY", "color": "red", "index": 0},
                                            "1": {"text": "HEALTHY", "color": "green", "index": 1}}}]
HEALTH_THR = thresholds([{"color": "red", "value": None}, {"color": "green", "value": 1}])
UP_MAP = [{"type": "value", "options": {"0": {"text": "DOWN", "color": "red"},
                                        "1": {"text": "UP", "color": "green"}}}]

# reusable expression fragments -------------------------------------------
HF = '{host=~"$host"}'
REQ = "nginx_http_requests_total%s" % HF
RATE_REQ = "sum(rate(%s[5m]))" % REQ
ERR_RATIO = ("100 * sum(rate(nginx_http_errors_total%s[5m])) "
             "/ clamp_min(sum(rate(nginx_http_requests_total%s[5m])), 1)" % (HF, HF))
AVAIL = ("100 * (1 - sum(rate(nginx_http_5xx_errors_total%s[5m])) "
         "/ clamp_min(sum(rate(nginx_http_requests_total%s[5m])), 1))" % (HF, HF))


def bq(p):   # backend latency quantile
    return "histogram_quantile(%s, sum by (le) (rate(wslproxy_backend_response_seconds_bucket[5m])))" % p


def pq(p):   # proxy latency quantile
    return "histogram_quantile(%s, sum by (le) (rate(nginx_proxy_response_time_seconds_bucket[5m])))" % p


def eq(p):   # edge (http) latency quantile
    return ("histogram_quantile(%s, sum by (le) (rate(nginx_http_request_duration_seconds_bucket%s[5m])))"
            % (p, HF))


L = Layout()

# ==========================================================================
# HEADER
# ==========================================================================
L.row("ℹ️  WSL Proxy — SRE (10 Layers)")
L.add(text("How to read this dashboard",
           "A **top-down SRE view** in 10 layers. Start at the top (SLO), and only descend when a "
           "golden signal turns yellow/red:\n\n"
           "**1** SLO & golden-signal summary · **2** Edge / HTTP front door · **3** Traffic · "
           "**4** Errors · **5** Latency · **6** Routing & rules · **7** Backend / upstream health · "
           "**8** Saturation & capacity · **9** Cache · **10** Security, auth & observability.\n\n"
           "Scope with **Environment** / **Host** (top-left); both default to **All**. "
           "SLO target for the error-budget math = **%.1f%%**." % (SLO * 100)),
      w=16, h=5, x=0)
L.add(stat("Scrape Up", [target("up{instance=~\"$instance\"}", "", instant=True)],
           mappings=UP_MAP, thr=HEALTH_THR, color_mode="background", text_mode="value"), w=4, h=5, x=16)
L.add(stat("Active vHosts",
           [target("count(count by (host) (nginx_http_requests_total%s))" % HF, "", instant=True)],
           desc="Distinct proxied hosts seen"), w=4, h=5, x=20)
L.newline(5)

# ==========================================================================
# LAYER 1 — SLO & GOLDEN-SIGNAL SUMMARY
# ==========================================================================
L.row("Layer 1 · Service Level (SLO) & Golden-Signal Summary")
L.add(gauge("Availability % (non-5xx, 5m)", [target(AVAIL, "", instant=True)],
            thr=AVAIL_THR, minv=95, maxv=100,
            desc="Share of requests not returning 5xx"), w=5, h=7, x=0)
L.add(stat("Error-Budget Burn Rate (99.9% SLO)",
           [target("(%s / 100) / %s" % (ERR_RATIO, BUDGET), "", instant=True)],
           unit="none", decimals=2, thr=BURN_THR, color_mode="background", graph=True,
           desc="observed error ratio ÷ error budget (%.1f%%). >1 = burning budget faster than "
                "allowed; >10 = fast-burn, page-worthy." % (BUDGET * 100)), w=5, h=7, x=5)
L.add(stat("Requests / sec", [target(RATE_REQ, "", instant=True)],
           unit="reqps", decimals=1, graph=True, desc="TRAFFIC golden signal"), w=3, h=7, x=10)
L.add(stat("Error Rate %", [target(ERR_RATIO, "", instant=True)],
           unit="percent", decimals=2, thr=ERR_THR, color_mode="background", graph=True,
           desc="ERRORS golden signal"), w=3, h=7, x=13)
L.add(stat("Backend p95 Latency", [target(bq("0.95"), "", instant=True)],
           unit="s", decimals=3, thr=LAT_THR, color_mode="background", graph=True,
           desc="LATENCY golden signal"), w=4, h=7, x=16)
L.add(stat("Active Connections",
           [target("sum(nginx_http_connections{state=\"active\"})", "", instant=True)],
           unit="short", graph=True, desc="SATURATION golden signal"), w=4, h=7, x=20)
L.newline(7)
L.add(stat("Backend Fleet",
           [target("min(wslproxy_backend_healthy)", "", instant=True)],
           mappings=[{"type": "value", "options": {"0": {"text": "DEGRADED", "color": "red"},
                                                   "1": {"text": "ALL HEALTHY", "color": "green"}}}],
           thr=HEALTH_THR, color_mode="background", text_mode="value",
           desc="0 if any backend is unhealthy"), w=4, h=4, x=0)
L.add(stat("Healthy Backends", [target("count(wslproxy_backend_healthy == 1) or vector(0)", "", instant=True)],
           thr=HEALTH_THR, color_mode="value"), w=4, h=4, x=4)
L.add(stat("Unhealthy Backends", [target("count(wslproxy_backend_healthy == 0) or vector(0)", "", instant=True)],
           thr=thresholds([{"color": "green", "value": None}, {"color": "red", "value": 1}]),
           color_mode="background"), w=4, h=4, x=8)
L.add(stat("5xx / sec", [target("sum(rate(nginx_http_5xx_errors_total%s[5m]))" % HF, "", instant=True)],
           unit="reqps", decimals=2, color_mode="background",
           thr=thresholds([{"color": "green", "value": None}, {"color": "red", "value": 0.1}])), w=4, h=4, x=12)
L.add(stat("Cache Hit Ratio %",
           [target("100 * sum(rate(nginx_cache_hits_total[5m])) / clamp_min(sum(rate(nginx_cache_hits_total[5m])) "
                   "+ sum(rate(nginx_cache_misses_total[5m])), 0.0001)", "", instant=True)],
           unit="percent", decimals=1, thr=RATIO_THR), w=4, h=4, x=16)
L.add(stat("Auth Failures / sec", [target("sum(rate(api_auth_failures_total[5m]))", "", instant=True)],
           unit="reqps", decimals=3,
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 0.2}])), w=4, h=4, x=20)
L.newline(4)

# ==========================================================================
# LAYER 2 — EDGE / HTTP FRONT DOOR
# ==========================================================================
L.row("Layer 2 · Edge / HTTP Front Door")
L.add(timeseries("Requests by Status Class",
                 [target("sum by (status) (rate(nginx_http_requests_total%s[5m]))" % HF, "{{status}}")],
                 unit="reqps", stack=True, legend_table=True), w=12, h=8, x=0)
L.add(timeseries("nginx Connection States",
                 [target("nginx_http_connections", "{{state}}")], unit="short", legend_table=True,
                 desc="active / reading / writing / waiting"), w=12, h=8, x=12)
L.newline(8)
L.add(stat("Total Requests", [target("sum(nginx_http_requests_total%s)" % HF, "", instant=True)],
           unit="short"), w=4, h=4, x=0)
L.add(stat("Reading", [target("sum(nginx_http_connections{state=\"reading\"})", "", instant=True)]), w=4, h=4, x=4)
L.add(stat("Writing", [target("sum(nginx_http_connections{state=\"writing\"})", "", instant=True)]), w=4, h=4, x=8)
L.add(stat("Waiting", [target("sum(nginx_http_connections{state=\"waiting\"})", "", instant=True)]), w=4, h=4, x=12)
L.add(stat("Proxied Responses / sec", [target("sum(rate(nginx_proxy_requests_total[5m]))", "", instant=True)],
           unit="reqps", decimals=1, graph=True), w=8, h=4, x=16)
L.newline(4)

# ==========================================================================
# LAYER 3 — TRAFFIC
# ==========================================================================
L.row("Layer 3 · Traffic (golden signal)")
L.add(timeseries("Request & Proxied-Response Rate",
                 [target(RATE_REQ, "edge requests/s"),
                  target("sum(rate(nginx_proxy_requests_total[5m]))", "proxied responses/s")],
                 unit="reqps", legend_table=True), w=12, h=8, x=0)
L.add(timeseries("Throughput (in / out bytes)",
                 [target("sum(rate(nginx_http_request_size_bytes_sum%s[5m]))" % HF, "incoming"),
                  target("sum(rate(nginx_http_response_size_bytes_sum%s[5m]))" % HF, "outgoing")],
                 unit="Bps", legend_table=True), w=12, h=8, x=12)
L.newline(8)
L.add(bargauge("Top Hosts by Requests",
               [target("topk(10, sum by (host) (nginx_http_requests_total))", "{{host}}", instant=True)],
               unit="short"), w=8, h=8, x=0)
L.add(piechart("Requests by Method",
               [target("sum by (method) (nginx_http_requests_total%s)" % HF, "{{method}}", instant=True)]),
      w=8, h=8, x=8)
L.add(bargauge("Top Endpoints by Requests",
               [target("topk(10, sum by (endpoint) (nginx_http_requests_total%s))" % HF, "{{endpoint}}", instant=True)],
               unit="short"), w=8, h=8, x=16)
L.newline(8)

# ==========================================================================
# LAYER 4 — ERRORS
# ==========================================================================
L.row("Layer 4 · Errors (golden signal)")
L.add(timeseries("Error Rates by Class",
                 [target("sum(rate(nginx_http_4xx_errors_total%s[5m]))" % HF, "4xx"),
                  target("sum(rate(nginx_http_5xx_errors_total%s[5m]))" % HF, "5xx"),
                  target("sum(rate(nginx_http_errors_total%s[5m]))" % HF, "all errors")],
                 unit="reqps", legend_table=True, spike=0.5), w=12, h=8, x=0)
L.add(timeseries("Backend Failures (5xx) by Backend",
                 [target("sum by (backend_label) (rate(wslproxy_backend_requests_total{status=~\"5..\"}[5m]))",
                         "{{backend_label}}")], unit="reqps", legend_table=True), w=12, h=8, x=12)
L.newline(8)
L.add(table("Top Error Endpoints",
            [target("topk(10, sum by (endpoint, status) (increase(nginx_http_errors_total%s[$__range])))" % HF,
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"endpoint": "Endpoint", "status": "Status", "Value": "Errors"},
                "excludeByName": {"Time": True}}},
                {"id": "sortBy", "options": {"sort": [{"field": "Errors", "desc": True}]}}]), w=12, h=8, x=0)
L.add(table("Top 5xx Backends",
            [target("topk(10, sum by (backend_label) (increase(wslproxy_backend_requests_total{status=~\"5..\"}[$__range])))",
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"backend_label": "Backend", "Value": "5xx (range)"},
                "excludeByName": {"Time": True}}}]), w=12, h=8, x=12)
L.newline(8)

# ==========================================================================
# LAYER 5 — LATENCY
# ==========================================================================
L.row("Layer 5 · Latency (golden signal)")
L.add(timeseries("Backend Latency Percentiles",
                 [target(bq("0.50"), "p50"), target(bq("0.90"), "p90"),
                  target(bq("0.95"), "p95"), target(bq("0.99"), "p99"),
                  target("sum(rate(wslproxy_backend_response_seconds_sum[5m])) "
                         "/ clamp_min(sum(rate(wslproxy_backend_response_seconds_count[5m])), 0.0001)", "avg")],
                 unit="s", legend_table=True, spike=0.3), w=12, h=8, x=0)
L.add(timeseries("Edge & Proxy Latency (p95)",
                 [target(eq("0.95"), "edge p95"),
                  target(pq("0.95"), "proxy p95"),
                  target(bq("0.95"), "backend p95")],
                 unit="s", legend_table=True, spike=0.3,
                 desc="Compare the three layers to localise where latency is added"), w=12, h=8, x=12)
L.newline(8)
L.add(heatmap("Backend Latency Distribution",
              [target("sum by (le) (rate(wslproxy_backend_response_seconds_bucket[5m]))", "{{le}}")],
              unit="s"), w=12, h=8, x=0)
L.add(heatmap("Edge Request-Duration Distribution",
              [target("sum by (le) (rate(nginx_http_request_duration_seconds_bucket%s[5m]))" % HF, "{{le}}")],
              unit="s"), w=12, h=8, x=12)
L.newline(8)

# ==========================================================================
# LAYER 6 — ROUTING & RULES
# ==========================================================================
L.row("Layer 6 · Routing & Rules")
L.add(table("Rule → Backend Routing (sorted by traffic)",
            [target("sum by (rule_id, backend_label) (wslproxy_backend_requests_total)",
                    "", instant=True, fmt="table", ref="A"),
             target("sum by (rule_id, backend_label) (increase(wslproxy_backend_requests_total{status=~\"[45]..\"}[$__range]))",
                    "", instant=True, fmt="table", ref="B"),
             target("histogram_quantile(0.95, sum by (rule_id, backend_label, le) (rate(wslproxy_backend_response_seconds_bucket[5m])))",
                    "", instant=True, fmt="table", ref="C"),
             target("max by (rule_id, backend_label) (wslproxy_backend_healthy)",
                    "", instant=True, fmt="table", ref="D")],
            transformations=[{"id": "merge", "options": {}},
                             {"id": "organize", "options": {"renameByName": {
                                 "rule_id": "Rule", "backend_label": "Backend", "Value #A": "Requests",
                                 "Value #B": "Failures", "Value #C": "p95 Latency", "Value #D": "Health"},
                                 "excludeByName": {"Time": True}}},
                             {"id": "sortBy", "options": {"sort": [{"field": "Requests", "desc": True}]}}],
            overrides=[{"matcher": {"id": "byName", "options": "Health"},
                        "properties": [{"id": "mappings", "value": HEALTH_MAP},
                                       {"id": "custom.cellOptions", "value": {"type": "color-background"}},
                                       {"id": "thresholds", "value": HEALTH_THR}]},
                       {"matcher": {"id": "byName", "options": "p95 Latency"},
                        "properties": [{"id": "unit", "value": "s"}, {"id": "decimals", "value": 3}]}]),
      w=16, h=9, x=0)
L.add(piechart("Requests by Rule",
               [target("sum by (rule_id) (wslproxy_backend_requests_total)", "{{rule_id}}", instant=True)]),
      w=8, h=9, x=16)
L.newline(9)
L.add(bargauge("Rule Utilisation (req/s)",
               [target("topk(15, sum by (rule_id) (rate(wslproxy_backend_requests_total[5m])))",
                       "{{rule_id}}", instant=True)], unit="reqps"), w=24, h=7, x=0)
L.newline(7)

# ==========================================================================
# LAYER 7 — BACKEND / UPSTREAM HEALTH
# ==========================================================================
L.row("Layer 7 · Backend / Upstream Health")
L.add(table("Per-Backend Health (sorted by traffic)",
            [target("sum by (backend_label) (wslproxy_backend_requests_total)",
                    "", instant=True, fmt="table", ref="A"),
             target("100 * sum by (backend_label) (rate(wslproxy_backend_requests_total{status=~\"5..\"}[5m])) "
                    "/ clamp_min(sum by (backend_label) (rate(wslproxy_backend_requests_total[5m])), 0.0001)",
                    "", instant=True, fmt="table", ref="B"),
             target("histogram_quantile(0.95, sum by (backend_label, le) (rate(wslproxy_backend_response_seconds_bucket[5m])))",
                    "", instant=True, fmt="table", ref="C"),
             target("max by (backend_label) (wslproxy_backend_healthy)",
                    "", instant=True, fmt="table", ref="D"),
             target("sum by (backend_label) (rate(wslproxy_backend_requests_total[5m]))",
                    "", instant=True, fmt="table", ref="E")],
            transformations=[{"id": "merge", "options": {}},
                             {"id": "organize", "options": {"renameByName": {
                                 "backend_label": "Backend", "Value #A": "Requests", "Value #B": "Error %",
                                 "Value #C": "p95 Latency", "Value #D": "Healthy", "Value #E": "Req/s"},
                                 "excludeByName": {"Time": True}}},
                             {"id": "sortBy", "options": {"sort": [{"field": "Requests", "desc": True}]}}],
            overrides=[{"matcher": {"id": "byName", "options": "Healthy"},
                        "properties": [{"id": "mappings", "value": HEALTH_MAP},
                                       {"id": "custom.cellOptions", "value": {"type": "color-background"}},
                                       {"id": "thresholds", "value": HEALTH_THR}]},
                       {"matcher": {"id": "byName", "options": "Error %"},
                        "properties": [{"id": "unit", "value": "percent"}, {"id": "decimals", "value": 2},
                                       {"id": "custom.cellOptions", "value": {"type": "color-text"}},
                                       {"id": "thresholds", "value": ERR_THR}]},
                       {"matcher": {"id": "byName", "options": "p95 Latency"},
                        "properties": [{"id": "unit", "value": "s"}, {"id": "decimals", "value": 3},
                                       {"id": "custom.cellOptions", "value": {"type": "color-text"}},
                                       {"id": "thresholds", "value": LAT_THR}]},
                       {"matcher": {"id": "byName", "options": "Req/s"},
                        "properties": [{"id": "unit", "value": "reqps"}, {"id": "decimals", "value": 2}]}]),
      w=16, h=9, x=0)
L.add(gauge("Fleet Availability %",
            [target("100 * count(wslproxy_backend_healthy == 1) / clamp_min(count(wslproxy_backend_healthy), 1)",
                    "", instant=True)], thr=AVAIL_THR, minv=0, maxv=100,
            desc="Share of backends currently healthy"), w=8, h=9, x=16)
L.newline(9)
L.add(statetimeline("Backend Health State Timeline",
                    [target("wslproxy_backend_healthy", "{{backend_label}}")],
                    mappings=HEALTH_MAP, thr=HEALTH_THR), w=24, h=7, x=0)
L.newline(7)

# ==========================================================================
# LAYER 8 — SATURATION & CAPACITY
# ==========================================================================
L.row("Layer 8 · Saturation & Capacity (golden signal)")
L.add(timeseries("Active Connections", [target("nginx_http_connections{state=\"active\"}", "active")],
                 unit="short", fill=20), w=8, h=8, x=0)
L.add(timeseries("Connection States (stacked)",
                 [target("nginx_http_connections{state=\"waiting\"}", "waiting"),
                  target("nginx_http_connections{state=\"reading\"}", "reading"),
                  target("nginx_http_connections{state=\"writing\"}", "writing")],
                 unit="short", stack=True, legend_table=True), w=8, h=8, x=8)
L.add(bargauge("Backend Saturation (req/s by backend)",
               [target("sum by (backend_label) (rate(wslproxy_backend_requests_total[5m]))",
                       "{{backend_label}}", instant=True)], unit="reqps"), w=8, h=8, x=16)
L.newline(8)
L.add(timeseries("API Calls Rate (admin plane)",
                 [target("sum by (status) (rate(api_calls_total[5m]))", "{{status}}")],
                 unit="reqps", stack=True, legend_table=True), w=12, h=7, x=0)
L.add(stat("Metric Emit Errors", [target("nginx_metric_errors_total", "", instant=True)],
           thr=thresholds([{"color": "green", "value": None}, {"color": "red", "value": 1}]),
           color_mode="background",
           desc="lua-prometheus internal errors — non-zero means dropped metrics"), w=4, h=7, x=12)
L.add(stat("Peak Req/s (range)",
           [target("max_over_time(sum(rate(nginx_http_requests_total%s[5m]))[$__range:1m])" % HF, "", instant=True)],
           unit="reqps", decimals=1), w=4, h=7, x=16)
L.add(stat("Peak Active Conns (range)",
           [target("max_over_time(sum(nginx_http_connections{state=\"active\"})[$__range:1m])", "", instant=True)],
           unit="short"), w=4, h=7, x=20)
L.newline(7)

# ==========================================================================
# LAYER 9 — CACHE EFFICIENCY
# ==========================================================================
L.row("Layer 9 · Cache Efficiency")
L.add(timeseries("Cache Activity Rate",
                 [target("sum(rate(nginx_cache_hits_total[5m]))", "hits/s"),
                  target("sum(rate(nginx_cache_misses_total[5m]))", "misses/s"),
                  target("sum(rate(nginx_cache_bypasses_total[5m]))", "bypasses/s")],
                 unit="reqps", legend_table=True), w=12, h=8, x=0)
L.add(gauge("Cache Hit Ratio % (5m)",
            [target("100 * sum(rate(nginx_cache_hits_total[5m])) / clamp_min(sum(rate(nginx_cache_hits_total[5m])) "
                    "+ sum(rate(nginx_cache_misses_total[5m])), 0.0001)", "", instant=True)],
            thr=RATIO_THR, minv=0, maxv=100), w=6, h=8, x=12)
L.add(piechart("Bypasses by Reason",
               [target("sum by (reason) (increase(nginx_cache_bypasses_total[$__range]))", "{{reason}}", instant=True)]),
      w=6, h=8, x=18)
L.newline(8)
L.add(bargauge("Cache Hit Ratio by Host",
               [target("100 * sum by (host) (rate(nginx_cache_hits_total[5m])) "
                       "/ clamp_min(sum by (host) (rate(nginx_cache_hits_total[5m])) "
                       "+ sum by (host) (rate(nginx_cache_misses_total[5m])), 0.0001)",
                       "{{host}}", instant=True)], unit="percent", thr=RATIO_THR,
               desc="Note: this is the SRE summary view — see the dedicated 'WSL Proxy - Cache' "
                    "dashboard for per-extension, stores and content-type detail."), w=24, h=7, x=0)
L.newline(7)

# ==========================================================================
# LAYER 10 — SECURITY, AUTH & OBSERVABILITY
# ==========================================================================
L.row("Layer 10 · Security, Auth & Observability")
L.add(timeseries("Suspicious Requests by Reason",
                 [target("sum by (reason) (rate(nginx_http_suspicious_requests_total[5m]))", "{{reason}}")],
                 unit="reqps", stack=True, legend_table=True), w=12, h=8, x=0)
L.add(timeseries("Auth Attempts (success vs failure)",
                 [target("sum by (result) (rate(api_auth_attempts_total[5m]))", "{{result}}"),
                  target("sum by (reason) (rate(api_auth_failures_total[5m]))", "fail: {{reason}}")],
                 unit="reqps", legend_table=True), w=12, h=8, x=12)
L.newline(8)
L.add(table("Top Suspicious Sources (host, reason)",
            [target("topk(15, sum by (host, reason) (increase(nginx_http_suspicious_requests_total[$__range])))",
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"host": "Host", "reason": "Reason", "Value": "Count"},
                "excludeByName": {"Time": True}}},
                {"id": "sortBy", "options": {"sort": [{"field": "Count", "desc": True}]}}]), w=8, h=8, x=0)
L.add(timeseries("WAF Inspection p95 (s)",
                 [target("histogram_quantile(0.95, sum by (le) (rate(nginx_waf_inspection_duration_seconds_bucket[5m])))",
                         "waf p95")], unit="s", legend_table=True,
                 desc="Populates when WAF body inspection runs; empty if no policy is inspecting bodies"),
      w=8, h=8, x=8)
L.add(text("Observability & honest gaps",
           "**Scrape health** is below. `up` / `scrape_*` are synthesised by the scraping Prometheus, "
           "not by the endpoint.\n\n"
           "**Not exported** by lua-prometheus (so not shown): `go_*`, `process_*` (CPU/RSS/FD), cache "
           "size/evictions, health-check duration. Saturation uses connection state + metric-emit "
           "errors as the closest real signals.\n\n"
           "Companion dashboards: **WSL Proxy - Backend Health** and **WSL Proxy - Cache**."),
      w=8, h=8, x=16)
L.newline(8)
L.add(stat("Target Up", [target("up{instance=~\"$instance\"}", "{{instance}}", instant=True)],
           mappings=UP_MAP, thr=HEALTH_THR, color_mode="background", text_mode="value"), w=6, h=5, x=0)
L.add(stat("Scrape Duration",
           [target("scrape_duration_seconds{instance=~\"$instance\"}", "{{instance}}", instant=True)],
           unit="s", decimals=3,
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1},
                           {"color": "red", "value": 5}])), w=6, h=5, x=6)
L.add(stat("Scraped Samples",
           [target("scrape_samples_scraped{instance=~\"$instance\"}", "{{instance}}", instant=True)],
           unit="short"), w=6, h=5, x=12)
L.add({"type": "alertlist", "title": "Firing & Pending Alerts", "datasource": None,
       "options": {"showOptions": "current", "maxItems": 15, "sortOrder": 1, "dashboardAlerts": False,
                   "alertName": "", "stateFilter": {"firing": True, "pending": True, "normal": False,
                                                    "error": True, "noData": False}}}, w=6, h=5, x=18)
L.newline(5)

# ==========================================================================
# TEMPLATING
# ==========================================================================
def qvar(name, label, query):
    return {"name": name, "label": label, "type": "query", "datasource": DS,
            "definition": query, "query": {"query": query, "refId": name},
            "refresh": 2, "sort": 1, "multi": True, "includeAll": True,
            "allValue": ".*", "regex": "", "current": {}, "options": [], "hide": 0}

templating = {"list": [
    {"name": "datasource", "label": "Datasource", "type": "datasource",
     "query": "prometheus", "refresh": 1, "current": {}, "hide": 0, "regex": ""},
    qvar("env", "Environment", "label_values(nginx_http_requests_total, env)"),
    qvar("instance", "Instance", "label_values(nginx_http_requests_total, instance)"),
    qvar("host", "Host (vHost)", "label_values(nginx_http_requests_total, host)"),
]}

annotations = {"list": [
    {"name": "Annotations & Alerts", "type": "dashboard", "iconColor": "rgba(0, 211, 255, 1)",
     "enable": True, "hide": True, "builtIn": 1,
     "datasource": {"type": "grafana", "uid": "-- Grafana --"}},
    {"name": "Backend went unhealthy", "datasource": DS, "enable": True, "iconColor": "red",
     "expr": "changes(wslproxy_backend_healthy[2m]) > 0 and wslproxy_backend_healthy == 0",
     "titleFormat": "Backend UNHEALTHY", "textFormat": "{{backend_label}} (rule {{rule_id}})", "step": "1m"},
    {"name": "5xx spike", "datasource": DS, "enable": False, "iconColor": "orange",
     "expr": "sum(rate(nginx_http_5xx_errors_total[2m])) > 0.5",
     "titleFormat": "5xx spike", "textFormat": "cluster 5xx rate elevated", "step": "1m"},
]}

# apply env filter to every panel target ----------------------------------
for _p in L.panels:
    for _t in _p.get("targets", []):
        if "expr" in _t:
            _t["expr"] = inject_env(_t["expr"])

dashboard = {
    "uid": "wslproxy-sre",
    "title": "WSL Proxy - SRE (10 Layers)",
    "tags": ["wslproxy", "sre", "golden-signals", "production", "openresty"],
    "timezone": "browser", "schemaVersion": 39, "version": 1, "editable": True,
    "graphTooltip": 1, "refresh": "30s",
    "time": {"from": "now-6h", "to": "now"},
    "timepicker": {"refresh_intervals": ["10s", "30s", "1m", "5m", "15m", "1h"]},
    "fiscalYearStartMonth": 0, "liveNow": False, "weekStart": "",
    "templating": templating, "annotations": annotations, "panels": L.panels,
    "links": [
        {"title": "WSL Proxy dashboards", "type": "dashboards", "icon": "dashboard",
         "asDropdown": True, "tags": ["wslproxy"], "targetBlank": False, "tooltip": ""},
        {"title": "Metrics endpoint", "type": "link", "icon": "external link",
         "url": "https://prod-our.wslproxy.com/metrics", "targetBlank": True,
         "tooltip": "Raw Prometheus metrics", "tags": []},
    ],
}

out = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "grafana",
                                   "dashboards", "wsl-proxy-sre.json"))
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print("Wrote %s (%d panels incl. rows)" % (out, len(L.panels)))
