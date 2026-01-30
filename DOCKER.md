# WSLProxy Docker Guide

Complete guide for deploying WSLProxy using Docker in various scenarios.

## Quick Start

### Pull Latest Image
```bash
docker pull bwalia/wslproxy:latest
```

### Run with Default Configuration
```bash
docker run -d \
  --name wslproxy \
  -p 80:80 \
  -p 443:443 \
  -p 8080:8080 \
  bwalia/wslproxy:latest
```

## Available Docker Images

### Main Images (Published to Docker Hub)

| Image | Purpose | Tags |
|-------|---------|------|
| `bwalia/wslproxy` | Full WSLProxy OpenResty application | `latest`, `<commit-sha>` |
| `bwalia/wslproxy-alternate` | WSLProxy alternate build variant | `latest`, `<commit-sha>` |
| `bwalia/node-app` | Node.js sample backend API | `latest`, `<commit-sha>` |
| `bwalia/s3-browser-app` | S3 browser application | `latest`, `<commit-sha>` |

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                   wslproxy Container                     │
├─────────────────────────────────────────────────────────┤
│                                                           │
│  OpenResty (Nginx with Lua)                             │
│  ├─ SSL/TLS Termination (auto-ssl)                     │
│  ├─ Lua API Gateway                                     │
│  ├─ Reverse Proxy                                       │
│  ├─ Prometheus Metrics                                  │
│  ├─ Traffic Logging & Analytics                         │
│  └─ Admin Dashboard (React)                             │
│                                                           │
│  Port 80   - HTTP                                       │
│  Port 443  - HTTPS                                      │
│  Port 8080 - Admin Dashboard & Metrics                  │
│                                                           │
└─────────────────────────────────────────────────────────┘
       ↓                    ↓                    ↓
   Upstream Servers   Configuration   Redis Cache
```

## Deployment Scenarios

### Scenario 1: Development Setup

**Quick local development with hot-reload capabilities:**

```bash
docker-compose -f docker-compose-dev.yml up -d
```

See [`docker-compose-dev.yml`](#docker-compose-dev) below for details.

**Features:**
- Hot-reload of Lua files
- Volume mounts for development
- Redis for session storage
- Admin dashboard on http://localhost:8080

### Scenario 2: Production Deployment

**Single container production deployment:**

```bash
docker run -d \
  --name wslproxy-prod \
  --restart always \
  -p 80:80 \
  -p 443:443 \
  -p 8080:8080 \
  -e NGINX_CONFIG_DIR=/opt/nginx \
  -v wslproxy-data:/opt/nginx/data \
  -v wslproxy-certs:/etc/resty-auto-ssl \
  bwalia/wslproxy:latest
```

**With Redis backend:**

```bash
# Start Redis
docker run -d \
  --name wslproxy-redis \
  --restart always \
  redis:alpine

# Start WSLProxy with Redis
docker run -d \
  --name wslproxy-prod \
  --restart always \
  --link wslproxy-redis:redis \
  -p 80:80 \
  -p 443:443 \
  -p 8080:8080 \
  -e REDIS_HOST=redis \
  -e REDIS_PORT=6379 \
  -v wslproxy-data:/opt/nginx/data \
  -v wslproxy-certs:/etc/resty-auto-ssl \
  bwalia/wslproxy:latest
```

### Scenario 3: Kubernetes Deployment

**Using Helm chart (recommended):**

```bash
helm install wslproxy ./devops/helm-charts/wslproxy \
  -n wslproxy \
  --create-namespace \
  -f values-prod.yaml
```

See `devops/helm-charts/wslproxy/` for Helm configuration.

### Scenario 4: Multi-Node Cluster with Persistent Storage

**Using Docker Compose with shared volumes:**

```yaml
version: '3.8'
services:
  wslproxy-1:
    image: bwalia/wslproxy:latest
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - wslproxy-config:/opt/nginx
      - wslproxy-certs:/etc/resty-auto-ssl
    environment:
      REDIS_HOST: redis
      NGINX_CONFIG_DIR: /opt/nginx
    depends_on:
      - redis

  wslproxy-2:
    image: bwalia/wslproxy:latest
    ports:
      - "8080:80"
      - "8443:443"
      - "8081:8080"
    volumes:
      - wslproxy-config:/opt/nginx
      - wslproxy-certs:/etc/resty-auto-ssl
    environment:
      REDIS_HOST: redis
      NGINX_CONFIG_DIR: /opt/nginx
    depends_on:
      - redis

  redis:
    image: redis:alpine
    volumes:
      - redis-data:/data

