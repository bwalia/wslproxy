# Prompt: Codify lon1 Traefik loopback + wslproxy public IP bind (Ansible / main infra)

> Copy everything below the line into an agent session opened on the **main infra repo**
> (the GitOps / Ansible repo that owns `traefik-edge` and k3s edge nodes — historically applied as
> `DaemonSet/traefik-edge` in `kube-system` with `last-applied-configuration`).
>
> Related live state was already applied ad-hoc; this prompt is to **make it durable via Ansible**.

---

## Mission

On edge node **cloud001** (`72.62.211.28`, hostname `srv1494211`, also called **lon1 / prod lon1**):

1. **Traefik** (`ingressClassName: traefik-edge`) must **not** bind the public NIC on `:80`/`:443`.
2. Traefik on that node should listen only on **loopback TCP sockets**:
   - `127.0.0.1:80`
   - `127.0.0.1:443`
   - `127.0.0.1:9080` (ping / traefik entrypoint)
3. **Public IP** `72.62.211.28:80` and `:443` must be free for **OpenResty / wslproxy** so the control-plane UI at **`lon1.pop0.uk`** works.
4. **Do not break** Traefik on other edge nodes (`cloud002` = `187.124.112.155`, `cloud003` = `77.68.126.63`) — they keep `*:80` / `*:443`.

Also ensure wslproxy Ansible (repo `bwalia/wslproxy`) binds OpenResty to the **public IP only** on lon1. Linux returns `EADDRINUSE` if OpenResty binds `0.0.0.0:80` while Traefik holds `127.0.0.1:80`.

---

## Current / desired end state (verify after apply)

On `root@72.62.211.28`:

```text
ss -lntp | grep -E ':(80|443|9080|7691)\b'
```

Expected:

| Bind | Owner |
|------|--------|
| `127.0.0.1:80` | traefik (`traefik-edge-lon1`) |
| `127.0.0.1:443` | traefik |
| `127.0.0.1:9080` | traefik |
| `72.62.211.28:80` | nginx / openresty |
| `72.62.211.28:443` | nginx / openresty |
| `0.0.0.0:7691` | openresty admin API |

Smoke:

```bash
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:9080/ping          # 200
curl -sS -o /dev/null -w '%{http_code}\n' -H 'Host: lon1.pop0.uk' http://72.62.211.28/healthz
# 200 or 301 to https — not connection refused
systemctl is-active openresty   # active
```

Cluster (admin kubeconfig on control plane, e.g. `debian009` / `192.168.1.104`):

```bash
kubectl -n kube-system get ds,pods -o wide -l 'app.kubernetes.io/name in (traefik-edge,traefik-edge-lon1)'
# traefik-edge on cloud002 + cloud003 only
# traefik-edge-lon1 on cloud001 only
```

---

## What already exists (ad-hoc; replace with Ansible)

Live cluster (applied manually, not GitOps):

1. Patched `DaemonSet/traefik-edge` with affinity **excluding** `kubernetes.io/hostname=cloud001`.
2. Created `DaemonSet/traefik-edge-lon1` (hostNetwork, nodeSelector hostname=cloud001, entryPoints on `127.0.0.1`).
3. In **wslproxy** repo (partial):
   - `infra/k8s/traefik-edge-lon1/` — reference manifests + `apply.sh`
   - `infra/ansible/host_vars/72.62.211.28/vars.yaml` → `nginx_public_bind_ip: "72.62.211.28"`
   - Templates `nginx.conf.j2` / `default.conf.j2` honor `nginx_public_bind_ip`
   - Live nginx.conf on lon1 was hot-patched the same way

**Your job in the main infra repo:** own the Traefik DaemonSet split via Ansible (or Helm/kustomize that Ansible applies). Coordinate with wslproxy for the OpenResty bind (already started there).

---

## Implement in main infra repo

### A. Inventory / host facts

Document lon1:

| Field | Value |
|-------|--------|
| Public IP | `72.62.211.28` |
| k3s node name | `cloud001` |
| Role label | `node-role.kubernetes.io/edge=true` |
| SSH | `root@72.62.211.28` |
| wslproxy admin host | `lon1.pop0.uk` → OpenResty → `127.0.0.1:7691` |
| Cluster API | via k3s control plane (not local k3s server on cloud001; node runs `k3s-agent`) |

### B. Ansible role tasks (suggested)

Create or extend a role e.g. `roles/traefik_edge/` (or under existing `k3s` / `edge` role):

1. **Template** `traefik-edge` DaemonSet (cluster-wide edge):
   - Keep existing image/args/resources/SA `traefik`
   - `hostNetwork: true`
   - `nodeSelector: node-role.kubernetes.io/edge: "true"`
   - **Add affinity** so it does **not** schedule on lon1:

```yaml
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
              values: ["{{ traefik_edge_loopback_nodes | default(['cloud001']) | list | join('\",\"') }}"]
# Prefer clean Jinja list for NotIn values — see example below
```

Better Jinja pattern:

```yaml
# group_vars or role defaults
traefik_edge_loopback_hostnames:
  - cloud001

# in template
            - key: kubernetes.io/hostname
              operator: NotIn
              values:
{% for h in traefik_edge_loopback_hostnames %}
                - {{ h }}
{% endfor %}
```

   - EntryPoints stay `*:80` / `*:443` / `:9080` (or `0.0.0.0`) for non-lon1 edges.

2. **Template** second DaemonSet `traefik-edge-lon1` (or generic name `traefik-edge-loopback`):
   - `nodeSelector: kubernetes.io/hostname: cloud001` (or loop over `traefik_edge_loopback_hostnames` with one DS per host, or a single DS with `nodeSelector` / affinity In list)
   - Same `ingressclass=traefik-edge`, same SA, same image
   - Args **must** be:

```text
--entryPoints.web.address=127.0.0.1:80/tcp
--entryPoints.websecure.address=127.0.0.1:443/tcp
--entryPoints.traefik.address=127.0.0.1:9080/tcp
--providers.kubernetesingress
--providers.kubernetesingress.ingressclass=traefik-edge
```

   - Probes: `httpGet` against `127.0.0.1:9080/ping` (set `host: 127.0.0.1` on probe)
   - **Do not** use `hostPort` mapping to all interfaces; with `hostNetwork`, Traefik’s listen address is what matters
   - Toleration for `node-role.kubernetes.io/edge=true:NoSchedule`

3. **Apply** with `kubernetes.core.k8s` or `kubectl apply` from a controller that has admin kubeconfig (control-plane host or CI with kubeconfig secret).

4. **Handlers:** wait for `rollout status` on both DaemonSets; fail the play if cloud001 still has the old `*:80` Traefik.

5. **Idempotency:** if ad-hoc objects already exist, Ansible apply must reconcile to the templated desired state (not fight GitOps). If Argo/Flux owns this, put the manifests in the GitOps path instead of one-shot kubectl.

### C. Reference DaemonSet (lon1 loopback) — already proven live

```yaml
apiVersion: apps/v1
kind: DaemonSet
metadata:
  name: traefik-edge-lon1
  namespace: kube-system
  labels:
    app.kubernetes.io/component: ingress
    app.kubernetes.io/name: traefik-edge-lon1
spec:
  selector:
    matchLabels:
      app.kubernetes.io/name: traefik-edge-lon1
  template:
    metadata:
      labels:
        app.kubernetes.io/component: ingress
        app.kubernetes.io/name: traefik-edge-lon1
    spec:
      serviceAccountName: traefik
      hostNetwork: true
      dnsPolicy: ClusterFirstWithHostNet
      priorityClassName: system-node-critical
      nodeSelector:
        kubernetes.io/hostname: cloud001
      tolerations:
        - effect: NoSchedule
          key: node-role.kubernetes.io/edge
          operator: Equal
          value: "true"
      containers:
        - name: traefik
          image: rancher/mirrored-library-traefik:3.7.4
          args:
            - --global.checknewversion=false
            - --global.sendanonymoususage=false
            - --entryPoints.web.address=127.0.0.1:80/tcp
            - --entryPoints.websecure.address=127.0.0.1:443/tcp
            - --entryPoints.traefik.address=127.0.0.1:9080/tcp
            - --api.dashboard=false
            - --ping=true
            - --providers.kubernetesingress
            - --providers.kubernetesingress.ingressclass=traefik-edge
            - --log.level=INFO
            - --accesslog=true
            - --entryPoints.web.transport.respondingTimeouts.readTimeout=1800s
            - --entryPoints.websecure.transport.respondingTimeouts.readTimeout=1800s
          ports:
            - { name: web, containerPort: 80 }
            - { name: websecure, containerPort: 443 }
            - { name: traefik, containerPort: 9080 }
          livenessProbe:
            httpGet: { path: /ping, port: 9080, host: 127.0.0.1 }
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet: { path: /ping, port: 9080, host: 127.0.0.1 }
            initialDelaySeconds: 5
            periodSeconds: 10
          securityContext:
            capabilities:
              add: ["NET_BIND_SERVICE"]
              drop: ["ALL"]
            runAsUser: 0
```

Copy of working files also lives in **wslproxy**:
`infra/k8s/traefik-edge-lon1/traefik-edge-lon1-daemonset.yaml` and `apply.sh`.

### D. wslproxy side (ensure / PR if missing)

In `bwalia/wslproxy` (may already be local; commit/PR if not on main):

- `nginx_public_bind_ip: "72.62.211.28"` in `infra/ansible/host_vars/72.62.211.28/vars.yaml`
- `nginx.conf.j2` / `default.conf.j2`: when set, `listen {{ ip }}:80` / `listen {{ ip }}:443` (skip `[::]:443` catch-all)
- Deploy tag `nginx` (or full) to lon1 so templates replace the hot-patch

Do **not** remove Traefik from the cluster; coexistence is intentional.

### E. Out of scope / anti-goals

- Do **not** change Traefik binds on cloud002/cloud003.
- Do **not** remove `node-role.kubernetes.io/edge` from cloud001 unless you intentionally want zero Traefik there (loopback Traefik is preferred so `traefik-edge` Ingress still works for local/mesh clients).
- Do **not** move Traefik to random high ports without documenting Ingress clients.
- Do **not** leave OpenResty listening on `0.0.0.0:80` on lon1.

---

## Acceptance checklist

- [ ] Ansible (or GitOps) is source of truth for both DaemonSets
- [ ] Re-running the play is idempotent
- [ ] cloud001: Traefik on `127.0.0.1` only for 80/443/9080
- [ ] cloud001: OpenResty on `72.62.211.28:80/443`, service active
- [ ] `lon1.pop0.uk` HTTP/HTTPS reachable on public IP
- [ ] cloud002/cloud003: Traefik still on public `:80`/`:443`
- [ ] Ingress class name remains `traefik-edge`
- [ ] Docs: short README in infra repo describing lon1 coexistence

---

## First deliverable

1. Find where `traefik-edge` is defined (or create the role if it only existed as `kubectl apply`).
2. Add Ansible templates + vars for the split DaemonSets.
3. Apply against the cluster and verify the `ss` / curl checklist above.
4. Link or PR the matching `nginx_public_bind_ip` change in wslproxy if not already merged.
5. Remove reliance on the one-off `apply.sh` in wslproxy once infra owns it (keep a pointer in docs).
