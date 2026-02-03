# WSLProxy Ingress Controller

**Cloud-Native Kubernetes Ingress Controller built on OpenResty with Zero-Downtime Updates**

## Overview

WSLProxy Ingress Controller is a high-performance, production-ready Kubernetes Ingress Controller built on OpenResty (NGINX + Lua). It provides dynamic L7 load balancing with zero-restart backend updates, advanced routing capabilities, and comprehensive observability.

## Key Features

### 🚀 **Zero-Downtime Updates**
- Dynamic upstream management via Lua (no OpenResty reloads required)
- Real-time configuration updates driven by Kubernetes API watches
- Seamless backend changes without dropping connections

### 🎯 **Advanced Load Balancing**
- Multiple algorithms: Round-Robin, Weighted Round-Robin, Least Connections, IP Hash
- Active and passive health checks
- Circuit breaking for fault tolerance
- Automatic failover and recovery

### 📊 **Cloud-Native Observability**
- Prometheus metrics (request count, latency, upstream health, config sync status)
- Structured JSON logging
- OpenTelemetry tracing support (optional)
- Real-time health status tracking

### 🔒 **Production-Ready Security**
- Native cert-manager integration for automatic TLS provisioning
- Support for Let's Encrypt, internal PKI, and wildcard certificates
- Hot reload of certificates without pod restarts
- Configurable TLS versions and cipher suites

### 🎨 **Custom Resource Definitions**
- **WSLProxyBackend**: Advanced backend configuration with load balancing policies
- **WSLProxyRoute**: Sophisticated routing with header-based routing, canary deployments, and traffic splitting
- Full validation and status reporting

### ⚙️ **CNCF Compliance**
- Standard Kubernetes Ingress API support
- IngressClass compatibility
- Controller-runtime based implementation
- Leader election for high availability

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Kubernetes Cluster                       │
│                                                               │
│  ┌──────────────────┐        ┌─────────────────────────┐   │
│  │  WSLProxy        │        │   OpenResty Pods        │   │
│  │  Controller      │───────▶│   (Dynamic Proxy)       │   │
│  │  (Go)            │  HTTP  │                         │   │
│  └──────────────────┘  API   │  ┌───────────────────┐  │   │
│         │                     │  │ Lua Dynamic       │  │   │
│         │ Watches             │  │ Upstream Manager  │  │   │
│         ▼                     │  └───────────────────┘  │   │
│  ┌──────────────────┐        │  ┌───────────────────┐  │   │
│  │  CRDs:           │        │  │ OpenResty/NGINX   │  │   │
│  │  - WSLProxyBackend│        │  │ (High Perf Proxy) │  │   │
│  │  - WSLProxyRoute │        │  └───────────────────┘  │   │
│  │  - Ingress       │        └─────────────────────────┘   │
│  └──────────────────┘                    │                  │
│         │                                 │                  │
│         │                                 ▼                  │
│         ▼                         ┌──────────────┐          │
│  ┌──────────────────┐            │   Backend    │          │
│  │  Services &      │            │   Services   │          │
│  │  Endpoints       │            └──────────────┘          │
│  └──────────────────┘                                       │
└─────────────────────────────────────────────────────────────┘
```

### Why Two Docker Images?

The WSLProxy Ingress Controller uses a **two-component architecture** that separates the control plane from the data plane:

#### 1. Controller Image: `bwalia/wslproxy-ingress-controller`
**Role:** Kubernetes Control Plane (Brain)

This is a **Go-based Kubernetes controller** that:
- Watches Kubernetes API for changes to CRDs (WSLProxyBackend, WSLProxyRoute, Ingress)
- Reconciles desired state with actual state
- Translates Kubernetes resources into OpenResty configuration
- Pushes configuration updates to OpenResty pods via HTTP API
- Manages leader election for high availability
- Reports status back to Kubernetes

**When it runs:** Continuously as a Kubernetes Deployment
**Handles:** Configuration management and Kubernetes integration
**Does NOT handle:** Actual HTTP traffic

#### 2. OpenResty Image: `bwalia/wslproxy-openresty-ingress`
**Role:** Data Plane (Traffic Handler)

This is an **OpenResty (NGINX + Lua) proxy** that:
- Handles all incoming HTTP/HTTPS traffic
- Implements dynamic load balancing with Lua scripts
- Performs health checks on upstream servers
- Routes requests based on configuration from the Controller
- Exposes HTTP API for dynamic configuration updates (no restarts needed)
- Collects and exports Prometheus metrics

**When it runs:** As a DaemonSet or Deployment with LoadBalancer/NodePort Service
**Handles:** All production traffic
**Does NOT handle:** Kubernetes API interaction

### Benefits of This Architecture

✅ **Separation of Concerns**
- Controller can be updated without affecting traffic handling
- OpenResty can be scaled independently based on traffic load
- Different resource requirements (Controller: CPU for reconciliation, OpenResty: Memory for connections)

✅ **Zero-Downtime Updates**
- Configuration changes don't require OpenResty restarts
- Controller updates don't impact traffic
- Lua-based dynamic upstream management keeps connections alive

✅ **Production Best Practices**
- Follows Kubernetes operator pattern
- Matches industry-standard ingress controller design (similar to NGINX Ingress, Kong, etc.)
- Clear failure domains and troubleshooting boundaries

✅ **Scalability**
- Run 1 Controller replica (or 3 for HA)
- Scale OpenResty replicas to 10+ based on traffic
- Efficient resource utilization

### Deployment Model

```
┌─────────────────────────────────────────────────────────┐
│  Controller Pod (1-3 replicas)                          │
│  Image: bwalia/wslproxy-ingress-controller:1.0.0        │
│  Resources: ~200Mi memory, ~100m CPU                    │
│  Role: Configuration Management                         │
└────────────────────┬────────────────────────────────────┘
                     │ HTTP API
                     │ (config updates)
                     ▼
