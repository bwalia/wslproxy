#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# ============================================
# Configuration
# ============================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COMPOSE_FILE="$SCRIPT_DIR/docker-compose-local.yml"
ENV_LOCAL_FILE="$SCRIPT_DIR/.env.local"
ADMIN_DIR="$SCRIPT_DIR/openresty-admin"
CONTAINER_NAME="wslproxy-local"

# Ports
HTTP_PORT=8180
HTTPS_PORT=8443
ADMIN_PORT=8280
REDIS_PORT=6479
NODE_APP_PORT=3009
PG_PORT=5436
NEXT_ADMIN_PORT=7619
VITE_ADMIN_PORT=5173
ADMINER_PORT=8380

# ============================================
# Usage and Help
# ============================================
show_help() {
    echo -e "${GREEN}WSLProxy Local Development Environment${NC}"
    echo ""
    echo -e "${BLUE}Usage:${NC}"
    echo "  ./dev.sh [OPTIONS]"
    echo ""
    echo -e "${BLUE}Options:${NC}"
    echo "  -s, --skip-build      Skip admin dashboard build (use existing dist)"
    echo "  -r, --reset           Reset environment (removes volumes and wipes data)"
    echo "  -d, --detach          Run in detached mode (don't attach to logs)"
    echo "  -w, --watch           Enable admin dashboard watch mode (auto-rebuild on changes)"
    echo "  -n, --no-git          Skip all git operations (stash=n, pull=n)"
    echo "  -a, --auto            Auto mode: stash=y, pull=y (no prompts)"
    echo "  -j, --jwt-secret KEY  Set JWT secret key (skips interactive prompt)"
    echo "  --stop                Stop all running services and exit"
    echo "  --clean               Stop services, remove volumes, and exit"
    echo "  --status              Show service status and exit"
    echo "  --reload              Reload nginx config and exit"
    echo "  -h, --help            Show this help message"
    echo ""
    echo -e "${BLUE}Examples:${NC}"
    echo "  ./dev.sh                        # Start everything (interactive)"
    echo "  ./dev.sh -n                     # Start without git operations"
    echo "  ./dev.sh -a                     # Auto mode (stash + pull + start)"
    echo "  ./dev.sh -w                     # Start with admin watch mode"
    echo "  ./dev.sh -s                     # Start without rebuilding admin"
    echo "  ./dev.sh -r                     # Fresh start (reset volumes)"
    echo "  ./dev.sh -d                     # Start detached (background)"
    echo "  ./dev.sh --stop                 # Stop everything"
    echo "  ./dev.sh --clean                # Stop + remove all data"
    echo ""
    echo -e "${BLUE}Access URLs:${NC}"
    echo "  Admin Dashboard:  http://localhost:$ADMIN_PORT"
    echo "  Next.js Admin:    http://localhost:$NEXT_ADMIN_PORT  (new dashboard)"
  echo "  Vite Admin:       http://localhost:$VITE_ADMIN_PORT  (old dashboard)"
  echo "  Adminer:          http://localhost:$ADMINER_PORT  (database UI)"
    echo "  API:              http://localhost:$ADMIN_PORT/api"
    echo "  HTTP Proxy:       http://localhost:$HTTP_PORT"
    echo "  HTTPS Proxy:      https://localhost:$HTTPS_PORT"
    echo "  Demo Node App:    http://localhost:$NODE_APP_PORT (origin backend)"
    echo "  Redis:            localhost:$REDIS_PORT"
    echo "  PostgreSQL:       localhost:$PG_PORT  (user: wslproxy / wslproxy_local_dev)"
    echo ""
    echo -e "${BLUE}Hot-Reload (no restart needed):${NC}"
    echo "  Lua API files (./api/)      Changes reflect per-request automatically"
    echo "  Static HTML (./html/)       Changes reflect immediately"
    echo "  Admin dashboard             Use -w flag for auto-rebuild on save"
    echo "  Nginx config                Run ./dev.sh --reload"
    echo ""
}

