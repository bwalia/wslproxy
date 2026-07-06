#!/usr/bin/env python3
"""
Generate the "WSL Proxy - Cache" Grafana dashboard JSON.

Every PromQL expression here uses ONLY metrics that actually exist on
https://prod-our.wslproxy.com/metrics (verified live — see docs/METRICS_INVENTORY.md
"Cache" section). No metric names are invented.

Cache metrics on the OpenResty `lua-prometheus` exporter:
  nginx_cache_hits_total     counter  {host, extension}
  nginx_cache_misses_total   counter  {host, extension}
  nginx_cache_stores_total   counter  {host, extension, content_type}
  nginx_cache_bypasses_total counter  {host, reason}   reason=extension_not_cacheable|no_extension
  nginx_cache_enabled        gauge    {host}           1=enabled

There is NO metric for cache size, evictions, TTL, key count, or Docker-blob
disk cache on this endpoint, so those panels are intentionally omitted (see the
notes row).

Run:  python3 scripts/build_cache_dashboard.py
Out:  grafana/dashboards/wsl-proxy-cache.json
"""
import json
import os

DS = {"type": "prometheus", "uid": "${datasource}"}
# host + env template filter, applied to every cache selector. `env` comes from the
# per-target label set in scrape-config.yaml; `=~".*"` (the All value) also matches
# series that carry no `env` label, so this is safe against a single-target Prometheus.
HF = '{host=~"$host",env=~"$env"}'
CE = 'nginx_cache_enabled{env=~"$env"}'  # cache-enabled gauge, env-filtered


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
               fill=10, legend_table=False, draw="line"):
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
    return {"type": "timeseries", "title": title, "datasource": DS, "description": desc,
            "targets": targets, "fieldConfig": fc,
            "options": {"legend": legend, "tooltip": {"mode": "multi", "sort": "desc"}}}


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
# Cache hit ratio: higher is better → red below 50, yellow below 80, green above.
RATIO_THR = thresholds([{"color": "red", "value": None}, {"color": "yellow", "value": 50},
                        {"color": "green", "value": 80}])
ENABLED_MAP = [{"type": "value", "options": {"0": {"text": "DISABLED", "color": "red", "index": 0},
                                             "1": {"text": "ENABLED", "color": "green", "index": 1}}}]
ENABLED_THR = thresholds([{"color": "red", "value": None}, {"color": "green", "value": 1}])


# ------------------------------------------------------------- ratio expression
def ratio_by(label):
    """Robust hit-ratio % grouped by `label`, resilient to hosts/extensions that
    appear in only hits OR only misses (fills the missing side with 0 via `or`)."""
    hits = "sum by (%s) (increase(nginx_cache_hits_total%s[$__range]))" % (label, HF)
    miss = "sum by (%s) (increase(nginx_cache_misses_total%s[$__range]))" % (label, HF)
    hn = "(%s or (%s * 0))" % (hits, miss)   # hits, 0 where only misses exist
    mn = "(%s or (%s * 0))" % (miss, hits)   # misses, 0 where only hits exist
    return "100 * %s / clamp_min(%s + %s, 0.0001)" % (hn, hn, mn)


L = Layout()

# ==========================================================================
# INFO ROW
# ==========================================================================
L.row("ℹ️  Dashboard Info")
info_md = (
    "| | |\n|---|---|\n"
    "| **Project** | WSL Proxy |\n"
    "| **Focus** | Static-content cache (OpenResty `wsl_cache`) |\n"
    "| **Environment** | Production |\n"
    "| **Datasource** | Prometheus |\n"
    "| **Metrics Endpoint** | https://prod-our.wslproxy.com/metrics |\n"
    "| **Exporter** | OpenResty `lua-prometheus` |\n"
    "| **Dashboard Version** | v1 |\n"
)
L.add(text("Overview", info_md), w=10, h=6, x=0)
L.add(stat("Last Refresh", [target("vector(time()*1000)", "", instant=True)],
           unit="dateTimeAsIso", text_mode="value", desc="Server time at last refresh"), w=4, h=6, x=10)
L.add(stat("Cache-Enabled Hosts",
           [target("count(nginx_cache_enabled{env=~\"$env\"} == 1) or vector(0)", "", instant=True)],
           unit="short", desc="vHosts with caching turned on (nginx_cache_enabled == 1)"), w=4, h=6, x=14)
