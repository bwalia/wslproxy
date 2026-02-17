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
  "profile_id": "prod",
  "priority": 100,
  "rules_tags": ["api", "backend"],
  "match": {
    "rules": {
      "path": "/api",
      "path_key": "starts_with",
      "country": "EU",
      "country_key": "equals",
      "client_ip": "192.168.1",
      "client_ip_key": "starts_with"
    },
    "response": {
      "code": 305,
      "redirect_uri": "https://backend.example.com",
      "strip_path": false
    }
  }
}
EOF
    echo ""
    echo "Required fields:"
    echo "  name             - Rule name"
    echo "  match.rules.path - Path to match"
    echo "  match.rules.path_key  - starts_with, ends_with, equals"
    echo "  match.response.code   - 305 (proxy), 301/302 (redirect), 403 (block), 200 (content)"
    echo ""
    echo "Optional fields:"
    echo "  profile_id       - Profile (dev/int/prod, default: dev)"
    echo "  priority         - 1-10000, higher = checked first (default: 1)"
    echo "  rules_tags       - Array of tags for organization"
    echo "  country/country_key     - Country restriction (EU, US, GB, etc.)"
    echo "  client_ip/client_ip_key - IP restriction (starts_with, equals)"
    echo "  redirect_uri     - Target URL (required for 305/301/302)"
    echo "  message          - Base64-encoded HTML (required for 403/200)"
    echo "  strip_path       - Strip matched path before proxying (default: false)"
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
