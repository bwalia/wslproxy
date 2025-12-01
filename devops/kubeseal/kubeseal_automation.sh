#!/bin/bash
#
# Kubeseal Automation Script for Whitefalcon/wslproxy
#
# This script automates the process of sealing Kubernetes secrets using kubeseal.
# It takes environment-specific secrets, seals them, and generates Helm values files.
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
# Output:
#   - devops/helm-charts/whitefalcon/values-wslproxy-api-<env>.yaml (for api)
#   - devops/helm-charts/whitefalcon/values-wslproxy-front-<env>.yaml (for front)
#
# Example:
#   ./kubeseal_automation.sh "$ENV_FILE_BASE64" "test" "test" "api" "$SETTINGS_BASE64"
#

set -euo pipefail

# Color codes for output
readonly RED='\033[0;31m'
readonly GREEN='\033[0;32m'
readonly YELLOW='\033[1;33m'
readonly BLUE='\033[0;34m'
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
    echo -e "${BLUE}[STEP]${NC} $1"
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
        echo ""
        echo "Arguments:"
        echo "  base64_env_file      - Base64 encoded .env file content (required)"
        echo "  env_ref              - Environment: dev, int, test, acc, prod (required)"
        echo "  namespace            - Kubernetes namespace (required)"
        echo "  target_type          - Type: api or front (required)"
        echo "  base64_settings_file - Base64 encoded settings file (optional)"
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

# Extract encrypted data from sealed secret to a file
# This avoids shell escaping issues with large values
extract_encrypted_data_to_file() {
    local sealed_file="$1"
    local key="$2"
    local output_file="$3"

    yq ".spec.encryptedData.${key}" "${sealed_file}" > "${output_file}"
    # Remove any trailing newlines
    printf '%s' "$(cat "${output_file}")" > "${output_file}"
}

# Get environment-specific configuration
get_env_config() {
    local env_ref="$1"
    local target_type="$2"

    # Default values
    local ingress_class="nginx"
    local api_host=""
    local front_host=""
    local front_url=""

    # Domain pattern based on existing values files:
    # int: int-our.wslproxy.com (api), int-frontend.wslproxy.com (front)
    # test: test-our.wslproxy.com (api), test-frontend.wslproxy.com (front)
    case "${env_ref}" in
        dev)
            api_host="dev-our.wslproxy.com"
            front_host="dev-frontend.wslproxy.com"
            front_url="https://dev-frontend.wslproxy.com"
            ;;
        int)
            api_host="int-our.wslproxy.com"
            front_host="int-frontend.wslproxy.com"
            front_url="https://int-frontend.wslproxy.com"
            ;;
        test)
            api_host="test-our.wslproxy.com"
            front_host="test-frontend.wslproxy.com"
            front_url="https://test-frontend.wslproxy.com"
            ;;
        acc)
            api_host="acc-our.wslproxy.com"
            front_host="acc-frontend.wslproxy.com"
            front_url="https://acc-frontend.wslproxy.com"
            ;;
        prod)
            api_host="our.wslproxy.com"
            front_host="frontend.wslproxy.com"
            front_url="https://frontend.wslproxy.com"
            ;;
    esac

    # Export variables for use in caller
    echo "INGRESS_CLASS=${ingress_class}"
    echo "API_HOST=${api_host}"
    echo "FRONT_HOST=${front_host}"
    echo "FRONT_URL=${front_url}"
}

# Generate Helm values file from template
# Arguments:
#   $1 - env_ref: Environment reference (dev, int, test, acc, prod)
#   $2 - target_type: Deployment type (api or front)
#   $3 - sealed_env_file: Path to file containing sealed env value
#   $4 - sealed_settings_file: Path to file containing sealed settings value
generate_helm_values() {
    local env_ref="$1"
    local target_type="$2"
    local env_value_file="$3"
    local settings_value_file="$4"

    local template_file="${HELM_CHART_DIR}/values-${target_type}-template.yaml"
    local output_file="${HELM_CHART_DIR}/values-wslproxy-${target_type}-${env_ref}.yaml"

    if [[ ! -f "${template_file}" ]]; then
        log_error "Template file not found: ${template_file}"
        exit 1
    fi

    log_info "Generating Helm values file from template..."
    log_info "Template: ${template_file}"
    log_info "Output: ${output_file}"

    # Get environment-specific config
    eval "$(get_env_config "${env_ref}" "${target_type}")"

    # Copy template to output
    cp "${template_file}" "${output_file}"

    # Determine replica count and autoscaling settings based on environment
    local replica_count=1
    local autoscaling_enabled="false"
    local min_replicas=1

    case "${env_ref}" in
        prod)
            log_info "Production environment - setting replicaCount to 3"
            replica_count=3
            autoscaling_enabled="true"
            min_replicas=3
            ;;
        acc)
            log_info "Acceptance environment - setting replicaCount to 2"
            replica_count=2
            autoscaling_enabled="true"
            min_replicas=2
            ;;
        *)
            log_info "Non-production environment - setting replicaCount to 1"
            replica_count=1
            autoscaling_enabled="false"
            min_replicas=1
            ;;
    esac

    # Use Python for ALL replacements (same approach as OPSAPI)
    # This handles sealed values correctly without control character issues
    python3 << PYTHON_EOF
