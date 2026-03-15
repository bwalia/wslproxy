#!/bin/bash
# ──────────────────────────────────────────────────────
# Setup WSLProxy secrets on the CI runner (192.168.1.193)
# Run as: sudo -u bwalia bash setup-runner-secrets.sh
# ──────────────────────────────────────────────────────
set -euo pipefail

SECRETS_BASE="/home/bwalia/.secrets/wslproxy"
ENVS=(int test acc lon1 wsl1)

# Environment-specific configuration
declare -A ENV_PROFILE
ENV_PROFILE[int]="int"
ENV_PROFILE[test]="test"
ENV_PROFILE[acc]="acc"
ENV_PROFILE[lon1]="prod"
ENV_PROFILE[wsl1]="prod"

declare -A INSTANCE_NAME
INSTANCE_NAME[int]="wslproxy-int"
INSTANCE_NAME[test]="wslproxy-test"
INSTANCE_NAME[acc]="wslproxy-acc"
INSTANCE_NAME[lon1]="wslproxy-lon1"
INSTANCE_NAME[wsl1]="wslproxy-wsl1"

declare -A FRONT_URL
FRONT_URL[int]="https://int.wslproxy.com"
FRONT_URL[test]="https://test.wslproxy.com"
FRONT_URL[acc]="https://acc.wslproxy.com"
FRONT_URL[lon1]="http://72.62.211.28"
FRONT_URL[wsl1]="https://wsl1.diytaxreturn.co.uk"

declare -A HOSTNAME_VAL
HOSTNAME_VAL[int]="int.wslproxy.com"
HOSTNAME_VAL[test]="test.wslproxy.com"
HOSTNAME_VAL[acc]="acc.wslproxy.com"
HOSTNAME_VAL[lon1]="72.62.211.28"
HOSTNAME_VAL[wsl1]="wsl1.diytaxreturn.co.uk"

echo "============================================"
echo "  WSLProxy Runner Secrets Setup"
echo "  Base path: ${SECRETS_BASE}"
echo "============================================"
echo ""

# Create base directory
mkdir -p "${SECRETS_BASE}"
chmod 700 "${SECRETS_BASE}"

