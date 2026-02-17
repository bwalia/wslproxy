# wslproxy API Scripts - Usage Guide

This guide explains how to use the bash scripts to manage your wslproxy API Gateway without the React Admin UI.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Initial Setup](#initial-setup)
- [Authentication](#authentication)
- [Creating Rules](#creating-rules)
- [Creating Servers](#creating-servers)
- [SSL Certificates (Let's Encrypt)](#ssl-certificates-lets-encrypt)
- [Attaching Rules to Servers](#attaching-rules-to-servers)
- [Complete Workflow Examples](#complete-workflow-examples)
- [Managing Existing Resources](#managing-existing-resources)
- [Utility Commands](#utility-commands)
- [JSON Reference](#json-reference)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

1. **curl** - HTTP client (usually pre-installed)
2. **jq** - JSON processor

   ```bash
   # macOS
   brew install jq

   # Ubuntu/Debian
   sudo apt-get install jq

   # CentOS/RHEL
   sudo yum install jq
   ```

3. **wslproxy Gateway** running and accessible

---

## Initial Setup

### 1. Navigate to Scripts Directory

```bash
cd /path/to/wslproxy/api-scripts
```

### 2. Configure Your Settings

Edit `config.sh` with your gateway details:

```bash
# Open in your editor
vim config.sh
# or
nano config.sh
```

Update these values:

```bash
export GATEWAY_URL="${GATEWAY_URL:-http://localhost:4000}"
export ADMIN_EMAIL="${ADMIN_EMAIL:-your-email@example.com}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-your-password}"
```

### 3. Make Scripts Executable (if not already)

```bash
chmod +x **/*.sh
```

---

## Authentication

### Login

Before using any API, you must login to get a JWT token:

```bash
./auth/login.sh
```

**Output:**

```
Logging in to wslproxy...
Login successful!
Token saved to: /tmp/wslproxy_token

Instance Info:
{
  "instance_id": "your-instance-id",
  "instance_name": "wslproxy Gateway"
}
```

The token is stored in `/tmp/wslproxy_token` and automatically used by other scripts.

### Logout

```bash
./auth/logout.sh
```

### Login with Different Credentials

```bash
./auth/login.sh different-email@example.com different-password
```

---

## Creating Rules

Rules define how traffic should be handled based on conditions like path, IP, country, etc.

### Rule Fields Reference

| Field | Type | Required | Description |
| ----- | ---- | -------- | ----------- |
| `name` | string | Yes | Rule name |
| `profile_id` | string | No | Environment profile (dev/int/prod, default: dev) |
| `priority` | number | No | 1-10000, higher = checked first (default: 1) |
| `rules_tags` | array | No | Tags for organizing rules (e.g., `["api", "v2"]`) |
| `match.rules.path` | string | Yes | Path pattern to match |
| `match.rules.path_key` | string | Yes | `starts_with`, `ends_with`, or `equals` |
| `match.rules.country` | string | No | Country code (e.g., `US`, `GB`) or `EU` |
| `match.rules.country_key` | string | No* | `equals` (required if country is set) |
| `match.rules.client_ip` | string | No | IP address or pattern |
| `match.rules.client_ip_key` | string | No* | `starts_with` or `equals` (required if client_ip is set) |
| `match.response.code` | number | Yes | `305` (proxy), `301`/`302` (redirect), `403` (block), `200` (content) |
| `match.response.redirect_uri` | string | Yes** | Target URL for proxy/redirect |
| `match.response.message` | string | Yes*** | Base64-encoded HTML for block/content |
| `match.response.strip_path` | boolean | No | Strip matched path prefix before proxying (default: false) |

\** Required when `code` is 305, 301, or 302
\*** Required when `code` is 403 or 200

### Method 1: Interactive Mode (Easiest)

```bash
./rules/create-rule-interactive.sh
```

You'll be prompted for:

- Rule name
- Profile ID (dev/int/prod)
- Priority (1-10000, higher = checked first)
- Tags (optional, comma-separated)
- Path to match and match type
- Action (proxy, redirect, block, content)
- Target URL or message
- Strip path option (for proxy pass)
- Country restriction (optional)
- IP restriction (optional)

**Example Session:**

```
=== Create New Rule ===

Rule name: My API Route
Profile ID (dev/int/prod) [default: dev]: prod
Priority (1-10000, higher = checked first) [default: 100]: 200
Tags (comma-separated, or leave empty): api, v1
Path to match (e.g., /api): /api/v1
Path match type:
  1) starts_with
  2) ends_with
  3) equals
Select (1-3): 1

Response action:
  1) 305 - Proxy pass (reverse proxy)
  2) 301 - Permanent redirect
  3) 302 - Temporary redirect
  4) 403 - Block with message
  5) 200 - Return HTML content
Select (1-5): 1
Target URL (e.g., https://backend.example.com): https://api-backend.internal:8080

Strip path: Remove the matched path prefix before proxying
  Example: path=/api, strip=yes → /api/users proxies as /users
Strip matched path prefix? (y/n) [default: n]: y

--- Optional Restrictions ---
Country restriction (leave empty for none, EU for Europe, or country code like US):
IP restriction (leave empty for none, e.g., 192.168.1):

Creating rule with configuration:
{...}

Proceed? (y/n): y
Rule created successfully!
Rule ID: a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

**Save the Rule ID!** You'll need it to attach to a server.

### Method 2: JSON File

Create a JSON file with your rule configuration:

```bash
cat > my-rule.json << 'EOF'
{
  "name": "API v1 Route",
  "profile_id": "prod",
  "priority": 200,
  "rules_tags": ["api", "v1"],
  "match": {
    "rules": {
      "path": "/api/v1",
      "path_key": "starts_with"
    },
    "response": {
      "code": 305,
      "redirect_uri": "https://api-backend.internal:8080",
      "strip_path": true
    }
  }
}
EOF
```

Then create the rule:

```bash
./rules/create-rule.sh my-rule.json
```

### Rule Examples

#### Basic Proxy Pass

```json
{
  "name": "Default Route",
  "profile_id": "prod",
  "priority": 100,
  "match": {
    "rules": {
      "path": "/",
      "path_key": "starts_with"
    },
    "response": {
      "code": 305,
      "redirect_uri": "https://backend.example.com:8080"
    }
  }
}
```

#### Proxy with Path Stripping

When `strip_path` is `true`, the matched path prefix is removed before proxying.
For example, a request to `/api/v1/users` with path `/api/v1` will be proxied as `/users`.

```json
{
  "name": "API v1 with Strip",
  "profile_id": "prod",
  "priority": 200,
  "rules_tags": ["api"],
  "match": {
    "rules": {
      "path": "/api/v1",
      "path_key": "starts_with"
    },
    "response": {
      "code": 305,
      "redirect_uri": "https://api-backend.internal:8080",
      "strip_path": true
    }
  }
}
```

#### EU Traffic Only

```json
{
  "name": "EU API Access",
  "profile_id": "prod",
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

#### IP Whitelist

```json
{
  "name": "Internal Network Only",
  "profile_id": "prod",
  "priority": 300,
  "match": {
    "rules": {
      "path": "/internal",
      "path_key": "starts_with",
      "client_ip": "192.168.1",
      "client_ip_key": "starts_with"
    },
    "response": {
      "code": 305,
      "redirect_uri": "http://internal-service:8080"
    }
  }
}
```

#### Permanent Redirect (301)

```json
{
  "name": "Old Path Redirect",
  "profile_id": "prod",
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

#### Block with Message (403)

```json
{
  "name": "Block Admin Access",
  "profile_id": "prod",
  "priority": 500,
  "match": {
    "rules": {
      "path": "/admin",
      "path_key": "starts_with"
    },
    "response": {
      "code": 403,
      "message": "PGgxPkFjY2VzcyBEZW5pZWQ8L2gxPg=="
    }
  }
}
```

> Note: `message` must be Base64 encoded HTML. Use `echo -n "<h1>Access Denied</h1>" | base64`

---

## Creating Servers

Servers represent the domains/hostnames that the gateway will handle.

### Method 1: Interactive Mode (Easiest)

```bash
./servers/create-server-interactive.sh
```

You'll be prompted for:

- Server hostname (the domain to handle)
- Backend host header
- Rule ID to attach
- Additional rules (optional)
- Custom headers (optional)
- SSL certificate (optional - Let's Encrypt)

**Example Session:**

```
=== Create New Server ===

Server hostname (e.g., api.example.com): api.mycompany.com
Backend host header (e.g., backend.internal.com): api.mycompany.com

Available rules:
a1b2c3d4-... - API v1 Route
e5f6g7h8-... - Default Route

Primary rule ID (copy from above): a1b2c3d4-e5f6-7890-abcd-ef1234567890
Add additional rules with AND condition? (y/n): n
Add custom headers? (y/n): n

Creating server with configuration:
{...}

Proceed? (y/n): y
Server created successfully!
Server ID: x1y2z3w4-...

Your domain api.mycompany.com is now configured!
```

### Method 2: JSON File

```bash
cat > my-server.json << 'EOF'
{
  "server_name": "api.mycompany.com",
  "proxy_server_name": "api.mycompany.com",
  "rules": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
EOF

./servers/create-server.sh my-server.json
```

### Server with Custom Headers

```json
{
  "server_name": "api.example.com",
  "proxy_server_name": "backend.internal.com",
  "rules": "rule-uuid-here",
  "custom_headers": [
    {
      "header_key": "X-Gateway",
      "header_value": "wslproxy"
    },
    {
      "header_key": "X-Request-Source",
      "header_value": "api-gateway"
    }
  ]
}
```

### Server with Multiple Rules (AND conditions)

```json
{
  "server_name": "secure-api.example.com",
  "proxy_server_name": "secure-backend.internal.com",
  "rules": "primary-rule-uuid",
  "match_cases": [
    {
      "condition": "and",
      "statement": "secondary-rule-uuid"
    },
    {
      "condition": "and",
      "statement": "third-rule-uuid"
    }
  ]
}
```

### Server with SSL (Let's Encrypt)

```json
{
  "server_name": "api.example.com",
  "proxy_server_name": "backend.internal.com",
  "rules": "rule-uuid-here",
  "ssl_enabled": true,
  "ssl_email": "admin@example.com",
  "ssl_force_https": true,
  "ssl_auto_renew": true,
  "ssl_staging": false
}
```

> **Important:** Ensure the domain's DNS A record points to your gateway server's IP before enabling SSL. Let's Encrypt validates domain ownership via HTTP challenge.

---

## SSL Certificates (Let's Encrypt)

wslproxy supports automatic SSL certificate provisioning via Let's Encrypt. Certificates are issued on the first HTTPS request to the domain and auto-renewed before expiry.

### SSL Fields

| Field              | Type    | Required | Default | Description                                      |
| ------------------ | ------- | -------- | ------- | ------------------------------------------------ |
| `ssl_enabled`      | boolean | Yes      | -       | Enable/disable SSL for this domain               |
| `ssl_email`        | string  | Yes*     | -       | Contact email for Let's Encrypt notifications    |
| `ssl_force_https`  | boolean | No       | `true`  | Redirect all HTTP traffic to HTTPS               |
| `ssl_auto_renew`   | boolean | No       | `true`  | Automatically renew before certificate expires    |
| `ssl_staging`      | boolean | No       | `false` | Use Let's Encrypt staging (test) environment     |

*Required when `ssl_enabled` is `true`

### Enable SSL on a New Server (Interactive)

```bash
./servers/create-server-interactive.sh
```

When prompted for SSL:

```
--- SSL Certificate (Let's Encrypt) ---
Enable SSL certificate? (y/n) [default: n]: y
SSL contact email (required): admin@example.com
Force HTTPS redirect? (y/n) [default: y]: y
Auto-renew certificate? (y/n) [default: y]: y
Use staging (test) certificates? (y/n) [default: n]: n
  Production certificates will be issued by Let's Encrypt
```

### Enable SSL on a New Server (JSON)

```bash
cat > ssl-server.json << 'EOF'
{
  "server_name": "secure.example.com",
  "proxy_server_name": "backend.internal.com",
  "rules": "rule-uuid-here",
  "ssl_enabled": true,
  "ssl_email": "admin@example.com",
  "ssl_force_https": true,
  "ssl_auto_renew": true,
  "ssl_staging": false
}
EOF

./servers/create-server.sh ssl-server.json
```

### Enable SSL on an Existing Server

```bash
# Get current server config
./servers/get-server.sh <server-id>

# Add SSL fields to the JSON and update
cat > update-ssl.json << 'EOF'
{
  "id": "host:example.com",
  "server_name": "example.com",
  "proxy_server_name": "example.com",
  "rules": "existing-rule-id",
  "ssl_enabled": true,
  "ssl_email": "admin@example.com",
  "ssl_force_https": true,
  "ssl_auto_renew": true,
  "ssl_staging": false
}
EOF

./servers/update-server.sh <server-id> update-ssl.json
```

### Quick Setup with SSL

```bash
./utils/setup-complete.sh
```

The quick setup wizard now prompts for SSL configuration.

### Staging vs Production

| Mode       | Trusted by Browsers | Rate Limits | Use Case           |
| ---------- | ------------------- | ----------- | ------------------ |
| Staging    | No (warnings)       | Higher      | Testing/dev        |
| Production | Yes                 | 50/week     | Live domains       |

> **Tip:** Use staging mode (`"ssl_staging": true`) when testing to avoid hitting Let's Encrypt rate limits. Switch to production once everything works.

### Prerequisites for SSL

1. **DNS configured** - Domain A record must point to the gateway server IP
2. **Port 80 open** - Let's Encrypt validates via HTTP challenge on port 80
3. **Port 443 open** - HTTPS traffic needs port 443

### Troubleshooting SSL

**Certificate not issued (fallback certificate shown):**
1. Check DNS: `dig +short your-domain.com` should show your server IP
2. Check port 80 is accessible: `curl http://your-domain.com/.well-known/acme-challenge/test`
3. Check logs: `tail -f /usr/local/openresty/nginx/logs/error.log | grep ssl`
4. Reload nginx after enabling SSL: `./utils/reload.sh`

**"domain not allowed" in logs:**
- The SSL config file may be missing. Re-save the server config via the API to regenerate it
- Or reload nginx to trigger the reconciliation: `./utils/reload.sh`

---

## Attaching Rules to Servers

### Attach Rule to Existing Server

```bash
./servers/attach-rule.sh <server-id> <rule-id>
```

**Example:**

```bash
./servers/attach-rule.sh x1y2z3w4-a1b2-c3d4-e5f6-g7h8i9j0k1l2 a1b2c3d4-e5f6-7890-abcd-ef1234567890
```

### Update Server with New Rule

```bash
# Get current server config
./servers/get-server.sh <server-id>

# Create updated config
cat > updated-server.json << 'EOF'
{
  "id": "server-id-here",
  "server_name": "api.example.com",
  "proxy_server_name": "backend.internal.com",
  "rules": "new-rule-id-here"
}
EOF

# Update
./servers/update-server.sh <server-id> updated-server.json
```

---

## Complete Workflow Examples

### Example 1: Quick Setup (One Command)

The fastest way to get started:

```bash
./utils/setup-complete.sh
```

Follow the prompts:

```
=== Complete wslproxy Setup ===

Domain to configure (e.g., api.example.com): api.mycompany.com
Backend server URL (e.g., https://backend.example.com:8080): https://backend.internal:8080
Rule name: Default API Route

Step 1: Creating rule...
Rule created: a1b2c3d4-...

Step 2: Creating server...
Server created: x1y2z3w4-...

=== Setup Complete ===

Domain: api.mycompany.com
Backend: https://backend.internal:8080
Rule ID: a1b2c3d4-...
Server ID: x1y2z3w4-...

Your gateway is now configured to proxy traffic from
api.mycompany.com to https://backend.internal:8080
```

### Example 2: EU-Only API with Fallback

```bash
# 1. Login
./auth/login.sh

# 2. Create EU-only rule (high priority)
cat > eu-rule.json << 'EOF'
{
  "name": "EU Traffic to EU Backend",
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
EOF
./rules/create-rule.sh eu-rule.json
# Save: EU_RULE_ID=...

# 3. Create fallback rule (lower priority)
cat > fallback-rule.json << 'EOF'
{
  "name": "Non-EU Traffic to US Backend",
  "priority": 100,
  "match": {
    "rules": {
      "path": "/api",
      "path_key": "starts_with"
    },
    "response": {
      "code": 305,
      "redirect_uri": "https://us-backend.example.com"
    }
  }
}
EOF
./rules/create-rule.sh fallback-rule.json
# Save: FALLBACK_RULE_ID=...

# 4. Create server with both rules
cat > server.json << EOF
{
  "server_name": "api.example.com",
  "proxy_server_name": "api.example.com",
  "rules": "$EU_RULE_ID",
  "match_cases": [
    {
      "condition": "and",
      "statement": "$FALLBACK_RULE_ID"
    }
  ]
}
EOF
./servers/create-server.sh server.json
```

### Example 3: Microservices Routing

```bash
# Create rules for different paths
./rules/create-rule.sh users-rule.json      # /api/users -> users-service
./rules/create-rule.sh orders-rule.json     # /api/orders -> orders-service
./rules/create-rule.sh products-rule.json   # /api/products -> products-service

# Create server with primary rule
./servers/create-server.sh server.json

# Or use interactive mode for easier setup
./servers/create-server-interactive.sh
```

---

## Managing Existing Resources

### List All Resources

```bash
# List all rules
./rules/list-rules.sh

# List all servers
./servers/list-servers.sh
```

### Get Specific Resource

```bash
# Get rule details
./rules/get-rule.sh <rule-id>

# Get server details
./servers/get-server.sh <server-id>
```

### Update Resources

```bash
# Update rule
./rules/update-rule.sh <rule-id> updated-rule.json

# Update server
./servers/update-server.sh <server-id> updated-server.json
```

### Delete Resources

```bash
# Delete rule (with confirmation)
./rules/delete-rule.sh <rule-id>

# Delete server (with confirmation)
./servers/delete-server.sh <server-id>
```

---

## Utility Commands

### Health Check

```bash
./utils/ping.sh
```

### Test Redis Connection

```bash
./utils/redis-test.sh
```

### Reload Nginx Configuration

```bash
./utils/reload.sh
```

### Get/Update Settings

```bash
# Get current settings
./settings/get-settings.sh

# Update settings
./settings/update-settings.sh settings.json
```

---

## JSON Reference

### Response Codes

| Code  | Action             | Description                   | Required Fields    |
| ----- | ------------------ | ----------------------------- | ------------------ |
| `200` | Return content     | Returns HTML content directly | `message`          |
| `301` | Permanent redirect | SEO-friendly redirect         | `redirect_uri`     |
| `302` | Temporary redirect | Temporary redirect            | `redirect_uri`     |
| `305` | Proxy pass         | Reverse proxy to backend      | `redirect_uri`     |
| `403` | Forbidden          | Block with error message      | `message`          |

### Response Options

| Field          | Type    | Description                                              |
| -------------- | ------- | -------------------------------------------------------- |
| `redirect_uri` | string  | Target URL for proxy/redirect (required for 305/301/302) |
| `message`      | string  | Base64-encoded HTML body (required for 403/200)          |
| `strip_path`   | boolean | Strip matched path prefix before proxying (default: false) |

### Path Match Types

| Type          | Description      | Example                        |
| ------------- | ---------------- | ------------------------------ |
| `starts_with` | Path begins with | `/api` matches `/api/users`    |
| `ends_with`   | Path ends with   | `.json` matches `/data.json`   |
| `equals`      | Exact match      | `/login` matches only `/login` |

### Country Codes

- Use `EU` for all European countries
- Use ISO 3166-1 alpha-2 codes: `US`, `GB`, `DE`, `FR`, etc.

### IP Match Types

| Type          | Description    | Example                            |
| ------------- | -------------- | ---------------------------------- |
| `starts_with` | IP begins with | `192.168` matches `192.168.1.100`  |
| `equals`      | Exact IP match | `10.0.0.1` matches only `10.0.0.1` |

---

## Troubleshooting

### "Login failed!"

1. Check your credentials in `config.sh`
2. Verify gateway URL and port: `curl http://localhost:4000/ping`
3. Ensure the container is running: `docker ps | grep wslproxy`

### "No token found"

Run `./auth/login.sh` first before other commands.

### "Connection refused"

1. Check the gateway URL in `config.sh`
2. Verify port mapping: `docker ps` (look for port mappings)
3. Try pinging: `./utils/ping.sh`

### "jq: command not found"

Install jq:

```bash
# macOS
brew install jq

# Linux
sudo apt-get install jq
```

### "Permission denied"

Make scripts executable:

```bash
chmod +x **/*.sh
```

### Rule Not Working

1. Check rule priority (higher = checked first)
2. Verify path matching type
3. Check if server has the rule attached: `./servers/get-server.sh <id>`

---

## Quick Reference Card

```bash
# Authentication
./auth/login.sh                              # Login
./auth/logout.sh                             # Logout

# Rules
./rules/create-rule-interactive.sh           # Create interactively
./rules/create-rule.sh <file.json>           # Create from JSON
./rules/list-rules.sh                        # List all
./rules/get-rule.sh <id>                     # Get one
./rules/update-rule.sh <id> <file.json>      # Update
./rules/delete-rule.sh <id>                  # Delete

# Servers
./servers/create-server-interactive.sh       # Create interactively
./servers/create-server.sh <file.json>       # Create from JSON
./servers/list-servers.sh                    # List all
./servers/get-server.sh <id>                 # Get one
./servers/update-server.sh <id> <file.json>  # Update
./servers/delete-server.sh <id>              # Delete
./servers/attach-rule.sh <srv-id> <rule-id>  # Attach rule

# Utilities
./utils/ping.sh                              # Health check
./utils/reload.sh                            # Reload nginx
./utils/setup-complete.sh                    # Quick setup wizard
```
