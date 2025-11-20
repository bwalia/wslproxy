#!/bin/bash
# Delete a server by ID
# Usage: ./delete-server.sh <server-id>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

if [ -z "$1" ]; then
    echo -e "${RED}Usage: $0 <server-id>${NC}"
    exit 1
fi

SERVER_ID="$1"

read -p "Are you sure you want to delete server $SERVER_ID? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Cancelled."
    exit 0
fi

echo -e "${YELLOW}Deleting server: $SERVER_ID${NC}"

RESPONSE=$(curl -s -X DELETE "$GATEWAY_URL/api/servers/$SERVER_ID" \
  -H "Authorization: Bearer $TOKEN")

print_response "$RESPONSE" "Server deleted successfully!"
