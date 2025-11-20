#!/bin/bash
# Delete a rule by ID
# Usage: ./delete-rule.sh <rule-id>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

if [ -z "$1" ]; then
    echo -e "${RED}Usage: $0 <rule-id>${NC}"
    exit 1
fi

RULE_ID="$1"

read -p "Are you sure you want to delete rule $RULE_ID? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Cancelled."
    exit 0
fi

echo -e "${YELLOW}Deleting rule: $RULE_ID${NC}"

RESPONSE=$(curl -s -X DELETE "$GATEWAY_URL/api/rules/$RULE_ID" \
  -H "Authorization: Bearer $TOKEN")

print_response "$RESPONSE" "Rule deleted successfully!"
