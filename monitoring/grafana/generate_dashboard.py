#!/usr/bin/env python3
"""
WSLProxy Enterprise SRE Dashboard generator.

Generates dashboards/wslproxy-sre-dashboard.json from the metric families
actually exposed by https://prod-our-v1.wslproxy.com/metrics (the
api/prometheus_metrics.lua exporter). Re-run after editing:

    python3 monitoring/grafana/generate_dashboard.py

Design notes
------------
- Every PromQL query targets real exporter metrics (verified 2026-06-05):
    nginx_http_requests_total{host,status,method,endpoint}
    nginx_http_request_duration_seconds{host,method,endpoint}   (histogram)
    nginx_http_4xx_errors_total / nginx_http_5xx_errors_total{host,status,endpoint}
    nginx_http_connections{state}
    nginx_cache_{hits,misses,bypasses,stores}_total
    nginx_proxy_requests_total{upstream,status} / nginx_proxy_response_time_seconds
    nginx_waf_* / nginx_http_suspicious_requests_total / nginx_http_requests_by_ip_total
    wslproxy_backend_{healthy,requests_total,response_seconds}{rule_id,backend_label}
    api_calls_total / api_auth_attempts_total
- Metrics declared in prometheus_metrics.lua but with no live series yet
  (nginx_waf_blocked_total, nginx_ssl_handshakes_total, nginx_http_rate_limited_total,
  api_auth_failures_total, nginx_cache_size_bytes, wslproxy_traffic_weight_percent ...)
  are still wired in - panels populate as soon as the first event occurs.
- Infrastructure (CPU/mem/disk/net) panels use node_exporter metrics; SSL cert
  expiry uses blackbox_exporter. Both are flagged in panel descriptions.
- "Region" == Prometheus `instance` label (pop0 / lon1). "Environment" == the
  Prometheus datasource picked in the $datasource variable.
"""
import json
import os

# ---------------------------------------------------------------- selectors
SI = 'instance=~"$instance"'                       # node/region scope
SH = 'instance=~"$instance",host=~"$host"'         # + service/domain scope
SB = 'instance=~"$instance",backend_label=~"$backend"'  # backend scope
RI = "$__rate_interval"

REQ = "nginx_http_requests_total"
DUR = "nginx_http_request_duration_seconds"
BREQ = "wslproxy_backend_requests_total"
BDUR = "wslproxy_backend_response_seconds"
BHL = "wslproxy_backend_healthy"

# availability building blocks (5xx == failed request; 499s excluded by design)
def avail(window, scope=SI):
    return (f'100 * sum(rate({REQ}{{{scope},status!~"5.."}}[{window}]))'
            f' / sum(rate({REQ}{{{scope}}}[{window}]))')

def avail_inc(window, scope=SI):
    return (f'100 * sum(increase({REQ}{{{scope},status!~"5.."}}[{window}]))'
            f' / sum(increase({REQ}{{{scope}}}[{window}]))')

def burn(window, scope=SI):
    """Error-budget burn rate over a window vs the availability SLO."""
    return (f'((sum(rate({REQ}{{{scope},status=~"5.."}}[{window}])) or vector(0))'
            f' / sum(rate({REQ}{{{scope}}}[{window}]))) / (1 - $slo_availability)')

# ------------------------------------------------------------------ helpers
_id = [0]
def nid():
    _id[0] += 1
    return _id[0]

def DS():
    return {"type": "prometheus", "uid": "${datasource}"}

def tgt(expr, legend=None, instant=False, fmt=None, ref="A"):
    t = {"refId": ref, "expr": expr, "datasource": DS(),
         "editorMode": "code", "range": not instant, "instant": instant}
    if legend:
        t["legendFormat"] = legend
    if fmt:
        t["format"] = fmt
    return t

def tgts(*exprs_legends):
    out = []
    for i, (e, l) in enumerate(exprs_legends):
        out.append(tgt(e, l, ref=chr(ord("A") + i)))
    return out

def steps(*pairs):
    """thresholds steps from (value, color); first value must be None."""
    return {"mode": "absolute",
            "steps": [{"value": v, "color": c} for v, c in pairs]}

GREEN_RED = steps((None, "red"), (None, "green"))  # placeholder, not used

def fieldcfg(unit="short", thresholds=None, mappings=None, minv=None, maxv=None,
             decimals=None, custom=None, color_mode=None, no_value=None):
    d = {"unit": unit,
         "thresholds": thresholds or steps((None, "green")),
         "mappings": mappings or []}
    if minv is not None: d["min"] = minv
    if maxv is not None: d["max"] = maxv
    if decimals is not None: d["decimals"] = decimals
    if custom: d["custom"] = custom
    if color_mode: d["color"] = {"mode": color_mode}
    if no_value is not None: d["noValue"] = no_value
    return {"defaults": d, "overrides": []}

TS_CUSTOM = {"drawStyle": "line", "lineWidth": 1, "fillOpacity": 12,
             "showPoints": "never", "spanNulls": True,
             "stacking": {"mode": "none"}, "axisPlacement": "auto"}

def panel(ptype, title, w, h, targets, unit="short", desc=None, thresholds=None,
          mappings=None, minv=None, maxv=None, decimals=None, options=None,
          custom=None, color_mode=None, transformations=None, overrides=None,
          no_value=None):
    p = {"id": nid(), "type": ptype, "title": title, "datasource": DS(),
         "gridPos": {"x": 0, "y": 0, "w": w, "h": h},
         "targets": targets,
         "fieldConfig": fieldcfg(unit, thresholds, mappings, minv, maxv,
                                 decimals, custom, color_mode, no_value)}
    if desc: p["description"] = desc
    if options is not None: p["options"] = options
    if transformations: p["transformations"] = transformations
    if overrides: p["fieldConfig"]["overrides"] = overrides
    return p

def ts(title, targets, w=12, h=8, unit="short", desc=None, thresholds=None,
       overrides=None, stack=False, color_mode="palette-classic", legend_calcs=None):
    custom = dict(TS_CUSTOM)
    if stack:
        custom["stacking"] = {"mode": "normal"}
        custom["fillOpacity"] = 35
    opts = {"tooltip": {"mode": "multi", "sort": "desc"},
            "legend": {"displayMode": "table" if legend_calcs else "list",
                       "placement": "bottom",
                       "calcs": legend_calcs or []}}
    return panel("timeseries", title, w, h, targets, unit, desc, thresholds,
                 options=opts, custom=custom, color_mode=color_mode,
                 overrides=overrides)

def stat(title, targets, w=4, h=4, unit="short", desc=None, thresholds=None,
         mappings=None, decimals=None, color_bg=True, text_mode="auto", no_value="No data"):
    opts = {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
            "orientation": "auto", "textMode": text_mode,
            "colorMode": "background" if color_bg else "value",
            "graphMode": "area", "justifyMode": "auto"}
    return panel("stat", title, w, h, targets, unit, desc,
                 thresholds or steps((None, "green")), mappings,
                 decimals=decimals, options=opts, color_mode="thresholds",
                 no_value=no_value)

def gauge(title, targets, w=6, h=7, unit="percent", desc=None, thresholds=None,
          minv=0, maxv=100, decimals=3):
    opts = {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": False},
            "orientation": "auto", "showThresholdLabels": False,
            "showThresholdMarkers": True}
    return panel("gauge", title, w, h, targets, unit, desc, thresholds,
                 minv=minv, maxv=maxv, decimals=decimals, options=opts,
                 color_mode="thresholds")

def bargauge(title, targets, w=8, h=8, unit="short", desc=None, thresholds=None,
             display_mode="gradient"):
    opts = {"reduceOptions": {"calcs": ["lastNotNull"], "fields": "", "values": True},
            "orientation": "horizontal", "displayMode": display_mode,
            "showUnfilled": True, "valueMode": "color"}
    return panel("bargauge", title, w, h, targets, unit, desc,
                 thresholds or steps((None, "green"), (None, "green")),
                 options=opts, color_mode="thresholds")

