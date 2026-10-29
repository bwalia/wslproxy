# Build Prompt: `wslproxy-dns-failover` — Health-Aware DNS Failover Controller

> Copy this entire document into a coding agent / greenfield session as the system prompt.
> Goal: ship a **small Go service** that watches WSLProxy edge health and **automatically rewrites DNS** so a hostname fails over from primary POP (lon1) to secondary POP (lon2/pop0) when the primary is down — then fails back when healthy again.

---

## 0. Mission

Build **`wslproxy-dns-failover`** (working name; binary: `wslproxy-dns-failover`) that:

1. **Actively health-checks** configured edge POPs (start with lon1 + lon2).
2. Applies a **failover policy** (primary → secondary, hysteresis, fail-open rules).
3. **Updates authoritative DNS** via provider API (Cloudflare first) so the public name resolves only to the healthy edge.
4. Exposes **its own** `/healthz`, `/ready`, `/metrics`, and a small status API for operators / Grafana.
5. Is **safe by default**: dry-run mode, audit log of every DNS mutation, no flapping, never deletes unmanaged records.
6. Deploys as a **systemd unit or container** on a control host (not on the edges themselves — checks must be external).

**Pilot hostname:** `abtesting.fictionally.org`  
**Primary:** lon1 (`lon1.pop0.uk` → `195.20.255.201`)  
**Secondary:** lon2 / pop0 (`lon2.pop0.uk` → `85.190.106.189`)

Today that name is a **static CNAME → lon2** with **no** health-based failover. This service replaces that static pin with policy-driven DNS.

Working layout (prefer in-monorepo):

```
cmd/wslproxy-dns-failover/main.go
internal/dnsfailover/
  config.go
  health/
  policy/
  provider/          # Cloudflare first; interface for PowerDNS later
  apply/
  audit/
  api/               # status + metrics HTTP
deploy/dns-failover/ # systemd unit, example config, docker-compose snippet
docs/dns-failover.md # operator runbook (short)
```

Related existing docs (read, do not reinvent blindly):

- [`POPS_AND_DNS_GUIDE.md`](../POPS_AND_DNS_GUIDE.md) — POP inventory + Cloudflare provisioner (static multi-A; **not** health failover)
- [`infra/edge-sync/README.md`](../infra/edge-sync/README.md) — lon1 → pop0 config mirror (failover *capacity*)
- [`docs/architecture/WSLPROXY-HA-PLATFORM-PROPOSAL.md`](architecture/WSLPROXY-HA-PLATFORM-PROPOSAL.md) — `dns-manager` sketch
- Existing Lua DNS provisioner: `api/dns_manager.lua` (operator-driven provision; **orthogonal** — do not merge into the Lua request path)

---

## 1. Non-negotiable design principles

### 1.1 DNS failover ≠ traffic proxy

This service **only** changes DNS answers. It does **not** terminate HTTP, load-balance requests, or run inside OpenResty workers.

Clients discover the new IP only after **TTL + recursive cache** expire. Document expected RTO: roughly `2–3 × TTL` under typical resolvers (e.g. TTL 30s → ~60–90s).

### 1.2 External health checks

Health probes **must not** run only on the POP under test (a dying box cannot mark itself dead). Run the controller on:

- a third host, or
- both edges **cross-checking each other** (lon1 checks lon2 and vice versa) with quorum — MVP may be single controller + clear SPOF docs.

### 1.3 Cloudflare-first, provider-pluggable

```go
type Provider interface {
    GetRecords(ctx context.Context, zone, name string) ([]Record, error)
    UpsertA(ctx context.Context, zone, name string, ips []net.IP, ttl int, comment string) error
    UpsertCNAME(ctx context.Context, zone, name, target string, ttl int, comment string) error
}
```

MVP: **Cloudflare DNS API** (`dns_records`).  
Later: PowerDNS, Route53 — same interface.

### 1.4 Only touch managed records

