#!/usr/bin/env python3
"""
Generate the "WSL Proxy - Domain Deep-Dive" Grafana dashboard JSON.

A developer-focused, single-vHost view: pick your domain and see its whole story
on one page — traffic, errors, latency, endpoints, cache, clients — instead of
grepping logs or clicking through the admin UI. Every PromQL expression uses ONLY
metrics that exist on https://prod-our.wslproxy.com/metrics (verified live) and
that carry a `host` label, so the whole board scopes to the selected domain.

Honest scope note: backend/upstream and rule metrics
(wslproxy_backend_requests_total, nginx_proxy_requests_total) are NOT host-labelled,
so "which backend/rule serves this host" cannot be filtered per-domain from
Prometheus. That detail lives in the Backend Health dashboard + the admin UI.

Run:  python3 scripts/build_domain_dashboard.py
Out:  grafana/dashboards/wsl-proxy-domain.json
"""
import json
import os
import re

DS = {"type": "prometheus", "uid": "${datasource}"}

# --------------------------------------------------------------- env filtering
ENV_METRICS = [
    "nginx_http_requests_total", "nginx_http_errors_total",
    "nginx_http_4xx_errors_total", "nginx_http_5xx_errors_total",
    "nginx_http_request_duration_seconds_bucket",
    "nginx_http_request_size_bytes_sum", "nginx_http_response_size_bytes_sum",
    "nginx_http_suspicious_requests_total", "nginx_http_requests_by_ip_total",
    "nginx_cache_hits_total", "nginx_cache_misses_total",
    "nginx_cache_bypasses_total", "nginx_cache_enabled",
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
               legend_table=False, spike=None):
    custom = {"drawStyle": "line", "lineInterpolation": "smooth", "lineWidth": 2,
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


# thresholds ---------------------------------------------------------------
ERR_THR = thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1},
                      {"color": "red", "value": 5}])
LAT_THR = thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 0.1},
                      {"color": "red", "value": 0.3}])
AVAIL_THR = thresholds([{"color": "red", "value": None}, {"color": "yellow", "value": 99},
                        {"color": "green", "value": 99.9}])
RATIO_THR = thresholds([{"color": "red", "value": None}, {"color": "yellow", "value": 50},
                        {"color": "green", "value": 80}])
ENABLED_MAP = [{"type": "value", "options": {"0": {"text": "DISABLED", "color": "red"},
                                             "1": {"text": "ENABLED", "color": "green"}}}]
ENABLED_THR = thresholds([{"color": "red", "value": None}, {"color": "green", "value": 1}])

# host filter: single-select exact match on the selected domain
HF = '{host="$host"}'


def dur_q(p, by=""):
    grp = "le" if not by else (by + ", le")
    return ("histogram_quantile(%s, sum by (%s) (rate(nginx_http_request_duration_seconds_bucket%s[5m])))"
            % (p, grp, HF))


L = Layout()

# ==========================================================================
# HEADER
# ==========================================================================
L.row("ℹ️  Domain Deep-Dive — everything about one vHost")
L.add(text("What is this?",
           "**Pick a domain** (the `Host` variable, top-left) and this whole page scopes to it: "
           "traffic, errors, latency, endpoints, cache and clients — one place to answer "
           "\"why is *my* site slow/broken?\" without grepping logs.\n\n"
           "**Scope note:** these are **edge** metrics (everything the proxy sees for this Host). "
           "Backend/upstream & rule metrics are *not* host-labelled by the exporter, so "
           "\"which backend/rule serves this host\" isn't shown here — use **WSL Proxy - Backend "
           "Health** and the admin UI's per-server view for that. Data flow: client → WSL Proxy → "
           "`/metrics` → Prometheus → Grafana."),
      w=14, h=6, x=0)
L.add(stat("Caching Enabled",
           [target("max(nginx_cache_enabled%s) or vector(0)" % HF, "", instant=True)],
           mappings=ENABLED_MAP, thr=ENABLED_THR, color_mode="background", text_mode="value",
           desc="Is static-content caching turned on for this host"), w=4, h=6, x=14)
L.add(stat("Endpoints Seen",
           [target("count(count by (endpoint) (nginx_http_requests_total%s)) or vector(0)" % HF, "", instant=True)],
           desc="Distinct request paths observed for this host"), w=3, h=6, x=18)
L.add(stat("Client IPs",
           [target("count(count by (ip) (nginx_http_requests_by_ip_total%s)) or vector(0)" % HF, "", instant=True)],
           desc="Distinct client IPs seen for this host"), w=3, h=6, x=21)
