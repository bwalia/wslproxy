#!/bin/bash
# ──────────────────────────────────────────────────────
# Setup WSLProxy secrets on the CI runner (192.168.1.193)
# Run as: sudo -u bwalia bash setup-runner-secrets.sh
# ──────────────────────────────────────────────────────
set -euo pipefail

SECRETS_BASE="/home/bwalia/.secrets/wslproxy"
# `acc` was decommissioned along with 187.77.179.206 — secrets
# directory at ${SECRETS_BASE}/acc on the runner can be removed
# manually after this script no longer references it.
#
# The set of envs is overridable so the same script provisions any runner:
#   - the int runner (192.168.1.193) handles int/test/lon1 (the default)
#   - the prod runner (srv1467484) handles prod
#     → run with: RUNNER_ENVS="prod" ./setup-runner-secrets.sh
# shellcheck disable=SC2206
ENVS=(${RUNNER_ENVS:-int test lon1})

# Environment-specific configuration
declare -A ENV_PROFILE
ENV_PROFILE[int]="int"
ENV_PROFILE[test]="test"
ENV_PROFILE[lon1]="prod"
ENV_PROFILE[prod]="prod"

declare -A INSTANCE_NAME
INSTANCE_NAME[int]="wslproxy-int"
INSTANCE_NAME[test]="wslproxy-test"
INSTANCE_NAME[lon1]="wslproxy-lon1"
INSTANCE_NAME[prod]="wslproxy-prod"

declare -A FRONT_URL
FRONT_URL[int]="https://int.wslproxy.com"
FRONT_URL[test]="https://test.wslproxy.com"
FRONT_URL[lon1]="http://195.20.255.201"
FRONT_URL[prod]="https://prod-our.wslproxy.com"

declare -A HOSTNAME_VAL
HOSTNAME_VAL[int]="int.wslproxy.com"
HOSTNAME_VAL[test]="test.wslproxy.com"
HOSTNAME_VAL[lon1]="195.20.255.201"
HOSTNAME_VAL[prod]="prod-our.wslproxy.com"