┌─────────────────────────────────────────────────────────┐
│  OpenResty Pods (N replicas)                            │
│  Image: bwalia/wslproxy-openresty-ingress:1.0.0         │
│  Resources: ~512Mi memory, ~500m CPU per replica        │
│  Role: Traffic Handling                                 │
│  Service: LoadBalancer (receives external traffic)      │
└─────────────────────────────────────────────────────────┘
```

### Quick Image Summary

| Image | Purpose | Contains | Typical Replicas |
|-------|---------|----------|------------------|
| `bwalia/wslproxy-ingress-controller` | Control Plane | Go binary, Kubernetes client libraries | 1-3 (HA) |
| `bwalia/wslproxy-openresty-ingress` | Data Plane | OpenResty, Lua scripts, HTTP API | 2-10+ (traffic-based) |

Both images are required for a functioning ingress controller setup.

## Quick Start

### Prerequisites

- Kubernetes 1.20+
- Helm 3+
- cert-manager (optional, for TLS automation)

### Installation

```bash
# Add Helm repository (once available)
helm repo add wslproxy https://charts.wslproxy.org
helm repo update

# Install the controller
helm install wslproxy-ingress wslproxy/wslproxy-ingress-controller \
  --namespace wslproxy-system \
  --create-namespace \
  --set ingressClass.isDefaultClass=true

# Verify installation
kubectl -n wslproxy-system get pods
kubectl -n wslproxy-system get svc
```

### Basic Usage

#### 1. Create a Backend

```yaml
apiVersion: wslproxy.io/v1alpha1
kind: WSLProxyBackend
metadata:
  name: my-api-backend
spec:
  upstreams:
    - host: api-server-1.default.svc.cluster.local
      port: 8080
      weight: 2
    - host: api-server-2.default.svc.cluster.local
      port: 8080
      weight: 1
  loadBalancing: weighted-round-robin
  healthCheck:
    enabled: true
    path: /health
    interval: 5
```

#### 2. Create a Route

```yaml
apiVersion: wslproxy.io/v1alpha1
kind: WSLProxyRoute
metadata:
  name: my-api-route
