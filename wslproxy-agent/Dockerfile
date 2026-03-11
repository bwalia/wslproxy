# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /workspace

# Copy go mod files
COPY go.mod go.sum ./
RUN go mod download

# Copy source code
COPY cmd/ cmd/
COPY internal/ internal/
COPY pkg/ pkg/

# Build binaries
ARG VERSION=dev
ARG COMMIT=unknown
ARG BUILD_DATE=unknown
ARG TARGETARCH

RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-amd64} go build \
    -ldflags="-w -s \
        -X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.Version=${VERSION} \
        -X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.Commit=${COMMIT} \
        -X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.BuildDate=${BUILD_DATE}" \
    -o wslproxy-agent \
    ./cmd/wslproxy-agent/main.go

RUN CGO_ENABLED=0 GOOS=linux GOARCH=${TARGETARCH:-amd64} go build \
    -ldflags="-w -s \
        -X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.Version=${VERSION} \
        -X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.Commit=${COMMIT} \
        -X github.com/wslproxy/wslproxy/wslproxy-agent/pkg/version.BuildDate=${BUILD_DATE}" \
    -o wslctl \
    ./cmd/wslctl/main.go

# Runtime stage
FROM gcr.io/distroless/static:nonroot

LABEL org.opencontainers.image.title="WSLProxy Agent" \
      org.opencontainers.image.description="HA cluster agent for WSLProxy" \
      org.opencontainers.image.vendor="WSLProxy" \
      org.opencontainers.image.source="https://github.com/wslproxy/wslproxy"

WORKDIR /

COPY --from=builder /workspace/wslproxy-agent /wslproxy-agent
COPY --from=builder /workspace/wslctl /wslctl

USER 65534:65534

EXPOSE 9090

ENTRYPOINT ["/wslproxy-agent"]
