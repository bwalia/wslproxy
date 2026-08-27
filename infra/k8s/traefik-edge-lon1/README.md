# traefik-edge on lon1 (cloud001 / 72.62.211.28)

On this edge node, public `:80`/`:443` are owned by **OpenResty / wslproxy**
(`lon1.pop0.uk`). The cluster-wide `traefik-edge` DaemonSet binds `*:80`/`*:443`
via `hostNetwork`, which blocks OpenResty from starting.

## Change

1. `traefik-edge` (cluster DS) — affinity **excludes** `cloud001`.
2. `traefik-edge-lon1` — runs only on `cloud001`, listens on **loopback**:
   - `127.0.0.1:80` / `127.0.0.1:443` (Ingress still works for local/mesh clients)
   - `127.0.0.1:9080` (ping / admin entrypoint)

Public IP `72.62.211.28:80/443` is then free for wslproxy. Other edge nodes
(`cloud002`, `cloud003`) keep public Traefik binds unchanged.

**Important:** Linux treats `0.0.0.0:80` as conflicting with `127.0.0.1:80`.
OpenResty on lon1 must bind the public IP only via Ansible
`nginx_public_bind_ip: "72.62.211.28"` (see `host_vars/72.62.211.28`).

## Apply (from k3s control plane)

```bash
kubectl apply -f exclude-cloud001-patch.yaml   # see apply.sh
kubectl apply -f traefik-edge-lon1-daemonset.yaml
```

Or: `./apply.sh` on a host with admin kubeconfig.

> **2026-08-27:** wslproxy has moved OFF this node — the lon1 edge now runs on
> 195.20.255.201 (outside the cluster) and reaches cluster apps via NodePorts on
> 72.62.211.28. Public `:80`/`:443` on cloud001 are now free; if desired, cloud001
> can rejoin the cluster-wide `traefik-edge` DaemonSet (revert the affinity patch
> and delete `traefik-edge-lon1`). Until then the loopback-only setup below stays.
