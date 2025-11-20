#!/bin/bash
# Update settings
# Usage: ./update-settings.sh <json-file>

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
  "env_profile": "prod",
  "storage_type": "file",
  "env_vars": {
    "REDIS_HOST": "localhost",
    "JWT_SECURITY_PASSPHRASE": "your-secret"
  },
  "dns_resolver": {
    "nameservers": {
      "primary": "1.1.1.1",
      "secondary": "8.8.8.8",
      "port": "53"
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

echo -e "${YELLOW}Updating settings...${NC}"

RESPONSE=$(curl -s -X PUT "$GATEWAY_URL/api/settings" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @"$JSON_FILE")

print_response "$RESPONSE" "Settings updated successfully!"
