# WSLProxy

**Enterprise-Grade API Gateway & Reverse Proxy with Automated Management**

WSLProxy is a high-performance, cloud-native API gateway and reverse proxy built on OpenResty (Nginx with Lua scripting). Designed for modern DevOps workflows, it provides automatic SSL/TLS management, dynamic routing configuration, and comprehensive monitoring capabilities—all fully API-driven for seamless CI/CD integration.

## Key Features

- **🔒 Automatic SSL/TLS Management** - Let's Encrypt integration with zero-downtime certificate renewal
- **⚙️ API-First Architecture** - Configure everything via REST API, perfect for infrastructure-as-code and pipelines
- **🚀 High Performance** - OpenResty-based with Lua scripting for custom logic without proxy limitations
- **📊 Built-in Monitoring** - Prometheus metrics, traffic analytics, and admin dashboard out of the box
- **🔄 Dynamic Routing** - Hot-reload configuration without restarting the proxy
- **🏗️ Multi-Deployment Ready** - Docker, Kubernetes, Docker Swarm, and bare metal support
- **🔌 Service Mesh Ready** - Consul integration for service discovery and health checks
- **📦 Zero Dependencies** - Lightweight container (~150MB) with everything included

## Quick Start (Choose Your Deployment)

### Option 1: Docker (Fastest Way)

```bash
# Pull latest image
docker pull bwalia/wslproxy:latest

# Run with default config
docker run -d \
  --name wslproxy \
  -p 80:80 \
  -p 443:443 \
  -p 8080:8080 \
  bwalia/wslproxy:latest

# Access admin dashboard
open http://localhost:8080
```

### Option 2: Docker Compose (Development)

```bash
# Clone and start
git clone https://github.com/wslproxy/wslproxy.git && cd wslproxy
docker-compose -f docker-compose-dev.yml up

# Access dashboard
open http://localhost:8080

# Hot-reload changes to Lua API files instantly
```

### Option 3: Kubernetes Helm (Production)

```bash
# Deploy to K8s cluster
helm install wslproxy ./devops/helm-charts/wslproxy \
  -n wslproxy \
  --create-namespace \
  -f values-prod.yaml

# Monitor deployment
kubectl -n wslproxy get pods -w
```

## Local Development

Single command to start the entire development environment with hot-reload and unique ports (no conflicts with common local services).

### Prerequisites

- Docker (with Docker Compose)
- Node.js 16+
- Yarn (`npm install -g yarn`)

### Quick Start

```bash
# Start everything - prompts for JWT secret, builds admin inside container, attaches to logs
./start.sh

# Pass JWT secret directly (skips interactive prompt)
./start.sh --jwt-secret YOUR_SECRET_KEY

# With auto git stash + pull (no prompts)
./start.sh -a

# Skip git prompts entirely
./start.sh -n

# With admin dashboard auto-rebuild on file save
./start.sh -w

# Combine flags
./start.sh -n -j YOUR_SECRET_KEY -w

# Press Ctrl+C to stop everything
```

### JWT Secret Key

The JWT secret is required for token signing/validation. The script will always ask for it interactively unless provided via CLI argument:

```bash
# Option 1: Pass as argument (recommended for CI/scripts)
./start.sh --jwt-secret YOUR_SECRET_KEY

# Option 2: Interactive prompt (press Enter to auto-generate a random key)
./start.sh
# > Enter JWT secret key (or press Enter to generate a random one):
```

The script injects the JWT secret into `openresty-admin/.env` as `VITE_JWT_SECURITY_PASSPHRASE` before the Vite build runs inside the container.

### Environment Variables

The admin dashboard uses Vite environment variables defined in `openresty-admin/.env`. This file is committed to the repo with safe defaults for local Docker development. The JWT secret is the only value injected at runtime by `start.sh`.

