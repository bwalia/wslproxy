# Build Prompt: Rust Native Application Delivery Platform (WSLProxy Successor)

> Copy this entire document into a coding agent / architecture session as the system prompt.
> Goal: design and implement a **single Rust binary core** plus optional microservices that replace WSLProxy (OpenResty/Lua) and absorb the capability surface of **NGINX Plus + F5 WAF for NGINX + NGINX Instance Manager + NGINX Ingress Controller + NGINX Gateway Fabric + NGINX One Console**.

---

## 0. Mission

Build a cloud-native **application delivery platform** in Rust that:

1. Replaces **WSLProxy** feature-for-feature (dynamic API gateway / reverse proxy / admin plane).
2. Matches or exceeds **NGINX Plus** as an all-in-one load balancer, reverse proxy, web server, content cache, and API gateway.
3. Embeds **enterprise WAF / DoS / bot / API security** (parity with F5 WAF for NGINX + F5 DoS for NGINX).
4. Provides **fleet management** (parity with NGINX Instance Manager + NGINX One Console).
5. Provides **Kubernetes ingress + Gateway API** from the **same binary** (parity with NGINX Ingress Controller + NGINX Gateway Fabric).
6. Uses **typed JSON/YAML (and CRDs)** for configuration — no Lua, no opaque base64 nginx snippets as the primary control plane.
7. Ships as **one core data-plane binary** with **optional control-plane / edge microservices** that plug into it.

Working product name (placeholder): **`adp`** (Application Delivery Proxy) — rename as desired.

---

## 1. Non-Negotiable Design Principles

### 1.1 Single binary, many roles

One Rust binary (`adp`) with subcommands / `--role`:

| Role | Purpose |
|------|---------|
| `proxy` | Data plane: L4/L7 proxy, cache, WAF, API gateway |
| `ingress` | Kubernetes Ingress controller (same data plane) |
| `gateway` | Kubernetes Gateway API controller (same data plane) |
| `agent` | Lightweight agent for remote config, metrics, certs (NIM/One parity) |
| `control` | Optional embedded control plane (or talk to separate `adp-control`) |
| `all` | Combined mode for single-node / POP deploys (WSLProxy-like) |

**Ingress and Gateway Fabric MUST be the same binary and same request pipeline as bare-metal/POP proxy.** No second Lua/OpenResty stack. Kubernetes is a *config source*, not a different product.

### 1.2 Configuration as data (not generated nginx)

- Primary formats: **YAML + JSON Schema** (and Kubernetes CRDs that map 1:1).
- Hot-reload via watch / push / API — **no process restart** for rules, backends, WAF policies, traffic splits, most TLS allow-lists.
- Reload only when needed for bind addresses, worker count, shared memory sizing, etc.
- Versioned configs with draft → pending → live → archived (keep WSLProxy 4-eyes change requests).
- **Never** require operators to hand-edit raw nginx `server {}` blocks. Optional “escape hatch” raw snippets allowed but discouraged and audited.

### 1.3 Core + microservices

| Layer | Components | Notes |
|-------|------------|-------|
| **Core (in-process / same binary)** | L4/L7 proxy, TLS, routing, LB, cache, WAF engine, rate limit, metrics exporter, health | Must stay in the hot path; zero network hop for WAF/LB |
| **Sidecar / agent** | Config sync, cert agent, log shipper, NIM-like registration | Talks gRPC/HTTP to control plane |
| **Control-plane microservices** | API, auth, inventory, policy compiler, AI analysis, MCP, UI BFF | Deploy independently; scale separately |
| **Optional data services** | Redis/NATS/Postgres/object store | Pluggable storage |

Rule: **anything on the request path stays in the Rust core**. Anything that can tolerate 50–500ms latency can be a microservice.

### 1.4 Fail-open vs fail-closed

- Routing / health / metrics: **fail-open** (log + continue) unless policy says otherwise.
- Auth / WAF block mode / mTLS: **fail-closed**.
- Document every fail-open path; make mode configurable per policy.

### 1.5 Migration from WSLProxy

- Import existing `/opt/nginx/data/{servers,rules,ssl,upstreams,waf_*,varnish,profiles,secrets}` JSON trees.
- Dual-run mode: read WSLProxy disk layout while writing new schema.
- Feature parity checklist must be green before cutting over a POP.

---

## 2. Reference: WSLProxy Features to Preserve

