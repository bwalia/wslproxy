MODULE := github.com/bwalia/wslproxy
CLI := ./cmd/wslproxy-cli
BIN := bin/wslproxy-cli
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)

IMAGE ?= ghcr.io/bwalia/wslproxy-cli
DOCKERFILE := cmd/wslproxy-cli/Dockerfile

.PHONY: build test test-lua vet tidy cli install clean docker docker-push

# Lua contract tests run on plain Lua; override for luajit or OpenResty's resty:
#   make test-lua LUA=/usr/local/openresty/luajit/bin/luajit
LUA ?= lua

build cli:
	mkdir -p bin
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(BIN) $(CLI)

install: build
	install -m 755 $(BIN) "$(HOME)/bin/wslproxy-cli" 2>/dev/null || install -m 755 $(BIN) /usr/local/bin/wslproxy-cli

test:
	go test ./internal/...

test-lua:
	@for f in test/storage/*.lua test/rules/*.lua; do \
		printf '%s: ' "$$f"; \
		$(LUA) "$$f" || exit 1; \
	done

vet:
	go vet ./cmd/wslproxy-cli/... ./internal/...

tidy:
	go mod tidy

docker:
	docker build \
		-f $(DOCKERFILE) \
		--ignorefile cmd/wslproxy-cli/dockerignore \
		--build-arg VERSION=$(VERSION) \
		--build-arg COMMIT=$(COMMIT) \
		--build-arg DATE=$(DATE) \
		-t $(IMAGE):$(VERSION) \
		-t $(IMAGE):latest \
		.

docker-push: docker
	docker push $(IMAGE):$(VERSION)
	docker push $(IMAGE):latest

clean:
	rm -rf bin