# Admin-API gateway written into login-creds.json (overridable via
# <ENV>_GATEWAY_URL). Must match e2e-tests.yml's env_config base URLs —
# the e2e and backup workflows POST /api/user/login against this.
declare -A GATEWAY_URL_MAP
GATEWAY_URL_MAP[int]="https://int-our.wslproxy.com"
GATEWAY_URL_MAP[test]="https://test.wslproxy.com"
GATEWAY_URL_MAP[lon1]="http://195.20.255.201"
GATEWAY_URL_MAP[prod]="https://prod-our-v1.wslproxy.com"

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

    # prod settings/.env are managed via the DOT_WSLPROXY_SETTINGS_PROD GitHub
    # Secret (SOPS-decrypted at deploy time), not this runner-local seed — so
    # for prod we skip the settings.json/.env seed and only provision
    # login-creds.json (the file the e2e login workflows read).
    if [ "${env}" = "prod" ]; then
        echo "  settings.json/.env managed via GitHub Secrets — skipping seed"
    else

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
    "reboot_file_path": "/tmp/nginx/nginx-reboot-required",
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
    fi  # end: non-prod settings.json/.env seed

    # ── login-creds.json (consumed by the e2e login/API workflows) ──
    # The e2e workflows (e2e-admin-ui-login.yml, e2e-tests.yml,
    # e2e-create-server.yml, backup-wslproxy-data.yml) read the admin
    # login from ${DIR}/login-creds.json as
    # {"ADMIN_EMAIL","ADMIN_PASSWORD","GATEWAY_URL"} — e2e-tests.yml hard-fails
    # if any of the three keys is missing, and backup-data.sh falls back to
    # http://localhost:8080 without GATEWAY_URL (broke the nightly backup).
    # This file was previously created by hand on each runner, so it drifted
    # or went missing — causing the login workflows to fail (or silently fall
    # back to the fleet-wide LOGIN_EMAIL/LOGIN_PASSWORD repo secrets, which can
    # point at a different host after a per-POP password rotation).
    #
    # The password must be the PLAINTEXT admin password (it is POSTed to
    # /api/user/login); it cannot be derived from settings.json, which only
    # stores the sha256 hash. Supply it per-env via env vars, e.g. for prod:
    #   PROD_ADMIN_EMAIL=admin@wslproxy.com \
    #   PROD_ADMIN_PASSWORD='...' \
    #   RUNNER_ENVS="prod" ./setup-runner-secrets.sh
    CREDS="${DIR}/login-creds.json"
    ENV_UP="${env^^}"
    CRED_EMAIL_VAR="${ENV_UP}_ADMIN_EMAIL"
    CRED_PASS_VAR="${ENV_UP}_ADMIN_PASSWORD"
    CRED_URL_VAR="${ENV_UP}_GATEWAY_URL"
    CRED_EMAIL="${!CRED_EMAIL_VAR:-admin@wslproxy.com}"
    CRED_PASS="${!CRED_PASS_VAR:-}"
    CRED_URL="${!CRED_URL_VAR:-${GATEWAY_URL_MAP[$env]}}"

    creds_valid() {
        [ -f "$1" ] && python3 -c "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if (d.get('ADMIN_EMAIL') and d.get('ADMIN_PASSWORD') and d.get('GATEWAY_URL')) else 1)" "$1" 2>/dev/null
    }
    # email+password present but GATEWAY_URL missing — repairable in place
    # without knowing the plaintext password
    creds_has_login() {
        [ -f "$1" ] && python3 -c "import json,sys; d=json.load(open(sys.argv[1])); sys.exit(0 if (d.get('ADMIN_EMAIL') and d.get('ADMIN_PASSWORD')) else 1)" "$1" 2>/dev/null
    }

    if creds_valid "${CREDS}" && [ "${FORCE_CREDS:-0}" != "1" ]; then
        echo "  login-creds.json already present & valid — skipping (set FORCE_CREDS=1 to rewrite)"
    elif creds_has_login "${CREDS}" && [ "${FORCE_CREDS:-0}" != "1" ]; then
        CRED_URL="${CRED_URL}" python3 -c \
          "import json,os; p='${CREDS}'; d=json.load(open(p)); d['GATEWAY_URL']=os.environ['CRED_URL']; json.dump(d, open(p,'w'))"
        chmod 600 "${CREDS}"
        echo "  Patched GATEWAY_URL=${CRED_URL} into existing ${CREDS}"
    elif [ -n "${CRED_PASS}" ]; then
        CRED_EMAIL="${CRED_EMAIL}" CRED_PASS="${CRED_PASS}" CRED_URL="${CRED_URL}" python3 -c \
          "import json,os; json.dump({'ADMIN_EMAIL':os.environ['CRED_EMAIL'],'ADMIN_PASSWORD':os.environ['CRED_PASS'],'GATEWAY_URL':os.environ['CRED_URL']}, open('${CREDS}','w'))"
        chmod 600 "${CREDS}"
        echo "  Wrote: ${CREDS} (ADMIN_EMAIL=${CRED_EMAIL}, GATEWAY_URL=${CRED_URL})"
    else
        echo "  WARNING: ${CREDS} is missing/invalid and no ${CRED_PASS_VAR} provided —"
        echo "           e2e login tests for '${env}' will fail. Re-run with:"
        echo "           ${CRED_EMAIL_VAR}='${CRED_EMAIL}' ${CRED_PASS_VAR}='<plaintext-password>' RUNNER_ENVS=\"${env}\" $0"
    fi

    # Validate JSON (prod has no runner-local settings.json to validate)
    if [ -f "${SETTINGS}" ]; then
        if python3 -m json.tool "${SETTINGS}" > /dev/null 2>&1; then
            echo "  JSON valid"
        else
            echo "  WARNING: Invalid JSON in ${SETTINGS}!"
        fi
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
echo "  NOTE: prod settings are managed via GitHub"
echo "  Secrets (DOT_WSLPROXY_SETTINGS_PROD)."
echo ""
echo "  IMPORTANT: Update the super_user password"
echo "  and JWT_SECURITY_PASSPHRASE in each"
echo "  settings.json for production use."
echo ""
echo "  login-creds.json (used by the e2e login/API"
echo "  workflows) is written only when a plaintext"
echo "  <ENV>_ADMIN_PASSWORD is supplied — it cannot"
echo "  be derived from the hashed settings.json."
echo "  On the prod runner (srv1467484) run e.g.:"
echo "    PROD_ADMIN_EMAIL=admin@wslproxy.com \\"
echo "    PROD_ADMIN_PASSWORD='<plaintext>' \\"
echo "    RUNNER_ENVS=\"prod\" FORCE_CREDS=1 $0"
echo "============================================"