import sys
import re

# Read the template content
with open('${output_file}', 'r') as f:
    content = f.read()

# Read sealed values from files (avoids shell escaping issues)
with open('${env_value_file}', 'r') as f:
    sealed_env = f.read().strip()

with open('${settings_value_file}', 'r') as f:
    sealed_settings = f.read().strip()

# Validate sealed values - they should only contain safe characters
# Kubeseal output is base64-like: alphanumeric, +, /, =
def validate_sealed_value(value, name):
    if not value:
        return value
    # Check for control characters (ASCII 0-31 except tab/newline, and 127)
    for i, char in enumerate(value):
        code = ord(char)
        if code < 32 and code not in (9, 10, 13):  # Allow tab, newline, carriage return
            print(f"WARNING: {name} contains control character at position {i}: code={code}")
        elif code == 127:
            print(f"WARNING: {name} contains DEL character at position {i}")
    # Remove any control characters just to be safe
    cleaned = ''.join(c for c in value if ord(c) >= 32 or ord(c) in (9, 10, 13))
    cleaned = cleaned.replace('\n', '').replace('\r', '').replace('\t', '')
    return cleaned

sealed_env = validate_sealed_value(sealed_env, 'sealed_env')
sealed_settings = validate_sealed_value(sealed_settings, 'sealed_settings')

print(f"Sealed env length: {len(sealed_env)}")
print(f"Sealed settings length: {len(sealed_settings)}")
print(f"Sealed env first 50 chars: {sealed_env[:50]}...")

# Replace all simple placeholders
content = content.replace('CICD_NAMESPACE_PLACEHOLDER', '${env_ref}')
content = content.replace('CICD_INGRESS_CLASS', '${INGRESS_CLASS}')
content = content.replace('CICD_API_HOST', '${API_HOST}')
content = content.replace('CICD_FRONT_HOST', '${FRONT_HOST}')
content = content.replace('CICD_FRONT_URL', '${FRONT_URL}')

# Replace sealed secret values and replica settings
# Process line by line
lines = content.split('\n')
new_lines = []
in_autoscaling = False

for line in lines:
    stripped = line.strip()

    # Handle secure_env_file - NO QUOTES (sealed values are base64-safe)
    if stripped.startswith('secure_env_file:'):
        new_lines.append('secure_env_file: ' + sealed_env)
    # Handle settings_sec_env_file - NO QUOTES (sealed values are base64-safe)
    elif stripped.startswith('settings_sec_env_file:'):
        if sealed_settings:
            new_lines.append('settings_sec_env_file: ' + sealed_settings)
        else:
            new_lines.append('settings_sec_env_file: ""')
    # Handle replicaCount (top level only)
    elif stripped.startswith('replicaCount:') and not in_autoscaling:
        new_lines.append('replicaCount: ${replica_count}')
    # Track autoscaling section
    elif stripped.startswith('autoscaling:'):
        in_autoscaling = True
        new_lines.append(line)
    # Handle autoscaling.enabled
    elif in_autoscaling and stripped.startswith('enabled:'):
        indent = len(line) - len(line.lstrip())
        new_lines.append(' ' * indent + 'enabled: ${autoscaling_enabled}')
    # Handle autoscaling.minReplicas
    elif in_autoscaling and stripped.startswith('minReplicas:'):
        indent = len(line) - len(line.lstrip())
        new_lines.append(' ' * indent + 'minReplicas: ${min_replicas}')
    # Exit autoscaling section when we see a non-indented line
    elif in_autoscaling and line and not line.startswith(' ') and not line.startswith('\t'):
        in_autoscaling = False
        new_lines.append(line)
    else:
        new_lines.append(line)

content = '\n'.join(new_lines)

with open('${output_file}', 'w') as f:
    f.write(content)

print("All placeholders and settings replaced successfully via Python")
PYTHON_EOF

    log_info "All placeholders replaced via Python"

    # Validate the generated YAML file
    log_info "Validating generated YAML file..."
    if python3 -c "import yaml; yaml.safe_load(open('${output_file}'))" 2>/dev/null; then
        log_info "YAML validation passed"
    else
        log_warn "Python yaml validation failed, trying with yq..."
        if yq e '.' "${output_file}" > /dev/null 2>&1; then
            log_info "yq validation passed"
        else
            log_error "Generated YAML file is invalid!"
            log_error "Dumping first 100 lines of output file for debugging:"
            head -100 "${output_file}" >&2
            exit 1
        fi
    fi

    log_info "Helm values file generated: ${output_file}"
}

