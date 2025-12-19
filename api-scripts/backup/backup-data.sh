#!/bin/bash
# Backup wslproxy servers and rules data
# Usage: ./backup-data.sh [environment]
# Environment: prod, dev, test, etc. (default: prod)
#
# Output files (easily importable):
#   - servers_<timestamp>.json  - Array of server objects
#   - rules_<timestamp>.json    - Array of rule objects
#   - settings_<timestamp>.json - Settings object

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

# Parse arguments
ENVIRONMENT="${1:-prod}"
BACKUP_BASE_DIR="${BACKUP_BASE_DIR:-/home/bwalia/backups/wslproxy}"
BACKUP_DIR="$BACKUP_BASE_DIR/$ENVIRONMENT"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

echo -e "${YELLOW}========================================${NC}"
echo -e "${YELLOW}WSLProxy Backup Script${NC}"
echo -e "${YELLOW}Environment: $ENVIRONMENT${NC}"
echo -e "${YELLOW}Backup Directory: $BACKUP_DIR${NC}"
echo -e "${YELLOW}Timestamp: $TIMESTAMP${NC}"
echo -e "${YELLOW}========================================${NC}"

# Check jq is installed
check_jq

# Helper function to check if response is valid JSON
is_valid_json() {
    echo "$1" | jq empty 2>/dev/null
    return $?
}

# Helper function to make API request with error handling
api_request() {
    local method="$1"
    local endpoint="$2"
    local token="$3"
    local data="$4"
    local response=""
    local http_code=""

    if [ -n "$token" ]; then
        response=$(curl -s -w "\n%{http_code}" --connect-timeout 10 --max-time 30 \
            -X "$method" "$GATEWAY_URL$endpoint" \
            -H "Content-Type: application/json" \
            -H "Authorization: Bearer $token" \
            ${data:+-d "$data"})
    else
        response=$(curl -s -w "\n%{http_code}" --connect-timeout 10 --max-time 30 \
            -X "$method" "$GATEWAY_URL$endpoint" \
            -H "Content-Type: application/json" \
            ${data:+-d "$data"})
    fi

    # Extract HTTP code (last line) and body (everything else)
    http_code=$(echo "$response" | tail -n1)
    body=$(echo "$response" | sed '$d')

    # Check for connection errors (http_code will be 000)
    if [ "$http_code" = "000" ]; then
        echo -e "${RED}Connection failed to $GATEWAY_URL$endpoint${NC}" >&2
        echo -e "${RED}Please check if the server is running and accessible.${NC}" >&2
        return 1
    fi

    # Check HTTP status code
    if [ "$http_code" -lt 200 ] || [ "$http_code" -ge 300 ]; then
        echo -e "${RED}HTTP Error: $http_code${NC}" >&2
        echo -e "${RED}Response: $body${NC}" >&2
        return 1
    fi

    # Check if response is valid JSON
    if ! is_valid_json "$body"; then
        echo -e "${RED}Invalid JSON response from $endpoint${NC}" >&2
        echo -e "${RED}Response (first 500 chars): ${body:0:500}${NC}" >&2
        return 1
    fi

    echo "$body"
    return 0
}

# Create backup directory if it doesn't exist
echo -e "${YELLOW}Creating backup directory...${NC}"
mkdir -p "$BACKUP_DIR"

# Login and get token
echo -e "${YELLOW}Logging in to wslproxy...${NC}"
echo -e "Gateway URL: $GATEWAY_URL"
echo -e "Admin Email: $ADMIN_EMAIL"

LOGIN_DATA="{\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}"
LOGIN_RESPONSE=$(api_request "POST" "/api/user/login" "" "$LOGIN_DATA")

if [ $? -ne 0 ]; then
    echo -e "${RED}Login request failed!${NC}"
    exit 1
fi

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken // empty')

if [ -z "$TOKEN" ]; then
    echo -e "${RED}Login failed! No access token received.${NC}"
    echo -e "${RED}Response: $LOGIN_RESPONSE${NC}"
    exit 1
fi

echo -e "${GREEN}Login successful!${NC}"

# Backup servers - extract just the data array for easy import
echo -e "${YELLOW}Fetching servers...${NC}"
SERVERS_RESPONSE=$(api_request "GET" "/api/servers" "$TOKEN")

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to fetch servers!${NC}"
    exit 1
