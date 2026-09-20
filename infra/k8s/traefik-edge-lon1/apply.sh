#!/usr/bin/env bash
# Exclude cloud001 from cluster-wide traefik-edge; run loopback Traefik on lon1.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
KUBECTL="${KUBECTL:-kubectl}"

echo "==> Patch traefik-edge: exclude kubernetes.io/hostname=cloud001"
$KUBECTL -n kube-system patch daemonset traefik-edge --type=strategic -p '
spec:
  template:
    spec:
      affinity:
        nodeAffinity:
          requiredDuringSchedulingIgnoredDuringExecution:
            nodeSelectorTerms:
              - matchExpressions:
                  - key: node-role.kubernetes.io/edge
                    operator: In
                    values: ["true"]
                  - key: kubernetes.io/hostname
                    operator: NotIn
                    values: ["cloud001"]
'

echo "==> Apply traefik-edge-lon1 (loopback binds on cloud001)"
$KUBECTL apply -f "$ROOT/traefik-edge-lon1-daemonset.yaml"

echo "==> Wait for rollout"
$KUBECTL -n kube-system rollout status ds/traefik-edge --timeout=120s
$KUBECTL -n kube-system rollout status ds/traefik-edge-lon1 --timeout=120s

echo "==> Pods"
$KUBECTL -n kube-system get pods -o wide -l 'app.kubernetes.io/name in (traefik-edge,traefik-edge-lon1)'
echo "Done. On cloud001, public :80/:443 should be free for openresty."