# Process and seal a secret, writing the encrypted value to a file
# Returns the path to the file containing the sealed value
process_secret_to_file() {
    local secret_name="$1"
    local secret_base64="$2"
    local namespace="$3"
    local project_name="$4"
    local secret_key="$5"
    local base64_wrap="$6"
    local output_value_file="$7"

    local secret_file="${TEMP_DIR}/secret_${secret_name}.yaml"
    local sealed_file="${TEMP_DIR}/sealed_secret_${secret_name}.yaml"

    log_info "Processing ${secret_name} secret..."

    # Decode and re-encode the content
    local content
    content=$(echo "${secret_base64}" | base64 -d)
    local base64_value
    base64_value=$(echo -n "${content}" | base64 ${base64_wrap})

    # Create secret YAML
    cat > "${secret_file}" << YAML
apiVersion: v1
kind: Secret
metadata:
  name: ${project_name}-secret-${namespace}
  namespace: ${namespace}
type: Opaque
data:
  ${secret_key}: ${base64_value}
YAML

    # Seal the secret
    seal_secret "${secret_file}" "${sealed_file}"

    # Extract encrypted value directly to file (avoids shell escaping issues)
    extract_encrypted_data_to_file "${sealed_file}" "${secret_key}" "${output_value_file}"

    # Verify the file is not empty
    if [[ ! -s "${output_value_file}" ]]; then
        log_error "Failed to extract sealed value to ${output_value_file}"
        return 1
    fi

    local value_length
    value_length=$(wc -c < "${output_value_file}" | tr -d ' ')
    log_info "Extracted sealed ${secret_key} value (length: ${value_length})"
}

# Main function
main() {
    echo "=============================================="
    log_step "Kubeseal Automation for Whitefalcon/wslproxy"
    echo "=============================================="

    # Validate parameters
    validate_parameters "$@"

    # Assign parameters
    local env_file_base64="$1"
    local env_ref="$2"
    local namespace="$3"
    local target_type="$4"
    local settings_file_base64="${5:-}"

    log_info "Configuration:"
    log_info "  Environment: ${env_ref}"
    log_info "  Namespace: ${namespace}"
    log_info "  Target Type: ${target_type}"
    log_info "  Project Root: ${PROJECT_ROOT}"
    log_info "  Settings provided: $([ -n "${settings_file_base64}" ] && echo 'yes' || echo 'no')"

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

    # Get base64 wrap option
    local base64_wrap
    base64_wrap=$(get_base64_wrap_option)

    # Define project name
    local project_name="wf-${target_type}"

    # Define file paths for sealed values (avoids passing large values through shell)
    local sealed_env_file="${TEMP_DIR}/sealed_env_value.txt"
    local sealed_settings_file="${TEMP_DIR}/sealed_settings_value.txt"

    # Process main env file secret - writes directly to file
    log_step "Processing main environment secret..."
    process_secret_to_file "env_${target_type}_${env_ref}" "${env_file_base64}" "${namespace}" "${project_name}" "env_file" "${base64_wrap}" "${sealed_env_file}"

    if [[ ! -s "${sealed_env_file}" ]]; then
        log_error "Failed to extract encrypted env_file value"
        exit 1
    fi

    # Process settings secret if provided - writes directly to file
    # Create empty file if no settings provided
    : > "${sealed_settings_file}"
    if [[ -n "${settings_file_base64}" ]]; then
        log_step "Processing settings secret..."
        process_secret_to_file "settings_${target_type}_${env_ref}" "${settings_file_base64}" "${namespace}" "${project_name}" "settings_sec_env_file" "${base64_wrap}" "${sealed_settings_file}"

        if [[ ! -s "${sealed_settings_file}" ]]; then
            log_warn "Failed to extract encrypted settings value, continuing without it"
            : > "${sealed_settings_file}"
        fi
    fi

    # Generate Helm values file - reads sealed values from files
    log_step "Generating Helm values file..."
    generate_helm_values "${env_ref}" "${target_type}" "${sealed_env_file}" "${sealed_settings_file}"

    echo ""
    echo "=============================================="
    log_step "Kubeseal automation completed successfully!"
    echo "=============================================="
    log_info "Output file: ${HELM_CHART_DIR}/values-wslproxy-${target_type}-${env_ref}.yaml"
    echo ""
}

# Run main function
main "$@"
