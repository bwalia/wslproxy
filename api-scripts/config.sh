#!/bin/bash
# wslproxy API Configuration
# Source this file in other scripts: source ../config.sh

# Gateway URL - Change this to your gateway address
export GATEWAY_URL="${GATEWAY_URL:-http://localhost:4000}"

# Admin credentials - Change these to your credentials
export ADMIN_EMAIL="${ADMIN_EMAIL:-docker@brahmstra.org}"
export ADMIN_PASSWORD="${ADMIN_PASSWORD:-Admin@123}"

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
