#!/usr/bin/env python3
"""
Generate the "WSL Proxy - Backend Health" Grafana dashboard JSON.

Every PromQL expression here uses ONLY metrics that actually exist on
https://prod-our.wslproxy.com/metrics (verified — see docs/METRICS_INVENTORY.md).
No metric names are invented.

Run:  python3 scripts/build_dashboard.py
Out:  grafana/dashboards/wsl-proxy-backend-health.json
"""
import json
import os

DS = {"type": "prometheus", "uid": "${datasource}"}

# ---------------------------------------------------------------- layout helper
class Layout:
    def __init__(self):
        self.y = 0
        self.panels = []
        self._id = 0

    def nid(self):
        self._id += 1
        return self._id

    def row(self, title, collapsed=False):
        self.panels.append({
            "id": self.nid(), "type": "row", "title": title,
            "collapsed": collapsed, "gridPos": {"h": 1, "w": 24, "x": 0, "y": self.y},
            "panels": [],
        })
        self.y += 1

    def add(self, panel, w, h, x):
        panel["id"] = self.nid()
        panel["gridPos"] = {"h": h, "w": w, "x": x, "y": self.y}
        self.panels.append(panel)

    def newline(self, h):
        self.y += h


# ---------------------------------------------------------------- panel helpers
def target(expr, legend="", instant=False, fmt="time_series", ref="A"):
    return {
        "datasource": DS, "expr": expr, "legendFormat": legend,
        "instant": instant, "range": not instant, "format": fmt, "refId": ref,
    }


def thresholds(steps):
    return {"mode": "absolute", "steps": steps}


GREEN_YELLOW_RED = [
    {"color": "green", "value": None},
    {"color": "yellow", "value": 1},
    {"color": "red", "value": 5},
]


def stat(title, targets, unit="short", decimals=None, color_mode="value",
         thr=None, mappings=None, text_mode="auto", graph=False, desc=""):
    fc = {"unit": unit, "mappings": mappings or [],
          "thresholds": thr or thresholds([{"color": "green", "value": None}]),
          "color": {"mode": "thresholds"}}
    if decimals is not None:
        fc["decimals"] = decimals
    return {
        "type": "stat", "title": title, "datasource": DS, "description": desc,
        "targets": targets,
        "fieldConfig": {"defaults": fc, "overrides": []},
        "options": {
            "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
            "orientation": "auto", "colorMode": color_mode, "graphMode": "area" if graph else "none",
            "justifyMode": "auto", "textMode": text_mode,
        },
    }


def gauge(title, targets, unit="percent", thr=None, minv=0, maxv=100, desc=""):
    return {
        "type": "gauge", "title": title, "datasource": DS, "description": desc,
        "targets": targets,
        "fieldConfig": {"defaults": {
            "unit": unit, "min": minv, "max": maxv,
            "thresholds": thr or thresholds([{"color": "green", "value": None}]),
            "color": {"mode": "thresholds"}}, "overrides": []},
        "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                    "showThresholdLabels": False, "showThresholdMarkers": True},
    }


def bargauge(title, targets, unit="short", desc="", orientation="horizontal", thr=None):
    return {
        "type": "bargauge", "title": title, "datasource": DS, "description": desc,
        "targets": targets,
        "fieldConfig": {"defaults": {
            "unit": unit, "color": {"mode": "thresholds"},
            "thresholds": thr or thresholds([{"color": "green", "value": None}])}, "overrides": []},
        "options": {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
                    "orientation": orientation, "displayMode": "gradient",
                    "showUnfilled": True, "valueMode": "color"},
    }


def timeseries(title, targets, unit="short", desc="", stack=False,
               fill=10, legend_table=False, spike=False, draw="line"):
    custom = {
        "drawStyle": draw, "lineInterpolation": "smooth", "lineWidth": 2,
        "fillOpacity": fill, "gradientMode": "opacity", "spanNulls": False,
        "showPoints": "never", "pointSize": 5,
        "stacking": {"mode": "normal" if stack else "none", "group": "A"},
        "axisPlacement": "auto", "axisLabel": "", "scaleDistribution": {"type": "linear"},
    }
    fc = {"defaults": {"unit": unit, "color": {"mode": "palette-classic"}, "custom": custom},
          "overrides": []}
    legend = {"showLegend": True, "displayMode": "table" if legend_table else "list",
              "placement": "bottom",
              "calcs": ["mean", "max", "lastNotNull"] if legend_table else []}
    p = {"type": "timeseries", "title": title, "datasource": DS, "description": desc,
         "targets": targets, "fieldConfig": fc,
         "options": {"legend": legend, "tooltip": {"mode": "multi", "sort": "desc"}}}
    if spike:
        p["fieldConfig"]["defaults"]["thresholds"] = thresholds([
            {"color": "green", "value": None}, {"color": "red", "value": 0.3}])
        custom["thresholdsStyle"] = {"mode": "dashed"}
    return p


