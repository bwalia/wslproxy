# WSLProxy — Claude Developer Guide

This document captures the architecture, conventions, and gotchas of the WSLProxy codebase so future Claude sessions can be productive without re-exploring from scratch.

---

## 1. What Is This Product?

**WSLProxy** is a dynamic API gateway / reverse proxy built on OpenResty (nginx + Lua). It lets operators manage servers (virtual hosts) and rules (routing decisions) via a React admin UI. Changes to rules take effect **without reloading OpenResty** — rules are evaluated at request time from JSON files on disk (or Redis). Only server-level nginx config changes require a reload, triggered via a file flag checked by cron.

**Primary use case:** a user adds a server (domain), adds rules (path match → backend), and optionally SSL, WAF, caching, rate limiting, Varnish, traffic splitting. Incoming requests are routed dynamically.

---

## 2. High-Level Architecture

```
Client
  ↓ HTTPS:443 / HTTP:80
┌─────────────────────────────────────────────────────────────┐
│ OpenResty (wslproxy)                                         │
│ - auto-ssl (Let's Encrypt)                                   │
│ - rewrite_by_lua → gateway_ack.lua  (load & match rules)     │
│ - access_by_lua  → gateway_resp.lua (select backend, vars)   │
│ - balancer_by_lua → set_current_peer + set_timeouts          │
│ - proxy_pass → $proxy_host_scheme://$upstream_server         │
└──────────────────────────────┬───────────────────────────────┘
                               ↓
                    (optional k3s ingress controller
                     = second OpenResty layer, see §10)
                               ↓
                         Origin backend
```

Admin plane is a separate server block (port 8069 prod / 8080 dev / 8099 next.js). It exposes `/api/*` (CRUD) handled by `api/api.lua`, plus `/health`, `/ready`, `/metrics`, `/swagger`, `/mcp`.

---

## 3. Top-Level Directory Map

| Path | Purpose |
|------|---------|
| `api/` | All Lua code (request pipeline, REST API, helpers). **Hot-reloaded per request.** |
| `api/mcp/` | MCP (Model Context Protocol) server for AI agents |
| `data/` | JSON data stores (servers, rules, upstreams, waf_policies, ssl, profiles, audit, versions, change_requests). Per-environment subdirs: `dev/int/test/acc/prod/`. |
| `data/settings.json` | **Global config** — storage type, super_user, env_profile, redis/pgsql, captcha, waf, mcp, env_vars |
| `openresty-admin/` | Legacy React admin UI (react-admin, Vite). Resources: Servers, Rules, Profiles, Secrets, Upstreams, Users, WafPolicies, WafRules. |
| `openresty-admin-next/` | Modern Next.js 16 dashboard (Tailwind, SWR). Adds Logs & AI Analysis pages. |
| `nginx-dev.conf.tmpl` | **Docker** nginx template |
| `nginx-base.d/`, `nginx-conf.d/` | Base/shared nginx includes |
| `infra/ansible/` | Ansible playbooks + roles for bare-metal/VM deploy |
| `infra/ansible/roles/wslproxy/templates/nginx.conf.j2` | **Production** nginx template |
| `ingress-controller/` | Separate k8s helm chart for k3s-based deploys (see §10) |
| `Dockerfile`, `docker-compose-*.yml`, `start.sh` | Docker dev/build |
| `.github/workflows/` | CI/CD: `deploy-wslproxy-delivery-pipeline.yml` is the main pipeline |
| `QA/`, `wslproxy-cache-tests/` | Cypress + Go tests |

---

## 4. The `api/` Lua Modules

### Request pipeline (order matters)

| File | Phase | Role |
|------|-------|------|
| `init.lua` | `init_by_lua_file` | Load settings, init auto_ssl, set `ssl_domains` shared dict, init session store |
| `ssl_init.lua` | `init_worker_by_lua` | Reconcile SSL domains from disk/redis |
| `healthcheck_init.lua` | `init_worker_by_lua` | Start active upstream health checks from `data/upstreams/{env}/healthcheck.lua` |
| `gateway_ack.lua` | `rewrite_by_lua_file` | Load server config → load candidate rules → evaluate → select winner → run pipeline (rate limit, WAF) → stash `selectedRule` in `ngx.ctx.gateway` |
| `gateway_resp.lua` | `access_by_lua_file` | Handle status codes (200/301/302/305/306/403), DNS-resolve backend, Varnish interception, set `$proxy_host`, `$proxy_port`, `$proxy_host_scheme`, per-server timeouts via `ngx.ctx.proxy_timeouts` |
| `balancer_by_lua_block` (in nginx.conf) | `balancer` | `balancer.set_current_peer(host, port)` + `balancer.set_timeouts(ct, st, rt)` |
| `log_handler.lua` | `log_by_lua_block` | Record traffic stats, backend metrics, Prometheus |

### Supporting modules