# ============================================
# Parse Arguments
# ============================================
SKIP_BUILD=false
RESET=false
DETACH=false
WATCH_ADMIN=false
STASH_ARG=""
PULL_ARG=""
JWT_ARG=""
ACTION=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        -s|--skip-build)
            SKIP_BUILD=true
            shift
            ;;
        -r|--reset)
            RESET=true
            shift
            ;;
        -d|--detach)
            DETACH=true
            shift
            ;;
        -w|--watch)
            WATCH_ADMIN=true
            shift
            ;;
        -a|--auto)
            STASH_ARG="y"
            PULL_ARG="y"
            shift
            ;;
        -n|--no-git)
            STASH_ARG="n"
            PULL_ARG="n"
            shift
            ;;
        -j|--jwt-secret)
            JWT_ARG="$2"
            shift 2
            ;;
        --stop)
            ACTION="stop"
            shift
            ;;
        --clean)
            ACTION="clean"
            shift
            ;;
        --status)
            ACTION="status"
            shift
            ;;
        --reload)
            ACTION="reload"
            shift
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            echo -e "${RED}Unknown option: $1${NC}"
            show_help
            exit 1
            ;;
    esac
done

# ============================================
# Quick Actions (exit after)
# ============================================
if [[ "$ACTION" == "stop" ]]; then
    echo -e "${GREEN}[+] Stopping WSLProxy services...${NC}"
    docker compose -f "$COMPOSE_FILE" down
    echo -e "${GREEN}[+] Services stopped${NC}"
    exit 0
fi

if [[ "$ACTION" == "clean" ]]; then
    echo -e "${YELLOW}[!] Stopping services and removing all volumes...${NC}"
    docker compose -f "$COMPOSE_FILE" down -v
    echo -e "${GREEN}[+] Services stopped and volumes removed${NC}"
    exit 0
fi

if [[ "$ACTION" == "status" ]]; then
    echo ""
    docker compose -f "$COMPOSE_FILE" ps
    echo ""
    if curl -sf "http://localhost:$ADMIN_PORT/health" > /dev/null 2>&1; then
        echo -e "${GREEN}[+] WSLProxy is running and healthy${NC}"
    else
        echo -e "${YELLOW}[!] WSLProxy is not responding on port $ADMIN_PORT${NC}"
    fi
    exit 0
fi

if [[ "$ACTION" == "reload" ]]; then
    echo -e "${GREEN}[+] Reloading nginx configuration...${NC}"
    docker exec "$CONTAINER_NAME" /usr/local/openresty/nginx/sbin/nginx -s reload
    echo -e "${GREEN}[+] Nginx configuration reloaded${NC}"
    exit 0
fi

# ============================================
# Main Development Flow
# ============================================
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}   WSLProxy Development Environment    ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# ============================================
# Functions
# ============================================
prompt_yes_no() {
    local prompt="$1"
    local response
    while true; do
        read -p "$prompt [y/n]: " response
        case "$response" in
            [yY]|[yY][eE][sS]) return 0 ;;
            [nN]|[nN][oO]) return 1 ;;
            *) echo -e "${YELLOW}Please answer y or n.${NC}" ;;
        esac
    done
}

is_yes() {
    case "$1" in
        [yY]|[yY][eE][sS]) return 0 ;;
        *) return 1 ;;
    esac
}

# ============================================
# Step 1: Check Prerequisites
# ============================================
echo -e "${GREEN}[+] Checking prerequisites...${NC}"

missing=0

if ! command -v docker &> /dev/null; then
    echo -e "${RED}[!] Docker is not installed. Install from https://docs.docker.com/get-docker/${NC}"
    missing=1
fi

if ! command -v node &> /dev/null; then
    echo -e "${RED}[!] Node.js is not installed. Install Node.js 16+ from https://nodejs.org/${NC}"
    missing=1
fi

if ! command -v yarn &> /dev/null; then
    echo -e "${YELLOW}[!] Yarn not found, will use npm instead${NC}"
    USE_NPM=true
