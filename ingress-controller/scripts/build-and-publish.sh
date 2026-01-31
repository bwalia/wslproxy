#!/usr/bin/env bash
# build-and-publish.sh
# Helper script to build and publish WSLProxy Ingress Controller images

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Default values
VERSION="${VERSION:-$(git describe --tags --always --dirty 2>/dev/null || echo "dev")}"
REGISTRY="${REGISTRY:-bwalia}"
PUSH="${PUSH:-false}"
PLATFORMS="${PLATFORMS:-linux/amd64,linux/arm64}"

# Image names
CONTROLLER_IMAGE="${REGISTRY}/wslproxy-ingress-controller"
OPENRESTY_IMAGE="${REGISTRY}/wslproxy-openresty-ingress"

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

check_requirements() {
    log_info "Checking requirements..."

    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed"
        exit 1
    fi

    if ! command -v git &> /dev/null; then
        log_error "Git is not installed"
        exit 1
    fi

    if [ "$PUSH" = "true" ]; then
        if ! docker buildx version &> /dev/null; then
            log_error "Docker Buildx is not available"
            exit 1
        fi
    fi

    log_info "All requirements satisfied"
}

setup_buildx() {
    log_info "Setting up Docker Buildx..."

    if ! docker buildx inspect wslproxy-builder &> /dev/null; then
        docker buildx create --name wslproxy-builder --use
    else
        docker buildx use wslproxy-builder
    fi

    docker buildx inspect --bootstrap
}

build_controller() {
    log_info "Building controller image: ${CONTROLLER_IMAGE}:${VERSION}"

    local BUILD_ARGS=(
        --build-arg "VERSION=${VERSION}"
        --build-arg "COMMIT=$(git rev-parse --short HEAD 2>/dev/null || echo unknown)"
        --build-arg "BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
        -t "${CONTROLLER_IMAGE}:${VERSION}"
        -f Dockerfile.controller
    )

    if [ "$PUSH" = "true" ]; then
        BUILD_ARGS+=(
            --platform "${PLATFORMS}"
            --push
        )
        setup_buildx
        docker buildx build "${BUILD_ARGS[@]}" .
    else
        docker build "${BUILD_ARGS[@]}" .
    fi

    log_info "Controller image built successfully"
}

build_openresty() {
    log_info "Building OpenResty image: ${OPENRESTY_IMAGE}:${VERSION}"

    local BUILD_ARGS=(
        -t "${OPENRESTY_IMAGE}:${VERSION}"
        -f Dockerfile.openresty
    )

    if [ "$PUSH" = "true" ]; then
        BUILD_ARGS+=(
            --platform "${PLATFORMS}"
            --push
        )
        setup_buildx
        docker buildx build "${BUILD_ARGS[@]}" .
    else
        docker build "${BUILD_ARGS[@]}" .
    fi

    log_info "OpenResty image built successfully"
}

tag_latest() {
    if [ "$PUSH" = "true" ]; then
        log_info "Tagging images as 'latest'..."
        docker buildx imagetools create \
            "${CONTROLLER_IMAGE}:${VERSION}" \
            --tag "${CONTROLLER_IMAGE}:latest"
        docker buildx imagetools create \
            "${OPENRESTY_IMAGE}:${VERSION}" \
            --tag "${OPENRESTY_IMAGE}:latest"
    else
        docker tag "${CONTROLLER_IMAGE}:${VERSION}" "${CONTROLLER_IMAGE}:latest"
        docker tag "${OPENRESTY_IMAGE}:${VERSION}" "${OPENRESTY_IMAGE}:latest"
    fi
}

show_summary() {
    log_info "Build Summary:"
    echo "  Version:     ${VERSION}"
    echo "  Registry:    ${REGISTRY}"
    echo "  Platforms:   ${PLATFORMS}"
    echo "  Push:        ${PUSH}"
    echo ""
    echo "Images built:"
    echo "  - ${CONTROLLER_IMAGE}:${VERSION}"
    echo "  - ${OPENRESTY_IMAGE}:${VERSION}"

    if [ "$PUSH" = "true" ]; then
        echo ""
        echo "Images pushed to registry!"
        echo ""
        echo "Pull commands:"
        echo "  docker pull ${CONTROLLER_IMAGE}:${VERSION}"
        echo "  docker pull ${OPENRESTY_IMAGE}:${VERSION}"
    else
        echo ""
        echo "To push images, run:"
        echo "  PUSH=true $0"
    fi
}

usage() {
    cat <<EOF
Usage: $0 [OPTIONS]

Build and optionally push WSLProxy Ingress Controller Docker images.

OPTIONS:
    -v, --version VERSION    Image version tag (default: git describe)
    -r, --registry REGISTRY  Docker registry (default: bwalia)
    -p, --push               Push images to registry
    --platforms PLATFORMS    Target platforms (default: linux/amd64,linux/arm64)
    -h, --help               Show this help message

ENVIRONMENT VARIABLES:
    VERSION                  Image version
    REGISTRY                 Docker registry
    PUSH                     Set to 'true' to push images
    PLATFORMS                Target platforms

EXAMPLES:
    # Build locally
    $0

    # Build and push
    $0 --push

    # Build specific version
    $0 --version 1.0.0 --push

    # Build for single platform
    $0 --platforms linux/amd64
EOF
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -v|--version)
            VERSION="$2"
            shift 2
            ;;
        -r|--registry)
            REGISTRY="$2"
            CONTROLLER_IMAGE="${REGISTRY}/wslproxy-ingress-controller"
            OPENRESTY_IMAGE="${REGISTRY}/wslproxy-openresty-ingress"
            shift 2
            ;;
        -p|--push)
            PUSH="true"
            shift
            ;;
        --platforms)
            PLATFORMS="$2"
            shift 2
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            log_error "Unknown option: $1"
            usage
            exit 1
            ;;
    esac
done

# Main execution
main() {
    log_info "WSLProxy Ingress Controller Build Script"
    echo ""

    check_requirements
    build_controller
    build_openresty

    if [[ "$VERSION" != *"-"* ]] && [[ "$VERSION" != "dev" ]]; then
        tag_latest
    fi

    echo ""
    show_summary
}

main
