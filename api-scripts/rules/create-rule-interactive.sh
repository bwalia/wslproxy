#!/bin/bash
# Create a rule interactively
# Usage: ./create-rule-interactive.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

echo -e "${YELLOW}=== Create New Rule ===${NC}"
echo ""

# Rule name
read -p "Rule name: " RULE_NAME

# Profile ID
read -p "Profile ID (dev/int/prod) [default: dev]: " PROFILE_ID
PROFILE_ID="${PROFILE_ID:-dev}"

# Priority
read -p "Priority (default: 100): " PRIORITY
PRIORITY="${PRIORITY:-100}"

# Path configuration
read -p "Path to match (e.g., /api): " PATH_VALUE
echo "Path match type:"
echo "  1) starts_with"
echo "  2) ends_with"
echo "  3) equals"
read -p "Select (1-3): " PATH_TYPE_NUM

case $PATH_TYPE_NUM in
    1) PATH_KEY="starts_with" ;;
    2) PATH_KEY="ends_with" ;;
    3) PATH_KEY="equals" ;;
    *) PATH_KEY="starts_with" ;;
esac

# Response code
echo ""
echo "Response action:"
echo "  1) 305 - Proxy pass (reverse proxy)"
echo "  2) 301 - Permanent redirect"
echo "  3) 302 - Temporary redirect"
echo "  4) 403 - Block with message"
echo "  5) 200 - Return HTML content"
read -p "Select (1-5): " ACTION_NUM

case $ACTION_NUM in
    1) RESPONSE_CODE=305 ;;
    2) RESPONSE_CODE=301 ;;
    3) RESPONSE_CODE=302 ;;
    4) RESPONSE_CODE=403 ;;
    5) RESPONSE_CODE=200 ;;
    *) RESPONSE_CODE=305 ;;
esac

# Get redirect URI or message
if [ "$RESPONSE_CODE" -eq 305 ] || [ "$RESPONSE_CODE" -eq 301 ] || [ "$RESPONSE_CODE" -eq 302 ]; then
    read -p "Target URL (e.g., https://backend.example.com): " REDIRECT_URI
    MESSAGE=""
elif [ "$RESPONSE_CODE" -eq 403 ] || [ "$RESPONSE_CODE" -eq 200 ]; then
    read -p "HTML message (will be base64 encoded): " HTML_MESSAGE
    MESSAGE=$(echo -n "$HTML_MESSAGE" | base64)
    REDIRECT_URI=""
fi

# Country restriction
read -p "Country restriction (leave empty for none, EU for Europe, or country code like US): " COUNTRY

# IP restriction
read -p "IP restriction (leave empty for none, e.g., 192.168.1): " CLIENT_IP
if [ -n "$CLIENT_IP" ]; then
    read -p "IP match type (starts_with/equals): " CLIENT_IP_KEY
    CLIENT_IP_KEY="${CLIENT_IP_KEY:-starts_with}"
fi

# Build JSON
JSON=$(cat << EOF
{
  "name": "$RULE_NAME",
  "profile_id": "$PROFILE_ID",
  "priority": $PRIORITY,
  "match": {
    "rules": {
      "path": "$PATH_VALUE",
      "path_key": "$PATH_KEY"
EOF
)

if [ -n "$COUNTRY" ]; then
    JSON="$JSON,
      \"country\": \"$COUNTRY\",
      \"country_key\": \"equals\""
fi

if [ -n "$CLIENT_IP" ]; then
    JSON="$JSON,
      \"client_ip\": \"$CLIENT_IP\",
      \"client_ip_key\": \"$CLIENT_IP_KEY\""
fi

JSON="$JSON
    },
    \"response\": {
      \"code\": $RESPONSE_CODE"

if [ -n "$REDIRECT_URI" ]; then
    JSON="$JSON,
      \"redirect_uri\": \"$REDIRECT_URI\""
fi

if [ -n "$MESSAGE" ]; then
    JSON="$JSON,
      \"message\": \"$MESSAGE\""
fi

JSON="$JSON
    }
  }
}"

echo ""
echo -e "${YELLOW}Creating rule with configuration:${NC}"
echo "$JSON" | jq '.'
echo ""

read -p "Proceed? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Cancelled."
    exit 0
fi

RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON")

RULE_ID=$(echo "$RESPONSE" | jq -r '.data.id')

if [ "$RULE_ID" != "null" ] && [ -n "$RULE_ID" ]; then
    echo -e "${GREEN}Rule created successfully!${NC}"
    echo "Rule ID: $RULE_ID"
else
    echo -e "${RED}Failed to create rule${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
