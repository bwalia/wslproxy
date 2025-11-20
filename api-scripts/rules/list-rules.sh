#!/bin/bash
# List all rules in wslproxy
# Usage: ./list-rules.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

echo -e "${YELLOW}Fetching rules...${NC}"

RESPONSE=$(curl -s -X GET "$GATEWAY_URL/api/rules" \
  -H "Authorization: Bearer $TOKEN")

echo -e "${GREEN}Rules:${NC}"
echo "$RESPONSE" | jq '.'

# Print summary
COUNT=$(echo "$RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
echo ""
echo -e "${YELLOW}Total rules: $COUNT${NC}"