| File | Role |
|------|------|
| `rule_loader.lua` | Load server JSON (`host:{hostname}.json`), parse rules list + match_cases, decode schema v1/v2 S3 keys |
| `rule_matcher.lua` | Evaluate a rule: path match (with specificity score), IP match, country match (IP2Location), JWT/S3/cookie auth |
| `rule_selector.lua` | Deterministic tie-breaking: priority > path_specificity > condition_count > rule_id |
| `rule_auth.lua` | JWT validation, S3 signing, cookie key-value checks |
| `gateway_pipeline.lua` | Rate limiting (shared dict `wsl_cache`), WAF delegation, transforms |
| `traffic_router.lua` | Multi-backend selection (weighted / round-robin / header-based canary / cookie-sticky / least-conn). Passive health (3 consecutive 5xx → mark unhealthy 30s) + active (10s timer). Records per-backend stats. |
| `dns_access.lua` | Consul SRV lookup (200ms timeout); fallback to standard resolver is in `gateway_resp.lua` |
| `varnish_manager.lua` | Per-server Varnish config (redis or disk). If enabled, route to `127.0.0.1:6081` |
| `cache_manager.lua` / `cache_handler.lua` | Static content caching (shared dict `wsl_cache`) + Docker blob disk cache |
| `waf_engine.lua` / `waf_default_rules.lua` / `security_rules.lua` | WAF with OWASP-style rules, block/monitor modes, body inspection |
| `ssl_manager.lua` | Per-domain SSL config (disk/redis). `ssl_domains` shared dict gates `auto_ssl`'s `allow_domain` callback |
| `traffic_stats.lua` / `prometheus_metrics.lua` | Traffic stats (hourly buckets in `traffic_stats` shared dict) + Prometheus |
| `audit_logger.lua` | NDJSON audit trail in `data/audit/YYYY-MM/DD.json` |
| `version_manager.lua` / `cr_manager.lua` | Version history (draft → pending → live → archived) + 4-eyes change request approval |
| `helpers.lua` | `settings()`, `GetPayloads()`, `setDataToFile()`, `getDataFromFile()`, `testNginxConfig()` (runs `sudo openresty -t`), `isIpAddress()`, `hashPassword()` |
| `errors.lua` | Standardized error responses |
| `captcha.lua` | Turnstile/reCAPTCHA challenge (status code 306) + HMAC-signed cookie |
| `traffic_router.lua` start_health_checks() | Only runs on worker 0 |
| `mcp/` | MCP server exposing resources (servers, rules, policies, metrics) and optional write-tools (bind_waf_policy, reload_config, update_traffic_split) |

### `api/api.lua` — the CRUD REST API

Main dispatcher at the bottom of the file (~line 5483):
```lua
path_name = ngx.var.uri:match("^/api/(.*)$")
if method == GET  then handle_get_request(ngx.req.get_uri_args(), path_name)
if method == POST then ngx.req.read_body(); handle_post_request(ngx.req.get_post_args(), path_name)
if method == PUT  then ...
if method == DELETE then ...
```

Resources (each has list/get/create/update/delete): **servers, rules, secrets, instances, upstreams, users, profiles, waf_rules, waf_policies, waf_events, bookmarks, sessions, change-requests, versions, audit, settings**.

Special endpoints: `/api/user/login`, `/api/cache/*`, `/api/varnish/*`, `/api/traffic/*`, `/api/ai/analyze`, `/api/logs/{access,errors}`, `/api/topology/graph`, `/api/openresty_status`, `/api/push-data`, `/api/mcp/*`.

The core persister is `CreateUpdateRecord(json_val, uuid, key_name, folder_name, method)`. It:
1. Strips empty values, base64-encodes sensitive fields (secrets, JWT key, server `.config`, `varnish_vcl_config`)
2. Persists via `Repo.save` (`api/repo/` + `api/storage/` drivers). `storage_type: disk` writes JSON files; `redis` and `pgsql` dual-write to the remote store **and** on-disk JSON. Disk JSON remains the request-path source of truth (`rule_loader.lua` still reads files).
3. For servers: also writes compiled conf to `data/servers/{env}/conf/{server_name}.conf`
4. If `config_status: true`, copies conf to `/opt/nginx/conf.d/{server_name}.conf`, runs `openresty -t`, creates reboot flag file

**Storage layer:** `api/storage/{driver,disk_driver,redis_driver,pgsql_driver,dual_writer}.lua` plus `api/repo/{servers,rules,secrets,generic}.lua`. PostgreSQL uses typed tables + `raw_json` (see `infra/pgsql/migrations/`). Apply with `scripts/pg-migrate.sh`; import existing disk JSON with `scripts/pg-import-from-disk.sh`. Do not auto-migrate on boot. `pgsql_storage.lua` remains a Redis-hash facade over `config_store` for leftover callers.

---

## 5. Data Model

### Server JSON (`data/servers/{env}/host:{hostname}.json`)