for env in "${ENVS[@]}"; do
    DIR="${SECRETS_BASE}/${env}"
    SETTINGS="${DIR}/settings.json"
    ENVFILE="${DIR}/.env"

    echo "── Setting up: ${env} ──"
    mkdir -p "${DIR}"
    chmod 700 "${DIR}"

    # Generate unique hashes for this environment
    SERIAL=$(echo -n "wslproxy-${env}-$(date +%s)" | md5sum | cut -d' ' -f1)
    INSTANCE_HASH=$(echo -n "wslproxy-${env}-instance" | sha1sum | cut -d' ' -f1)
    JWT_PASS="wslproxy-${env}-jwt-$(openssl rand -hex 16)"

    # Only create settings.json if it doesn't already exist
    if [ -f "${SETTINGS}" ]; then
        echo "  settings.json already exists — skipping (delete it to regenerate)"
    else
        cat > "${SETTINGS}" << SETTINGSEOF
{
  "serial_number": "${SERIAL}",
  "roles": ["release_manager", "admin", "read_only", "read_write"],
  "instance_locked": "false",
  "env_profile": "${ENV_PROFILE[$env]}",
  "redis_port": "localhost",
  "storage_type": "disk",
  "nginx": {
    "tenant_conf_path": "/opt/nginx/conf.d",
    "default": {
      "no_rule": "PCFET0NUWVBFIGh0bWw+PGh0bWw+PGhlYWQ+PG1ldGEgaHR0cC1lcXVpdj0icmVmcmVzaCIgY29udGVudD0iMDt1cmw9aHR0cHM6Ly93c2xwcm94eS5jb20vaW5kZXguaHRtbCI+PHRpdGxlPlJlZGlyZWN0aW5nLi4uPC90aXRsZT48L2hlYWQ+PGJvZHk+PHA+UmVkaXJlY3RpbmcgdG8gPGEgaHJlZj0iaHR0cHM6Ly93c2xwcm94eS5jb20vaW5kZXguaHRtbCI+V1NMIFByb3h5PC9hPi4uLjwvcD48L2JvZHk+PC9odG1sPg==",
      "conf_mismatch": "PCFET0NUWVBFIGh0bWw+PGh0bWw+PGhlYWQ+PG1ldGEgaHR0cC1lcXVpdj0icmVmcmVzaCIgY29udGVudD0iMDt1cmw9aHR0cHM6Ly93c2xwcm94eS5jb20vaW5kZXguaHRtbCI+PHRpdGxlPlJlZGlyZWN0aW5nLi4uPC90aXRsZT48L2hlYWQ+PGJvZHk+PHA+UmVkaXJlY3RpbmcgdG8gPGEgaHJlZj0iaHR0cHM6Ly93c2xwcm94eS5jb20vaW5kZXguaHRtbCI+V1NMIFByb3h5PC9hPi4uLjwvcD48L2JvZHk+PC9odG1sPg==",
      "no_server": "PCFET0NUWVBFIGh0bWw+PGh0bWw+PGhlYWQ+PG1ldGEgaHR0cC1lcXVpdj0icmVmcmVzaCIgY29udGVudD0iMDt1cmw9aHR0cHM6Ly93c2xwcm94eS5jb20vaW5kZXguaHRtbCI+PHRpdGxlPlJlZGlyZWN0aW5nLi4uPC90aXRsZT48L2hlYWQ+PGJvZHk+PHA+UmVkaXJlY3RpbmcgdG8gPGEgaHJlZj0iaHR0cHM6Ly93c2xwcm94eS5jb20vaW5kZXguaHRtbCI+V1NMIFByb3h5PC9hPi4uLjwvcD48L2JvZHk+PC9odG1sPg=="
    },
    "reboot_file_path": "/var/run/nginx/nginx-reboot-required",
    "content_type": "text/html"
  },
  "redis_host": "",
  "ip2location_path": "/tmp/IP2LOCATION-LITE-DB11.IPV6.BIN",
  "consul": { "dns_server_port": 8600, "dns_server_host": "127.0.0.1" },
  "dns_resolver": {
    "nameservers": {
      "primary": "8.8.8.8",
      "port": "53",
      "secondary": "8.8.4.4"
    }
  },
  "instance_id": "${INSTANCE_NAME[$env]}",
  "env_vars": {
    "FRONT_URL": "${FRONT_URL[$env]}",
    "JWT_SECURITY_PASSPHRASE": "${JWT_PASS}",
    "REDIS_PORT": 6379,
    "APP_NAME": "Openresty",
    "API_PAGE_SIZE": 1000,
    "STACK": "Lua 5.1",
    "VITE_DEPLOYMENT_TIME": "$(date +%Y%m%d%H%M%S)",
    "NGINX_CONFIG_DIR": "/opt/nginx",
    "VERSION": "1.0",
    "REDIS_HOST": "localhost",
    "HOSTNAME": "${HOSTNAME_VAL[$env]}"
  },
  "instance_name": "${INSTANCE_NAME[$env]}",
  "instance_hash": "${INSTANCE_HASH}",
  "super_user": {
    "email": "admin@wslproxy.com",
    "password": "$(echo -n "changeme-${env}" | openssl dgst -sha256 -binary | base64)",
    "username": "admin"
  },
  "mcp": {
    "enabled": true,
    "mode": "read-only",
    "tools_enabled": false,
    "api_key": "",
    "api_key_header": "X-MCP-API-Key",
    "rate_limit": 100,
    "redact_secrets": true
  },
  "captcha": {
    "provider": "turnstile",
    "site_key": "",
    "secret_key": "",
    "theme": "dark",
    "cookie_ttl": 3600
  },
  "waf": {
    "enabled": true,
    "default_policy": "waf-policy-default",
    "body_inspection": true,
    "max_body_size": 1048576
  }
}
SETTINGSEOF
        chmod 600 "${SETTINGS}"
        echo "  Created: ${SETTINGS}"
    fi

    # Only create .env if it doesn't already exist
    if [ -f "${ENVFILE}" ]; then
        echo "  .env already exists — skipping"
    else
        cat > "${ENVFILE}" << ENVEOF
# WSLProxy environment: ${env}
# AWS credentials (add your keys if S3 proxy is used)
AWS_ACCESS_KEY_ID=
AWS_SECRET_ACCESS_KEY=
AWS_DEFAULT_REGION=eu-west-2
ENVEOF
        chmod 600 "${ENVFILE}"
        echo "  Created: ${ENVFILE}"
    fi

    # Validate JSON
    if python3 -m json.tool "${SETTINGS}" > /dev/null 2>&1; then
        echo "  JSON valid"
    else
        echo "  WARNING: Invalid JSON in ${SETTINGS}!"
    fi

    echo ""
done

# Set ownership
chown -R bwalia:bwalia "${SECRETS_BASE}" 2>/dev/null || true

echo "============================================"
echo "  Setup complete!"
echo ""
echo "  Created secrets for: ${ENVS[*]}"
echo ""
echo "  NOTE: prod secrets are managed via GitHub"
echo "  Secrets (DOT_WSLPROXY_SETTINGS_PROD)."
echo ""
echo "  IMPORTANT: Update the super_user password"
echo "  and JWT_SECURITY_PASSPHRASE in each"
echo "  settings.json for production use."
echo "============================================"