def table(title, targets, w=12, h=9, unit="short", desc=None, thresholds=None,
          transformations=None, overrides=None, mappings=None):
    opts = {"showHeader": True, "sortBy": [], "footer": {"show": False}}
    custom = {"align": "auto", "cellOptions": {"type": "auto"}, "filterable": True}
    return panel("table", title, w, h, targets, unit, desc, thresholds, mappings,
                 options=opts, custom=custom, transformations=transformations,
                 overrides=overrides, color_mode="thresholds")

def heatmap(title, expr, w=12, h=9, desc=None):
    t = tgt(expr, "{{le}}", fmt="heatmap")
    opts = {"calculate": False, "yAxis": {"unit": "s"},
            "color": {"mode": "scheme", "scheme": "Spectral", "steps": 64,
                      "reverse": True},
            "cellGap": 1, "legend": {"show": True},
            "tooltip": {"mode": "single", "showColorScale": True}}
    return panel("heatmap", title, w, h, [t], "s", desc, options=opts)

def state_timeline(title, targets, w=24, h=8, unit="short", desc=None,
                   thresholds=None, mappings=None, row_height=0.85,
                   show_legend=True):
    legend = ({"displayMode": "list", "placement": "bottom"}
              if show_legend else {"showLegend": False})
    opts = {"mergeValues": True, "showValue": "never", "alignValue": "left",
            "rowHeight": row_height, "legend": legend,
            "tooltip": {"mode": "single"}}
    custom = {"lineWidth": 0, "fillOpacity": 75, "spanNulls": False}
    return panel("state-timeline", title, w, h, targets, unit, desc, thresholds,
                 mappings, options=opts, custom=custom, color_mode="thresholds")

def row(title, panels, collapsed=True):
    return {"_row": title, "_panels": panels, "_collapsed": collapsed}

def layout(sections):
    """Assign gridPos. Collapsed rows nest their panels; expanded rows inline."""
    out, y = [], 0
    for sec in sections:
        rp = {"id": nid(), "type": "row", "title": sec["_row"],
              "collapsed": sec["_collapsed"], "panels": [],
              "gridPos": {"x": 0, "y": y, "w": 24, "h": 1}}
        y += 1
        x, rowh, py = 0, 0, y
        placed = []
        for p in sec["_panels"]:
            w, h = p["gridPos"]["w"], p["gridPos"]["h"]
            if x + w > 24:
                x = 0
                py += rowh
                rowh = 0
            p["gridPos"].update({"x": x, "y": py})
            x += w
            rowh = max(rowh, h)
            placed.append(p)
        py += rowh
        if sec["_collapsed"]:
            rp["panels"] = placed
            out.append(rp)
        else:
            out.append(rp)
            out.extend(placed)
            y = py
    return out

# ============================================================ 1. EXEC OVERVIEW
def sec_exec():
    avail_thr = steps((None, "red"), (99.9, "yellow"), (99.95, "light-green"), (99.99, "green"))
    health_map = [
        {"type": "range", "options": {"from": 99.9, "to": 1000,
            "result": {"text": "HEALTHY", "color": "green", "index": 0}}},
        {"type": "range", "options": {"from": 99.0, "to": 99.9,
            "result": {"text": "DEGRADED", "color": "yellow", "index": 1}}},
        {"type": "range", "options": {"from": 0, "to": 99.0,
            "result": {"text": "CRITICAL", "color": "red", "index": 2}}},
        {"type": "special", "options": {"match": "null",
            "result": {"text": "UNKNOWN", "color": "text", "index": 3}}},
    ]
    return row("1 · Executive Overview", [
        gauge("Global Availability (current)", [tgt(avail("5m"), "availability")],
              w=5, h=7, minv=99, maxv=100, thresholds=avail_thr,
              desc="Share of requests not answered with a 5xx over the last 5m. "
                   "Targets: 99.9 / 99.95 / 99.99 %."),
        gauge("Error Budget Remaining (30d)",
              [tgt(f'clamp_min(100 * (1 - (1 - {avail_inc("30d")} / 100) / (1 - $slo_availability)), 0)',
                   "budget left")],
              w=5, h=7, minv=0, maxv=100, decimals=1,
              thresholds=steps((None, "red"), (10, "orange"), (25, "yellow"), (50, "green")),
              desc="Remaining monthly error budget for the $slo_availability availability SLO."),
        stat("Availability SLO (30d)", [tgt(avail_inc("30d"))], w=4, h=4, unit="percent",
             decimals=3, thresholds=steps((None, "red"), (99.95, "green")),
             desc="30-day availability vs 99.95% target."),
        stat("Latency SLO (30d)",
             [tgt(f'100 * sum(increase({DUR}_bucket{{{SH},le="$latency_threshold"}}[30d]))'
                  f' / sum(increase({DUR}_count{{{SH}}}[30d]))')],
             w=4, h=4, unit="percent", decimals=2,
             thresholds=steps((None, "red"), (95, "green")),
             desc="Share of requests faster than 500ms over 30d vs 95% target."),
        stat("Backend Success SLO (30d)",
             [tgt(f'100 * sum(increase({BREQ}{{{SB},status!~"5.."}}[30d]))'
                  f' / sum(increase({BREQ}{{{SB}}}[30d]))')],
             w=4, h=4, unit="percent", decimals=3,
             thresholds=steps((None, "red"), (99.9, "green")),
             desc="Backend (origin) success ratio vs 99.9% target."),
        stat("Overall System Health", [tgt(avail("5m"))], w=6, h=3,
             unit="percent", mappings=health_map, text_mode="value",
             thresholds=steps((None, "red"), (99.0, "yellow"), (99.9, "green")),
             desc="Green ≥99.9% · Yellow ≥99% · Red <99% (5m availability)."),
        stat("Failed Backends",
             [tgt(f'count({BHL}{{{SB}}} == 0) or vector(0)')],
             w=4, h=4, thresholds=steps((None, "green"), (1, "red")),
             desc="Backends currently marked unhealthy by the traffic router."),
        stat("Critical Alerts Firing",
             [tgt('count(ALERTS{alertstate="firing",severity="critical"}) or vector(0)')],
             w=4, h=4, thresholds=steps((None, "green"), (1, "red")),
             desc="Prometheus ALERTS series with severity=critical."),
        stat("Degraded Services (5xx in last 5m)",
             [tgt(f'count(sum by (host) (rate(nginx_http_5xx_errors_total{{{SH}}}[5m])) > 0)'
                  ' or vector(0)')],
             w=4, h=4, thresholds=steps((None, "green"), (1, "yellow"), (3, "red")),
             desc="Domains that served at least one 5xx in the last 5 minutes."),
    ], collapsed=False)