def piechart(title, targets, unit="short", desc="", legend_values=True):
    return {
        "type": "piechart", "title": title, "datasource": DS, "description": desc,
        "targets": targets,
        "fieldConfig": {"defaults": {"unit": unit, "color": {"mode": "palette-classic"}}, "overrides": []},
        "options": {
            "pieType": "donut", "displayLabels": ["percent"],
            "legend": {"showLegend": True, "displayMode": "table", "placement": "right",
                       "values": ["value", "percent"] if legend_values else []},
            "reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
            "tooltip": {"mode": "single", "sort": "desc"}},
    }


def statetimeline(title, targets, desc="", mappings=None, thr=None):
    return {
        "type": "state-timeline", "title": title, "datasource": DS, "description": desc,
        "targets": targets,
        "fieldConfig": {"defaults": {
            "custom": {"lineWidth": 0, "fillOpacity": 90, "insertNulls": False},
            "mappings": mappings or [], "color": {"mode": "thresholds"},
            "thresholds": thr or thresholds([{"color": "green", "value": None}])}, "overrides": []},
        "options": {"mergeValues": True, "showValue": "never", "alignValue": "center",
                    "rowHeight": 0.9, "legend": {"showLegend": True, "displayMode": "list",
                                                 "placement": "bottom"}},
    }


def statushistory(title, targets, desc="", mappings=None, thr=None):
    p = statetimeline(title, targets, desc, mappings, thr)
    p["type"] = "status-history"
    return p


def heatmap(title, targets, desc="", unit="s"):
    return {
        "type": "heatmap", "title": title, "datasource": DS, "description": desc,
        "targets": targets,
        "options": {"calculate": False, "cellGap": 1, "color": {"scheme": "Spectral", "mode": "scheme"},
                    "yAxis": {"unit": unit}, "tooltip": {"show": True, "yHistogram": True},
                    "legend": {"show": True}},
        "fieldConfig": {"defaults": {"custom": {"scaleDistribution": {"type": "linear"}}}, "overrides": []},
    }


def text(title, content, mode="markdown"):
    return {"type": "text", "title": title, "datasource": None,
            "options": {"mode": mode, "content": content}, "transparent": False}


def table(title, targets, desc="", transformations=None, overrides=None):
    return {
        "type": "table", "title": title, "datasource": DS, "description": desc,
        "targets": targets,
        "transformations": transformations or [],
        "fieldConfig": {"defaults": {
            "custom": {"align": "auto", "cellOptions": {"type": "auto"}, "filterable": True,
                       "inspect": False},
            "color": {"mode": "thresholds"},
            "thresholds": thresholds([{"color": "green", "value": None}])},
            "overrides": overrides or []},
        "options": {"showHeader": True, "cellHeight": "sm",
                    "footer": {"show": False, "reducer": ["sum"], "fields": ""}},
    }


# thresholds presets --------------------------------------------------------
ERR_THR = thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1},
                      {"color": "red", "value": 5}])
LAT_THR = thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 0.1},
                      {"color": "red", "value": 0.3}])
AVAIL_THR = thresholds([{"color": "red", "value": None}, {"color": "yellow", "value": 99},
                        {"color": "green", "value": 99.999}])
HEALTH_MAP = [{"type": "value", "options": {"0": {"text": "UNHEALTHY", "color": "red", "index": 0},
                                            "1": {"text": "HEALTHY", "color": "green", "index": 1}}}]
HEALTH_THR = thresholds([{"color": "red", "value": None}, {"color": "green", "value": 1}])

L = Layout()

# ==========================================================================
# INFO ROW
# ==========================================================================
L.row("ℹ️  Dashboard Info")
info_md = (
    "| | |\n|---|---|\n"
    "| **Project** | WSL Proxy |\n"
    "| **Environment** | Production |\n"
    "| **Datasource** | Prometheus |\n"
    "| **Metrics Endpoint** | https://prod-our.wslproxy.com/metrics |\n"
    "| **Exporter** | OpenResty `lua-prometheus` |\n"
    "| **Dashboard Version** | v1 |\n"
)
L.add(text("Overview", info_md), w=10, h=6, x=0)
L.add(stat("Last Refresh", [target("vector(time()*1000)", "", instant=True)],
           unit="dateTimeAsIso", text_mode="value",
           desc="Server time at last refresh"), w=4, h=6, x=10)
L.add(stat("Active vHosts", [target("count(count by (host) (nginx_http_requests_total))", "", instant=True)],
           unit="short", desc="Distinct proxied hosts seen"), w=4, h=6, x=14)
L.add(stat("Scrape Target Up", [target("up{instance=~\"$instance\"}", "", instant=True)],
           mappings=[{"type": "value", "options": {"0": {"text": "DOWN", "color": "red"},
                                                   "1": {"text": "UP", "color": "green"}}}],
           thr=HEALTH_THR, color_mode="background", text_mode="value",
           desc="Prometheus-synthesised `up` for this endpoint"), w=6, h=6, x=18)
L.newline(6)

