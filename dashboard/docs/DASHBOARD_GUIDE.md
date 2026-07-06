# WSL Proxy Dashboards — Reader's Guide & Troubleshooting Orientation

> **Who this is for:** anyone who *didn't* build these dashboards and wants to
> understand, in a few minutes, what each one shows, when to open it, and how far
> it can actually take you when something is broken.
>
> For the build/structure/provisioning details see [`README.md`](./README.md).
> For every panel's PromQL see [`PANELS.md`](./PANELS.md). For the raw metric list
> see [`METRICS_INVENTORY.md`](./METRICS_INVENTORY.md).

There are **four** dashboards, all provisioned from
`dashboard/grafana/dashboards/` and all built **only** from metrics that really
exist on `https://prod-our.wslproxy.com/metrics` (OpenResty `lua-prometheus`) —
no invented metric names.

| # | Dashboard | uid | One-line purpose |
|---|-----------|-----|------------------|
| 1 | **WSL Proxy - SRE (10 Layers)** | `wslproxy-sre-10layer` | Top-down "is the whole service healthy, and if not, which layer?" |
| 2 | **WSL Proxy - Backend Health** | `wslproxy-backend-health` | Deep dive on **backends / upstreams / rules** — the routing tier |
| 3 | **WSL Proxy - Cache** | `wslproxy-cache` | Static-content cache effectiveness (hit ratio, bypasses, stores) |
| 4 | **WSL Proxy - Domain Deep-Dive** | `wslproxy-domain` | Everything about **one vHost** — traffic, errors, latency, endpoints, clients |

---

## Is this dashboard set helpful for troubleshooting?

**Short answer: yes for triage and for edge/backend symptoms — but it is a
metrics view, not a log/trace tool, so it tells you *where* it hurts, then hands
off.** Here is the honest breakdown.

### Where they genuinely help

- **Fast "is it healthy?" read.** The SRE dashboard's Layer 1 (golden signals +
  SLO error-budget burn) and every dashboard's info/overview row give a
  5-second health verdict before you dig.
- **Narrowing the blast radius.** You can go from "something's wrong" →
  *which domain* (Domain Deep-Dive), *which backend/rule* (Backend Health /
  SRE Layer 6–7), *which endpoint* (Top Error Endpoints / Endpoint Breakdown),
  *which layer* (SRE 10 layers) — usually without grepping logs first.
- **Distinguishing real problems from noise.** Suspicious-requests-by-reason,
  top client IPs, and (on Domain Deep-Dive) per-host scoping let you tell
  "real incident" from "one abusive scraper / Host-header scanner" — which on
  this proxy is a *frequent* question given the volume of spoofed Host headers.
- **Latency shape, not just averages.** Percentile panels + duration heatmaps
  separate "everything is slow" from "a fat p99 tail."
- **Cache effectiveness.** The Cache dashboard answers "why is origin load high"
  (low hit ratio, which extension/host, which bypass reason).

### Where they will NOT help — know this going in

1. **They stop at metrics.** No log lines, no traces, no request IDs, no
   exemplars. You identify a bad endpoint/backend here, then go to the
   access/error logs (or the admin **Logs & AI Analysis** page) to see *why*.
2. **Backend/rule attribution is not per-host.** The exporter labels
   backend/upstream metrics by **rule / backend / upstream**, *not* by host. So
   Domain Deep-Dive can tell you *that* a domain returns 5xx, never *which
   backend* caused it. For that you jump to Backend Health + the admin UI's
   *Server Rules* / *Topology* view. (Domain Deep-Dive says this in-panel.)
3. **`env` label may be empty.** Panels filter `env=~"$env"`, but on prod
   `/metrics` the `env` label came back empty in practice. If the exporter isn't
   emitting `env`, an `$env`-scoped panel can silently read empty — verify
   against real data before trusting an empty panel.
4. **Sparse metrics look like "broken" panels.** Cache and per-IP metrics only
   exist for hosts that actually hit those code paths, so a low-traffic domain
   shows blank cache/client panels. That's absence of data, not a bug.

### Verdict

Treat the set as **triage + first-look diagnosis, not full root-cause**:

- **SRE** → "which layer is on fire?"
- **Backend Health** → "which backend/rule/upstream is the cause?" (this is where
  most real 502/timeout incidents get resolved)
- **Domain Deep-Dive** → "which customer domain & endpoint is affected?"
- **Cache** → "is caching helping or hurting origin load?"

Then the last mile — *why* a specific request failed — is **logs + admin UI**.

---

## Which dashboard do I open? (decision guide)