# ============================================================ 2. GOLDEN SIGNALS
def sec_golden():
    q = lambda p: (f'histogram_quantile({p}, sum by (le) '
                   f'(rate({DUR}_bucket{{{SH}}}[{RI}])))')
    return row("2 · Golden Signals (Traffic · Latency · Errors · Saturation)", [
        ts("Traffic — Total Requests/sec",
           [tgt(f'sum(rate({REQ}{{{SH}}}[{RI}]))', "requests/sec")],
           w=6, unit="reqps"),
        ts("Traffic — Requests by Route (top 10)",
           [tgt(f'topk(10, sum by (endpoint) (rate({REQ}{{{SH}}}[{RI}])))', "{{endpoint}}")],
           w=6, unit="reqps"),
        ts("Traffic — Requests by Domain (top 10)",
           [tgt(f'topk(10, sum by (host) (rate({REQ}{{{SH}}}[{RI}])))', "{{host}}")],
           w=6, unit="reqps"),
        ts("Traffic — Requests by Backend (top 10)",
           [tgt(f'topk(10, sum by (backend_label) (rate({BREQ}{{{SB}}}[{RI}])))',
                "{{backend_label}}")],
           w=6, unit="reqps"),
        ts("Latency — Request Duration Quantiles",
           tgts((q(0.50), "p50"), (q(0.90), "p90"), (q(0.95), "p95"),
                (q(0.99), "p99"), (q(0.999), "p99.9")),
           w=12, unit="s",
           legend_calcs=["lastNotNull", "max"]),
        heatmap("Latency — Response Time Heatmap",
                f'sum by (le) (increase({DUR}_bucket{{{SH}}}[{RI}]))', w=12),
        ts("Errors — 4xx / 5xx Rate",
           tgts((f'sum(rate(nginx_http_4xx_errors_total{{{SH}}}[{RI}]))', "4xx"),
                (f'sum(rate(nginx_http_5xx_errors_total{{{SH}}}[{RI}]))', "5xx")),
           w=8, unit="reqps",
           overrides=[{"matcher": {"id": "byName", "options": "5xx"},
                       "properties": [{"id": "color",
                                       "value": {"mode": "fixed", "fixedColor": "red"}}]},
                      {"matcher": {"id": "byName", "options": "4xx"},
                       "properties": [{"id": "color",
                                       "value": {"mode": "fixed", "fixedColor": "yellow"}}]}]),
        ts("Errors — Backend & Gateway Errors",
           tgts((f'sum(rate({BREQ}{{{SB},status=~"5.."}}[{RI}]))', "backend 5xx"),
                (f'sum by (status) (rate({REQ}{{{SH},status=~"502|503|504"}}[{RI}]))',
                 "gateway {{status}}")),
           w=8, unit="reqps"),
        ts("Errors — WAF Blocks & Suspicious Requests",
           tgts((f'sum(rate(nginx_waf_blocked_total{{{SH}}}[{RI}])) or vector(0)', "WAF blocked"),
                (f'sum(rate(nginx_http_suspicious_requests_total{{{SH}}}[{RI}]))', "suspicious"),
                (f'sum(rate(nginx_ssl_handshakes_total{{{SI}}}[{RI}])) or vector(0)',
                 "ssl handshakes")),
           w=8, unit="reqps",
           desc="WAF block / SSL handshake counters populate once the first event "
                "is recorded by the exporter."),
        ts("Saturation — Active Connections by State",
           [tgt(f'sum by (state) (nginx_http_connections{{{SI}}})', "{{state}}")],
           w=8, stack=True),
        ts("Saturation — CPU & Memory (node_exporter)",
           tgts(('100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle",instance=~"$instance"}[5m])) * 100',
                 "cpu {{instance}}"),
                ('100 * (1 - node_memory_MemAvailable_bytes{instance=~"$instance"} / node_memory_MemTotal_bytes{instance=~"$instance"})',
                 "mem {{instance}}")),
           w=8, unit="percent",
           desc="Requires node_exporter scraped with matching instance labels."),
        ts("Saturation — Network & File Descriptors (node_exporter)",
           tgts(('sum by (instance) (rate(node_network_receive_bytes_total{instance=~"$instance",device!~"lo"}[5m]))',
                 "rx {{instance}}"),
                ('sum by (instance) (rate(node_network_transmit_bytes_total{instance=~"$instance",device!~"lo"}[5m]))',
                 "tx {{instance}}"),
                ('node_filefd_allocated{instance=~"$instance"}', "fds {{instance}}")),
           w=8, unit="binBps",
           desc="Requires node_exporter. FD series shares the axis (count)."),
    ], collapsed=False)

# ============================================================ 3. SLI
def sec_sli():
    thr = steps((None, "red"), (99, "yellow"), (99.9, "green"))
    return row("3 · Service Level Indicators (SLI)", [
        ts("Availability SLI — non-5xx / total",
           [tgt(avail("5m"), "availability")],
           w=12, unit="percent", thresholds=thr,
           desc="successful_requests / total_requests (5m rolling). "
                "5xx = failure; 499 client aborts are not counted against the SLI."),
        ts("Latency SLI — requests < 500ms / total",
           [tgt(f'100 * sum(rate({DUR}_bucket{{{SH},le="$latency_threshold"}}[5m]))'
                f' / sum(rate({DUR}_count{{{SH}}}[5m]))', "fast requests")],
           w=12, unit="percent",
           thresholds=steps((None, "red"), (90, "yellow"), (95, "green")),
           desc="requests_under_500ms / total_requests using the native le=0.5 bucket."),
        ts("Backend Health SLI — healthy / total backends",
           [tgt(f'100 * sum({BHL}{{{SB}}}) / count({BHL}{{{SB}}})', "healthy %")],
           w=12, unit="percent",
           thresholds=steps((None, "red"), (80, "yellow"), (99, "green")),
           desc="healthy_backends / total_backends from the traffic router health gauge."),
        ts("Success Rate SLI — 2xx / total",
           [tgt(f'100 * sum(rate({REQ}{{{SH},status=~"2.."}}[5m]))'
                f' / sum(rate({REQ}{{{SH}}}[5m]))', "2xx ratio")],
           w=12, unit="percent",
           thresholds=steps((None, "red"), (90, "yellow"), (98, "green")),
           desc="Strict success: only 2xx counts (3xx redirects excluded)."),
    ])

# ============================================================ 4. SLO
def sec_slo():
    lat30 = (f'100 * sum(increase({DUR}_bucket{{{SH},le="$latency_threshold"}}[30d]))'
             f' / sum(increase({DUR}_count{{{SH}}}[30d]))')
    bk30 = (f'100 * sum(increase({BREQ}{{{SB},status!~"5.."}}[30d]))'
            f' / sum(increase({BREQ}{{{SB}}}[30d]))')
    ssl30 = '100 * avg_over_time(probe_success{job=~".*ssl.*|blackbox.*"}[30d])'
    def budget_left(value_expr, slo_var):
        return (f'clamp_min(100 * (1 - (1 - ({value_expr}) / 100)'
                f' / (1 - {slo_var})), 0)')
    bthr = steps((None, "red"), (10, "orange"), (25, "yellow"), (50, "green"))
    return row("4 · SLO Tracking (monthly)", [
        stat("Availability — current vs 99.95%", [tgt(avail_inc("30d"))], w=6, h=4,
             unit="percent", decimals=3,
             thresholds=steps((None, "red"), (99.95, "green"))),
        stat("Latency — % < 500ms vs 95%", [tgt(lat30)], w=6, h=4, unit="percent",
             decimals=2, thresholds=steps((None, "red"), (95, "green"))),
        stat("Backend Availability — current vs 99.9%", [tgt(bk30)], w=6, h=4,
             unit="percent", decimals=3,
             thresholds=steps((None, "red"), (99.9, "green"))),
        stat("SSL Success — current vs 99.99%", [tgt(ssl30)], w=6, h=4,
             unit="percent", decimals=3,
             thresholds=steps((None, "red"), (99.99, "green")),
             desc="Requires blackbox_exporter HTTPS probes (probe_success). "
                  "Shows 'No data' until probes are configured."),
        stat("Availability — burn rate (1h)", [tgt(burn("1h"))], w=6, h=4,
             decimals=2, thresholds=steps((None, "green"), (2, "yellow"), (5, "red")),
             desc="1 = burning budget exactly at SLO rate; >1 = overspending."),
        stat("Latency — burn rate (1h)",
             [tgt(f'((sum(rate({DUR}_count{{{SH}}}[1h])) - sum(rate({DUR}_bucket{{{SH},le="$latency_threshold"}}[1h])))'
                  f' / sum(rate({DUR}_count{{{SH}}}[1h]))) / (1 - $slo_latency)')],
             w=6, h=4, decimals=2,
             thresholds=steps((None, "green"), (2, "yellow"), (5, "red"))),
        stat("Backend — burn rate (1h)",
             [tgt(f'((sum(rate({BREQ}{{{SB},status=~"5.."}}[1h])) or vector(0))'
                  f' / sum(rate({BREQ}{{{SB}}}[1h]))) / (1 - $slo_backend)')],
             w=6, h=4, decimals=2,
             thresholds=steps((None, "green"), (2, "yellow"), (5, "red"))),
        stat("SSL — burn rate (1h)",
             [tgt('((1 - avg_over_time(probe_success{job=~".*ssl.*|blackbox.*"}[1h])) / (1 - 0.9999))')],
             w=6, h=4, decimals=2,
             thresholds=steps((None, "green"), (2, "yellow"), (5, "red")),
             desc="Requires blackbox_exporter."),
        bargauge("Error Budget Left — Availability",
                 [tgt(budget_left(avail_inc("30d"), "$slo_availability"), "availability")],
                 w=6, h=5, unit="percent", thresholds=bthr),
        bargauge("Error Budget Left — Latency",
                 [tgt(budget_left(lat30, "$slo_latency"), "latency")],
                 w=6, h=5, unit="percent", thresholds=bthr),
        bargauge("Error Budget Left — Backend",
                 [tgt(budget_left(bk30, "$slo_backend"), "backend")],
                 w=6, h=5, unit="percent", thresholds=bthr),
        bargauge("Error Budget Left — SSL",
                 [tgt(budget_left(ssl30, "0.9999"), "ssl")],
                 w=6, h=5, unit="percent", thresholds=bthr),
    ])

