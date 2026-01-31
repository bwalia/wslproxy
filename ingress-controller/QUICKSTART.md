# WSLProxy Ingress Controller - Quick Start Guide

This guide will help you get WSLProxy Ingress Controller up and running in minutes.

## Prerequisites

- Kubernetes cluster 1.20+ (or kind/k3s/minikube for testing)
- kubectl configured
- Helm 3+ installed
- Docker (for building images)

## Option 1: Quick Test with kind

The fastest way to test WSLProxy Ingress Controller:

```bash
# Clone the repository
cd ingress-controller

# Create kind cluster and deploy
make quick-test

# Wait for pods to be ready
kubectl wait --for=condition=ready pod -l app.kubernetes.io/name=wslproxy -n wslproxy-system --timeout=300s

# Check status
kubectl get pods -n wslproxy-system
```

## Option 2: Build and Deploy from Source

### Step 1: Build the Images

```bash
cd ingress-controller

# Build both controller and OpenResty images
make docker-build

# Or build and push to registry
make docker-buildx TAG=1.0.0
```

### Step 2: Install CRDs

```bash
# Install the Custom Resource Definitions
kubectl apply -f deploy/crds/
```

### Step 3: Deploy with Helm

```bash
# Install the controller
helm install wslproxy deploy/helm/ \
  --namespace wslproxy-system \
  --create-namespace \
  --set controller.image.tag=1.0.0 \
  --set openresty.image.tag=1.0.0

# Verify installation
kubectl get pods -n wslproxy-system
```

Expected output:
```
NAME                                              READY   STATUS    RESTARTS   AGE
wslproxy-controller-xxxxxxxxx-xxxxx               1/1     Running   0          30s
wslproxy-controller-xxxxxxxxx-xxxxx               1/1     Running   0          30s
wslproxy-openresty-xxxxxxxxx-xxxxx                1/1     Running   0          30s
wslproxy-openresty-xxxxxxxxx-xxxxx                1/1     Running   0          30s
wslproxy-openresty-xxxxxxxxx-xxxxx                1/1     Running   0          30s
```

## Step 4: Create Your First Backend

Create a file `my-backend.yaml`:

```yaml
apiVersion: wslproxy.io/v1alpha1
kind: WSLProxyBackend
metadata:
  name: echo-backend
  namespace: default
spec:
  upstreams:
    - host: echo-server.default.svc.cluster.local
      port: 8080
      weight: 1
  loadBalancing: round-robin
  healthCheck:
    enabled: true
    path: /health
    interval: 5
    timeout: 3
    expectedStatus: 200
```

Apply it:

```bash
kubectl apply -f my-backend.yaml

# Check backend status
kubectl get wslproxybackend echo-backend -o yaml
```

## Step 5: Deploy a Test Application

```bash
# Deploy echo server for testing
kubectl create deployment echo-server --image=ealen/echo-server:latest
kubectl expose deployment echo-server --port=8080

# Wait for it to be ready
kubectl wait --for=condition=ready pod -l app=echo-server --timeout=60s
```

## Step 6: Create a Route (Optional)

For more advanced routing, create a WSLProxyRoute:

```yaml
apiVersion: wslproxy.io/v1alpha1
kind: WSLProxyRoute
metadata:
  name: echo-route
  namespace: default
spec:
  host: echo.local
  paths:
    - path: /
      pathType: Prefix
      backend:
        name: echo-backend
  rateLimit:
    requestsPerSecond: 100
    burst: 20
```

Apply it:

```bash
kubectl apply -f my-route.yaml
```

## Step 7: Test the Ingress

```bash
# Get the LoadBalancer IP (or NodePort in kind)
export INGRESS_IP=$(kubectl get svc wslproxy-openresty -n wslproxy-system -o jsonpath='{.status.loadBalancer.ingress[0].ip}')

# If using NodePort (kind/minikube):
export INGRESS_PORT=$(kubectl get svc wslproxy-openresty -n wslproxy-system -o jsonpath='{.spec.ports[0].nodePort}')
export INGRESS_HOST=$(kubectl get nodes -o jsonpath='{.items[0].status.addresses[0].address}')

# Test the endpoint
curl -H "Host: echo.local" http://$INGRESS_IP/
# or with NodePort:
curl -H "Host: echo.local" http://$INGRESS_HOST:$INGRESS_PORT/
```

## Using Standard Ingress Resources

WSLProxy is compatible with standard Kubernetes Ingress resources:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: echo-ingress
  annotations:
    wslproxy.io/load-balancing: "round-robin"
    wslproxy.io/rate-limit: "100"
spec:
  ingressClassName: wslproxy
  rules:
    - host: echo.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: echo-server
                port:
                  number: 8080
```

## Monitoring

### View Controller Logs

```bash
make logs-controller
```

### View OpenResty Logs

```bash
make logs-openresty
```

### Access Prometheus Metrics

```bash
# Controller metrics
kubectl port-forward -n wslproxy-system svc/wslproxy-controller-metrics 8080:8080
curl http://localhost:8080/metrics

# OpenResty metrics
kubectl port-forward -n wslproxy-system svc/wslproxy-openresty 8080:8080
curl http://localhost:8080/metrics
```

## Troubleshooting

### Check Controller Status

```bash
kubectl get pods -n wslproxy-system
kubectl logs -n wslproxy-system -l app.kubernetes.io/component=controller
```

### Check Backend Health

```bash
# View backend status
kubectl get wslproxybackend -A

# Describe backend for details
kubectl describe wslproxybackend echo-backend

# Check OpenResty API
kubectl port-forward -n wslproxy-system svc/wslproxy-openresty 8080:8080
curl http://localhost:8080/api/internal/backends
```

### Common Issues

**Issue: Pods not starting**

```bash
# Check events
kubectl get events -n wslproxy-system --sort-by='.lastTimestamp'

# Check pod describe
kubectl describe pod -n wslproxy-system <pod-name>
```

**Issue: Backend not updating**

```bash
# Check controller logs
kubectl logs -n wslproxy-system -l app.kubernetes.io/component=controller

# Verify API connectivity
kubectl exec -n wslproxy-system deploy/wslproxy-controller -- \
  curl http://wslproxy-openresty:8080/healthz
```

## Cleanup

```bash
# Delete all resources
make uninstall

# Or with kind cluster
make quick-cleanup
```

## Next Steps

1. Read the [full documentation](./README.md)
2. Explore [advanced features](./docs/examples/)
3. Set up [cert-manager integration](./docs/cert-manager.md)
4. Configure [observability](./docs/observability.md)

## Getting Help

- GitHub Issues: https://github.com/wslproxy/wslproxy/issues
- Documentation: https://docs.wslproxy.org
- Examples: [./docs/examples/](./docs/examples/)
