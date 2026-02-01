#!/bin/bash
set -e

# Configuration
IMAGE_NAME="wslproxy-cache-test"
PLATFORMS="linux/amd64,linux/arm64"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} WSLProxy Cache Test - Multi-Arch Build ${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""

# Get Docker Hub credentials
read -p "Docker Hub username: " DOCKER_USER
if [ -z "$DOCKER_USER" ]; then
    echo -e "${RED}Error: Docker Hub username is required${NC}"
    exit 1
fi

read -s -p "Docker Hub password/token: " DOCKER_PASS
echo ""

if [ -z "$DOCKER_PASS" ]; then
    echo -e "${RED}Error: Docker Hub password/token is required${NC}"
    exit 1
fi

# Get image tag
read -p "Image tag (default: latest): " IMAGE_TAG
IMAGE_TAG=${IMAGE_TAG:-latest}

FULL_IMAGE_NAME="${DOCKER_USER}/${IMAGE_NAME}:${IMAGE_TAG}"

echo ""
echo -e "${YELLOW}Building and pushing: ${FULL_IMAGE_NAME}${NC}"
echo -e "${YELLOW}Platforms: ${PLATFORMS}${NC}"
echo ""

# Login to Docker Hub
echo -e "${GREEN}Logging in to Docker Hub...${NC}"
echo "$DOCKER_PASS" | docker login -u "$DOCKER_USER" --password-stdin

# Create buildx builder if it doesn't exist
BUILDER_NAME="multiarch-builder"
if ! docker buildx inspect "$BUILDER_NAME" > /dev/null 2>&1; then
    echo -e "${GREEN}Creating buildx builder...${NC}"
    docker buildx create --name "$BUILDER_NAME" --use --bootstrap
else
    echo -e "${GREEN}Using existing buildx builder...${NC}"
    docker buildx use "$BUILDER_NAME"
fi

# Build and push multi-platform image
echo -e "${GREEN}Building multi-platform image...${NC}"
docker buildx build \
    --platform "$PLATFORMS" \
    --tag "$FULL_IMAGE_NAME" \
    --push \
    .

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN} Build complete!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "Image pushed: ${YELLOW}${FULL_IMAGE_NAME}${NC}"
echo ""
echo "Pull with:"
echo "  docker pull ${FULL_IMAGE_NAME}"
echo ""
echo "Run with:"
echo "  docker run -p 3000:3000 ${FULL_IMAGE_NAME}"

# Logout from Docker Hub
docker logout