else
    USE_NPM=false
fi

if ! docker info &> /dev/null 2>&1; then
    echo -e "${RED}[!] Docker daemon is not running. Start Docker Desktop or the Docker service.${NC}"
    missing=1
fi

if [ $missing -eq 1 ]; then
    exit 1
fi

echo -e "${GREEN}[+] All prerequisites met${NC}"
echo ""

# ============================================
# Step 2: Load/Set JWT Secret
# ============================================
# JWT_SECRET_KEY is required by the demo-node-app and injected into openresty-admin/.env
# for Vite builds (VITE_JWT_SECURITY_PASSPHRASE).
#
# If passed via --jwt-secret, use it directly. Otherwise always prompt the user.

if [[ -n "$JWT_ARG" ]]; then
    JWT_SECRET_KEY="$JWT_ARG"
    echo -e "${GREEN}[+] JWT_SECRET_KEY set from --jwt-secret argument${NC}"
else
    echo -e "${YELLOW}[?] JWT Secret Key${NC}"
    echo -e "${BLUE}[i] Required for JWT token signing/validation${NC}"
    echo -e "${BLUE}[i] You can skip this prompt with: ./start.sh --jwt-secret YOUR_KEY${NC}"
    echo ""
    read -p "Enter JWT secret key (or press Enter to generate a random one): " USER_JWT_KEY

    if [ -z "$USER_JWT_KEY" ]; then
        JWT_SECRET_KEY=$(openssl rand -base64 48 | tr -d '/+=' | head -c 64)
        echo -e "${GREEN}[+] Generated random JWT secret${NC}"
    else
        JWT_SECRET_KEY="$USER_JWT_KEY"
        echo -e "${GREEN}[+] JWT_SECRET_KEY set${NC}"
    fi
fi

export JWT_SECRET_KEY

# Inject JWT secret into openresty-admin/.env for Vite build
ADMIN_ENV_FILE="$ADMIN_DIR/.env"
if [ -f "$ADMIN_ENV_FILE" ]; then
    if grep -q "^VITE_JWT_SECURITY_PASSPHRASE=" "$ADMIN_ENV_FILE" 2>/dev/null; then
        # Update existing line
        sed -i.bak "s|^VITE_JWT_SECURITY_PASSPHRASE=.*|VITE_JWT_SECURITY_PASSPHRASE=$JWT_SECRET_KEY|" "$ADMIN_ENV_FILE"
        rm -f "${ADMIN_ENV_FILE}.bak"
    else
        # Append if not present
        echo "VITE_JWT_SECURITY_PASSPHRASE=$JWT_SECRET_KEY" >> "$ADMIN_ENV_FILE"
    fi
    echo -e "${GREEN}[+] JWT secret injected into openresty-admin/.env${NC}"
fi
echo ""

# ============================================
# Step 3: Git Operations
# ============================================
if [[ -n $(git status --porcelain 2>/dev/null) ]]; then
    echo -e "${YELLOW}[!] You have uncommitted changes:${NC}"
    git status --short
    echo ""

    do_stash=false
    if [[ -n "$STASH_ARG" ]]; then
        if is_yes "$STASH_ARG"; then
            do_stash=true
            echo -e "${BLUE}[i] Stash option: yes (from argument)${NC}"
        else
            echo -e "${BLUE}[i] Stash option: no (from argument)${NC}"
        fi
    else
        if prompt_yes_no "Do you want to stash your changes before pulling?"; then
            do_stash=true
        fi
    fi

    if $do_stash; then
        echo -e "${GREEN}[+] Stashing changes...${NC}"
        git stash push -m "Auto-stash before dev run $(date '+%Y-%m-%d %H:%M:%S')"
        echo -e "${GREEN}[+] Changes stashed${NC}"
    fi
else
    echo -e "${GREEN}[+] Working directory clean${NC}"
fi

echo ""