| I'm seeing / asked… | Start here | Then |
|----------------------|-----------|------|
| "Is the whole proxy healthy right now?" | **SRE** Layer 1 | drill into the red layer |
| 502 / 504 / upstream timeouts | **Backend Health** (Per-Backend Health, 5xx by Backend, Latency p95) | admin *Topology* / logs |
| One customer says "my site is down/slow" | **Domain Deep-Dive** (pick their Host) | Backend Health for the backend |
| Error-rate spike, source unknown | **SRE** Layer 4 → **Backend Health** Error Analysis | Top Error Endpoints/Backends |
| Latency regression | **SRE** Layer 5 / **Backend Health** §6 | latency heatmap, slowest backends |
| High origin load / cache seems off | **Cache** (hit ratio, bypass reasons, per-host) | lowest-hit-ratio hosts table |
| Possible abuse / scanner / auth attack | **SRE** Layer 10 / **Domain Deep-Dive** clients | top suspicious sources |
| "Which rule/backend serves host X?" | *(not in metrics)* admin **Server Rules / Topology** tab | `GET /api/topology/graph` |

---

## 1 · WSL Proxy - SRE (10 Layers) — `wslproxy-sre-10layer`

**What it's for:** the single at-a-glance board. Top-down SRE structure: start at
the service level, walk down the stack until you find the broken layer.

- **Template variables:** `datasource`, `env`, `instance`, `host`.
- **The 10 layers:**
  1. **Service Level (SLO) & Golden-Signal Summary** — Availability %,
     **error-budget burn** vs a 99.9% SLO, req/s, error %, backend p95, active
     conns, fleet size, healthy/unhealthy backends, cache hit %, auth failures.
  2. **Edge / HTTP Front Door** — status classes, nginx connection states
     (reading/writing/waiting), proxied responses/s.
  3. **Traffic** (golden signal) — request & proxied-response rate, throughput,
     top hosts/endpoints, methods.
  4. **Errors** (golden signal) — error rate by class, 5xx by backend, top error
     endpoints, top 5xx backends.
  5. **Latency** (golden signal) — backend vs edge percentiles + two heatmaps.
  6. **Routing & Rules** — rule → backend table, requests by rule, rule
     utilisation.
  7. **Backend / Upstream Health** — per-backend health, fleet availability,
     backend health **state timeline**.
  8. **Saturation & Capacity** (golden signal) — connections, backend saturation,
     admin-plane API call rate, peak req/s & conns.
  9. **Cache Efficiency** — activity rate, hit ratio, bypasses, hit ratio by host.
  10. **Security, Auth & Observability** — suspicious requests, auth attempts,
      top suspicious sources, WAF inspection p95, scrape health, **alert list**.
- **Standout panels:** Error-Budget Burn Rate (Layer 1), Backend Health State
  Timeline (Layer 7), the "Observability & honest gaps" note (Layer 10).
- **Strengths:** one board answers "healthy? and if not, which layer?" Great
  incident starting point.
- **Limitations:** breadth over depth — each layer is a summary; you'll often
  jump to Backend Health or Domain Deep-Dive for the detail. Golden signals mix
  edge and backend metrics, so read the panel titles (edge vs backend).

## 2 · WSL Proxy - Backend Health — `wslproxy-backend-health`

**What it's for:** the routing/upstream tier in depth — the dashboard you live in
during a backend incident. ~90 panels across 16 rows.

- **Template variables:** `datasource`, `env`, `job`, `instance`, `host`,
  `backend`, `rule`, `namespace` (richest variable set of the four).
- **Layout (rows):** Executive Overview → **Backend Health** (per-backend table)
  → **Rules with Backends** (rule→backend routing) → Traffic → **Error Analysis**
  → **Backend Latency** → Backend Availability (state timeline) → Load
  Distribution → Health Checks → Request Distribution → *(Go Runtime = N/A note)*
  → HTTP Metrics → Prometheus Scrape → Resource Usage → Alerts → Useful Top-N &
  Heatmaps.
- **Standout panels:** *Per-Backend Health (sorted by traffic)*, *Rule → Backend
  Routing*, *Backend Failures (5xx) by Backend*, *Backend Health State Timeline*,
  *Slowest Backends (p95)*, *Top Error Backends*.
- **Strengths:** this is where **502/timeout/upstream** incidents actually get
  root-caused — it answers *which backend, under which rule, is failing/slow*.
- **Limitations:** backend metrics are labelled by backend/rule/upstream, **not
  by host** — so it's fleet-wide, not "this customer's backend." Some rows
  (Go Runtime) are deliberately N/A placeholders for metric parity.

