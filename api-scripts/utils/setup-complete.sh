#!/bin/bash
# Complete setup example - Create rule and server in one go
# Usage: ./setup-complete.sh

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/../config.sh"

check_jq
TOKEN=$(check_token)

echo -e "${YELLOW}=== Complete wslproxy Setup ===${NC}"
echo ""

# Get domain info
read -p "Domain to configure (e.g., api.example.com): " DOMAIN
read -p "Backend server URL (e.g., https://backend.example.com:8080): " BACKEND_URL
read -p "Rule name: " RULE_NAME
read -p "Profile ID (dev/int/prod) [default: prod]: " PROFILE_ID
PROFILE_ID="${PROFILE_ID:-prod}"

# SSL configuration
echo ""
read -p "Enable SSL (Let's Encrypt)? (y/n) [default: n]: " ENABLE_SSL
ENABLE_SSL="${ENABLE_SSL:-n}"

SSL_JSON=""
if [ "$ENABLE_SSL" == "y" ]; then
    read -p "SSL contact email (required): " SSL_EMAIL
    if [ -z "$SSL_EMAIL" ]; then
        echo -e "${RED}Error: SSL email is required when SSL is enabled${NC}"
        exit 1
    fi
    read -p "Use staging (test) certificates? (y/n) [default: n]: " SSL_STAGING
    SSL_STAGING="${SSL_STAGING:-n}"

    SSL_JSON=",
    \"ssl_enabled\": true,
    \"ssl_email\": \"$SSL_EMAIL\",
    \"ssl_force_https\": true,
    \"ssl_auto_renew\": true,
    \"ssl_staging\": $([ "$SSL_STAGING" == "y" ] && echo "true" || echo "false")"
fi

# Create the rule
echo ""
echo -e "${YELLOW}Step 1: Creating rule...${NC}"

RULE_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/rules" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"name\": \"$RULE_NAME\",
    \"profile_id\": \"$PROFILE_ID\",
    \"priority\": 100,
    \"match\": {
      \"rules\": {
        \"path\": \"/\",
        \"path_key\": \"starts_with\"
      },
      \"response\": {
        \"code\": 305,
        \"redirect_uri\": \"$BACKEND_URL\"
      }
    }
  }")

RULE_ID=$(echo "$RULE_RESPONSE" | jq -r '.data.id')

if [ "$RULE_ID" == "null" ] || [ -z "$RULE_ID" ]; then
    echo -e "${RED}Failed to create rule${NC}"
    echo "$RULE_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}Rule created: $RULE_ID${NC}"

# Create the server
echo ""
echo -e "${YELLOW}Step 2: Creating server...${NC}"

SERVER_RESPONSE=$(curl -s -X POST "$GATEWAY_URL/api/servers" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"server_name\": \"$DOMAIN\",
    \"proxy_server_name\": \"$DOMAIN\",
    \"profile_id\": \"$PROFILE_ID\",
    \"rules\": \"$RULE_ID\"
    $SSL_JSON
  }")

SERVER_ID=$(echo "$SERVER_RESPONSE" | jq -r '.data.id')

if [ "$SERVER_ID" == "null" ] || [ -z "$SERVER_ID" ]; then
    echo -e "${RED}Failed to create server${NC}"
    echo "$SERVER_RESPONSE" | jq '.'
    exit 1
fi

echo -e "${GREEN}Server created: $SERVER_ID${NC}"

# Summary
echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo "Domain: $DOMAIN"
echo "Backend: $BACKEND_URL"
echo "Rule ID: $RULE_ID"
echo "Server ID: $SERVER_ID"
if [ "$ENABLE_SSL" == "y" ]; then
    echo ""
    echo -e "${GREEN}SSL: Enabled${NC}"
    echo "Certificate will be issued on first HTTPS request to https://$DOMAIN"
    echo "Make sure DNS for $DOMAIN points to your gateway server."
    if [ "$SSL_STAGING" == "y" ]; then
        echo -e "${YELLOW}Warning: Using staging certificates (not trusted by browsers)${NC}"
    fi
fi
echo ""
echo "Your gateway is now configured to proxy traffic from"
echo "$DOMAIN to $BACKEND_URL"