volumes:
  wslproxy-config:
  wslproxy-certs:
  redis-data:
```

## Configuration

### Environment Variables

| Variable | Default | Purpose |
|----------|---------|---------|
| `NGINX_CONFIG_DIR` | `/opt/nginx` | Configuration directory path |
| `REDIS_HOST` | `localhost` | Redis server hostname |
| `REDIS_PORT` | `6379` | Redis server port |
| `DNS_RESOLVER` | `127.0.0.11` | DNS resolver for requests |
| `PRIMARY_DNS_RESOLVER` | `8.8.8.8` | Primary DNS for ACME |
| `SECONDARY_DNS_RESOLVER` | `8.8.4.4` | Secondary DNS for ACME |
| `SSL_STAGING` | `false` | Use Let's Encrypt staging environment |
| `SSL_OCSP_STAPLING` | `true` | Enable OCSP stapling |

### Volume Mounts

```bash
# Data persistence
-v /path/to/config:/opt/nginx/data

# SSL certificates (auto-renewing)
-v /path/to/certs:/etc/resty-auto-ssl

# Configuration files
-v /path/to/nginx.conf:/usr/local/openresty/nginx/conf/nginx.conf

# Custom Lua scripts
-v /path/to/api:/usr/local/openresty/nginx/html/api
```

### Settings File (settings.json)

The container requires a `settings.json` file in the data volume:

```json
{
  "instance_id": "my-proxy",
  "instance_name": "My Proxy Instance",
  "env_profile": "prod",
  "redis_host": "redis",
  "storage_type": "disk",
  "env_vars": {
    "REDIS_HOST": "redis",
    "REDIS_PORT": 6379,
    "CONTROL_PLANE_API_URL": "https://example.com/api",
    "FRONT_URL": "https://example.com"
  },
  "super_user": {
    "email": "admin@example.com",
    "password": "hashed_password",
    "username": "admin"
  }
}
```

## Port Mappings

| Port | Protocol | Purpose |
|------|----------|---------|
| 80 | HTTP | Standard web traffic |
| 443 | HTTPS | Encrypted web traffic |
| 8080 | HTTP | Admin Dashboard & Prometheus metrics |
| 8500 | HTTP | Consul API (optional) |

## Health Checks

### Container Health
```bash
docker exec wslproxy curl -f http://localhost:8080/health || exit 1
```

### Nginx Configuration Test
```bash
docker exec wslproxy openresty -t
```

### API Health Check
```bash
curl -s http://localhost:8080/api/health
```

## Logging

### View Logs
```bash
# Real-time logs
docker logs -f wslproxy

# Last 100 lines
docker logs --tail 100 wslproxy

# With timestamps
docker logs -f -t wslproxy
```

### Access Nginx Error Log
```bash
docker exec wslproxy tail -f /usr/local/openresty/nginx/logs/error.log
```

### Access Nginx Access Log
```bash
docker exec wslproxy tail -f /usr/local/openresty/nginx/logs/access.log
```

## Monitoring & Metrics

### Prometheus Metrics
```bash
curl http://localhost:8080/metrics
```

### Metrics Available
- `nginx_http_requests_total` - Total HTTP requests
- `nginx_http_request_duration_seconds` - Request latency
- `nginx_http_request_size_bytes` - Request size
- `nginx_http_response_size_bytes` - Response size
- `nginx_http_errors_total` - Total errors by status code

## Upgrading

### Pull Latest Version
```bash
docker pull bwalia/wslproxy:latest
```

### Update Running Container
```bash
# Stop old container
docker stop wslproxy

# Remove old container (if needed)
docker rm wslproxy

# Start new container
docker run -d \
  --name wslproxy \
  -p 80:80 \
  -p 443:443 \
  -p 8080:8080 \
  -v wslproxy-data:/opt/nginx/data \
  -v wslproxy-certs:/etc/resty-auto-ssl \
  bwalia/wslproxy:latest
```

### Zero-Downtime Upgrade (with load balancer)
```bash
# 1. Start new container
docker run -d --name wslproxy-new bwalia/wslproxy:latest

# 2. Point load balancer to new container
# 3. Wait for requests to drain from old container
# 4. Stop old container
docker stop wslproxy

# 5. Rename new container
docker rename wslproxy-new wslproxy
```

## Troubleshooting

### Container Won't Start
```bash
# Check logs
docker logs wslproxy

