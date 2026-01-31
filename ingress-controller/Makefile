# Makefile for WSLProxy Ingress Controller

# Variables
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

REGISTRY ?= bwalia
CONTROLLER_IMAGE ?= $(REGISTRY)/wslproxy-ingress-controller
OPENRESTY_IMAGE ?= $(REGISTRY)/wslproxy-openresty-ingress
TAG ?= $(VERSION)

# Platforms for multi-arch builds
PLATFORMS ?= linux/amd64,linux/arm64

# Go settings
GOOS ?= linux
GOARCH ?= amd64
CGO_ENABLED ?= 0

# Build output
BIN_DIR := bin
DIST_DIR := dist

.PHONY: help
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: all
all: build ## Build all binaries

.PHONY: deps
deps: ## Download Go dependencies
	@echo "==> Downloading Go dependencies..."
	go mod download
	go mod verify

.PHONY: fmt
fmt: ## Format Go code
	@echo "==> Formatting Go code..."
	go fmt ./...

.PHONY: vet
vet: ## Run go vet
	@echo "==> Running go vet..."
	go vet ./...

.PHONY: lint
lint: ## Run golangci-lint
	@echo "==> Running golangci-lint..."
	@which golangci-lint > /dev/null || (echo "golangci-lint not installed" && exit 1)
	golangci-lint run ./...

.PHONY: test
test: ## Run unit tests
	@echo "==> Running unit tests..."
	go test -v -race -coverprofile=coverage.out ./...

.PHONY: test-coverage
test-coverage: test ## Run tests with coverage report
	@echo "==> Generating coverage report..."
	go tool cover -html=coverage.out -o coverage.html
	@echo "Coverage report: coverage.html"

.PHONY: build
build: fmt vet ## Build controller binary
	@echo "==> Building controller binary..."
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) go build \
		-ldflags="-w -s \
			-X main.Version=$(VERSION) \
			-X main.Commit=$(COMMIT) \
			-X main.BuildDate=$(BUILD_DATE)" \
		-o $(BIN_DIR)/controller \
		./cmd/controller/main.go
	@echo "Built: $(BIN_DIR)/controller"

.PHONY: docker-build-controller
docker-build-controller: ## Build controller Docker image
	@echo "==> Building controller Docker image..."
	docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t $(CONTROLLER_IMAGE):$(TAG) \
		-f Dockerfile.controller \
		.
	@echo "Built: $(CONTROLLER_IMAGE):$(TAG)"

.PHONY: docker-build-openresty
docker-build-openresty: ## Build OpenResty Docker image
	@echo "==> Building OpenResty Docker image..."
	docker build \
		-t $(OPENRESTY_IMAGE):$(TAG) \
		-f Dockerfile.openresty \
		.
	@echo "Built: $(OPENRESTY_IMAGE):$(TAG)"

.PHONY: docker-build
docker-build: docker-build-controller docker-build-openresty ## Build all Docker images

.PHONY: docker-push-controller
docker-push-controller: ## Push controller image to registry
	@echo "==> Pushing controller image..."
	docker push $(CONTROLLER_IMAGE):$(TAG)
	@if [ "$(TAG)" != "latest" ]; then \
		docker tag $(CONTROLLER_IMAGE):$(TAG) $(CONTROLLER_IMAGE):latest; \
		docker push $(CONTROLLER_IMAGE):latest; \
	fi

.PHONY: docker-push-openresty
docker-push-openresty: ## Push OpenResty image to registry
	@echo "==> Pushing OpenResty image..."
	docker push $(OPENRESTY_IMAGE):$(TAG)
	@if [ "$(TAG)" != "latest" ]; then \
		docker tag $(OPENRESTY_IMAGE):$(TAG) $(OPENRESTY_IMAGE):latest; \
		docker push $(OPENRESTY_IMAGE):latest; \
	fi

.PHONY: docker-push
docker-push: docker-push-controller docker-push-openresty ## Push all images to registry

.PHONY: docker-buildx-controller
docker-buildx-controller: ## Build multi-arch controller image
	@echo "==> Building multi-arch controller image..."
	docker buildx build \
		--platform $(PLATFORMS) \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t $(CONTROLLER_IMAGE):$(TAG) \
		-f Dockerfile.controller \
		--push \
		.

.PHONY: docker-buildx-openresty
docker-buildx-openresty: ## Build multi-arch OpenResty image
	@echo "==> Building multi-arch OpenResty image..."
	docker buildx build \
		--platform $(PLATFORMS) \
		-t $(OPENRESTY_IMAGE):$(TAG) \
		-f Dockerfile.openresty \
		--push \
		.

.PHONY: docker-buildx
docker-buildx: docker-buildx-controller docker-buildx-openresty ## Build and push multi-arch images

.PHONY: generate-crds
generate-crds: ## Generate CRD manifests
	@echo "==> Generating CRD manifests..."
	@echo "Note: This requires controller-gen to be installed"
	@echo "Install with: go install sigs.k8s.io/controller-tools/cmd/controller-gen@latest"
	@which controller-gen > /dev/null || (echo "controller-gen not installed" && exit 1)
	controller-gen crd:crdVersions=v1 paths="./pkg/apis/..." output:crd:dir=./deploy/crds

.PHONY: helm-lint
helm-lint: ## Lint Helm chart
	@echo "==> Linting Helm chart..."
	helm lint deploy/helm/

