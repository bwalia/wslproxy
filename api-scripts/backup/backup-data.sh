#!/bin/bash
# Backup wslproxy servers and rules data
# Usage: ./backup-data.sh [environment]
# Environment: prod, dev, test, etc. (default: prod)

set -e

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

# Create backup directory if it doesn't exist
echo -e "${YELLOW}Creating backup directory...${NC}"
mkdir -p "$BACKUP_DIR"

# Login and get token
echo -e "${YELLOW}Logging in to wslproxy...${NC}"
LOGIN_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/user/login" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$ADMIN_EMAIL\", \"password\": \"$ADMIN_PASSWORD\"}")

TOKEN=$(echo "$LOGIN_RESPONSE" | jq -r '.data.accessToken')

if [ "$TOKEN" == "null" ] || [ -z "$TOKEN" ]; then
    echo -e "${RED}Login failed!${NC}"
    echo "$LOGIN_RESPONSE" | jq '.' 2>/dev/null || echo "$LOGIN_RESPONSE"
    exit 1
fi

echo -e "${GREEN}Login successful!${NC}"

# Backup servers
echo -e "${YELLOW}Fetching servers...${NC}"
SERVERS_RESPONSE=$(curl -s -X GET "$GATEWAY_URL/api/servers" \
  -H "Authorization: Bearer $TOKEN")

SERVERS_FILE="$BACKUP_DIR/servers_${TIMESTAMP}.json"
echo "$SERVERS_RESPONSE" | jq '.' > "$SERVERS_FILE"

SERVERS_COUNT=$(echo "$SERVERS_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
echo -e "${GREEN}Backed up $SERVERS_COUNT servers to: $SERVERS_FILE${NC}"

# Create latest symlink for servers
ln -sf "servers_${TIMESTAMP}.json" "$BACKUP_DIR/servers_latest.json"

# Backup rules
echo -e "${YELLOW}Fetching rules...${NC}"
RULES_RESPONSE=$(curl -s -X GET "$GATEWAY_URL/api/rules" \
  -H "Authorization: Bearer $TOKEN")

RULES_FILE="$BACKUP_DIR/rules_${TIMESTAMP}.json"
echo "$RULES_RESPONSE" | jq '.' > "$RULES_FILE"

RULES_COUNT=$(echo "$RULES_RESPONSE" | jq '.data | length' 2>/dev/null || echo "0")
echo -e "${GREEN}Backed up $RULES_COUNT rules to: $RULES_FILE${NC}"

# Create latest symlink for rules
ln -sf "rules_${TIMESTAMP}.json" "$BACKUP_DIR/rules_latest.json"

# Backup settings
echo -e "${YELLOW}Fetching settings...${NC}"
SETTINGS_RESPONSE=$(curl -s -X GET "$GATEWAY_URL/api/settings" \
  -H "Authorization: Bearer $TOKEN")

SETTINGS_FILE="$BACKUP_DIR/settings_${TIMESTAMP}.json"
echo "$SETTINGS_RESPONSE" | jq '.' > "$SETTINGS_FILE"

echo -e "${GREEN}Backed up settings to: $SETTINGS_FILE${NC}"

# Create latest symlink for settings
ln -sf "settings_${TIMESTAMP}.json" "$BACKUP_DIR/settings_latest.json"

# Create a combined backup file
echo -e "${YELLOW}Creating combined backup...${NC}"
COMBINED_FILE="$BACKUP_DIR/backup_${TIMESTAMP}.json"
jq -n \
  --arg timestamp "$TIMESTAMP" \
  --arg environment "$ENVIRONMENT" \
  --argjson servers "$(cat "$SERVERS_FILE")" \
  --argjson rules "$(cat "$RULES_FILE")" \
  --argjson settings "$(cat "$SETTINGS_FILE")" \
  '{
    backup_info: {
      timestamp: $timestamp,
      environment: $environment,
      created_at: (now | todate)
    },
    servers: $servers,
    rules: $rules,
    settings: $settings
  }' > "$COMBINED_FILE"

ln -sf "backup_${TIMESTAMP}.json" "$BACKUP_DIR/backup_latest.json"

echo -e "${GREEN}Combined backup saved to: $COMBINED_FILE${NC}"

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
echo -e "Files created:"
echo -e "  - $SERVERS_FILE"
echo -e "  - $RULES_FILE"
echo -e "  - $SETTINGS_FILE"
echo -e "  - $COMBINED_FILE"
echo ""
