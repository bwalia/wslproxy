#!/bin/bash
#
# WSLProxy Ansible Deployment Script
# Validates server configuration before running Ansible deployment
#
# Usage:
#   ./deploy.sh <server-ip> [playbook] [extra-ansible-args...]
#
# Examples:
#   ./deploy.sh 185.237.99.238
#   ./deploy.sh 185.237.99.238 deploy-wslproxy.yml --tags nginx
#   ./deploy.sh 185.237.99.238 deploy-wslproxy.yml --tags "nginx,dashboard"
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/../.."
SYSTEM_APP_JSON="${PROJECT_ROOT}/system/app.json"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================================
# Usage help
# ============================================================
show_usage() {
    echo -e "${YELLOW}WSLProxy Ansible Deployment${NC}"
    echo ""
    echo "Usage: $0 <server-ip> [playbook] [extra-ansible-args...]"
    echo ""
    echo "Arguments:"
    echo "  server-ip          Target server IP address (required)"
    echo "  playbook           Ansible playbook file (default: deploy-wslproxy.yml)"
    echo "  extra-ansible-args Additional arguments passed to ansible-playbook"
    echo ""
    echo "Examples:"
    echo "  $0 185.237.99.238"
    echo "  $0 185.237.99.238 deploy-wslproxy.yml --tags nginx"
    echo "  $0 185.237.99.238 deploy-wslproxy.yml --tags \"nginx,dashboard\""
    echo ""
    echo "Available servers (host_vars):"
    if [ -d "${SCRIPT_DIR}/host_vars" ]; then
        for dir in "${SCRIPT_DIR}"/host_vars/*/; do
            if [ -d "$dir" ]; then
                local ip=$(basename "$dir")
                local hostname=""
                if [ -f "${dir}vars.yaml" ]; then
                    hostname=$(get_yaml_value "${dir}vars.yaml" "nginx_default_server_hostname")
                fi
                if [ -n "$hostname" ]; then
                    echo "  $ip  ($hostname)"
                else
                    echo "  $ip"
                fi
            fi
        done
    else
        echo "  No host_vars directory found"
    fi
    echo ""
    echo "Available playbooks:"
    ls -1 "${SCRIPT_DIR}"/*.yml 2>/dev/null | while read f; do echo "  $(basename "$f")"; done
}

# ============================================================
# Parse YAML value helper (portable, works on macOS and Linux)
# ============================================================
get_yaml_value() {
    local file="$1"
    local key="$2"
    local value
    value=$(grep "^${key}:" "$file" 2>/dev/null | head -1 | sed "s/^${key}:[[:space:]]*//" | sed 's/^"//' | sed 's/"$//')
    echo "$value"
}

# ============================================================
# Validate arguments
# ============================================================
if [ -z "$1" ]; then
    show_usage
    exit 1
fi

SERVER_IP="$1"
shift

# Playbook (default or provided)
PLAYBOOK="${1:-deploy-wslproxy.yml}"
if [ "$1" ]; then
    shift
fi

# Remaining args for ansible-playbook
EXTRA_ARGS="$@"

# ============================================================
# Validate vars file exists
# ============================================================
VARS_FILE="${SCRIPT_DIR}/host_vars/${SERVER_IP}/vars.yaml"