# Check if Nginx configuration is valid
docker exec wslproxy openresty -t

# Check port availability
netstat -tuln | grep -E ':(80|443|8080)'
```

### High Memory Usage
```bash
# Check memory usage
docker stats wslproxy

# Reduce worker processes
# Modify nginx.conf: worker_processes auto; → worker_processes 2;
```

### SSL Certificate Issues
```bash
# Check certificate directory
docker exec wslproxy ls -la /etc/resty-auto-ssl

# View certificate details
docker exec wslproxy openssl x509 -in /etc/resty-auto-ssl/certs/example.com.crt -text -noout
```

### DNS Resolution Issues
```bash
# Test DNS inside container
docker exec wslproxy nslookup google.com

# Check resolver configuration
docker exec wslproxy cat /usr/local/openresty/nginx/conf/nginx.conf | grep resolver
```

## Security Best Practices

1. **Use specific image tags** (not `latest` in production)
   ```bash
   docker run bwalia/wslproxy:abc123def456
   ```

2. **Run as non-root** (already configured in image)
   ```bash
   docker run --user nobody bwalia/wslproxy:latest
   ```

3. **Use read-only filesystem** where possible
   ```bash
   docker run --read-only --tmpfs /tmp bwalia/wslproxy:latest
   ```

4. **Restrict capabilities**
   ```bash
   docker run --cap-drop=ALL --cap-add=NET_BIND_SERVICE \
     bwalia/wslproxy:latest
   ```

5. **Use secrets for sensitive data**
   ```bash
   docker run \
     --secret db_password \
     -e DB_PASSWORD_FILE=/run/secrets/db_password \
     bwalia/wslproxy:latest
   ```

6. **Regular updates**
   ```bash
   docker pull bwalia/wslproxy:latest
   docker-compose up -d  # Automatically uses latest
   ```

## Docker Compose Templates

### <a name="docker-compose-dev"></a>Development (docker-compose-dev.yml)

```yaml
version: '3.8'

services:
  wslproxy:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        APP_ENV: dev
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - ./api:/usr/local/openresty/nginx/html/api
      - ./html:/usr/local/openresty/nginx/html
      - ./openresty-admin/src:/usr/local/openresty/nginx/html/openresty-admin/src
      - ./data:/opt/nginx/data
      - wslproxy-certs:/etc/resty-auto-ssl
    environment:
      NGINX_CONFIG_DIR: /opt/nginx
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      - redis

  redis:
    image: redis:alpine
    ports:
      - "6379:6379"
    volumes:
      - redis-data:/data
```

### Production (docker-compose-prod.yml)

```yaml
version: '3.8'

services:
  wslproxy:
    image: bwalia/wslproxy:latest
    restart: always
    ports:
      - "80:80"
      - "443:443"
      - "8080:8080"
    volumes:
      - wslproxy-data:/opt/nginx/data
      - wslproxy-certs:/etc/resty-auto-ssl
    environment:
      NGINX_CONFIG_DIR: /opt/nginx
      REDIS_HOST: redis
      REDIS_PORT: 6379
    depends_on:
      - redis
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:8080/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  redis:
    image: redis:alpine
    restart: always
    volumes:
      - redis-data:/data
    command: redis-server --appendonly yes

volumes:
  wslproxy-data:
  wslproxy-certs:
  redis-data:
```

## Building from Source

### Build Image Locally
```bash
docker build -t wslproxy:dev .
```

### Build with Specific Environment
```bash
docker build \
  --build-arg APP_ENV=prod \
  -t wslproxy:prod \
  .
```

### Build Multiple Architectures (with buildx)
```bash
docker buildx build \
  --platform linux/amd64,linux/arm64 \
  -t bwalia/wslproxy:latest \
  --push \
  .
```

## CI/CD Pipeline

Images are automatically built and pushed to Docker Hub on:
- Every push to `main` branch
- Manual workflow dispatch

See `.github/workflows/k3s-build-push-deploy.yaml` for automation details.

### Tags Applied
- `bwalia/wslproxy:latest` - Latest version
- `bwalia/wslproxy:<commit-sha>` - Specific commit

## Support & Issues

For issues, bugs, or feature requests:
1. Check existing issues on GitHub
2. Review logs: `docker logs wslproxy`
3. Test Nginx configuration: `docker exec wslproxy openresty -t`
4. Create detailed bug report with logs

## License

See LICENSE file for details.
