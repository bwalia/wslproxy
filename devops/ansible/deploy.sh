#!/bin/bash
#
# WSLProxy Ansible Deployment Script
# This script updates the build timestamp before running Ansible deployment
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="${SCRIPT_DIR}/../.."
SYSTEM_APP_JSON="${PROJECT_ROOT}/system/app.json"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} WSLProxy Ansible Deployment${NC}"
echo -e "${GREEN}========================================${NC}"

# Update build timestamp in system/app.json before deployment
if [ -f "$SYSTEM_APP_JSON" ]; then
    BUILD_TIMESTAMP=$(date +%Y%m%d%H%M%S)
    DEPLOYMENT_TIME=$(date -u +%Y-%m-%dT%H:%M:%SZ)

    echo -e "${YELLOW}Updating build timestamp to: ${BUILD_TIMESTAMP}${NC}"

    python3 -c "
import json
with open('$SYSTEM_APP_JSON', 'r') as f:
    data = json.load(f)
data['version']['build'] = '$BUILD_TIMESTAMP'
data['version']['deployment_timestamp'] = '$DEPLOYMENT_TIME'
with open('$SYSTEM_APP_JSON', 'w') as f:
    json.dump(data, f, indent=2)
    f.write('\n')
print('Updated system/app.json')
"

    # Show current version info
    echo ""
    echo "Version info:"
    python3 -c "import json; data=json.load(open('$SYSTEM_APP_JSON')); print(f\"  Version: {data['version']['version']}\"); print(f\"  Build: {data['version']['build']}\")"
    echo ""
fi

# Default playbook
PLAYBOOK="${1:-deploy-wslproxy.yml}"

# Check if playbook exists
if [ ! -f "${SCRIPT_DIR}/${PLAYBOOK}" ]; then
    echo "Error: Playbook ${PLAYBOOK} not found"
    echo "Available playbooks:"
    ls -1 "${SCRIPT_DIR}"/*.yml 2>/dev/null || echo "  None found"
    exit 1
fi

# Shift to get remaining arguments for ansible-playbook
shift 2>/dev/null || true

echo -e "${GREEN}Running: ansible-playbook ${PLAYBOOK} $@${NC}"
echo ""

cd "${SCRIPT_DIR}"
ansible-playbook "${PLAYBOOK}" "$@"