L.newline(6)

# ==========================================================================
# ROW 1 — GOLDEN SIGNALS FOR THIS DOMAIN
# ==========================================================================
L.row("1 · Golden Signals (this domain)")
L.add(stat("Requests / sec",
           [target("sum(rate(nginx_http_requests_total%s[5m])) or vector(0)" % HF, "", instant=True)],
           unit="reqps", decimals=2, graph=True), w=4, h=4, x=0)
L.add(stat("Error Rate %",
           [target("100 * sum(rate(nginx_http_errors_total%s[5m])) "
                   "/ clamp_min(sum(rate(nginx_http_requests_total%s[5m])), 1)" % (HF, HF), "", instant=True)],
           unit="percent", decimals=2, thr=ERR_THR, color_mode="background", graph=True), w=4, h=4, x=4)
L.add(stat("4xx / sec",
           [target("sum(rate(nginx_http_4xx_errors_total%s[5m])) or vector(0)" % HF, "", instant=True)],
           unit="reqps", decimals=2,
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1}])), w=4, h=4, x=8)
L.add(stat("5xx / sec",
           [target("sum(rate(nginx_http_5xx_errors_total%s[5m])) or vector(0)" % HF, "", instant=True)],
           unit="reqps", decimals=2, color_mode="background",
           thr=thresholds([{"color": "green", "value": None}, {"color": "red", "value": 0.05}])), w=4, h=4, x=12)
L.add(stat("p95 Latency",
           [target(dur_q("0.95"), "", instant=True)],
           unit="s", decimals=3, thr=LAT_THR, color_mode="background", graph=True), w=4, h=4, x=16)
L.add(stat("Cache Hit %",
           [target("100 * sum(rate(nginx_cache_hits_total%s[5m])) / clamp_min(sum(rate(nginx_cache_hits_total%s[5m])) "
                   "+ sum(rate(nginx_cache_misses_total%s[5m])), 0.0001)" % (HF, HF, HF), "", instant=True)],
           unit="percent", decimals=1, thr=RATIO_THR), w=4, h=4, x=20)
L.newline(4)

# ==========================================================================
# ROW 2 — TRAFFIC
# ==========================================================================
L.row("2 · Traffic")
L.add(timeseries("Requests by Status Class",
                 [target("sum by (status) (rate(nginx_http_requests_total%s[5m]))" % HF, "{{status}}")],
                 unit="reqps", stack=True, legend_table=True), w=12, h=8, x=0)
L.add(timeseries("Throughput (in / out bytes)",
                 [target("sum(rate(nginx_http_request_size_bytes_sum%s[5m])) or vector(0)" % HF, "incoming"),
                  target("sum(rate(nginx_http_response_size_bytes_sum%s[5m])) or vector(0)" % HF, "outgoing")],
                 unit="Bps", legend_table=True), w=12, h=8, x=12)
L.newline(8)
L.add(piechart("Requests by Method",
               [target("sum by (method) (nginx_http_requests_total%s)" % HF, "{{method}}", instant=True)]),
      w=8, h=8, x=0)
L.add(piechart("Requests by Status",
               [target("sum by (status) (nginx_http_requests_total%s)" % HF, "{{status}}", instant=True)]),
      w=8, h=8, x=8)
L.add(stat("Total Requests (range)",
           [target("sum(increase(nginx_http_requests_total%s[$__range])) or vector(0)" % HF, "", instant=True)],
           unit="short", graph=False), w=8, h=8, x=16)
L.newline(8)

# ==========================================================================
# ROW 3 — ERRORS
# ==========================================================================
L.row("3 · Errors")
L.add(timeseries("Error Rates by Class",
                 [target("sum(rate(nginx_http_4xx_errors_total%s[5m])) or vector(0)" % HF, "4xx"),
                  target("sum(rate(nginx_http_5xx_errors_total%s[5m])) or vector(0)" % HF, "5xx"),
                  target("sum(rate(nginx_http_errors_total%s[5m])) or vector(0)" % HF, "all errors")],
                 unit="reqps", legend_table=True, spike=0.2), w=12, h=8, x=0)
L.add(table("Top Error Endpoints (this domain)",
            [target("topk(15, sum by (endpoint, status) (increase(nginx_http_errors_total%s[$__range])))" % HF,
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"endpoint": "Endpoint", "status": "Status", "Value": "Errors"},
                "excludeByName": {"Time": True}}},
                {"id": "sortBy", "options": {"sort": [{"field": "Errors", "desc": True}]}}]), w=12, h=8, x=12)
