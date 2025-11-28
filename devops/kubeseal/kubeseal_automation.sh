#!/bin/bash
#
# Kubeseal Automation Script for Whitefalcon/wslproxy
#
# This script automates the process of sealing Kubernetes secrets using kubeseal.
# It takes environment-specific secrets, seals them, and updates Helm values files.
#
# Usage: ./kubeseal_automation.sh <base64_env_file> <env_ref> <namespace> <target_type> [base64_settings_file]
#
# Arguments:
#   base64_env_file      - Base64 encoded .env file content (required)
#   env_ref              - Environment reference: dev, int, test, acc, prod (required)
#   namespace            - Kubernetes namespace (required)
#   target_type          - Deployment type: api or front (required)
#   base64_settings_file - Base64 encoded settings file content (optional)
#
# Example:
#   ./kubeseal_automation.sh "$ENV_FILE_BASE64" "test" "test" "api" "$SETTINGS_BASE64"
#

set -euo pipefail

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly NC='\033[0m' # No Color

# Script configuration
readonly SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
readonly PROJECT_ROOT="$(cd "${SCRIPT_DIR}/../.." && pwd)"
readonly HELM_CHART_DIR="${PROJECT_ROOT}/devops/helm-charts/whitefalcon"
readonly KUBESEAL_CONTROLLER_NAME="sealed-secrets-controller"
readonly KUBESEAL_CONTROLLER_NAMESPACE="kube-system"

# Logging functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1" >&2
}

log_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

# Cleanup function for temporary files
cleanup() {
    local exit_code=$?
    if [[ -n "${TEMP_DIR:-}" && -d "${TEMP_DIR}" ]]; then
        log_info "Cleaning up temporary files..."
        rm -rf "${TEMP_DIR}"
    fi
    exit $exit_code
}

trap cleanup EXIT

# Validate required parameters
validate_parameters() {
    if [[ -z "${1:-}" ]]; then
        log_error "Missing base64 encoded environment file content as first parameter"
        echo "Usage: $0 <base64_env_file> <env_ref> <namespace> <target_type> [base64_settings_file]"
        exit 1
    fi

    if [[ -z "${2:-}" ]]; then
        log_error "Missing environment reference (dev, int, test, acc, prod) as second parameter"
        exit 1
    fi

    if [[ -z "${3:-}" ]]; then
        log_error "Missing namespace as third parameter"
        exit 1
    fi

    if [[ -z "${4:-}" ]]; then
        log_error "Missing target type (api or front) as fourth parameter"
        exit 1
    fi

    # Validate environment reference
    case "${2}" in
        dev|int|test|acc|prod) ;;
        *)
            log_error "Invalid environment reference: ${2}. Must be one of: dev, int, test, acc, prod"
            exit 1
            ;;
    esac

    # Validate target type
    case "${4}" in
        api|front) ;;
        *)
            log_error "Invalid target type: ${4}. Must be one of: api, front"
            exit 1
            ;;
    esac
}

# Validate base64 content
validate_base64() {
    local content="$1"
    local name="$2"

    if ! echo "${content}" | base64 -d > /dev/null 2>&1; then
        log_error "Invalid base64 content provided for ${name}"
        exit 1
    fi
    log_info "Valid base64 content provided for ${name}"
}

# Detect operating system
detect_os() {
    if [[ "$OSTYPE" == "darwin"* ]]; then
        log_info "Running on macOS"
        echo "macos"
    elif [[ "$OSTYPE" == "linux-gnu"* ]] || [[ "$OSTYPE" == "linux"* ]]; then
        if [[ -f /etc/os-release ]]; then
            . /etc/os-release
            log_info "Running on ${NAME}"
            if [[ "${NAME}" == *"Ubuntu"* ]]; then
                echo "ubuntu"
            else
                echo "linux"
            fi
        else
            log_info "Running on Linux"
            echo "linux"
        fi
    else
        log_error "Unsupported operating system: $OSTYPE"
        exit 1
    fi
}