L.add(stat("Scrape Target Up", [target("up{instance=~\"$instance\"}", "", instant=True)],
           mappings=[{"type": "value", "options": {"0": {"text": "DOWN", "color": "red"},
                                                   "1": {"text": "UP", "color": "green"}}}],
           thr=ENABLED_THR, color_mode="background", text_mode="value",
           desc="Prometheus-synthesised `up` for this endpoint"), w=6, h=6, x=18)
L.newline(6)

# ==========================================================================
# CALLOUT — LIVE CACHE CONTENTS vs COUNTERS
# ==========================================================================
L.row("📸  Live Cache Contents vs. Counters — read me")
L.add(text("Why this dashboard does NOT match the admin UI 'Cache' page",
           "This dashboard shows **cumulative cache *event* counters** from Prometheus "
           "(`nginx_cache_{hits,misses,stores,bypasses}_total`) — *how many times* each event "
           "happened over the selected time range.\n\n"
           "The admin UI cache page (`GET /api/cache/stats` on the proxy) shows a **live snapshot "
           "of what is currently stored** — entry count, total size in bytes, entries by host/"
           "extension, top URLs, and the Docker-blob disk cache. It is a *gauge of present contents*, "
           "not a counter of events.\n\n"
           "**They are not meant to be equal.** One cached object that is stored once and then served "
           "500 times = **1 entry** in the admin UI but **1 store + 500 hits** here. The shared dict is "
           "also wiped on every OpenResty reload and entries expire by TTL, so the admin UI shrinks while "
           "these counters only grow. There is **no** cache-size / entry-count / eviction / TTL metric on "
           "the `/metrics` endpoint, so Grafana cannot reproduce the admin UI's numbers.\n\n"
           "➡️ For **current cache size & contents**, use the admin UI: "
           "`https://prod-our.wslproxy.com/#/` → Cache (or `GET /api/cache/stats`).  \n"
           "➡️ For **cache effectiveness over time** (hit ratio, bypass reasons, per-host/-extension "
           "trends), use this dashboard.\n\n"
           "Use the **Environment** variable (top-left) to scope to one env, or leave it on **All** to "
           "aggregate every scraped environment (int / test / prod)."),
      w=24, h=9, x=0)
L.newline(9)

# ==========================================================================
# ROW 1 — CACHE OVERVIEW
# ==========================================================================
L.row("1 · Cache Overview")
L.add(stat("Overall Hit Ratio % (range)",
           [target("100 * sum(increase(nginx_cache_hits_total%s[$__range])) / "
                   "clamp_min(sum(increase(nginx_cache_hits_total%s[$__range])) + "
                   "sum(increase(nginx_cache_misses_total%s[$__range])), 1)" % (HF, HF, HF),
                   "", instant=True)],
           unit="percent", decimals=1, thr=RATIO_THR, color_mode="background",
           desc="hits / (hits + misses) over the selected range. Bypasses are excluded "
                "(a bypass never consults the cache)."), w=4, h=4, x=0)
ov = [
    ("Cache Hits (range)", "sum(increase(nginx_cache_hits_total%s[$__range]))" % HF, "short"),
    ("Cache Misses (range)", "sum(increase(nginx_cache_misses_total%s[$__range]))" % HF, "short"),
    ("Cache Stores (range)", "sum(increase(nginx_cache_stores_total%s[$__range]))" % HF, "short"),
    ("Cache Bypasses (range)", "sum(increase(nginx_cache_bypasses_total%s[$__range]))" % HF, "short"),
]
x = 4
for title, expr, unit in ov:
    L.add(stat(title, [target(expr, "", instant=True)], unit=unit, decimals=0), w=4, h=4, x=x)
    x += 4
L.add(stat("Hosts Caching Enabled",
           [target("count(nginx_cache_enabled{env=~\"$env\"} == 1) or vector(0)", "", instant=True)],
           unit="short", thr=ENABLED_THR, color_mode="value"), w=4, h=4, x=20)
