# Ring Promoter — k3s1 Helm deploy + pgsql control plane

Ring Promoter app `wslproxy-k3s1` (`deployer: k8sjob`) creates a Job in
`ring-exec` on k3s1 that:

1. **prod only** — runs `scripts/k3s1-bootstrap-control-plane.sh`:
   Zalando Postgres, migrations, Secrets `wslproxy-pgsql` +
   `wslproxy-settings` (settings from **WSLVault prod** at
   https://vault-ui.workstation.co.uk/, forced `storage_type: pgsql`)
2. `helm upgrade --install` of `ingress-controller/deploy/helm`
   (prod mounts those Secrets into OpenResty)

| File | What it is |
|------|------------|
| [`k3s1.yaml`](k3s1.yaml) | Ring Promoter app registry entry |
| [`k3s1-rbac.yaml`](k3s1-rbac.yaml) | Namespaces + RBAC (incl. Zalando `postgresqls`, Jobs) |
| [`../postgres/README.md`](../postgres/README.md) | Vault paths + Secret layout |

## One-time bootstrap on k3s1

```sh
# Vault token for the Job (never commit the token)
kubectl -n ring-exec create secret generic wslproxy-vault \
  --from-literal=VAULT_ADDR=https://vault-ui.workstation.co.uk \
  --from-literal=VAULT_TOKEN=hvs.…

kubectl apply -f deploy/ring-promoter/k3s1-rbac.yaml
```

Append the `apps:` item from `k3s1.yaml` to the instance ConfigMap and roll
Ring Promoter:

```sh
kubectl apply -f <configmap>
kubectl rollout restart deploy/ring-promoter -n ring-system   # or workstation-ring-promoter
```

## What a seed/promote does

1. Job `rp-wslproxy-k3s1-<ring>-…` in `ring-exec` (envFrom `wslproxy-vault`).
2. Clone this repo at `RP_VERSION`, apply CRDs.
3. **prod** → bootstrap pgsql + Vault settings, then helm release
   `wslproxy-ingress` in `wslproxy-system` with IngressClass `wslproxy`,
   OpenResty mounts for settings/pgsql, and **control-plane UI** on
   `cp.pop0.uk` pinned to **cloud003** (`values-control-plane-cloud003.yaml`,
   NodePort `32080` / `77.68.126.63`). Edge rule:
   `data/rules/prod/cp-pop0-control-plane.json`.
4. **int/test/acc** → helm only (`wslproxy-<ring>`), no central DB bootstrap.
5. Health: in-cluster `GET /healthz` on OpenResty API port 8080.

Seed an image tag that exists on Docker Hub (`latest`, `sha-<7chars>`, or
`ingress-v*`). A 40-character git SHA maps to `sha-<7chars>`.