Every record written MUST carry a comment/marker, e.g.:

```
wslproxy-dns-failover | hostname=abtesting.fictionally.org | policy=lon1-primary | v=1
```

- Never delete/modify records lacking this marker (same safety idea as `wslproxy-managed` in POP provisioning).
- Prefer **A records** for failover (one or more healthy POP IPs). Avoid CNAME-to-edge if dual-A is clearer; if the pilot stays CNAME, failover means rewriting CNAME target `lon1.pop0.uk` ↔ `lon2.pop0.uk`.

**Recommendation for MVP:** publish **A** records to the POP `public_ipv4` values (not CNAME), TTL 30. Simpler health mapping IP ↔ POP.

### 1.5 Fail-open and anti-flap

| Situation | Action |
|-----------|--------|
| Primary healthy | DNS = primary only (or primary+secondary if `mode: active-active`) |
| Primary unhealthy, secondary healthy | DNS = secondary only; emit failover event |
| Both unhealthy | **Do not blank DNS.** Keep last-known-good set; alert loudly (`fail_open: last_good`) |
| Secondary unhealthy, primary healthy | stay/restore primary |
| Oscillation | require `N` consecutive failures before failover and `M` consecutive successes before failback |

### 1.6 Secrets

- Cloudflare API token from env / SOPS / file — **never** commit.
- Align with `infra/secrets/` patterns (`SOPS_AGE_KEY`, etc.). Document which GitHub secret / host path holds `CF_API_TOKEN`.
- Token scope: Zone → DNS → Edit on `fictionally.org` only (principle of least privilege).

### 1.7 Observability

Prometheus metrics (mandatory):

- `wslproxy_dns_failover_pop_up{pop,hostname}` (gauge 0/1)
- `wslproxy_dns_failover_state{hostname}` (gauge or info: primary/secondary/degraded)
- `wslproxy_dns_failover_transitions_total{hostname,from,to,reason}`
- `wslproxy_dns_failover_dns_apply_total{hostname,result}`
- `wslproxy_dns_failover_probe_latency_seconds{pop}`
- `wslproxy_dns_failover_last_success_unixtime`

Structured JSON logs for every probe decision and DNS apply (NDJSON to stdout + optional file under `/var/log/wslproxy/`).

---

## 2. Domain model

### 2.1 Config file (YAML)

Example `config.yaml`:

```yaml
listen: ":9119"          # status + metrics
dry_run: false           # true = log planned DNS writes, do not call CF
interval: 10s            # probe period
probe_timeout: 3s
consecutive_fail: 3      # → mark POP down
consecutive_ok: 3        # → mark POP up / allow failback
ttl: 30
provider:
  type: cloudflare
  # api_token from env CF_API_TOKEN
  zone_name: fictionally.org
  # optional zone_id if known

pops:
  lon1:
    display_name: "London lon1"
    public_ipv4: "195.20.255.201"
    health_urls:
      - "https://lon1.pop0.uk/healthz"
      # optional second signal:
      # - "https://195.20.255.201/healthz"  # with SNI/Host if needed
  lon2:
    display_name: "London lon2/pop0"
    public_ipv4: "85.190.106.189"
    health_urls:
      - "https://lon2.pop0.uk/healthz"

hostnames:
  - name: abtesting.fictionally.org
    mode: active-passive          # or active-active
    primary: lon1
    secondary: lon2
    record_type: A                # A | CNAME
    # if CNAME: cname_targets: { lon1: lon1.pop0.uk, lon2: lon2.pop0.uk }
    proxied: false                # Cloudflare grey-cloud; do NOT orange-cloud unless intentional
    enabled: true
```

### 2.2 Health probe semantics

A POP is **up** iff **all** configured `health_urls` return HTTP 2xx within `probe_timeout` (configurable `require: all|any`, default `all`).

Use:

- HTTPS with normal cert verify by default.
- Optional `insecure_skip_verify` only for IP probes with Host header — document risk.
- Optional Host-header probe against raw IP for “edge up even if admin hostname broken”.

Canonical edge health today: **`/healthz`** (and legacy `/health`) on the admin/OpenResty listener — see nginx templates. Prefer `https://lon1.pop0.uk/healthz` and `https://lon2.pop0.uk/healthz`.

Do **not** treat origin app health (k3s NodePort) as the edge health signal for DNS failover of the edge hostname.

### 2.3 Desired DNS state algorithm (active-passive)

```
if primary.up:
  desired_ips = [primary.ipv4]
elif secondary.up:
  desired_ips = [secondary.ipv4]
else:
  desired_ips = last_applied_ips   # fail-open
  alert = both_down
```

`active-active`: union of all up POP IPs in configured order; if none up → last_applied.

Idempotent apply: if Cloudflare already matches desired set + TTL + marker, no-op (still update metrics).

### 2.4 Failback

When primary returns to up for `consecutive_ok` probes, switch DNS back to primary. Optional `failback_delay: 2m` to soak.

---

## 3. Cloudflare provider details

- API: `https://api.cloudflare.com/client/v4`
- Resolve zone id from `zone_name` if not configured.
- List DNS records filtered by `name` = FQDN.
- For A mode:
  - Ensure exactly the desired A set for **managed** records.
  - Delete managed A records whose IP is not desired.
  - Create missing desired A records with comment marker, `ttl`, `proxied: false`.
- For CNAME mode:
  - Single CNAME to `lon1.pop0.uk` or `lon2.pop0.uk`.
  - Do not leave both A and CNAME (DNS conflict) — purge managed A if switching to CNAME.
- Handle CF rate limits with backoff + retry.
- Surface CF error codes clearly in logs (`10000` auth, etc. — see POPS guide).

Reuse mental model from POP provisioner comments, but use a **distinct** marker (`wslproxy-dns-failover`) so static provisioner and failover controller do not fight. Document: a hostname should be managed by **either** Preview&Provision multi-A **or** this failover controller, not both.

---

## 4. HTTP API (controller itself)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/healthz` | Process up |
| GET | `/ready` | Config loaded + provider reachable (optional CF zone get) |
| GET | `/metrics` | Prometheus |
| GET | `/v1/status` | JSON: per-hostname state, per-POP up/down, last transition, dry_run |
| POST | `/v1/hostnames/{name}/failover` | Manual force secondary (operator break-glass) |
| POST | `/v1/hostnames/{name}/failback` | Manual force primary |
| POST | `/v1/hostnames/{name}/reconcile` | Force DNS reconcile now |

Protect mutating endpoints with a shared bearer token (`FAILOVER_API_TOKEN`) or bind to localhost only in MVP.

---

## 5. CLI / ops

```bash
# dry-run once
wslproxy-dns-failover --config /etc/wslproxy/dns-failover.yaml --once --dry-run

# run daemon
wslproxy-dns-failover --config /etc/wslproxy/dns-failover.yaml

# show status
curl -s localhost:9119/v1/status | jq .
```

Exit codes for `--once`: `0` ok, `2` config/auth, `3` DNS apply failed, `4` both POPs down (still fail-open).

---

## 6. Deployment

### 6.1 Where to run

Suggested MVP: **systemd on a control host** that is not lon1/lon2, **or** on lon2 checking lon1 (and accept degraded if lon2 dies — document). Prefer a third machine / the GitHub self-hosted runner host only if always-on.

### 6.2 Artifacts

- `deploy/dns-failover/wslproxy-dns-failover.service`
- `deploy/dns-failover/config.example.yaml`
- Optional Docker image in existing CI patterns
- Ansible task optional (follow-up); MVP can be manual install docs

### 6.3 CI

- `go test ./...` unit tests for policy + Cloudflare client (mocked HTTP)
- GitHub Actions workflow: build binary on `main` (mirror `wslproxy-cli` style if present)

