# Build Prompt: `wslproxy-cli` (Go) — Admin CLI + MCP Client + CI Binary

> Copy this entire document into a coding agent / greenfield session as the system prompt.
> Goal: ship a **Go binary `wslproxy-cli`** that administers WSLProxy over its existing REST API (Swagger) and MCP server, with nginx/config health checks, dual auth (user/password or token), and a **GitHub Actions build on every `main` change**.

---

## 0. Mission

Build **`wslproxy-cli`** — a single static Go binary operators and AI agents use to:

1. **Administer all WSLProxy resources** via HTTP API (same surface as Admin UI / Swagger).
2. Authenticate with **username + password** (login → JWT) **or** a pre-issued **Bearer token** / MCP API key.
3. Act as an **MCP client** against the WSLProxy MCP server so agents can drive tools/resources efficiently (not only raw REST).
4. Run **common nginx / OpenResty tests and config checks** against one or many target servers via API (status, error logs, validate_config, health).
5. **Export → edit locally → push back** servers, rules, WAF (and related) configs in a bash-friendly loop for fast config testing.
6. Be built and published automatically whenever code lands on **`main`**.

Working module path (suggested): `github.com/bwalia/wslproxy/cmd/wslproxy-cli`  
(or a sibling repo `bwalia/wslproxy-cli` if you prefer a thin out-of-tree client — prefer **in-monorepo** under `cmd/wslproxy-cli/` + `internal/cli/` so it stays next to `html/swagger/openapi.yaml`.)

---

## 1. Non-negotiable design principles

### 1.1 API-first, Swagger-sourced

- **Source of truth for REST:** [`html/swagger/openapi.yaml`](../html/swagger/openapi.yaml) (served at `/swagger/` → `openapi.yaml`).
- Generate or hand-maintain a typed Go client from that OpenAPI (e.g. `oapi-codegen` / `openapi-generator`).
- OpenAPI today is **partial** (~43 paths). Also inventory live endpoints from `api/api.lua` and MCP docs; **extend OpenAPI** when the CLI needs an undocumented route — do not invent private backdoors.
- Default base URL examples:
  - Local: `http://127.0.0.1:8080` or `http://localhost:8280`
  - Lon1: `https://lon1.pop0.uk`
  - Pop1: `https://pop1.diytaxreturn.co.uk`
  - Pop0: `https://prod-our-v1.wslproxy.com`

### 1.2 Auth

Support both:

| Mode | How |
|------|-----|
| **Password** | `POST /api/user/login` with username/password → store JWT; send `Authorization: Bearer <token>` |
| **Token** | User supplies JWT (or long-lived token) via flag/env; no login call |
| **MCP API key** | When talking MCP JSON-RPC, send configured `mcp.api_key` header/query as the server expects (`api/mcp/auth.lua`) |

Config precedence: flags > env (`WSLPROXY_*`) > config file (`~/.config/wslproxy/cli.yaml` or `.wslproxy-cli.yaml`).

Never log passwords or raw tokens. Mask in `--verbose` debug output.

### 1.3 Multi-target

- `--server` / `--base-url` for one host.
- `--servers` / `--inventory` file (YAML/JSON list of `{name, base_url, profile}`) for fan-out checks (`health`, `nginx test`, `status`).
- Optional `--profile-id` / env profile header if API expects `profile_id` (match Admin UI behavior).

### 1.4 Agent-friendly

- Stable JSON output: `--output json|table|yaml` (default table for humans, json for scripts/agents).
- Exit codes: `0` ok, `1` usage, `2` auth, `3` API/HTTP, `4` validation failed, `5` partial multi-target failure.
- MCP client mode should be usable by Cursor/Claude/other agents without a TTY.

### 1.5 Config-as-files (export / edit / push) — first-class

Operators must be able to treat remote WSLProxy state like a local git working tree:

```bash
# pull → edit → push → verify
wslproxy-cli pull --dir ./wsl-staging --resources servers,rules,waf
$EDITOR ./wsl-staging/rules/prod/*.json
wslproxy-cli push --dir ./wsl-staging --dry-run
wslproxy-cli push --dir ./wsl-staging --yes
wslproxy-cli check nginx
```

Requirements:

- **Round-trip JSON** identical to API payloads (pretty-printed, stable key order optional but diffs must be readable).
- Directory layout mirrors mental model of `/opt/nginx/data/`:

```text
wsl-staging/
  meta.yaml                 # base_url, profile_id, pulled_at, resource set
  servers/<profile>/*.json
  rules/<profile>/*.json
  waf_rules/<profile>/*.json
  waf_policies/<profile>/*.json
  upstreams/<profile>/*.json   # when API supports
  pops/*.json                  # optional
```

- Filenames: prefer API `id` (e.g. `host:example.com.json`, `{uuid}.json`).
- **`pull` / `export`**: download current live config(s).
- **`push` / `apply` / `import`**: create or update remote from local files (PUT/POST as appropriate; upsert by `id`).
- **`--dry-run`**: show planned creates/updates/deletes without writing.
- **`--diff`**: unify-diff local file vs remote before push.
- **`--filter`**: glob / `--name` / `--id` / `--tag` to push a subset (fast iteration).
- **`--delete-missing`**: off by default; when on, delete remote resources absent from staging (dangerous — require `--yes`).
- Bash-friendly: write JSON to stdout with `-o json`, read from stdin with `-f -`, and support `jq` pipelines.
- Align with existing bulk paths where useful: `POST /api/projects/import`, `POST /api/push-data`, Admin JSON import/export — but prefer simple per-resource CRUD so local files stay editable.

---

## 2. Command surface (CLI UX)

Use **Cobra** (or equivalent) with this command tree (names can be shortened with aliases):

```text
wslproxy-cli
  auth login | logout | whoami | token
  server   list|get|create|update|delete|export|import|apply
  rule     list|get|create|update|delete|attach|export|import|apply
  upstream list|get|create|update|delete|export|import
  profile  list|get|...
  waf      rules|policies|events ...
           waf rules export|import|apply
           waf policies export|import|apply
  cache    status|stats|enable|disable|clear ...
  traffic  health|backends|weights|promote|rollback|topology
  varnish  deploy|purge|...
  ssl      list|get|...          # if exposed via API/MCP
  pop      list|get|create|update|delete
  dns      lookup|provision
  bookmark list|get|...
  settings get|...               # careful: secrets
  logs     errors|access         # via API / MCP get_error_logs
  status   openresty|health|ready|metrics
  check    nginx|config|health|all   # ★ composite ops checks
  pull     [--resources ...] [--dir]   # ★ bulk export to disk
  push     [--dir] [--dry-run] [--diff] [--filter] [--yes]  # ★ bulk apply
  apply    -f file.json|--dir ...      # alias family for single/multi file push
  mcp      tools|resources|call|manifest|jsonrpc
  version
```

Map CRUD verbs to OpenAPI `operationId`s where present (`getRules`, `getServers`, …).

### 2.1 Composite `check` commands (required)

These are the “common nginx tests and config checks via API”:

| Subcommand | Behavior |
|------------|----------|
| `check health` | `GET` healthz/ready (and/or `/api` ping) on each target; print latency + status |
| `check openresty` | `GET /api/openresty_status` (and related status) |
| `check config` | Prefer MCP tool `validate_config` and/or any REST equivalent; fail non-zero on invalid |
| `check logs` | Tail/filter recent errors via `/api/openresty/error_logs` or MCP `get_error_logs` |
| `check nginx` | Bundle: health + openresty_status + validate_config + optional reload dry-run |
| `check all` | Fan-out `check nginx` across inventory; summary table; exit 5 if any host fails |

Do **not** SSH into hosts for v1 unless explicitly flagged later — **API-only** against the admin/public health endpoints.

### 2.2 Easy push of servers / rules / WAF (required)

Make day-to-day config testing trivial:

| Goal | Command examples |
|------|------------------|
| Export everything useful | `wslproxy-cli pull -d ./cfg --resources servers,rules,waf_rules,waf_policies` |
| Export one server + its rules | `wslproxy-cli server export --id host:api.example.com -o ./cfg/servers/...` + `rule export --server host:api.example.com` |
| Edit & push one rule | `wslproxy-cli push -d ./cfg --filter 'rules/**/3cc63784*.json' --diff --yes` |
| Push WAF policy pack | `wslproxy-cli waf policies apply -d ./cfg/waf_policies/prod --yes` |
| Validate before push | `wslproxy-cli check config && wslproxy-cli push -d ./cfg --dry-run` |
| Promote staging → prod URL | `wslproxy-cli push -d ./cfg --base-url https://lon1.pop0.uk --yes` (same files, different target) |