# ==========================================================================
# ROW 1 — EXECUTIVE OVERVIEW
# ==========================================================================
L.row("1 · Executive Overview")
ov = [
    ("Total Backends", "count(count by (backend_label) (wslproxy_backend_requests_total))", "short", None, "value"),
    ("Healthy Backends", "count(wslproxy_backend_healthy == 1) or vector(0)", "short", HEALTH_THR, "value"),
    ("Unhealthy Backends", "count(wslproxy_backend_healthy == 0) or vector(0)",
     "short", thresholds([{"color": "green", "value": None}, {"color": "red", "value": 1}]), "background"),
    ("Total Rules", "count(count by (rule_id) (wslproxy_backend_requests_total))", "short", None, "value"),
    ("Active Rules (5m)",
     "count(count by (rule_id) (rate(wslproxy_backend_requests_total[5m]) > 0)) or vector(0)", "short", None, "value"),
    ("Total Requests", "sum(nginx_http_requests_total)", "short", None, "value"),
]
x = 0
for title, expr, unit, thr, cm in ov:
    L.add(stat(title, [target(expr, "", instant=True)], unit=unit, thr=thr, color_mode=cm), w=4, h=4, x=x)
    x += 4
L.newline(4)
# second line of executive stats
L.add(stat("Requests / sec", [target("sum(rate(nginx_http_requests_total[5m]))", "", instant=True)],
           unit="reqps", decimals=1, graph=True), w=5, h=5, x=0)
L.add(stat("Error Rate %",
           [target("100 * sum(rate(nginx_http_errors_total[5m])) / clamp_min(sum(rate(nginx_http_requests_total[5m])),1)",
                   "", instant=True)],
           unit="percent", decimals=2, thr=ERR_THR, color_mode="background", graph=True), w=5, h=5, x=5)
L.add(gauge("Availability % (non-5xx)",
            [target("100 * (1 - sum(rate(nginx_http_5xx_errors_total[5m])) / clamp_min(sum(rate(nginx_http_requests_total[5m])),1))",
                    "", instant=True)],
            unit="percent", thr=AVAIL_THR, minv=95, maxv=100), w=6, h=5, x=10)
L.add(stat("Backend Fleet Status",
           [target("min(wslproxy_backend_healthy)", "", instant=True)],
           mappings=[{"type": "value", "options": {"0": {"text": "DEGRADED", "color": "red"},
                                                   "1": {"text": "ALL HEALTHY", "color": "green"}}}],
           thr=HEALTH_THR, color_mode="background", text_mode="value",
           desc="0 if any backend is unhealthy"), w=8, h=5, x=16)
L.newline(5)

# ==========================================================================
# ROW 2 — BACKEND HEALTH TABLE
# ==========================================================================
L.row("2 · Backend Health")
bh_targets = [
    target("sum by (backend_label) (wslproxy_backend_requests_total)", "", instant=True, fmt="table", ref="A"),
    target("sum by (backend_label) (increase(wslproxy_backend_requests_total{status=~\"5..\"}[$__range]))",
           "", instant=True, fmt="table", ref="B"),
    target("100 * sum by (backend_label) (rate(wslproxy_backend_requests_total{status=~\"5..\"}[5m])) "
           "/ clamp_min(sum by (backend_label) (rate(wslproxy_backend_requests_total[5m])),0.0001)",
           "", instant=True, fmt="table", ref="C"),
    target("histogram_quantile(0.95, sum by (backend_label, le) (rate(wslproxy_backend_response_seconds_bucket[5m])))",
           "", instant=True, fmt="table", ref="D"),
    target("max by (backend_label) (wslproxy_backend_healthy)", "", instant=True, fmt="table", ref="E"),
    target("sum by (backend_label) (rate(wslproxy_backend_requests_total[5m]))", "", instant=True, fmt="table", ref="F"),
]
bh_transforms = [
    {"id": "merge", "options": {}},
    {"id": "organize", "options": {"renameByName": {
        "backend_label": "Backend", "Value #A": "Requests", "Value #B": "5xx (range)",
        "Value #C": "Error %", "Value #D": "p95 Latency", "Value #E": "Healthy",
        "Value #F": "Req/s"}, "excludeByName": {"Time": True}}},
    {"id": "sortBy", "options": {"sort": [{"field": "Requests", "desc": True}]}},
]
bh_overrides = [
    {"matcher": {"id": "byName", "options": "Healthy"},
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
     "properties": [{"id": "unit", "value": "reqps"}, {"id": "decimals", "value": 2}]},
]
L.add(table("Per-Backend Health (sorted by traffic)", bh_targets, transformations=bh_transforms,
            overrides=bh_overrides,
            desc="Requests, 5xx count, error %, p95 latency and health per backend. "
                 "`Last Seen`/`Uptime` are not exported by lua-prometheus."), w=24, h=10, x=0)
L.newline(10)