# Install kubeseal if not present
install_kubeseal() {
    local os_type="$1"

    log_info "Installing kubeseal..."

    local kubeseal_version
    kubeseal_version=$(curl -s https://api.github.com/repos/bitnami-labs/sealed-secrets/releases/latest | grep tag_name | cut -d '"' -f 4 | cut -d 'v' -f 2)

    if [[ -z "${kubeseal_version}" ]]; then
        log_error "Failed to fetch latest kubeseal version"
        exit 1
    fi

    log_info "Installing kubeseal version: ${kubeseal_version}"

    case "${os_type}" in
        macos)
            if command -v brew &> /dev/null; then
                brew install kubeseal
            else
                curl -L "https://github.com/bitnami-labs/sealed-secrets/releases/download/v${kubeseal_version}/kubeseal-${kubeseal_version}-darwin-amd64.tar.gz" -o kubeseal.tar.gz
                tar -xzf kubeseal.tar.gz kubeseal
                sudo mv kubeseal /usr/local/bin/
                rm kubeseal.tar.gz
            fi
            ;;
        ubuntu|linux)
            wget -q "https://github.com/bitnami-labs/sealed-secrets/releases/download/v${kubeseal_version}/kubeseal-${kubeseal_version}-linux-amd64.tar.gz"
            tar -xzf "kubeseal-${kubeseal_version}-linux-amd64.tar.gz" kubeseal
            sudo install -m 755 kubeseal /usr/local/bin/kubeseal
            rm -f kubeseal "kubeseal-${kubeseal_version}-linux-amd64.tar.gz"
            ;;
    esac

    if ! command -v kubeseal &> /dev/null; then
        log_error "Failed to install kubeseal"
        exit 1
    fi

    log_info "kubeseal installed successfully"
}

# Check and install required tools
check_dependencies() {
    local os_type="$1"

    log_step "Checking dependencies..."

    # Check kubeseal
    if ! command -v kubeseal &> /dev/null; then
        log_warn "kubeseal not found, installing..."
        install_kubeseal "${os_type}"
    fi
    log_info "kubeseal found: $(which kubeseal)"
    log_info "kubeseal version: $(kubeseal --version)"

    # Check yq
    if ! command -v yq &> /dev/null; then
        log_warn "yq not found, installing..."
        case "${os_type}" in
            macos)
                brew install yq
                ;;
            ubuntu)
                sudo snap install yq || sudo apt-get install -y yq
                ;;
            linux)
                YQ_VERSION=$(curl -s https://api.github.com/repos/mikefarah/yq/releases/latest | grep tag_name | cut -d '"' -f 4)
                wget -q "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_amd64" -O /tmp/yq
                sudo install -m 755 /tmp/yq /usr/local/bin/yq
                rm -f /tmp/yq
                ;;
        esac
    fi

    if ! command -v yq &> /dev/null; then
        log_error "yq is required but could not be installed"
        exit 1
    fi
    log_info "yq found: $(which yq)"

    # Check kubectl
    if ! command -v kubectl &> /dev/null; then
        log_warn "kubectl not found, installing..."
        curl -LO "https://dl.k8s.io/release/$(curl -L -s https://dl.k8s.io/release/stable.txt)/bin/linux/amd64/kubectl"
        chmod +x kubectl
        sudo mv kubectl /usr/local/bin/
    fi
    log_info "kubectl found: $(which kubectl)"

    # Check python3
    if ! command -v python3 &> /dev/null; then
        log_error "python3 is required but not installed"
        exit 1
    fi
    log_info "python3 found: $(which python3)"
}

# Get base64 wrap option based on OS
get_base64_wrap_option() {
    if base64 --help 2>&1 | grep -q -- '--wrap'; then
        echo "--wrap=0"
    else
        echo "-b 0"
    fi
}

# Seal a secret file using kubeseal
seal_secret() {
    local input_file="$1"
    local output_file="$2"

    log_info "Sealing secret using kubeseal..."

    kubeseal \
        --format=yaml \
        --controller-name="${KUBESEAL_CONTROLLER_NAME}" \
        --controller-namespace="${KUBESEAL_CONTROLLER_NAMESPACE}" \
        < "${input_file}" > "${output_file}"

    if [[ ! -f "${output_file}" ]] || [[ ! -s "${output_file}" ]]; then
        log_error "Failed to seal secret - output file is empty or missing"
        exit 1
    fi

    log_info "Secret sealed successfully: ${output_file}"
}

