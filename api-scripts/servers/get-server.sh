#!/bin/bash
# Get a single server by ID
# Usage: ./get-server.sh <server-id>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

if [ -z "$1" ]; then
    echo -e "${RED}Usage: $0 <server-id>${NC}"
    exit 1
fi

SERVER_ID="$1"

echo -e "${YELLOW}Fetching server: $SERVER_ID${NC}"

RESPONSE=$(curl -s -X GET "$GATEWAY_URL/api/servers/$SERVER_ID" \
  -H "Authorization: Bearer $TOKEN")

print_response "$RESPONSE" "Server details:"
