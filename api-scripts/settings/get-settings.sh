#!/bin/bash
# Get current settings
# Usage: ./get-settings.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

echo -e "${YELLOW}Fetching settings...${NC}"

RESPONSE=$(curl -s -X GET "$GATEWAY_URL/api/settings" \
  -H "Authorization: Bearer $TOKEN")

print_response "$RESPONSE" "Current settings:"