Key fields (not exhaustive):
- **Identity:** `id` (= `host:{server_name}`), `server_name`, `proxy_server_name`, `profile_id`
- **Nginx config:** `config` (base64 of nginx server block), `config_status` (bool — governs whether conf is active in `/opt/nginx/conf.d/`)
- **Listeners:** `listens: [{listen: "80"|"443 ssl"}]`
- **SSL:** `ssl_enabled`, `ssl_email`, `ssl_auto_renew`, `ssl_force_https`, `ssl_staging`
- **Cache:** `cache_enabled`, `cache_ttl`, `cached_extensions`, `cached_mime_types`, `cache_bypass_cookie`, `cache_docker_blobs*`
- **Varnish:** `varnish_enabled`, `varnish_config`, `varnish_vcl_config`, `varnish_snippets`
- **Rules linkage:** `rules` (single rule id or array), `match_cases: [{statement: rule_id, condition: "and"|"or"}]`
- **Headers:** `custom_headers` (upstream), `custom_response_headers` (client)
- **Proxy timeouts:** `proxy_timeouts: {connect_timeout, send_timeout, read_timeout}` — in seconds, applied by balancer
- **Rate limiting:** `rate_limit_enabled`, `rate_limit: {requests_per_second, burst}`
- **WAF:** `waf_enabled`, `waf_policy_id`, `waf_mode_override` ("block"|"monitor")

### Rule JSON (`data/rules/{env}/{uuid}.json`)

```json
{
  "id": "uuid", "name": "...", "priority": 100, "profile_id": "prod",
  "match": {
    "rules": {
      "path": "/api", "path_key": "starts_with|ends_with|equals",
      "country": "US,UK", "country_key": "equals|not_equals",
      "client_ip": "1.2.3.0/24", "client_ip_key": "equals|not_equals",
      "jwt_token_validation_value": "...", "jwt_token_validation_key": "BASE64",
      "amazon_s3_access_key": "AKIA...", "amazon_s3_secret_key": "..."
    },
    "response": {
      "code": 305,
      "redirect_uri": "http://backend:8080",
      "message": "BASE64_HTML",
      "backends": [{"address": "...", "weight": 70, "label": "..."}],
      "routing": {"mode": "least_conn|round_robin|header|cookie"},
      "auto_redirect_https": false,
      "strip_path": false
    }
  },
  "_schema_version": 2
}
```

### Rule status codes

| Code | Meaning | gateway_resp.lua behavior |
|------|---------|---------------------------|
| 200 | Custom HTML block | `ngx.say(Base64.decode(message))` |
| 301 | Moved Permanently | `ngx.redirect(redirect_uri, 301)` |
| 302 | Found | `ngx.redirect(redirect_uri, 302)` |
| **305** | **Proxy pass** | Normal flow — DNS resolve, set vars, proxy to backend |
| 306 | CAPTCHA | Verify cookie; if missing, serve challenge page; on success, treat as 305 |
| 403 | Forbidden | Same as 200 but with 403 status |

### Directory layout

```
/opt/nginx/data/
├── settings.json
├── servers/{env}/host:{hostname}.json
├── servers/{env}/conf/{server_name}.conf   # compiled from JSON.config
├── rules/{env}/{uuid}.json
├── upstreams/{env}/upstreams.conf          # generated nginx upstream blocks
├── upstreams/{env}/healthcheck.lua         # active health check config
├── upstreams/{env}/{uuid}.json
├── ssl/{domain}.json
├── ssl-certs/letsencrypt/...               # auto-ssl storage
├── waf_policies/{env}/{id}.json
├── waf_rules/{env}/{id}.json
├── varnish/{domain}.json
├── cache/{domain}.json
├── secrets/{env}/{id}.json
├── instances/{env}/{id}.json
├── profiles/{id}.json
├── audit/YYYY-MM/DD.json                   # NDJSON
├── change_requests/CR-{id}.json
└── versions/{servers|rules}/{env}/{name}/{meta.json, v1.json, v2.json, ...}
```

---

## 6. Dynamic Reload Mechanism

1. User saves server with `config_status: true` via admin UI.
2. `api.lua:CreateUpdateRecord` writes JSON, writes `.conf` to `/opt/nginx/conf.d/`, runs `openresty -t`.
3. If syntax OK → calls `Conf.CreateNginxFlag(reboot_file_path)` which touches `/tmp/nginx/nginx-reboot-required`.
4. A cron job (templated at `infra/ansible/roles/wslproxy/templates/nginx_restart_if_required.sh.j2`) polls this flag and runs `systemctl restart openresty`, then removes the flag.
5. **Rules do not require reload** — they're loaded per-request by `rule_loader.lua` from disk/redis and evaluated live.

**Important:** the main nginx.conf includes `/opt/nginx/conf.d/*.conf` for per-tenant server blocks, and `/opt/nginx/data/upstreams/*/upstreams.conf` for dynamic upstreams.

---

## 7. Key Ports

### Docker dev (`nginx-dev.conf.tmpl`)
- `80 / 443` — main proxy (rewrite → gateway_ack, access → gateway_resp)
- `8080` — admin API + dashboard
- `8090` — Vite dev server for legacy react-admin
- `8099` — Next.js admin (proxy to port 7619)
- `8999` — internal auto-ssl hook server
- `/var/run/nginx/nginx.sock` — internal test server

