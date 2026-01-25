# WSL Proxy - Architecture Diagrams

This folder contains Draw.io compatible diagrams documenting the WSL Proxy architecture, deployment pipelines, and request flows.

## 📊 Available Diagrams

### 1. Platform Architecture ([wslproxy-architecture.drawio](wslproxy-architecture.drawio))

Complete overview of WSL Proxy's architecture including:
- **Client Layer**: Web browsers, mobile apps, API clients, IoT devices
- **Edge Layer**: WAF, SSL/TLS, API Gateway, Cache, Load Balancer, Router
- **Data Layer**: Redis, Shared Dict, SSL Certs, Config stores
- **Origin Servers**: Multi-region backend support
- **Management**: Admin UI, REST API, Prometheus metrics

![Architecture](images/wslproxy-architecture.png)

### 2. CI/CD Pipeline ([cicd-pipeline.drawio](cicd-pipeline.drawio))

Full CI/CD integration workflow:
- **Developer Flow**: Code changes → Git push → Pull request
- **GitHub Actions**: Lint, Test, Security scan, Docker build, Push to registry
- **Ansible Deployment**: Inventory, Vault, Roles, Playbooks for bare metal
- **Kubernetes Deployment**: Helm charts, Values files, Rolling updates
- **Environments**: Dev, Staging, Production, Bare Metal, Multi-Region

![CI/CD Pipeline](images/cicd-pipeline.png)

### 3. Helm Deployment & Scaling ([helm-deployment-scaling.drawio](helm-deployment-scaling.drawio))

Kubernetes deployment architecture:
- **Ingress Layer**: DNS, Cloud LB, Ingress Controller
- **Service Layer**: ClusterIP service with multi-port support
- **Deployment**: Pod replicas with resource limits
- **HPA**: Horizontal Pod Autoscaler configuration
- **Storage**: ConfigMaps, Secrets, PVCs
- **External Services**: Redis cluster, Prometheus, Loki
- **Helm Chart Structure**: Complete chart layout

![Helm Deployment](images/helm-deployment-scaling.png)

### 4. Request Flow ([request-flow.drawio](request-flow.drawio))

Step-by-step request processing:

```
1. Client Request → 2. DNS Resolution → 3. SSL/TLS Termination
→ 4. WAF Security Check → 5. Authentication → 6. Router Matching
→ 7. Cache Check (HIT/MISS) → 8. Load Balancer → 9. Upstream Request
→ 10. Origin Server → 11. Response Processing → 12. Metrics Update
→ 13. Client Response
```

![Request Flow](images/request-flow.png)

## 🛠️ How to Use

### View Online
Open any `.drawio` file directly on GitHub - it will render a preview.

### Edit with Draw.io
1. Go to [draw.io](https://app.diagrams.net/)
2. Choose **Open Existing Diagram**
3. Select **Device** and open the `.drawio` file
4. Make your changes
5. Export as `.drawio`, `.png`, or `.svg`

### VS Code Extension
Install the [Draw.io Integration](https://marketplace.visualstudio.com/items?itemName=hediet.vscode-drawio) extension to edit diagrams directly in VS Code.

## 📁 Folder Structure

```
docs/diagrams/
├── README.md                       # This file
├── wslproxy-architecture.drawio    # Platform architecture diagram
├── cicd-pipeline.drawio            # CI/CD pipeline flow
├── helm-deployment-scaling.drawio  # Kubernetes & Helm scaling
├── request-flow.drawio             # Request processing flow
└── images/                         # Exported PNG versions
    ├── wslproxy-architecture.png
    ├── cicd-pipeline.png
    ├── helm-deployment-scaling.png
    └── request-flow.png
```

## 🔗 Related Documentation

- **API Documentation**: [wslproxy.com/swagger](https://wslproxy.com/swagger/swagger.html)
- **GitHub Repository**: [github.com/bwalia/wslproxy](https://github.com/bwalia/wslproxy)
- **Landing Page**: [wslproxy.com](https://wslproxy.com)

## 📝 Export Instructions

To generate PNG versions for the main README:

1. Open each `.drawio` file in draw.io
2. Go to **File → Export as → PNG**
3. Set scale to 200% for high-resolution
4. Save to `docs/diagrams/images/` folder
5. Update main README.md with image references

## 🏗️ Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         WSL Proxy Edge Layer                         │
├─────────────────────────────────────────────────────────────────────┤
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐   │
│  │   WAF   │→ │  SSL/   │→ │  API    │→ │  Cache  │→ │  Load   │   │
│  │ Rules   │  │  TLS    │  │ Gateway │  │ Manager │  │ Balancer│   │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘   │
│       │            │            │            │            │         │
│       └────────────┴────────────┴────────────┴────────────┘         │
│                              │                                       │
│                      ┌───────┴───────┐                               │
│                      │    Router     │                               │
│                      │  (Lua/OpenResty)                              │
│                      └───────┬───────┘                               │
│                              │                                       │
├──────────────────────────────┼──────────────────────────────────────┤
│                              ▼                                       │
│  ┌─────────────────────────────────────────────────────────────┐    │
│  │                     Origin Servers                           │    │
│  │  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐     │    │
│  │  │ Region 1 │  │ Region 2 │  │ Region 3 │  │ Region N │     │    │
│  │  │ US-East  │  │ EU-West  │  │  Asia    │  │   ...    │     │    │
│  │  └──────────┘  └──────────┘  └──────────┘  └──────────┘     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
```

## 📜 License

These diagrams are part of the WSL Proxy project and are licensed under the same terms.
