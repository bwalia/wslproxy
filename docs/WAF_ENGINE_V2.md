# WSLProxy WAF — Engine v2 (enterprise enforcement)

Status: **implemented (MVP)** · inspired by F5 WAF for NGINX (App Protect) ·
runs in the OpenResty request path (`api/waf_engine.lua`, `api/waf_stages.lua`,
`api/waf_support.lua`).

This document is the design reference: architecture, the policy schema, the
binding-precedence algorithm, the signature-ID / governance model, and the
roadmap that maps the remaining F5-parity features to MVP / P2 / P3.

---

## 1. Goals

A production WAF that platform and security teams can bind per domain, per
service and per route, run in blocking or transparent mode, govern by stable
signature IDs, and operate with structured logs + correlation IDs — not a
regex snippet.

Design constraints that shaped it:

- **In the NGINX request path.** LuaJIT, per-worker compiled-regex cache (the
  `o` flag on `ngx.re.find`), shared dicts for velocity counters. No blocking
  I/O on the hot path.
- **Fail-open by default.** Any engine or stage error logs and allows the
  request (a WAF bug must never take the site down). Parse-error *fail-closed*
  on untrusted bodies is a policy option, not the default (see roadmap P2).
- **Backward compatible.** A v1 policy (just `waf_rules` + `mode`) keeps working
  unchanged; every v2 field is optional and additive.
- **Explainable.** Every block names the policy, the binding that won, the
  stage, the violation code, the signature ID and a support ID.

---

## 2. Request-path architecture

```
rewrite_by_lua  gateway_ack.lua      select route rule
                     │
                     ▼
                gateway_pipeline.execute()
                     │  Phase 2 rate-limit → Phase 3 WAF → …
                     ▼
                waf_engine.inspect(server_config, profile_id)   ── fail-open wrapper
                     │
                     ▼
                _inspect_impl:
                  load policy (30s TTL cache)
                  resolve effective mode + winning binding   (§4)
                  ┌── STAGE PIPELINE (waf_stages.PIPELINE) ──────────────┐
                  │  1 method allow-list      VIOL_METHOD                │
                  │  2 filetype deny          VIOL_FILETYPE              │
                  │  3 smuggling / desync     VIOL_SMUGGLING             │
                  │  4 ip lists → geo         VIOL_IP_DENY / VIOL_GEO    │
                  │  5 jwt alg policy         VIOL_JWT_ALG               │
                  │  6 json body profile      VIOL_JSON_SIZE/DEPTH       │
                  │  7 brute-force velocity   VIOL_BRUTE_FORCE           │
                  │  8 openapi positive-sec   VIOL_OPENAPI_PATH/METHOD   │
                  └──────────────────────────────────────────────────────┘
                  ┌── SIGNATURE MATCHING (governed) ─────────────────────┐
                  │  per rule: disabled? set-disabled? staged?           │
                  │  match target → block | alarm                        │
                  │  anomaly score ≥ threshold → VIOL_ANOMALY_SCORE      │
                  └──────────────────────────────────────────────────────┘
                     │
                     ▼  finding
                block_request(): 403 + X-WAF-Block + X-WAF-Rule +
                                 X-WAF-Violation + X-Support-ID + block page
```

Each stage is a pure function `(policy, ctx) -> finding|nil`. The engine — not
the stage — decides **block vs alarm** from the effective enforcement mode, so
the same rule set behaves differently per binding without duplication.

---

## 3. Policy schema (v2)

`docs/waf-policy.schema.json` is the machine-readable JSON Schema. Shape:

```jsonc
{
  "id": "waf-policy-payments-hard",
  "name": "Payments API — Hardened",
  "schema_version": 2,
  "enabled": true,
  "enforcementMode": "blocking",        // "blocking" | "transparent" (alias of mode block|monitor)
  "service": "payments",                 // logical app label (appears in logs/binding)
  "anomaly_threshold": 6,

  "waf_rules": ["waf-rule-sqli-001", ...],           // signatures in this policy
  "signatureSets": [                                  // set-level block/alarm toggles
    { "id": "SET_SQLI", "block": true, "alarm": true }
  ],
  "signatures": {                                     // per-ID governance
    "disable": ["waf-rule-xss-005"],
    "stage":   [{ "id": "waf-rule-openredirect-001", "until": "2026-12-31T00:00:00Z" }]
  },

  "methods":   { "allow": ["GET","POST","HEAD","OPTIONS"] },
  "filetypes": { "deny": [".env",".sql",".bak",".git",".pem"] },
  "smuggling": { "enforce": true, "allowChunked": true },   // CL/TE desync guard → VIOL_SMUGGLING
  "geo":       { "denyCountries": ["KP"], "db": "/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN" },
  "ipLists":   { "allow": ["10.0.0.0/8"], "deny": ["5.6.7.0/24"] },
  "jwt":       { "header": "Authorization", "denyAlg": ["none","HS256"], "requireAlg": ["RS256","ES256"] },
  "jsonProfile": { "maxDepth": 8, "maxBytes": 16384 },
  "bruteForce":  [{ "path": "/api/login", "windowSec": 60, "maxAttempts": 5, "action": "block", "keyBy": ["ip"] }],

  "routeOverrides": [                                 // binding precedence (see §4)
    { "path": "/preview", "enforcementMode": "transparent" }
  ],

  "logging": { "profile": "verbose", "destination": "syslog" },
  "blocked_response": { "status_code": 403, "content_type": "text/html", "body_base64": "…{{support_id}}…" },
  "whitelist": { "ips": ["127.0.0.1"], "paths": ["/health"], "user_agents": [] }
}
```

### Signature (rule) schema

```jsonc
{
  "id": "waf-rule-ssti-001",          // stable ID — the addressable unit
  "name": "SSTI — Template Expression Injection",
  "category": "ssti",                  // → default set id SET_SSTI
  "signature_set": "SET_SSTI",         // optional explicit set
  "severity": "high",
  "target": "all",                     // url|args|body|headers|cookies|user_agent|all
  "pattern": "(?:\\{\\{[^}]{0,120}?\\}\\}|…)",
  "pattern_type": "regex",             // "regex" | "string"
  "action": "block",                   // "block" | "monitor" (alarm-only)
  "score": 8,                          // contributes to anomaly total when enforcing
  "tags": ["api-security","ssti"],
  "references": ["CWE-1336","OWASP-A03"]   // (P2: enforced/rendered)
}
```

---

## 4. Binding resolution algorithm

Precedence, **most specific wins**:

```
route override  >  per-server (waf_mode_override)  >  policy default (enforcementMode)
```

```lua
mode    = normalize(policy.enforcementMode or policy.mode)   -- "block" | "monitor"
binding = "domain"
if server.waf_mode_override then mode = server.waf_mode_override; binding = "server" end
best = -1
for ro in policy.routeOverrides:
    if methodMatches(ro, ctx.method) and ctx.path startswith ro.path and len(ro.path) > best:
        best    = len(ro.path)
        mode    = normalize(ro.enforcementMode or ro.mode)
        binding = "route:" .. ro.path
return mode, binding
```

`binding` is recorded on every finding, so a log line answers *which binding
won* — the property the brief calls out as critical. Longest-prefix wins makes
`/api/admin` beat `/api`. A **service** is a logical label (`server.waf_service`
or `policy.service`) that rides along in logs; service-level *policy selection*
(a service → policy map) is P2.

---

## 5. Signature governance

Three independent controls, evaluated per rule during matching:

| Control | Source | Effect |
|---|---|---|
| **disable** | `signatures.disable: [id]` | rule skipped entirely |
| **stage** | `signatures.stage: [{id, until}]` | rule **alarms only** until the timestamp, then enforces — the safe-rollout path |
| **set toggle** | `signatureSets: [{id, block}]` | `block:false` downgrades a whole set to alarm-only |

A staged or set-disabled signature **alarms and does not contribute to the
anomaly score**, so staging can never cause a block indirectly. A rule's set is
`signature_set` or `SET_<CATEGORY>`.

---

## 6. Observability