# ==========================================================================
# ROW 3 — RULES WITH BACKENDS
# ==========================================================================
L.row("3 · Rules with Backends")
rb_targets = [
    target("sum by (rule_id, backend_label) (wslproxy_backend_requests_total)", "", instant=True, fmt="table", ref="A"),
    target("sum by (rule_id, backend_label) (increase(wslproxy_backend_requests_total{status=~\"[45]..\"}[$__range]))",
           "", instant=True, fmt="table", ref="B"),
    target("histogram_quantile(0.95, sum by (rule_id, backend_label, le) (rate(wslproxy_backend_response_seconds_bucket[5m])))",
           "", instant=True, fmt="table", ref="C"),
    target("max by (rule_id, backend_label) (wslproxy_backend_healthy)", "", instant=True, fmt="table", ref="D"),
    target("100 * sum by (rule_id, backend_label) (rate(wslproxy_backend_requests_total[5m])) "
           "/ scalar(clamp_min(sum(rate(wslproxy_backend_requests_total[5m])),0.0001))",
           "", instant=True, fmt="table", ref="E"),
]
rb_transforms = [
    {"id": "merge", "options": {}},
    {"id": "organize", "options": {"renameByName": {
        "rule_id": "Rule", "backend_label": "Backend", "Value #A": "Requests",
        "Value #B": "Failures", "Value #C": "p95 Latency", "Value #D": "Health",
        "Value #E": "Traffic %"}, "excludeByName": {"Time": True}}},
    {"id": "sortBy", "options": {"sort": [{"field": "Requests", "desc": True}]}},
]
rb_overrides = [
    {"matcher": {"id": "byName", "options": "Health"},
     "properties": [{"id": "mappings", "value": HEALTH_MAP},
                    {"id": "custom.cellOptions", "value": {"type": "color-background"}},
                    {"id": "thresholds", "value": HEALTH_THR}]},
    {"matcher": {"id": "byName", "options": "p95 Latency"},
     "properties": [{"id": "unit", "value": "s"}, {"id": "decimals", "value": 3}]},
    {"matcher": {"id": "byName", "options": "Traffic %"},
     "properties": [{"id": "unit", "value": "percent"}, {"id": "decimals", "value": 2},
                    {"id": "custom.cellOptions", "value": {"type": "gauge"}}, {"id": "max", "value": 100}]},
]
L.add(table("Rule → Backend Routing (sorted by traffic)", rb_targets, transformations=rb_transforms,
            overrides=rb_overrides,
            desc="`Target` = backend address (the `backend_label`)."), w=24, h=10, x=0)
L.newline(10)

# ==========================================================================
# ROW 4 — TRAFFIC
# ==========================================================================
L.row("4 · Traffic")
L.add(timeseries("Request & Response Rate",
                 [target("sum(rate(nginx_http_requests_total{host=~\"$host\"}[5m]))", "requests/s"),
                  target("sum(rate(nginx_proxy_requests_total[5m]))", "proxied responses/s")],
                 unit="reqps", legend_table=True), w=12, h=8, x=0)
L.add(timeseries("Throughput (in/out bytes)",
                 [target("sum(rate(nginx_http_request_size_bytes_sum{host=~\"$host\"}[5m]))", "incoming"),
                  target("sum(rate(nginx_http_response_size_bytes_sum{host=~\"$host\"}[5m]))", "outgoing")],
                 unit="Bps", legend_table=True,
                 desc="Derived from *_size_bytes histogram _sum series"), w=12, h=8, x=12)
L.newline(8)
L.add(stat("Peak Req/s (range)",
           [target("max_over_time(sum(rate(nginx_http_requests_total[5m]))[$__range:1m])", "", instant=True)],
           unit="reqps", decimals=1), w=6, h=4, x=0)
L.add(stat("Avg Req/s (range)",
           [target("avg_over_time(sum(rate(nginx_http_requests_total[5m]))[$__range:1m])", "", instant=True)],
           unit="reqps", decimals=1), w=6, h=4, x=6)
L.add(stat("Peak Backend Req/s",
           [target("max_over_time(sum(rate(wslproxy_backend_requests_total[5m]))[$__range:1m])", "", instant=True)],
           unit="reqps", decimals=1), w=6, h=4, x=12)
L.add(stat("Requests by Method",
           [target("sum(nginx_http_requests_total)", "", instant=True)],
           unit="short", desc="Total across all methods"), w=6, h=4, x=18)
L.newline(4)

# ==========================================================================
# ROW 5 — ERROR ANALYSIS
# ==========================================================================
L.row("5 · Error Analysis")
L.add(timeseries("Error Rates by Class",
                 [target("sum(rate(nginx_http_4xx_errors_total{host=~\"$host\"}[5m]))", "4xx"),
                  target("sum(rate(nginx_http_5xx_errors_total{host=~\"$host\"}[5m]))", "5xx"),
                  target("sum(rate(nginx_http_errors_total{host=~\"$host\"}[5m]))", "all errors")],
                 unit="reqps", legend_table=True), w=12, h=8, x=0)
L.add(timeseries("Backend Failures (5xx) by Backend",
                 [target("sum by (backend_label) (rate(wslproxy_backend_requests_total{status=~\"5..\"}[5m]))",
                         "{{backend_label}}")],
                 unit="reqps", legend_table=True), w=12, h=8, x=12)
