# wslproxy API Scripts

Bash scripts for managing wslproxy API Gateway without the React Admin UI.

## Prerequisites

- `curl` - HTTP client
- `jq` - JSON processor (install: `brew install jq` or `apt-get install jq`)

## Setup

1. Edit `config.sh` with your gateway URL and credentials:

   ```bash
   export GATEWAY_URL="http://localhost:8080"
   export ADMIN_EMAIL="admin@example.com"
   export ADMIN_PASSWORD="your-password"
   ```

2. Make all scripts executable:
   ```bash
   chmod +x **/*.sh
   ```

## Usage

### Authentication

```bash
# Login (required before other operations)
./auth/login.sh

# Logout
./auth/logout.sh
```

### Rules Management

```bash
# List all rules
./rules/list-rules.sh

# Create rule from JSON file
./rules/create-rule.sh rule.json

# Create rule interactively
./rules/create-rule-interactive.sh

# Get specific rule
./rules/get-rule.sh <rule-id>

# Update rule
./rules/update-rule.sh <rule-id> updated-rule.json

# Delete rule
./rules/delete-rule.sh <rule-id>
```

### Servers Management

```bash
# List all servers
./servers/list-servers.sh

# Create server from JSON file
./servers/create-server.sh server.json

# Create server interactively
./servers/create-server-interactive.sh

# Get specific server
./servers/get-server.sh <server-id>

# Update server
./servers/update-server.sh <server-id> updated-server.json

# Delete server
./servers/delete-server.sh <server-id>

# Attach rule to existing server
./servers/attach-rule.sh <server-id> <rule-id>
```

### Settings

```bash
# Get current settings
./settings/get-settings.sh

# Update settings
./settings/update-settings.sh settings.json
```

### Utilities

```bash
# Health check
./utils/ping.sh

# Test Redis connection
./utils/redis-test.sh

# Reload Nginx
./utils/reload.sh

# Complete setup (create rule + server)
./utils/setup-complete.sh
```

## Example JSON Files

### Rule (proxy pass)

```json
{
  "name": "API Route",
  "priority": 100,
  "match": {
    "rules": {
      "path": "/api",
      "path_key": "starts_with"
    },
    "response": {
      "code": 305,
      "redirect_uri": "https://backend.example.com:8080"
    }
  }
}
```

### Rule (with country restriction)

```json
{
  "name": "EU Only API",
  "priority": 200,
  "match": {
    "rules": {
      "path": "/api",
      "path_key": "starts_with",
      "country": "EU",
      "country_key": "equals"
    },
    "response": {
      "code": 305,
      "redirect_uri": "https://eu-backend.example.com"
    }
  }
}
```

### Rule (redirect)

```json
{
  "name": "Old Path Redirect",
  "priority": 100,
  "match": {
    "rules": {
      "path": "/old-path",
      "path_key": "starts_with"
    },
    "response": {
      "code": 301,
      "redirect_uri": "https://example.com/new-path"
    }
  }
}
```

### Server

```json
{
  "server_name": "api.example.com",
  "proxy_server_name": "backend.internal.com",
  "rules": "rule-uuid-here",
  "custom_headers": [
    {
      "header_key": "X-Gateway",
      "header_value": "wslproxy"
    }
  ]
}
```

### Server with multiple rules

```json
{
  "server_name": "api.example.com",
  "proxy_server_name": "backend.internal.com",
  "rules": "primary-rule-uuid",
  "match_cases": [
    {
      "condition": "and",
      "statement": "secondary-rule-uuid"
    }
  ]
}
```

## Quick Start

```bash
# 1. Login
./auth/login.sh

# 2. Create a simple proxy setup
./utils/setup-complete.sh

# Or do it manually:
# 3. Create a rule
./rules/create-rule-interactive.sh

# 4. Create a server with the rule
./servers/create-server-interactive.sh

# 5. Verify
./servers/list-servers.sh
./rules/list-rules.sh
```

## Response Codes Reference

| Code | Action                     |
| ---- | -------------------------- |
| 200  | Return HTML content        |
| 301  | Permanent redirect         |
| 302  | Temporary redirect         |
| 305  | Proxy pass (reverse proxy) |
| 403  | Forbidden                  |

## Path Match Types

| Type          | Description            |
| ------------- | ---------------------- |
| `starts_with` | Path begins with value |
| `ends_with`   | Path ends with value   |
| `equals`      | Exact match            |