- **Correlation ID** — every block/alarm gets `WSL-<epoch>-<rand>`, echoed as
  `X-Support-ID` and rendered into the block page (`{{support_id}}`).
- **Structured security log** — one JSON line per decision, tagged `wafsec` for
  syslog/OTel shipping: `support_id, action, code, stage, signature_id,
  signature_set, category, severity, policy, service, binding, host, client_ip,
  method, uri, latency_us`. Also retained in the `waf_events` shared dict for
  the recent-events API.
- **Metrics** — existing Prometheus counters (`waf_blocked`, `waf_monitored`,
  `waf_inspections`, `waf_latency`, `waf_errors`) by host/category/severity.
- **Response headers** — `X-WAF-Block`, `X-WAF-Rule`, `X-WAF-Violation`,
  `X-Support-ID`.

---

## 7. Violation codes

| Code | Stage |
|---|---|
| `VIOL_METHOD` | method allow-list |
| `VIOL_FILETYPE` | filetype deny |
| `VIOL_SMUGGLING` | HTTP request-smuggling / desync guard (CL+TE, obfuscated/duplicate Transfer-Encoding, malformed Content-Length) |
| `VIOL_IP_DENY` / `VIOL_GEO` | ip lists / geo |
| `VIOL_JWT_ALG` | jwt algorithm policy |
| `VIOL_JSON_SIZE` / `VIOL_JSON_DEPTH` | json body profile |
| `VIOL_BRUTE_FORCE` | velocity control |
| `VIOL_OPENAPI_PATH` / `VIOL_OPENAPI_METHOD` | OpenAPI positive security |
| `VIOL_ATTACK_SIGNATURE` | signature match |
| `VIOL_ANOMALY_SCORE` | cumulative score ≥ threshold |

---

## 8. Roadmap (F5 App Protect parity)

### MVP — **done**
Policy bind per domain + per route · signature sets / per-ID enable-disable-stage ·
method & filetype allow/deny · IP allow-deny + geo country deny · JWT alg policy ·
JSON body depth/size profile · brute-force velocity · **OpenAPI positive security**
(declared path+method allow-list, path templating) · **HTTP request-smuggling /
desync guard** (`smuggling` stage → `VIOL_SMUGGLING`, plus `waf-rule-smuggling-001`
for body-embedded request lines) · structured security log +
support IDs · Prometheus metrics · block page with support ID · golden tests
(`examples/wslproxy-waf-demo/waf_features.py`, 16/16) proving per-binding actions ·
**CI validation** (`tools/waf_validate.py` + `.github/workflows/waf-validate.yml`:
Lua syntax + JSON-Schema policy validation + signature referential integrity) ·
**admin UI** (react-admin WafPolicies/WafRules forms cover every v2 field).

### Phase 2
- Service → policy binding map (logical app selection), not just a label.
- OpenAPI **parameter/type** validation from a full spec (today: path+method surface).
- XML profile (DTD/entity off, depth/size) as a first-class stage (today XXE is
  caught by the `<!ENTITY>` + `file://` signatures).
- GraphQL depth/batch/introspection **profile** (today introspection is a signature).
- Cookie integrity / attribute enforcement; JWT **JWKS signature** verify.
- Response **Data Guard** (PAN/SSN masking in the body_filter phase).
- `references` (CWE/OWASP) rendered in logs and the events API.
- Configurable **fail-closed** on body parse errors in blocking mode.
- Bot classes beyond UA (header/JA3 signals); threat-campaign pack channel.
- `aegisctl`-style CLI: `compile | validate | test | bench`; policy unit tests.

### Phase 3
- Behavioural L7 DoS (token bucket + per-object anomaly).
- IP-reputation feed adapter; MaxMind pluggable geo.
- gRPC/protobuf malformed detection.
- Ingress CRDs (`WAFPolicy`, `WAFBinding`) + GitOps policy validation in CI.
- Hyperscan/Vectorscan matching backend when present (FFI), Aho-Corasick fallback.

---

## 9. Non-goals (v1)

Full RASP / in-process app instrumentation · copying proprietary signature DBs ·
in-path ML training. Heuristics + signatures first.
