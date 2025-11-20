#!/bin/bash
# Attach a rule to an existing server
# Usage: ./attach-rule.sh <server-id> <rule-id>

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

if [ -z "$1" ] || [ -z "$2" ]; then
    echo -e "${RED}Usage: $0 <server-id> <rule-id>${NC}"
    exit 1
fi

SERVER_ID="$1"
RULE_ID="$2"

echo -e "${YELLOW}Fetching current server configuration...${NC}"

# Get current server config
CURRENT=$(curl -s -X GET "$GATEWAY_URL/api/servers/$SERVER_ID" \
  -H "Authorization: Bearer $TOKEN")

SERVER_NAME=$(echo "$CURRENT" | jq -r '.data.server_name')
PROXY_SERVER_NAME=$(echo "$CURRENT" | jq -r '.data.proxy_server_name')

if [ "$SERVER_NAME" == "null" ]; then
    echo -e "${RED}Server not found: $SERVER_ID${NC}"
    exit 1
fi

echo -e "${YELLOW}Attaching rule $RULE_ID to server $SERVER_NAME...${NC}"

# Update server with new rule
RESPONSE=$(curl -s -X PUT "$GATEWAY_URL/api/servers/$SERVER_ID" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"id\": \"$SERVER_ID\",
    \"server_name\": \"$SERVER_NAME\",
    \"proxy_server_name\": \"$PROXY_SERVER_NAME\",
    \"rules\": \"$RULE_ID\"
  }")

print_response "$RESPONSE" "Rule attached successfully!"