fi

SERVERS_FILE="$BACKUP_DIR/servers_${TIMESTAMP}.json"
# Extract just the data array (the actual servers) for easy import
echo "$SERVERS_RESPONSE" | jq '.data // []' > "$SERVERS_FILE"

SERVERS_COUNT=$(jq 'length' "$SERVERS_FILE" 2>/dev/null || echo "0")
echo -e "${GREEN}Backed up $SERVERS_COUNT servers to: $SERVERS_FILE${NC}"

# Create latest symlink for servers
ln -sf "servers_${TIMESTAMP}.json" "$BACKUP_DIR/servers_latest.json"

# Backup rules - extract just the data array for easy import
echo -e "${YELLOW}Fetching rules...${NC}"
RULES_RESPONSE=$(api_request "GET" "/api/rules" "$TOKEN")

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to fetch rules!${NC}"
    exit 1
fi

RULES_FILE="$BACKUP_DIR/rules_${TIMESTAMP}.json"
# Extract just the data array (the actual rules) for easy import
echo "$RULES_RESPONSE" | jq '.data // []' > "$RULES_FILE"

RULES_COUNT=$(jq 'length' "$RULES_FILE" 2>/dev/null || echo "0")
echo -e "${GREEN}Backed up $RULES_COUNT rules to: $RULES_FILE${NC}"

# Create latest symlink for rules
ln -sf "rules_${TIMESTAMP}.json" "$BACKUP_DIR/rules_latest.json"

# Backup settings
echo -e "${YELLOW}Fetching settings...${NC}"
SETTINGS_RESPONSE=$(api_request "GET" "/api/settings" "$TOKEN")

if [ $? -ne 0 ]; then
    echo -e "${RED}Failed to fetch settings!${NC}"
    exit 1
fi

SETTINGS_FILE="$BACKUP_DIR/settings_${TIMESTAMP}.json"
# Extract just the data object for easy import
echo "$SETTINGS_RESPONSE" | jq '.data // {}' > "$SETTINGS_FILE"

echo -e "${GREEN}Backed up settings to: $SETTINGS_FILE${NC}"

# Create latest symlink for settings
ln -sf "settings_${TIMESTAMP}.json" "$BACKUP_DIR/settings_latest.json"

# Create backup metadata file (simple, no complex jq operations)
echo -e "${YELLOW}Creating backup metadata...${NC}"
METADATA_FILE="$BACKUP_DIR/backup_metadata_${TIMESTAMP}.json"
cat > "$METADATA_FILE" << EOF
{
  "timestamp": "$TIMESTAMP",
  "environment": "$ENVIRONMENT",
  "created_at": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")",
  "servers_count": $SERVERS_COUNT,
  "rules_count": $RULES_COUNT,
  "files": {
    "servers": "servers_${TIMESTAMP}.json",
    "rules": "rules_${TIMESTAMP}.json",
    "settings": "settings_${TIMESTAMP}.json"
  }
}
EOF

ln -sf "backup_metadata_${TIMESTAMP}.json" "$BACKUP_DIR/backup_metadata_latest.json"

echo -e "${GREEN}Metadata saved to: $METADATA_FILE${NC}"

# Cleanup old backups (keep last 30 days)
echo -e "${YELLOW}Cleaning up old backups (keeping last 30 days)...${NC}"
find "$BACKUP_DIR" -name "*.json" -type f -mtime +30 ! -name "*_latest.json" -delete 2>/dev/null || true

# Print summary
echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}Backup completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo -e "Environment: $ENVIRONMENT"
echo -e "Backup Directory: $BACKUP_DIR"
echo -e "Servers backed up: $SERVERS_COUNT"
echo -e "Rules backed up: $RULES_COUNT"
echo ""
echo -e "Files created (importable JSON):"
echo -e "  - $SERVERS_FILE"
echo -e "  - $RULES_FILE"
echo -e "  - $SETTINGS_FILE"
echo -e "  - $METADATA_FILE"
echo ""
echo -e "Latest symlinks:"
echo -e "  - $BACKUP_DIR/servers_latest.json"
echo -e "  - $BACKUP_DIR/rules_latest.json"
echo -e "  - $BACKUP_DIR/settings_latest.json"
echo ""