L.newline(8)
L.add(timeseries("Suspicious Requests by Reason (this domain)",
                 [target("sum by (reason) (rate(nginx_http_suspicious_requests_total%s[5m]))" % HF, "{{reason}}")],
                 unit="reqps", stack=True, legend_table=True,
                 desc="no_user_agent / error_404 / etc — noisy or hostile clients"), w=24, h=7, x=0)
L.newline(7)

# ==========================================================================
# ROW 4 — LATENCY
# ==========================================================================
L.row("4 · Latency")
L.add(timeseries("Latency Percentiles (this domain)",
                 [target(dur_q("0.50"), "p50"), target(dur_q("0.90"), "p90"),
                  target(dur_q("0.95"), "p95"), target(dur_q("0.99"), "p99")],
                 unit="s", legend_table=True, spike=0.3), w=12, h=8, x=0)
L.add(heatmap("Request-Duration Distribution (this domain)",
              [target("sum by (le) (rate(nginx_http_request_duration_seconds_bucket%s[5m]))" % HF, "{{le}}")],
              unit="s"), w=12, h=8, x=12)
L.newline(8)
L.add(table("Slowest Endpoints (p95, this domain)",
            [target("topk(20, %s)" % dur_q("0.95", by="endpoint"), "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"endpoint": "Endpoint", "Value": "p95 (s)"},
                "excludeByName": {"Time": True}}},
                {"id": "sortBy", "options": {"sort": [{"field": "p95 (s)", "desc": True}]}}],
            overrides=[{"matcher": {"id": "byName", "options": "p95 (s)"},
                        "properties": [{"id": "unit", "value": "s"}, {"id": "decimals", "value": 3},
                                       {"id": "custom.cellOptions", "value": {"type": "color-text"}},
                                       {"id": "thresholds", "value": LAT_THR}]}]), w=24, h=8, x=0)
L.newline(8)

# ==========================================================================
# ROW 5 — ENDPOINTS
# ==========================================================================
L.row("5 · Endpoints")
L.add(bargauge("Top Endpoints by Requests",
               [target("topk(15, sum by (endpoint) (nginx_http_requests_total%s))" % HF, "{{endpoint}}", instant=True)],
               unit="short"), w=12, h=9, x=0)
L.add(table("Endpoint Breakdown (requests · errors · p95)",
            [target("sum by (endpoint) (nginx_http_requests_total%s)" % HF,
                    "", instant=True, fmt="table", ref="A"),
             target("sum by (endpoint) (increase(nginx_http_errors_total%s[$__range]))" % HF,
                    "", instant=True, fmt="table", ref="B"),
             target(dur_q("0.95", by="endpoint"), "", instant=True, fmt="table", ref="C")],
            transformations=[{"id": "merge", "options": {}},
                             {"id": "organize", "options": {"renameByName": {
                                 "endpoint": "Endpoint", "Value #A": "Requests", "Value #B": "Errors",
                                 "Value #C": "p95 (s)"}, "excludeByName": {"Time": True}}},
                             {"id": "sortBy", "options": {"sort": [{"field": "Requests", "desc": True}]}}],
            overrides=[{"matcher": {"id": "byName", "options": "p95 (s)"},
                        "properties": [{"id": "unit", "value": "s"}, {"id": "decimals", "value": 3},
                                       {"id": "custom.cellOptions", "value": {"type": "color-text"}},
                                       {"id": "thresholds", "value": LAT_THR}]},
                       {"matcher": {"id": "byName", "options": "Errors"},
                        "properties": [{"id": "custom.cellOptions", "value": {"type": "color-text"}},
                                       {"id": "thresholds", "value": ERR_THR}]}]), w=12, h=9, x=12)
L.newline(9)

# ==========================================================================
# ROW 6 — CACHE (this domain)
# ==========================================================================
L.row("6 · Cache (this domain)")
L.add(gauge("Cache Hit Ratio %",
            [target("100 * sum(rate(nginx_cache_hits_total%s[5m])) / clamp_min(sum(rate(nginx_cache_hits_total%s[5m])) "
                    "+ sum(rate(nginx_cache_misses_total%s[5m])), 0.0001)" % (HF, HF, HF), "", instant=True)],
            thr=RATIO_THR, minv=0, maxv=100), w=6, h=8, x=0)