| Variable | Description | Default |
|----------|-------------|---------|
| `VITE_API_URL` | Backend API URL | `http://localhost:8280/api` |
| `VITE_FRONT_URL` | Frontend URL | `http://localhost:8280` |
| `VITE_APP_NAME` | Application identifier | `wslproxy` |
| `VITE_APP_DISPLAY_NAME` | Display name in UI | `WSL Proxy` |
| `VITE_APP_VERSION` | App version | `dev` |
| `VITE_APP_BUILD_NUMBER` | Build number | `local` |
| `VITE_DEPLOYMENT_TIME` | Deployment timestamp | `local-dev` |
| `VITE_THEME_PRIMARY_COLOR` | Primary theme color (hex without #) | `2E3A3C` |
| `VITE_THEME_SECONDARY_COLOR` | Secondary theme color (hex without #) | `45A049` |
| `VITE_THEME_HOVER_COLOR` | Hover state color (hex without #) | `036408` |
| `VITE_TARGET_PLATFORM` | Platform type (`DOCKER` or `KUBERNETES`) | `DOCKER` |
| `VITE_JWT_SECURITY_PASSPHRASE` | JWT secret key (injected by `start.sh`) | *(empty - set at runtime)* |

> **Note:** `VITE_JWT_SECURITY_PASSPHRASE` is left empty in the committed `.env` file. Never hardcode secrets in files pushed to GitHub. The `start.sh` script handles injecting this value at runtime.

### Access URLs

| Service | URL |
|---------|-----|
| Admin Dashboard | http://localhost:8280 |
| API | http://localhost:8280/api |
| Health Check | http://localhost:8280/health |
| Health Check (detailed) | http://localhost:8280/health?detailed=true |
| HTTP Proxy | http://localhost:8180 |
| HTTPS Proxy | https://localhost:8443 |
| Prometheus Metrics | http://localhost:8280/metrics |
| Demo Node App | http://localhost:3009 |
| Redis | localhost:6479 |

### Options

| Flag | Description |
|------|-------------|
| `-n, --no-git` | Skip git stash/pull prompts |
| `-a, --auto` | Auto mode: stash + pull without prompts |
| `-j, --jwt-secret KEY` | Set JWT secret key (skips interactive prompt) |
| `-w, --watch` | Auto-rebuild admin dashboard on file changes |
| `-s, --skip-build` | Skip admin build (use existing dist) |
| `-r, --reset` | Fresh start - remove all volumes/data |
| `-d, --detach` | Run in background (don't attach to logs) |
| `--stop` | Stop all running services |
| `--reload` | Reload nginx config without restart |
| `--status` | Show running services |
| `--clean` | Stop and remove all volumes |

### Hot-Reload (No Restart Needed)

| Component | How it syncs |
|-----------|-------------|
| Lua API files (`./api/`) | Volume-mounted, OpenResty re-reads per request |
| Static HTML (`./html/`) | Volume-mounted, changes reflect immediately |
| Nginx config | Volume-mounted, run `./start.sh --reload` to apply |
| Admin dashboard | Use `-w` flag for auto-rebuild on save |

## Documentation

- **[Docker Deployment Guide](./DOCKER-DEPLOYMENT.md)** - Step-by-step deployment for all scenarios
- **[Docker Reference](./DOCKER.md)** - Configuration, monitoring, troubleshooting
- **[Kubernetes Helm Charts](./devops/helm-charts/wslproxy/)** - K8s deployment manifests

## Use Cases

### API Gateway for Microservices
Route, authenticate, and monitor traffic to multiple backend services with automatic certificate management and request/response transformation.

### CDN & Reverse Proxy
Cache static content, optimize images, and serve from edge locations with dynamic routing rules and traffic analytics.

### Service Mesh Ingress
Integrate with Consul for automatic service discovery, health checks, and dynamic upstream configuration.

### Multi-Tenant Platform
Isolate and manage multiple tenants with per-tenant SSL certificates, rate limiting, and traffic rules.

## Development Environment Requirements

- **Bash** - For deployment scripts
- **Docker** - For containerized deployment
- **Node.js** - Version 16+ (for admin dashboard development)
- **Yarn** - For package management

## Advanced Deployment

### Docker - Full Automation Script

For complete automated setup with environment configuration:

```bash
# Development environment
sudo ./deploy-to-docker.sh "dev" "wslproxy" "$JWT_TOKEN" && ./show.sh

# Production environment
sudo ./deploy-to-docker.sh "prod" "wslproxy" "$JWT_TOKEN"
```

**Windows Users** (with Git Bash):

```bash
bash ./deploy-to-docker-windows.sh "dev" "wslproxy" "$JWT_TOKEN"
```

### Docker - Build Locally

To build the Docker image from source:

```bash
./build.sh "dev" "wslproxy" "$JWT_TOKEN"
```

### Docker - Bootstrap Deployment

For fresh deployments with automatic configuration:

```bash
./bootstrap.sh "dev" "wslproxy" "$JWT_TOKEN" "DOCKER"
```

### Kubernetes Deployment

**Prerequisites:**
- Kubernetes cluster 1.20+ running
- Helm 3+ installed
- KubeSeal installed for secret management (optional but recommended)

**Step 1: Create environment configuration**

Create a `.env` file with your deployment details:

```
VITE_API_URL=https://YOUR-DOMAIN/api
VITE_FRONT_URL=https://YOUR-FRONT-DOMAIN
VITE_NGINX_CONFIG_DIR=/opt/nginx/
VITE_APP_NAME=YOUR_APP_NAME
VITE_APP_DISPLAY_NAME="YOUR APP NAME TO DISPLAY"
VITE_APP_VERSION: 1.0.0
VITE_DEPLOYMENT_TIME=20231206025957
VITE_APP_BUILD_NUMBER=025957
VITE_JWT_SECURITY_PASSPHRASE=YOUR-JWT-TOKEN
VITE_TARGET_PLATFORM=KUBERNETES
MINIO_ENDPOINT=<MINIO_ENDPOINT>
MINIO_ACCESS_KEY=<MINIO_ACCESS_KEY>
MINIO_SECRET_KEY=<MINIO_SECRET_KEY>
```

**Step 2: Create Kubernetes secrets**

Encode and create the secret manifests:

```bash
# Encode the .env file
cat .env | base64 > env.b64
```

**Step 3: Create secret manifests**

Create `api-secrets.yaml`:

```
apiVersion: v1
kind: Secret
metadata:
  name: wf-api-secret-<NAMESPACE>
  namespace: <NAMESPACE>
data:
  env_file: <BASE64 ENCODED ENV FILE>
```

Also create `front-secrets.yaml` for the admin dashboard:

```
apiVersion: v1
kind: Secret
metadata:
  name: wf-front-secret-<NAMESPACE>
  namespace: <NAMESPACE>
data:
  env_file: <BASE64 ENCODED ENV FILE>
```

**Step 4: Seal secrets (optional, for enhanced security)**

```bash
kubeseal --format=yaml < api-secrets.yaml > api-sealed-secret.yaml
kubeseal --format=yaml < front-secrets.yaml > front-sealed-secret.yaml
# Use the sealed secrets in your Helm values instead
```

**Step 5: Create settings.json for backend configuration**

The WSLProxy backend requires a `settings.json` file for initialization. Here's a minimal working example:

```json
{
  "instance_id": "prod-wslproxy-01",
  "instance_name": "Production WSLProxy",
  "env_profile": "prod",
  "redis_host": "redis-service.svc.cluster.local",
  "redis_port": 6379,
  "roles": [
    "release_manager",
    "admin",
    "read_only",
    "read_write"
  ],
  "env_vars": {
    "FRONT_URL": "https://your-domain.com",
    "CONTROL_PLANE_API_URL": "https://api.your-domain.com",
    "JWT_SECURITY_PASSPHRASE": "your-jwt-token",
    "APP_NAME": "WSLProxy"
  },
  "storage_type": "disk",
  "instance_locked": false,
    "ip2location_path": "<ADD IP2LOCATION-LITE-DB11.IPV6.BIN file Path>",
    "dns_resolver": {
      "nameservers": {
        "primary": "8.8.8.8",
        "secondary": "8.8.4.4",
        "port": "53"
      }
    },
    "super_user": {
      "username": "<username>",
      "email": "<email for login into the gateway>",
      "password": "<Password for gateway must be SHA256>"
    },
    "storage_type": "disk",
    "redis_host": "<REDIS_HOST>",
    "redis_port": "<REDIS_PORT>",
    "consul": {
      "dns_server_host": "<Consul DNS Resolver host>",
      "dns_server_port": <Consule DNS Resolver Port>
    },
    "nginx": {
      "default": {
        "no_server": "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Tm8gUnVsZXM8L3RpdGxlPgogIDxzdHlsZT4KICAgIGJvZHkgewogICAgICBmb250LWZhbWlseTogQXJpYWwsIHNhbnMtc2VyaWY7CiAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmNGY0ZjQ7CiAgICAgIG1hcmdpbjogMDsKICAgICAgcGFkZGluZzogMDsKICAgICAgZGlzcGxheTogZmxleDsKICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7CiAgICAgIGhlaWdodDogMTAwdmg7CiAgICB9CiAgICAKICAgIC5jb250YWluZXIgewogICAgICBtYXgtd2lkdGg6IDQwMHB4OwogICAgICBwYWRkaW5nOiA0MHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmOwogICAgICBib3gtc2hhZG93OiAwIDAgMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7CiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjsKICAgIH0KICAgIAogICAgaDEgewogICAgICBmb250LXNpemU6IDI0cHg7CiAgICAgIG1hcmdpbi1ib3R0b206IDIwcHg7CiAgICAgIGNvbG9yOiAjMzMzOwogICAgfQogICAgCiAgICBwIHsKICAgICAgZm9udC1zaXplOiAxOHB4OwogICAgICBjb2xvcjogIzY2NjsKICAgICAgbWFyZ2luLWJvdHRvbTogMzBweDsKICAgIH0KICAgIAogICAgLmJ0biB7CiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jazsKICAgICAgcGFkZGluZzogMTBweCAyMHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA3YmZmOwogICAgICBjb2xvcjogI2ZmZjsKICAgICAgZm9udC1zaXplOiAxNnB4OwogICAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7CiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDsKICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAwLjNzIGVhc2U7CiAgICB9CiAgICAKICAgIC5idG46aG92ZXIgewogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA1NmIzOwogICAgfQogIDwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGRpdiBjbGFzcz0iY29udGFpbmVyIj4KICAgIDxoMT5ObyBOZ2lueCBTZXJ2ZXIgQ29uZmlnIGZvdW5kITwvaDE+CiAgICA8cD5QbGVhc2UgYXNrIFdlYk9wcyB0byBDb25maWd1cmUgaXQuPC9wPgogICAgPGEgaHJlZj0iIyIgY2xhc3M9ImJ0biI+Q29udGFjdCBBZG1pbmlzdHJhdG9yPC9hPgogIDwvZGl2Pgo8L2JvZHk+CjwvaHRtbD4K",
        "conf_mismatch": "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Tm8gUnVsZXM8L3RpdGxlPgogIDxzdHlsZT4KICAgIGJvZHkgewogICAgICBmb250LWZhbWlseTogQXJpYWwsIHNhbnMtc2VyaWY7CiAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmNGY0ZjQ7CiAgICAgIG1hcmdpbjogMDsKICAgICAgcGFkZGluZzogMDsKICAgICAgZGlzcGxheTogZmxleDsKICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7CiAgICAgIGhlaWdodDogMTAwdmg7CiAgICB9CiAgICAKICAgIC5jb250YWluZXIgewogICAgICBtYXgtd2lkdGg6IDQwMHB4OwogICAgICBwYWRkaW5nOiA0MHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmOwogICAgICBib3gtc2hhZG93OiAwIDAgMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7CiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjsKICAgIH0KICAgIAogICAgaDEgewogICAgICBmb250LXNpemU6IDI0cHg7CiAgICAgIG1hcmdpbi1ib3R0b206IDIwcHg7CiAgICAgIGNvbG9yOiAjMzMzOwogICAgfQogICAgCiAgICBwIHsKICAgICAgZm9udC1zaXplOiAxOHB4OwogICAgICBjb2xvcjogIzY2NjsKICAgICAgbWFyZ2luLWJvdHRvbTogMzBweDsKICAgIH0KICAgIAogICAgLmJ0biB7CiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jazsKICAgICAgcGFkZGluZzogMTBweCAyMHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA3YmZmOwogICAgICBjb2xvcjogI2ZmZjsKICAgICAgZm9udC1zaXplOiAxNnB4OwogICAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7CiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDsKICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAwLjNzIGVhc2U7CiAgICB9CiAgICAKICAgIC5idG46aG92ZXIgewogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA1NmIzOwogICAgfQogIDwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGRpdiBjbGFzcz0iY29udGFpbmVyIj4KICAgIDxoMT5Db25maWd1cmF0aW9uIG5vdCBtYXRjaCE8L2gxPgogICAgPHA+UGxlYXNlIGNoZWNrIHlvdXIgY29uZmlndXJhdGlvbnMgb3IgYXNrIFdlYk9wcyB0byBDb25maWd1cmUgaXQgcmlnaHQuPC9wPgogICAgPGEgaHJlZj0iIyIgY2xhc3M9ImJ0biI+Q29udGFjdCBBZG1pbmlzdHJhdG9yPC9hPgogIDwvZGl2Pgo8L2JvZHk+CjwvaHRtbD4K",
        "no_rule": "PCFET0NUWVBFIGh0bWw+CjxodG1sPgo8aGVhZD4KICA8dGl0bGU+Tm8gUnVsZXM8L3RpdGxlPgogIDxzdHlsZT4KICAgIGJvZHkgewogICAgICBmb250LWZhbWlseTogQXJpYWwsIHNhbnMtc2VyaWY7CiAgICAgIGJhY2tncm91bmQtY29sb3I6ICNmNGY0ZjQ7CiAgICAgIG1hcmdpbjogMDsKICAgICAgcGFkZGluZzogMDsKICAgICAgZGlzcGxheTogZmxleDsKICAgICAgYWxpZ24taXRlbXM6IGNlbnRlcjsKICAgICAganVzdGlmeS1jb250ZW50OiBjZW50ZXI7CiAgICAgIGhlaWdodDogMTAwdmg7CiAgICB9CiAgICAKICAgIC5jb250YWluZXIgewogICAgICBtYXgtd2lkdGg6IDQwMHB4OwogICAgICBwYWRkaW5nOiA0MHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjZmZmOwogICAgICBib3gtc2hhZG93OiAwIDAgMTBweCByZ2JhKDAsIDAsIDAsIDAuMSk7CiAgICAgIHRleHQtYWxpZ246IGNlbnRlcjsKICAgIH0KICAgIAogICAgaDEgewogICAgICBmb250LXNpemU6IDI0cHg7CiAgICAgIG1hcmdpbi1ib3R0b206IDIwcHg7CiAgICAgIGNvbG9yOiAjMzMzOwogICAgfQogICAgCiAgICBwIHsKICAgICAgZm9udC1zaXplOiAxOHB4OwogICAgICBjb2xvcjogIzY2NjsKICAgICAgbWFyZ2luLWJvdHRvbTogMzBweDsKICAgIH0KICAgIAogICAgLmJ0biB7CiAgICAgIGRpc3BsYXk6IGlubGluZS1ibG9jazsKICAgICAgcGFkZGluZzogMTBweCAyMHB4OwogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA3YmZmOwogICAgICBjb2xvcjogI2ZmZjsKICAgICAgZm9udC1zaXplOiAxNnB4OwogICAgICB0ZXh0LWRlY29yYXRpb246IG5vbmU7CiAgICAgIGJvcmRlci1yYWRpdXM6IDRweDsKICAgICAgdHJhbnNpdGlvbjogYmFja2dyb3VuZC1jb2xvciAwLjNzIGVhc2U7CiAgICB9CiAgICAKICAgIC5idG46aG92ZXIgewogICAgICBiYWNrZ3JvdW5kLWNvbG9yOiAjMDA1NmIzOwogICAgfQogIDwvc3R5bGU+CjwvaGVhZD4KPGJvZHk+CiAgPGRpdiBjbGFzcz0iY29udGFpbmVyIj4KICAgIDxoMT5Db25maWd1cmF0aW9uIE1pc3NpbmchPC9oMT4KICAgIDxwPlBsZWFzZSBhc2sgV2ViT3BzIHRvIENvbmZpZ3VyZSB0aGlzIEFQSSBHYXRld2F5LjwvcD4KICAgIDxhIGhyZWY9IiMiIGNsYXNzPSJidG4iPkNvbnRhY3QgQWRtaW5pc3RyYXRvcjwvYT4KICA8L2Rpdj4KPC9ib2R5Pgo8L2h0bWw+Cg=="
      },
      "content_type": "text/html"
    }
  }
```

9. After creating settings.json you need to encode this file to base64.
10. Create a new file with name api-setings-secrets.yaml with following details:

```
apiVersion: v1
kind: Secret
metadata:
  name: wf-api-settings-<NAMESPACE>
  namespace: <NAMESPACE>
data:
  env_file: <BASE64 ENCODED ENV FILE>
```

11. Now, Run this command to generate the settings-sealed-secrets

```
kubeseal --format=yaml < api-setings-secrets.yaml > api-settings-sealed-secret.yaml
```

12. Open the api-settings-sealed-secret.yaml file copy the env_file: encrypted data.
13. Put that encrypted data into the k3s values files under the 'settings_sec_env_file:'.

14. After the secrets, you also need to update some following secrets in k3s api and front values file:

```
# NOTE: This is example when you are running kubernates clusters on local, For production you can put your domains of api and front door.

api_url: http://wf-api-svc-<NAMESPACE>.<NAMESPACE>.svc.cluster.local/api
front_url: http://wf-front-svc-<NAMESPACE>.<NAMESPACE>.svc.cluster.local
```

15. After updating env secrets, now you have to run these helm commands to run api-gateway on your kubernates:

```
helm upgrade -i wslproxy-api-<NAMESPACE> ./devops/helm-charts/wslproxy/ -f devops/helm-charts/wslproxy/values-<NAMESPACE>-api-<TARGET_CLUSTER>.yaml --set TARGET_ENV=<NAMESPACE> --namespace <NAMESPACE> --create-namespace
helm upgrade -i wslproxy-front-<NAMESPACE> ./devops/helm-charts/wslproxy/ -f devops/helm-charts/wslproxy/values-<NAMESPACE>-front-<TARGET_CLUSTER>.yaml --set TARGET_ENV=<NAMESPACE> --namespace <NAMESPACE> --create-namespace
helm upgrade -i wslproxy-nodeapp ./devops/helm-charts/node-app/ -f devops/helm-charts/node-app/values-<TARGET_CLUSTER>.yaml
```

16. Disaster Recovery

```
# NOTE: The nginx openresty configuration is backed on to S3 using kubernetes cronjob manifests. See online DR process documentation for more information.
```

## Usage

To develop the admin dashboard locally, use the `start.sh` script which builds inside the Docker container. For watch mode (auto-rebuild on save):

```bash
./start.sh -w
```

Manual rebuild inside the running container:

```bash
docker exec wslproxy-local sh -c 'cd /usr/local/openresty/nginx/html/openresty-admin && yarn build'
```

## List of the environments:-

| Environment | Link                             | Credentials         | IP addresses                                                                                                                                            | Ports         |
| :---------- | :------------------------------- | :------------------ | :------------------------------------------------------------------------------------------------------------------------------------------------------ | :------------ |
| `dev`       | `http://localhost:8081/`         | `Ask administrator` | `wslproxy API :- localhost(127.0.0.1) `                                                                                                                 | ` 8081->8080` |
|             |                                  |                     | `wslproxy Front :- localhost(127.0.0.1)`                                                                                                                | `8069->80`    |
|             |                                  |                     | `Docker nodeapp :-localhost(127.0.0.1) -> host.docker.internal if using extra_hosts: - "host.docker.internal:host-gateway" in docker or docker compose` | `3009->3009`  |
| `int`       | `http://api-int.wslproxy.com/`   | `Ask administrator` | `wslproxy API :- api-int.wslproxy.com`                                                                                                                  | `80 443`      |
|             |                                  |                     | `wslproxy Front :- front-int.wslproxy.com`                                                                                                              | `80 443`      |
|             |                                  |                     | `Node-app :-     `                                                                                                                                      | `3009->3009`  |
|             | `http://api-int.wslproxy.com/`   | `Ask administrator` | `wslproxy API :- api-int.wslproxy.com`                                                                                                                  | `80 443`      |
|             |                                  |                     | `wslproxy Front :- frontdoor-int.wslproxy.com`                                                                                                          | `80 443`      |
|             |                                  |                     | `Node-app :- 	 `                                                                                                                                         | `3009->3009`  |
|             | `http://api-int.wslproxy.com/`   | `Ask administrator` | `wslproxy API :- api-int.wslproxy.com`                                                                                                                  | `80 443`      |
|             |                                  |                     | `wslproxy Front :- frontdoor-int.wslproxy.com`                                                                                                          | `80 443`      |
|             |                                  |                     | `Node-app :-     `                                                                                                                                      | `3009->3009`  |
| `test`      | `http://api.test2.wslproxy.com/` | `Ask administrator` | `wslproxy API :- api.test2.wslproxy.com`                                                                                                                | `80 443`      |
|             |                                  |                     | `wslproxy Front :- front.test2.wslproxy.com`                                                                                                            | `80 443`      |
|             |                                  |                     | `Node-app :-      `                                                                                                                                     | `3009->3009`  |
|             | `http://api.test6.wslproxy.com/` | `Ask administrator` | `wslproxy API :- api.test6.wslproxy.com`                                                                                                                | `80 443`      |
|             |                                  |                     | `wslproxy Front :- front.wslproxy.com`                                                                                                                  | `80 443`      |
|             |                                  |                     | `Node-app :-      	`                                                                                                                                     | `3009->3009`  |

## How to run Ansible for a workflow

ansible-playbook devops/ansible/deploy-wslproxy.yml -i devops/ansible/hosts -l target_host_ip

### Replace 'devops/ansible/hosts' with the required host file

### Replace target_host_ip with the target host which you want to run the playbook
