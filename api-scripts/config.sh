#!/bin/bash
# wslproxy API Configuration
# Source this file in other scripts: source ../config.sh

# Priority: 1. CREDS_FILE (JSON file), 2. Environment variables, 3. Defaults

# Set defaults first (only if not already set)
: "${GATEWAY_URL:=http://localhost:8080}"
: "${ADMIN_EMAIL:=admin@wslproxy.org}"
: "${ADMIN_PASSWORD:=ChangeMe}"

# Function to load credentials from JSON file (overrides env vars and defaults)
# JSON file format: {"ADMIN_EMAIL": "...", "ADMIN_PASSWORD": "...", "GATEWAY_URL": "..."}
load_creds_from_json() {
    local creds_file="$1"
    if [ -f "$creds_file" ]; then
        if command -v jq &> /dev/null; then
            local json_gateway=$(jq -r '.GATEWAY_URL // empty' "$creds_file" 2>/dev/null)
            local json_email=$(jq -r '.ADMIN_EMAIL // empty' "$creds_file" 2>/dev/null)
            local json_password=$(jq -r '.ADMIN_PASSWORD // empty' "$creds_file" 2>/dev/null)

            # Only override if JSON has a non-empty value
            [ -n "$json_gateway" ] && GATEWAY_URL="$json_gateway"
            [ -n "$json_email" ] && ADMIN_EMAIL="$json_email"
            [ -n "$json_password" ] && ADMIN_PASSWORD="$json_password"
            return 0
        fi
    fi
    return 1
}

# Load from JSON file if CREDS_FILE is set (highest priority)
if [ -n "$CREDS_FILE" ] && [ -f "$CREDS_FILE" ]; then
    load_creds_from_json "$CREDS_FILE"
fi

# Export the final values
export GATEWAY_URL
export ADMIN_EMAIL
export ADMIN_PASSWORD

# Token file location
export TOKEN_FILE="/tmp/wslproxy_token"

# Colors for output
export RED='\033[0;31m'
export GREEN='\033[0;32m'
export YELLOW='\033[1;33m'
export NC='\033[0m' # No Color

# Helper function to check if jq is installed
check_jq() {
    if ! command -v jq &> /dev/null; then
        echo -e "${RED}Error: jq is required but not installed.${NC}"
        echo "Install with: brew install jq (macOS) or apt-get install jq (Linux)"
        exit 1
    fi
}

# Helper function to get token
get_token() {
    if [ -f "$TOKEN_FILE" ]; then
        cat "$TOKEN_FILE"
    else
        echo ""
    fi
}

# Helper function to check token validity
check_token() {
    local token=$(get_token)
    if [ -z "$token" ]; then
        echo -e "${RED}Error: No token found. Please run auth/login.sh first.${NC}"
        exit 1
    fi
    echo "$token"
}

# Helper function for API responses
print_response() {
    local response="$1"
    local success_msg="$2"

    if echo "$response" | jq -e '.data' > /dev/null 2>&1; then
        echo -e "${GREEN}$success_msg${NC}"
        echo "$response" | jq '.'
    else
        echo -e "${RED}Error:${NC}"
        echo "$response" | jq '.' 2>/dev/null || echo "$response"
    fi
}
