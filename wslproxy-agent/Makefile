# Makefile for WSLProxy Agent

# Variables
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo "dev")
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo "unknown")
BUILD_DATE ?= $(shell date -u +"%Y-%m-%dT%H:%M:%SZ")

REGISTRY ?= bwalia
AGENT_IMAGE ?= $(REGISTRY)/wslproxy-agent
TAG ?= $(VERSION)

# Go settings
GOOS ?= linux
GOARCH ?= amd64
CGO_ENABLED ?= 0

# Build output
BIN_DIR := bin

LDFLAGS := -w -s \
	-X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.Version=$(VERSION) \
	-X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.Commit=$(COMMIT) \
	-X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.BuildDate=$(BUILD_DATE)

.PHONY: help
help: ## Show this help message
	@echo 'Usage: make [target]'
	@echo ''
	@echo 'Available targets:'
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-20s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

.PHONY: all
all: build build-cli ## Build all binaries

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
build: fmt vet ## Build agent binary
	@echo "==> Building wslproxy-agent binary..."
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) go build \
		-ldflags="$(LDFLAGS)" \
		-o $(BIN_DIR)/wslproxy-agent \
		./cmd/wslproxy-agent/main.go
	@echo "Built: $(BIN_DIR)/wslproxy-agent"

.PHONY: build-cli
build-cli: fmt vet ## Build wslctl CLI binary
	@echo "==> Building wslctl binary..."
	@mkdir -p $(BIN_DIR)
	CGO_ENABLED=$(CGO_ENABLED) GOOS=$(GOOS) GOARCH=$(GOARCH) go build \
		-ldflags="$(LDFLAGS)" \
		-o $(BIN_DIR)/wslctl \
		./cmd/wslctl/main.go
	@echo "Built: $(BIN_DIR)/wslctl"

.PHONY: build-local
build-local: ## Build for current OS/arch
	@echo "==> Building for local platform..."
	@mkdir -p $(BIN_DIR)
	go build -ldflags="$(LDFLAGS)" -o $(BIN_DIR)/wslproxy-agent ./cmd/wslproxy-agent/main.go
	go build -ldflags="$(LDFLAGS)" -o $(BIN_DIR)/wslctl ./cmd/wslctl/main.go
	@echo "Built: $(BIN_DIR)/wslproxy-agent, $(BIN_DIR)/wslctl"

.PHONY: docker-build
docker-build: ## Build Docker image
	@echo "==> Building agent Docker image..."
	docker build \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		--build-arg BUILD_DATE=$(BUILD_DATE) \
		-t $(AGENT_IMAGE):$(TAG) \
		.
	@echo "Built: $(AGENT_IMAGE):$(TAG)"

.PHONY: docker-push
docker-push: ## Push Docker image
	@echo "==> Pushing agent image..."
	docker push $(AGENT_IMAGE):$(TAG)

.PHONY: clean
clean: ## Clean build artifacts
	@echo "==> Cleaning build artifacts..."
	rm -rf $(BIN_DIR)
	rm -f coverage.out coverage.html

.PHONY: ci-build
ci-build: deps fmt vet test build build-cli ## Simulate CI build locally
	@echo "==> CI build complete!"

.PHONY: version
version: ## Show version information
	@echo "Version:    $(VERSION)"
	@echo "Commit:     $(COMMIT)"
	@echo "Build Date: $(BUILD_DATE)"

.DEFAULT_GOAL := help