L.newline(8)
L.add(stat("4xx / sec", [target("sum(rate(nginx_http_4xx_errors_total[5m]))", "", instant=True)],
           unit="reqps", decimals=2,
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1}])), w=4, h=4, x=0)
L.add(stat("5xx / sec", [target("sum(rate(nginx_http_5xx_errors_total[5m]))", "", instant=True)],
           unit="reqps", decimals=2, color_mode="background",
           thr=thresholds([{"color": "green", "value": None}, {"color": "red", "value": 0.1}])), w=4, h=4, x=4)
L.add(gauge("Success Rate %",
            [target("100 * (1 - sum(rate(nginx_http_errors_total[5m]))/clamp_min(sum(rate(nginx_http_requests_total[5m])),1))",
                    "", instant=True)], unit="percent", thr=AVAIL_THR, minv=90, maxv=100), w=4, h=4, x=8)
L.add(stat("Suspicious Requests /s",
           [target("sum(rate(nginx_http_suspicious_requests_total[5m]))", "", instant=True)],
           unit="reqps", decimals=3,
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 0.5}])), w=4, h=4, x=12)
L.add(stat("Auth Failures /s",
           [target("sum(rate(api_auth_failures_total[5m]))", "", instant=True)],
           unit="reqps", decimals=3,
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 0.2}])), w=4, h=4, x=16)
L.add(stat("Connection Aborts (499) /s",
           [target("sum(rate(wslproxy_backend_requests_total{status=\"499\"}[5m]))", "", instant=True)],
           unit="reqps", decimals=3), w=4, h=4, x=20)
L.newline(4)

# ==========================================================================
# ROW 6 — BACKEND LATENCY
# ==========================================================================
L.row("6 · Backend Latency")
def q(p):
    return ("histogram_quantile(%s, sum by (le) (rate(wslproxy_backend_response_seconds_bucket[5m])))" % p)
L.add(timeseries("Backend Latency Percentiles",
                 [target(q("0.50"), "p50"), target(q("0.90"), "p90"),
                  target(q("0.95"), "p95"), target(q("0.99"), "p99"),
                  target("sum(rate(wslproxy_backend_response_seconds_sum[5m]))/clamp_min(sum(rate(wslproxy_backend_response_seconds_count[5m])),0.0001)",
                         "avg")],
                 unit="s", legend_table=True, spike=True,
                 desc="Spikes highlighted at 300ms threshold"), w=12, h=8, x=0)
L.add(timeseries("Proxy (upstream) Latency Percentiles",
                 [target("histogram_quantile(0.50, sum by (le) (rate(nginx_proxy_response_time_seconds_bucket[5m])))", "p50"),
                  target("histogram_quantile(0.95, sum by (le) (rate(nginx_proxy_response_time_seconds_bucket[5m])))", "p95"),
                  target("histogram_quantile(0.99, sum by (le) (rate(nginx_proxy_response_time_seconds_bucket[5m])))", "p99")],
                 unit="s", legend_table=True, spike=True), w=12, h=8, x=12)
L.newline(8)
L.add(heatmap("Backend Latency Distribution (heatmap)",
              [target("sum by (le) (rate(wslproxy_backend_response_seconds_bucket[5m]))", "{{le}}")],
              unit="s", desc="Bucket density over time"), w=24, h=8, x=0)
L.newline(8)

# ==========================================================================
# ROW 7 — BACKEND AVAILABILITY
# ==========================================================================
L.row("7 · Backend Availability")
L.add(statetimeline("Backend Health State Timeline",
                    [target("wslproxy_backend_healthy", "{{backend_label}}")],
                    mappings=HEALTH_MAP, thr=HEALTH_THR,
                    desc="Green=healthy(1) Red=unhealthy(0) over time"), w=16, h=8, x=0)
L.add(gauge("Fleet Availability %",
            [target("100 * count(wslproxy_backend_healthy == 1) / clamp_min(count(wslproxy_backend_healthy),1)",
                    "", instant=True)], unit="percent", thr=AVAIL_THR, minv=0, maxv=100,
            desc="Share of backends currently healthy"), w=8, h=8, x=16)
L.newline(8)

# ==========================================================================
# ROW 8 — LOAD DISTRIBUTION
# ==========================================================================
L.row("8 · Backend Load Distribution")
L.add(bargauge("Requests by Backend (share)",
               [target("sum by (backend_label) (wslproxy_backend_requests_total)", "{{backend_label}}", instant=True)],
               unit="short"), w=12, h=8, x=0)
L.add(bargauge("Traffic Rate by Backend (req/s)",
               [target("sum by (backend_label) (rate(wslproxy_backend_requests_total[5m]))", "{{backend_label}}", instant=True)],
               unit="reqps"), w=12, h=8, x=12)
L.newline(8)
L.add(stat("Most Used Backend",
           [target("topk(1, sum by (backend_label) (wslproxy_backend_requests_total))", "{{backend_label}}", instant=True)],
           text_mode="name", desc="Highest lifetime request count"), w=8, h=4, x=0)
L.add(stat("Busiest Backend Now (req/s)",
           [target("topk(1, sum by (backend_label) (rate(wslproxy_backend_requests_total[5m])))",
                   "{{backend_label}}", instant=True)], unit="reqps", decimals=2, text_mode="value_and_name"), w=8, h=4, x=8)
