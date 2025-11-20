#!/bin/bash
# Login to wslproxy and store JWT token
# Usage: ./login.sh [email] [password]

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq

EMAIL="${1:-$ADMIN_EMAIL}"
PASSWORD="${2:-$ADMIN_PASSWORD}"

echo -e "${YELLOW}Logging in to wslproxy...${NC}"

RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/user/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$EMAIL\", \"password\": \"$PASSWORD\"}")

TOKEN=$(echo "$RESPONSE" | jq -r '.data.accessToken')

if [ "$TOKEN" != "null" ] && [ -n "$TOKEN" ]; then
    echo "$TOKEN" > "$TOKEN_FILE"
    echo -e "${GREEN}Login successful!${NC}"
    echo -e "Token saved to: $TOKEN_FILE"
    echo ""
    echo "Instance Info:"
    echo "$RESPONSE" | jq '.data.instance'
else
    echo -e "${RED}Login failed!${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