### Production (`infra/ansible/.../nginx.conf.j2`)
- `80 / 443` — main proxy
- `{nginx_default_server_backend_port}` (default 8099/9069) — admin API + health
- `{nginx_nextjs_dashboard_port}` — Next.js admin
- `9443` — TCP stream load balancer for k3s API (prod-only, `nginx-base.d/nginx_tcp_streams.conf`)

### Host 187.124.112.155 (prod)
- `curl http://127.0.0.1:8099/health` returns 200 when healthy
- The Ansible template's admin server listens on 8099 (NOT 8080) — use this for health checks.

---

## 8. Deployment Topology

Three completely independent deploy mechanisms — they don't share configuration:

### A. Docker (local dev)
- `docker-compose-local.yml` starts wslproxy, redis, postgres, openresty-admin (Vite), openresty-admin-next
- `./dev.sh` is the orchestrator (`start.sh`). Accepts `-n` (skip git), `-w` (admin watch), `-a` (auto), `--stash`, `--pull`, JWT arg.
- Hot-reload: `api/` and `html/` bind-mounted. React admin requires rebuild.

### B. Ansible (bare metal / VM — this is how **prod on 187.124.112.155** is deployed)
- Playbook: `infra/ansible/wslproxy-ops.yml`
- Role: `infra/ansible/roles/wslproxy/`
- Task files (orchestrated by `tasks/main.yml`):
  - `os_setup_debian.yml` — system deps
  - `openresty_build.yml` — compile OpenResty 1.29.2.1 from source
  - `nginx_config.yml` — templates `nginx.conf.j2` → `/usr/local/openresty/nginx/conf/nginx.conf`, syncs `nginx-conf.d/`
  - `deploy_app.yml` — rsync `api/` → `/usr/local/openresty/nginx/html/api/`
  - `deploy_data.yml` — rsync `data/` → `/opt/nginx/data/`
  - `deploy_admin_ui.yml` — yarn build react-admin on target
  - `deploy_nextjs_admin_ui.yml` — npm build + systemd service for Next.js
  - `finalize.yml` — restart openresty, verify
- **Deploy tags** drive which steps run: `nginx, code, servers, dashboard, dashboard-next, os_deps, build` (or no tag = full).

### C. k3s Helm chart (`ingress-controller/deploy/helm/`)
- This is a **separate deployment** of wslproxy inside a k3s cluster, acting as a Kubernetes ingress controller.
- The existing deployment lives in namespace `wslproxy-system`, release `wslproxy-ingress`.
- Chart files:
  - `Chart.yaml` — name: `wslproxy-ingress-controller`
  - `values.yaml` — replicas, images, resources, HPA config
  - `templates/openresty-configmap.yaml` — loads `files/nginx.conf` into ConfigMap
  - `templates/openresty-deployment.yaml` — the proxy pods
  - `templates/controller-deployment.yaml` — controller pods (leader-elected)
  - `templates/ingressclass.yaml` — `ingressClassName: wslproxy`
  - `templates/openresty-{service,hpa,pdb}.yaml`, `tls-secret.yaml`, `rbac.yaml`, `servicemonitor.yaml`
- The helm chart's `files/nginx.conf` is what gets deployed into the ConfigMap. `ingress-controller/deploy/openresty/nginx.conf` is kept in sync but not directly used by helm.
- Helm on k3s1 is Ring Promoter app `wslproxy-k3s1` (`deploy/ring-promoter/k3s1.yaml`): a `k8sjob` in `ring-exec` runs `helm upgrade --install`. One-time RBAC: `kubectl apply -f deploy/ring-promoter/k3s1-rbac.yaml`. Manual equivalent: `helm upgrade wslproxy-ingress ingress-controller/deploy/helm/ -n wslproxy-system`.

---

## 9. CI/CD

Main pipeline: `.github/workflows/deploy-wslproxy-delivery-pipeline.yml`

**Promotion chain:** Build & Validate → Int (192.168.1.193) → Smoke Test Int → Test (192.168.1.140) → Prod pop0 (187.124.112.155) → Prod lon1 (72.62.211.28)
(The `acc` tier on 187.77.179.206 was decommissioned; the delivery pipeline now goes test → prod directly.)

**Inputs:** `DEPLOY_BRANCH`, `TARGET_ENV`, `TARGET_HOST`, `DEPLOY_MODE` (code/nginx/servers/dashboard/dashboard-next/os_deps/build/full).

**Gotcha (fixed):** the `if` conditions on `deploy-test`, `deploy-prod-pop0`, `deploy-prod-lon1` must include `always() && !failure() && !cancelled() &&` — otherwise a skipped intermediate stage causes downstream stages to skip even when their `TARGET_HOST` matches. This is now in place.

Reusable workflow: `deploy-environment.yml` (per-environment deploy). Supports `connection_mode: local|ssh|ssh_key`, `secrets_mode: github_secret|runner_file`, `health_check_mode: local|ssh|external`.

---

## 10. The k3s Ingress Controller Layer

Many production requests flow through **two** wslproxy layers:

```
Client → wslproxy on 187.124.112.155 (Ansible deploy)
       → k3s NodePort 32100 on 193.237.176.232
       → wslproxy-ingress-controller pod in k3s (Helm deploy)
       → FastAPI / Lapis / other app pods
```

