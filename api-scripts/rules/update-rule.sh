#!/bin/bash
# Update an existing rule
# Usage: ./update-rule.sh <rule-id> <json-file>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${RED}Usage: $0 <rule-id> <json-file>${NC}"
    exit 1
fi

RULE_ID="$1"
JSON_FILE="$2"

if [ ! -f "$JSON_FILE" ]; then
    echo -e "${RED}Error: File not found: $JSON_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Updating rule: $RULE_ID${NC}"

RESPONSE=$(curl -s -X PUT "$GATEWAY_URL/api/rules/$RULE_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @"$JSON_FILE")

print_response "$RESPONSE" "Rule updated successfully!"