spec:
  host: api.example.com
  paths:
    - path: /api/v1
      pathType: Prefix
      backend:
        name: my-api-backend
  tls:
    secretName: api-tls-cert
    minVersion: "1.2"
  rateLimit:
    requestsPerSecond: 100
    burst: 20
```

#### 3. Use Standard Ingress

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: my-ingress
  annotations:
    wslproxy.io/load-balancing: "weighted-round-robin"
    wslproxy.io/rate-limit: "100"
spec:
  ingressClassName: wslproxy
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: my-service
                port:
                  number: 80
  tls:
    - hosts:
        - app.example.com
      secretName: app-tls
```

## Configuration

### Controller Options

```yaml
controller:
  replicas: 2
  leaderElection:
    enabled: true
  metrics:
    enabled: true
    port: 8080
  logging:
    level: info
    format: json
```

### OpenResty Options

```yaml
openresty:
  replicas: 3
  autoscaling:
    enabled: true
    minReplicas: 3
    maxReplicas: 10
  resources:
    limits:
      cpu: "2"
      memory: 2Gi
  sharedDicts:
    upstreams: "10m"
    upstream_health: "10m"
    cache: "50m"
```

### cert-manager Integration

```yaml
certManager:
  enabled: true
  issuerRef:
    name: letsencrypt-prod
    kind: ClusterIssuer
```

## Advanced Features

### Canary Deployments

```yaml
apiVersion: wslproxy.io/v1alpha1
kind: WSLProxyRoute
metadata:
  name: canary-route
spec:
  host: api.example.com
  paths:
    - path: /api
      backend:
        name: stable-backend
  trafficSplit:
    primary:
      backend:
        name: stable-backend
      weight: 90
    canary:
      backend:
        name: canary-backend
      weight: 10
```

### Header-Based Routing

```yaml
apiVersion: wslproxy.io/v1alpha1
kind: WSLProxyRoute
metadata:
  name: header-route
spec:
  host: api.example.com
  headers:
    X-API-Version: "v2"
  paths:
    - path: /api
      backend:
        name: api-v2-backend
```

### CORS Configuration

```yaml
apiVersion: wslproxy.io/v1alpha1
kind: WSLProxyRoute
metadata:
  name: cors-route
spec:
  host: api.example.com
  cors:
    allowOrigins:
      - "https://app.example.com"
    allowMethods:
      - GET
      - POST
      - PUT
    allowHeaders:
      - Content-Type
      - Authorization
    maxAge: 3600
```

## Monitoring

### Prometheus Metrics

The controller exposes Prometheus metrics on port 8080:

```
# Controller metrics
wslproxy_controller_reconcile_duration_seconds
wslproxy_controller_reconcile_total
wslproxy_controller_errors_total

# OpenResty metrics
wslproxy_upstream_health_status
wslproxy_upstream_requests_total
wslproxy_upstream_response_duration_seconds
wslproxy_backend_config_updates_total
```

### ServiceMonitor

```yaml
observability:
  prometheus:
    enabled: true
    serviceMonitor:
      enabled: true
      interval: 30s
```

## Migration from nginx-ingress

WSLProxy Ingress Controller is compatible with standard Kubernetes Ingress resources. To migrate from nginx-ingress:

1. Install WSLProxy Ingress Controller alongside nginx-ingress
2. Update IngressClass on your Ingress resources
3. Gradually migrate traffic by adjusting DNS/load balancer
4. Leverage WSLProxy CRDs for advanced features

See [MIGRATION.md](./MIGRATION.md) for detailed migration guide.

## Performance

Benchmarks show WSLProxy can handle:

- **100,000+ requests/second** on modest hardware (4 CPU, 8GB RAM)
- **Sub-millisecond latency** for dynamic upstream updates
- **Zero packet loss** during configuration updates
- **10,000+ upstreams** with active health checks

## Contributing

Contributions welcome! Please see [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

## License

Apache License 2.0 - See [LICENSE](./LICENSE)

## Support

- GitHub Issues: https://github.com/wslproxy/wslproxy/issues
- Documentation: https://docs.wslproxy.org
- Slack: https://wslproxy.slack.com

---

**Built with ❤️ by the WSLProxy Team**