**Upsert semantics**

1. If remote `GET /api/{resource}/{id}` exists → `PUT` update.
2. Else → `POST` create (preserve `id` in body when API allows).
3. Print a result line per file: `CREATE|UPDATE|SKIP|FAIL path → id`.
4. After push, optional `--verify` re-GETs and diffs (fail if drift).

**Attach servers ↔ rules**

- When pushing rules that reference servers (or vice versa), support `--link` / `rule attach --server … --rule …` so bash scripts can recreate bindings after import (match Admin + MCP `attach_rule`).

**Safety**

- Prod base URLs: require `--yes` for `push`/`apply` unless `WSLPROXY_ASSUME_YES=1` (CI only).
- Never push `settings.json` secrets unless explicit `push --resources settings --i-understand-secrets`.
- Redact known secret fields in `pull --sanitize` mode (optional) for sharing fixtures.

### 2.3 Bash scripting patterns (document + support)

Ship examples under `cmd/wslproxy-cli/examples/` (or `docs/wslproxy-cli/examples/`):

```bash
#!/usr/bin/env bash
# examples/roundtrip-rule.sh — export, tweak priority, push, check
set -euo pipefail
BASE="${WSLPROXY_BASE_URL:-https://lon1.pop0.uk}"
DIR="$(mktemp -d)"
trap 'rm -rf "$DIR"' EXIT

wslproxy-cli pull -d "$DIR" --base-url "$BASE" --resources rules \
  --filter 'name=k3s1api*'   # or --id …

# mutate with jq (CLI must not break jq round-trips)
jq '.priority = 10' "$DIR"/rules/prod/*.json > "$DIR"/tmp.json
mv "$DIR"/tmp.json "$DIR"/rules/prod/"$(basename "$DIR"/rules/prod/*.json)"

wslproxy-cli push -d "$DIR" --base-url "$BASE" --dry-run --diff
wslproxy-cli push -d "$DIR" --base-url "$BASE" --yes
wslproxy-cli check nginx --base-url "$BASE"
```

```bash
#!/usr/bin/env bash
# examples/push-server-bundle.sh — server + rules + waf policy
wslproxy-cli push -d ./bundles/my-app \
  --resources servers,rules,waf_policies \
  --base-url "$BASE" --yes --verify
```

Stdout contracts for scripting:

- `pull` / `push` support `--output json` summary: `{ "created":[], "updated":[], "failed":[] }`.
- Individual `get` writes pure resource JSON to stdout when `-o json` (no table chrome) so `wslproxy-cli rule get --id X -o json | jq . > rule.json` works.
- `apply -f rule.json` reads one file or `-f -` from stdin.

### 2.4 MCP client (required)

Talk to the existing WSLProxy MCP HTTP surface (see OpenAPI tag **MCP** and `api/mcp/`):

| Endpoint | Use |
|----------|-----|
| `/mcp/manifest` | Discover server |
| `/mcp/capabilities` | Feature flags |
| `/mcp/resources` | List resources |
| `/mcp/resources/{id}` | Read resource |
| `/mcp/tools` | List tools |
| `/mcp/tools/{toolName}` | Tool schema |
| `/mcp/schemas` | Schemas |
| `/mcp/jsonrpc` | JSON-RPC 2.0 (`tools/call`, etc.) |

Implement:

```bash
wslproxy-cli mcp manifest
wslproxy-cli mcp tools
wslproxy-cli mcp call validate_config --args '{}'
wslproxy-cli mcp resources
wslproxy-cli mcp resource servers
```

Known MCP tools today (from `api/mcp/tools.lua` — keep in sync):

`validate_config`, `get_error_logs`, `reload_config`, `bind_waf_policy`, `unbind_waf_policy`, `test_waf_rule`, `update_traffic_split`, `promote_backend`, `rollback_backend`, `deploy_varnish`, `purge_varnish`, `create_server`, `create_rule`, `attach_rule`, `update_server`, `update_rule`, `delete_server`, `delete_rule`, `list_pops`, `get_pop`, `create_pop`, `update_pop`, `delete_pop`, `lookup_dns`, `provision_dns`

