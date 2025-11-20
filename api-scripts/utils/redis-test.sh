#!/bin/bash
# Test Redis connection
# Usage: ./redis-test.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

echo -e "${YELLOW}Testing Redis connection...${NC}"

RESPONSE=$(curl -s -X GET "$GATEWAY_URL/redis-connect")

if echo "$RESPONSE" | grep -q "dog"; then
    echo -e "${GREEN}Redis connection successful!${NC}"
else
    echo -e "${RED}Redis connection failed${NC}"
fi

echo "$RESPONSE"