Implement **all** of the following (current WSLProxy / OpenResty stack):

### 2.1 Dynamic request pipeline

- Host → server config load
- Candidate rule load + match (path, IP/CIDR, country/GeoIP, JWT, S3 signing, cookie KV)
- Deterministic selection: priority > path specificity > condition count > rule id
- Response actions by status:
  - `200` / `403` static HTML (base64 or raw)
  - `301` / `302` redirect
  - `305` proxy pass
  - `306` CAPTCHA challenge then continue as 305
- Per-server proxy timeouts (connect / send / read) applied on balancer
- Custom request/response headers
- Strip path, auto HTTPS redirect
- Consul SRV DNS + standard resolver fallback
- TCP stream proxy (k3s API style L4 LB) with fast connect timeout + `max_fails` / `fail_timeout`

### 2.2 Traffic routing

- Modes: weighted, round-robin, least-conn, least-time, header-based canary, cookie sticky, IP hash, random-with-two-choices
- Passive health (N consecutive 5xx → unhealthy TTL)
- Active health checks (HTTP/TCP/gRPC) on worker-0 or dedicated task
- Fail-open when all backends unhealthy (configurable)
- Live weight update / promote / rollback APIs (traffic split)

### 2.3 TLS / ACME

- Per-domain SSL enable + allow-list (shared dict equivalent)
- Let’s Encrypt / ACME HTTP-01 (+ optional DNS-01)
- Staging/prod ACME, force HTTPS, HSTS
- Fallback certs, dual RSA/ECC, TLS 1.2/1.3, mTLS terminate + upstream mTLS
- Hot allow-list updates without full restart where possible; document when reload is required

### 2.4 Cache

- Static content cache (TTL, extensions, MIME, bypass cookie/auth)
- Docker registry blob/manifest disk cache + serve-stale
- Optional Varnish-compatible path OR native Rust cache with VCL-like DSL subset (prefer native; keep Varnish as optional external)

### 2.5 WAF / security (current)

- Rule policies, OWASP-style SQLi/XSS/RCE, block/monitor modes
- Body inspection with size limits
- Rate limiting (RPS + burst, shared state)
- CAPTCHA (Turnstile / reCAPTCHA) with signed cookie
- IP ACL allow/deny, geo block/allow
- Audit NDJSON trail

### 2.6 Admin / control plane (current)

CRUD + special endpoints for: servers, rules, secrets, instances, upstreams, users, profiles, waf_rules, waf_policies, waf_events, bookmarks, sessions, change-requests, versions, audit, settings, cache, varnish, traffic, AI analyze, logs, topology graph, openresty_status → **proxy_status**, push-data, MCP.

Auth: JWT bearer, login, session store (Redis). Multi-env profiles (`dev/int/test/acc/prod`).

### 2.7 Observability (current)

- Prometheus metrics, traffic stats (hourly buckets), backend health metrics
- Access/error log APIs, topology graph, AI log analysis hook

### 2.8 MCP

- MCP server: resources for servers/rules/policies/metrics; optional write tools (bind WAF, reload, traffic split)
- Read-only vs write mode + API key + rate limit

### 2.9 Deploy topologies (current)

- Docker local, Ansible bare-metal/VM POPs, Helm k8s ingress
- S3 backup of data trees (servers/rules/ssl/ssl-certs/upstreams/varnish/waf/pops)
- POP migration without overwrite; include `ssl/` + reload for domain allow-list

### 2.10 Additional WSLProxy capabilities (from full inventory)

Do **not** drop these — they are production features today:

**Rule / match detail**
- Path keys: `starts_with` | `ends_with` | `equals` with specificity scoring
- Client IP: `equals` / `starts_with` / `ipheader` mode; set `X-Origin-IP`
- Cookie JWT + header JWT (Bearer strip); cookie KV equality; AWS S3 SigV4 request signing (`s3_host_override`)
- Dual rule attachment: `rules[]` (AND) + `match_cases[{statement, condition: and|or}]`
- Schema v1→v2 S3 key migration on load
- Unix socket backends (`unix:/...`); path prefix from `redirect_uri` prepended to upstream URI
- Fallback branded pages: `no_server`, `no_rule`, `conf_mismatch`

