# WSLProxy CI/CD Pipeline

## Build & Deploy Pipeline (`build-deploy-wslproxy.yml`)

Fully automated promotion pipeline with fail-fast behavior and Slack notifications at every gate. Code promotes through **int → test → acc → prod** — each environment must pass before the next deploys.

**Default mode:** Code-only deploy (lua, nginx conf, data, admin UI). Tick `FULL_BUILD` for OpenResty compilation + OS updates.

### Triggers

| Trigger | Branches | Behavior |
|---------|----------|----------|
| Push | `release` | Runs full pipeline: int → test → acc → prod (pop0 + lon1) |
| Manual (`workflow_dispatch`) | any | Choose target host, environment, and build mode |

### Pipeline Stages

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                         PUSH TO release                             │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 1: Build & Validate                        [ubuntu-latest]   │
 │                                                                      │
 │  - Validate all JSON configs (servers, rules, WAF rules, policies)  │
 │  - Validate Jinja2 templates (Ansible roles)                        │
 │                                                                      │
 │  ✗ Failure → Slack alert → pipeline stops                           │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │ pass
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 2: Deploy Int (192.168.1.193)              [self-hosted]     │
 │                                                                      │
 │  - Decode INT settings + env from GitHub Secrets                    │
 │  - ansible-playbook wslproxy-ops.yml (env: int, local connection)   │
 │  - Deploy server configs and rules (data/servers/int, data/rules/int)│
 │  - Post-deploy gates:                                               │
 │      • openresty -t (nginx config syntax)                           │
 │      • systemctl is-active openresty                                │
 │      • curl http://192.168.1.193:8080/health (12 retries × 5s)     │
 │                                                                      │
 │  ✗ Failure → Slack alert → pipeline stops                           │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │ pass
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 3: Smoke Test Int                          [self-hosted]     │
 │                                                                      │
 │  - Go health check tests (QA/01_healthcheck_test.go)                │
 │  - API endpoint verification:                                       │
 │      • /health (core — must pass)                                   │
 │      • /api/servers, /api/rules, /api/waf_rules, /api/waf_policies │
 │                                                                      │
 │  ✗ Failure → Slack alert → pipeline stops before test               │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │ pass
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 4: Deploy Test (192.168.1.140)             [self-hosted]     │
 │                                                                      │
 │  - SSH from runner to 192.168.1.140 (bwalia user)                   │
 │  - ansible-playbook wslproxy-ops.yml (env: test)                    │
 │  - Deploy server configs and rules (data/servers/test)              │
 │  - Post-deploy gates:                                               │
 │      • openresty -t via SSH                                         │
 │      • curl http://192.168.1.140:8080/health (12 retries × 5s)     │
 │                                                                      │
 │  ✗ Failure → Slack alert → pipeline stops before acc                │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │ pass
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 5: Deploy Acc (187.77.179.206)             [self-hosted]     │
 │                                                                      │
 │  - SSH from runner to 187.77.179.206 (root user)                    │
 │  - ansible-playbook wslproxy-ops.yml (env: acc)                     │
 │  - Deploy server configs and rules (data/servers/acc)               │
 │  - Post-deploy gates:                                               │
 │      • openresty -t via SSH                                         │
 │      • curl http://187.77.179.206:8080/health (12 retries × 5s)    │
 │                                                                      │
 │  ✓ Success → Slack: "deployed to ACC"                               │
 │  ✗ Failure → Slack alert → pipeline stops before production         │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │ pass
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 6a: Deploy Prod pop0 (187.124.112.155)     [self-hosted]     │
 │                                                                      │
 │  - Decode PROD settings + env from GitHub Secrets                   │
 │  - SSH connectivity test to root@187.124.112.155                    │
 │  - ansible-playbook wslproxy-ops.yml (env: prod)                    │
 │  - Post-deploy gates:                                               │
 │      • openresty -t via SSH                                         │
 │      • curl https://prod-our.wslproxy.com/health (10 retries × 5s) │
 │                                                                      │
 │  ✓ Success → Slack: "deployed to production (pop0)"                 │
 │  ✗ Failure → Slack: "production deployment FAILED"                  │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │ pass
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 6b: Deploy Prod lon1 (lon1.pop0.uk)        [self-hosted]     │
 │                                                                      │
 │  - SSH to root@lon1.pop0.uk (72.62.211.28)                         │
 │  - ansible-playbook wslproxy-ops.yml (env: prod)                    │
 │  - Post-deploy gates:                                               │
 │      • openresty -t via SSH                                         │
 │      • curl http://72.62.211.28:8080/health (10 retries × 5s)      │
 │                                                                      │
 │  ✓ Success → Slack: "deployed to LON1"                              │
 │  ✗ Failure → Slack: "LON1 deployment FAILED"                       │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  PIPELINE SUMMARY (always runs)                   [ubuntu-latest]   │
 │                                                                      │
 │  Reports pass/fail for all stages.                                  │
 │  Exits with error if any stage failed.                              │
 └──────────────────────────────────────────────────────────────────────┘

 ── Manual dispatch only ──────────────────────────────────────────────

 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 7: Deploy WSL1 (187.124.112.156)           [self-hosted]     │
 │                                                                      │
 │  - Only via workflow_dispatch (TARGET_HOST = 187.124.112.156 / all) │
 │  - SSH to root@187.124.112.156                                      │
 │  - ansible-playbook wslproxy-ops.yml (env: wsl1)                   │
 └──────────────────────────────────────────────────────────────────────┘