L.add(timeseries("Cache Activity Rate",
                 [target("sum(rate(nginx_cache_hits_total%s[5m])) or vector(0)" % HF, "hits/s"),
                  target("sum(rate(nginx_cache_misses_total%s[5m])) or vector(0)" % HF, "misses/s"),
                  target("sum(rate(nginx_cache_bypasses_total%s[5m])) or vector(0)" % HF, "bypasses/s")],
                 unit="reqps", legend_table=True), w=12, h=8, x=6)
L.add(piechart("Cache Bypasses by Reason",
               [target("sum by (reason) (increase(nginx_cache_bypasses_total%s[$__range]))" % HF,
                       "{{reason}}", instant=True)]), w=6, h=8, x=18)
L.newline(8)

# ==========================================================================
# ROW 7 — CLIENTS
# ==========================================================================
L.row("7 · Clients (this domain)")
L.add(table("Top Client IPs",
            [target("topk(25, sum by (ip) (nginx_http_requests_by_ip_total%s))" % HF,
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"ip": "Client IP", "Value": "Requests"},
                "excludeByName": {"Time": True}}},
                {"id": "sortBy", "options": {"sort": [{"field": "Requests", "desc": True}]}}],
            desc="Highest-volume client IPs hitting this domain — spot scrapers / abuse / a busy integration"),
      w=12, h=9, x=0)
L.add(bargauge("Top Client IPs (share)",
               [target("topk(15, sum by (ip) (nginx_http_requests_by_ip_total%s))" % HF, "{{ip}}", instant=True)],
               unit="short"), w=12, h=9, x=12)
L.newline(9)

# ==========================================================================
# ROW 8 — BACKEND / ROUTING (pointer, not host-scoped)
# ==========================================================================
L.row("8 · Backend & Routing (see note)")
L.add(text("Backend / rule attribution is not per-host in metrics",
           "The exporter labels backend/upstream metrics by **rule / backend / upstream**, "
           "**not by host** — so which backend or rule serves *this specific domain* cannot be "
           "filtered here from Prometheus.\n\n"
           "To trace this domain's routing:\n"
           "- **WSL Proxy - Backend Health** dashboard → per-backend health, latency, error % (fleet-wide).\n"
           "- **Admin UI** → the server's *Server Rules* tab shows exactly which rules & backends this "
           "host is bound to, and the *Topology* tab draws the graph.\n"
           "- `GET /api/topology/graph` returns the host→rule→backend edges programmatically."),
      w=24, h=5, x=0)
L.newline(5)

# ==========================================================================
# TEMPLATING
# ==========================================================================
def qvar(name, label, query, multi, includeAll):
    return {"name": name, "label": label, "type": "query", "datasource": DS,
            "definition": query, "query": {"query": query, "refId": name},
            "refresh": 2, "sort": 1, "multi": multi, "includeAll": includeAll,
            "allValue": ".*" if includeAll else None, "regex": "",
            "current": {}, "options": [], "hide": 0}

templating = {"list": [
    {"name": "datasource", "label": "Datasource", "type": "datasource",
     "query": "prometheus", "refresh": 1, "current": {}, "hide": 0, "regex": ""},
    qvar("env", "Environment", "label_values(nginx_http_requests_total, env)", multi=True, includeAll=True),
    # host is single-select — this is a per-DOMAIN deep-dive
    qvar("host", "Host (domain)", "label_values(nginx_http_requests_total, host)", multi=False, includeAll=False),
]}

annotations = {"list": [
    {"name": "Annotations & Alerts", "type": "dashboard", "iconColor": "rgba(0, 211, 255, 1)",
     "enable": True, "hide": True, "builtIn": 1,
     "datasource": {"type": "grafana", "uid": "-- Grafana --"}},
    {"name": "5xx spike (this domain)", "datasource": DS, "enable": True, "iconColor": "red",
     "expr": "sum(rate(nginx_http_5xx_errors_total{host=\"$host\"}[2m])) > 0.2",
     "titleFormat": "5xx spike", "textFormat": "$host 5xx elevated", "step": "1m"},
]}

# apply env filter to every panel target ----------------------------------
for _p in L.panels:
    for _t in _p.get("targets", []):
        if "expr" in _t:
            _t["expr"] = inject_env(_t["expr"])

dashboard = {
    "uid": "wslproxy-domain",
    "title": "WSL Proxy - Domain Deep-Dive",
    "tags": ["wslproxy", "domain", "vhost", "developer", "production", "openresty"],
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
                                   "dashboards", "wsl-proxy-domain.json"))
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print("Wrote %s (%d panels incl. rows)" % (out, len(L.panels)))