L.newline(4)
# second line
L.add(stat("Hits / sec", [target("sum(rate(nginx_cache_hits_total%s[5m]))" % HF, "", instant=True)],
           unit="reqps", decimals=2, graph=True), w=5, h=5, x=0)
L.add(stat("Misses / sec", [target("sum(rate(nginx_cache_misses_total%s[5m]))" % HF, "", instant=True)],
           unit="reqps", decimals=2, graph=True), w=5, h=5, x=5)
L.add(gauge("Live Hit Ratio % (5m)",
            [target("100 * sum(rate(nginx_cache_hits_total%s[5m])) / "
                    "clamp_min(sum(rate(nginx_cache_hits_total%s[5m])) + "
                    "sum(rate(nginx_cache_misses_total%s[5m])), 0.0001)" % (HF, HF, HF),
                    "", instant=True)],
            unit="percent", thr=RATIO_THR, minv=0, maxv=100,
            desc="Rolling 5-minute hit ratio"), w=6, h=5, x=10)
L.add(stat("Stores / sec", [target("sum(rate(nginx_cache_stores_total%s[5m]))" % HF, "", instant=True)],
           unit="reqps", decimals=2, graph=True), w=4, h=5, x=16)
L.add(stat("Bypasses / sec", [target("sum(rate(nginx_cache_bypasses_total%s[5m]))" % HF, "", instant=True)],
           unit="reqps", decimals=2, graph=True,
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 5}])), w=4, h=5, x=20)
L.newline(5)

# ==========================================================================
# ROW 2 — HIT RATIO & CACHE ACTIVITY OVER TIME
# ==========================================================================
L.row("2 · Hit Ratio & Cache Activity")
L.add(timeseries("Cache Activity Rate",
                 [target("sum(rate(nginx_cache_hits_total%s[5m]))" % HF, "hits/s"),
                  target("sum(rate(nginx_cache_misses_total%s[5m]))" % HF, "misses/s"),
                  target("sum(rate(nginx_cache_stores_total%s[5m]))" % HF, "stores/s"),
                  target("sum(rate(nginx_cache_bypasses_total%s[5m]))" % HF, "bypasses/s")],
                 unit="reqps", legend_table=True,
                 desc="Cache events per second across the selected hosts"), w=12, h=8, x=0)
L.add(timeseries("Overall Hit Ratio % over time",
                 [target("100 * sum(rate(nginx_cache_hits_total%s[5m])) / "
                         "clamp_min(sum(rate(nginx_cache_hits_total%s[5m])) + "
                         "sum(rate(nginx_cache_misses_total%s[5m])), 0.0001)" % (HF, HF, HF),
                         "hit ratio %")],
                 unit="percent", legend_table=True, fill=20,
                 desc="hits / (hits + misses), 5m rolling"), w=12, h=8, x=12)
L.newline(8)

# ==========================================================================
# ROW 3 — PER-HOST CACHE PERFORMANCE (TABLE)
# ==========================================================================
L.row("3 · Per-Host Cache Performance")
ph_targets = [
    target("max by (host) (nginx_cache_enabled{env=~\"$env\"})", "", instant=True, fmt="table", ref="A"),
    target("sum by (host) (increase(nginx_cache_hits_total%s[$__range]))" % HF,
           "", instant=True, fmt="table", ref="B"),
    target("sum by (host) (increase(nginx_cache_misses_total%s[$__range]))" % HF,
           "", instant=True, fmt="table", ref="C"),
    target(ratio_by("host"), "", instant=True, fmt="table", ref="D"),
    target("sum by (host) (increase(nginx_cache_stores_total%s[$__range]))" % HF,
           "", instant=True, fmt="table", ref="E"),
    target("sum by (host) (increase(nginx_cache_bypasses_total%s[$__range]))" % HF,
           "", instant=True, fmt="table", ref="F"),
    target("sum by (host) (rate(nginx_cache_hits_total%s[5m]))" % HF,
           "", instant=True, fmt="table", ref="G"),
]
ph_transforms = [
    {"id": "merge", "options": {}},
    {"id": "organize", "options": {"renameByName": {
        "host": "Host", "Value #A": "Enabled", "Value #B": "Hits", "Value #C": "Misses",
        "Value #D": "Hit Ratio %", "Value #E": "Stores", "Value #F": "Bypasses",
        "Value #G": "Hits/s"}, "excludeByName": {"Time": True}}},
    {"id": "sortBy", "options": {"sort": [{"field": "Hits", "desc": True}]}},
]
ph_overrides = [
    {"matcher": {"id": "byName", "options": "Enabled"},
     "properties": [{"id": "mappings", "value": ENABLED_MAP},
                    {"id": "custom.cellOptions", "value": {"type": "color-background"}},
                    {"id": "thresholds", "value": ENABLED_THR}]},
    {"matcher": {"id": "byName", "options": "Hit Ratio %"},
     "properties": [{"id": "unit", "value": "percent"}, {"id": "decimals", "value": 1},
                    {"id": "custom.cellOptions", "value": {"type": "gauge"}},
                    {"id": "min", "value": 0}, {"id": "max", "value": 100},
                    {"id": "thresholds", "value": RATIO_THR}]},
    {"matcher": {"id": "byName", "options": "Hits/s"},
     "properties": [{"id": "unit", "value": "reqps"}, {"id": "decimals", "value": 3}]},
]
L.add(table("Per-Host Cache (sorted by hits)", ph_targets, transformations=ph_transforms,
            overrides=ph_overrides,
            desc="Hits, misses, hit ratio, stores and bypasses per vHost over the selected range. "
                 "Hit ratio is gauge-coloured: red <50%, yellow <80%, green ≥80%."), w=24, h=11, x=0)