L.add(stat("Least Used Backend",
           [target("bottomk(1, sum by (backend_label) (wslproxy_backend_requests_total))", "{{backend_label}}", instant=True)],
           text_mode="name"), w=8, h=4, x=16)
L.newline(4)

# ==========================================================================
# ROW 9 — HEALTH CHECKS
# ==========================================================================
L.row("9 · Health Checks")
L.add(statushistory("Health Check Status History",
                    [target("wslproxy_backend_healthy", "{{backend_label}}")],
                    mappings=HEALTH_MAP, thr=HEALTH_THR), w=16, h=7, x=0)
L.add(stat("Backends Passing", [target("count(wslproxy_backend_healthy == 1) or vector(0)", "", instant=True)],
           thr=HEALTH_THR, color_mode="background"), w=4, h=7, x=16)
L.add(stat("Backends Failing", [target("count(wslproxy_backend_healthy == 0) or vector(0)", "", instant=True)],
           thr=thresholds([{"color": "green", "value": None}, {"color": "red", "value": 1}]),
           color_mode="background"), w=4, h=7, x=20)
L.newline(7)
L.add(text("Health-check note",
           "> `wslproxy_backend_healthy` is the only health signal exported. "
           "Health-check **duration** and **last-check timestamp** are not exposed by "
           "the lua-prometheus exporter, so those panels from the brief are intentionally omitted."),
      w=24, h=3, x=0)
L.newline(3)

# ==========================================================================
# ROW 10 — REQUEST DISTRIBUTION (PIES)
# ==========================================================================
L.row("10 · Request Distribution")
L.add(piechart("Requests by Backend",
               [target("sum by (backend_label) (wslproxy_backend_requests_total)", "{{backend_label}}", instant=True)]),
      w=8, h=8, x=0)
L.add(piechart("Requests by Rule",
               [target("sum by (rule_id) (wslproxy_backend_requests_total)", "{{rule_id}}", instant=True)]),
      w=8, h=8, x=8)
L.add(piechart("Errors by Backend (4xx+5xx)",
               [target("sum by (backend_label) (increase(wslproxy_backend_requests_total{status=~\"[45]..\"}[$__range]))",
                       "{{backend_label}}", instant=True)]), w=8, h=8, x=16)
L.newline(8)
L.add(piechart("Requests by HTTP Status",
               [target("sum by (status) (wslproxy_backend_requests_total)", "{{status}}", instant=True)]),
      w=8, h=8, x=0)
L.add(piechart("Requests by Method",
               [target("sum by (method) (nginx_http_requests_total)", "{{method}}", instant=True)]),
      w=8, h=8, x=8)
L.add(piechart("Cache Hit vs Miss",
               [target("sum(nginx_cache_hits_total)", "hits", instant=True),
                target("sum(nginx_cache_misses_total)", "misses", instant=True)]), w=8, h=8, x=16)
L.newline(8)

# ==========================================================================
# ROW 11 — GO RUNTIME (not available)
# ==========================================================================
L.row("11 · Go Runtime")
L.add(text("Go Runtime — not applicable",
           "> **No `go_*` metrics are exported.** WSL Proxy's metrics come from the "
           "OpenResty **lua-prometheus** module embedded in nginx, not a Go process. "
           "Goroutines / heap / GC / allocations therefore do not exist on this endpoint. "
           "The closest runtime signal available is nginx worker connection state (see Row 12)."),
      w=24, h=4, x=0)
L.newline(4)

# ==========================================================================
# ROW 12 — HTTP METRICS
# ==========================================================================
L.row("12 · HTTP Metrics")
L.add(timeseries("HTTP Requests by Status Class",
                 [target("sum by (status) (rate(nginx_http_requests_total{host=~\"$host\"}[5m]))", "{{status}}")],
                 unit="reqps", stack=True, legend_table=True), w=12, h=8, x=0)
L.add(timeseries("nginx Connection States",
                 [target("nginx_http_connections", "{{state}}")], unit="short", legend_table=True,
                 desc="active / reading / writing / waiting"), w=12, h=8, x=12)
L.newline(8)
L.add(bargauge("Top Endpoints by Requests",
               [target("topk(10, sum by (endpoint) (nginx_http_requests_total))", "{{endpoint}}", instant=True)],
               unit="short"), w=12, h=8, x=0)
L.add(table("HTTP Status Code Breakdown",
            [target("sum by (status) (nginx_http_requests_total)", "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {"renameByName": {"Value": "Count"},
                                                            "excludeByName": {"Time": True}}},
                             {"id": "sortBy", "options": {"sort": [{"field": "Count", "desc": True}]}}]),
      w=12, h=8, x=12)
L.newline(8)

# ==========================================================================
# ROW 13 — PROMETHEUS SCRAPE
# ==========================================================================
L.row("13 · Prometheus Scrape")
L.add(text("Scrape metrics note",
           "> `up` and `scrape_duration_seconds` are **synthesised by the scraping "
           "Prometheus**, not exported by this endpoint. They render only when this "
           "target is scraped by Prometheus (they are empty when Grafana queries the "
           "endpoint directly)."), w=24, h=3, x=0)