**Pipeline extras**
- Cache short-circuit on GET/HEAD before full rule match
- CAPTCHA verify endpoint `POST /__captcha/verify`
- Sticky `Set-Cookie` from router (HttpOnly, Max-Age)
- LLM protocol translation per rule (`llm_translate`): OpenAI ↔ Anthropic, including SSE body streaming
- **MCP gateway** on proxy path: allow/deny upstream MCP tools/methods, per-tool rate limit, audit `tools/call`
- Balancer retries / `set_more_tries` across backends

**WAF detail**
- Targets: `all|url|headers|body|args|cookies|user_agent`; pattern `regex|string`
- Anomaly score threshold; whitelist paths/IPs/UAs; custom block page
- Default rule packs: `sqli`, `xss`, `cmdi`, `lfi`, `protocol`
- Events API + Prometheus WAF latency/block/monitor counters

**Varnish / cache detail**
- VCL snippet hooks: `vcl_init/recv/hash/hit/miss/backend_fetch/backend_response/deliver/synth`
- Snippet CRUD + priority; deploy status `deployed|pending_changes`; purge by pattern
- Docker blob vs manifest toggles; debug headers `X-WSL-Cache-*`

**Multi-POP / DNS CDN**
- POP registry: `active|draining|down|maintenance`; public IPv4/IPv6; geo metadata
- Server `pop_ids` + `dns_record_type` (A/AAAA/BOTH/CNAME)
- Cloudflare (pluggable) DNS provision/converge APIs + MCP tools + audit
- Instance push/pull sync; `instance_locked` delete protection; project import

**Governance / UX extras**
- Bookmarks (auto from servers + user); public `/api/public/bookmarks`
- Topology graph (servers → rules → backends + health)
- Log search/tail (access/errors) with status-class filters
- Detailed health, instance info, storage-type switch at runtime
- Env profiles `dev/int/test/acc/prod`; dual storage disk|redis|pgsql

**K8s CRD already in tree**
- `WSLProxyBackend`: upstreams, LB modes, healthCheck, circuitBreaker, timeouts, retries
- Ingress class `wslproxy`; EndpointSlice reconcile; map cleanly to Gateway API + native CRDs in Rust

**Non-requirements (do not port blindly)**
- Archived Lua (`router_archived_*`, scratch `temp.lua`)
- Mock `users` / `sessions` modules — replace with real RBAC
- Browser-composed base64 nginx `config` as source of truth — replace with typed YAML/JSON

**Suggested port order (inventory)**
1. Data plane: match → select → response codes → DNS → timeouts  
2. Traffic router + health + metrics  
3. Admin CRUD + disk storage + profiles  
4. SSL lifecycle  
5. WAF + rate limit + captcha  
6. Cache (+ optional Varnish)  
7. Versions / CR / audit  
8. MCP + POP/DNS  
9. Ingress / Gateway controller  
10. Admin UI (prefer Next.js surface)

---

## 3. Reference: NGINX Plus / F5 / NGINX One Capabilities to Absorb

The product must cover these capability groups (names are F5 product labels; implement as modules of `adp`, not as wrappers around NGINX).

### 3.1 NGINX Plus — data plane

- HTTP / HTTPS / HTTP/2 / HTTP/3 (QUIC) terminate + proxy
- HTTP/2 to upstream; gRPC proxy; WebSocket; CONNECT forward proxy (+ Basic auth)
- TCP / UDP / TLS stream load balancing
- Algorithms: round-robin, least-conn, least-time (TTFB / last byte / inflight), IP hash, hash, random, sticky cookie/learn
- Active + passive health checks (HTTP status, body regex, TCP connect, gRPC)
- Slow-start, max_conns, queueing, backup servers, drain
- Dynamic upstream membership via API (no reload)
- Session persistence (cookie, sticky learn, route)
- SSL offload, dual certs, secure links, PROXY protocol
- Content cache with purge API, cache lock, stale-while-revalidate / stale-if-error
- Bandwidth / connection / request rate limiting
- Key-value store API (dynamic denylist, feature flags, A/B)
- JWT authn + OIDC SSO (auth_request / IdP integration)
- Subrequest auth, Basic auth, mTLS
- Live activity / dashboard metrics API (Plus status parity)
- JSON error log with custom variables
- High-fidelity upstream latency histograms
- Agentic / AI traffic monitoring hooks (Plus R37-style)

### 3.2 F5 WAF for NGINX + DoS