do_pull=false
if [[ -n "$PULL_ARG" ]]; then
    if is_yes "$PULL_ARG"; then
        do_pull=true
        echo -e "${BLUE}[i] Pull option: yes (from argument)${NC}"
    else
        echo -e "${BLUE}[i] Pull option: no (from argument)${NC}"
    fi
else
    if prompt_yes_no "Do you want to pull the latest changes from git?"; then
        do_pull=true
    fi
fi

if $do_pull; then
    echo -e "${GREEN}[+] Pulling latest changes...${NC}"
    git pull origin main
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[+] Git pull completed${NC}"
    else
        echo -e "${RED}[!] Git pull failed. Resolve conflicts and try again.${NC}"
        exit 1
    fi
else
    echo -e "${YELLOW}[+] Skipping git pull${NC}"
fi

echo ""

# ============================================
# Step 4: Build Admin Dashboard (deferred to after container start)
# ============================================
if $SKIP_BUILD; then
    echo -e "${YELLOW}[+] Skipping admin dashboard build (--skip-build)${NC}"
else
    echo -e "${GREEN}[+] Admin dashboard will be built inside the container after startup${NC}"
    echo -e "${BLUE}[i] Source files are bind-mounted, .env is bind-mounted${NC}"
fi

echo ""

# ============================================
# Step 5: Create Required Directories & Files
# ============================================
echo -e "${GREEN}[+] Setting up data directories and permissions...${NC}"

DATA_DIR="$SCRIPT_DIR/data"

# Create all required directories
mkdir -p "$DATA_DIR/servers/dev"
mkdir -p "$DATA_DIR/servers/prod"
mkdir -p "$DATA_DIR/rules"
mkdir -p "$DATA_DIR/ssl"
mkdir -p "$DATA_DIR/ssl-certs/storage/file"
mkdir -p "$DATA_DIR/ssl-certs/letsencrypt/.acme-challenges"
mkdir -p "$DATA_DIR/upstreams/prod"
mkdir -p "$DATA_DIR/instances"
mkdir -p "$DATA_DIR/profiles"
mkdir -p "$DATA_DIR/secrets"
mkdir -p "$DATA_DIR/error-pages"

# Ensure upstreams.conf exists (nginx include will fail without it)
touch "$DATA_DIR/upstreams/prod/upstreams.conf"

# Create settings.json from sample if it doesn't exist
if [ ! -f "$DATA_DIR/settings.json" ]; then
    if [ -f "$DATA_DIR/sample-settings.json" ]; then
        echo -e "${YELLOW}[!] No settings.json found - creating from sample-settings.json${NC}"
        cp "$DATA_DIR/sample-settings.json" "$DATA_DIR/settings.json"
    else
        echo -e "${RED}[!] No settings.json or sample-settings.json found in data/${NC}"
        echo -e "${RED}[!] The application requires data/settings.json to run.${NC}"
        exit 1
    fi
fi

# Set permissions on entire data directory (must be writable by container)
chmod -R 777 "$DATA_DIR"

# Export PostgreSQL credentials for docker-compose
export WSLPROXY_PG_HOST=postgres
export WSLPROXY_PG_PORT=5432
export WSLPROXY_PG_DB=wslproxy
export WSLPROXY_PG_USER=wslproxy
export WSLPROXY_PG_PASSWORD=wslproxy_local_dev

echo -e "${GREEN}[+] Data directories and permissions ready${NC}"
echo ""

# ============================================
# Step 6: Stop Existing Containers
# ============================================
if $RESET; then
    echo -e "${YELLOW}[!] Resetting environment - removing volumes...${NC}"
    docker compose -f "$COMPOSE_FILE" down --volumes 2>/dev/null
else
    echo -e "${GREEN}[+] Stopping existing containers (preserving data)...${NC}"
    docker compose -f "$COMPOSE_FILE" down 2>/dev/null
fi

echo ""

# ============================================
# Step 7: Start Containers
# ============================================
echo -e "${GREEN}[+] Building and starting containers...${NC}"
echo ""