L.newline(11)

# ==========================================================================
# ROW 4 — HIT RATIO BREAKDOWN
# ==========================================================================
L.row("4 · Hit Ratio Breakdown")
L.add(bargauge("Hit Ratio by Host (range)",
               [target(ratio_by("host"), "{{host}}", instant=True)],
               unit="percent", thr=RATIO_THR), w=12, h=8, x=0)
L.add(bargauge("Hit Ratio by Extension (range)",
               [target(ratio_by("extension"), "{{extension}}", instant=True)],
               unit="percent", thr=RATIO_THR,
               desc="Which file types cache well. Extensions seen only as misses show 0%."), w=12, h=8, x=12)
L.newline(8)

# ==========================================================================
# ROW 5 — BY FILE EXTENSION
# ==========================================================================
L.row("5 · By File Extension")
L.add(piechart("Hits by Extension",
               [target("sum by (extension) (increase(nginx_cache_hits_total%s[$__range]))" % HF,
                       "{{extension}}", instant=True)]), w=8, h=8, x=0)
L.add(piechart("Misses by Extension",
               [target("sum by (extension) (increase(nginx_cache_misses_total%s[$__range]))" % HF,
                       "{{extension}}", instant=True)]), w=8, h=8, x=8)
L.add(piechart("Bypasses by Reason",
               [target("sum by (reason) (increase(nginx_cache_bypasses_total%s[$__range]))" % HF,
                       "{{reason}}", instant=True)],
               desc="Why requests skipped the cache entirely"), w=8, h=8, x=16)
L.newline(8)
L.add(bargauge("Hits by Extension (count)",
               [target("sum by (extension) (increase(nginx_cache_hits_total%s[$__range]))" % HF,
                       "{{extension}}", instant=True)], unit="short"), w=12, h=8, x=0)
L.add(bargauge("Misses by Extension (count)",
               [target("sum by (extension) (increase(nginx_cache_misses_total%s[$__range]))" % HF,
                       "{{extension}}", instant=True)], unit="short"), w=12, h=8, x=12)
L.newline(8)

# ==========================================================================
# ROW 6 — CACHE BYPASSES
# ==========================================================================
L.row("6 · Cache Bypasses")
L.add(timeseries("Bypass Rate by Reason",
                 [target("sum by (reason) (rate(nginx_cache_bypasses_total%s[5m]))" % HF, "{{reason}}")],
                 unit="reqps", stack=True, legend_table=True,
                 desc="`extension_not_cacheable` = extension not in the server's cached list; "
                      "`no_extension` = path had no file extension (usually dynamic content)."), w=12, h=8, x=0)
L.add(bargauge("Bypasses by Host",
               [target("sum by (host) (increase(nginx_cache_bypasses_total%s[$__range]))" % HF,
                       "{{host}}", instant=True)], unit="short"), w=12, h=8, x=12)
