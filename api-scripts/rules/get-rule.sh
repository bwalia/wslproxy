#!/bin/bash
# Get a single rule by ID
# Usage: ./get-rule.sh <rule-id>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

if [ -z "$1" ]; then
    echo -e "${RED}Usage: $0 <rule-id>${NC}"
    exit 1
fi

RULE_ID="$1"

echo -e "${YELLOW}Fetching rule: $RULE_ID${NC}"

RESPONSE=$(curl -s -X GET "$GATEWAY_URL/api/rules/$RULE_ID" \
  -H "Authorization: Bearer $TOKEN")

print_response "$RESPONSE" "Rule details:"