Honor server modes: `mcp.enabled`, `read-only` vs `write`, `tools_enabled`, rate limits. Default CLI MCP calls to **read-only** unless `--write` / explicit destructive confirmation (`--yes`).

Optional: expose the CLI itself as a thin **stdio MCP server** that proxies to remote WSLProxy MCP (so Cursor can attach `wslproxy-cli mcp-stdio --base-url …`). Nice-to-have phase 2; REST+HTTP MCP client is phase 1.

---

## 3. REST coverage (minimum viable)

From current OpenAPI + Admin API (extend as needed):

**Auth:** `POST /api/user/login`  
**Core CRUD:** servers, rules, profiles, waf_rules, waf_policies, waf_events, bookmarks  
**Cache:** status/config/stats/enable/disable/clear  
**Traffic:** topology, backends, weights, promote, rollback, health  
**Ops:** `GET /api/openresty_status`, error logs, push-data  
**MCP:** paths under `/mcp/*`

Also support query flags used by the UI: `profile_id`, pagination, `q` search — pass through to API.

---

## 4. Suggested Go layout

```text
cmd/wslproxy-cli/main.go
internal/cli/
  root.go
  auth.go
  server.go
  rule.go
  check.go
  mcp_client.go
  config.go
  output.go
internal/api/          # generated or wrapped OpenAPI client
internal/mcp/          # JSON-RPC client
internal/inventory/
.gitignore
Makefile               # build, test, generate
.github/workflows/build-wslproxy-cli.yml
docs/wslproxy-cli.md   # user docs (after impl)
```

Stack suggestions:

- Go 1.22+
- `spf13/cobra`, `spf13/viper`
- `net/http` + generated client
- `charmbracelet/lipgloss` optional for tables (keep deps lean)
- Static binary: `CGO_ENABLED=0`

---

## 5. CI/CD — build on `main` (required)

Add workflow **`.github/workflows/build-wslproxy-cli.yml`**:

**Triggers**
```yaml
on:
  push:
    branches: [main]
    paths:
      - 'cmd/wslproxy-cli/**'
      - 'internal/cli/**'
      - 'internal/api/**'
      - 'internal/mcp/**'
      - 'html/swagger/openapi.yaml'
      - 'go.mod'
      - 'go.sum'
      - '.github/workflows/build-wslproxy-cli.yml'
  pull_request:
    paths: [same as above]
  workflow_dispatch:
```

Also allow building when OpenAPI changes even if CLI code unchanged (regenerate client).

**Jobs**
1. `test` — `go test ./...`, `go vet`
2. `build` — matrix:
   - `linux/amd64`, `linux/arm64`
   - `darwin/amd64`, `darwin/arm64`
   - optional `windows/amd64`
3. Upload artifacts named `wslproxy-cli_<version>_<os>_<arch>[.exe]`
4. On `push` to `main` only: attach artifacts to a **GitHub Release** tag `cli-vX.Y.Z` **or** rolling release `wslproxy-cli-latest` (pick one; prefer semver from `git describe` / version file).
5. Optional: `goreleaser` for checksums + SBOM.

Version inject via ldflags:
`-X main.version=… -X main.commit=… -X main.date=…`

**Path filter note:** User asked for build “as soon as changes are made in the main branch”. Prefer:
- Always run build job on **any** `main` push that touches CLI/OpenAPI **or**
- Additionally a lightweight `main` push workflow that builds CLI when `cmd/wslproxy-cli` exists (even if only OpenAPI changed).

If the CLI lives in-repo from day one, also run the workflow on first merge that adds it.

---

## 6. Config file example

```yaml
# ~/.config/wslproxy/cli.yaml
base_url: https://lon1.pop0.uk
profile_id: prod
auth:
  # either:
  token: ""           # or env WSLPROXY_TOKEN
  # or:
  username: admin
  # password via WSLPROXY_PASSWORD only
mcp:
  api_key: ""         # env WSLPROXY_MCP_API_KEY
  write: false
inventory:
  - name: lon1
    base_url: https://lon1.pop0.uk
  - name: pop1
    base_url: https://pop1.diytaxreturn.co.uk
  - name: pop0
    base_url: https://prod-our-v1.wslproxy.com
output: table
```