The k3s ingress controller is configured by `Ingress` resources (e.g. `diytaxreturn-fastapi` helm chart sets `ingressClassName: wslproxy`). Timeouts, buffer sizes, and other nginx params for this layer live in `ingress-controller/deploy/helm/files/nginx.conf` and are deployed by `helm upgrade`.

**Important lesson:** increasing timeouts only on the outer layer doesn't help if the k3s ingress has lower timeouts. Check both layers.

---

## 11. Settings.json & Storage

`data/settings.json` has these top-level keys:
- `storage_type`: `"disk"` | `"redis"` | `"pgsql"` — controls whether `CreateUpdateRecord` uses Redis
- `env_profile`: default profile if request doesn't specify (e.g., `"prod"`, `"int"`)
- `super_user`: `{username, email, password}` for `/api/user/login` (password is `Helper.hashPassword`-hashed)
- `nginx.reboot_file_path`: where to touch to trigger reload (default `/tmp/nginx/nginx-reboot-required`)
- `nginx.tenant_conf_path`: where active server confs live (default `/opt/nginx/conf.d`)
- `nginx.default.{no_rule, no_server, conf_mismatch}`: base64 HTML served when gateway has nothing to do
- `pgsql.*`, `redis_host`, `redis_port`: remote storage connection
- `captcha`: `{provider: "turnstile"|"recaptcha", site_key, secret_key, theme, cookie_ttl}`
- `waf`: `{enabled, default_policy, body_inspection, max_body_size}`
- `mcp`: `{enabled, mode: "read-only"|"write", api_key, tools_enabled, rate_limit}`
- `env_vars`: propagated to OpenResty via `env` directive (JWT_SECURITY_PASSPHRASE, REDIS_HOST, NGINX_CONFIG_DIR, etc.)
- `ip2location_path`: path to IP2Location binary DB for country matching

---

## 12. Authentication

- Admin API requires JWT via `Authorization: Bearer {token}` header
- Login: `POST /api/user/login` validates against `settings.super_user`; returns token from `Helper.generateToken()`
- JWT signing key: `settings.env_vars.JWT_SECURITY_PASSPHRASE` (also exposed as `VITE_JWT_SECURITY_PASSPHRASE` to the frontend at build time)
- Session storage: `resty.session` backed by Redis
- `users.lua` and `sessions.lua` return hardcoded mock data — not production user management

---

## 13. Frontend: React Admin UI (`openresty-admin/`)

Legacy but still primary admin UI. **react-admin v4.9.4 + Vite 4 + MUI v5**, no Tailwind.

### Resource convention

Each resource is a folder under `src/` with `index.jsx` exporting `{ create, edit, list }`:

```
src/{Resource}/
├── index.jsx              # exports { create, edit, list }
├── Create.jsx             # wraps <Create>{Form}</Create>
├── Edit.jsx               # wraps <Edit>{Form}</Edit>
├── List.jsx               # <List><Datagrid>...</Datagrid></List>
├── Form.jsx               # SimpleForm or TabbedForm with inputs + validation
├── input/                 # resource-specific inputs (e.g. LocationInput)
└── toolbar/               # resource-specific toolbar buttons (e.g. ExportJsonButton)
```

Registered in `App.jsx:190-202`. Current resources: `users, sessions, servers, upstreams, rules, settings, profiles, secrets, instances, waf_rules, waf_policies, waf_events, bookmarks`.

### `dataProvider.js` — the brain of the frontend

A large custom react-admin data provider (~1060 lines) that bridges RA's CRUD interface to the Lua `/api/*` REST endpoints. Key responsibilities:

- **JWT injection:** `Authorization: Bearer {localStorage.token}` on every request, plus `x-platform: react-admin`. On 401/403, clears localStorage and redirects to `/#/login`.
- **Environment profile injection:** auto-adds `profile_id` from localStorage (`environment` key) to queries — that's how per-environment isolation works (prod/int/acc/dev).
- **URI encoding quirk** (lines ~272, 309): escapes `&`, `+`, `=` as Unicode before sending, because nginx config strings contain these chars.
- **Special `servers` resource handling** (lines 19-156) — `handleConfigField()`:
  - Composes the full nginx server block **in the browser** by combining form fields (listens, locations, SSL, ACME, custom blocks) into raw nginx syntax
  - `generateSslConfigBlock()` emits `ssl_certificate_by_lua_block { auto_ssl:ssl_certificate() }`, fallback cert paths, modern TLS ciphers, HSTS
  - `generateAcmeChallengeBlock()` emits the `/.well-known/acme-challenge/` location
  - If `ssl_force_https=true`, emits a separate server block on port 80 redirecting to HTTPS
  - The composed string is base64-encoded and sent as the server's `config` field. **Backend does NOT regenerate the config** — it trusts what the browser sends.