- Signature + behavioral WAF (OWASP Top 10, injection, XSS, path traversal, etc.)
- Policy as YAML/JSON/CRD; policy bundling + versioning
- Block / monitor / transparent modes; false-positive workflow
- Bot protection, API schema validation (OpenAPI), threat intelligence feeds (pluggable)
- L7 DoS: adaptive rate, challenge, blackhole
- Per-route / per-gateway WAF policy binding (Gateway API `WAFPolicy` parity)
- Core WAF evaluation **in-process** in Rust (or WASM sandbox plugin), not a remote call on every request

### 3.3 NGINX Instance Manager (air-gapped capable)

- Instance discovery / registration / inventory
- Config push, validate, version, rollback
- Certificate inventory + expiry alerts
- Metrics + log aggregation for disconnected environments
- Instance groups / tags / environments
- Local (non-SaaS) control plane deployable on POP

### 3.4 NGINX Ingress Controller

- Watch Ingress + Services + Endpoints/EndpointSlices
- Path/host routing, TLS secrets, canary annotations, rewrites, timeouts, upstreams
- TCP/UDP Ingress ConfigMaps / CRDs
- Custom resources for VirtualServer / TransportServer / Policy (or cleaner CRD set)
- Prometheus metrics, health, leader election
- Same data plane as `adp proxy`

### 3.5 NGINX Gateway Fabric

- Full **Gateway API** support: GatewayClass, Gateway, HTTPRoute, GRPCRoute, TCPRoute, TLSRoute, UDPRoute, ReferenceGrant
- Role separation (infra vs app owners)
- Attached policies: WAF, rate limit, auth, observability
- Hybrid/multicloud intent: multi-cluster Gateway (phase 2), consistent policy model

### 3.6 NGINX One Console (fleet SaaS / self-hosted)

- Fleet overview: health, CVEs/config drift, cert expiry, WAF posture
- Remote config + policy distribution
- Metrics dashboards, alert rules
- Multi-tenant orgs / workspaces
- Agent-based connect (outbound) for firewalled POPs
- Public API for GitOps / automation
- Optional SaaS; **must** also run self-hosted (Instance Manager mode)

---

## 4. Target Architecture

```
                    ┌──────────────────────────────────────────┐
                    │  adp-console / UI / MCP / GitOps         │
                    │  (microservice: Next.js + BFF)           │
                    └─────────────────┬────────────────────────┘
                                      │ REST / gRPC / NATS
                    ┌─────────────────▼────────────────────────┐
                    │  adp-control (microservice)              │
                    │  inventory · config compiler · versions  │
                    │  CR approval · certs · policy packs      │
                    └─────────────────┬────────────────────────┘
                                      │ gRPC push / pull
           ┌──────────────────────────┼──────────────────────────┐
           │                          │                          │
   ┌───────▼────────┐        ┌────────▼────────┐        ┌────────▼────────┐
   │ adp agent      │        │ adp agent       │        │ adp (ingress/   │
   │ + adp proxy    │        │ + adp proxy     │        │  gateway role)  │
   │ (POP / VM)     │        │ (edge node)     │        │ in Kubernetes   │
   └───────┬────────┘        └────────┬────────┘        └────────┬────────┘
           │                          │                          │
      clients / TLS              clients / TLS              Services/Pods
```

### 4.1 Core crates (suggested Rust workspace)

```
adp/
  crates/
    adp-core/          # event loop, listeners, connection mgmt (tokio / hyper / quinn)
    adp-http/          # HTTP/1.1, H2, H3, WebSocket, gRPC bridge
    adp-stream/        # TCP/UDP/TLS stream LB
    adp-router/        # match engine (host/path/header/method/geo/jwt/…)
    adp-lb/            # algorithms + health + sticky
    adp-cache/         # disk + memory cache, purge API
    adp-tls/           # rustls, ACME, cert store
    adp-waf/           # WAF + DoS engines + policy IR
    adp-ratelimit/     # token bucket / sliding window / concurrency
    adp-authn/         # JWT, OIDC, mTLS, basic, subrequest auth
    adp-config/        # schema, YAML/JSON, hot reload, CRD mapping
    adp-observe/       # metrics, tracing (OTel), access logs
    adp-api/           # admin REST (Axum) — can also run as microservice
    adp-k8s/           # Ingress + Gateway API controllers
    adp-agent/         # NIM/One agent protocol
    adp-mcp/           # MCP server
    adp-migrate/       # WSLProxy data importer
    adp-cli/           # binary entrypoint
```

### 4.2 Recommended stack