# ============================================================ 5. ERROR BUDGET
def sec_budget():
    total30 = f'sum(increase({REQ}{{{SI}}}[30d]))'
    bad30 = f'sum(increase({REQ}{{{SI},status=~"5.."}}[30d])) or vector(0)'
    bad1d = f'sum(increase({REQ}{{{SI},status=~"5.."}}[1d])) or vector(0)'
    return row("5 · Error Budget", [
        stat("Monthly Budget (allowed failed requests)",
             [tgt(f'(1 - $slo_availability) * {total30}')], w=5, h=5, decimals=0,
             color_bg=False,
             desc="(1 - SLO) × total requests over the trailing 30 days."),
        stat("Consumed Budget (failed requests, 30d)",
             [tgt(bad30)], w=5, h=5, decimals=0, color_bg=False),
        stat("Remaining Budget (requests)",
             [tgt(f'clamp_min((1 - $slo_availability) * {total30} - ({bad30}), 0)')],
             w=5, h=5, decimals=0,
             thresholds=steps((None, "red"), (1, "yellow"), (100, "green"))),
        gauge("Remaining Budget %",
              [tgt(f'clamp_min(100 * (1 - ({bad30}) / ((1 - $slo_availability) * {total30})), 0)')],
              w=4, h=5, decimals=1,
              thresholds=steps((None, "red"), (10, "orange"), (25, "yellow"), (50, "green"))),
        stat("Predicted Exhaustion (days @ yesterday's burn)",
             [tgt(f'clamp_min(((1 - $slo_availability) * {total30} - ({bad30}))'
                  f' / clamp_min({bad1d}, 1), 0)')],
             w=5, h=5, unit="d", decimals=1,
             thresholds=steps((None, "red"), (7, "orange"), (14, "yellow"), (30, "green")),
             desc="Remaining budget ÷ last-24h failure count. >30d = healthy."),
        ts("Error Budget Remaining % — Trend & Forecast",
           [tgt(f'clamp_min(100 * (1 - ({bad30}) / ((1 - $slo_availability) * {total30})), 0)',
                "budget remaining %")],
           w=24, h=9, unit="percent",
           thresholds=steps((None, "red"), (10, "orange"), (25, "yellow"), (50, "green")),
           desc="Enable a 'Trend' / forecasting transformation, or use Grafana ML "
                "forecast on this query, to project the exhaustion date."),
    ])

# ============================================================ 6. BURN RATE
def sec_burn():
    bthr = steps((None, "green"), (2, "yellow"), (5, "red"), (10, "dark-red"))
    def g(title, w1, w2, desc):
        return gauge(title,
                     tgts((burn(w1), f"{w1} window"), (burn(w2), f"{w2} window")),
                     w=8, h=7, unit="short", minv=0, maxv=15, decimals=2,
                     thresholds=bthr)
    p1 = g("Fast Burn (5m / 1h)", "5m", "1h",
           "Pages: budget gone in ~hours if sustained.")
    p1["description"] = "Pages: at burn 14.4 a 30d budget is gone in 2 days."
    p2 = g("Medium Burn (30m / 6h)", "30m", "6h", "")
    p2["description"] = "Tickets: sustained medium-rate budget spend."
    p3 = g("Slow Burn (6h / 24h)", "6h", "24h", "")
    p3["description"] = "Trend watch: slow leak that exhausts budget within the month."
    return row("6 · Error Budget Burn Rate (multi-window)", [
        p1, p2, p3,
        ts("Burn Rate — All Windows",
           tgts((burn("5m"), "5m"), (burn("30m"), "30m"), (burn("1h"), "1h"),
                (burn("6h"), "6h"), (burn("24h"), "24h")),
           w=18, h=9, thresholds=bthr,
           desc="Warning > 2 · Critical > 5 · Emergency > 10",
           legend_calcs=["lastNotNull", "max"]),
        stat("Burn Alert Status",
             [tgt(f'max({burn("5m")} > bool 5) or vector(0)')],
             w=6, h=9,
             mappings=[
                 {"type": "value", "options": {
                     "0": {"text": "OK", "color": "green", "index": 0},
                     "1": {"text": "FAST BURN", "color": "red", "index": 1}}}],
             desc="Red when the 5m burn rate exceeds 5×."),
    ])

# ============================================================ 7. LATENCY ANALYTICS
def sec_latency():
    q = lambda p: (f'histogram_quantile({p}, sum by (le) '
                   f'(rate({DUR}_bucket{{{SH}}}[{RI}])))')
    return row("7 · Latency Analytics", [
        ts("Request Duration — P50 / P90 / P95 / P99 / P99.9",
           tgts((q(0.50), "p50"), (q(0.90), "p90"), (q(0.95), "p95"),
                (q(0.99), "p99"), (q(0.999), "p99.9")),
           w=12, h=9, unit="s", legend_calcs=["lastNotNull", "max"]),
        heatmap("Latency Distribution Heatmap",
                f'sum by (le) (increase({DUR}_bucket{{{SH}}}[{RI}]))', w=12, h=9),
        table("Slowest Endpoints — p95 (top 20, dashboard range)",
              [tgt(f'topk(20, histogram_quantile(0.95, sum by (endpoint, le) '
                   f'(rate({DUR}_bucket{{{SH}}}[$__range]))))',
                   instant=True, fmt="table")],
              w=12, h=10, unit="s",
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True},
                  "renameByName": {"endpoint": "Endpoint", "Value": "p95 latency"}}}],
              thresholds=steps((None, "green"), (0.5, "yellow"), (1, "red"))),
        table("Slowest Backends — p95 (top 20, dashboard range)",
              [tgt(f'topk(20, histogram_quantile(0.95, sum by (backend_label, le) '
                   f'(rate({BDUR}_bucket{{{SB}}}[$__range]))))',
                   instant=True, fmt="table")],
              w=12, h=10, unit="s",
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True},
                  "renameByName": {"backend_label": "Backend", "Value": "p95 latency"}}}],
              thresholds=steps((None, "green"), (0.5, "yellow"), (1, "red"))),
        ts("Latency by Region/Node — p95",
           [tgt(f'histogram_quantile(0.95, sum by (instance, le) '
                f'(rate({DUR}_bucket{{{SH}}}[{RI}])))', "{{instance}}")],
           w=24, h=8, unit="s"),
    ])

