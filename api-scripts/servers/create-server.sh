#!/bin/bash
# Create a new server in WhiteFalcon
# Usage: ./create-server.sh <json-file>
# Example: ./create-server.sh server.json

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
  "server_name": "api.example.com",
  "proxy_server_name": "backend.internal.com",
  "root": "/var/www/html",
  "index": "index.html",
  "access_log": "logs/access.log",
  "error_log": "logs/error.log",
  "config_status": false,
  "listens": [
    {
      "listen": "80"
    }
  ],
  "rules": "rule-uuid-here",
  "profile_id": "dev",
  "config": "server {\n      listen 80;  # Listen on port (HTTP)\n      server_name api.example.com;  # Your domain name\n      root /var/www/html;  # Document root directory\n      index index.html;  # Default index files\n      access_log logs/access.log;  # Access log file location\n      error_log logs/error.log;  # Error log file location\n\n      \n      \n  }\n  \n  ",
  "match_cases": [],
  "custom_headers": [
    {
      "header_key": "X-Custom",
      "header_value": "value"
    }
  ]
}
EOF
    exit 1
fi

JSON_FILE="$1"

if [ ! -f "$JSON_FILE" ]; then
    echo -e "${RED}Error: File not found: $JSON_FILE${NC}"
    exit 1
fi

echo -e "${YELLOW}Creating server...${NC}"

RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/servers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d @"$JSON_FILE")

SERVER_ID=$(echo "$RESPONSE" | jq -r '.data.id')

if [ "$SERVER_ID" != "null" ] && [ -n "$SERVER_ID" ]; then
    echo -e "${GREEN}Server created successfully!${NC}"
    echo "Server ID: $SERVER_ID"
    echo ""
    echo "$RESPONSE" | jq '.'
else
    echo -e "${RED}Failed to create server${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
    exit 1
fi
