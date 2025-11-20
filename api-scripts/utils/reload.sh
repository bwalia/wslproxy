#!/bin/bash
# Reload Nginx configuration
# Usage: ./reload.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

echo -e "${YELLOW}Reloading Nginx configuration...${NC}"

RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/reload" \
  -H "Authorization: Bearer $TOKEN")

print_response "$RESPONSE" "Nginx reloaded successfully!"
