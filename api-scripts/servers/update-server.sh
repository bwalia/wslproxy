#!/bin/bash
# Update an existing server
# Usage: ./update-server.sh <server-id> <json-file>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${RED}Usage: $0 <server-id> <json-file>${NC}"
    exit 1
fi

SERVER_ID="$1"
JSON_FILE="$2"

if [ ! -f "$JSON_FILE" ]; then
    echo -e "${RED}Error: File not found: $JSON_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Updating server: $SERVER_ID${NC}"

RESPONSE=$(curl -s -X PUT "$GATEWAY_URL/api/servers/$SERVER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @"$JSON_FILE")

print_response "$RESPONSE" "Server updated successfully!"
