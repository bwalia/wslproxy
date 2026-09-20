# WSL Proxy — Architecture Diagrams

Draw.io sources for architecture, CI/CD, Helm scaling, and request flow. The **canonical overview for GitHub** is the Mermaid diagrams in the root [README.md](../../README.md) (they render on github.com without PNG exports).

## Draw.io files

| File | Topic |
|------|--------|
| [wslproxy-architecture.drawio](wslproxy-architecture.drawio) | Edge + control plane overview |
| [request-flow.drawio](request-flow.drawio) | Per-request processing stages |
| [cicd-pipeline.drawio](cicd-pipeline.drawio) | Build / deploy pipeline |
| [helm-deployment-scaling.drawio](helm-deployment-scaling.drawio) | k8s / Helm / HPA |
| [ingress-controller-architecture.drawio](ingress-controller-architecture.drawio) | k3s ingress layer |

Open on GitHub for a preview, or edit at [diagrams.net](https://app.diagrams.net/) / VS Code Draw.io extension.

## PNG exports (optional)

If you need images for slides or external docs:

1. Open a `.drawio` in diagrams.net  
2. **File → Export as → PNG** (≈200% scale)  
3. Save under `docs/diagrams/images/`

The root README no longer depends on these PNGs.

## Related

- Landing page: [wslproxy.com](https://wslproxy.com) (`html/index.html`)  
- Swagger: `/swagger/`  
- Deep dive: [CLAUDE.md](../../CLAUDE.md)