- **Custom methods beyond CRUD:** `syncAPI()`, `importProjects()`, `profileUpdate()`, `loadSettings()`, `getTrafficStats()`, `getTopologyGraph()`, `updateTrafficWeights()`, `promoteBackend()`, `rollbackBackend()`, `analyzeLogsAi()`.
- **Loading state:** uses react-admin's `useStore` to manage a global `fetch.data.loading` flag that blurs the UI during requests.
- **Bug watch** (lines ~197, 227, 346): error check `response.status < 200` should be `>= 400`. Works in practice but is semantically wrong.

### `authProvider.js` — minimal JWT (~62 lines)

- `login()` — POST `/api/user/login` → stores `{accessToken, expiryDate}` in localStorage with 1-hour expiry
- `checkAuth()` — resolves if `localStorage.token` exists, rejects otherwise
- `checkError()` — on 401/403, clears localStorage and rejects (react-admin redirects to login)
- `logout()` — clears localStorage
- `getIdentity()` / `getPermissions()` — stubbed; no RBAC in the UI yet
- **No refresh tokens** — when the 1-hour expires, user must re-login

### `App.jsx` structure

- Custom routes outside the resource graph: `/password/reset`, `/instance-info`, `/topology`, `/ingress`, `/health`, `/change-requests`, `/change-requests/:id`, `/audit`
- QueryClient `staleTime: 1000ms` (aggressive refetch on route changes)
- `useRef` pattern for dataProvider stability (hooks can't be called in args)
- `VersionFooter` (lines 63-121): shows version/build/deploy-time from `import.meta.env.VITE_APP_*`; links to `/swagger/`
- Dark/light theme persisted in `localStorage.wslproxy-theme-mode`

### `Theme.jsx` (~493 lines)

- Palette: Indigo primary (#6366f1), Emerald accent (#10b981), Slate grays
- Typography: Inter, 12px base
- Shape: 12px border-radius
- Component overrides for MuiButton (no text-transform, fontWeight 600), MuiTable (hover alpha), RaDatagrid/RaList/RaEdit/RaCreate (card-style borders)
- `useThemeMode()` hook exposes `{mode, toggleTheme, setMode}`
- Dark mode default respects `prefers-color-scheme` on first load

### Key resource forms to know

- **Servers/Form.jsx** — `TabbedForm` with ~6 tabs:
  - Nginx Server (domain, profile, paths, listens, SSL, caching, WAF, rate limit, headers, **proxy_timeouts**)
  - Topology (read-only graph for this server)
  - Varnish Server (VarnishSnippetEditor + VarnishDeployPanel)
  - Server Rules (ReferenceArrayInput to rules + match_cases)
  - WAF Protection
  - Version History
  Uses `CreateServerText` to preview the generated nginx config live as the user edits.
  `LocationInput` custom component (`src/Servers/input/LocationInput.jsx`) lets users build nginx `location` blocks with a SelectArrayInput of directives (proxy_pass, proxy_set_header, allow, deny, root, index, try_files, rewrite, fastcgi_pass, expires, auth_basic).

- **Rules/Form.jsx** — match conditions (path + key, country + key, client_ip + key, JWT validation), response type selector (proxy/redirect/static HTML/CAPTCHA), backend selection (ReferenceInput to upstreams). Uses `HtmlEditorInput` (CodeMirror) for 200/403 static HTML responses with base64 round-trip.

- **Profiles, Secrets, Upstreams, Users, WafRules, WafPolicies** — vanilla CRUD patterns.

### Shared custom components (`src/component/`)

| Component | Purpose |
|-----------|---------|
| `AiInsightsPanel.jsx` | Calls `/api/ai/analyze` (Ollama/Claude) for log anomaly detection |
| `ApiHealthBanner.jsx` | AppBar status badge |
| `CreateTags.jsx` | Inline tag creation dialog for SelectArrayInput |
| `HtmlEditorInput.jsx` | CodeMirror HTML editor with base64/URI decode |
| `EnvProfileHandler.jsx` | Profile dropdown in AppBar; writes `localStorage.environment` |
| `ExportJsonButton.jsx` / `ImportJsonButton.jsx` | Bulk export/import resource list as JSON |
| `StatusBadge.jsx` | Red/yellow/green health chip |
| `ResetForm.jsx` | Password reset (used by `/password/reset` route) |

### Dashboard (`src/Dashboard/`)

- Recharts-based charts (traffic volume AreaChart, error distribution BarChart)
- `GeoTrafficMap.jsx` — world map via react-simple-maps
- `BackendHealth.jsx` — live upstream health with weight-adjustment sliders (calls `updateTrafficWeights()`)
- `StorageModal.jsx` — storage type selector

### Build, env, deploy

- `vite.config.js` — mode-based `.env.{dev,int,acc,prod,lan,diytaxreturn}` loading; dev proxy maps `/api` and `/health` to backend (no CORS). `emptyOutDir: false` (avoids macOS ENOTEMPTY under bind mounts).
- Build output: `dist/` — nginx serves it at `/openresty-admin/` (see `nginx-dev.conf.tmpl` and `nginx.conf.j2`).
- Env vars used at build time: `VITE_API_URL`, `VITE_FRONT_URL`, `VITE_APP_VERSION`, `VITE_APP_BUILD_NUMBER`, `VITE_DEPLOYMENT_TIME`, `VITE_JWT_SECURITY_PASSPHRASE`, `VITE_TARGET_PLATFORM` (e.g. `"DOCKER"` or `"KUBERNATES"` — hides sync button for containerized deploys).
- Build runs inside the wslproxy container via bind-mounted source during `./dev.sh` (see `start.sh`).

### Gotchas specific to the frontend

1. **Config preview is browser-generated** — the nginx server block is composed in `dataProvider.js:handleConfigField()`, not regenerated server-side. If you change nginx syntax needs (e.g. a new directive), update both the preview generator and the Form's inputs.
2. **URI-encoding `&`, `+`, `=`** as Unicode in dataProvider is required for complex nginx config strings; don't "simplify" this away.
3. **`profile_id` auto-injection** from `localStorage.environment` means the same UI instance shows different data per profile. Clearing localStorage = loses profile context.
4. **1-hour JWT expiry, no refresh** — long editing sessions get kicked out.
5. **`emptyOutDir: false` in vite.config.js** is intentional for macOS Docker bind mount behavior.
6. **PageHeader icon convention** (in the Next.js admin, not this one) expects a component reference, not JSX. Don't mix them up if you ever unify the two UIs.

---

## 14. Development Workflow

```bash
./dev.sh                    # interactive: prompts for JWT, git stash/pull, starts containers
./dev.sh -n -j SECRET       # skip git, pass JWT
./dev.sh -w                 # watch mode for react-admin (auto-rebuild)
./dev.sh --stop             # stop services
./dev.sh --reload           # reload nginx config inside container
./dev.sh --status           # docker ps
```

Local URLs:
- Admin dashboard: http://localhost:8280
- Next.js admin: http://localhost:7619
- API: http://localhost:8280/api
- Swagger: http://localhost:8280/swagger/
- Demo origin: http://localhost:3009
- Redis: localhost:6479, Postgres: localhost:5436

---

## 15. Gotchas & Lessons Learned

### Things we discovered in real incidents:

1. **`client_body_buffer_size 0`** on admin server block silently truncates large request bodies to ~90 bytes → worker enters CPU-bound infinite loop on malformed JSON parse. Use `128k`. Fixed in `nginx-dev.conf.tmpl` and `infra/ansible/roles/wslproxy/templates/nginx.conf.j2`.

2. **Only 1 `worker_processes`** in production means any stuck worker = full outage. Consider increasing.

3. **`io.popen("sudo openresty -t")`** in `helpers.lua:testNginxConfig` blocks the entire worker. Only runs when `config_status: true`, but still a foot-gun.

4. **Default nginx `proxy_read_timeout` is 60s.** The main proxy `location /` does NOT set explicit timeouts; falls back to default. Fixed: per-server `proxy_timeouts` field drives `balancer.set_timeouts()` in the balancer_by_lua_block. See `api/gateway_resp.lua:287-299` and the balancer blocks in both nginx templates.

5. **Two-layer timeout:** fixing timeouts on the outer wslproxy doesn't help if k3s ingress has lower. Raise both. `ingress-controller/deploy/helm/files/nginx.conf` now has `proxy_{connect,send,read}_timeout 300s`.

6. **k3s ingress helm chart** — promote via Ring Promoter app `wslproxy-k3s1` (k8sjob on k3s1) or `helm upgrade wslproxy-ingress ingress-controller/deploy/helm/ -n wslproxy-system`. Changes to `ingress-controller/deploy/helm/files/nginx.conf` only go live after that helm upgrade.

7. **Missing `/var/cache/nginx/docker_blobs` parent** in Docker image → nginx won't start (proxy_cache_path directive fails). Dockerfile creates it explicitly.

8. **GitHub Actions `needs` + `if` interaction:** skipped dependencies cause downstream skip unless `if:` includes `always() && !failure() && !cancelled()`. Applied to all conditional deploy stages.

9. **PageHeader `icon` prop** in openresty-admin-next expects a component reference (`icon={ScrollText}`), NOT JSX (`icon={<ScrollText/>}`). Only one page got this wrong — fixed.

10. **`ngx.req.get_post_args()`** is used for JSON bodies. The content-type is `application/json` so the entire body becomes a single key with value `true`; `Helper.GetPayloads()` then runs `Cjson.decode(k)` on the key. If the body is truncated (see #1), this hangs or errors.

11. **Schema v1 vs v2 for rules:** v1 had multi-layer base64-encoded S3 keys; v2 stores plaintext. `rule_loader.normalize_s3_keys()` auto-detects via `rule_data._schema_version`. New rules should be saved as v2.

12. **DTAP IP override** in `rule_matcher.lua`: for hostnames containing `localhost|dev|int|test`, injects fake IPs by country for testing geo-blocking. Production hostnames are not affected.

13. **Traffic router "fail-open":** if all backends are unhealthy, it uses them anyway rather than returning 502. Prevents total outage from health-check false-positives.

14. **`config_status: true` is required** for a server's generated nginx config to actually be active in `/opt/nginx/conf.d/`. Rules work even without config_status.

15. **JSON bodies must not be rebuilt from `ngx.req.get_post_args()`** (2026-08-10 diytaxreturn outage): form parsing splits the body at the first literal `=` and `GetPayloads`' `k .. v` re-concatenation silently deleted it, stripping base64 padding from rule fields (`jwt_token_validation_key: "L2luZGV4Lmh0bWw=" → "L2luZGV4Lmh0bWw"`) for any plain-JSON client (curl, the diy-tax-return-uk `wslproxy-register-domains` import workflow). The shipped `base64.lua` then crashed on the unpadded value on every request → recurring 500s that "came back" after every rules re-import. Fixed: `GetPayloads` now prefers the raw body (`ngx.req.get_body_data`/`get_body_file`), and request-path decodes use the `Base64DecodeSafe` global (init.lua: re-pad + pcall, self-heals unpadded input). The react-admin `=` escaping (frontend gotcha 2) is a workaround for the old behavior — still harmless, no longer required.

16. **Rules for diytaxreturn (and other app domains) are owned by the app repo** (`diy-tax-return-uk/.github/wslproxy/data/{rules,servers}/<env>/`), pushed via `/api/projects/import` which preserves committed rule ids. The canonical rule id for a domain is whatever the app repo's **origin/main** says — check `git show origin/main:...`, not a possibly-stale local checkout (in the 2026-08-10 incident the local clone still had superseded id `5c63f6fa-…` while origin/main had moved to `93893825-…`). Re-creating a rule in the admin UI mints a NEW uuid and repoints servers to it, forking live from git. Fix drift by re-running the app repo's `wslproxy-register-domains` workflow (git wins), not by minting new rules.

### Conventions

- **Lua modules** return a table `_M`. Public functions on `_M`; file-scoped locals outside.
- **Error handling:** fail-open is the norm (log, continue) for request-path features. Fail-closed only for auth/WAF block.
- **JSON decode/encode:** `Cjson = require("cjson")` is loaded as a global in `init.lua`. Use `Cjson.decode`/`Cjson.encode`. `cjson.safe` where failure must not throw.
- **Base64:** `Base64 = require "base64"` global. Used for server `config`, VCL, rule `message`, secrets.
- **Paths:** `configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"` — always trailing-slash.

---

## 16. Common Troubleshooting Playbook

| Symptom | First check |
|---------|-------------|
| Worker stuck at 100% CPU, health returns 000 | `ps -o pid,stat nginx` — if `R`, Lua infinite loop. Kill worker, investigate recent change. See #1 + #2 above. |
| 504 Gateway Timeout at exactly 60s | Outer proxy timeout default. Set `proxy_timeouts` on server; also check k3s ingress layer. |
| 502 Bad Gateway | Upstream unreachable, DNS failed, or balancer peer setup failed (nginx error log: `balancer.set_current_peer failed`). |
| Save server hangs the whole server | See #1 — likely truncated body. Check `/usr/local/openresty/nginx/client_body_temp/` for small files. |
| SSL cert not issued | Check `data/ssl/{domain}.json` has `ssl_enabled: true`; `ssl_domains` shared dict has the domain; DNS points to this server; port 80 ACME reachable. |
| Rule doesn't match | Check rule's `priority`, `path_key`, and that server's `rules` or `match_cases` includes it. Use `/api/traffic/debug` to inspect matching state. |
| Config changes don't take effect | `config_status: true`? `openresty -t` passes? `/tmp/nginx/nginx-reboot-required` being picked up by cron? |
| k3s ingress config out of date | `helm upgrade wslproxy-ingress ingress-controller/deploy/helm/ -n wslproxy-system` |

### Useful commands on production host

```bash
# Health
curl -sf -o /dev/null -w '%{http_code}' http://127.0.0.1:8099/health

# Current worker states
ps aux | grep 'nginx: worker' | grep -v grep

# Recent non-OCSP errors
tail -50 /usr/local/openresty/nginx/logs/error.log | grep -v 'ocsp stapling'

# Test config without reloading
/usr/local/openresty/bin/openresty -t

# Graceful reload (HUP to master)
systemctl reload openresty

# Hard restart
systemctl restart openresty

# Find a specific server's config
cat /opt/nginx/data/servers/prod/host:{hostname}.json | python3 -m json.tool
```

---

## 17. Where Things Are Likely To Break

- **`worker_processes 1`** in production — single worker is an SPoF
- **Blocking `io.popen` in helpers.lua** — called on every `config_status: true` save
- **`ngx.req.get_post_args()` path** for JSON — fragile when bodies are large + buffered
- **k3s ingress nginx.conf** is maintained manually and drifts from `files/nginx.conf`
- **Cron-based nginx reload** rather than immediate — there's a delay between save and activation
- **Two templates to keep in sync:** `nginx-dev.conf.tmpl` (docker) and `infra/ansible/.../nginx.conf.j2` (prod). Changes must be made in both.
- **Single JWT signing key in settings.json** — rotating it logs everyone out
- **`settings.json` contains secrets** — do NOT commit real values. `.env` files similarly.