- Runtime: **Tokio**
- HTTP: **hyper** + **h2** + **quinn/h3**
- TLS: **rustls** (+ ACME via `instant-acme` or similar)
- Serialization: **serde** + **jsonschema** / **schemars**
- K8s: **kube-rs**
- Metrics: **Prometheus** + **OpenTelemetry**
- Storage: filesystem + Redis + Postgres (feature flags)
- Config IR: versioned protobuf or serde structs compiled from YAML

### 4.3 Configuration model (better than Lua)

Example top-level (YAML):

```yaml
apiVersion: adp.io/v1
kind: Gateway
metadata:
  name: pop1-edge
  labels:
    env: prod
    pop: pop1
spec:
  listeners:
    - name: https
      port: 443
      protocol: HTTPS
      tls:
        mode: Terminate
        acme:
          enabled: true
          email: ops@example.com
  hosts:
    - name: k3s1api.diytaxreturn.co.uk
      routes:
        - match:
            path: { type: Prefix, value: / }
          backends:
            - address: 10.8.0.9:6443
              weight: 50
            - address: 10.8.0.3:6443
              weight: 50
          loadBalancing: least_conn
          timeouts:
            connect: 5s
            read: 30s
            send: 30s
          healthCheck:
            active:
              type: tcp
              interval: 5s
              unhealthyThreshold: 2
          policies:
            - ref: waf-strict
            - ref: rate-100rps
```

Also support equivalent JSON and K8s CRDs. Provide JSON Schema + OpenAPI for the admin API. Compile to an immutable **ConfigSnapshot** with atomic swap (RCU / `ArcSwap`).

---

## 5. Microservices on Top of Core

Deploy these as separate services **sharing schemas** with the core:

| Service | Responsibility |
|---------|----------------|
| `adp-control` | Source of truth, versioning, CR approval, compile & distribute snapshots |
| `adp-console` | Fleet UI (NGINX One Console parity) + legacy admin UX features |
| `adp-auth` | IdP / OIDC / RBAC / API keys (optional extract) |
| `adp-insights` | AI log analysis, anomaly detection (current `/api/ai/analyze`) |
| `adp-registry` | Instance inventory, heartbeats, CVE/config drift |
| `adp-policy` | WAF/DoS policy compiler, signature updates |
| `adp-mcp` | Can run in-process or standalone for AI agents |

All microservices MUST be optional: a single `adp --role=all` node must run without them (WSLProxy POP parity).

---

## 6. Kubernetes: Same Binary

### 6.1 Ingress mode

```bash
adp --role=ingress \
  --ingress-class=adp \
  --watch-namespace= \
  --default-ssl-secret=...
```

- Leader election
- Translate Ingress / CRDs → ConfigSnapshot → in-process proxy
- No sidecar nginx; the process **is** the proxy

### 6.2 Gateway API mode

```bash
adp --role=gateway --gateway-class=adp
```

- Implement Gateway API conformance suite goals (track official conformance)
- Attach WAFPolicy / RateLimitPolicy / AuthPolicy CRDs

### 6.3 Helm chart

One chart with values selecting `role: proxy|ingress|gateway|all`, HPA, PDB, ServiceMonitor, TLS, WAF policy packs.

---

## 7. Admin & Fleet UX Requirements

Port concepts from `openresty-admin` + `openresty-admin-next`, plus One Console:

- Servers / routes / upstreams / WAF / SSL / traffic split / topology / audit / change requests
- Fleet: instances, groups, cert board, CVE/drift, policy rollout
- Live metrics dashboard (Plus status parity)
- GitOps: commit YAML → CI validates schema → control plane applies
- Swagger/OpenAPI always up to date
- MCP for AI ops (read-only default)

---

## 8. Performance & Reliability Targets

| Metric | Target |
|--------|--------|
| Proxy latency overhead (P50) | < 1 ms vs raw hyper baseline on local |
| Config swap | Atomic; no dropped connections for route changes |
| Failover on dead peer (L4) | connect timeout ≤ 5s configurable; mark down after 2 fails |
| Workers | Multi-threaded Tokio; no single-worker SPoF (fix WSLProxy `worker_processes 1`) |
| Hot path allocations | Minimize; prefer arena/bytes crates |
| Memory | Bounded caches; explicit limits |
| Startup | Proxy accepts traffic before control plane is reachable (cached last-good config) |

---