```

### Environments & Hosts

| Environment | Host | IP | Ansible user | Deploy method | Smoke test endpoint |
|-------------|------|----|-------------|---------------|---------------------|
| int | 192.168.1.193 | 192.168.1.193 | bwalia | Ansible local | `http://192.168.1.193:8080/health` |
| test | 192.168.1.140 | 192.168.1.140 | bwalia | Ansible SSH | `http://192.168.1.140:8080/health` |
| acc | 187.77.179.206 | 187.77.179.206 | root | Ansible SSH | `http://187.77.179.206:8080/health` |
| prod (pop0) | 187.124.112.155 | 187.124.112.155 | root | Ansible SSH | `https://prod-our.wslproxy.com/health` |
| prod (lon1) | lon1.pop0.uk | 72.62.211.28 | root | Ansible SSH | `http://72.62.211.28:8080/health` |
| wsl1 | 187.124.112.156 | 187.124.112.156 | root | Ansible SSH | `http://187.124.112.156:8080/health` |

### Build Modes

| Mode | Flag | What runs | What's skipped |
|------|------|-----------|----------------|
| **Code-only** (default) | — | Lua code, nginx conf, data configs, admin UI, cron, systemd, finalize | OS updates, OpenResty compile, luarocks, CDN deps |
| **Full build** | `FULL_BUILD=true` | Everything | Nothing |
| **Dashboard only** | `DEPLOY_DASHBOARD_ONLY=true` | Admin UI only | Everything else |

### Secrets

| Secret | Used by | Description |
|--------|---------|-------------|
| `DOT_WSLPROXY_SETTINGS_INT` | Stage 2 | Base64-encoded settings.json for int |
| `DOT_WSLPROXY_ENV_CREDS_INT` | Stage 2 | Base64-encoded .env for int |
| `DOT_WSLPROXY_SETTINGS_PROD` | Stage 6a | Base64-encoded settings.json for prod |
| `DOT_WSLPROXY_ENV_CREDS_PROD` | Stage 6a | Base64-encoded .env for prod |
| `SLACK_WEBHOOK` | All stages | Slack incoming webhook URL |

Runner-local secrets (on 192.168.1.193):

```
/home/bwalia/.secrets/wslproxy/
├── int/     → settings.json + .env (BACKEND_HOST=192.168.1.193)
├── test/    → settings.json + .env (BACKEND_HOST=192.168.1.140)
├── acc/     → settings.json + .env (BACKEND_HOST=187.77.179.206)
├── lon1/    → settings.json + .env (BACKEND_HOST=72.62.211.28)
└── wsl1/    → settings.json + .env (uses domain names)
```

---

## Smoke Tests & Health Checks

Each deployment stage runs post-deploy smoke tests before promoting to the next environment. Tests use **IP-based endpoints** to verify connectivity independent of DNS.

### Per-Stage Smoke Tests

| Stage | Test | Endpoint | Pass criteria |
|-------|------|----------|---------------|
| Stage 2 (Int) | nginx config syntax | `openresty -t` (local) | Exit code 0 |
| Stage 2 (Int) | Service running | `systemctl is-active openresty` (local) | Active |
| Stage 2 (Int) | Health endpoint | `http://192.168.1.193:8080/health` | HTTP 200 |
| Stage 3 (Smoke) | Go health check | `http://192.168.1.193:8080` (Go test) | JSON with redis_status_msg, pod_uptime, node_uptime |
| Stage 3 (Smoke) | API endpoints | `/api/servers`, `/api/rules`, etc. | HTTP 200 (non-blocking for admin-only endpoints) |
| Stage 4 (Test) | nginx config syntax | `openresty -t` via SSH | Exit code 0 |
| Stage 4 (Test) | Health endpoint | `http://192.168.1.140:8080/health` via SSH | HTTP 200 |
| Stage 5 (Acc) | nginx config syntax | `openresty -t` via SSH | Exit code 0 |
| Stage 5 (Acc) | Health endpoint | `http://187.77.179.206:8080/health` via SSH | HTTP 200 |
| Stage 6a (Prod) | nginx config syntax | `openresty -t` via SSH | Exit code 0 |
| Stage 6a (Prod) | Health endpoint | `https://prod-our.wslproxy.com/health` | HTTP 200 |
| Stage 6b (LON1) | nginx config syntax | `openresty -t` via SSH | Exit code 0 |
| Stage 6b (LON1) | Health endpoint | `http://72.62.211.28:8080/health` | HTTP 200 |