# ============================================================ 8. BACKEND HEALTH
def sec_backend():
    return row("8 · Backend Health", [
        table("Backend Availability",
              [tgt(f'{BHL}{{{SB}}}', instant=True, fmt="table", ref="A"),
               tgt(f'100 * avg_over_time({BHL}{{{SB}}}[24h])', instant=True,
                   fmt="table", ref="B"),
               tgt(f'histogram_quantile(0.95, sum by (backend_label, le) '
                   f'(rate({BDUR}_bucket{{{SB}}}[1h])))', instant=True,
                   fmt="table", ref="C"),
               tgt(f'sum by (backend_label) (rate({BREQ}{{{SB}}}[5m]))',
                   instant=True, fmt="table", ref="D"),
               tgt(f'time() - max_over_time((timestamp({BHL}{{{SB}}} == 0))[24h:1m])',
                   instant=True, fmt="table", ref="E")],
              w=24, h=11,
              desc="Status (1=healthy) · Health% (24h) · p95 response (1h) · "
                   "req/s (5m, ≈ active load) · seconds since last failure. "
                   "Source: traffic-router health gauges (the same data backing "
                   "the admin /system-status page).",
              transformations=[
                  {"id": "joinByField", "options": {"byField": "backend_label",
                                                    "mode": "outer"}},
                  {"id": "organize", "options": {
                      "excludeByName": {"Time": True, "Time 1": True, "Time 2": True,
                                        "Time 3": True, "Time 4": True, "Time 5": True,
                                        "rule_id": True, "rule_id 1": True,
                                        "rule_id 2": True, "address": True,
                                        "instance": True, "instance 1": True,
                                        "instance 2": True, "instance 3": True,
                                        "instance 4": True, "instance 5": True,
                                        "job": True, "job 1": True, "job 2": True,
                                        "job 3": True, "job 4": True, "job 5": True},
                      "renameByName": {"backend_label": "Backend",
                                       "Value #A": "Status",
                                       "Value #B": "Health % (24h)",
                                       "Value #C": "p95 Response (s)",
                                       "Value #D": "Req/s",
                                       "Value #E": "Last Failure (s ago)"}}}],
              overrides=[
                  {"matcher": {"id": "byName", "options": "Status"},
                   "properties": [
                       {"id": "mappings", "value": [
                           {"type": "value", "options": {
                               "1": {"text": "UP", "color": "green", "index": 0},
                               "0": {"text": "DOWN", "color": "red", "index": 1}}}]},
                       {"id": "custom.cellOptions",
                        "value": {"type": "color-background"}}]},
                  {"matcher": {"id": "byName", "options": "Health % (24h)"},
                   "properties": [
                       {"id": "unit", "value": "percent"},
                       {"id": "thresholds", "value": steps((None, "red"), (80, "yellow"), (99, "green"))},
                       {"id": "custom.cellOptions", "value": {"type": "color-text"}}]},
                  {"matcher": {"id": "byName", "options": "p95 Response (s)"},
                   "properties": [{"id": "unit", "value": "s"}]},
                  {"matcher": {"id": "byName", "options": "Last Failure (s ago)"},
                   "properties": [{"id": "unit", "value": "s"}]}]),
        table("Unhealthy Backends (now)",
              [tgt(f'{BHL}{{{SB}}} == 0', instant=True, fmt="table")],
              w=8, h=9,
              desc="Backends the router currently routes around (fail-open after "
                   "3 consecutive 5xx, or active health-check failures).",
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True, "Value": True, "job": True,
                                    "instance": True, "__name__": True},
                  "renameByName": {"backend_label": "Backend", "rule_id": "Rule",
                                   "address": "Address"}}}]),
        ts("Backend Health Trend (24h)",
           tgts((f'sum({BHL}{{{SB}}})', "healthy"),
                (f'count({BHL}{{{SB}}})', "total")),
           w=8, h=9,
           thresholds=None,
           desc="Set the dashboard range to 24h for the full trend."),
        table("Backend Flapping Detection (6h)",
              [tgt(f'sort_desc(changes({BHL}{{{SB}}}[6h]) > 0)', instant=True,
                   fmt="table")],
              w=8, h=9,
              desc="Health-state transitions in 6h. ≥4 transitions = flapping; "
                   "investigate the origin or the health-check thresholds.",
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True, "job": True, "instance": True,
                                    "address": True},
                  "renameByName": {"backend_label": "Backend", "rule_id": "Rule",
                                   "Value": "Transitions (6h)"}}}],
              thresholds=steps((None, "green"), (2, "yellow"), (4, "red"))),
        state_timeline("Backend Health Timeline",
                       [tgt(f'{BHL}{{{SB}}}', "{{backend_label}}")],
                       w=24, h=9,
                       mappings=[{"type": "value", "options": {
                           "1": {"text": "UP", "color": "green", "index": 0},
                           "0": {"text": "DOWN", "color": "red", "index": 1}}}],
                       thresholds=steps((None, "red"), (1, "green"))),
    ])

# ============================================================ 9. INFRASTRUCTURE
def sec_infra():
    NE = "Requires node_exporter on the proxy hosts with matching instance labels."
    return row("9 · Infrastructure (node_exporter)", [
        ts("CPU Usage",
           [tgt('100 - avg by (instance) (rate(node_cpu_seconds_total{mode="idle",instance=~"$instance"}[5m])) * 100',
                "{{instance}}")],
           w=8, unit="percent", desc=NE,
           thresholds=steps((None, "green"), (75, "yellow"), (90, "red"))),
        ts("Memory Usage",
           [tgt('100 * (1 - node_memory_MemAvailable_bytes{instance=~"$instance"} / node_memory_MemTotal_bytes{instance=~"$instance"})',
                "{{instance}}")],
           w=8, unit="percent", desc=NE,
           thresholds=steps((None, "green"), (80, "yellow"), (92, "red"))),
        ts("Disk Usage (rootfs)",
           [tgt('100 * (1 - node_filesystem_avail_bytes{instance=~"$instance",mountpoint="/",fstype!="tmpfs"} / node_filesystem_size_bytes{instance=~"$instance",mountpoint="/",fstype!="tmpfs"})',
                "{{instance}}")],
           w=8, unit="percent", desc=NE,
           thresholds=steps((None, "green"), (75, "yellow"), (90, "red"))),
        ts("Network Throughput",
           tgts(('sum by (instance) (rate(node_network_receive_bytes_total{instance=~"$instance",device!~"lo"}[5m]))', "rx {{instance}}"),
                ('sum by (instance) (rate(node_network_transmit_bytes_total{instance=~"$instance",device!~"lo"}[5m]))', "tx {{instance}}")),
           w=8, unit="binBps", desc=NE),
        ts("TCP Connections (established)",
           [tgt('node_netstat_Tcp_CurrEstab{instance=~"$instance"}', "{{instance}}")],
           w=8, desc=NE),
        ts("Open File Descriptors",
           tgts(('node_filefd_allocated{instance=~"$instance"}', "allocated {{instance}}"),
                ('node_filefd_maximum{instance=~"$instance"}', "max {{instance}}")),
           w=8, desc=NE),
        ts("OpenResty Connections by State (native)",
           [tgt(f'sum by (state) (nginx_http_connections{{{SI}}})', "{{state}}")],
           w=8, stack=True,
           desc="Native exporter metric — reading/writing/waiting worker connections. "
                "Production currently runs worker_processes=1: a saturated worker "
                "is a full outage (see CLAUDE.md §15)."),
        ts("Active Sessions (waiting keep-alive)",
           [tgt(f'sum(nginx_http_connections{{{SI},state="waiting"}})', "waiting")],
           w=8,
           desc="Keep-alive connections held open. Threads/goroutines do not apply "
                "to the OpenResty event model."),
        ts("Exporter Internal Errors",
           [tgt(f'rate(nginx_metric_errors_total{{{SI}}}[{RI}])', "metric errors/s")],
           w=8,
           thresholds=steps((None, "green"), (0.1, "red")),
           desc="nginx-lua-prometheus shared-dict errors — non-zero means metrics "
                "are being dropped (increase lua_shared_dict prometheus_metrics)."),
    ])

