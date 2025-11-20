#!/bin/bash
# Logout from wslproxy (removes stored token)
# Usage: ./logout.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

if [ -f "$TOKEN_FILE" ]; then
    rm "$TOKEN_FILE"
    echo -e "${GREEN}Logged out successfully. Token removed.${NC}"
else
    echo -e "${YELLOW}No active session found.${NC}"
fi
