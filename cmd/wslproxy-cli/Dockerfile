# syntax=docker/dockerfile:1
# Minimal image with wslproxy-cli + bash/jq for CI/CD pipelines.
# Build from repo root:
#   docker build -f cmd/wslproxy-cli/Dockerfile -t ghcr.io/bwalia/wslproxy-cli:latest .
#
# Run:
#   docker run --rm -e WSLPROXY_BASE_URL=https://lon1.pop0.uk \
#     -e WSLPROXY_TOKEN -e WSLPROXY_ASSUME_YES=1 \
#     ghcr.io/bwalia/wslproxy-cli:latest check nginx

ARG GO_VERSION=1.25

FROM golang:${GO_VERSION}-alpine AS build
RUN apk add --no-cache git ca-certificates
WORKDIR /src

COPY go.mod go.sum ./
RUN go mod download

COPY cmd/wslproxy-cli ./cmd/wslproxy-cli
COPY internal ./internal

ARG VERSION=dev
ARG COMMIT=none
ARG DATE=unknown
ENV CGO_ENABLED=0
RUN go build -trimpath \
      -ldflags "-s -w -X main.version=${VERSION} -X main.commit=${COMMIT} -X main.date=${DATE}" \
      -o /out/wslproxy-cli ./cmd/wslproxy-cli

# Runtime: alpine so pipelines can use bash + jq + curl alongside the CLI.
FROM alpine:3.21

RUN apk add --no-cache \
      bash \
      ca-certificates \
      curl \
      jq \
      git \
      tzdata \
    && adduser -D -u 10001 -h /home/wslproxy wslproxy \
    && mkdir -p /home/wslproxy/.config/wslproxy /work \
    && chown -R wslproxy:wslproxy /home/wslproxy /work

COPY --from=build /out/wslproxy-cli /usr/local/bin/wslproxy-cli
COPY examples/wslproxy-cli/ /opt/wslproxy-cli/examples/

# Convenience aliases for scripts that expect `wslproxy-cli` on PATH (already set).
ENV HOME=/home/wslproxy \
    XDG_CONFIG_HOME=/home/wslproxy/.config \
    WSLPROXY_CLI=/usr/local/bin/wslproxy-cli

WORKDIR /work
USER wslproxy

ENTRYPOINT ["wslproxy-cli"]
CMD ["version"]

# Override entrypoint for shell automation:
#   docker run --rm -it --entrypoint bash ghcr.io/bwalia/wslproxy-cli:latest
LABEL org.opencontainers.image.title="wslproxy-cli" \
      org.opencontainers.image.description="WSLProxy admin CLI (REST + MCP) for CI/CD" \
      org.opencontainers.image.source="https://github.com/bwalia/wslproxy"
