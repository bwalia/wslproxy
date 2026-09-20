# Ring Promoter — k3s1 Helm deploy + pgsql control plane

**Owning instance:** [https://rp.workstation.co.uk/](https://rp.workstation.co.uk/)
(`workstation-ring-promoter` on k3s1). UI:
`https://rp.workstation.co.uk/?app=wslproxy-k3s1`.

Do **not** register this app on fictionally.org or diy-tax-return `ring-system`
(those have a different github-deployer app named `wslproxy` for Ansible VMs).

## Auto-deploy on merge to main

[`.github/workflows/deploy-control-plane-k3s1.yml`](../../.github/workflows/deploy-control-plane-k3s1.yml):

1. Build/push `bwalia/wslproxy:sha-<7chars>` (+ `:latest`)
2. `POST https://rp.workstation.co.uk/api/apps/wslproxy-k3s1/seed` with
   `{"ring":"prod","version":"<full git sha>"}`

That creates a Job in `ring-exec` which Vault-bootstraps + helm-upgrades.

### GitHub secrets (`bwalia/wslproxy`)

| Secret | Value |
|--------|--------|
| `RP_URL` | `https://rp.workstation.co.uk` |
| `RP_TOKEN` | workstation Secret `ring-promoter` → `RP_API_TOKEN` |
| `RP_PROD_PASSWORD` | optional; only if the instance has `RP_PROD_PASSWORD` set |
| `DOCKER_USER` / `DOCKER_PASSWD` | already present |

```sh
# From a machine with kube access to k3s1:
TOKEN=$(kubectl -n workstation-ring-promoter get secret ring-promoter \
  -o jsonpath='{.data.RP_API_TOKEN}' | base64 -d)
gh secret set RP_URL --repo bwalia/wslproxy --body 'https://rp.workstation.co.uk'
gh secret set RP_TOKEN --repo bwalia/wslproxy --body "$TOKEN"
```

## What the Job does

Ring Promoter app `wslproxy-k3s1` (`deployer: k8sjob`) creates a Job in
`ring-exec` on k3s1 that:

1. **prod only** — runs `scripts/k3s1-bootstrap-control-plane.sh`:
   Zalando Postgres, migrations, then Secrets `wslproxy-pgsql` +
   `wslproxy-settings` from **Vault → SOPS fallback** (forced `storage_type: pgsql`)
2. `helm upgrade --install` of `ingress-controller/deploy/helm`
   (prod mounts those Secrets into OpenResty; pins **`openresty.image.tag`**
   only — ingress controller image stays at chart `latest`)

| File | What it is |
|------|------------|
| [`k3s1.yaml`](k3s1.yaml) | App snippet (mirrored into ring-promoter ConfigMap) |
| [`k3s1-rbac.yaml`](k3s1-rbac.yaml) | Namespaces + RBAC (incl. Zalando `postgresqls`, Jobs) |
| [`../postgres/README.md`](../postgres/README.md) | Vault paths + Secret layout |

## One-time bootstrap on k3s1

Required before the first seed (CI does **not** create these):

```sh
export KUBECONFIG=~/.kube/k3s1.yaml

# Vault token for the Job (never commit the token).
# Use the API host (vault-ui is SPA-only). Token: JWT from int/wslvault-token.
# Optional SOPS_AGE_KEY enables Vault → SOPS fallback inside the Job.
kubectl -n ring-exec create secret generic wslproxy-vault \
  --from-literal=VAULT_ADDR=https://vault.workstation.co.uk \
  --from-literal=VAULT_TOKEN='<JWT>' \
  --from-literal=SOPS_AGE_KEY='<AGE-SECRET-KEY-…>'

kubectl apply -f deploy/ring-promoter/k3s1-rbac.yaml
```

App registration lives in **bwalia/ring-promoter**
`deploy/k8s/configmap.yaml` (workstation instance). After that ConfigMap is
applied / rolled:

```sh
kubectl rollout restart deploy/ring-promoter -n workstation-ring-promoter
# or merge to ring-promoter main so deploy-k3s1.yml applies it
```

Without `ring-exec/wslproxy-vault`, prod Jobs exit immediately with
`VAULT_ADDR/VAULT_TOKEN missing`.

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

A 40-character git SHA maps to image tag `sha-<7chars>` (`bwalia/wslproxy`).