# ============================================================ 10. SSL
def sec_ssl():
    BB = ("Requires blackbox_exporter HTTPS probes "
          "(module: http_2xx over TLS) against each public domain.")
    return row("10 · SSL / TLS Monitoring", [
        table("Certificate Expiry (days)",
              [tgt('sort((probe_ssl_earliest_cert_expiry{job=~".*ssl.*|blackbox.*"} - time()) / 86400)',
                   instant=True, fmt="table")],
              w=12, h=9, unit="d", desc=BB,
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True, "job": True},
                  "renameByName": {"instance": "Domain", "Value": "Days to Expiry"}}}],
              overrides=[{"matcher": {"id": "byName", "options": "Days to Expiry"},
                          "properties": [
                              {"id": "thresholds",
                               "value": steps((None, "red"), (15, "orange"),
                                              (30, "yellow"), (45, "green"))},
                              {"id": "custom.cellOptions",
                               "value": {"type": "color-background"}}]}]),
        stat("Certificates Expiring < 30 days",
             [tgt('count((probe_ssl_earliest_cert_expiry{job=~".*ssl.*|blackbox.*"} - time()) / 86400 < 30) or vector(0)')],
             w=6, h=5, thresholds=steps((None, "green"), (1, "red")), desc=BB),
        stat("TLS Probe Failures (now)",
             [tgt('count(probe_success{job=~".*ssl.*|blackbox.*"} == 0) or vector(0)')],
             w=6, h=5, thresholds=steps((None, "green"), (1, "red")), desc=BB),
        ts("SSL Handshakes by Protocol",
           [tgt(f'sum by (protocol) (rate(nginx_ssl_handshakes_total{{{SI}}}[{RI}])) or vector(0)',
                "{{protocol}}")],
           w=6, h=4, unit="reqps",
           desc="Native counter (nginx_ssl_handshakes_total) — populates once the "
                "exporter records the first handshake."),
        ts("SSL-related Log Errors",
           [tgt(f'sum by (component) (rate(nginx_log_errors_total{{{SI},component=~".*ssl.*|.*cert.*"}}[{RI}])) or vector(0)',
                "{{component}}")],
           w=6, h=4,
           desc="auto-ssl / cert renewal failures surfaced via the log-level "
                "counters. Renewal status itself lives in data/ssl/{domain}.json."),
    ])

# ============================================================ 11. WAF
def sec_waf():
    note = ("Populates when the WAF records its first block — counter family "
            "nginx_waf_blocked_total{host,category,severity} exists in the exporter.")
    return row("11 · WAF Monitoring", [
        stat("Blocked Requests (range total)",
             [tgt(f'sum(increase(nginx_waf_blocked_total{{{SH}}}[$__range])) or vector(0)')],
             w=4, h=5, thresholds=steps((None, "green"), (100, "yellow"), (1000, "red")),
             desc=note),
        bargauge("Top Attack Categories",
                 [tgt(f'topk(10, sum by (category) (increase(nginx_waf_blocked_total{{{SH}}}[$__range])))',
                      "{{category}}", instant=True)],
                 w=10, h=10, desc=note,
                 thresholds=steps((None, "green"), (10, "yellow"), (100, "red"))),
        bargauge("Suspicious Requests by Reason",
                 [tgt(f'topk(10, sum by (reason) (increase(nginx_http_suspicious_requests_total{{{SH}}}[$__range])))',
                      "{{reason}}", instant=True)],
                 w=10, h=10,
                 thresholds=steps((None, "green"), (50, "yellow"), (500, "red"))),
        ts("SQL Injection Attempts",
           [tgt(f'sum(rate(nginx_waf_blocked_total{{{SH},category=~"(?i).*sql.*"}}[{RI}])) or vector(0)',
                "sqli blocked")],
           w=6, h=7, unit="reqps", desc=note),
        ts("XSS Attempts",
           [tgt(f'sum(rate(nginx_waf_blocked_total{{{SH},category=~"(?i).*xss.*"}}[{RI}])) or vector(0)',
                "xss blocked")],
           w=6, h=7, unit="reqps", desc=note),
        ts("Geo / IP Blocks",
           [tgt(f'sum by (reason) (rate(nginx_http_blocked_requests_total{{{SH}}}[{RI}])) or vector(0)',
                "{{reason}}")],
           w=6, h=7, unit="reqps",
           desc="Country/IP rule blocks (rule match with 403 response)."),
        ts("Rate Limit Violations",
           [tgt(f'sum(rate(nginx_http_rate_limited_total{{{SH}}}[{RI}])) or vector(0)',
                "rate limited")],
           w=6, h=7, unit="reqps"),
        ts("WAF Monitor-mode Flags vs Blocks",
           tgts((f'sum(rate(nginx_waf_blocked_total{{{SH}}}[{RI}])) or vector(0)', "blocked"),
                (f'sum(rate(nginx_waf_monitored_total{{{SH}}}[{RI}])) or vector(0)', "monitored"),
                (f'sum(rate(nginx_waf_errors_total{{{SH}}}[{RI}])) or vector(0)', "engine errors (fail-open)")),
           w=12, h=7),
        ts("WAF Inspection Latency — p95",
           [tgt(f'histogram_quantile(0.95, sum by (le) (rate(nginx_waf_inspection_duration_seconds_bucket{{{SH}}}[{RI}])))',
                "p95 inspection")],
           w=12, h=7, unit="s",
           thresholds=steps((None, "green"), (0.01, "yellow"), (0.05, "red")),
           desc="WAF adds this much latency to every inspected request."),
    ])

# ============================================================ 12. CACHE
def sec_cache():
    hits = f'sum(rate(nginx_cache_hits_total{{{SH}}}[{RI}]))'
    miss = f'sum(rate(nginx_cache_misses_total{{{SH}}}[{RI}]))'
    return row("12 · Cache Performance", [
        gauge("Cache Hit Rate",
              [tgt(f'100 * {hits} / clamp_min({hits} + {miss}, 1e-9)', "hit rate")],
              w=6, h=7, decimals=1,
              thresholds=steps((None, "red"), (50, "yellow"), (80, "green")),
              desc="hits / (hits + misses) for the static-content cache."),
        ts("Hits vs Misses vs Bypasses",
           tgts((hits, "hits"), (miss, "misses"),
                (f'sum(rate(nginx_cache_bypasses_total{{{SH}}}[{RI}]))', "bypasses"),
                (f'sum(rate(nginx_cache_stores_total{{{SH}}}[{RI}]))', "stores")),
           w=10, h=7, unit="reqps"),
        ts("Cache Size & Entries",
           tgts((f'sum by (host) (nginx_cache_size_bytes{{{SH}}}) or vector(0)', "bytes {{host}}"),
                (f'sum by (host) (nginx_cache_entries_total{{{SH}}}) or vector(0)', "entries {{host}}")),
           w=8, h=7, unit="bytes",
           desc="Gauge family exists in the exporter; populates when cache size "
                "tracking records its first sample."),
        bargauge("Top Cached Content (hits by domain/type, range)",
                 [tgt(f'topk(15, sum by (host, extension) (increase(nginx_cache_hits_total{{{SH}}}[$__range])))',
                      "{{host}} .{{extension}}", instant=True)],
                 w=12, h=9),
        table("Cache Efficiency by Domain",
              [tgt(f'sort_desc(100 * sum by (host) (increase(nginx_cache_hits_total{{{SH}}}[$__range]))'
                   f' / clamp_min(sum by (host) (increase(nginx_cache_hits_total{{{SH}}}[$__range]))'
                   f' + sum by (host) (increase(nginx_cache_misses_total{{{SH}}}[$__range])), 1))',
                   instant=True, fmt="table")],
              w=12, h=9, unit="percent",
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True},
                  "renameByName": {"host": "Domain", "Value": "Hit Rate %"}}}],
              overrides=[{"matcher": {"id": "byName", "options": "Hit Rate %"},
                          "properties": [
                              {"id": "thresholds",
                               "value": steps((None, "red"), (50, "yellow"), (80, "green"))},
                              {"id": "custom.cellOptions",
                               "value": {"type": "color-background"}}]}]),
    ])