---

## 7. Testing requirements

1. **Unit tests** for auth token refresh/store, URL join, exit codes.
2. **Contract tests** against recorded OpenAPI fixtures (httptest).
3. **Integration** (optional, labeled): against local Docker `./dev.sh` admin port.
4. **Check suite golden tests:** mock `/healthz`, `/api/openresty_status`, MCP `validate_config`.
5. Document destructive MCP tools as requiring `--yes`.

---

## 8. Security

- No secrets in git or CI logs.
- Prefer keyring / env for passwords.
- TLS verify on by default; `--insecure` for lab only.
- Respect MCP read-only mode; refuse write tools unless enabled server-side **and** CLI `--write`.

---

## 9. Phased delivery

### Phase 0 — Skeleton + CI
- `cmd/wslproxy-cli`, cobra root, `version`, config load
- Workflow builds multi-arch artifacts on `main`
- `auth login` + `status health`

### Phase 1 — Core admin + export/push
- servers/rules CRUD from OpenAPI
- `pull` / `push` / `apply` for **servers + rules** (dir layout + dry-run + diff)
- `check health|openresty|config|nginx`
- JSON output + bash examples (`roundtrip-rule.sh`)

### Phase 2 — WAF + MCP client
- `pull`/`push` for **waf_rules + waf_policies**
- manifest/tools/resources/jsonrpc call
- wire `validate_config`, `get_error_logs`, traffic tools

### Phase 3 — Full surface + inventory
- cache, traffic, pops, dns, varnish, upstreams
- multi-target `check all` + `push` to inventory hosts
- docs + shell completion (`cobra completion`)
- more examples: `push-server-bundle.sh`, `sync-from-pop0-to-lon1.sh` (explicit two-base-url flow)

### Phase 4 (optional)
- stdio MCP proxy for agents
- OpenAPI codegen in CI when `openapi.yaml` changes
- `projects import` / `push-data` bulk wrappers for large migrations

---

## 10. First deliverable expected from the agent

1. Scaffold Go module + cobra CLI with `auth login`, `status health`, `check nginx`.
2. Generate or wrap client from `html/swagger/openapi.yaml`.
3. Implement **`pull` / `push --dry-run` / `push --yes`** for servers and rules (directory layout above).
4. Add `.github/workflows/build-wslproxy-cli.yml` that builds on `main` pushes (path-filtered) and uploads artifacts.
5. README + `examples/roundtrip-rule.sh`: login → pull → jq edit → push → check.
6. Do not modify Lua gateway behavior unless OpenAPI must be extended for a missing check endpoint — prefer MCP `validate_config`.

---

## 11. Context sources in this monorepo

| Path | Why |
|------|-----|
| `html/swagger/openapi.yaml` | REST + MCP HTTP contract |
| `html/swagger/swagger.html` | Human API browser |
| `api/api.lua` | Full REST dispatcher (fill OpenAPI gaps) |
| `api/mcp/` | MCP tools, auth, resources |
| `docs/mcp.md` / `docs/mcp-gateway.md` | MCP behavior |
| `CLAUDE.md` | Product architecture & auth notes |
| Admin UIs | UX parity for resource names |

---

## 12. Success definition

Success = a released **`wslproxy-cli` binary** such that:

```bash
wslproxy-cli auth login --base-url https://lon1.pop0.uk -u admin
wslproxy-cli server list --output json
wslproxy-cli pull -d ./cfg --resources servers,rules,waf_rules,waf_policies
# edit files or jq …
wslproxy-cli push -d ./cfg --dry-run --diff
wslproxy-cli push -d ./cfg --yes --verify
wslproxy-cli check nginx --base-url https://lon1.pop0.uk
wslproxy-cli mcp call validate_config
wslproxy-cli check all --inventory ~/.config/wslproxy/inventory.yaml
```

…and every push to **`main`** that touches the CLI/OpenAPI produces downloadable multi-arch artifacts via GitHub Actions without manual release steps.

Build it API-first, keep auth dual-mode, make **export → bash/jq edit → push** the happy path for config testing, prefer MCP for agent efficiency, and never SSH when the public Admin/MCP API can answer.
