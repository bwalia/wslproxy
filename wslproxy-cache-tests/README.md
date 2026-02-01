# WSLProxy Cache Test Origin Server

A simple HTTP origin server for testing WSLProxy cache behavior. It logs all incoming request headers and provides various endpoints with different cache-control configurations.

## Quick Start

### Using Docker

```bash
# Build and run
docker build -t wslproxy-cache-test .
docker run -p 3000:3000 wslproxy-cache-test
```

### Using Docker Compose

```bash
docker-compose up -d
```

### Using Node.js directly

```bash
npm install
npm start
```

## Endpoints

### Utility Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /` | Index page with links to all endpoints |
| `GET /test-suite` | JSON with all available endpoints for automation |
| `GET /echo-headers` | Returns all received headers as JSON |
| `GET /health` | Health check endpoint |

### Static Assets (Cacheable)

All static assets return `Cache-Control: public, max-age=31536000, immutable`

| Endpoint | Content-Type |
|----------|--------------|
| `GET /static/css/:file` | text/css |
| `GET /static/js/:file` | application/javascript |
| `GET /static/images/:file` | image/* |

### Cache Control Test Endpoints

| Endpoint | Cache-Control | Expected Behavior |
|----------|---------------|-------------------|
| `GET /cache/public` | `public, max-age=3600` | Cached by proxy |
| `GET /cache/private` | `private, max-age=3600` | NOT cached by proxy |
| `GET /cache/no-store` | `no-store, no-cache` | Never cached |
| `GET /cache/no-cache` | `no-cache` | Revalidate on each request |
| `GET /cache/short-ttl` | `public, max-age=10` | Short 10s cache |
| `GET /cache/long-ttl` | `public, max-age=86400` | 1 day cache |
| `GET /cache/s-maxage` | `public, max-age=60, s-maxage=3600` | Different proxy/browser TTL |
| `GET /cache/stale-while-revalidate` | `public, max-age=60, stale-while-revalidate=300` | Serve stale while revalidating |
| `GET /cache/custom?cc=...` | Custom value via query param | Test any cache-control value |

### Conditional Request Endpoints

| Endpoint | Headers | Description |
|----------|---------|-------------|
| `GET /cache/etag` | ETag | Returns 304 if ETag matches |
| `GET /cache/last-modified` | Last-Modified | Returns 304 if not modified |

### Vary Header Tests

| Endpoint | Vary Header |
|----------|-------------|
| `GET /cache/vary-accept` | Accept |
| `GET /cache/vary-encoding` | Accept-Encoding |

## Automation Testing

Use the `/test-suite` endpoint to get a JSON list of all endpoints:

```bash
curl http://localhost:3000/test-suite | jq
```

### Example Test Script

```bash
#!/bin/bash
ORIGIN="http://localhost:3000"
PROXY="http://your-wslproxy:80"

# Test cacheable endpoint
echo "=== Testing Public Cache ==="
curl -I "$PROXY/cache/public" -H "Host: test.example.com"
curl -I "$PROXY/cache/public" -H "Host: test.example.com"  # Should be HIT

# Test private (no proxy cache)
echo "=== Testing Private Cache ==="
curl -I "$PROXY/cache/private" -H "Host: test.example.com"  # Should be MISS always

# Test static assets
echo "=== Testing Static Assets ==="
curl -I "$PROXY/static/css/style.css" -H "Host: test.example.com"
curl -I "$PROXY/static/js/app.js" -H "Host: test.example.com"
```

## Header Logging

All incoming request headers are logged to stdout:

```
================================================================================
[2025-01-15T10:30:00.000Z] GET /cache/public
---------------------------------------- REQUEST HEADERS -----------------------
  host: localhost:3000
  user-agent: curl/8.0.0
  accept: */*
  x-forwarded-for: 192.168.1.100
  x-wsl-request-id: abc123
================================================================================
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

## WSLProxy Cache Headers

When testing through WSLProxy, look for these response headers:

- `x-wsl-cache: HIT` - Content served from cache
- `x-wsl-cache: MISS` - Content fetched from origin
- `x-wsl-cache-age: 123` - Seconds since cached
- `x-wsl-cache-key: ...` - Cache key used
