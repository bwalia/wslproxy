MODULE := github.com/bwalia/wslproxy
CLI := ./cmd/wslproxy-cli
BIN := bin/wslproxy-cli
VERSION ?= $(shell git describe --tags --always --dirty 2>/dev/null || echo dev)
COMMIT ?= $(shell git rev-parse --short HEAD 2>/dev/null || echo none)
DATE ?= $(shell date -u +%Y-%m-%dT%H:%M:%SZ)
LDFLAGS := -s -w -X main.version=$(VERSION) -X main.commit=$(COMMIT) -X main.date=$(DATE)

.PHONY: build test vet tidy cli install clean

build cli:
	mkdir -p bin
	CGO_ENABLED=0 go build -ldflags "$(LDFLAGS)" -o $(BIN) $(CLI)

install: build
	install -m 755 $(BIN) "$(HOME)/bin/wslproxy-cli" 2>/dev/null || install -m 755 $(BIN) /usr/local/bin/wslproxy-cli

test:
	go test ./internal/...

vet:
	go vet ./cmd/wslproxy-cli/... ./internal/...

tidy:
	go mod tidy

clean:
	rm -rf bin