# ============================================================ 13. LOAD BALANCER
def sec_lb():
    per_be = f'sum by (backend_label) (rate({BREQ}{{{SB}}}[{RI}]))'
    return row("13 · Load Balancer Analytics", [
        ts("Requests per Backend",
           [tgt(per_be, "{{backend_label}}")], w=12, h=8, unit="reqps"),
        panel("piechart", "Backend Traffic Distribution (range)", 6, 8,
              [tgt(f'sum by (backend_label) (increase({BREQ}{{{SB}}}[$__range]))',
                   "{{backend_label}}", instant=True)],
              desc="Compare against configured wslproxy_traffic_weight_percent.",
              options={"pieType": "donut",
                       "reduceOptions": {"calcs": ["lastNotNull"], "values": True},
                       "legend": {"displayMode": "table", "placement": "right",
                                  "values": ["percent"]},
                       "tooltip": {"mode": "single"}}),
        table("Configured Traffic Weights",
              [tgt(f'wslproxy_traffic_weight_percent{{{SB}}}', instant=True, fmt="table")],
              w=6, h=8, unit="percent",
              desc="Weights set via the admin UI / update_traffic_split. Empty until "
                   "a weighted split is configured.",
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True, "job": True, "instance": True},
                  "renameByName": {"backend_label": "Backend", "rule_id": "Rule",
                                   "Value": "Weight %"}}}]),
        stat("Load Balancing Efficiency (CoV)",
             [tgt(f'stddev({per_be}) / clamp_min(avg({per_be}), 1e-9)')],
             w=6, h=5, decimals=2,
             thresholds=steps((None, "green"), (0.5, "yellow"), (1, "red")),
             desc="Coefficient of variation of per-backend request rate. "
                  "0 = perfectly even. Expected >0 with intentional weighted splits."),
        stat("Traffic Skew (max / avg)",
             [tgt(f'max({per_be}) / clamp_min(avg({per_be}), 1e-9)')],
             w=6, h=5, decimals=2,
             thresholds=steps((None, "green"), (2, "yellow"), (4, "red")),
             desc="How much hotter the busiest backend runs vs the average."),
        ts("Backend Saturation — p95 response per backend",
           [tgt(f'histogram_quantile(0.95, sum by (backend_label, le) '
                f'(rate({BDUR}_bucket{{{SB}}}[{RI}])))', "{{backend_label}}")],
           w=12, h=5, unit="s",
           thresholds=steps((None, "green"), (1, "yellow"), (2.5, "red")),
           desc="Rising p95 under steady traffic = backend saturating. "
                "Bucket ceiling is 2.5s (exporter histogram definition)."),
    ])

# ============================================================ 14. API GATEWAY
def sec_api():
    return row("14 · API Gateway (admin plane)", [
        ts("API Requests by Endpoint (top 10)",
           [tgt(f'topk(10, sum by (endpoint) (rate(api_calls_total{{{SI}}}[{RI}])))',
                "{{endpoint}}")],
           w=12, h=8, unit="reqps"),
        ts("Auth Failures",
           tgts((f'sum by (result) (rate(api_auth_attempts_total{{{SI},result!="success"}}[{RI}])) or vector(0)',
                 "attempts {{result}}"),
                (f'sum by (reason) (rate(api_auth_failures_total{{{SI}}}[{RI}])) or vector(0)',
                 "failure {{reason}}"),
                (f'sum(rate({REQ}{{{SI},status=~"401|403",endpoint=~"/api.*"}}[{RI}]))',
                 "api 401/403")),
           w=12, h=8, unit="reqps",
           thresholds=steps((None, "green"), (1, "yellow"), (5, "red")),
           desc="Includes JWT validation failures — admin API auth is JWT bearer; "
                "401/403 on /api/* ≈ token rejected/expired (1h expiry, no refresh)."),
        ts("Rate Limits Triggered",
           [tgt(f'sum by (host) (rate(nginx_http_rate_limited_total{{{SH}}}[{RI}])) or vector(0)',
                "{{host}}")],
           w=12, h=7, unit="reqps"),
        table("Top APIs (range)",
              [tgt(f'topk(20, sum by (endpoint, method) (increase(api_calls_total{{{SI}}}[$__range])))',
                   instant=True, fmt="table")],
              w=12, h=7,
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True},
                  "renameByName": {"endpoint": "Endpoint", "method": "Method",
                                   "Value": "Requests"}}}]),
    ])

# ============================================================ 15. REGIONAL
def sec_region():
    return row("15 · Regional Health (per node)", [
        state_timeline("Node Availability Timeline",
                       [tgt(f'100 * sum by (instance) (rate({REQ}{{{SI},status!~"5.."}}[5m]))'
                            f' / sum by (instance) (rate({REQ}{{{SI}}}[5m]))',
                            "{{instance}}")],
                       w=24, h=6, unit="percent",
                       thresholds=steps((None, "red"), (99, "yellow"), (99.9, "green")),
                       desc="pop0 = 187.124.112.155 · lon1 = 72.62.211.28 "
                            "(instance label from the Prometheus scrape config)."),
        ts("Requests by Region/Node",
           [tgt(f'sum by (instance) (rate({REQ}{{{SI}}}[{RI}]))', "{{instance}}")],
           w=8, h=8, unit="reqps"),
        ts("Latency by Region/Node — p95",
           [tgt(f'histogram_quantile(0.95, sum by (instance, le) (rate({DUR}_bucket{{{SI}}}[{RI}])))',
                "{{instance}}")],
           w=8, h=8, unit="s"),
        ts("Failover / Health-transition Events",
           [tgt(f'sum(changes({BHL}{{{SB}}}[5m]))', "transitions / 5m")],
           w=8, h=8,
           thresholds=steps((None, "green"), (1, "yellow"), (5, "red")),
           desc="Backend health-state transitions; spikes = failover churn."),
        ts("Regional Availability",
           [tgt(f'100 * sum by (instance) (rate({REQ}{{{SI},status!~"5.."}}[5m]))'
                f' / sum by (instance) (rate({REQ}{{{SI}}}[5m]))', "{{instance}}")],
           w=24, h=7, unit="percent",
           thresholds=steps((None, "red"), (99.9, "green"))),
    ])

# ============================================================ 16. TROUBLESHOOTING
def sec_trouble():
    fail_sel = f'{SH},endpoint=~"$endpoint",status=~"$status_code",status=~"4..|5.."'
    return row("16 · Troubleshooting", [
        table("Failed Requests Explorer (filtered by Route/Status variables)",
              [tgt(f'topk(100, sum by (host, endpoint, method, status) '
                   f'(increase({REQ}{{{fail_sel}}}[$__range])))',
                   instant=True, fmt="table")],
              w=24, h=11,
              desc="Filter with the Service, Route and Status Code dashboard "
                   "variables. Sorted by failure count over the dashboard range.",
              transformations=[
                  {"id": "organize", "options": {
                      "excludeByName": {"Time": True},
                      "renameByName": {"host": "Service", "endpoint": "Route",
                                       "method": "Method", "status": "Status",
                                       "Value": "Failures"}}},
                  {"id": "sortBy", "options": {
                      "sort": [{"field": "Failures", "desc": True}]}}]),
        table("Recent Failures (last 5m)",
              [tgt(f'sum by (host, endpoint, status) (increase({REQ}{{{SH},status=~"4..|5.."}}[5m])) > 0',
                   instant=True, fmt="table")],
              w=12, h=9,
              transformations=[
                  {"id": "organize", "options": {
                      "excludeByName": {"Time": True},
                      "renameByName": {"host": "Service", "endpoint": "Route",
                                       "status": "Status", "Value": "Count (5m)"}}},
                  {"id": "sortBy", "options": {
                      "sort": [{"field": "Count (5m)", "desc": True}]}}]),
        ts("Error Correlation — errors vs latency vs saturation",
           tgts((f'sum(rate({REQ}{{{SH},status=~"5.."}}[{RI}]))', "5xx /s"),
                (f'histogram_quantile(0.95, sum by (le) (rate({DUR}_bucket{{{SH}}}[{RI}])))',
                 "p95 latency (s)"),
                (f'sum(nginx_http_connections{{{SI},state!="waiting"}})', "active conns"),
                ('100 - avg(rate(node_cpu_seconds_total{mode="idle",instance=~"$instance"}[5m])) * 100',
                 "cpu % (node_exporter)")),
           w=12, h=9,
           desc="Overlay of error rate, latency, connections and CPU to spot the "
                "leading indicator during an incident."),
        bargauge("Top Failing Routes (range)",
                 [tgt(f'topk(10, sum by (endpoint) (increase({REQ}{{{SH},status=~"5.."}}[$__range])))',
                      "{{endpoint}}", instant=True)],
                 w=12, h=8,
                 thresholds=steps((None, "green"), (10, "yellow"), (100, "red"))),
        bargauge("Top Failing Backends (range)",
                 [tgt(f'topk(10, sum by (backend_label) (increase({BREQ}{{{SB},status=~"5.."}}[$__range])))',
                      "{{backend_label}}", instant=True)],
                 w=12, h=8,
                 thresholds=steps((None, "green"), (10, "yellow"), (100, "red"))),
        state_timeline("Incident Timeline — per-service 5xx state",
                       [tgt(f'(sum by (host) (rate(nginx_http_5xx_errors_total{{{SH}}}[5m])) > bool 0) > 0',
                            "{{host}}")],
                       w=24, h=10, row_height=0.8, show_legend=False,
                       mappings=[{"type": "value", "options": {
                           "1": {"text": "5xx", "color": "red", "index": 0}}}],
                       thresholds=steps((None, "red")),
                       desc="Incident-only view: a lane appears for a service ONLY while it "
                            "is emitting 5xx (healthy services are filtered out so the panel "
                            "stays readable with many hosts selected). Red segment = that "
                            "service had 5xx in that 5m window; gaps = healthy. Empty panel "
                            "= no errors in range. Alert annotations (firing ALERTS) overlay "
                            "all panels."),
    ])