# Extract encrypted data from sealed secret
extract_encrypted_data() {
    local sealed_file="$1"
    local key="$2"

    yq ".spec.encryptedData.${key}" "${sealed_file}"
}

# Update Helm values file with sealed secrets
update_helm_values() {
    local env_ref="$1"
    local target_type="$2"
    local cluster="$3"
    local secure_env_value="$4"
    local settings_env_value="${5:-}"

    local values_file="${HELM_CHART_DIR}/values-${env_ref}-${target_type}-${cluster}.yaml"

    if [[ ! -f "${values_file}" ]]; then
        log_warn "Values file not found: ${values_file}"
        log_info "Creating from template..."

        local template_file="${HELM_CHART_DIR}/values-${target_type}-seed-template.yaml"
        if [[ ! -f "${template_file}" ]]; then
            log_error "Template file not found: ${template_file}"
            exit 1
        fi

        cp "${template_file}" "${values_file}"
    fi

    log_info "Updating values file: ${values_file}"

    # Update secure_env_file
    yq e ".secure_env_file = \"${secure_env_value}\"" -i "${values_file}"
    log_info "Updated secure_env_file in values file"

    # Update settings_sec_env_file if provided
    if [[ -n "${settings_env_value}" ]]; then
        yq e ".settings_sec_env_file = \"${settings_env_value}\"" -i "${values_file}"
        log_info "Updated settings_sec_env_file in values file"
    fi

    # Update namespace
    yq e ".app.namespace = \"${env_ref}\"" -i "${values_file}"
    yq e ".app.target_env = \"${env_ref}\"" -i "${values_file}"

    # Set replica count based on environment
    case "${env_ref}" in
        prod)
            log_info "Production environment - setting replicaCount to 3"
            yq e '.replicaCount = 3' -i "${values_file}"
            yq e '.autoscaling.enabled = true' -i "${values_file}"
            yq e '.autoscaling.minReplicas = 3' -i "${values_file}"
            ;;
        acc)
            log_info "Acceptance environment - setting replicaCount to 2"
            yq e '.replicaCount = 2' -i "${values_file}"
            yq e '.autoscaling.enabled = true' -i "${values_file}"
            yq e '.autoscaling.minReplicas = 2' -i "${values_file}"
            ;;
        *)
            log_info "Non-production environment - setting replicaCount to 1"
            yq e '.replicaCount = 1' -i "${values_file}"
            yq e '.autoscaling.enabled = false' -i "${values_file}"
            ;;
    esac

    log_info "Helm values file updated successfully"
}

