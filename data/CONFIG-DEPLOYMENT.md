# WSLProxy Data Folder

This folder contains configuration data for WSLProxy including server configs, routing rules, SSL certificates, and settings.

## Folder Structure

```
data/
├── servers/              # Server configurations by environment
│   ├── dev/              # Development environment
│   ├── int/              # Integration environment
│   ├── test/             # Test environment
│   ├── acc/              # Acceptance environment
│   └── prod/             # Production environment
│       └── host:*.json   # Server config files
├── rules/                # Routing rules by environment
│   ├── dev/
│   ├── int/
│   ├── test/
│   ├── acc/
│   └── prod/
│       └── *.json        # Rule config files
├── ssl-certs/            # SSL certificates
├── error-pages/          # Custom error pages
├── sample-*.json         # Sample configuration templates
└── README.md             # This file
```

## Server Configuration

Server configurations define how incoming requests for a specific domain are handled.

### File Naming Convention
- Server files must be named: `host:<domain>.json`
- Example: `host:prod-our.wslproxy.com.json`

### Server Config Schema
```json
{
  "id": "host:example.wslproxy.com",
  "server_name": "example.wslproxy.com",
  "proxy_server_name": "example.wslproxy.com",
  "root": "/var/www/html",
  "index": "index.html",
  "access_log": "logs/access.log",
  "error_log": "logs/error.log",
  "config_status": false,
  "profile_id": "prod",
  "proxy_pass": "http://localhost:8080",
  "rules": "example-rule-id",
  "created_at": 1769388403,
  "listens": [{"listen": "80"}],
  "ssl_enabled": true,
  "ssl_force_https": true,
  "ssl_staging": false,
  "ssl_auto_renew": true,
  "ssl_email": "admin@example.com",
  "cache_enabled": false,
  "cache_bypass_auth": false,
  "match_cases": {},
  "custom_headers": []
}
```

### Key Fields
- `id`: Unique identifier (format: `host:<domain>`)
- `server_name`: The domain this config handles
- `rules`: Reference to the rule ID that defines routing
- `ssl_enabled`: Enable Let's Encrypt SSL
- `ssl_force_https`: Redirect HTTP to HTTPS
- `profile_id`: Environment (dev, int, test, acc, prod)

## Rule Configuration

Rules define how requests are routed/processed.

### File Naming Convention
- Rule files can have any name ending in `.json`
- Recommended: `<descriptive-name>-rule.json`

### Rule Config Schema
```json
{
  "id": "my-rule-id",
  "name": "My Rule Name",
  "profile_id": "prod",
  "priority": 1,
  "created_at": 1769388395,
  "version": 1,
  "match": {
    "rules": {
      "path": "/",
      "path_key": "starts_with",
      "client_ip_key": "equals",
      "country_key": "equals",
      "jwt_token_validation": "equals"
    },
    "response": {
      "code": 305,
      "redirect_uri": "127.0.0.1:8080",
      "allow": false,
      "message": "undefined",
      "is_consul": false
    }
  },
  "servers": ["host:example.wslproxy.com"]
}
```

### Response Codes
- `305`: Proxy pass to `redirect_uri`
- `301`: Permanent redirect
- `302`: Temporary redirect
- `200`: Return custom message/content
- `403`: Block request

### Path Match Types
- `starts_with`: Path starts with value
- `equals`: Exact path match
- `contains`: Path contains value
- `regex`: Regular expression match

## Deployment

### Automatic Deployment (CI/CD)

Configs are automatically deployed when changes are pushed to the `main` branch:

1. **Kubernetes (Helm)**: The `build-push-deploy.yaml` workflow copies configs directly to pods
2. **Docker/Native**: The `deploy-configs.yml` workflow uses Ansible to sync configs

### Manual Deployment

**Option 1: Using sync-configs.sh (SSH)**
```bash
# Deploy prod configs to server
./sync-configs.sh prod 185.237.99.238

# With custom SSH key
./sync-configs.sh prod 185.237.99.238 ~/.ssh/my-key
```

**Option 2: Using Ansible**
```bash
cd devops/ansible

# Deploy to production servers (defined in hosts file)
ansible-playbook deploy-configs.yml -i hosts -e "target_env=prod"

# Deploy to integration
ansible-playbook deploy-configs.yml -i hosts -e "target_env=int"

# Dry run (check mode)
ansible-playbook deploy-configs.yml -i hosts -e "target_env=prod" --check --diff
```

**Option 3: GitHub Actions (Manual Trigger)**
1. Go to Actions → "Deploy Server Configs and Rules"
2. Select target environment
3. Run workflow

### Server Inventory

Target servers are defined in `devops/ansible/hosts`:
```ini
[openresty_prod]
185.237.99.238 ansible_user=root

[openresty_int]
int-server.example.com ansible_user=root

[openresty_test]
test-server.example.com ansible_user=root
```

## Adding New Configurations

1. Create server config: `data/servers/<env>/host:<domain>.json`
2. Create rule config: `data/rules/<env>/<rule-name>.json`
3. Ensure the server's `rules` field references the rule's `id`
4. Commit and push to trigger automatic deployment

## Validation

All JSON files are validated before deployment:
```bash
# Validate all configs locally
jq empty data/servers/prod/*.json
jq empty data/rules/prod/*.json

# Or use the sync script (includes validation)
./sync-configs.sh prod --dry-run
```

## Required GitHub Secrets

Only ONE secret is needed for deployment:
- `SSH_PRIVATE_KEY`: SSH key for server access (Ansible uses this)

**Note**: Server configs and rules are stored as files in the repo - no secrets needed for config data!
