#!/bin/bash
# sync-configs.sh - Synchronize server configs and rules to target environment
# Usage: ./sync-configs.sh <environment> <target_host> [ssh_key_path]
#
# This script copies server and rule configurations from the local data folder
# to the remote server's /opt/nginx/data directory.
#
# Examples:
#   ./sync-configs.sh prod 185.237.99.238
#   ./sync-configs.sh int api-int.wslproxy.com ~/.ssh/id_rsa
#   ./sync-configs.sh test 192.168.1.100 /path/to/key.pem

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DATA_DIR="${SCRIPT_DIR}/data"
REMOTE_DATA_DIR="/opt/nginx/data"
SSH_USER="${SSH_USER:-root}"

# Functions
log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[WARNING]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

usage() {
    echo "Usage: $0 <environment> <target_host> [ssh_key_path]"
    echo ""
    echo "Arguments:"
    echo "  environment    Target environment (dev, int, test, acc, prod)"
    echo "  target_host    Target server hostname or IP address"
    echo "  ssh_key_path   Optional path to SSH private key"
    echo ""
    echo "Environment Variables:"
    echo "  SSH_USER       SSH username (default: root)"
    echo ""
    echo "Examples:"
    echo "  $0 prod 185.237.99.238"
    echo "  $0 int api-int.wslproxy.com ~/.ssh/id_rsa"
    echo "  SSH_USER=admin $0 test 192.168.1.100"
    exit 1
}

validate_environment() {
    local env="$1"
    case "$env" in
        dev|int|test|acc|prod)
            return 0
            ;;
        *)
            log_error "Invalid environment: $env"
            log_error "Valid environments: dev, int, test, acc, prod"
            exit 1
            ;;
    esac
}

validate_local_configs() {
    local env="$1"
    local servers_dir="${DATA_DIR}/servers/${env}"
    local rules_dir="${DATA_DIR}/rules/${env}"
    
    if [[ ! -d "$servers_dir" ]]; then
        log_warning "Servers directory not found: $servers_dir"
        mkdir -p "$servers_dir"
        log_info "Created servers directory: $servers_dir"
    fi
    
    if [[ ! -d "$rules_dir" ]]; then
        log_warning "Rules directory not found: $rules_dir"
        mkdir -p "$rules_dir"
        log_info "Created rules directory: $rules_dir"
    fi
    
    # Validate JSON files
    local has_errors=0
    for json_file in "$servers_dir"/*.json "$rules_dir"/*.json; do
        if [[ -f "$json_file" ]]; then
            if ! jq empty "$json_file" 2>/dev/null; then
                log_error "Invalid JSON: $json_file"
                has_errors=1
            fi
        fi
    done
    
    if [[ $has_errors -eq 1 ]]; then
        log_error "JSON validation failed. Please fix the errors above."
        exit 1
    fi
    
    log_success "All JSON files validated successfully"
}

sync_configs() {
    local env="$1"
    local target_host="$2"
    local ssh_key="${3:-}"
    
    local ssh_opts="-o StrictHostKeyChecking=no -o ConnectTimeout=10"
    if [[ -n "$ssh_key" ]]; then
        ssh_opts="$ssh_opts -i $ssh_key"
    fi
    
    local servers_dir="${DATA_DIR}/servers/${env}"
    local rules_dir="${DATA_DIR}/rules/${env}"
    local remote_servers_dir="${REMOTE_DATA_DIR}/servers/${env}"
    local remote_rules_dir="${REMOTE_DATA_DIR}/rules/${env}"
    
    log_info "Syncing configs for environment: $env"
    log_info "Target host: $target_host"
    
    # Create remote directories
    log_info "Creating remote directories..."
    ssh $ssh_opts "${SSH_USER}@${target_host}" "mkdir -p ${remote_servers_dir} ${remote_rules_dir}"
    
    # Sync servers
    local server_count=0
    for server_file in "$servers_dir"/*.json; do
        if [[ -f "$server_file" ]]; then
            local filename=$(basename "$server_file")
            log_info "Syncing server: $filename"
            scp $ssh_opts "$server_file" "${SSH_USER}@${target_host}:${remote_servers_dir}/${filename}"
            ((server_count++))
        fi
    done
    
    # Sync rules
    local rule_count=0
    for rule_file in "$rules_dir"/*.json; do
        if [[ -f "$rule_file" ]]; then
            local filename=$(basename "$rule_file")
            log_info "Syncing rule: $filename"
            scp $ssh_opts "$rule_file" "${SSH_USER}@${target_host}:${remote_rules_dir}/${filename}"
            ((rule_count++))
        fi
    done
    
    log_success "Sync completed!"
    log_info "Servers synced: $server_count"
    log_info "Rules synced: $rule_count"
    
    # Verify sync
    log_info "Verifying remote files..."
    ssh $ssh_opts "${SSH_USER}@${target_host}" "ls -la ${remote_servers_dir}/ ${remote_rules_dir}/ 2>/dev/null || echo 'No files found'"
}

# Main
main() {
    if [[ $# -lt 2 ]]; then
        usage
    fi
    
    local environment="$1"
    local target_host="$2"
    local ssh_key="${3:-}"
    
    log_info "WSLProxy Config Sync Tool"
    log_info "========================="
    
    validate_environment "$environment"
    validate_local_configs "$environment"
    sync_configs "$environment" "$target_host" "$ssh_key"
    
    log_success "All done! Configs have been deployed to $target_host"
}

main "$@"