L.newline(8)
L.add(stat("No-Extension Bypasses (range)",
           [target("sum(increase(nginx_cache_bypasses_total{host=~\"$host\",reason=\"no_extension\"}[$__range]))",
                   "", instant=True)], unit="short",
           desc="Paths with no file extension — typically dynamic/app routes, expected to bypass"), w=8, h=4, x=0)
L.add(stat("Not-Cacheable-Extension Bypasses (range)",
           [target("sum(increase(nginx_cache_bypasses_total{host=~\"$host\",reason=\"extension_not_cacheable\"}[$__range]))",
                   "", instant=True)], unit="short",
           desc="Extension exists but isn't in the server's cached_extensions list — tune the "
                "server's cache config if these should be cached"), w=8, h=4, x=8)
L.add(stat("Total Bypass Rate /s",
           [target("sum(rate(nginx_cache_bypasses_total%s[5m]))" % HF, "", instant=True)],
           unit="reqps", decimals=2, graph=True), w=8, h=4, x=16)
L.newline(4)

# ==========================================================================
# ROW 7 — CACHE STORES (WRITES)
# ==========================================================================
L.row("7 · Cache Stores (writes)")
L.add(piechart("Stores by Content-Type",
               [target("sum by (content_type) (increase(nginx_cache_stores_total%s[$__range]))" % HF,
                       "{{content_type}}", instant=True)],
               desc="Content-Type of responses written into the cache"), w=8, h=8, x=0)
L.add(bargauge("Stores by Extension",
               [target("sum by (extension) (increase(nginx_cache_stores_total%s[$__range]))" % HF,
                       "{{extension}}", instant=True)], unit="short"), w=8, h=8, x=8)
L.add(timeseries("Store Rate by Extension",
                 [target("sum by (extension) (rate(nginx_cache_stores_total%s[5m]))" % HF, "{{extension}}")],
                 unit="reqps", stack=True, legend_table=True,
                 desc="New objects written into the cache per second"), w=8, h=8, x=16)
L.newline(8)

# ==========================================================================
# ROW 8 — CACHE ENABLEMENT
# ==========================================================================
L.row("8 · Cache Enablement")
L.add(statetimeline("Caching Enabled by Host",
                    [target("nginx_cache_enabled{env=~\"$env\"}", "{{host}}")],
                    mappings=ENABLED_MAP, thr=ENABLED_THR,
                    desc="Green=caching enabled(1) Red=disabled(0) per vHost over time"), w=16, h=8, x=0)
L.add(stat("Enabled Hosts", [target("count(nginx_cache_enabled{env=~\"$env\"} == 1) or vector(0)", "", instant=True)],
           thr=ENABLED_THR, color_mode="background"), w=4, h=8, x=16)
L.add(stat("Disabled Hosts", [target("count(nginx_cache_enabled{env=~\"$env\"} == 0) or vector(0)", "", instant=True)],
           thr=thresholds([{"color": "green", "value": None}, {"color": "yellow", "value": 1}]),
           color_mode="background"), w=4, h=8, x=20)
L.newline(8)

# ==========================================================================
# ROW 9 — TOP-N DIAGNOSTICS
# ==========================================================================
L.row("9 · Top-N Diagnostics")
L.add(table("Lowest Hit-Ratio Hosts (worst first)",
            [target("bottomk(10, %s)" % ratio_by("host"), "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"host": "Host", "Value": "Hit Ratio %"},
                "excludeByName": {"Time": True}}},
                {"id": "sortBy", "options": {"sort": [{"field": "Hit Ratio %", "desc": False}]}}],
            overrides=[{"matcher": {"id": "byName", "options": "Hit Ratio %"},
                        "properties": [{"id": "unit", "value": "percent"}, {"id": "decimals", "value": 1},
                                       {"id": "custom.cellOptions", "value": {"type": "color-text"}},
                                       {"id": "thresholds", "value": RATIO_THR}]}],
            desc="Hosts to investigate — low ratio means cacheable content is not being served from cache."),
      w=8, h=8, x=0)
