# wslproxy-cli

Go CLI to administer WSLProxy over the Admin REST API and MCP HTTP surface. Prefer API-only (no SSH). Spec: [WSLPROXY_CLI_BUILD_PROMPT.md](./WSLPROXY_CLI_BUILD_PROMPT.md).

## Build

```bash
make build          # → bin/wslproxy-cli
make test
```

CI: [`.github/workflows/build-wslproxy-cli.yml`](../.github/workflows/build-wslproxy-cli.yml) builds multi-arch artifacts on `main` (path-filtered) and updates the rolling release `wslproxy-cli-latest`.

## Auth

```bash
export WSLPROXY_BASE_URL=https://lon1.pop0.uk
wslproxy-cli auth login -u admin@example.com   # prompts for password
# or:
export WSLPROXY_TOKEN=eyJ...
export WSLPROXY_MCP_API_KEY=...                # for MCP tools
```

Login uses `POST /api/user/login` (`email` + `password`). `-u` / `--username` are aliases for the email field. JWT is stored at `~/.config/wslproxy/token` (mode 0600).

Config file: `~/.config/wslproxy/cli.yaml` (see `examples/wslproxy-cli/cli.yaml.example`). Precedence: flags > `WSLPROXY_*` env > config file.

## Happy path: pull → edit → push → check

```bash
wslproxy-cli pull -d ./cfg --resources servers,rules,waf_rules,waf_policies
$EDITOR ./cfg/rules/prod/*.json
wslproxy-cli push -d ./cfg --dry-run --diff
wslproxy-cli push -d ./cfg --yes --verify
wslproxy-cli check nginx
```

Staging layout:

```text
cfg/
  meta.yaml
  servers/<profile>/*.json
  rules/<profile>/*.json
  waf_rules/<profile>/*.json
  waf_policies/<profile>/*.json
```

## Commands (v1)

| Area | Commands |
|------|----------|
| Auth | `auth login\|logout\|whoami\|token` |
| CRUD | `server\|rule\|waf rules\|waf policies` `list\|get\|create\|update\|delete\|export\|apply` |
| Sync | `pull`, `push`, `apply -f` |
| Status | `status health\|ready\|openresty` |
| Checks | `check health\|openresty\|config\|nginx\|all` |
| MCP | `mcp manifest\|tools\|resources\|resource\|call\|capabilities\|schemas` |

Exit codes: `0` ok, `1` usage, `2` auth, `3` API, `4` validation, `5` partial multi-target.

## Examples

- [`examples/wslproxy-cli/roundtrip-rule.sh`](../examples/wslproxy-cli/roundtrip-rule.sh)
- [`examples/wslproxy-cli/push-server-bundle.sh`](../examples/wslproxy-cli/push-server-bundle.sh)

## Notes

- List/get query shape matches Admin UI (`params` JSON + `profile_id`).
- Prod-like base URLs require `--yes` on `push` (or `WSLPROXY_ASSUME_YES=1` in CI).
- MCP write tools need `--write` or `--yes`.
- `check config` / `check nginx` call MCP `validate_config` when available.