# Main function
main() {
    log_step "Starting Kubeseal Automation for Whitefalcon/wslproxy"
    echo "=============================================="

    # Validate parameters
    validate_parameters "$@"

    # Assign parameters
    local env_file_base64="$1"
    local env_ref="$2"
    local namespace="$3"
    local target_type="$4"
    local settings_file_base64="${5:-}"
    local cluster="${6:-k3s2}"  # Default cluster

    log_info "Configuration:"
    log_info "  Environment: ${env_ref}"
    log_info "  Namespace: ${namespace}"
    log_info "  Target Type: ${target_type}"
    log_info "  Cluster: ${cluster}"
    log_info "  Project Root: ${PROJECT_ROOT}"

    # Validate base64 content
    validate_base64 "${env_file_base64}" "env_file"
    if [[ -n "${settings_file_base64}" ]]; then
        validate_base64 "${settings_file_base64}" "settings_file"
    fi

    # Detect OS
    local os_type
    os_type=$(detect_os)

    # Check dependencies
    check_dependencies "${os_type}"

    # Create temporary directory
    TEMP_DIR=$(mktemp -d)
    log_info "Created temporary directory: ${TEMP_DIR}"

    # Define file paths
    local project_name="wf-${target_type}"
    local env_secret_template="${SCRIPT_DIR}/secret_wslproxy_env_template.yaml"
    local env_secret_file="${TEMP_DIR}/secret_${target_type}_${env_ref}.yaml"
    local sealed_env_file="${TEMP_DIR}/sealed_secret_${target_type}_${env_ref}.yaml"

    # Process main env file secret
    log_step "Processing main environment secret..."

    # Get base64 wrap option
    local base64_wrap
    base64_wrap=$(get_base64_wrap_option)

    # Create the env_file base64 content (the secret value itself should be base64 encoded)
    local env_content
    env_content=$(echo "${env_file_base64}" | base64 -d)
    local env_file_base64_value
    env_file_base64_value=$(echo -n "${env_content}" | base64 ${base64_wrap})

    # Create secret from template
    if [[ ! -f "${env_secret_template}" ]]; then
        log_error "Environment secret template not found: ${env_secret_template}"
        exit 1
    fi

    # Use Python for reliable template replacement
    python3 << EOF
import sys

with open('${env_secret_template}', 'r') as f:
    content = f.read()

content = content.replace('CICD_PROJECT_NAME', '${project_name}')
content = content.replace('CICD_NAMESPACE_PLACEHOLDER', '${namespace}')
content = content.replace('ENV_FILE_BASE64_PLACEHOLDER', '${env_file_base64_value}')

with open('${env_secret_file}', 'w') as f:
    f.write(content)

print("Template processed successfully")
EOF

    if [[ ! -f "${env_secret_file}" ]] || [[ ! -s "${env_secret_file}" ]]; then
        log_error "Failed to create secret file from template"
        exit 1
    fi

    # Seal the secret
    seal_secret "${env_secret_file}" "${sealed_env_file}"

    # Extract encrypted env_file value
    local sealed_env_value
    sealed_env_value=$(extract_encrypted_data "${sealed_env_file}" "env_file")

    if [[ -z "${sealed_env_value}" ]] || [[ "${sealed_env_value}" == "null" ]]; then
        log_error "Failed to extract encrypted env_file value"
        exit 1
    fi

    log_info "Extracted sealed env_file value"

    # Process settings file if provided
    local sealed_settings_value=""
    if [[ -n "${settings_file_base64}" ]]; then
        log_step "Processing settings secret..."

        local settings_secret_template="${SCRIPT_DIR}/secret_wslproxy_settings_template.yaml"
        local settings_secret_file="${TEMP_DIR}/secret_settings_${target_type}_${env_ref}.yaml"
        local sealed_settings_file="${TEMP_DIR}/sealed_secret_settings_${target_type}_${env_ref}.yaml"

        # Create settings base64 value
        local settings_content
        settings_content=$(echo "${settings_file_base64}" | base64 -d)
        local settings_base64_value
        settings_base64_value=$(echo -n "${settings_content}" | base64 ${base64_wrap})

        if [[ -f "${settings_secret_template}" ]]; then
            python3 << EOF
with open('${settings_secret_template}', 'r') as f:
    content = f.read()

content = content.replace('CICD_PROJECT_NAME', '${project_name}')
content = content.replace('CICD_NAMESPACE_PLACEHOLDER', '${namespace}')
content = content.replace('SETTINGS_FILE_BASE64_PLACEHOLDER', '${settings_base64_value}')

with open('${settings_secret_file}', 'w') as f:
    f.write(content)
EOF

            seal_secret "${settings_secret_file}" "${sealed_settings_file}"
            sealed_settings_value=$(extract_encrypted_data "${sealed_settings_file}" "settings_sec_env_file")
            log_info "Extracted sealed settings_sec_env_file value"
        else
            log_warn "Settings secret template not found, skipping"
        fi
    fi

    # Update Helm values file
    log_step "Updating Helm values file..."
    update_helm_values "${env_ref}" "${target_type}" "${cluster}" "${sealed_env_value}" "${sealed_settings_value}"

    log_step "Kubeseal automation completed successfully!"
    echo "=============================================="
    log_info "Sealed secrets have been generated and values file updated"
    log_info "Values file: ${HELM_CHART_DIR}/values-${env_ref}-${target_type}-${cluster}.yaml"
}

# Run main function
main "$@"
