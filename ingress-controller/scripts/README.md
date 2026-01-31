# Build Scripts

Helper scripts for building and publishing WSLProxy Ingress Controller.

## Available Scripts

### build-and-publish.sh

Main build script for creating and publishing Docker images.

**Usage:**

```bash
# Build locally
./scripts/build-and-publish.sh

# Build and push to Docker Hub
./scripts/build-and-publish.sh --push

# Build specific version
./scripts/build-and-publish.sh --version 1.0.0 --push

# Build for single platform (faster for local development)
./scripts/build-and-publish.sh --platforms linux/amd64

# Use environment variables
VERSION=1.0.0 PUSH=true ./scripts/build-and-publish.sh
```

**Options:**

- `-v, --version VERSION` - Image version tag (default: git describe)
- `-r, --registry REGISTRY` - Docker registry (default: bwalia)
- `-p, --push` - Push images to registry
- `--platforms PLATFORMS` - Target platforms (default: linux/amd64,linux/arm64)
- `-h, --help` - Show help message

**Environment Variables:**

- `VERSION` - Image version
- `REGISTRY` - Docker registry
- `PUSH` - Set to 'true' to push images
- `PLATFORMS` - Target platforms

## Examples

### Development Workflow

```bash
# 1. Build images locally
make docker-build

# 2. Test in kind cluster
make quick-test

# 3. Check status
make status

# 4. View logs
make logs-controller
make logs-openresty
```

### Release Workflow

```bash
# 1. Update version
export VERSION=1.0.0

# 2. Build and push multi-arch images
make release TAG=$VERSION

# Or use the script directly
./scripts/build-and-publish.sh --version $VERSION --push

# 3. Package Helm chart
make helm-package

# 4. Create git tag
git tag -a "ingress-v${VERSION}" -m "Release ${VERSION}"
git push origin "ingress-v${VERSION}"
```

### CI/CD Simulation

```bash
# Run full CI build locally
make ci-build

# Run all validations
make validate
```

## Makefile Targets

Quick reference of all Makefile targets:

### Build Targets
- `make build` - Build Go binary
- `make docker-build` - Build both Docker images
- `make docker-buildx` - Build and push multi-arch images
- `make release TAG=x.y.z` - Build and push release

### Test Targets
- `make test` - Run unit tests
- `make test-coverage` - Run tests with coverage report
- `make lint` - Run linters
- `make validate` - Run all validation checks

### Deployment Targets
- `make install` - Install using Helm
- `make uninstall` - Uninstall using Helm
- `make quick-test` - Test in kind cluster
- `make quick-cleanup` - Cleanup kind cluster

### Utility Targets
- `make version` - Show version information
- `make status` - Show deployment status
- `make logs-controller` - Tail controller logs
- `make logs-openresty` - Tail OpenResty logs
- `make help` - Show all targets

## GitHub Actions

The project uses GitHub Actions for CI/CD. See `.github/workflows/build-publish-ingress.yml`.

**Triggers:**

- Push to `main`, `develop`, `release/**` branches
- Tags matching `ingress-v*.*.*`
- Pull requests
- Manual workflow dispatch

**Secrets Required:**

- `DOCKER_USER` - Docker Hub username
- `DOCKER_PASSWD` - Docker Hub access token

**What it does:**

1. Runs tests and linting
2. Builds Go binaries for multiple platforms
3. Builds multi-arch Docker images
4. Pushes images to Docker Hub
5. Scans images for vulnerabilities
6. Updates Docker Hub README
7. Validates and packages Helm chart
8. Creates GitHub releases with artifacts
9. Tests installation in kind cluster

## Tips

### Speed up local builds

```bash
# Build for single platform
PLATFORMS=linux/amd64 make docker-build

# Skip tests (not recommended for production)
make docker-build  # tests run automatically with make build
```

### Docker Buildx cache

```bash
# Setup buildx builder
make buildx-setup

# Use GitHub Actions cache
docker buildx build --cache-from type=gha --cache-to type=gha,mode=max ...
```

### Debugging

```bash
# Build without cache
docker build --no-cache -f Dockerfile.controller .

# Run container interactively
docker run -it --entrypoint /bin/sh bwalia/wslproxy-ingress-controller:dev

# Check OpenResty config
docker run -it --entrypoint /usr/local/openresty/bin/openresty \
  bwalia/wslproxy-openresty-ingress:dev -t
```

## Troubleshooting

### "Docker buildx not found"

```bash
# Install buildx
docker buildx install

# Or use Docker Desktop which includes buildx
```

### "kind not found"

```bash
# Install kind
# macOS
brew install kind

# Linux
curl -Lo ./kind https://kind.sigs.k8s.io/dl/latest/kind-linux-amd64
chmod +x ./kind
sudo mv ./kind /usr/local/bin/kind
```

### Multi-arch build fails

```bash
# Ensure QEMU is set up
docker run --privileged --rm tonistiigi/binfmt --install all

# Verify platforms
docker buildx ls
```

## Contributing

When adding new scripts:

1. Make scripts executable: `chmod +x scripts/your-script.sh`
2. Add usage documentation to this README
3. Add help message to the script (`--help` flag)
4. Follow existing code style (bash -euo pipefail, colored output)
5. Test locally before committing