---

## 7. Test plan (must pass before calling done)

### 7.1 Unit

- Policy: primary up → desire primary; primary down secondary up → secondary; both down → last_good; hysteresis requires N fails.
- Cloudflare client: upsert/create/delete only marked records; ignore foreign records.

### 7.2 Integration (staging / pilot)

1. Set `dry_run: true`, run against real `/healthz` — status shows correct POP health.
2. Point a **test** name (e.g. `abtesting-failover-test.fictionally.org`) at lon1 A via the controller (not production traffic first).
3. Simulate lon1 down (block probe URL with nftables / stop OpenResty briefly **only on a maintenance window**, or mock health in a test harness).
4. Assert within `consecutive_fail * interval` the CF record flips to lon2 IP.
5. Restore lon1; assert failback after `consecutive_ok` (+ optional delay).
6. Confirm TTL ≤ 30 and dig from `1.1.1.1` / `8.8.8.8` eventually follows.
7. Confirm unmarked hand-curated records on the same zone are untouched.

### 7.3 Production cutover for `abtesting.fictionally.org`

1. Inventory current CF record (today: CNAME → `lon2.pop0.uk`).
2. Enable controller in dry-run; verify desired state.
3. Apply once; replace CNAME with managed A(s); verify HTTPS still works.
4. Enable daemon; document runbook for manual failover endpoints.
5. Optional chaos: controlled lon1 drain drill.

---

## 8. Explicit non-goals (MVP)

- Building a full authoritative DNS server (PowerDNS/CoreDNS) — provider API only.
- Cloudflare Load Balancing product / orange-cloud proxy / WAF at CF layer.
- BGP / anycast.
- Merging into `api/dns_manager.lua` request path or Admin UI (UI status page is a follow-up).
- Automatic POP discovery from `data/pops` — config YAML is enough for MVP (optional later: read POP JSON from disk/API).
- GeoDNS / latency steering.

---

## 9. Implementation order (agent checklist)

1. Scaffold Go module under `cmd/wslproxy-dns-failover` + config load.
2. Implement health prober + hysteresis state machine + unit tests.
3. Implement Cloudflare provider with record marker safety + unit tests (httptest).
4. Wire reconcile loop + dry-run + NDJSON audit.
5. Add `/healthz` `/metrics` `/v1/status` + manual failover hooks.
6. Example config + systemd unit + short `docs/dns-failover.md` runbook.
7. Pilot against a test hostname; then document cutover for `abtesting.fictionally.org`.

---

## 10. Acceptance criteria

- [ ] Binary runs with YAML config and `CF_API_TOKEN`.
- [ ] `dry_run` never mutates Cloudflare.
- [ ] Active-passive failover lon1 → lon2 on sustained `/healthz` failure.
- [ ] Automatic failback with anti-flap.
- [ ] Both-down keeps last DNS set and alerts via metric/log.
- [ ] Only marker-owned records are changed.
- [ ] Prometheus metrics + `/v1/status` reflect reality.
- [ ] Runbook explains TTL-bound RTO and how to force failover manually.
- [ ] Pilot hostname documented; production cutover steps listed (not necessarily executed by the agent unless asked).

---

## 11. Suggested first commit message

```
feat(dns-failover): add health-aware Cloudflare DNS failover controller

Watch lon1/lon2 /healthz and rewrite managed A records for pilot
hostnames (active-passive) with dry-run, anti-flap, and fail-open.
```

---

## 12. One-paragraph pitch (for PR / Slack)

> We are adding `wslproxy-dns-failover`: a tiny external Go controller that probes edge `/healthz`, and when lon1 stays down, rewrites Cloudflare DNS for selected hostnames to lon2’s IP (and fails back when lon1 recovers). Edge-sync already mirrors config; this closes the gap so clients actually **find** the healthy edge without Cloudflare Load Balancing, with explicit TTLs, audit, and fail-open behaviour.