## 9. Security Requirements

- Memory-safe Rust; `forbid(unsafe_code)` where practical; audit remaining unsafe
- Secrets never in git; sops/age or vault integration
- mTLS between agent ↔ control plane
- RBAC on admin API; audit every mutating call
- Supply chain: reproducible builds, SBOM, signed images
- WAF policy updates signed

---

## 10. Delivery Plan (phased)

### Phase 0 — Skeleton (1–2 weeks)

- Cargo workspace, `adp` CLI roles, health/ready/metrics
- Config schema v1 (YAML/JSON) + ArcSwap snapshot
- HTTP reverse proxy + basic round-robin + passive health
- Admin API stub: list/get config

### Phase 1 — WSLProxy parity (core POP)

- Full rule matcher / selector / response codes 200/301/302/305/306/403
- ACME TLS, rate limit, cache basics, CAPTCHA, geo
- Traffic split APIs, Prometheus, audit, versions, change requests
- Importer for `/opt/nginx/data`
- Docker + Ansible deploy path

### Phase 2 — Plus parity

- Stream TCP/UDP, least-time, sticky, active health, KV API, purge cache
- JWT + OIDC, mTLS, HTTP/3, dynamic upstream API
- Status dashboard API

### Phase 3 — WAF / DoS enterprise

- Policy IR, signature packs, bot, OpenAPI validation, L7 DoS
- Policy binding on routes / Gateways

### Phase 4 — Kubernetes

- Ingress controller + Gateway API in same binary
- Helm chart; conformance tests

### Phase 5 — Fleet / One Console

- Agent protocol, Instance Manager self-host, Console UI
- Policy distribution, cert inventory, drift/CVE

### Phase 6 — Microservices hardening

- Split control/insights/policy; keep `role=all` monolithic path
- Multi-cluster / hybrid Gateway (stretch)

Each phase must ship: unit tests, integration tests (hurl/curl), load test (k6), and a **parity checklist** vs WSLProxy / Plus features.

---

## 11. Explicit Anti-Goals

- Do **not** shell out to nginx/OpenResty as the data plane.
- Do **not** keep Lua as the rule engine.
- Do **not** require a full process restart to add a domain or change a backend weight.
- Do **not** make Kubernetes mandatory for POP deploys.
- Do **not** put WAF evaluation on a remote microservice in the hot path.
- Do **not** generate opaque base64 nginx configs as the source of truth.

---

## 12. First Deliverable Expected From the Agent

When you (the coding agent) receive this prompt:

1. Create a new repo / workspace layout for `adp` (or `wslproxy-rs`) with the crate map above.
2. Implement Phase 0 end-to-end: listen :8080, proxy to configurable upstream, hot-reload YAML, `/health` `/ready` `/metrics`.
3. Publish `docs/architecture.md` + JSON Schema for `Gateway` / `Route` / `Upstream` / `WafPolicy`.
4. Publish a **parity matrix** markdown: WSLProxy feature × status, Plus feature × status.
5. Do **not** invent unrelated products; stay scoped to this platform.

---

## 13. Context Sources in This Monorepo

Use these as behavioral specs while implementing:

- `CLAUDE.md` — WSLProxy architecture & gotchas
- `docs/RUST_PROXY_BUILD_PROMPT.md` §2.10 — exhaustive feature inventory (pipeline, MCP gateway, LLM translate, POP/DNS, CRDs, non-requirements)
- `api/*.lua` — request pipeline, WAF, traffic router, API
- `data/sample-settings.json` — settings model
- `nginx-base.d/nginx_tcp_streams.conf` — L4 stream LB patterns
- `ingress-controller/` — k8s ingress helm + nginx.conf lessons (timeouts!)
- `openresty-admin/` + `openresty-admin-next/` — operator UX
- `infra/ansible/` — POP deploy realities

---

## 14. Success Definition

Success = one Rust binary that:

- Runs as POP edge proxy with WSLProxy feature parity and cleaner YAML/JSON config
- Runs as Kubernetes Ingress **and** Gateway API controller without a second codebase
- Offers Plus-class LB/cache/auth/stream features
- Runs in-process WAF/DoS with policy-as-code
- Registers into a self-hosted or SaaS console (Instance Manager / One Console parity)
- Scales via optional microservices **without** splitting the hot path

Build it carefully, keep config typed and versioned, and make failover fast (connect timeouts measured in seconds, not minutes).