L.newline(3)
L.add(stat("Target Up", [target("up{instance=~\"$instance\"}", "{{instance}}", instant=True)],
           mappings=[{"type": "value", "options": {"0": {"text": "DOWN", "color": "red"},
                                                   "1": {"text": "UP", "color": "green"}}}],
           thr=HEALTH_THR, color_mode="background", text_mode="value"), w=6, h=6, x=0)
L.add(stat("Scrape Duration",
           [target("scrape_duration_seconds{instance=~\"$instance\"}", "{{instance}}", instant=True)],
           unit="s", decimals=3,
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1},
                           {"color": "red", "value": 5}])), w=6, h=6, x=6)
L.add(stat("Scraped Samples",
           [target("scrape_samples_scraped{instance=~\"$instance\"}", "{{instance}}", instant=True)],
           unit="short"), w=6, h=6, x=12)
L.add(timeseries("Scrape Duration Over Time",
                 [target("scrape_duration_seconds{instance=~\"$instance\"}", "{{instance}}")], unit="s"),
      w=6, h=6, x=18)
L.newline(6)

# ==========================================================================
# ROW 14 — RESOURCE USAGE (limited)
# ==========================================================================
L.row("14 · Resource Usage")
L.add(text("Resource usage note",
           "> **No `process_*` metrics** (CPU, RSS, virtual memory, file descriptors) are "
           "exported by lua-prometheus. The nearest real signals are connection state and "
           "metric-emit errors below."), w=24, h=3, x=0)
L.newline(3)
L.add(timeseries("Active Connections", [target("nginx_http_connections{state=\"active\"}", "active")],
                 unit="short", fill=20), w=8, h=7, x=0)
L.add(stat("Waiting Connections", [target("sum(nginx_http_connections{state=\"waiting\"})", "", instant=True)],
           unit="short", graph=True), w=4, h=7, x=8)
L.add(stat("Metric Emit Errors", [target("nginx_metric_errors_total", "", instant=True)],
           unit="short", thr=thresholds([{"color": "green", "value": None}, {"color": "red", "value": 1}]),
           color_mode="background"), w=4, h=7, x=12)
L.add(timeseries("API Calls Rate", [target("sum by (status) (rate(api_calls_total[5m]))", "{{status}}")],
                 unit="reqps", stack=True), w=8, h=7, x=16)
L.newline(7)

# ==========================================================================
# ROW 15 — ALERTS
# ==========================================================================
L.row("15 · Alerts")
L.add({"type": "alertlist", "title": "Firing & Pending Alerts", "datasource": None,
       "options": {"showOptions": "current", "maxItems": 20, "sortOrder": 1,
                   "dashboardAlerts": False, "alertName": "", "stateFilter": {
                       "firing": True, "pending": True, "normal": False, "error": True,
                       "noData": False}},
       }, w=12, h=8, x=0)
L.add(text("Alert thresholds",
           "**Error Rate** 0-1% 🟢 · 1-5% 🟡 · >5% 🔴  \n"
           "**Latency (p95)** <100ms 🟢 · 100-300ms 🟡 · >300ms 🔴  \n"
           "**Availability** =100% 🟢 · ≥99% 🟡 · <99% 🔴  \n\n"
           "Prometheus alert rules ship in `prometheus/rules/alert-rules.yaml`; "
           "recording rules in `prometheus/rules/recording-rules.yaml`."),
      w=12, h=8, x=12)
L.newline(8)

# ==========================================================================
# USEFUL / DIAGNOSTIC PANELS
# ==========================================================================
L.row("16 · Useful Panels (Top-N & Heatmaps)")
L.add(table("Top Error Backends",
            [target("topk(10, sum by (backend_label) (increase(wslproxy_backend_requests_total{status=~\"5..\"}[$__range])))",
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"backend_label": "Backend", "Value": "5xx (range)"},
                "excludeByName": {"Time": True}}}]), w=8, h=8, x=0)
L.add(table("Slowest Backends (p95)",
            [target("topk(10, histogram_quantile(0.95, sum by (backend_label, le) (rate(wslproxy_backend_response_seconds_bucket[5m]))))",
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"backend_label": "Backend", "Value": "p95 (s)"},
                "excludeByName": {"Time": True}}}],
            overrides=[{"matcher": {"id": "byName", "options": "p95 (s)"},
                        "properties": [{"id": "unit", "value": "s"}, {"id": "decimals", "value": 3}]}]),
      w=8, h=8, x=8)
L.add(table("Rule Utilisation (req/s)",
            [target("topk(10, sum by (rule_id) (rate(wslproxy_backend_requests_total[5m])))",
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"rule_id": "Rule", "Value": "Req/s"},
                "excludeByName": {"Time": True}}}],
            overrides=[{"matcher": {"id": "byName", "options": "Req/s"},
                        "properties": [{"id": "unit", "value": "reqps"}, {"id": "decimals", "value": 2}]}]),
      w=8, h=8, x=16)