## 3 · WSL Proxy - Cache — `wslproxy-cache`

**What it's for:** static-content caching effectiveness and why origin load is
what it is.

- **Template variables:** `datasource`, `env`, `job`, `instance`, `host`,
  `extension` (note: variables derive from `nginx_cache_misses_total`, so only
  hosts/extensions that have cache activity appear).
- **Layout (rows):** Overview → Hit Ratio & Activity → **Per-Host Cache** →
  Hit-Ratio Breakdown (by host / by extension) → **By File Extension**
  (hits/misses/bypasses) → **Cache Bypasses** (by reason/host) → Cache Stores
  (writes, by content-type/extension) → Cache Enablement (enabled/disabled by
  host timeline) → **Top-N Diagnostics** (lowest hit-ratio, top miss/hit hosts)
  → Notes & Alerts.
- **Read-me first:** it carries an explicit "Why this does NOT match the admin UI
  'Cache' page" note — this dashboard shows **counters/rates over time**, the
  admin UI shows **live cache contents**. They are different things; don't expect
  them to agree.
- **Standout panels:** *Per-Host Cache (sorted by hits)*, *Lowest Hit-Ratio Hosts
  (worst first)*, *Bypasses by Reason*, *Hit Ratio by Extension*.
- **Strengths:** pinpoints *why* hit ratio is low (which host, which extension,
  which bypass reason) — directly actionable for cache config tuning.
- **Limitations:** only covers hosts with caching enabled + real cache traffic;
  hit-ratio convention is 🔴 <50% · 🟡 50–80% · 🟢 ≥80%.

## 4 · WSL Proxy - Domain Deep-Dive — `wslproxy-domain`

**What it's for:** the developer/per-customer view — pick **one domain** and see
its whole story on one page. Answers "why is *my* site slow/broken?" without
grepping logs.

- **Template variables:** `datasource`, `env`, and **`host`** — the `host`
  variable is a **curated custom list** of the real domains this proxy serves
  (≈124 entries), *not* a raw `label_values` query. This was deliberate: a raw
  query pulled ~430 values, mostly Host-header scanner noise (`*.workstation.co.uk`
  sprawl), IPs, `-`, `_` and external call-out hosts. Default host is
  `prod-our.wslproxy.com`. **To add/remove a domain**, edit the `host` variable's
  `query`/`options` in `wsl-proxy-domain.json`.
- **Layout (sections):** header (Caching Enabled / Endpoints Seen / Client IPs) →
  **Golden Signals (this domain)** → Traffic → **Errors** (rates + top error
  endpoints + suspicious requests) → **Latency** (percentiles + heatmap + slowest
  endpoints) → **Endpoints** (top by requests + full breakdown table) → Cache
  (this domain) → **Clients** (top client IPs) → Backend & Routing (a *note*, see
  below).
- **Standout panels:** *Top Error Endpoints (this domain)*, *Endpoint Breakdown
  (requests · errors · p95)*, *Latency Percentiles + duration heatmap*, *Top
  Client IPs*, and the 5xx-spike annotation on the timeline.
- **Strengths:** best *triage* tool for a single-domain complaint — fast path to
  "which endpoint hurts."
- **Limitations (called out in-dashboard):** **edge metrics only.** Which backend
  or rule serves this specific domain is **not** filterable here (metrics aren't
  host-labelled for backends) — the "Backend & Routing" section is a pointer to
  **Backend Health** + admin *Server Rules* / *Topology* + `GET
  /api/topology/graph`.

---

## Cross-cutting gotchas (apply to all four)

- **Edge vs backend:** always read whether a panel measures the **edge** (what
  the proxy saw) or the **backend** (upstream). Golden-signal rows mix both.
- **`env` label may be empty on prod** — `$env`-scoped panels can read empty even
  when traffic exists. Verify before concluding "no data = no traffic."
- **Backend/upstream/rule metrics are not host-labelled** — you cannot answer
  "which backend serves host X" from Prometheus; use the admin UI/topology API.
- **Sparse metrics ≠ broken panels** — cache and per-IP series only exist where
  that code path ran.
- **Colour conventions:** 🟢 healthy · 🟡 warning · 🔴 critical · ⚪ unknown;
  cache hit ratio 🔴 <50% · 🟡 50–80% · 🟢 ≥80%; SRE SLO = **99.9%**.
- **The metrics endpoint** the dashboards link to:
  `https://prod-our.wslproxy.com/metrics`.