### Smoke Test .env Variables

Each environment's `.env` file on the runner contains IP-based endpoints for smoke testing:

```bash
BACKEND_HOST=<ip>          # Server IP address
BACKEND_PORT=8080          # OpenResty admin/API port
BACKEND_URL=http://<ip>:8080
FRONTEND_HOST=<ip>
FRONTEND_HTTP_PORT=80      # HTTP port
FRONTEND_HTTPS_PORT=443    # HTTPS port
HEALTH_ENDPOINT=http://<ip>:8080/health
PING_ENDPOINT=http://<ip>:8080/ping
```

---

## Unit & Integration Testing

### Go Health Check Tests (Stage 3)

| File | Framework | What it tests |
|------|-----------|--------------|
| `QA/01_healthcheck_test.go` | Go `testing` | `/ping` endpoint returns JSON with `redis_status_msg`, `pod_uptime`, `node_uptime` |

Run locally:
```bash
cd QA
TARGET_HOST=http://192.168.1.193:8080 go test -v -run TestHealthCheck -timeout 60s
```

### API Endpoint Verification (Stage 3)

The pipeline verifies these API endpoints are reachable after int deployment:

| Endpoint | Type | Required |
|----------|------|----------|
| `/health` | Core health check | Yes (blocks pipeline) |
| `/api/servers` | Server configs API | No (skip if admin UI disabled) |
| `/api/rules` | Rule configs API | No (skip if admin UI disabled) |
| `/api/waf_rules` | WAF rules API | No (skip if admin UI disabled) |
| `/api/waf_policies` | WAF policies API | No (skip if admin UI disabled) |

### JSON Config Validation (Stage 1)

Runs on `ubuntu-latest` before any deployment:

| Validation | Tool | Scope |
|------------|------|-------|
| Server configs | `python3 -m json.tool` | `data/servers/**/*.json` |
| Rule configs | `python3 -m json.tool` | `data/rules/**/*.json` |
| WAF rules | `python3 -m json.tool` | `data/waf_rules/**/*.json` |
| WAF policies | `python3 -m json.tool` | `data/waf_policies/**/*.json` |
| Jinja2 templates | `jinja2.Environment.parse()` | `devops/ansible/roles/**/*.j2` |

### Adding New Tests

To add tests to the pipeline:

1. **Go tests**: Add test files to `QA/` — they run in Stage 3 against the int environment
2. **API tests**: Add endpoints to the Stage 3 verification loop in `build-deploy-wslproxy.yml`
3. **Config validation**: JSON files in `data/` are automatically validated in Stage 1

---

## Fail-Fast Behavior

Every stage sends a Slack notification on failure and stops the pipeline immediately:

```
Stage 1 fails  → "Build & Validate FAILED"              → pipeline stops
Stage 2 fails  → "Deploy Int FAILED"                    → pipeline stops
Stage 3 fails  → "Smoke Test Int FAILED"                → pipeline stops (before test)
Stage 4 fails  → "Deploy Test FAILED"                   → pipeline stops (before acc)
Stage 5 fails  → "Deploy ACC FAILED"                    → pipeline stops (before prod)
Stage 6a fails → "Production Deployment FAILED (pop0)"  → alert + manual rollback
Stage 6b fails → "LON1 Deployment FAILED"               → alert + manual rollback
```

### Rollback

- **Stages 1–5 failure**: Production is never touched. Fix the issue and push again.
- **Stage 6 failure**: Re-run the workflow from a previous known-good commit on the `release` branch, or use `workflow_dispatch` to target a specific commit.

### Concurrency

```yaml
concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: false
```

Only one deployment per branch at a time. In-progress deployments are **not** cancelled to avoid partial deploys.

---

## Other Workflows

| Workflow | File | Purpose |
|----------|------|---------|
| Deploy Configs | `deploy-wslproxy-configs.yml` | Deploy server/rule JSON configs + optional nginx conf via Ansible |
| E2E Tests | `e2e-tests.yml` | Playwright browser tests against deployed frontend |
| API Test Suite | `automated-api-test-suite.yml` | Go-based API integration tests |
| UI Smoke Test | `automated-ui-smoke-test.yml` | Cypress UI smoke tests |
| Backup Data | `backup-wslproxy-data.yml` | Backup WSLProxy data from production |