ENV_FILE_ARG=""
if [ -f "$ENV_LOCAL_FILE" ]; then
    ENV_FILE_ARG="--env-file $ENV_LOCAL_FILE"
fi
docker compose -f "$COMPOSE_FILE" $ENV_FILE_ARG up --build -d

echo ""

# ============================================
# Step 8: Wait for Services
# ============================================
echo -e "${GREEN}[+] Waiting for services to be healthy...${NC}"

max_attempts=30
attempt=0
while [ $attempt -lt $max_attempts ]; do
    if curl -sf "http://localhost:$ADMIN_PORT/health" > /dev/null 2>&1; then
        echo -e "${GREEN}[+] Services are healthy!${NC}"
        break
    fi
    attempt=$((attempt + 1))
    printf "."
    sleep 2
done
echo ""

if [ $attempt -eq $max_attempts ]; then
    echo -e "${YELLOW}[!] Services may not be fully ready yet${NC}"
fi

echo ""

# ============================================
# Step 9: Build Admin Dashboard Inside Container
# ============================================
if ! $SKIP_BUILD; then
    echo -e "${GREEN}[+] Installing dependencies and building admin dashboard inside container...${NC}"
    echo -e "${BLUE}[i] This uses the container's Node/Yarn with bind-mounted source and .env${NC}"

    docker exec "$CONTAINER_NAME" sh -c "\
        cd /usr/local/openresty/nginx/html/openresty-admin && \
        yarn install --network-timeout 300000 && \
        yarn build" 2>&1

    if [ $? -eq 0 ]; then
        echo -e "${GREEN}[+] Admin dashboard built successfully inside container${NC}"
    else
        echo -e "${RED}[!] Admin dashboard build failed. You can retry manually:${NC}"
        echo -e "${YELLOW}    docker exec $CONTAINER_NAME sh -c 'cd /usr/local/openresty/nginx/html/openresty-admin && yarn build'${NC}"
    fi
else
    echo -e "${BLUE}[i] Skipped admin build (--skip-build)${NC}"
fi

echo ""

# ============================================
# Step 10: Fix Container Permissions
# ============================================
echo -e "${GREEN}[+] Fixing container permissions (logs, data)...${NC}"

# The Docker image symlinks nginx/logs/access.log → /dev/stdout and error.log → /dev/stderr
# The dashboard Lua API reads from these paths but can't read /dev/stderr as a file.
# Fix: replace symlinks to point to the actual log files in /var/log/nginx/
docker exec "$CONTAINER_NAME" sh -c "\
  rm -f /usr/local/openresty/nginx/logs/access.log /usr/local/openresty/nginx/logs/error.log && \
  ln -sf /var/log/nginx/access.log /usr/local/openresty/nginx/logs/access.log && \
  ln -sf /var/log/nginx/error.log /usr/local/openresty/nginx/logs/error.log && \
  chmod 666 /var/log/nginx/access.log /var/log/nginx/error.log && \
  chmod 755 /var/log/nginx/" 2>/dev/null

# Reload nginx so it writes to the real log files instead of /dev/stderr
docker exec "$CONTAINER_NAME" /usr/local/openresty/nginx/sbin/nginx -s reload 2>/dev/null

echo -e "${GREEN}[+] Container permissions set${NC}"
echo ""

# ============================================
# Step 11: Start Admin Watch Mode (if requested)
# ============================================
WATCH_PID=""

if $WATCH_ADMIN; then
    echo -e "${GREEN}[+] Starting admin dashboard watch mode inside container (auto-rebuild on changes)...${NC}"
    echo -e "${BLUE}[i] Source files are bind-mounted — saves on your Mac trigger rebuilds in the container${NC}"

    docker exec -d "$CONTAINER_NAME" sh -c "\
        cd /usr/local/openresty/nginx/html/openresty-admin && \
        npx vite build --watch"

    echo -e "${GREEN}[+] Watch mode running inside container${NC}"
    echo ""
