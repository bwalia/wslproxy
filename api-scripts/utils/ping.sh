#!/bin/bash
# Health check / Ping
# Usage: ./ping.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

echo -e "${YELLOW}Pinging gateway...${NC}"

RESPONSE=$(curl -s -X GET "$GATEWAY_URL/ping")

if [ -n "$RESPONSE" ]; then
    echo -e "${GREEN}Gateway is running!${NC}"
    echo "$RESPONSE" | jq '.' 2>/dev/null || echo "$RESPONSE"
else
    echo -e "${RED}Gateway is not responding${NC}"
    exit 1
fi
