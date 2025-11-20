#!/bin/bash
# Create a new rule in wslproxy
# Usage: ./create-rule.sh <json-file>
# Example: ./create-rule.sh rule.json

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

if [ -z "$1" ]; then
    echo -e "${YELLOW}Usage: $0 <json-file>${NC}"
    echo ""
    echo "Example JSON file content:"
    cat << 'EOF'
{
  "name": "My Rule",
  "priority": 100,
  "match": {
    "rules": {
      "path": "/api",
      "path_key": "starts_with"
    },
    "response": {
      "code": 305,
      "redirect_uri": "https://backend.example.com"
    }
  }
}
EOF
    exit 1
fi

JSON_FILE="$1"

if [ ! -f "$JSON_FILE" ]; then
    echo -e "${RED}Error: File not found: $JSON_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating rule...${NC}"

RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @"$JSON_FILE")

RULE_ID=$(echo "$RESPONSE" | jq -r '.data.id')

if [ "$RULE_ID" != "null" ] && [ -n "$RULE_ID" ]; then
    echo -e "${GREEN}Rule created successfully!${NC}"
    echo "Rule ID: $RULE_ID"
    echo ""
    echo "$RESPONSE" | jq '.'
else
    echo -e "${RED}Failed to create rule${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
