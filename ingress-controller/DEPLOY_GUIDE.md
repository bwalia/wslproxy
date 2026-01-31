# WSLProxy Ingress Controller - Complete Deployment Guide

This guide covers everything from building images to production deployment.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Building Images](#building-images)
- [Publishing to Docker Hub](#publishing-to-docker-hub)
- [Local Development](#local-development)
- [Production Deployment](#production-deployment)
- [CI/CD Setup](#cicd-setup)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

```bash
# Verify installation
docker --version          # Docker 20.10+
docker buildx version     # Buildx for multi-arch
kubectl version          # Kubernetes CLI
helm version            # Helm 3+
kind version            # kind (for local testing)
go version              # Go 1.21+
```

### Install Missing Tools

```bash
# macOS (using Homebrew)
brew install docker kubectl helm kind go

# Linux
# Docker: https://docs.docker.com/engine/install/
# kubectl: https://kubernetes.io/docs/tasks/tools/
# Helm: https://helm.sh/docs/intro/install/
# kind: https://kind.sigs.k8s.io/docs/user/quick-start/
# Go: https://go.dev/doc/install
```

### Docker Hub Account

1. Create account at https://hub.docker.com/
2. Create access token: Account Settings → Security → New Access Token
3. Login locally:

```bash
docker login -u your-username
```

---

## Building Images

### Option 1: Using Makefile (Recommended)

```bash
cd ingress-controller

# Build both images locally
make docker-build

# Build and push multi-arch images
make docker-buildx TAG=1.0.0

# Build specific version
make docker-build TAG=dev
```

### Option 2: Using Build Script

```bash
# Build locally
./scripts/build-and-publish.sh

# Build and push
./scripts/build-and-publish.sh --push --version 1.0.0

# Build for single platform (faster)
./scripts/build-and-publish.sh --platforms linux/amd64
```

### Option 3: Manual Docker Build

```bash
# Controller image
docker build \
  --build-arg VERSION=1.0.0 \
  --build-arg COMMIT=$(git rev-parse --short HEAD) \
  --build-arg BUILD_DATE=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
  -t bwalia/wslproxy-ingress-controller:1.0.0 \
  -f Dockerfile.controller \
  .

# OpenResty image
docker build \
  -t bwalia/wslproxy-openresty-ingress:1.0.0 \
  -f Dockerfile.openresty \
  .
```

### Verify Build

```bash
# List images
docker images | grep wslproxy

# Test controller image
docker run --rm bwalia/wslproxy-ingress-controller:1.0.0 --help

# Test OpenResty image
docker run --rm -p 8080:8080 bwalia/wslproxy-openresty-ingress:1.0.0
curl http://localhost:8080/healthz
```

---

## Publishing to Docker Hub

### Setup

```bash
# 1. Login to Docker Hub
docker login

# 2. Set registry (if using different registry)
export REGISTRY=your-dockerhub-username
```

### Publish Images

**Method 1: Using Makefile**

```bash
# Build and push
make docker-buildx TAG=1.0.0

# Or use the release target
make release TAG=1.0.0
```

**Method 2: Using Script**

```bash
# Set credentials
export REGISTRY=bwalia

# Build and push
./scripts/build-and-publish.sh \
  --version 1.0.0 \
  --push \
  --registry $REGISTRY
```

**Method 3: Manual Push**

```bash
# Tag images
docker tag wslproxy-ingress-controller:1.0.0 bwalia/wslproxy-ingress-controller:1.0.0
docker tag wslproxy-ingress-controller:1.0.0 bwalia/wslproxy-ingress-controller:latest

# Push to Docker Hub
docker push bwalia/wslproxy-ingress-controller:1.0.0
docker push bwalia/wslproxy-ingress-controller:latest
docker push bwalia/wslproxy-openresty-ingress:1.0.0
docker push bwalia/wslproxy-openresty-ingress:latest
```

### Verify Published Images

```bash
# Pull from Docker Hub
docker pull bwalia/wslproxy-ingress-controller:1.0.0
docker pull bwalia/wslproxy-openresty-ingress:1.0.0

# Or check on Docker Hub
open https://hub.docker.com/r/bwalia/wslproxy-ingress-controller
```

---

## Local Development

### Quick Test with kind

```bash
# One-command test
make quick-test

# This will:
# 1. Create kind cluster
# 2. Build Docker images
# 3. Load images into kind
# 4. Install with Helm
# 5. Wait for pods to be ready
```

### Manual kind Setup

```bash
# 1. Create cluster
kind create cluster --name wslproxy-dev

# 2. Build images
make docker-build

# 3. Load images into kind
kind load docker-image bwalia/wslproxy-ingress-controller:dev --name wslproxy-dev
kind load docker-image bwalia/wslproxy-openresty-ingress:dev --name wslproxy-dev

# 4. Install CRDs
kubectl apply -f deploy/crds/

# 5. Install with Helm
helm install wslproxy deploy/helm/ \
  --namespace wslproxy-system \
  --create-namespace \
  --set controller.image.tag=dev \
  --set openresty.image.tag=dev

# 6. Check status
kubectl get pods -n wslproxy-system
make status
```

### Development Workflow

```bash
# 1. Make code changes

# 2. Rebuild and reload
make docker-build
kind load docker-image bwalia/wslproxy-ingress-controller:dev --name wslproxy-dev
kind load docker-image bwalia/wslproxy-openresty-ingress:dev --name wslproxy-dev

# 3. Restart pods
kubectl rollout restart deployment -n wslproxy-system

# 4. Check logs
make logs-controller
make logs-openresty

# 5. Test changes
kubectl apply -f docs/examples/basic-backend.yaml
kubectl get wslproxybackend
```

### Cleanup

```bash
# Delete kind cluster
make quick-cleanup
```

---

## Production Deployment

### Step 1: Prepare Kubernetes Cluster

```bash
# Verify cluster access
kubectl cluster-info
kubectl get nodes

# Create namespace
kubectl create namespace wslproxy-system
```

### Step 2: Configure Helm Values

Create `values-production.yaml`:

```yaml
# values-production.yaml
controller:
  replicas: 3
  image:
    repository: bwalia/wslproxy-ingress-controller
    tag: "1.0.0"
  resources:
    limits:
      cpu: 500m
      memory: 512Mi
    requests:
      cpu: 100m
      memory: 128Mi
  leaderElection:
    enabled: true

openresty:
  replicas: 5
  image:
    repository: bwalia/wslproxy-openresty-ingress
    tag: "1.0.0"
  resources:
    limits:
      cpu: "2"
      memory: 2Gi
    requests:
      cpu: "1"
      memory: 512Mi
  autoscaling:
    enabled: true
    minReplicas: 5
    maxReplicas: 20
    targetCPUUtilizationPercentage: 70
  service:
    type: LoadBalancer
    annotations:
      service.beta.kubernetes.io/aws-load-balancer-type: "nlb"  # AWS
      # cloud.google.com/load-balancer-type: "Internal"        # GCP
      # service.beta.kubernetes.io/azure-load-balancer-internal: "true"  # Azure
  podDisruptionBudget:
    enabled: true
    minAvailable: 3

ingressClass:
  name: wslproxy
  isDefaultClass: true

observability:
  prometheus:
    enabled: true
    serviceMonitor:
      enabled: true
      interval: 30s

certManager:
  enabled: true
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
```

### Step 3: Install cert-manager (if not already installed)

```bash
# Install cert-manager
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.13.0/cert-manager.yaml

# Wait for cert-manager to be ready
kubectl wait --for=condition=ready pod \
  -l app=cert-manager \
  -n cert-manager \
  --timeout=300s

# Create Let's Encrypt ClusterIssuer
cat <<EOF | kubectl apply -f -
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@example.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: wslproxy
EOF
```

### Step 4: Install WSLProxy Ingress Controller

```bash
# Install CRDs
kubectl apply -f deploy/crds/

# Install with Helm
helm install wslproxy deploy/helm/ \
  --namespace wslproxy-system \
  --create-namespace \
  -f values-production.yaml \
  --wait \
  --timeout 10m

# Verify installation
kubectl get pods -n wslproxy-system
kubectl get svc -n wslproxy-system
```

### Step 5: Create Your First Backend

```bash
# Create backend for your application
kubectl apply -f - <<EOF
apiVersion: wslproxy.io/v1alpha1
kind: WSLProxyBackend
metadata:
  name: my-app-backend
  namespace: default
spec:
  upstreams:
    - host: my-app-service.default.svc.cluster.local
      port: 8080
      weight: 1
  loadBalancing: round-robin
  healthCheck:
    enabled: true
    path: /health
    interval: 5
    timeout: 3
    expectedStatus: 200
  circuitBreaker:
    enabled: true
    threshold: 5
    timeout: 30
EOF

# Check backend status
kubectl get wslproxybackend my-app-backend -o yaml
```

### Step 6: Create Ingress

```bash
# Using standard Ingress
kubectl apply -f - <<EOF
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-app-ingress
  annotations:
    cert-manager.io/cluster-issuer: letsencrypt-prod
spec:
  ingressClassName: wslproxy
  tls:
  - hosts:
    - my-app.example.com
    secretName: my-app-tls
  rules:
  - host: my-app.example.com
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: my-app-service
            port:
              number: 8080
EOF
```

### Step 7: Monitor Deployment

```bash
# Check pods
kubectl get pods -n wslproxy-system

# Check service (get LoadBalancer IP)
kubectl get svc wslproxy-openresty -n wslproxy-system

# Check backends
kubectl get wslproxybackend -A

# View logs
kubectl logs -f -n wslproxy-system -l app.kubernetes.io/component=controller
kubectl logs -f -n wslproxy-system -l app.kubernetes.io/component=proxy

# Check metrics
kubectl port-forward -n wslproxy-system svc/wslproxy-openresty 9090:8080
curl http://localhost:9090/metrics
```

---

## CI/CD Setup

### GitHub Actions

#### Step 1: Configure Secrets

Go to GitHub repository settings → Secrets and variables → Actions:

Add secrets:
- `DOCKER_USER` - Your Docker Hub username
- `DOCKER_PASSWD` - Docker Hub access token

#### Step 2: Enable Workflow

The workflow file is already created at:
`.github/workflows/build-publish-ingress.yml`

It will automatically run on:
- Push to `main`, `develop`, `release/**` branches
- Tags matching `ingress-v*.*.*`
- Pull requests

#### Step 3: Create Release

```bash
# 1. Update CHANGELOG.md with changes

# 2. Commit changes
git add .
git commit -m "Release v1.0.0"

# 3. Create and push tag
git tag -a ingress-v1.0.0 -m "Release v1.0.0"
git push origin main
git push origin ingress-v1.0.0

# 4. GitHub Actions will automatically:
#    - Run tests
#    - Build multi-arch images
#    - Push to Docker Hub
#    - Create GitHub Release
#    - Publish Helm chart
```

### Manual Release Process

```bash
# 1. Build images
make release TAG=1.0.0

# 2. Package Helm chart
make helm-package

# 3. Create GitHub release manually
gh release create ingress-v1.0.0 \
  --title "WSLProxy Ingress Controller v1.0.0" \
  --notes "Release notes here" \
  dist/*.tgz
```

---

## Troubleshooting

### Images Won't Build

```bash
# Check Docker is running
docker ps

# Clear build cache
docker builder prune

# Build without cache
docker build --no-cache -f Dockerfile.controller .
```

### Can't Push to Docker Hub

```bash
# Re-login
docker logout
docker login

# Check credentials
cat ~/.docker/config.json

# Try manual push
docker push bwalia/wslproxy-ingress-controller:latest
```

### kind Cluster Issues

```bash
# Delete and recreate
kind delete cluster --name wslproxy-test
kind create cluster --name wslproxy-test

# Check cluster
kubectl cluster-info --context kind-wslproxy-test
```

### Pods Not Starting

```bash
# Check pod status
kubectl describe pod -n wslproxy-system <pod-name>

# Check logs
kubectl logs -n wslproxy-system <pod-name>

# Check events
kubectl get events -n wslproxy-system --sort-by='.lastTimestamp'

# Verify images exist
docker pull bwalia/wslproxy-ingress-controller:latest
docker pull bwalia/wslproxy-openresty-ingress:latest
```

### Backend Not Working

```bash
# Check backend status
kubectl get wslproxybackend -A
kubectl describe wslproxybackend <name>

# Check OpenResty API
kubectl port-forward -n wslproxy-system svc/wslproxy-openresty 8080:8080
curl http://localhost:8080/api/internal/backends

# Check controller logs
kubectl logs -n wslproxy-system -l app.kubernetes.io/component=controller
```

---

## Additional Resources

- **Quick Start**: [QUICKSTART.md](./QUICKSTART.md)
- **Build Summary**: [BUILD_SUMMARY.md](./BUILD_SUMMARY.md)
- **Scripts Documentation**: [scripts/README.md](./scripts/README.md)
- **Main README**: [README.md](./README.md)
- **Examples**: [docs/examples/](./docs/examples/)

---

## Support

- GitHub Issues: https://github.com/wslproxy/wslproxy/issues
- Documentation: https://docs.wslproxy.org (coming soon)
- Docker Hub: https://hub.docker.com/u/bwalia