fi

# ============================================
# Step 12: Print URLs and Attach to Logs
# ============================================
echo -e "${CYAN}========================================${NC}"
echo -e "${CYAN}   WSLProxy is running!                ${NC}"
echo -e "${CYAN}========================================${NC}"
echo ""
echo -e "  Admin Dashboard:  ${GREEN}http://localhost:$ADMIN_PORT${NC}"
echo -e "  Next.js Admin:    ${GREEN}http://localhost:$NEXT_ADMIN_PORT${NC}  (new dashboard)"
echo -e "  Vite Admin:       ${GREEN}http://localhost:$VITE_ADMIN_PORT${NC}  (old dashboard)"
echo -e "  Adminer:          ${GREEN}http://localhost:$ADMINER_PORT${NC}  (database UI)"
echo -e "  API:              ${GREEN}http://localhost:$ADMIN_PORT/api${NC}"
echo -e "  HTTP Proxy:       ${GREEN}http://localhost:$HTTP_PORT${NC}"
echo -e "  HTTPS Proxy:      ${GREEN}https://localhost:$HTTPS_PORT${NC}"
echo -e "  Demo Node App:    ${GREEN}http://localhost:$NODE_APP_PORT${NC}  (origin backend at 172.177.0.10)"
echo -e "  Prometheus:       ${GREEN}http://localhost:$ADMIN_PORT/metrics${NC}"
echo -e "  Redis:            ${GREEN}localhost:$REDIS_PORT${NC}"
echo -e "  PostgreSQL:       ${GREEN}localhost:$PG_PORT${NC}  (user: wslproxy / wslproxy_local_dev)"
echo ""
echo -e "${CYAN}  Hot-Reload (no restart needed):${NC}"
echo -e "  Lua API files (./api/)      → changes reflect per-request"
echo -e "  Static HTML (./html/)       → changes reflect immediately"
if $WATCH_ADMIN; then
echo -e "  Admin dashboard (src/)      → ${GREEN}watch mode active, auto-rebuilds on save${NC}"
else
echo -e "  Admin dashboard             → restart with ${YELLOW}-w${NC} flag for auto-rebuild"
fi
echo -e "  Demo Node App (server.js)   → nodemon auto-restarts on file changes"
echo -e "  Nginx config                → run ${YELLOW}./dev.sh --reload${NC} to apply"
echo ""
echo -e "${CYAN}  Quick Commands:${NC}"
echo -e "  Stop:     ${YELLOW}./dev.sh --stop${NC}"
echo -e "  Reload:   ${YELLOW}./dev.sh --reload${NC}"
echo -e "  Status:   ${YELLOW}./dev.sh --status${NC}"
echo -e "  Clean:    ${YELLOW}./dev.sh --clean${NC}"
echo ""
echo -e "${CYAN}========================================${NC}"
echo ""

# Cleanup function for watch mode
cleanup() {
    echo ""
    echo -e "${GREEN}[+] Shutting down...${NC}"
    if [[ -n "$WATCH_PID" ]] && kill -0 "$WATCH_PID" 2>/dev/null; then
        echo -e "${GREEN}[+] Stopping admin watch mode...${NC}"
        kill "$WATCH_PID" 2>/dev/null
        wait "$WATCH_PID" 2>/dev/null
    fi
    echo -e "${GREEN}[+] Stopping containers...${NC}"
    docker compose -f "$COMPOSE_FILE" down
    echo -e "${GREEN}[+] Done. Goodbye!${NC}"
    exit 0
}

if $DETACH; then
    echo -e "${GREEN}[+] Running in detached mode. Use ./dev.sh --stop to stop.${NC}"
    exit 0
fi

# Attach to logs (Ctrl+C to stop everything)
trap cleanup SIGINT SIGTERM

echo -e "${BLUE}[i] Attaching to container logs... Press Ctrl+C to stop everything.${NC}"
echo ""

docker compose -f "$COMPOSE_FILE" logs -f --tail=100