L.add(table("Top Miss Hosts (range)",
            [target("topk(10, sum by (host) (increase(nginx_cache_misses_total%s[$__range])))" % HF,
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"host": "Host", "Value": "Misses"},
                "excludeByName": {"Time": True}}}]), w=8, h=8, x=8)
L.add(table("Top Hit Hosts (range)",
            [target("topk(10, sum by (host) (increase(nginx_cache_hits_total%s[$__range])))" % HF,
                    "", instant=True, fmt="table")],
            transformations=[{"id": "organize", "options": {
                "renameByName": {"host": "Host", "Value": "Hits"},
                "excludeByName": {"Time": True}}}]), w=8, h=8, x=16)
L.newline(8)

# ==========================================================================
# ROW 10 — NOTES & ALERTS
# ==========================================================================
L.row("10 · Notes & Alerts")
L.add({"type": "alertlist", "title": "Firing & Pending Alerts", "datasource": None,
       "options": {"showOptions": "current", "maxItems": 20, "sortOrder": 1,
                   "dashboardAlerts": False, "alertName": "", "stateFilter": {
                       "firing": True, "pending": True, "normal": False, "error": True,
                       "noData": False}}}, w=12, h=8, x=0)
L.add(text("What is / isn't measured",
           "**Hit ratio** = `hits / (hits + misses)` — bypasses are excluded because a bypass "
           "never consults the cache. Thresholds: <50% 🔴 · 50-80% 🟡 · ≥80% 🟢\n\n"
           "**Bypass reasons**  \n"
           "• `no_extension` — request path had no file extension (dynamic/app routes) — usually expected.  \n"
           "• `extension_not_cacheable` — extension not in the server's `cached_extensions` list — tune "
           "the server's cache config if it should be cached.\n\n"
           "**Not exported by lua-prometheus** (so no panels): cache **size on disk**, **evictions**, "
           "**TTL / freshness**, **key count**, and the Docker-blob disk cache. Only hit/miss/store/"
           "bypass counters and the per-host enabled gauge exist.\n\n"
           "Cache alert & recording rules ship in `prometheus/rules/cache-rules.yaml`."),
      w=12, h=8, x=12)
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
    qvar("env", "Environment", "label_values(nginx_cache_misses_total, env)"),
    qvar("job", "Job", "label_values(nginx_cache_misses_total, job)"),
    qvar("instance", "Instance", "label_values(nginx_cache_misses_total, instance)"),
    qvar("host", "Host (vHost)", "label_values(nginx_cache_misses_total, host)"),
    qvar("extension", "Extension", "label_values(nginx_cache_misses_total, extension)"),
]}

# ==========================================================================
# ANNOTATIONS
# ==========================================================================
annotations = {"list": [
    {"name": "Annotations & Alerts", "type": "dashboard", "iconColor": "rgba(0, 211, 255, 1)",
     "enable": True, "hide": True, "builtIn": 1,
     "datasource": {"type": "grafana", "uid": "-- Grafana --"}},
    {"name": "Caching disabled for host", "datasource": DS, "enable": True, "iconColor": "red",
     "expr": "changes(nginx_cache_enabled[5m]) > 0 and nginx_cache_enabled == 0",
     "titleFormat": "Caching DISABLED", "textFormat": "{{host}}", "step": "1m"},
]}

# ==========================================================================
# DASHBOARD ROOT
# ==========================================================================
dashboard = {
    "uid": "wslproxy-cache",
    "title": "WSL Proxy - Cache",
    "tags": ["wslproxy", "cache", "sre", "production", "openresty"],
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
        {"title": "Backend Health dashboard", "type": "dashboards", "icon": "dashboard",
         "asDropdown": True, "tags": ["wslproxy"], "targetBlank": False, "tooltip": ""},
        {"title": "Metrics endpoint", "type": "link", "icon": "external link",
         "url": "https://prod-our.wslproxy.com/metrics", "targetBlank": True,
         "tooltip": "Raw Prometheus metrics", "tags": []},
    ],
}

out = os.path.join(os.path.dirname(__file__), "..", "grafana", "dashboards",
                   "wsl-proxy-cache.json")
out = os.path.abspath(out)
with open(out, "w") as f:
    json.dump(dashboard, f, indent=2)
    f.write("\n")
print("Wrote %s (%d panels incl. rows)" % (out, len(L.panels)))