.PHONY: helm-template
helm-template: ## Generate Helm template output
	@echo "==> Generating Helm templates..."
	helm template wslproxy deploy/helm/ --namespace wslproxy-system

.PHONY: helm-package
helm-package: ## Package Helm chart
	@echo "==> Packaging Helm chart..."
	@mkdir -p $(DIST_DIR)
	helm package deploy/helm/ -d $(DIST_DIR)

.PHONY: install
install: ## Install using Helm
	@echo "==> Installing WSLProxy Ingress Controller..."
	helm upgrade --install wslproxy deploy/helm/ \
		--namespace wslproxy-system \
		--create-namespace \
		--set controller.image.tag=$(TAG) \
		--set openresty.image.tag=$(TAG)

.PHONY: uninstall
uninstall: ## Uninstall using Helm
	@echo "==> Uninstalling WSLProxy Ingress Controller..."
	helm uninstall wslproxy -n wslproxy-system

.PHONY: logs-controller
logs-controller: ## Tail controller logs
	@echo "==> Tailing controller logs..."
	kubectl logs -f -n wslproxy-system -l app.kubernetes.io/component=controller

.PHONY: logs-openresty
logs-openresty: ## Tail OpenResty logs
	@echo "==> Tailing OpenResty logs..."
	kubectl logs -f -n wslproxy-system -l app.kubernetes.io/component=proxy

.PHONY: clean
clean: ## Clean build artifacts
	@echo "==> Cleaning build artifacts..."
	rm -rf $(BIN_DIR) $(DIST_DIR)
	rm -f coverage.out coverage.html

.PHONY: clean-docker
clean-docker: ## Remove Docker images
	@echo "==> Removing Docker images..."
	docker rmi -f $(CONTROLLER_IMAGE):$(TAG) $(OPENRESTY_IMAGE):$(TAG) || true

.PHONY: dev-setup
dev-setup: ## Setup development environment
	@echo "==> Setting up development environment..."
	@echo "Installing Go dependencies..."
	go mod download
	@echo "Installing development tools..."
	go install sigs.k8s.io/controller-tools/cmd/controller-gen@latest
	@echo "Development environment ready!"

.PHONY: quick-test
quick-test: ## Quick test in kind cluster
	@echo "==> Testing in kind cluster..."
	@which kind > /dev/null || (echo "kind not installed" && exit 1)
	kind create cluster --name wslproxy-test || true
	$(MAKE) docker-build
	kind load docker-image $(CONTROLLER_IMAGE):$(TAG) --name wslproxy-test
	kind load docker-image $(OPENRESTY_IMAGE):$(TAG) --name wslproxy-test
	$(MAKE) install TAG=$(TAG)
	@echo "Cluster ready! Use 'kubectl get pods -n wslproxy-system' to check status"

.PHONY: quick-cleanup
quick-cleanup: ## Cleanup kind test cluster
	@echo "==> Cleaning up kind cluster..."
	kind delete cluster --name wslproxy-test

.PHONY: version
version: ## Show version information
	@echo "Version:    $(VERSION)"
	@echo "Commit:     $(COMMIT)"
	@echo "Build Date: $(BUILD_DATE)"
	@echo "Registry:   $(REGISTRY)"
	@echo "Images:"
	@echo "  - $(CONTROLLER_IMAGE):$(TAG)"
	@echo "  - $(OPENRESTY_IMAGE):$(TAG)"

.PHONY: docker-login
docker-login: ## Login to Docker Hub
	@echo "==> Logging in to Docker Hub..."
	@docker login

.PHONY: buildx-setup
buildx-setup: ## Setup Docker Buildx
	@echo "==> Setting up Docker Buildx..."
	@docker buildx create --name wslproxy-builder --use || docker buildx use wslproxy-builder
	@docker buildx inspect --bootstrap

.PHONY: publish
publish: docker-push ## Alias for docker-push

.PHONY: release
release: ## Build and push release (requires TAG)
	@if [ "$(TAG)" = "dev" ]; then \
		echo "Error: Please specify TAG for release (e.g., make release TAG=1.0.0)"; \
		exit 1; \
	fi
	@echo "==> Building and pushing release $(TAG)..."
	$(MAKE) docker-buildx TAG=$(TAG)
	@echo "==> Release $(TAG) complete!"
	@echo "Images pushed:"
	@echo "  - $(CONTROLLER_IMAGE):$(TAG)"
	@echo "  - $(OPENRESTY_IMAGE):$(TAG)"

.PHONY: ci-build
ci-build: deps fmt vet test docker-build ## Simulate CI build locally
	@echo "==> CI build complete!"

.PHONY: validate
validate: fmt vet lint test helm-lint ## Run all validation checks
	@echo "==> All validation checks passed!"

.PHONY: status
status: ## Show deployment status
	@echo "==> WSLProxy Ingress Controller Status"
	@echo ""
	@echo "Pods:"
	@kubectl get pods -n wslproxy-system 2>/dev/null || echo "Not installed or no access"
	@echo ""
	@echo "Services:"
	@kubectl get svc -n wslproxy-system 2>/dev/null || echo "Not installed or no access"
	@echo ""
	@echo "Backends:"
	@kubectl get wslproxybackend -A 2>/dev/null || echo "No backends or CRDs not installed"

.DEFAULT_GOAL := help