if [ ! -f "$VARS_FILE" ]; then
    echo -e "${RED}Error: No configuration found for server ${SERVER_IP}${NC}"
    echo -e "${RED}Expected vars file: ${VARS_FILE}${NC}"
    echo ""
    echo "Available servers:"
    if [ -d "${SCRIPT_DIR}/host_vars" ]; then
        for dir in "${SCRIPT_DIR}"/host_vars/*/; do
            [ -d "$dir" ] && echo "  $(basename "$dir")"
        done
    fi
    echo ""
    echo "To add a new server, create: host_vars/${SERVER_IP}/vars.yaml"
    exit 1
fi

# ============================================================
# Validate playbook exists
# ============================================================
if [ ! -f "${SCRIPT_DIR}/${PLAYBOOK}" ]; then
    echo -e "${RED}Error: Playbook not found: ${PLAYBOOK}${NC}"
    echo "Available playbooks:"
    ls -1 "${SCRIPT_DIR}"/*.yml 2>/dev/null | while read f; do echo "  $(basename "$f")"; done
    exit 1
fi

# ============================================================
# Read and validate configuration
# ============================================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} WSLProxy Deployment Validation${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Parse vars file
HOSTNAME=$(get_yaml_value "$VARS_FILE" "nginx_default_server_hostname")
SETTINGS_PATH=$(get_yaml_value "$VARS_FILE" "local_settings_file_path")
ENV_PATH=$(get_yaml_value "$VARS_FILE" "local_env_file_path")
WEB_UI=$(get_yaml_value "$VARS_FILE" "nginx_web_ui_enabled")
HOST_LAN_IP=$(get_yaml_value "$VARS_FILE" "host_lan_ip")
LETSENCRYPT_EMAIL=$(get_yaml_value "$VARS_FILE" "letsencrypt_email")

echo -e "${CYAN}Target Server:${NC}  ${SERVER_IP}"
echo -e "${CYAN}Host LAN IP:${NC}   ${HOST_LAN_IP:-not set}"
echo ""

# Show hostnames
echo -e "${CYAN}Server Hostnames:${NC}"
if [ -n "$HOSTNAME" ]; then
    for h in $HOSTNAME; do
        echo "  - $h"
    done
else
    echo -e "  ${YELLOW}(not configured - will use default '_')${NC}"
fi
echo ""

# Show and validate settings file
echo -e "${CYAN}Settings File:${NC} ${SETTINGS_PATH:-not configured}"
if [ -n "$SETTINGS_PATH" ]; then
    if [ -f "$SETTINGS_PATH" ]; then
        echo -e "  ${GREEN}[OK] File exists${NC}"
    else
        echo -e "  ${RED}[MISSING] File not found at: ${SETTINGS_PATH}${NC}"
        echo -e "  ${YELLOW}Deployment will fail when copying settings to server${NC}"
    fi
else
    echo -e "  ${RED}[NOT SET] local_settings_file_path is not configured in vars.yaml${NC}"
fi

# Show and validate env file
echo -e "${CYAN}Env File:${NC}      ${ENV_PATH:-not configured}"
if [ -n "$ENV_PATH" ]; then
    if [ -f "$ENV_PATH" ]; then
        echo -e "  ${GREEN}[OK] File exists${NC}"
    else
        echo -e "  ${RED}[MISSING] File not found at: ${ENV_PATH}${NC}"
        echo -e "  ${YELLOW}Deployment will fail when copying .env to server${NC}"
    fi
else
    echo -e "  ${RED}[NOT SET] local_env_file_path is not configured in vars.yaml${NC}"
fi

# Show dashboard status
echo -e "${CYAN}Web UI:${NC}        ${WEB_UI:-not set}"

# Show Let's Encrypt email
echo -e "${CYAN}SSL Email:${NC}     ${LETSENCRYPT_EMAIL:-not configured}"
if [ -z "$LETSENCRYPT_EMAIL" ]; then
    echo -e "  ${YELLOW}[WARNING] letsencrypt_email is not set in vars.yaml${NC}"
    echo -e "  ${YELLOW}Let's Encrypt certificates will be registered without a contact email${NC}"
fi
echo ""

# ============================================================
# Update build timestamp
# ============================================================
if [ -f "$SYSTEM_APP_JSON" ]; then
    BUILD_TIMESTAMP=$(date +%Y%m%d%H%M%S)
    DEPLOYMENT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    python3 -c "
import json
with open('$SYSTEM_APP_JSON', 'r') as f:
    data = json.load(f)
data['version']['build'] = '$BUILD_TIMESTAMP'
data['version']['deployment_timestamp'] = '$DEPLOYMENT_TIME'
with open('$SYSTEM_APP_JSON', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
"

    echo -e "${CYAN}Version:${NC}       $(python3 -c "import json; d=json.load(open('$SYSTEM_APP_JSON')); print(d['version']['version'])")"
    echo -e "${CYAN}Build:${NC}         ${BUILD_TIMESTAMP}"
    echo ""
fi

# ============================================================
# Show command that will be executed
# ============================================================
ANSIBLE_CMD="ansible-playbook ${PLAYBOOK} --limit ${SERVER_IP}"
if [ -n "$EXTRA_ARGS" ]; then
    ANSIBLE_CMD="${ANSIBLE_CMD} ${EXTRA_ARGS}"
fi

echo -e "${CYAN}Command:${NC}"
echo "  ${ANSIBLE_CMD}"
echo ""

# ============================================================
# Confirmation prompt
# ============================================================
echo -e "${YELLOW}----------------------------------------${NC}"
read -p "Proceed with deployment? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Deployment cancelled."
    exit 0
fi

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Deploying to ${SERVER_IP}...${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

cd "${SCRIPT_DIR}"
ansible-playbook "${PLAYBOOK}" --limit "${SERVER_IP}" ${EXTRA_ARGS}