L.newline(8)
L.add(heatmap("HTTP Request Duration Heatmap",
              [target("sum by (le) (rate(nginx_http_request_duration_seconds_bucket{host=~\"$host\"}[5m]))", "{{le}}")],
              unit="s"), w=12, h=8, x=0)
L.add(heatmap("Request Rate Heatmap (by upstream)",
              [target("sum by (le) (rate(nginx_proxy_response_time_seconds_bucket[5m]))", "{{le}}")],
              unit="s"), w=12, h=8, x=12)
L.newline(8)
L.add(bargauge("Backend Saturation (req/s by backend)",
               [target("sum by (backend_label) (rate(wslproxy_backend_requests_total[5m]))", "{{backend_label}}", instant=True)],
               unit="reqps"), w=12, h=8, x=0)
L.add(bargauge("Cache Hit Ratio by Host",
               [target("100 * sum by (host) (rate(nginx_cache_hits_total[5m])) / "
                       "clamp_min(sum by (host) (rate(nginx_cache_hits_total[5m]) + rate(nginx_cache_misses_total[5m])),0.0001)",
                       "{{host}}", instant=True)], unit="percent",
               thr=thresholds([{"color": "red", "value": None}, {"color": "yellow", "value": 50},
                               {"color": "green", "value": 80}])), w=12, h=8, x=12)
L.newline(8)

# ==========================================================================
# TEMPLATING (VARIABLES)
# ==========================================================================
def qvar(name, label, query, multi=True, allv=True, includeAll=True, regex=""):
    return {
        "name": name, "label": label, "type": "query", "datasource": DS,
        "definition": query, "query": {"query": query, "refId": name},
        "refresh": 2, "sort": 1, "multi": multi, "includeAll": includeAll,
        "allValue": ".*" if allv else None, "regex": regex,
        "current": {}, "options": [], "hide": 0,
    }

templating = {"list": [
    {"name": "datasource", "label": "Datasource", "type": "datasource",
     "query": "prometheus", "refresh": 1, "current": {}, "hide": 0, "regex": ""},
    {"name": "environment", "label": "Environment", "type": "custom",
     "query": "Production", "current": {"text": "Production", "value": "Production"},
     "options": [{"text": "Production", "value": "Production", "selected": True}], "hide": 0},
    qvar("job", "Job", "label_values(nginx_http_requests_total, job)"),
    qvar("instance", "Instance", "label_values(nginx_http_requests_total, instance)"),
    qvar("host", "Host (vHost)", "label_values(nginx_http_requests_total, host)"),
    qvar("backend", "Backend", "label_values(wslproxy_backend_requests_total, backend_label)"),
    qvar("rule", "Rule", "label_values(wslproxy_backend_requests_total, rule_id)"),
    qvar("namespace", "Namespace", "label_values(namespace)"),
]}

# ==========================================================================
# ANNOTATIONS
# ==========================================================================
annotations = {"list": [
    {"name": "Annotations & Alerts", "type": "dashboard", "iconColor": "rgba(0, 211, 255, 1)",
     "enable": True, "hide": True, "builtIn": 1,
     "datasource": {"type": "grafana", "uid": "-- Grafana --"}},
    {"name": "Backend went unhealthy", "datasource": DS, "enable": True, "iconColor": "red",
     "expr": "changes(wslproxy_backend_healthy[2m]) > 0 and wslproxy_backend_healthy == 0",
     "titleFormat": "Backend UNHEALTHY", "textFormat": "{{backend_label}} (rule {{rule_id}})",
     "step": "1m"},
    {"name": "5xx spike", "datasource": DS, "enable": False, "iconColor": "orange",
     "expr": "sum(rate(nginx_http_5xx_errors_total[2m])) > 0.5",
     "titleFormat": "5xx spike", "textFormat": "cluster 5xx rate elevated", "step": "1m"},
]}

# ==========================================================================
# DASHBOARD ROOT
# ==========================================================================
dashboard = {
    "uid": "wslproxy-backend-health",
    "title": "WSL Proxy - Backend Health",
    "tags": ["wslproxy", "backend", "sre", "production", "openresty"],
    "timezone": "browser",
    "schemaVersion": 39,
    "version": 1,
    "editable": True,
    "graphTooltip": 1,
    "refresh": "30s",
    "time": {"from": "now-6h", "to": "now"},
    "timepicker": {"refresh_intervals": ["10s", "30s", "1m", "5m", "15m", "1h"]},
    "fiscalYearStartMonth": 0,
    "liveNow": False,
    "weekStart": "",
    "templating": templating,
    "annotations": annotations,
    "panels": L.panels,
    "links": [
        {"title": "Metrics endpoint", "type": "link", "icon": "external link",
         "url": "https://prod-our.wslproxy.com/metrics", "targetBlank": True,
         "tooltip": "Raw Prometheus metrics", "tags": []},
    ],
}

out = os.path.join(os.path.dirname(__file__), "..", "grafana", "dashboards",
                   "wsl-proxy-backend-health.json")
out = os.path.abspath(out)
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print("Wrote %s (%d panels incl. rows)" % (out, len(L.panels)))