# ============================================================ 17. ALERTING
def sec_alerts():
    def sev(name, color):
        return stat(f"{name.capitalize()} Alerts",
                    [tgt(f'count(ALERTS{{alertstate="firing",severity="{name}"}}) or vector(0)')],
                    w=4, h=5,
                    thresholds=steps((None, "green"), (1, color)))
    alertlist = {"id": nid(), "type": "alertlist", "title": "Alert Rule States",
                 "gridPos": {"x": 0, "y": 0, "w": 12, "h": 10},
                 "options": {"alertInstanceLabelFilter": "",
                             "alertName": "", "dashboardAlerts": False,
                             "groupBy": [], "groupMode": "default",
                             "maxItems": 50, "sortOrder": 1,
                             "stateFilter": {"error": True, "firing": True,
                                             "noData": False, "normal": False,
                                             "pending": True}},
                 "fieldConfig": {"defaults": {}, "overrides": []}}
    return row("17 · Alerting", [
        sev("critical", "red"), sev("warning", "yellow"), sev("info", "blue"),
        stat("Total Firing", [tgt('count(ALERTS{alertstate="firing"}) or vector(0)')],
             w=4, h=5, thresholds=steps((None, "green"), (1, "orange"), (3, "red"))),
        stat("Pending (about to fire)",
             [tgt('count(ALERTS{alertstate="pending"}) or vector(0)')],
             w=4, h=5, thresholds=steps((None, "green"), (1, "yellow"))),
        stat("Oldest Firing Alert (age)",
             [tgt('time() - min(ALERTS_FOR_STATE)')],
             w=4, h=5, unit="s",
             thresholds=steps((None, "green"), (1800, "yellow"), (7200, "red")),
             desc="How long the longest-running alert has been active."),
        alertlist,
        table("Firing & Pending Alerts",
              [tgt('ALERTS{alertstate=~"firing|pending"}', instant=True, fmt="table")],
              w=12, h=10,
              desc="Alert Name · Severity · State · affected labels. "
                   "Active-since timestamps live in ALERTS_FOR_STATE (Explore).",
              transformations=[{"id": "organize", "options": {
                  "excludeByName": {"Time": True, "Value": True, "__name__": True},
                  "renameByName": {"alertname": "Alert", "severity": "Severity",
                                   "alertstate": "State", "host": "Service",
                                   "backend_label": "Backend",
                                   "instance": "Instance"}}}]),
    ])

# ================================================================= ASSEMBLY
def build():
    sections = [sec_exec(), sec_golden(), sec_sli(), sec_slo(), sec_budget(),
                sec_burn(), sec_latency(), sec_backend(), sec_infra(), sec_ssl(),
                sec_waf(), sec_cache(), sec_lb(), sec_api(), sec_region(),
                sec_trouble(), sec_alerts()]
    qvar = lambda name, label, query, **kw: {
        "name": name, "label": label, "type": "query",
        "datasource": DS(),
        "query": {"query": query, "refId": f"var-{name}"},
        "refresh": 2, "multi": True, "includeAll": True, "allValue": ".*",
        "sort": 1, "current": {"selected": True, "text": ["All"], "value": ["$__all"]},
        **kw}
    cvar = lambda name, label, value: {
        "name": name, "label": label, "type": "constant", "query": value,
        "hide": 2, "current": {"selected": False, "text": value, "value": value}}
    dashboard = {
        "uid": "wslproxy-sre",
        "title": "WSLProxy — Enterprise SRE Dashboard",
        "description": "Google-SRE-style operational dashboard for the WSLProxy "
                       "platform: golden signals, SLI/SLO, error budgets, "
                       "multi-window burn rates, backend health, WAF/SSL/cache, "
                       "troubleshooting and alerting. Generated by "
                       "monitoring/grafana/generate_dashboard.py.",
        "tags": ["wslproxy", "sre", "slo", "production"],
        "timezone": "utc",
        "editable": True,
        "graphTooltip": 1,
        "refresh": "1m",
        "schemaVersion": 39,
        "time": {"from": "now-6h", "to": "now"},
        "timepicker": {"refresh_intervals": ["30s", "1m", "5m", "15m", "1h"]},
        "templating": {"list": [
            {"name": "datasource", "label": "Data source (Environment)",
             "type": "datasource", "query": "prometheus", "refresh": 1,
             "current": {}, "hide": 0,
             "description": "Pick the Prometheus for the environment "
                            "(int / prod) you want to inspect."},
            qvar("instance", "Node (Region)",
                 f"label_values({REQ}, instance)"),
            qvar("host", "Service / Domain",
                 f'label_values({REQ}{{instance=~"$instance"}}, host)'),
            qvar("backend", "Backend",
                 f"label_values({BREQ}, backend_label)"),
            qvar("endpoint", "Route",
                 f'label_values({REQ}{{host=~"$host"}}, endpoint)'),
            qvar("status_code", "Status Code",
                 f"label_values({REQ}, status)"),
            cvar("slo_availability", "Availability SLO", "0.9995"),
            cvar("slo_latency", "Latency SLO", "0.95"),
            cvar("slo_backend", "Backend SLO", "0.999"),
            cvar("latency_threshold", "Latency threshold (s)", "0.5"),
        ]},
        "annotations": {"list": [
            {"name": "Alerts firing", "datasource": DS(), "enable": True,
             "hide": False, "iconColor": "red",
             "expr": 'ALERTS{alertstate="firing"}',
             "titleFormat": "{{alertname}}",
             "textFormat": "{{severity}} — {{host}}{{backend_label}}",
             "useValueForTime": False},
            {"builtIn": 1, "datasource": {"type": "grafana", "uid": "-- Grafana --"},
             "enable": True, "hide": True, "iconColor": "rgba(0, 211, 255, 1)",
             "name": "Annotations & Alerts", "type": "dashboard"},
        ]},
        "links": [
            {"title": "WSLProxy Monitoring folder", "type": "link", "icon": "external link",
             "url": "https://int-grafana.diytaxreturn.co.uk/dashboards/f/afmpjjn28j4zkc/",
             "targetBlank": True},
            {"title": "Metrics endpoint", "type": "link", "icon": "external link",
             "url": "https://prod-our-v1.wslproxy.com/metrics", "targetBlank": True},
            {"title": "Admin system status", "type": "link", "icon": "external link",
             "url": "https://prod-our.wslproxy.com/system-status", "targetBlank": True},
        ],
        "panels": layout(sections),
    }
    return dashboard

if __name__ == "__main__":
    here = os.path.dirname(os.path.abspath(__file__))
    out = os.path.join(here, "dashboards", "wslproxy-sre-dashboard.json")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    dash = build()
    with open(out, "w") as f:
        json.dump(dash, f, indent=2, sort_keys=False)
        f.write("\n")
    n_panels = sum(1 + len(p.get("panels", [])) for p in dash["panels"]
                   if p["type"] == "row") + sum(1 for p in dash["panels"]
                                                if p["type"] != "row")
    print(f"wrote {out} ({n_panels} panels incl. rows)")
