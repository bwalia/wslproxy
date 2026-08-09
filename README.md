# WSLProxy

**Dynamic API gateway & reverse proxy** on OpenResty — route, secure, and observe traffic from JSON/MCP configs that take effect **without reloading nginx** for rules.

Operators manage virtual hosts, rules, WAF, cache, traffic splits, and edge POPs from an Admin UI, REST API, MCP tools, or the `wslproxy-cli` container. Built for multi-POP edges, GitOps-style config, and AI agents.

| | |
|---|---|
| Site | [wslproxy.org](https://wslproxy.org) (GitHub Pages) · [wslproxy.com](https://wslproxy.com) |
| Swagger | [wslproxy.org/swagger/](https://wslproxy.org/swagger/) |
| Repo | [github.com/bwalia/wslproxy](https://github.com/bwalia/wslproxy) |
| CLI image | `ghcr.io/bwalia/wslproxy-cli:latest` |

Landing + Swagger are published from `html/` by [`.github/workflows/deploy-pages.yml`](.github/workflows/deploy-pages.yml) on every `main` change to those paths (same pattern as ring-promoter).

---

## What it is

WSLProxy sits in front of your origins and decides **per request** what happens: proxy (305), redirect, static block, CAPTCHA, WAF, cache, canary split, geo/IP/JWT match — using rules loaded live from disk or Redis.

```mermaid
flowchart LR
  C[Clients] --> E[WSLProxy edge<br/>OpenResty + Lua]
  E --> O[Origins / k3s / APIs]
  A[Admin UI · REST · MCP · CLI] -.-> E
  subgraph live["Hot path — no nginx reload"]
    R[Rules JSON]
    W[WAF policies]
    T[Traffic split]
  end
  R -.-> E
  W -.-> E
  T -.-> E
```

**Reload only when server-level nginx conf changes** (new listen/SSL block). Rules, WAF, and most routing are evaluated every request.

---

## Capabilities (today)

| Area | What you get |
|------|----------------|
| **Routing** | Path / IP / country / JWT / S3 / cookie match → proxy, redirect, HTML, CAPTCHA; priority + specificity tie-break |
| **Traffic** | Weighted / RR / header canary / cookie sticky / least-conn; promote & rollback backends |
| **WAF** | Policy packs, anomaly scoring, monitor/block, events API — see [docs/WAF_ENGINE_V2.md](docs/WAF_ENGINE_V2.md) |
| **SSL** | auto-ssl / Let's Encrypt, per-domain SSL JSON, force HTTPS |
| **Cache** | Edge static cache + optional Docker blob cache; Varnish hooks |
| **POPs + DNS** | Declare edge locations; Cloudflare A-record provisioning with safety guardrails — [POPS_AND_DNS_GUIDE.md](POPS_AND_DNS_GUIDE.md) |
| **Control plane** | React Admin + Next.js dashboard, Swagger REST, MCP (Claude/Cursor), `wslproxy-cli` |
| **Deploy** | Docker Compose (dev), Ansible (bare metal / VM), Helm ingress-controller (k3s) |
| **Observability** | `/health` `/healthz` `/ready` `/metrics`, traffic stats, AI log analysis hooks |

---

## Architecture

```mermaid
flowchart TB
  subgraph clients["Clients"]
    B[Browser / API / Agents]
  end

  subgraph edge["WSLProxy POP"]
    direction TB
    NGX[OpenResty]
    ACK[gateway_ack.lua<br/>match rules]
    RESP[gateway_resp.lua<br/>backend + timeouts]
    BAL[balancer_by_lua]
    NGX --> ACK --> RESP --> BAL
  end

  subgraph control["Control plane"]
    UI[Admin UI]
    API["/api/*"]
    MCP["/mcp/*"]
    CLI[wslproxy-cli]
    UI --> API
    CLI --> API
    CLI --> MCP
    MCP --> API
  end

  subgraph data["Config store"]
    D["data/servers · rules · waf_* · ssl"]
  end

  B --> NGX
  control --> D
  ACK --> D
  BAL --> ORG[Origins / ingress / apps]
```

**Two-layer prod pattern (common):** public POP → k3s NodePort → `wslproxy-ingress` Helm chart → app pods. Tune timeouts on **both** layers.

More diagrams (Draw.io): [docs/diagrams/](docs/diagrams/).

---

## Quick start

### Docker (local)

```bash
git clone https://github.com/bwalia/wslproxy.git && cd wslproxy
./dev.sh -n -j "$(openssl rand -hex 24)"
# Admin: http://localhost:8280   API: http://localhost:8280/api   Health: /health
```

Or compose: `docker-compose -f docker-compose-local.yml up` (see [DOCKER.md](DOCKER.md)).

### CLI in CI (no Go install)

```bash
docker run --rm \
  -e WSLPROXY_BASE_URL=https://your-pop.example \
  -e WSLPROXY_TOKEN \
  ghcr.io/bwalia/wslproxy-cli:latest check nginx -o json
```

Docs: [docs/wslproxy-cli.md](docs/wslproxy-cli.md) · examples under `examples/wslproxy-cli/`.

### Login + pull / push config

```bash
wslproxy-cli auth login --base-url https://lon1.pop0.uk -u you@example.com
wslproxy-cli pull -d ./cfg --resources servers,rules,waf_rules,waf_policies
# edit JSON or jq …
wslproxy-cli push -d ./cfg --dry-run --diff
wslproxy-cli push -d ./cfg --yes --verify
```

---

## Request pipeline (simplified)

```mermaid
sequenceDiagram
  participant C as Client
  participant N as OpenResty
  participant A as gateway_ack
  participant R as gateway_resp
  participant U as Upstream

  C->>N: HTTPS request
  N->>A: rewrite_by_lua
  A->>A: load server + rules<br/>match + WAF / rate limit
  A->>R: selectedRule in ngx.ctx
  R->>R: 200/301/302/305/306/403
  alt code 305 proxy
    R->>U: balancer peer + timeouts
    U-->>C: origin response
  else redirect / block / captcha
    R-->>C: terminal response
  end
```

---

## Repository map

| Path | Role |
|------|------|
| `api/` | Lua gateway + REST + MCP (hot-reloaded) |
| `data/` | Servers, rules, WAF, SSL JSON (per env profile) |
| `openresty-admin/` | React Admin UI |
| `openresty-admin-next/` | Next.js ops dashboard |
| `html/` | Public landing + swagger |
| `cmd/wslproxy-cli/` | Go CLI + Dockerfile |
| `infra/ansible/` | Production deploy (OpenResty build, nginx, data, UIs) |
| `ingress-controller/` | k3s Helm ingress chart |
| `docs/` | Guides (MCP, WAF, CLI, diagrams) |

Developer deep-dive: [CLAUDE.md](CLAUDE.md).

---

## Deploy paths

```mermaid
flowchart LR
  DEV[Docker Compose<br/>./dev.sh] --> INT[Ansible → int]
  INT --> TEST[Ansible → test]
  TEST --> PROD[Ansible → prod POPs]
  K3S[Helm wslproxy-ingress<br/>manual upgrade] --> APPS[App Ingresses]
  PROD --> K3S
```

- **Delivery pipeline:** `.github/workflows/deploy-wslproxy-delivery-pipeline.yml` (int → smoke → test → prod)
- **CLI binaries + image:** `.github/workflows/build-wslproxy-cli.yml` → GHCR + release `wslproxy-cli-latest`
- Ansible playbook: `infra/ansible/wslproxy-ops.yml`

---

## MCP (AI agents)

Enable in `data/settings.json` → `mcp`. Endpoints: `/mcp/manifest`, `/mcp/tools`, `/mcp/jsonrpc`.

Tools include `validate_config`, CRUD for servers/rules, WAF bind, traffic promote/rollback, POPs/DNS — see [docs/mcp.md](docs/mcp.md) and [api/mcp/README.md](api/mcp/README.md).

---

## Documentation index

| Doc | Topic |
|-----|--------|
| [docs/wslproxy-cli.md](docs/wslproxy-cli.md) | CLI + Docker CI usage |
| [docs/WAF_ENGINE_V2.md](docs/WAF_ENGINE_V2.md) | WAF engine |
| [docs/mcp.md](docs/mcp.md) / [mcp-gateway.md](docs/mcp-gateway.md) | MCP |
| [POPS_AND_DNS_GUIDE.md](POPS_AND_DNS_GUIDE.md) | POPs & Cloudflare DNS |
| [DOCKER.md](DOCKER.md) / [DOCKER-DEPLOYMENT.md](DOCKER-DEPLOYMENT.md) | Containers |
| [docs/diagrams/](docs/diagrams/) | Draw.io architecture set |
| [examples/wslproxy-waf-demo/](examples/wslproxy-waf-demo/) | WAF demo pack |

---

## Local URLs (`./dev.sh`)

| Service | URL |
|---------|-----|
| Admin | http://localhost:8280 |
| API / Swagger | http://localhost:8280/api · /swagger/ |
| Health | http://localhost:8280/health |
| Proxy HTTP/HTTPS | http://localhost:8180 · https://localhost:8443 |

---

## Contributing

PRs against `main`. Prefer small, focused changes. Do not commit real `settings.json` secrets or `.env` credentials.

## License

See repository license file.
