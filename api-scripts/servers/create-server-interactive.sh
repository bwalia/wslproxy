#!/bin/bash
# Create a server interactively
# Usage: ./create-server-interactive.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

echo -e "${YELLOW}=== Create New Server ===${NC}"
echo ""

# Server name (hostname)
read -p "Server hostname (e.g., api.example.com): " SERVER_NAME

# Proxy server name (backend host header)
read -p "Backend host header (e.g., backend.internal.com): " PROXY_SERVER_NAME
PROXY_SERVER_NAME="${PROXY_SERVER_NAME:-$SERVER_NAME}"

# Profile ID
read -p "Profile ID (dev/int/prod) [default: dev]: " PROFILE_ID
PROFILE_ID="${PROFILE_ID:-dev}"

# Listen port
read -p "Listen port [default: 80]: " LISTEN_PORT
LISTEN_PORT="${LISTEN_PORT:-80}"

# List available rules
echo ""
echo -e "${YELLOW}Available rules:${NC}"
RULES_RESPONSE=$(curl -s -X GET "$GATEWAY_URL/api/rules" \
  -H "Authorization: Bearer $TOKEN")
echo "$RULES_RESPONSE" | jq -r '.data[] | "\(.id) - \(.name)"' 2>/dev/null

echo ""
read -p "Primary rule ID (copy from above): " RULE_ID

# Additional rules (match_cases)
read -p "Add additional rules with AND condition? (y/n): " ADD_MORE

MATCH_CASES="[]"
if [ "$ADD_MORE" == "y" ]; then
    MATCH_CASES="["
    FIRST=true
    while true; do
        read -p "Additional rule ID (or 'done' to finish): " ADDITIONAL_RULE
        if [ "$ADDITIONAL_RULE" == "done" ]; then
            break
        fi
        if [ "$FIRST" == "true" ]; then
            FIRST=false
        else
            MATCH_CASES="$MATCH_CASES,"
        fi
        MATCH_CASES="$MATCH_CASES{\"condition\": \"and\", \"statement\": \"$ADDITIONAL_RULE\"}"
    done
    MATCH_CASES="$MATCH_CASES]"
fi

# Custom headers
read -p "Add custom headers? (y/n): " ADD_HEADERS

CUSTOM_HEADERS="[]"
if [ "$ADD_HEADERS" == "y" ]; then
    CUSTOM_HEADERS="["
    FIRST=true
    while true; do
        read -p "Header key (or 'done' to finish): " HEADER_KEY
        if [ "$HEADER_KEY" == "done" ]; then
            break
        fi
        read -p "Header value: " HEADER_VALUE
        if [ "$FIRST" == "true" ]; then
            FIRST=false
        else
            CUSTOM_HEADERS="$CUSTOM_HEADERS,"
        fi
        CUSTOM_HEADERS="$CUSTOM_HEADERS{\"header_key\": \"$HEADER_KEY\", \"header_value\": \"$HEADER_VALUE\"}"
    done
    CUSTOM_HEADERS="$CUSTOM_HEADERS]"
fi

# Generate nginx config block
CONFIG="server {
      listen $LISTEN_PORT;  # Listen on port (HTTP)
      server_name $SERVER_NAME;  # Your domain name
      root /var/www/html;  # Document root directory
      index index.html;  # Default index files
      access_log logs/access.log;  # Access log file location
      error_log logs/error.log;  # Error log file location



  }

  "

# Build JSON
JSON=$(cat << EOF
{
  "server_name": "$SERVER_NAME",
  "proxy_server_name": "$PROXY_SERVER_NAME",
  "root": "/var/www/html",
  "index": "index.html",
  "access_log": "logs/access.log",
  "error_log": "logs/error.log",
  "config_status": false,
  "listens": [
    {
      "listen": "$LISTEN_PORT"
    }
  ],
  "rules": "$RULE_ID",
  "profile_id": "$PROFILE_ID",
  "config": $(echo "$CONFIG" | jq -Rs .),
  "match_cases": $MATCH_CASES,
  "custom_headers": $CUSTOM_HEADERS
}
EOF
)

echo ""
echo -e "${YELLOW}Creating server with configuration:${NC}"
echo "$JSON" | jq '.'
echo ""

read -p "Proceed? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Cancelled."
    exit 0
fi

RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/servers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "$JSON")

SERVER_ID=$(echo "$RESPONSE" | jq -r '.data.id')

if [ "$SERVER_ID" != "null" ] && [ -n "$SERVER_ID" ]; then
    echo -e "${GREEN}Server created successfully!${NC}"
    echo "Server ID: $SERVER_ID"
    echo ""
    echo "Your domain $SERVER_NAME is now configured!"
else
    echo -e "${RED}Failed to create server${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
