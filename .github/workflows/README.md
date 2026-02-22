# WSLProxy CI/CD Pipeline

## Build & Deploy Pipeline (`build-deploy-wslproxy.yml`)

Fully automated 4-stage deployment pipeline with fail-fast behavior and Slack notifications at every gate. No human approval required — the pipeline promotes code from validation through integration testing to production automatically.

### Triggers

| Trigger | Branches | Behavior |
|---------|----------|----------|
| Push | `main` | Runs stages 1–3 (int deploy + test only) |
| Push | `release` | Runs all 4 stages (through to production) |
| Manual (`workflow_dispatch`) | any | Choose target host and environment |

### Pipeline Stages

```
 ┌──────────────────────────────────────────────────────────────────────┐
 │                        PUSH TO main / release                       │
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
 │  STAGE 2: Deploy Int (Ansible native)             [self-hosted]     │
 │                                                                      │
 │  - Decode INT settings + env from GitHub Secrets                    │
 │  - ansible-playbook wslproxy-ops.yml -l slworker00 (env: int)      │
 │  - Post-deploy gates:                                               │
 │      • openresty -t (nginx config syntax)                           │
 │      • systemctl is-active openresty                                │
 │      • curl /ping (12 retries × 5s)                                │
 │                                                                      │
 │  ✗ Failure → Slack alert → pipeline stops                           │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │ pass
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 3: Test Environment                        [self-hosted]     │
 │                                                                      │
 │  - Go health check tests (QA/01_healthcheck_test.go)                │
 │  - API endpoint verification: /ping, /health, /api/servers,         │
 │    /api/rules, /api/waf_rules, /api/waf_policies                   │
 │                                                                      │
 │  ✗ Failure → Slack alert → pipeline stops before production         │
 └──────────────────────────┬───────────────────────────────────────────┘
                            │ pass
                            │
                    ┌───────┴────────┐
                    │ release branch │──── main branch pushes STOP here
                    │  or manual     │
                    └───────┬────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  STAGE 4: Deploy Production                       [self-hosted]     │
 │                                                                      │
 │  Target: 185.237.99.238 (pop0)                                      │
 │                                                                      │
 │  - Decode PROD settings + env from GitHub Secrets                   │
 │  - SSH connectivity test to root@185.237.99.238                     │
 │  - ansible-playbook wslproxy-ops.yml -l 185.237.99.238 (env: prod) │
 │  - Post-deploy gates:                                               │
 │      • openresty -t via SSH                                         │
 │      • systemctl is-active openresty via SSH                        │
 │      • curl https://prod-our.wslproxy.com/ping (10 retries × 5s)   │
 │                                                                      │
 │  ✓ Success → Slack: "deployed to production"                        │
 │  ✗ Failure → Slack: "production deployment FAILED"                  │
 └──────────────────────────────────────────────────────────────────────┘
                            │
                            ▼
 ┌──────────────────────────────────────────────────────────────────────┐
 │  PIPELINE SUMMARY (always runs)                   [ubuntu-latest]   │
 │                                                                      │
 │  Reports pass/fail for all 4 stages.                                │
 │  Exits with error if any stage failed.                              │
 └──────────────────────────────────────────────────────────────────────┘
```

### Environments & Hosts

| Environment | Host | Runner | Ansible user | Deploy method |
|-------------|------|--------|-------------|---------------|
| int | slworker00 | `[self-hosted, Linux]` | bwalia | Ansible native (local) |
| prod | 185.237.99.238 | `[self-hosted]` | root | Ansible native (SSH) |

### Secrets Required

| Secret | Used by | Description |
|--------|---------|-------------|
| `DOT_WSLPROXY_SETTINGS_INT` | Stage 2 | Base64-encoded settings.json for int |
| `DOT_WSLPROXY_ENV_CREDS_INT` | Stage 2 | Base64-encoded .env for int |
| `DOT_WSLPROXY_SETTINGS_PROD` | Stage 4 | Base64-encoded settings.json for prod |
| `DOT_WSLPROXY_ENV_CREDS_PROD` | Stage 4 | Base64-encoded .env for prod |
| `SLACK_WEBHOOK` | All stages | Slack incoming webhook URL |

### Fail-Fast Behavior

Every stage sends a Slack notification on failure and stops the pipeline immediately:

```
Stage 1 fails → "Stage 1 FAILED: Build & Validate"      → pipeline stops
Stage 2 fails → "Stage 2 FAILED: Ansible Deploy to int"  → pipeline stops
Stage 3 fails → "Stage 3 FAILED: Integration Tests"      → pipeline stops (before prod)
Stage 4 fails → "Stage 4 FAILED: Production Deployment"  → alert + manual rollback needed
```

### Rollback

- **Stages 1–3 failure**: Production is never touched. Fix the issue and push again.
- **Stage 4 failure**: Re-run the workflow from a previous known-good commit on the `release` branch, or use `workflow_dispatch` to target a specific commit.

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
| Docker Compose Smoke Test | *(planned)* | Docker Compose smoke tests (to be added as separate workflow) |
| Deploy Configs | `deploy-configs.yml` | Deploy server/rule JSON configs via Ansible |
| E2E Tests | `e2e-tests.yml` | Playwright browser tests against deployed frontend |
| API Test Suite | `automated-api-test-suite.yml` | Go-based API integration tests |
| UI Smoke Test | `automated-ui-smoke-test.yml` | Cypress UI smoke tests |
| Backup Data | `backup-wslproxy-data.yml` | Backup WSLProxy data from production |
