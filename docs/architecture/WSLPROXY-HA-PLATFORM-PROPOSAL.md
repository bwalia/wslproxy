# WSLproxy: Distributed Multi-Region HA Platform — Technical Proposal

**Version:** 1.0
**Date:** 2026-03-08
**Status:** DRAFT
**Author:** Platform Architecture

---

## Table of Contents

- [A. Executive Summary](#a-executive-summary)
- [B. Target Architecture](#b-target-architecture)
- [C. HA Clustering Model](#c-ha-clustering-model)
- [D. Configuration Synchronisation](#d-configuration-synchronisation)
- [E. HTTP Traffic Failover](#e-http-traffic-failover)
- [F. BGP Support](#f-bgp-support)
- [G. Multi-Region PoP Design](#g-multi-region-pop-design)
- [H. Streaming Capabilities in HTTP](#h-streaming-capabilities-in-http)
- [I. OpenResty / WSLproxy Implementation Details](#i-openresty--wslproxy-implementation-details)
- [J. Kubernetes and Docker Deployment Model](#j-kubernetes-and-docker-deployment-model)
- [K. APIs, UI, and Management Features](#k-apis-ui-and-management-features)
- [L. Security and Compliance](#l-security-and-compliance)
- [M. Observability](#m-observability)
- [N. Implementation Roadmap](#n-implementation-roadmap)
- [O. Detailed Testing Strategy](#o-detailed-testing-strategy)
- [P. Output Format — Summary Artefacts](#p-output-format--summary-artefacts)

---

## A. Executive Summary

### What WSLproxy becomes

WSLproxy today is a single-node OpenResty-based reverse proxy and API gateway with a Lua request pipeline, a React admin UI, Redis/disk-backed configuration, WAF, health checking, SSL management, and a Kubernetes ingress controller. It runs on bare metal, VMs, Docker, and K3s.

This proposal evolves WSLproxy into a **distributed, multi-region, highly available edge delivery platform** while preserving its OpenResty data plane and Lua pipeline architecture. The key insight is: **keep the data plane lean and fast (OpenResty/Lua), move all coordination and cluster state to purpose-built external systems**.

### Target state in plain language

- Multiple WSLproxy nodes form a **cluster** in each region. One node is elected leader per region; the leader coordinates config distribution but all nodes serve traffic.
- A **global control plane** (lightweight Go service + etcd) manages cross-region config, failover policy, and PoP topology.
- **Configuration** flows through a versioned, Git-compatible pipeline: commit → validate → promote → distribute. Nodes pull config from etcd/S3 and apply it without restarts.
- **Traffic failover** is automatic: unhealthy backends are removed within seconds, unhealthy nodes withdraw their BGP routes, and unhealthy regions trigger DNS/BGP failover to surviving regions.
- **BGP integration** (via FRR/GoBGP sidecar) enables anycast VIP advertisement at each PoP, giving clients automatic geographic routing and instant failover.
- **Streaming workloads** (SSE, gRPC, large downloads, video) get dedicated buffer/timeout tuning and are protected from noisy-neighbour effects.

### Major design decisions and tradeoffs

| Decision | Choice | Tradeoff |
|----------|--------|----------|
| Coordination store | etcd (K8s) / Consul (VM) | etcd is native to K8s but needs separate deployment on VMs; Consul works everywhere but adds a dependency |
| Leader election | etcd Lease / Consul sessions | Not Raft-in-Lua — avoids complexity inside OpenResty workers |
| Config distribution | Pull-based with event notification | Slightly higher latency than push, but far more resilient to partitions |
| BGP speaker | FRR sidecar (VM) / MetalLB (K8s) | External process, not embedded — keeps data plane simple |
| Global failover | DNS + BGP withdrawal | DNS has TTL lag; BGP is faster but requires peering. Hybrid covers both. |
| Control plane | Go microservice | Lua is wrong for distributed coordination; Go is the proven choice |
| Streaming | OpenResty tuning + per-route policies | No separate streaming proxy — keeps the stack unified |

---

## B. Target Architecture

### B.1 Component Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        GLOBAL CONTROL PLANE                        │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  wslctl API  │  │  Config      │  │  Global Failover         │  │
│  │  (Go service)│  │  Store (etcd)│  │  Controller (Go)         │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────────┐  │
│  │  Admin UI    │  │  Audit Log   │  │  DNS Manager             │  │
│  │  (React)     │  │  (append-only│  │  (Route53/PowerDNS)      │  │
│  └──────────────┘  └──────────────┘  └──────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
        │                    │                      │
        ▼                    ▼                      ▼
┌──────────────────── REGION: eu-west-1 ──────────────────────┐
│  ┌─────────────────────────────────────────────────────┐    │
│  │            REGIONAL CONTROL PLANE                   │    │
│  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐  │    │
│  │  │  Region    │  │  Health    │  │  Config      │  │    │
│  │  │  Leader    │  │  Aggregator│  │  Sync Agent  │  │    │
│  │  │  (elected) │  │            │  │              │  │    │
│  │  └────────────┘  └────────────┘  └──────────────┘  │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  ┌─────────────── PoP: London ──────────────────────┐       │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐       │       │
│  │  │WSLproxy-1│  │WSLproxy-2│  │WSLproxy-3│       │       │
│  │  │(OpenResty│  │(OpenResty│  │(OpenResty│       │       │
│  │  │ + Lua)   │  │ + Lua)   │  │ + Lua)   │       │       │
│  │  └────┬─────┘  └────┬─────┘  └────┬─────┘       │       │
│  │       │              │              │             │       │
│  │  ┌────┴──────────────┴──────────────┴─────┐      │       │
│  │  │         BGP Speaker (FRR/GoBGP)        │      │       │
│  │  │         Anycast VIP: 198.51.100.1      │      │       │
│  │  └────────────────────────────────────────┘      │       │
│  └──────────────────────────────────────────────────┘       │
│                                                              │
│  ┌──────────── Backends ────────────┐                       │
│  │  app-1:8080  app-2:8080  app-3   │                       │
│  └──────────────────────────────────┘                       │
└──────────────────────────────────────────────────────────────┘
```

### B.2 Planes separation

**Global Control Plane** — single logical deployment (multi-AZ within one region for HA):
- `wslctl-api`: Go service exposing REST/gRPC management API
- `etcd` cluster (3 or 5 nodes): config store, leader election, watch-based notifications
- `dns-manager`: updates DNS records for failover (Route53, PowerDNS, Cloudflare)
- `audit-log`: append-only change log (backed by PostgreSQL or object storage)
- Existing React admin UI (`openresty-admin/`) connects to `wslctl-api`

**Regional Control Plane** — one per region, runs as a sidecar or standalone service:
- `wslproxy-agent`: Go binary running on each node
  - Participates in leader election (regional scope)
  - Pulls config from etcd, writes to local disk/shared dict for OpenResty
  - Runs health aggregation — collects per-node upstream health, publishes regional health
  - Manages BGP speaker lifecycle (start/stop route advertisement based on health)
  - Reports node status to global control plane

**Data Plane** — OpenResty/Lua (the existing WSLproxy):
- Serves HTTP/HTTPS traffic
- Reads config from local files and `ngx.shared` dictionaries (populated by `wslproxy-agent`)
- Runs the existing gateway pipeline: ACK → rate limit → WAF → route → transform → log
- Performs local upstream health checks (existing `healthcheck_init.lua`)
- Exposes `/ping`, `/health`, `/metrics` endpoints
- **Zero cluster awareness** — the data plane does not know about other nodes, leaders, or regions. It just proxies traffic based on whatever config is on disk.

### B.3 Single-region cluster

```
                    ┌────────────────────┐
                    │    Load Balancer    │
                    │    (VIP / L4 LB)   │
                    └─────────┬──────────┘
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
     ┌────────────┐  ┌────────────┐  ┌────────────┐
     │  Node A    │  │  Node B    │  │  Node C    │
     │  (Leader)  │  │ (Follower) │  │ (Follower) │
     │ wslproxy   │  │ wslproxy   │  │ wslproxy   │
     │ agent      │  │ agent      │  │ agent      │
     └─────┬──────┘  └─────┬──────┘  └─────┬──────┘
           │                │                │
           └────────┬───────┴────────┬───────┘
                    ▼                ▼
              ┌──────────┐    ┌──────────┐
              │  etcd    │    │  etcd    │  (or Consul)
              │  node 1  │    │  node 2  │
              └──────────┘    └──────────┘
```

- Minimum 2 WSLproxy nodes for HA (3 recommended)
- All nodes serve traffic simultaneously (active-active)
- Leader handles config writes; followers are read-only
- etcd/Consul can be co-located or external

### B.4 Multi-region cluster

```
    Global Control Plane (eu-west-1)
    ┌────────────────────────────┐
    │  wslctl-api + etcd (3)    │
    │  dns-manager + audit-log  │
    └─────┬──────────┬──────────┘
          │          │
    ┌─────┘          └──────────────────┐
    ▼                                   ▼
  Region: eu-west-1               Region: us-east-1
  ┌──────────────────┐            ┌──────────────────┐
  │ Regional Leader  │            │ Regional Leader  │
  │ 3x WSLproxy      │◄──sync───►│ 3x WSLproxy      │
  │ BGP: 198.51.100.1│            │ BGP: 198.51.100.1│
  │ (anycast)        │            │ (anycast)        │
  └──────────────────┘            └──────────────────┘
```

- Each region operates independently for traffic serving
- Config propagates: global control plane → all regions (via etcd watch)
- Regions can survive control plane outage using last-known-good config
- Cross-region failover via BGP withdrawal + DNS update

### B.5 Failure domains

| Failure | Impact | Recovery |
|---------|--------|----------|
| Single node | Other nodes in PoP absorb traffic | BGP ECMP / LB health check removes node (< 5s) |
| All nodes in PoP | PoP offline | BGP withdrawal + DNS failover to next-nearest PoP (< 30s BGP, < 60s DNS) |
| Region offline | All PoPs in region down | DNS failover to other region (TTL-bound) |
| Control plane offline | No config changes possible | Data plane continues serving with last-known-good config indefinitely |
| etcd quorum loss | Config writes fail | Read-only mode; data plane unaffected; restore quorum |
| Backend failure | 5xx errors for affected routes | Circuit breaker opens (< 10s); traffic routed to healthy backends |

### B.6 Traffic flow

**Normal request path:**
```
Client → DNS (anycast) → BGP → PoP → WSLproxy node
  → gateway_pipeline.lua (rate limit → WAF → route)
  → upstream backend → response back through pipeline → client
```

**During backend failure:**
```
Client → WSLproxy node
  → health check detects backend down
  → circuit breaker opens for that backend
  → traffic_router.lua selects next healthy upstream
  → if no healthy upstreams locally → return 503 with retry-after
  → (regional health aggregator can redirect to cross-region backend if configured)
```

**During node failure:**
```
Client → BGP/LB
  → health check fails for node (no /health response)
  → BGP: FRR withdraws route for that node
  → LB: removes node from pool
  → subsequent requests go to remaining nodes
  → zero client impact if > 1 node
```

**During region failure:**
```
Global failover controller detects region health < threshold
  → dns-manager updates DNS to remove region
  → BGP: all nodes in region withdraw (or network is partitioned)
  → clients resolve DNS to surviving region(s)
  → traffic flows to nearest healthy region
```

---

## C. HA Clustering Model

### C.1 Cluster membership

Each WSLproxy node runs a `wslproxy-agent` (Go binary) that:

1. **Registers** itself with the coordination store (etcd key: `/wslproxy/nodes/{region}/{node-id}`) with a TTL-based lease
2. **Heartbeats** every 5 seconds to maintain lease
3. **Watches** `/wslproxy/nodes/{region}/` for membership changes
4. **Deregisters** on graceful shutdown (SIGTERM handler)

Node record:
```json
{
  "node_id": "wsl-eu-lon-01",
  "region": "eu-west-1",
  "pop": "london",
  "address": "10.0.1.10",
  "public_ip": "198.51.100.10",
  "port": 8080,
  "tls_port": 8443,
  "status": "healthy",
  "role": "follower",
  "version": "2.4.0",
  "config_version": 42,
  "started_at": "2026-03-08T10:00:00Z",
  "last_heartbeat": "2026-03-08T14:30:05Z"
}
```

### C.2 Node discovery

**Kubernetes:** `wslproxy-agent` discovers peers via headless Service DNS (`wslproxy-headless.namespace.svc.cluster.local`) or by watching Endpoints/EndpointSlice resources.

**VM/bare metal:** Three options, in order of preference:
1. **etcd:** Nodes register themselves; peers discovered by listing `/wslproxy/nodes/{region}/`
2. **Consul:** Native service registration and DNS-based discovery
3. **Static seed list:** `WSLPROXY_SEEDS=10.0.1.10,10.0.1.11,10.0.1.12` — agent contacts seeds to find the coordination store, then uses option 1 or 2

### C.3 Leader election

**Mechanism:** etcd lease-based election (or Consul session-based on VMs without etcd).

```
Election key: /wslproxy/leader/{region}
```

Algorithm:
1. Each agent creates an etcd lease (TTL = 15s, heartbeat every 5s)
2. Agent attempts `txn` (compare-and-swap) to write its node-id to `/wslproxy/leader/{region}` if the key does not exist or the current lease has expired
3. Winner becomes leader; losers watch the key
4. Leader continuously renews lease
5. If leader fails to renew (crash, network partition), lease expires after 15s, triggering new election
6. New election completes within ~1-2 seconds after lease expiry

**Kubernetes alternative:** Use `coordination.k8s.io/v1` Lease API:
```yaml
apiVersion: coordination.k8s.io/v1
kind: Lease
metadata:
  name: wslproxy-leader
  namespace: wslproxy
spec:
  holderIdentity: "wsl-eu-lon-01"
  leaseDurationSeconds: 15
  renewTime: "2026-03-08T14:30:05Z"
```

### C.4 Quorum and split-brain prevention

**etcd-backed:** etcd itself provides linearizable writes with Raft consensus. We don't implement our own consensus — we delegate to etcd. Split-brain is prevented by etcd's majority quorum requirement.

**Consul-backed:** Consul sessions with `delete` behaviour on invalidation. Session TTL + lock-delay prevents rapid leader flapping.

**Critical rule:** During a network partition:
- Nodes that **can** reach etcd/Consul continue serving traffic with current config
- Nodes that **cannot** reach etcd/Consul continue serving traffic with last-known-good config but:
  - Cannot become leader
  - Cannot accept config writes
  - Log warnings about coordination store unavailability
  - BGP advertisement continues (traffic keeps flowing)
- This is a **CP for writes, AP for reads** model — config changes require quorum, but traffic serving is always available

### C.5 Leader vs follower responsibilities

| Responsibility | Leader | Follower |
|---------------|--------|----------|
| Serve HTTP traffic | Yes | Yes |
| Accept config writes via API | Yes | Redirect to leader |
| Push config to etcd | Yes | No |
| Pull config from etcd | Yes | Yes |
| Run upstream health checks | Yes | Yes |
| Publish regional health summary | Yes | No |
| Trigger BGP withdrawal for region | Yes | No |
| Coordinate certificate renewal | Yes | No (uses certs from config sync) |

### C.6 Global leader (optional)

For multi-region deployments, one regional leader is elected as **global leader** via a separate election key (`/wslproxy/leader/global`). The global leader:
- Publishes cross-region health summary
- Makes global failover decisions (e.g., "region eu-west-1 is unhealthy, update DNS")
- Coordinates cross-region config promotions

If the global leader region fails, another region's leader takes over global leadership within 15-20 seconds.

### C.7 Recommended technologies

| Environment | Coordination Store | Leader Election | Service Discovery |
|------------|-------------------|-----------------|-------------------|
| Kubernetes | etcd (cluster's own or dedicated) | K8s Lease API | Headless Service / EndpointSlice |
| VM + etcd available | etcd (3-node dedicated) | etcd lease CAS | etcd key listing |
| VM + Consul | Consul (existing infra) | Consul session lock | Consul service catalog |
| Minimal / edge | Embedded — SQLite + simple lease | File-lock based (single-node only) | Static seed list |

---

## D. Configuration Synchronisation

### D.1 Source of truth

**etcd** is the authoritative config store. All config lives under a versioned key hierarchy:

```
/wslproxy/config/v{version}/
  ├── servers/
  │   ├── {server-id}.json
  ├── rules/
  │   ├── {rule-id}.json
  ├── upstreams/
  │   ├── {upstream-id}.json
  ├── ssl/
  │   ├── {domain}/cert.pem
  │   ├── {domain}/key.pem
  ├── waf/
  │   ├── policies/{policy-id}.json
  │   ├── rules/{rule-id}.json
  ├── tenants/
  │   ├── {tenant-id}/
  │       ├── settings.json
  │       ├── servers/...
  │       ├── rules/...
  ├── settings.json
  └── _meta/
      ├── version.json        # {version: 42, author: "admin", timestamp: "...", message: "..."}
      ├── checksum.json        # SHA-256 of entire config tree
      └── promotion.json       # {source_env: "int", promoted_by: "...", promoted_at: "..."}
```

### D.2 Config versioning

Every config change increments a monotonic version counter. The version record:

```json
{
  "version": 42,
  "parent_version": 41,
  "author": "admin@wslproxy.io",
  "timestamp": "2026-03-08T14:30:00Z",
  "message": "Add upstream pool for new-api service",
  "changes": [
    {"op": "create", "path": "/upstreams/new-api.json"},
    {"op": "update", "path": "/servers/api-gateway.json"}
  ],
  "checksum": "sha256:abc123..."
}
```

Config changes are **transactional** — either all changes in a version apply or none do (etcd multi-key txn).

### D.3 Change propagation

**Model: Pull with event notification (hybrid push-pull)**

```
  wslctl-api                    etcd                      wslproxy-agent (per node)
     │                           │                              │
     │── PUT /config/v43 ──────►│                              │
     │                           │── watch event ────────────►  │
     │                           │                              │── pull /config/v43
     │                           │                              │── validate config
     │                           │                              │── write to local disk
     │                           │                              │── update ngx.shared dicts
     │                           │                              │── signal OpenResty reload
     │                           │                              │   (if nginx.conf changed)
     │                           │                              │── report config_version=43
```

1. `wslctl-api` writes new config version to etcd
2. All `wslproxy-agent` instances have an etcd `Watch` on `/wslproxy/config/` prefix
3. On watch event, agent pulls the new config version
4. Agent validates config (JSON schema, cert validity, upstream reachability)
5. Agent writes config to local disk (`/opt/nginx/data/`) in the format existing Lua code expects
6. Agent updates `ngx.shared.DICT` entries via the OpenResty admin API (or Unix socket)
7. If `nginx.conf` structural changes are needed, agent triggers `nginx -s reload`
8. Agent reports its `config_version` back to etcd node record

**Fallback:** If watch is missed (network blip), agents poll `/wslproxy/config/_meta/version.json` every 30 seconds and pull if behind.

### D.4 Conflict detection and resolution

Config writes go **only through the leader** (or directly to `wslctl-api`), so write conflicts are serialized by etcd transactions. However, concurrent API calls can conflict:

- **Optimistic concurrency:** Every config write includes the expected `parent_version`. If the current version doesn't match, the write is rejected with `409 Conflict`.
- **Last-writer-wins for emergency overrides:** An operator can force-write with `?force=true` (logged, requires admin role).

### D.5 Rollback

```bash
# Roll back to version 41
wslctl config rollback --to-version 41 --reason "v42 caused 5xx errors"
```

This creates a **new** version (v43) whose content is identical to v41. The version chain is preserved for audit.

### D.6 Drift detection

`wslproxy-agent` runs a periodic **drift check** every 60 seconds:
1. Compute SHA-256 of local config files
2. Compare to checksum in etcd for current version
3. If mismatch → re-pull config from etcd and re-apply
4. Report drift event to metrics and audit log

### D.7 Incremental vs full sync

- **Normal operation:** Incremental — agent pulls only changed keys based on etcd watch events
- **Initial bootstrap / recovery:** Full sync — agent pulls entire config tree for current version
- **Periodic reconciliation:** Full checksum comparison every 5 minutes; full re-sync if drift detected

### D.8 Certificate and secret distribution

- Certificates stored in etcd **encrypted at rest** (etcd encryption config or envelope encryption via KMS)
- Secrets (API keys, JWT signing keys) stored in etcd with a separate encryption key, accessible only to nodes with valid agent certificates
- On Kubernetes: secrets can also be sourced from Kubernetes Secrets / Sealed Secrets (existing infra), synced into etcd by the config controller
- Certificate hot-reload: agent writes cert to disk, calls OpenResty's `ssl_certificate_by_lua` — no nginx reload needed for cert updates

### D.9 Tenant-level config isolation

Each tenant gets its own config subtree (`/wslproxy/config/v{n}/tenants/{tenant-id}/`). Tenants:
- Can only read/write their own subtree (enforced by `wslctl-api` RBAC)
- Have independent version counters within their subtree
- Can have tenant-specific rate limits, WAF policies, upstreams, and SSL certs
- Share the global routing layer but are isolated at the config level

### D.10 Promotion flow

```
dev ──► int ──► acc ──► prod
```

Promotion is an explicit action:
```bash
wslctl config promote --from dev --to int --version 42
```

This:
1. Copies config from the source environment's etcd prefix to the target
2. Creates a new version in the target environment
3. Records the promotion in `_meta/promotion.json`
4. Triggers config sync to all nodes in the target environment
5. Requires approval from a second operator for `acc → prod` (enforced by `wslctl-api`)

### D.11 GitOps compatibility

The config store supports bidirectional GitOps:

**Git → etcd (primary flow):**
- A Git repo holds config as JSON files in the same structure as etcd
- CI pipeline validates config and calls `wslctl config apply --from-dir ./config/`
- `wslctl-api` diffs against current version and creates a new version if changed

**etcd → Git (audit/backup):**
- Every config version is automatically exported to a Git repo (via webhook or periodic job)
- Provides full history, diff capability, and disaster recovery

### D.12 OCI/Helm-based config packaging

For Kubernetes deployments, config can optionally be packaged as an OCI artifact:
```bash
wslctl config package --version 42 --output oci://registry.example.com/wslproxy-config:v42
```
This creates a versioned, signed OCI image containing the config tree, deployable via Helm values or init container.

---

## E. HTTP Traffic Failover

### E.1 Failover layers

```
Layer 1: Backend health check     (per-node, per-upstream)
Layer 2: Node health              (per-node, reported to LB/BGP)
Layer 3: PoP health               (aggregate of nodes in PoP)
Layer 4: Region health             (aggregate of PoPs in region)
Layer 5: Global failover           (DNS/BGP across regions)
```

### E.2 Backend / upstream failover

**Local health checks** (existing `healthcheck_init.lua` enhanced):

```lua
-- Health check config per upstream
{
  "upstream_id": "api-backend",
  "targets": [
    {"address": "10.0.2.10", "port": 8080, "weight": 100},
    {"address": "10.0.2.11", "port": 8080, "weight": 100},
    {"address": "10.0.2.12", "port": 8080, "weight": 50}
  ],
  "health_check": {
    "type": "http",
    "path": "/health",
    "interval_ms": 3000,
    "timeout_ms": 2000,
    "healthy_threshold": 2,
    "unhealthy_threshold": 3,
    "expected_status": [200]
  }
}
```

- Active health checks run in an `ngx.timer` background worker
- Passive health checks: track 5xx responses in real-time; mark backend unhealthy after N consecutive failures
- Unhealthy backends removed from `traffic_router.lua` routing within one health check interval (3s default)
- Recovery: backend must pass `healthy_threshold` consecutive checks before re-entering rotation

**Circuit breaker** (new, implemented in Lua using `ngx.shared.DICT`):

```
States: CLOSED → OPEN → HALF_OPEN → CLOSED

CLOSED:     Normal operation. Track failure count in sliding window.
            If failures > threshold (e.g., 5 in 10s) → OPEN
OPEN:       All requests to this backend return 503 immediately.
            After timeout (e.g., 30s) → HALF_OPEN
HALF_OPEN:  Allow 1 probe request through.
            If success → CLOSED. If failure → OPEN.
```

### E.3 Node failover

Each WSLproxy node exposes:
- `/health` — returns 200 if node can serve traffic (checks: OpenResty running, config loaded, at least one upstream healthy)
- `/ready` — returns 200 if node is fully initialised and config-synced

**LB-based failover:** External load balancer (HAProxy, NLB, F5) polls `/health` every 2-5 seconds. Unhealthy nodes removed from pool.

**BGP-based failover:** `wslproxy-agent` monitors `/health` and tells the BGP speaker to withdraw routes if unhealthy. Route withdrawal propagates to routers within 1-3 seconds.

### E.4 Region failover

The **global failover controller** (part of `wslctl-api`) monitors regional health:

```json
{
  "region": "eu-west-1",
  "status": "degraded",
  "healthy_nodes": 1,
  "total_nodes": 3,
  "healthy_ratio": 0.33,
  "decision": "failover",
  "failover_target": "us-east-1",
  "triggered_at": "2026-03-08T14:30:00Z"
}
```

Failover trigger: `healthy_ratio < 0.5` for > 30 seconds (configurable).

Actions on region failover:
1. DNS: Update weighted records to send 0% traffic to failed region
2. BGP: Regional leader (if still alive) withdraws all anycast routes
3. Alert: PagerDuty / Slack notification
4. Audit: Log failover event with reason and actions taken

### E.5 Control-plane failure

**Critical design requirement:** Control-plane failure must NOT break data-plane traffic.

- OpenResty nodes have all config on local disk — no runtime dependency on etcd/control plane
- Health checks are local (run inside each OpenResty worker) — no dependency on regional leader
- BGP speaker runs independently with last-known configuration
- Only impact: no config changes possible until control plane recovers

### E.6 Connection draining

On planned node removal or rolling update:
1. Node marks itself as "draining" (stops accepting new connections via BGP withdrawal / LB health check failing)
2. Existing connections continue to be served
3. After drain timeout (default 30s, configurable), remaining connections are terminated with `Connection: close`
4. Node shuts down

### E.7 Retry strategy

```lua
-- Per-upstream retry policy
{
  "retries": 2,
  "retry_on": ["connect_error", "timeout", "http_502", "http_503", "http_504"],
  "retry_timeout_ms": 5000,
  "retry_backoff": "exponential",
  "idempotent_only": true  -- only retry GET/HEAD/OPTIONS/PUT/DELETE by default
}
```

- Non-idempotent requests (POST) only retried if explicitly configured or if the failure was a connection error (request never sent)
- Retry budget: max 20% of requests to an upstream can be retries (prevents retry storms)

### E.8 Session affinity

- Sticky sessions (cookie-based or header-based) supported per-upstream
- During failover, sticky session breaks — client gets a new backend
- **Degradation strategy:** If the sticky backend is unhealthy, route to any healthy backend. Session state loss is accepted — applications should handle session re-establishment.
- Cookie includes backend hash, not IP — so backend pool changes don't invalidate all sessions

### E.9 RTO/RPO targets

| Scenario | RTO Target | Mechanism |
|----------|-----------|-----------|
| Single backend failure | < 5s | Health check interval + circuit breaker |
| Single node failure | < 10s | BGP withdrawal / LB health check |
| PoP failure | < 30s | BGP + DNS |
| Region failure | < 60s (BGP) / < 5min (DNS) | BGP withdrawal + DNS update (TTL-bound) |
| Control plane failure | 0s (no traffic impact) | Data plane independent |

RPO for configuration: 0 — config is stored in etcd with replication. Last-known-good config always available on each node's disk.

---

## F. BGP Support

### F.1 Architecture

```
┌──────────────────────────────────────┐
│           WSLproxy Node              │
│  ┌──────────────────────────────┐    │
│  │  wslproxy-agent (Go)        │    │
│  │  - monitors /health         │    │
│  │  - controls BGP speaker     │    │
│  └──────────┬───────────────────┘    │
│             │ gRPC / API             │
│  ┌──────────▼───────────────────┐    │
│  │  BGP Speaker                 │    │
│  │  (FRR / GoBGP)              │    │
│  │  - advertises VIP           │    │
│  │  - peers with ToR / router  │    │
│  └──────────┬───────────────────┘    │
│             │ BGP session            │
└─────────────┼────────────────────────┘
              │
              ▼
     ┌─────────────────┐
     │  ToR / Router   │
     │  (ECMP to all   │
     │   healthy nodes)│
     └─────────────────┘
```

### F.2 BGP speaker selection

| Environment | Recommended Speaker | Reason |
|------------|-------------------|--------|
| VM / bare metal | **FRR** (Free Range Routing) | Production-proven, full BGP feature set, Linux-native, supports BFD |
| Kubernetes | **MetalLB** (BGP mode) or **kube-vip** | Native K8s integration, manages Speaker pods, handles Service LoadBalancer |
| Lightweight / edge | **GoBGP** | Embeddable Go library, smaller footprint, programmable via gRPC |

**Recommendation:** FRR for VM/bare metal (it's the industry standard), MetalLB for Kubernetes, GoBGP as a fallback for constrained environments.

### F.3 VIP and anycast design

**Anycast model:**
- Each PoP advertises the **same** VIP prefix (e.g., `198.51.100.0/24`)
- Clients are routed to the nearest PoP by BGP shortest-path
- Within a PoP, ECMP distributes across healthy nodes

**Per-PoP VIPs (alternative for simpler setups):**
- Each PoP has a unique VIP (e.g., London: `198.51.100.1/32`, Frankfurt: `198.51.100.2/32`)
- DNS returns the nearest PoP's VIP based on geo or latency
- Simpler to debug, doesn't require anycast-capable transit

### F.4 Health-based route advertisement

`wslproxy-agent` controls route advertisement:

```go
// Pseudocode
func (a *Agent) bgpHealthLoop() {
    for {
        healthy := a.checkLocalHealth()  // GET http://localhost:8080/health
        if healthy && !a.bgpAdvertising {
            a.bgpSpeaker.Advertise(a.vipPrefix)
            a.bgpAdvertising = true
            log.Info("BGP: advertising VIP", "prefix", a.vipPrefix)
        } else if !healthy && a.bgpAdvertising {
            a.bgpSpeaker.Withdraw(a.vipPrefix)
            a.bgpAdvertising = false
            log.Warn("BGP: withdrawing VIP", "prefix", a.vipPrefix, "reason", "health check failed")
        }
        time.Sleep(2 * time.Second)
    }
}
```

Route withdrawal triggers:
- `/health` returns non-200 for 3 consecutive checks (6 seconds)
- OpenResty process is down
- Agent receives drain signal (planned maintenance)
- All upstreams unhealthy (node has nothing useful to serve)

### F.5 ECMP considerations

- All nodes in a PoP advertise the same prefix with same AS path length → routers distribute via ECMP
- ECMP hash is typically based on src-IP + dst-IP (+ ports) → consistent per-client routing
- If a node withdraws, ECMP re-hashes — some client connections will shift to other nodes
- For long-lived connections (streaming, WebSocket), ECMP rehash causes connection reset — mitigate with connection draining before withdrawal

### F.6 Multi-region failover via BGP

Scenario: London PoP goes fully offline.

1. All London nodes fail health checks → all withdraw BGP routes
2. London prefix disappears from BGP tables globally
3. Internet routers reconverge; traffic to anycast VIP now reaches Frankfurt (next-nearest PoP advertising same prefix)
4. Convergence time: typically 3-30 seconds depending on BGP timers and network topology

**Tuning for fast failover:**
- BFD (Bidirectional Forwarding Detection) between FRR and ToR router — sub-second failure detection
- BGP hold-time: reduce from default 90s to 15s
- BGP keepalive: 5s

### F.7 Security controls

```
# FRR config template
router bgp 65001
  neighbor PEER_GROUP peer-group
  neighbor PEER_GROUP remote-as 65000
  neighbor PEER_GROUP password {{ bgp_peer_password }}
  neighbor PEER_GROUP prefix-list EXPORT_ONLY out
  neighbor PEER_GROUP prefix-list IMPORT_DENY in
  neighbor PEER_GROUP maximum-prefix 10 warning-only

ip prefix-list EXPORT_ONLY seq 10 permit 198.51.100.0/24
ip prefix-list EXPORT_ONLY seq 100 deny any
ip prefix-list IMPORT_DENY seq 100 deny any
```

- **MD5 peer authentication** on all BGP sessions
- **Prefix filtering:** Only advertise allocated VIP prefixes; deny all inbound prefixes
- **Max-prefix:** Alert if peer sends unexpected routes
- **RPKI/ROA:** Validate route origins where transit supports it
- **BFD:** Fast failure detection without relying on BGP keepalives alone

### F.8 BGP state and leader election integration

- BGP speaker runs independently on each node — no leader dependency for route advertisement
- Leader aggregates BGP state from all nodes for dashboard/alerting
- Leader can issue "region drain" command → all nodes in region withdraw routes
- BGP state exposed via `wslproxy-agent` metrics: `wslproxy_bgp_session_up`, `wslproxy_bgp_prefixes_advertised`, `wslproxy_bgp_peer_state`

---

## G. Multi-Region PoP Design

### G.1 PoP topology

```
                 ┌─────────────────────────┐
                 │    Global Control Plane  │
                 │    (eu-west-1, HA)       │
                 └────────┬────────────────┘
                          │
          ┌───────────────┼────────────────┐
          │               │                │
  ┌───────▼──────┐ ┌─────▼────────┐ ┌─────▼──────────┐
  │ Region:      │ │ Region:      │ │ Region:        │
  │ eu-west-1    │ │ eu-central-1 │ │ us-east-1      │
  │              │ │              │ │                 │
  │ PoP: London  │ │ PoP:Frankfurt│ │ PoP: New York  │
  │ 3 nodes      │ │ 3 nodes      │ │ 3 nodes        │
  │ BGP: AS65001 │ │ BGP: AS65002 │ │ BGP: AS65003   │
  │ VIP: anycast │ │ VIP: anycast │ │ VIP: anycast   │
  └──────────────┘ └──────────────┘ └────────────────┘
```

### G.2 PoP components

Each PoP contains:
- **2-5 WSLproxy nodes** (OpenResty + wslproxy-agent + BGP speaker)
- **Local Redis** (optional, for rate limiting shared state and session cache)
- **Config cache** (local disk, populated by wslproxy-agent from etcd)
- **Monitoring agent** (Prometheus node exporter, vector/fluentbit for logs)

### G.3 Routing strategy: Anycast + DNS hybrid

**Layer 1 — Anycast (primary):**
- All PoPs advertise the same IP prefix
- BGP naturally routes clients to nearest PoP
- Fast failover via route withdrawal (seconds)

**Layer 2 — DNS (supplementary):**
- DNS returns PoP-specific IPs with geo-routing (Route53 latency-based or PowerDNS GeoIP)
- Used for: environments without anycast, fine-grained traffic splitting, canary deployments
- DNS TTL: 30-60 seconds (balance between failover speed and DNS cache efficiency)

**Layer 3 — Policy-based routing:**
- Tenant-specific routing rules: "tenant X always routes to eu-west-1"
- Compliance routing: "data from EU users must stay in EU PoPs"
- Implemented in `wslctl-api` as routing policies, propagated to DNS/BGP config

### G.4 PoP request handling

**API traffic:** Full proxy — PoP receives request, routes to upstream backend (may be in same region or cross-region).

**Static content:** Cache-and-serve — PoP caches static assets locally (existing `cache_manager.lua`). Cache miss → fetch from origin → cache → serve.

**Streaming traffic:** Pass-through with tuning — PoP proxies streaming responses with buffering disabled, long timeouts, and dedicated connection pools (see Section H).

### G.5 Tenant routing isolation

- Each tenant's traffic is routed based on their configured upstream pools
- Tenant A's upstream failure does not affect tenant B's routing
- Rate limiting is per-tenant (existing `gateway_pipeline.lua` rate limiter, scoped by server/tenant)
- Tenant-specific WAF policies apply independently

### G.6 Example deployment: London + Frankfurt + New York

```yaml
# Global control plane (eu-west-1, London)
global_control_plane:
  location: eu-west-1
  components:
    - wslctl-api (3 replicas, behind LB)
    - etcd (3 nodes, multi-AZ)
    - dns-manager (2 replicas)
    - admin-ui (2 replicas)

# Regional PoPs
pops:
  - name: london
    region: eu-west-1
    nodes: 3
    bgp_asn: 65001
    vip: 198.51.100.0/24
    backends:
      - api-eu.internal:8080

  - name: frankfurt
    region: eu-central-1
    nodes: 3
    bgp_asn: 65002
    vip: 198.51.100.0/24  # same anycast prefix
    backends:
      - api-eu.internal:8080  # same EU backend pool

  - name: newyork
    region: us-east-1
    nodes: 3
    bgp_asn: 65003
    vip: 198.51.100.0/24
    backends:
      - api-us.internal:8080  # US backend pool
```

### G.7 Regional survivability

If the global control plane (eu-west-1) is unreachable:
- Frankfurt and New York continue serving traffic with last-known-good config
- Regional leaders continue local health aggregation and BGP management
- No config changes possible until control plane recovers
- Each region's etcd (if running a local read replica) can serve config reads
- Recovery: when control plane comes back, regions re-sync and report current state

---

## H. Streaming Capabilities in HTTP

### H.1 Streaming workload classification

| Type | Protocol | Characteristics | Example |
|------|----------|-----------------|---------|
| Server-Sent Events | HTTP/1.1 | Long-lived, server→client, text/event-stream | Live dashboards, notifications |
| gRPC streaming | HTTP/2 | Bidirectional frames, protobuf | Microservice streaming RPC |
| Large downloads | HTTP/1.1 or /2 | Large response body, possibly Range requests | File downloads, backups |
| Video delivery | HTTP/1.1 or /2 | Range requests, partial content, high bandwidth | HLS/DASH segments, MP4 |
| WebSocket | HTTP/1.1 upgrade | Full-duplex, long-lived | Real-time apps, chat |
| Chunked API responses | HTTP/1.1 | Chunked transfer encoding, progressive JSON/NDJSON | Log streaming, data export |

### H.2 OpenResty/nginx configuration for streaming

**Global streaming tuning** (added to `nginx.conf.j2`):

```nginx
# Streaming defaults
proxy_buffering off;           # Default off for streaming routes (override per-location)
proxy_request_buffering off;   # Don't buffer request bodies
proxy_http_version 1.1;        # Enable keepalive to upstreams

# Timeouts for long-lived connections
proxy_read_timeout 3600s;      # 1 hour for streaming (override per-route)
proxy_send_timeout 3600s;
proxy_connect_timeout 10s;

# Keep-alive to upstreams
upstream keepalive_pool {
    keepalive 64;
    keepalive_requests 1000;
    keepalive_timeout 60s;
}
```

**Per-route streaming policy** (configured in server/rule config, applied by `traffic_router.lua`):

```json
{
  "upstream_id": "sse-backend",
  "streaming": {
    "enabled": true,
    "proxy_buffering": false,
    "proxy_read_timeout": "3600s",
    "proxy_send_timeout": "3600s",
    "gzip": false,
    "rate_limit_exempt": true,
    "connection_limit": 1000,
    "idle_timeout": "300s"
  }
}
```

### H.3 Server-Sent Events (SSE)

```nginx
# Applied dynamically by traffic_router.lua for SSE upstreams
location /events {
    proxy_pass http://sse_backend;
    proxy_buffering off;
    proxy_cache off;
    proxy_set_header Connection '';
    proxy_http_version 1.1;
    chunked_transfer_encoding off;
    proxy_read_timeout 86400s;  # 24h

    # Disable gzip for SSE (breaks event framing)
    gzip off;
}
```

### H.4 gRPC proxying

```nginx
# gRPC pass-through
location /grpc/ {
    grpc_pass grpc://grpc_backend;
    grpc_read_timeout 3600s;
    grpc_send_timeout 3600s;

    # gRPC health check
    grpc_set_header content-type "application/grpc";
}

# gRPC over TLS
location /grpc-tls/ {
    grpc_pass grpcs://grpc_tls_backend;
    grpc_ssl_verify on;
    grpc_ssl_certificate /path/to/client.crt;
    grpc_ssl_certificate_key /path/to/client.key;
}
```

### H.5 Large object and video delivery

```nginx
# Range request support (already handled by nginx default)
# Additional tuning:
proxy_force_ranges on;          # Force range support even if upstream doesn't advertise
proxy_max_temp_file_size 0;     # Don't buffer large responses to disk
proxy_buffers 8 256k;           # Larger buffers for big responses
proxy_buffer_size 256k;

# Slice module for large file caching (optional)
slice 1m;
proxy_cache_key $uri$is_args$args$slice_range;
proxy_set_header Range $slice_range;
```

### H.6 WebSocket support

```nginx
# WebSocket upgrade handling
map $http_upgrade $connection_upgrade {
    default upgrade;
    ''      close;
}

location /ws/ {
    proxy_pass http://ws_backend;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection $connection_upgrade;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
}
```

### H.7 Backpressure and connection limits

```nginx
# Per-upstream connection limit
limit_conn_zone $upstream_addr zone=upstream_conns:10m;
limit_conn upstream_conns 500;

# Per-client streaming connection limit (prevent single client monopolising)
limit_conn_zone $binary_remote_addr zone=streaming_per_client:10m;
limit_conn streaming_per_client 10;  # max 10 concurrent streaming connections per client IP
```

**Backpressure in Lua:**
```lua
-- In traffic_router.lua, before proxying streaming requests:
local active = ngx.shared.streaming_conns:get(upstream_id) or 0
if active >= max_streaming_conns then
    return ngx.exit(503)  -- upstream at capacity
end
ngx.shared.streaming_conns:incr(upstream_id, 1, 0)
-- (decrement in log_by_lua phase)
```

### H.8 Noisy neighbour protection

- Separate `upstream` pools for streaming vs non-streaming backends
- Separate `limit_conn` zones for streaming connections
- Streaming connections tracked in `ngx.shared.DICT` — per-tenant limits enforced
- If streaming connections exceed per-tenant quota, new streaming requests get `429 Too Many Requests`
- Non-streaming traffic unaffected by streaming connection pressure

### H.9 Upstream failover impact on streaming

**Short-lived requests:** Automatic retry (see Section E retry strategy).

**Long-lived streaming connections:** Cannot be transparently failed over. Strategy:
- If upstream dies mid-stream, client receives connection reset or empty chunk
- Client is expected to reconnect (SSE: `EventSource` auto-reconnects; gRPC: client retry)
- WSLproxy sets `Last-Event-ID` / resume token support headers to help clients resume
- For range-request downloads: client can resume with `Range: bytes=N-`

### H.10 HTTP/2 specific tuning

```nginx
http2 on;
http2_max_concurrent_streams 128;
http2_max_field_size 8k;
http2_max_header_size 32k;
http2_body_preread_size 64k;

# Keepalive for HTTP/2 upstream connections
grpc_socket_keepalive on;
```

### H.11 Cache interaction for streaming

- Streaming responses are **not cached** by default (`proxy_buffering off` + `proxy_cache off`)
- Video segments (HLS `.ts`, DASH `.m4s`) **are cached** (short-lived, e.g., 10s TTL for live, longer for VOD)
- Cache key includes `Range` header for partial content responses
- `cache_manager.lua` extended with `streaming: true` flag to disable caching for marked routes

---

## I. OpenResty / WSLproxy Implementation Details

### I.1 What stays in Lua (data plane)

| Component | Why Lua/OpenResty |
|-----------|-------------------|
| Request routing (`traffic_router.lua`) | Per-request, must be fast, runs in nginx worker |
| Rate limiting (`gateway_pipeline.lua`) | Uses `ngx.shared.DICT`, sub-millisecond |
| WAF inspection (`waf_engine.lua`) | Per-request, regex matching in nginx worker |
| Response transformation (`gateway_resp.lua`) | Per-request header/body manipulation |
| SSL certificate selection (`ssl_init.lua`) | `ssl_certificate_by_lua_block`, must be in-worker |
| Health check execution (`healthcheck_init.lua`) | `ngx.timer` background workers |
| Metrics collection (`prometheus_metrics.lua`) | Shared dict counters, Prometheus exposition |
| Cache decisions (`cache_handler.lua`) | Per-request, tied to nginx cache subsystem |
| Session/cookie handling (`sessions.lua`) | Per-request |
| Geo lookup (`geo_lookup.lua`) | Per-request, uses mmdb in-process |
| Logging (`log_handler.lua`) | `log_by_lua_block`, per-request |

### I.2 What moves to external services (control plane)

| Component | Why External | Technology |
|-----------|-------------|------------|
| Leader election | Requires distributed consensus | etcd / Consul / K8s Lease |
| Config storage & versioning | Needs strong consistency, watch, transactions | etcd |
| Config sync agent | Needs filesystem access, etcd client, gRPC | Go (`wslproxy-agent`) |
| BGP route management | Needs BGP protocol implementation | FRR / GoBGP |
| Cross-region health aggregation | Needs global view, decision logic | Go (`wslctl-api`) |
| DNS failover management | Needs DNS API access | Go (`dns-manager`) |
| Audit logging | Needs durable append-only storage | PostgreSQL / S3 |
| Certificate management (ACME) | Needs HTTP-01/DNS-01 challenge solving | Go (or existing `ssl_manager.lua` for single-node) |
| Admin API (cluster-aware) | Needs routing to leader, RBAC, multi-tenant | Go (`wslctl-api`) |

### I.3 Worker coordination model

OpenResty runs N worker processes (typically = CPU cores). Coordination between workers:

**Shared dictionaries** (`ngx.shared.DICT`) — used for:
- Rate limiting counters (existing)
- Circuit breaker state
- Upstream health status (written by health check timer, read by all workers)
- Config version number (agent writes, workers read to detect changes)
- Streaming connection counters

**Limitations of shared dicts:**
- Fixed size, allocated at nginx start (cannot grow dynamically)
- No complex data structures (key-value only, string/number values)
- No pub/sub between workers
- LRU eviction when full

**What NOT to put in shared dicts:**
- Full config objects (use files on disk, read via `ngx.shared` for hot paths only)
- Large data sets (certificates, WAF rule bodies)
- Cross-node state (that's what etcd is for)

### I.4 Dynamic upstream updates

Current approach: `traffic_router.lua` reads upstream config from JSON files. To update upstreams without restart:

**Option A — lua-resty-balancer (recommended):**
```lua
-- In init_worker_by_lua
local balancer = require "resty.balancer.round_robin"
local upstream_config = load_upstream_from_file("api-backend")
local peers = balancer:new(upstream_config.targets)

-- Config watcher timer (runs every 5s)
ngx.timer.every(5, function()
    local new_version = ngx.shared.config:get("config_version")
    if new_version ~= current_version then
        local new_config = load_upstream_from_file("api-backend")
        peers:reinit(new_config.targets)
        current_version = new_version
    end
end)

-- In balancer_by_lua
local peer = peers:find()
balancer.set_current_peer(peer.address, peer.port)
```

**Option B — `balancer_by_lua_block` with ngx.shared.DICT:**
```lua
-- Agent writes upstream targets to shared dict
-- balancer_by_lua reads from shared dict each request
-- More dynamic but slightly more per-request overhead
```

Recommendation: Option A for production (less per-request overhead), with a file-watcher timer to detect config changes.

### I.5 Certificate hot reload

`ssl_certificate_by_lua_block` already supports dynamic cert selection:

```lua
-- Existing ssl_init.lua pattern, extended for config sync:
ssl_certificate_by_lua_block {
    local ssl = require "ngx.ssl"
    local server_name = ssl.server_name()

    -- Check if cert has been updated (agent writes new cert to disk + bumps shared dict version)
    local cert_version = ngx.shared.ssl_certs:get(server_name .. ":version")
    local cached = ngx.shared.ssl_certs:get(server_name .. ":pem")

    if not cached or cert_version ~= cached_version then
        -- Read fresh cert from disk (written by wslproxy-agent)
        local cert_pem = read_file("/opt/nginx/data/ssl/" .. server_name .. "/cert.pem")
        local key_pem = read_file("/opt/nginx/data/ssl/" .. server_name .. "/key.pem")
        ngx.shared.ssl_certs:set(server_name .. ":pem", cert_pem)
        ngx.shared.ssl_certs:set(server_name .. ":key", key_pem)
    end

    ssl.set_der_cert(ssl.cert_pem_to_der(cached))
    ssl.set_der_priv_key(ssl.priv_key_pem_to_der(key_pem))
}
```

No nginx reload needed for certificate updates.

### I.6 Performance considerations

- **Shared dict sizing:** Pre-allocate sufficient space at startup. Undersized dicts cause LRU eviction and performance degradation.
  - `rate_limiting: 20m` (handles ~500k unique IPs)
  - `circuit_breakers: 5m` (handles ~10k upstream entries)
  - `health_status: 5m`
  - `config_meta: 1m`
  - `streaming_conns: 5m`
  - `ssl_certs: 50m` (depends on number of domains)

- **File I/O:** Config files read from disk are cached in Lua module-level variables (shared across requests in same worker, reloaded on config version change). Avoid reading files in hot request path.

- **Timer management:** Consolidate background timers. Current timers: health check, config watch, metrics flush. Total timer count should stay < 20 per worker.

- **Memory:** Each OpenResty worker is a separate process. Lua module-level caches are duplicated per worker. For a 4-worker setup with 100 upstream configs, memory overhead is ~4x. Keep module-level caches lean.

### I.7 What NOT to build in Lua

- **Distributed consensus / Raft** — use etcd/Consul
- **BGP protocol** — use FRR/GoBGP
- **Cross-node RPC** — use gRPC from Go agent
- **Complex config validation** — do it in Go agent before writing to disk
- **Certificate issuance (ACME challenge solving)** — do it in Go agent or dedicated cert-manager
- **Database operations** — keep the data plane stateless; config comes from files

---

## J. Kubernetes and Docker Deployment Model

### J.1 Kubernetes with Helm v4

#### Chart structure

```
helm-charts/wslproxy-platform/
├── Chart.yaml                    # type: application, apiVersion: v2
├── values.yaml                   # Default values
├── values-production.yaml        # Production overrides
├── values-staging.yaml
├── crds/
│   ├── wslproxy-cluster.yaml     # WSLProxyCluster CRD
│   ├── wslproxy-config.yaml      # WSLProxyConfig CRD
│   ├── wslproxy-upstream.yaml    # WSLProxyUpstream CRD
│   └── wslproxy-bgppeer.yaml     # WSLProxyBGPPeer CRD
├── templates/
│   ├── _helpers.tpl
│   ├── NOTES.txt
│   │
│   ├── # Data plane
│   ├── wslproxy-daemonset.yaml       # or Deployment, WSLproxy pods
│   ├── wslproxy-service.yaml         # ClusterIP + LoadBalancer
│   ├── wslproxy-hpa.yaml             # HorizontalPodAutoscaler
│   ├── wslproxy-pdb.yaml             # PodDisruptionBudget
│   ├── wslproxy-configmap.yaml       # Base nginx config
│   ├── wslproxy-serviceaccount.yaml
│   │
│   ├── # Control plane
│   ├── agent-deployment.yaml         # wslproxy-agent (sidecar or standalone)
│   ├── controller-deployment.yaml    # wslctl-api (if deploying control plane)
│   ├── controller-service.yaml
│   │
│   ├── # Config sync
│   ├── config-sync-cronjob.yaml      # Periodic full reconciliation
│   │
│   ├── # BGP
│   ├── bgp-speaker-daemonset.yaml    # FRR/GoBGP (if not using MetalLB)
│   ├── bgp-configmap.yaml
│   │
│   ├── # Networking
│   ├── gateway-api.yaml              # Gateway API resources (if using)
│   ├── network-policy.yaml
│   │
│   ├── # Observability
│   ├── servicemonitor.yaml           # Prometheus ServiceMonitor
│   ├── prometheusrule.yaml           # Alert rules
│   │
│   ├── # RBAC
│   ├── clusterrole.yaml
│   ├── clusterrolebinding.yaml
│   └── role.yaml
│
├── charts/                           # Subcharts
│   ├── etcd/                         # etcd subchart (bitnami/etcd)
│   └── redis/                        # Redis subchart (optional, for rate limiting)
└── tests/
    ├── test-connection.yaml
    └── test-health.yaml
```

#### Key Helm values

```yaml
# values.yaml
global:
  clusterName: "wslproxy-prod-eu"
  region: "eu-west-1"
  pop: "london"

dataPlane:
  replicaCount: 3
  image:
    repository: ghcr.io/wslproxy/wslproxy
    tag: "2.4.0"
  resources:
    requests:
      cpu: "500m"
      memory: "512Mi"
    limits:
      cpu: "2"
      memory: "2Gi"

  # Anti-affinity: spread across nodes/zones
  affinity:
    podAntiAffinity:
      requiredDuringSchedulingIgnoredDuringExecution:
        - labelSelector:
            matchExpressions:
              - key: app.kubernetes.io/name
                operator: In
                values: ["wslproxy"]
          topologyKey: "kubernetes.io/hostname"
      preferredDuringSchedulingIgnoredDuringExecution:
        - weight: 100
          podAffinityTerm:
            labelSelector:
              matchExpressions:
                - key: app.kubernetes.io/name
                  operator: In
                  values: ["wslproxy"]
            topologyKey: "topology.kubernetes.io/zone"

  # Probes
  startupProbe:
    httpGet:
      path: /health
      port: 8080
    initialDelaySeconds: 5
    periodSeconds: 2
    failureThreshold: 30

  livenessProbe:
    httpGet:
      path: /health
      port: 8080
    periodSeconds: 10
    failureThreshold: 3

  readinessProbe:
    httpGet:
      path: /ready
      port: 8080
    periodSeconds: 5
    failureThreshold: 2

  # PDB
  pdb:
    minAvailable: 1  # or maxUnavailable: 1

  # Streaming tuning
  streaming:
    enabled: true
    maxConnectionsPerUpstream: 1000
    idleTimeout: "300s"

agent:
  image:
    repository: ghcr.io/wslproxy/wslproxy-agent
    tag: "1.0.0"
  mode: "sidecar"  # or "standalone"

controlPlane:
  enabled: false   # Set true if deploying control plane in this cluster

etcd:
  enabled: true    # Deploy etcd subchart
  replicaCount: 3

bgp:
  enabled: false
  speaker: "metallb"  # or "frr", "gobgp"
  asn: 65001
  peers:
    - address: "10.0.0.1"
      asn: 65000
  vipPrefix: "198.51.100.0/24"
```

#### CRD: WSLProxyCluster

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: wslproxyclusters.wslproxy.io
spec:
  group: wslproxy.io
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                region:
                  type: string
                pop:
                  type: string
                replicas:
                  type: integer
                  minimum: 1
                configVersion:
                  type: integer
                failoverPolicy:
                  type: object
                  properties:
                    healthyThreshold:
                      type: number
                    failoverTargets:
                      type: array
                      items:
                        type: string
                bgp:
                  type: object
                  properties:
                    enabled:
                      type: boolean
                    asn:
                      type: integer
                    vipPrefix:
                      type: string
            status:
              type: object
              properties:
                phase:
                  type: string
                  enum: [Initializing, Running, Degraded, Failed]
                leader:
                  type: string
                healthyNodes:
                  type: integer
                totalNodes:
                  type: integer
                configVersion:
                  type: integer
                lastSyncTime:
                  type: string
                  format: date-time
      subresources:
        status: {}
  scope: Namespaced
  names:
    plural: wslproxyclusters
    singular: wslproxycluster
    kind: WSLProxyCluster
    shortNames: ["wpc"]
```

#### CRD: WSLProxyConfig

```yaml
apiVersion: apiextensions.k8s.io/v1
kind: CustomResourceDefinition
metadata:
  name: wslproxyconfigs.wslproxy.io
spec:
  group: wslproxy.io
  versions:
    - name: v1alpha1
      served: true
      storage: true
      schema:
        openAPIV3Schema:
          type: object
          properties:
            spec:
              type: object
              properties:
                version:
                  type: integer
                servers:
                  type: array
                  items:
                    type: object
                    properties:
                      id:
                        type: string
                      hostname:
                        type: string
                      listenPort:
                        type: integer
                      upstreamRef:
                        type: string
                      tls:
                        type: object
                        properties:
                          enabled:
                            type: boolean
                          secretName:
                            type: string
                rules:
                  type: array
                  items:
                    type: object
                upstreams:
                  type: array
                  items:
                    type: object
                    properties:
                      id:
                        type: string
                      targets:
                        type: array
                        items:
                          type: object
                          properties:
                            address:
                              type: string
                            port:
                              type: integer
                            weight:
                              type: integer
                      healthCheck:
                        type: object
                      streaming:
                        type: object
            status:
              type: object
              properties:
                appliedVersion:
                  type: integer
                syncStatus:
                  type: string
                  enum: [Synced, Syncing, Error, Drift]
                lastApplied:
                  type: string
                  format: date-time
      subresources:
        status: {}
  scope: Namespaced
  names:
    plural: wslproxyconfigs
    singular: wslproxyconfig
    kind: WSLProxyConfig
    shortNames: ["wpconfig"]
```

### J.2 Docker Compose / standalone containers

```yaml
# docker-compose-ha.yml
version: "3.8"

services:
  wslproxy-1:
    image: ghcr.io/wslproxy/wslproxy:2.4.0
    ports:
      - "8080:8080"
      - "8443:8443"
    volumes:
      - wslproxy-1-data:/opt/nginx/data
      - wslproxy-1-certs:/opt/nginx/ssl
    environment:
      - WSLPROXY_NODE_ID=node-1
      - WSLPROXY_CLUSTER_NAME=local-ha
      - WSLPROXY_ETCD_ENDPOINTS=http://etcd:2379
    depends_on:
      - etcd
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 5s
      timeout: 3s
      retries: 3

  wslproxy-2:
    image: ghcr.io/wslproxy/wslproxy:2.4.0
    ports:
      - "8081:8080"
      - "8444:8443"
    volumes:
      - wslproxy-2-data:/opt/nginx/data
      - wslproxy-2-certs:/opt/nginx/ssl
    environment:
      - WSLPROXY_NODE_ID=node-2
      - WSLPROXY_CLUSTER_NAME=local-ha
      - WSLPROXY_ETCD_ENDPOINTS=http://etcd:2379
    depends_on:
      - etcd

  agent-1:
    image: ghcr.io/wslproxy/wslproxy-agent:1.0.0
    volumes:
      - wslproxy-1-data:/opt/nginx/data
      - wslproxy-1-certs:/opt/nginx/ssl
    environment:
      - WSLPROXY_NODE_ID=node-1
      - WSLPROXY_ETCD_ENDPOINTS=http://etcd:2379
      - WSLPROXY_PROXY_URL=http://wslproxy-1:8080

  agent-2:
    image: ghcr.io/wslproxy/wslproxy-agent:1.0.0
    volumes:
      - wslproxy-2-data:/opt/nginx/data
      - wslproxy-2-certs:/opt/nginx/ssl
    environment:
      - WSLPROXY_NODE_ID=node-2
      - WSLPROXY_ETCD_ENDPOINTS=http://etcd:2379
      - WSLPROXY_PROXY_URL=http://wslproxy-2:8080

  etcd:
    image: quay.io/coreos/etcd:v3.5.17
    command:
      - etcd
      - --name=etcd-1
      - --listen-client-urls=http://0.0.0.0:2379
      - --advertise-client-urls=http://etcd:2379
    ports:
      - "2379:2379"

  haproxy:
    image: haproxy:2.9
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./haproxy.cfg:/usr/local/etc/haproxy/haproxy.cfg:ro
    depends_on:
      - wslproxy-1
      - wslproxy-2

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

volumes:
  wslproxy-1-data:
  wslproxy-1-certs:
  wslproxy-2-data:
  wslproxy-2-certs:
```

### J.3 VM / bare metal deployment

**systemd unit files:**

```ini
# /etc/systemd/system/wslproxy.service
[Unit]
Description=WSLproxy OpenResty
After=network.target
Wants=wslproxy-agent.service

[Service]
Type=forking
PIDFile=/usr/local/openresty/nginx/logs/nginx.pid
ExecStartPre=/usr/local/openresty/bin/openresty -t
ExecStart=/usr/local/openresty/bin/openresty
ExecReload=/usr/local/openresty/bin/openresty -s reload
ExecStop=/usr/local/openresty/bin/openresty -s quit
LimitNOFILE=65535
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/wslproxy-agent.service
[Unit]
Description=WSLproxy Agent
After=network.target wslproxy.service
Requires=wslproxy.service

[Service]
Type=simple
ExecStart=/usr/local/bin/wslproxy-agent \
  --node-id={{ node_id }} \
  --region={{ region }} \
  --pop={{ pop }} \
  --etcd-endpoints={{ etcd_endpoints }} \
  --proxy-url=http://127.0.0.1:8080 \
  --data-dir=/opt/nginx/data \
  --ssl-dir=/opt/nginx/ssl
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```ini
# /etc/systemd/system/wslproxy-bgp.service (FRR)
[Unit]
Description=WSLproxy BGP Speaker (FRR)
After=network.target

[Service]
Type=forking
ExecStart=/usr/lib/frr/frrinit.sh start
ExecStop=/usr/lib/frr/frrinit.sh stop
ExecReload=/usr/lib/frr/frrinit.sh reload
Restart=always

[Install]
WantedBy=multi-user.target
```

**Upgrade process (VM):**
1. `wslctl node drain --node wsl-eu-lon-01` — BGP withdrawal + LB removal
2. Wait for connection drain (30s)
3. `systemctl stop wslproxy wslproxy-agent`
4. Deploy new binaries (Ansible or package manager)
5. `systemctl start wslproxy-agent wslproxy` — agent syncs config, then starts OpenResty
6. `wslctl node undrain --node wsl-eu-lon-01` — re-advertise BGP, re-enter LB pool

**Rollback:** Same drain/undrain cycle with previous binary version. Config rollback is independent (see Section D.5).

---

## K. APIs, UI, and Management Features

### K.1 Management API (`wslctl-api`)

**Base URL:** `https://api.wslproxy.internal/v1/`

#### Cluster management
```
POST   /clusters                          # Create cluster
GET    /clusters                          # List clusters
GET    /clusters/{id}                     # Get cluster details
DELETE /clusters/{id}                     # Decommission cluster
POST   /clusters/{id}/regions             # Register region
DELETE /clusters/{id}/regions/{region}     # Remove region
GET    /clusters/{id}/leader              # Get current leader
GET    /clusters/{id}/members             # List members
POST   /clusters/{id}/drain               # Drain cluster (emergency)
POST   /clusters/{id}/undrain             # Restore cluster
```

#### Configuration management
```
GET    /config/versions                    # List versions
GET    /config/versions/{v}                # Get version details
POST   /config/versions                    # Create new version
POST   /config/rollback                    # Rollback to version
GET    /config/sync-status                 # Sync status across nodes
POST   /config/promote                     # Promote between environments
GET    /config/diff?from={v1}&to={v2}      # Diff two versions
```

#### Server / upstream / rule CRUD (existing API, wrapped by wslctl-api with cluster awareness)
```
GET    /servers
POST   /servers
PUT    /servers/{id}
DELETE /servers/{id}
# Same pattern for /upstreams, /rules, /waf-policies, /ssl-certs
```

#### Failover management
```
GET    /failover/status                    # Current failover state
POST   /failover/trigger                   # Manual failover
POST   /failover/drain-region              # Evacuate region
POST   /failover/restore-region            # Restore region
GET    /failover/history                   # Failover event history
```

#### BGP management
```
GET    /bgp/peers                          # BGP peer status
GET    /bgp/routes                         # Advertised routes
POST   /bgp/withdraw                       # Manual route withdrawal
POST   /bgp/advertise                      # Manual route advertisement
```

#### PoP management
```
GET    /pops                               # List PoPs
GET    /pops/{id}/health                   # PoP health
GET    /pops/{id}/metrics                  # PoP traffic metrics
```

#### Audit
```
GET    /audit/logs                          # Query audit logs
GET    /audit/logs?actor={user}&action={type}&from={ts}&to={ts}
```

### K.2 CLI tool (`wslctl`)

```bash
# Cluster operations
wslctl cluster list
wslctl cluster status my-cluster
wslctl cluster add-region --cluster my-cluster --region us-east-1

# Config operations
wslctl config apply --from-dir ./config/
wslctl config diff --from 41 --to 42
wslctl config rollback --to-version 41
wslctl config promote --from int --to prod
wslctl config sync-status

# Node operations
wslctl node list --region eu-west-1
wslctl node drain wsl-eu-lon-01
wslctl node undrain wsl-eu-lon-01

# Failover operations
wslctl failover status
wslctl failover drain-region eu-west-1
wslctl failover restore-region eu-west-1

# BGP operations
wslctl bgp peers
wslctl bgp routes
wslctl bgp withdraw --node wsl-eu-lon-01
```

### K.3 Admin UI enhancements

Extend the existing React admin UI (`openresty-admin/`) with new pages:

| Page | Content |
|------|---------|
| **Cluster Overview** | Regions, PoPs, nodes, leader, config version, health status |
| **Node Map** | Geographic map showing all PoPs with health indicators |
| **Config Sync** | Version history, per-node sync status, drift alerts |
| **Failover Dashboard** | Current failover state, active alerts, manual controls |
| **BGP Status** | Peer sessions, advertised routes, withdrawal history |
| **Streaming Monitor** | Active streaming connections, per-upstream counts, backpressure events |
| **Audit Log Viewer** | Searchable change history with actor, action, timestamp, diff |
| **Region Evacuation** | One-click region drain with confirmation, live progress |

---

## L. Security and Compliance

### L.1 mTLS between components

All inter-component communication uses mutual TLS:

```
wslproxy-agent ←→ etcd           : mTLS (client cert per agent)
wslproxy-agent ←→ wslctl-api     : mTLS (agent cert)
wslproxy-agent ←→ BGP speaker    : localhost only (no TLS needed)
wslctl-api ←→ etcd               : mTLS (service cert)
wslctl-api ←→ dns-manager        : mTLS (service cert)
admin-ui → wslctl-api            : HTTPS + JWT auth
wslctl CLI → wslctl-api          : HTTPS + mTLS or API key
```

Certificate authority: dedicated internal CA (or cert-manager on K8s). Certs auto-rotated every 90 days.

### L.2 RBAC model

```
Roles:
  super-admin    : Full access to all clusters, regions, tenants
  cluster-admin  : Full access within assigned cluster(s)
  tenant-admin   : Full access within assigned tenant(s)
  operator       : Read access + failover/drain controls
  viewer         : Read-only access to dashboards and status
  ci-bot         : Config apply/promote within specific environments

Permissions:
  config:read, config:write, config:promote
  cluster:read, cluster:write, cluster:drain
  failover:read, failover:trigger
  bgp:read, bgp:manage
  audit:read
  tenant:{id}:read, tenant:{id}:write
```

### L.3 Signed config bundles

Every config version published to etcd includes a signature:

```json
{
  "version": 42,
  "checksum": "sha256:abc123...",
  "signature": "ed25519:...",
  "signed_by": "wslctl-api-prod",
  "signed_at": "2026-03-08T14:30:00Z"
}
```

`wslproxy-agent` verifies the signature before applying config. Prevents tampering if etcd is compromised.

### L.4 Secret encryption

- Secrets in etcd encrypted with AES-256-GCM envelope encryption
- Encryption key stored in KMS (AWS KMS, HashiCorp Vault) or local keyfile (VM deployments)
- Secrets never logged in plaintext — audit log records "secret updated" without value

### L.5 Safe BGP defaults

- Max-prefix limit on all peers (prevent route table explosion)
- Only advertise explicitly configured prefixes (deny-all default)
- Deny all inbound routes (WSLproxy doesn't need to learn routes from peers)
- MD5 authentication on all BGP sessions
- Prefix lists reviewed and version-controlled

### L.6 DDoS considerations at PoP layer

- Rate limiting per source IP (existing `gateway_pipeline.lua`)
- Connection limits per source IP (`limit_conn_zone`)
- SYN flood protection via kernel settings (`net.ipv4.tcp_syncookies`)
- Slowloris protection: `client_header_timeout 10s`, `client_body_timeout 10s`
- Large POST body limits: `client_max_body_size` per-route
- GeoIP blocking capability (existing `geo_lookup.lua` + rules)

---

## M. Observability

### M.1 Metrics (Prometheus)

**Proxy metrics** (existing `prometheus_metrics.lua`, extended):
```
wslproxy_requests_total{server, method, status, upstream}
wslproxy_request_duration_seconds{server, upstream}
wslproxy_upstream_response_time_seconds{upstream, target}
wslproxy_active_connections{server}
wslproxy_streaming_connections_active{upstream, type}
wslproxy_streaming_connection_duration_seconds{upstream}
```

**Health metrics:**
```
wslproxy_upstream_health{upstream, target, status}     # 1=healthy, 0=unhealthy
wslproxy_circuit_breaker_state{upstream}               # 0=closed, 1=open, 2=half_open
wslproxy_node_health{node_id, region, pop}
```

**Cluster metrics:**
```
wslproxy_leader_election_total{region, result}
wslproxy_leader_tenure_seconds{region}
wslproxy_config_version{node_id}
wslproxy_config_sync_lag_seconds{node_id}
wslproxy_config_sync_failures_total{node_id}
wslproxy_config_drift_detected_total{node_id}
```

**BGP metrics:**
```
wslproxy_bgp_session_up{peer_address, peer_asn}
wslproxy_bgp_prefixes_advertised{peer_address}
wslproxy_bgp_route_withdrawals_total{prefix, reason}
wslproxy_bgp_session_uptime_seconds{peer_address}
```

**Failover metrics:**
```
wslproxy_failover_events_total{region, type, result}
wslproxy_failover_duration_seconds{region}
wslproxy_region_health_ratio{region}
```

### M.2 Logs

Structured JSON logging (extend existing `log_handler.lua`):

```json
{
  "timestamp": "2026-03-08T14:30:00.123Z",
  "level": "info",
  "type": "access",
  "node_id": "wsl-eu-lon-01",
  "region": "eu-west-1",
  "request_id": "abc-123",
  "client_ip": "203.0.113.1",
  "method": "GET",
  "host": "api.example.com",
  "uri": "/v1/users",
  "status": 200,
  "upstream": "api-backend",
  "upstream_target": "10.0.2.10:8080",
  "upstream_response_time_ms": 45,
  "total_time_ms": 47,
  "bytes_sent": 1234,
  "streaming": false,
  "tenant_id": "acme-corp"
}
```

Ship via: Vector / Fluent Bit → Loki / Elasticsearch / S3

### M.3 Traces

Distributed tracing with OpenTelemetry:
- Propagate `traceparent` header through proxy (W3C Trace Context)
- Create spans for: ingress → WAF → routing → upstream call → response transformation
- Export via OTLP to Jaeger / Tempo

Implementation: `lua-resty-opentelemetry` or lightweight header propagation in `gateway_pipeline.lua`.

### M.4 SLOs

| SLO | Target | Measurement |
|-----|--------|-------------|
| Proxy availability | 99.99% | `1 - (5xx_without_upstream / total_requests)` |
| Upstream failover time | < 5s p99 | Time from backend failure to removal from rotation |
| Config sync success | 99.9% | Successful syncs / total sync attempts |
| Config sync latency | < 10s p95 | Time from config commit to all nodes reporting new version |
| Failover completion | < 60s p95 | Time from failure detection to traffic redirected |
| BGP convergence | < 10s p95 | Time from route withdrawal to router table update |
| Streaming connection stability | 99.9% | Long-lived connections alive / expected alive |

---

## N. Implementation Roadmap

### Phase 1: Single-Region HA Cluster (Weeks 1-6)

**Scope:**
- `wslproxy-agent` Go binary with node registration and health reporting
- Leader election via etcd Lease
- Basic config pull from etcd to local disk
- Docker Compose HA setup (2+ WSLproxy nodes + etcd + HAProxy)
- `/health` and `/ready` endpoints

**Architecture changes:**
- New component: `wslproxy-agent` (Go binary, runs alongside each WSLproxy instance)
- New dependency: etcd (3-node cluster)
- Config source shifts from "manual file placement" to "etcd → agent → disk → OpenResty"

**Key components:**
- `cmd/wslproxy-agent/main.go` — agent entrypoint
- `pkg/election/` — leader election logic
- `pkg/health/` — health checking and reporting
- `pkg/noderegistry/` — node registration
- `docker-compose-ha.yml` — HA Docker Compose

**Risks:**
- etcd operational complexity for teams unfamiliar with it
- Agent ↔ OpenResty interaction model needs careful testing (file writes, shared dict updates)

**Test strategy:**
- Unit tests for agent election logic (mock etcd)
- Integration test: 3-node cluster, kill leader, verify re-election within 20s
- Integration test: config update in etcd, verify all nodes apply within 15s
- Soak test: run HA cluster for 48h under load, verify no leader flapping

**Rollback strategy:**
- Agent is a sidecar — removing it returns to manual config management
- etcd can be bypassed — agent supports `--standalone` mode (no clustering, files-only)

---

### Phase 2: Config Sync and Versioning (Weeks 7-12)

**Scope:**
- Config versioning in etcd (version counter, change log, checksums)
- `wslctl-api` Go service for config management API
- `wslctl` CLI for operators
- Config validation pipeline
- Drift detection
- GitOps export (etcd → Git backup)
- Rollback support

**Architecture changes:**
- New component: `wslctl-api` (Go REST/gRPC service)
- New component: `wslctl` CLI (Go binary)
- Admin UI connects to `wslctl-api` instead of directly to OpenResty API

**Key components:**
- `cmd/wslctl-api/main.go` — API server
- `cmd/wslctl/main.go` — CLI
- `pkg/config/` — config versioning, validation, diffing
- `pkg/sync/` — sync agent logic (watch, pull, apply, drift check)
- `pkg/audit/` — audit log writer

**Risks:**
- Migration of existing config (JSON files on disk) to etcd-managed config
- Admin UI refactoring to use new API
- Config validation must handle all existing config variants

**Test strategy:**
- Unit tests for config diffing, validation, rollback logic
- Integration test: apply config, verify propagation, rollback, verify reversion
- Conflict test: concurrent config writes, verify optimistic concurrency rejection
- Drift test: manually modify file on one node, verify drift detection within 60s

**Rollback strategy:**
- `wslctl-api` can be taken offline — agents fall back to last-known config
- CLI operations are idempotent — safe to re-run

---

### Phase 3: Backend and Node Failover (Weeks 13-18)

**Scope:**
- Circuit breaker implementation in Lua (`ngx.shared.DICT`)
- Enhanced upstream health checks (active + passive)
- Retry policy per-upstream
- Connection draining on node removal
- Node health-based LB integration (HAProxy health checks)
- Session affinity with degradation

**Architecture changes:**
- New Lua modules: `circuit_breaker.lua`, enhanced `healthcheck_init.lua`
- New config objects: `health_check` and `retry` per upstream
- `gateway_pipeline.lua` extended with circuit breaker check

**Key components:**
- `api/circuit_breaker.lua` — circuit breaker state machine
- `api/retry.lua` — retry policy execution
- `api/drain.lua` — connection draining logic
- Enhanced `api/healthcheck_init.lua` — active + passive health checks

**Risks:**
- Circuit breaker shared dict sizing — must handle all upstream × target combinations
- Retry storms if retry budget not properly enforced
- Session affinity degradation may surprise users expecting sticky sessions to survive failures

**Test strategy:**
- Unit test: circuit breaker state transitions
- Integration test: kill backend, verify circuit opens within 10s, verify traffic rerouted
- Retry test: 502 from upstream, verify retry to different target
- Drain test: initiate drain, verify in-flight requests complete, new requests rejected
- Chaos test: randomly kill backends during load test, verify error rate < 1%

**Rollback strategy:**
- Circuit breaker and retry are per-upstream config — disable by setting `enabled: false`
- Health check enhancements are backward-compatible with existing config format

---

### Phase 4: Multi-Region Failover (Weeks 19-26)

**Scope:**
- Multi-region etcd replication (or regional etcd + global sync)
- Regional leader election
- Global leader election
- Global failover controller in `wslctl-api`
- DNS-based failover (Route53 / PowerDNS integration)
- `dns-manager` component
- Region health aggregation
- Region drain/restore controls

**Architecture changes:**
- etcd topology: global 3-node cluster (multi-AZ) or per-region etcd with cross-region sync
- New component: `dns-manager` (Go service)
- `wslctl-api` extended with global failover logic

**Key components:**
- `pkg/failover/` — failover controller, health aggregation, decision engine
- `cmd/dns-manager/main.go` — DNS record management
- `pkg/dns/` — Route53, PowerDNS, Cloudflare providers
- Multi-region Docker Compose (simulated) for testing

**Risks:**
- Cross-region etcd latency (if using single global etcd cluster)
- DNS TTL lag during failover (mitigated by low TTLs, but increases DNS query volume)
- False positive region failover (bad health aggregation threshold)

**Test strategy:**
- Integration test: simulate region failure (stop all nodes in region), verify DNS update within 60s
- Partition test: network-partition a region, verify it drains and other region absorbs traffic
- False positive test: kill 1 of 3 nodes, verify region does NOT failover (threshold = 0.5)
- Restore test: bring region back, verify DNS restored, traffic rebalances

**Rollback strategy:**
- Global failover controller can be disabled — regions operate independently
- DNS changes are reversible (update records back)

---

### Phase 5: BGP Integration (Weeks 27-34)

**Scope:**
- FRR sidecar deployment (VM/bare metal)
- MetalLB integration (Kubernetes)
- `wslproxy-agent` BGP health loop
- Anycast VIP advertisement
- ECMP within PoP
- BFD for sub-second failure detection
- BGP security controls (MD5, prefix lists, max-prefix)
- BGP monitoring metrics

**Architecture changes:**
- New component: BGP speaker (FRR or MetalLB)
- `wslproxy-agent` extended with BGP control logic
- Network topology change: anycast VIPs replace traditional LB VIPs

**Key components:**
- `pkg/bgp/` — BGP speaker management (FRR config generation, GoBGP gRPC client)
- Ansible role: `bgp-speaker` (FRR installation and configuration)
- Helm values: BGP-specific configuration
- FRR config templates

**Risks:**
- BGP misconfiguration can black-hole traffic or leak routes
- Requires cooperation with network team / DC operations for peering
- ECMP rehash on node failure disrupts long-lived connections

**Test strategy:**
- Lab test: FRR peering with virtual router (GoBGP or bird), verify route advertisement/withdrawal
- Health-based test: fail health check, verify route withdrawn within 10s
- ECMP test: verify traffic distribution across 3 nodes
- Security test: attempt route injection from unauthorized peer, verify rejection

**Rollback strategy:**
- BGP is additive — traditional LB can remain in place as fallback
- FRR can be stopped without affecting data plane
- MetalLB is a standard K8s add-on — removable via Helm

---

### Phase 6: PoP Rollout and Streaming Optimisation (Weeks 35-44)

**Scope:**
- Streaming proxy tuning (SSE, gRPC, WebSocket, large objects)
- Per-route streaming policies
- Noisy neighbour protection for streaming
- Video/range request support
- PoP deployment playbooks (Ansible)
- Multi-PoP test environment
- Geo-routing with anycast + DNS
- PoP health dashboard

**Architecture changes:**
- New config objects: streaming policy per upstream/route
- `nginx.conf.j2` extended with streaming-specific blocks
- `traffic_router.lua` extended with streaming connection tracking

**Key components:**
- `api/streaming.lua` — streaming connection management, backpressure
- Enhanced `api/traffic_router.lua` — streaming-aware routing
- Enhanced `nginx.conf.j2` — WebSocket, gRPC, SSE location blocks
- Ansible playbook: `playbook_pop_deploy.yml`
- PoP health aggregation in `wslctl-api`

**Risks:**
- Streaming workloads consume long-lived connections — capacity planning critical
- WebSocket/gRPC add protocol complexity
- Multi-PoP testing requires representative network topology (simulate with tc netem)

**Test strategy:**
- SSE test: 1000 concurrent SSE connections, verify stable for 1h
- gRPC test: bidirectional streaming under load
- WebSocket test: echo server, verify upgrade, message exchange, connection stability
- Large download test: 10GB file, verify range request resume after interruption
- Noisy neighbour test: one tenant floods streaming connections, verify other tenants unaffected

**Rollback strategy:**
- Streaming features are per-route config — disable by removing streaming policy
- gRPC/WebSocket location blocks are only generated if configured — no impact on existing traffic

---

### Phase 7: Enterprise-Grade UI, Audit, and Compliance (Weeks 45-52)

**Scope:**
- Full admin UI overhaul: cluster dashboard, node map, failover controls
- Audit log viewer with search and filtering
- Change request and approval workflows (4-eyes principle for prod changes)
- Tenant self-service portal
- Compliance reports (config change history, access logs)
- RBAC enforcement across all APIs
- Signed config bundles
- Secret encryption with KMS integration

**Architecture changes:**
- `wslctl-api` extended with approval workflow engine
- Admin UI (`openresty-admin/`) gets major new pages
- Audit log backend (PostgreSQL or append-only S3)

**Key components:**
- `openresty-admin/src/Cluster/` — cluster management pages
- `openresty-admin/src/Failover/` — failover dashboard
- `openresty-admin/src/Audit/` — audit log viewer
- `openresty-admin/src/BGP/` — BGP status page
- `pkg/approval/` — change approval workflow
- `pkg/rbac/` — RBAC enforcement
- `pkg/crypto/` — config signing, secret encryption

**Risks:**
- UI scope creep — must be disciplined about MVP
- Approval workflows add friction — need bypass for emergencies
- RBAC migration may break existing API consumers

**Test strategy:**
- E2E UI tests (extend existing Cypress/Playwright tests)
- RBAC test: verify each role can only access permitted resources
- Approval test: verify 4-eyes enforcement for prod promotions
- Audit test: verify every config change is logged with actor and diff

**Rollback strategy:**
- UI is independently deployable — can roll back UI without affecting data plane
- RBAC can be set to "permissive" mode during migration (log violations, don't block)

---

## O. Detailed Testing Strategy

### O.1 Test pyramid

```
                    ┌─────────┐
                    │  E2E /  │     Chaos tests, multi-region failover drills
                    │  Chaos  │     (weekly, staged environments)
                   ┌┴─────────┴┐
                   │Integration │    Multi-node cluster tests, config sync,
                   │   Tests    │    failover scenarios (CI, every merge)
                  ┌┴────────────┴┐
                  │  Component   │   Agent, API, CLI, circuit breaker
                  │    Tests     │   (CI, every commit)
                 ┌┴──────────────┴┐
                 │   Unit Tests    │  Pure logic: election, config diff,
                 │                 │  health check, retry (CI, every commit)
                 └─────────────────┘
```

### O.2 Unit tests

| Component | Test focus | Framework |
|-----------|-----------|-----------|
| `pkg/election/` | Election state machine, lease renewal, timeout handling | Go `testing` |
| `pkg/config/` | Config validation, diffing, versioning, rollback | Go `testing` |
| `pkg/bgp/` | FRR config generation, GoBGP client mock | Go `testing` |
| `api/circuit_breaker.lua` | State transitions, timing, threshold logic | busted (Lua) |
| `api/retry.lua` | Retry decisions, backoff calculation, budget enforcement | busted (Lua) |
| `api/streaming.lua` | Connection counting, limit enforcement | busted (Lua) |

### O.3 Integration tests

| Scenario | Setup | Verification |
|----------|-------|-------------|
| **3-node cluster formation** | Docker Compose with 3 WSLproxy + etcd | All nodes registered, leader elected |
| **Leader failover** | Kill leader container | New leader elected within 20s, traffic unaffected |
| **Config propagation** | Apply config via API | All nodes report new version within 15s |
| **Config rollback** | Rollback to previous version | All nodes revert, verified by API response |
| **Backend failover** | Stop upstream container | Circuit breaker opens, traffic routes to healthy backend |
| **Node drain** | Drain one node | In-flight requests complete, new requests go to other nodes |
| **Drift detection** | Manually modify config file | Agent detects drift within 60s, re-syncs |

### O.4 Soak tests

- Run 3-node cluster under sustained load (1000 req/s) for 72 hours
- Monitor: memory leaks, file descriptor leaks, shared dict fullness, leader stability
- Acceptance criteria: no OOM kills, no leader flapping, error rate < 0.01%

### O.5 Chaos testing

Use `chaos-mesh` (K8s) or `pumba` / `tc netem` (Docker/VM):

| Chaos scenario | Injection | Expected behaviour |
|---------------|-----------|-------------------|
| Node crash | `kill -9` random node | Traffic shifts to survivors within 10s |
| Network partition | iptables drop between nodes | Partitioned node serves stale config, rejoins on heal |
| Slow network | tc netem delay 500ms | Config sync delayed but eventually consistent |
| etcd leader loss | Kill etcd leader | etcd re-elects leader, agent reconnects |
| DNS failure | Block DNS resolution | Existing connections unaffected, new connections fail gracefully |
| Full region outage | Stop all containers in region | DNS/BGP failover to other region within 60s |
| Disk full | Fill data partition | Agent logs error, serves last-known-good config |
| Clock skew | Offset system clock by 5 min | Lease renewals adjusted, no false leader expiry |

### O.6 Regional failover drills

Monthly production drill:
1. Announce maintenance window
2. Execute `wslctl failover drain-region eu-west-1`
3. Verify all traffic shifts to us-east-1 within 60s
4. Run synthetic tests against us-east-1
5. Execute `wslctl failover restore-region eu-west-1`
6. Verify traffic rebalances
7. Document results and any issues

### O.7 BGP peer failure simulation

- Shut down BGP peering interface on ToR router (lab environment)
- Verify: WSLproxy agent detects session down, triggers alerts
- Verify: If BFD enabled, detection < 1 second
- Verify: Traffic reroutes to other nodes in PoP via remaining paths

### O.8 Config sync conflict tests

- Concurrent writes from two `wslctl` sessions: verify only one succeeds (optimistic concurrency)
- Network partition during config sync: verify nodes on each side have consistent (if different) config
- Partial etcd failure during write: verify transaction atomicity (all or nothing)

### O.9 Streaming workload tests

| Test | Parameters | Success criteria |
|------|-----------|-----------------|
| SSE stability | 5000 concurrent connections, 1h | < 0.1% connection drops |
| gRPC throughput | 10000 msg/s bidirectional, 30min | p99 latency < 50ms |
| WebSocket echo | 2000 connections, 100 msg/s each | 0% message loss |
| Large download | 50GB file, 100 concurrent downloads | All complete, range resume works |
| Streaming + failover | SSE connections + kill upstream | Clients auto-reconnect within 5s |

### O.10 Performance benchmarks

| Metric | Target | Tool |
|--------|--------|------|
| Requests/sec (non-streaming) | > 50,000 per node | wrk2, k6 |
| p99 latency (simple proxy) | < 5ms | wrk2, k6 |
| p99 latency (WAF enabled) | < 15ms | wrk2, k6 |
| Config reload time | < 100ms | Internal timer |
| Leader election time | < 20s | Integration test |
| Streaming connections/node | > 10,000 concurrent | Custom SSE client |
| Memory per 1000 upstreams | < 100MB | Agent metrics |

### O.11 Split-brain and partition tests

| Scenario | Setup | Expectation |
|----------|-------|-------------|
| 2-node cluster, network split | Partition between nodes | One side retains leader (has etcd majority), other side serves stale config |
| 3-node cluster, minority partition | Isolate 1 node | Isolated node loses leadership (if leader), serves stale config, rejoins on heal |
| etcd cluster partition | Lose 2 of 3 etcd nodes | etcd read-only, agents serve last-known config, no config writes |
| Cross-region partition | Isolate one region from global CP | Region continues serving, no config updates, regional leader manages locally |

---

## P. Output Format — Summary Artefacts

### P.1 Architecture overview

WSLproxy evolves from single-node OpenResty proxy to a distributed platform with:
- **Data plane:** OpenResty/Lua (unchanged, stays fast and lean)
- **Node agent:** Go binary (`wslproxy-agent`) for election, config sync, health, BGP control
- **Control plane:** Go service (`wslctl-api`) for management API, failover, audit
- **Coordination:** etcd (K8s) or Consul (VM)
- **BGP:** FRR (VM) or MetalLB (K8s)
- **DNS failover:** Pluggable (Route53, PowerDNS, Cloudflare)

### P.2 Technology choices

| Component | Technology | Reason |
|-----------|-----------|--------|
| Data plane | OpenResty 1.25+ / Lua | Existing investment, proven performance, per-request flexibility |
| Node agent | Go 1.22+ | etcd/K8s client libraries, gRPC, cross-compilation, single binary |
| Control plane API | Go 1.22+ + chi/echo router | Same language as agent, strong concurrency model |
| Coordination store | etcd 3.5+ | Native to K8s, strong consistency, watch API, lease-based election |
| Coordination (VM alt) | Consul 1.18+ | Service discovery + KV + sessions, runs well on VMs |
| BGP speaker (VM) | FRR 9+ | Industry standard, full BGP + BFD, Linux integration |
| BGP speaker (K8s) | MetalLB 0.14+ | K8s-native, Speaker pods, CRD config |
| CLI | Go (cobra) | Single binary, cross-platform |
| Admin UI | React + React Admin (existing) | Existing codebase, extend don't rewrite |
| Config packaging | OCI artifacts (optional) | Version, sign, distribute config like container images |
| Observability | Prometheus + Grafana + Loki | Industry standard, existing ecosystem |
| Tracing | OpenTelemetry → Jaeger/Tempo | W3C standard, vendor-neutral |

### P.3 Component diagram description

See Section B.1 for the full ASCII diagram. Key components:

1. **Global Control Plane** (single deployment, multi-AZ): wslctl-api, etcd, dns-manager, admin UI, audit log
2. **Regional Control Plane** (per-region): wslproxy-agent (leader), health aggregator
3. **Data Plane** (per-node): OpenResty + Lua pipeline, config on disk, shared dicts
4. **BGP Layer** (per-PoP): FRR/MetalLB, anycast VIP, ECMP distribution
5. **Backends** (per-region): Application servers, databases, microservices

### P.4 Data flow descriptions

1. **Config flow:** Operator → wslctl CLI/UI → wslctl-api → etcd → (watch) → wslproxy-agent → local disk → OpenResty workers
2. **Traffic flow:** Client → DNS/BGP → PoP → WSLproxy → gateway pipeline → upstream → response → client
3. **Health flow:** OpenResty health check timer → shared dict → wslproxy-agent → etcd → wslctl-api (aggregation) → dashboard
4. **Failover flow:** Health degradation detected → global controller evaluates → DNS update + BGP withdrawal → traffic redirected
5. **Election flow:** Agent → etcd CAS on leader key → winner becomes leader → losers watch key → on leader failure → lease expires → re-election

### P.5 Failure scenarios

(Covered in detail in Sections B.5, E.2-E.9, and O.5-O.11)

Key failure scenarios and reactions:
1. **Backend dies** → health check removes it (5s), circuit breaker opens, retry to next backend
2. **Node dies** → BGP withdraws (10s), LB removes from pool, traffic to survivors
3. **Region dies** → Global controller detects (30s), DNS updated (60s), traffic to other region
4. **Control plane dies** → No impact on traffic, no config changes until restored
5. **etcd quorum lost** → Config writes fail, data plane continues, agents log warnings
6. **Split-brain** → etcd/Consul prevents dual-leader; minority partition serves stale config safely
7. **Config push fails** → Agents retry, drift detection catches divergence, alert fires

### P.6 Helm v4 packaging approach

(Covered in Section J.1)

- Single Helm chart `wslproxy-platform` with subcharts for etcd and Redis
- CRDs for WSLProxyCluster, WSLProxyConfig, WSLProxyUpstream, WSLProxyBGPPeer
- Environment-specific values files (values-staging.yaml, values-production.yaml)
- Sidecar model for agent (runs in same pod as WSLproxy)
- DaemonSet or Deployment for data plane (configurable)
- PodDisruptionBudget, anti-affinity, multi-zone spread

### P.7 Security model

(Covered in Section L)

- mTLS between all control plane components
- RBAC with 6 roles (super-admin through ci-bot)
- Signed config bundles (ed25519)
- Encrypted secrets in etcd (AES-256-GCM envelope encryption)
- BGP MD5 authentication + prefix filtering
- Per-PoP DDoS mitigation (rate limiting, connection limits, SYN cookies)
- 4-eyes approval for production config changes

### P.8 Phased delivery plan

(Covered in Section N)

| Phase | Duration | Key deliverable |
|-------|----------|----------------|
| 1. Single-region HA | Weeks 1-6 | `wslproxy-agent`, leader election, basic config sync |
| 2. Config sync | Weeks 7-12 | `wslctl-api`, versioned config, CLI, GitOps |
| 3. Failover | Weeks 13-18 | Circuit breaker, health checks, retry, drain |
| 4. Multi-region | Weeks 19-26 | DNS failover, regional leaders, global controller |
| 5. BGP | Weeks 27-34 | FRR/MetalLB, anycast VIP, BFD |
| 6. PoP + streaming | Weeks 35-44 | Streaming tuning, PoP playbooks, geo-routing |
| 7. Enterprise | Weeks 45-52 | UI overhaul, audit, RBAC, compliance |

### P.9 Risks and mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| etcd operational complexity | Medium | High | Provide managed etcd option, thorough runbooks, Consul as alternative |
| BGP misconfiguration | Medium | Critical | Prefix list templates, dry-run mode, lab testing before prod |
| Config sync race conditions | Low | Medium | Optimistic concurrency, idempotent applies, drift detection |
| Performance regression from agent overhead | Low | Medium | Agent is out-of-band (no per-request cost), benchmark each phase |
| Scope creep in UI/compliance (Phase 7) | High | Medium | Strict MVP scope, defer nice-to-haves to Phase 8 |
| Cross-region latency for etcd | Medium | Medium | Regional etcd read replicas, or per-region etcd with global sync |
| Team skill gap (Go, etcd, BGP) | Medium | High | Training plan, start with simpler phases, pair with experts |
| Migration of existing deployments | Medium | High | Parallel run period, gradual migration, standalone mode as fallback |
| Streaming workload capacity planning | Medium | Medium | Per-tenant connection limits, monitoring, autoscaling in K8s |

---

*End of proposal. This document should be reviewed by engineering leadership, network operations, security, and SRE teams before implementation begins.*
