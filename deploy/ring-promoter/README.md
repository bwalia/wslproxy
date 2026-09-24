# Ring Promoter — wslproxy instance (k3s1 control plane)

**Instance:** [https://rp.wslproxy.com/](https://rp.wslproxy.com/)
(namespace `wslproxy-ring-promoter` on k3s1). UI:
`https://rp.wslproxy.com/?app=wslproxy-k3s1`.

This repo owns the whole instance, the same way diy-tax-return-uk owns
`ring-promoter.diytaxreturn.co.uk` (`devops/ring-promoter/`). It used to be an
app on the shared `rp.workstation.co.uk` instance, whose config lives in
bwalia/ring-promoter. The copy kept here drifted from the one that instance
actually ran, and every seed from Sep 18 to Sep 24 ran a stale
`helm upgrade --wait` that timed out on the `<pending>` LoadBalancer IP.
Now [`configmap.yaml`](configmap.yaml) is the only copy of the deploy script.

| File | What it is |
|------|------------|
| [`configmap.yaml`](configmap.yaml) | App registry: `wslproxy-k3s1` and its k8sjob deploy script |
| [`deployment.yaml`](deployment.yaml), [`service.yaml`](service.yaml), [`ingress.yaml`](ingress.yaml) | The instance |
| [`namespace.yaml`](namespace.yaml), [`rbac.yaml`](rbac.yaml) | Namespace; control-plane SA + rights to run Jobs in `ring-exec` |
| [`k3s1-rbac.yaml`](k3s1-rbac.yaml) | Runner (`ring-exec/ring-deploy-job`) helm rights in `wslproxy-*` |
| [`secret.example.yaml`](secret.example.yaml) | Secret template; real one made by the bootstrap script |
| [`../../scripts/ring-promoter-bootstrap.sh`](../../scripts/ring-promoter-bootstrap.sh) | One-time DB, Secret and GitHub secrets |
| `data/servers/prod/host:rp.wslproxy.com.json` | Edge vhost (pop0 → k3s1 Traefik, rule `425e4925`) |

## Workflows

- [`deploy-ring-promoter.yml`](../../.github/workflows/deploy-ring-promoter.yml)
  runs on a push to main touching `deploy/ring-promoter/**`. It applies the
  manifests, restarts the pod (config is read only at boot) and checks that
  `wslproxy-k3s1` is registered. It runs on the Mac Studio runner because the
  k3s1 API is LAN-only.
- [`deploy-control-plane-k3s1.yml`](../../.github/workflows/deploy-control-plane-k3s1.yml)
  runs on a push to main touching `api/`, the chart, etc. It builds
  `bwalia/wslproxy:sha-<7>` and `bwalia/wslproxy-admin-next:sha-<7>`, then calls
  `POST https://rp.wslproxy.com/api/apps/wslproxy-k3s1/seed` with
  `{"ring":"prod","version":"<full sha>"}`.

## One-time setup

```sh
export KUBECONFIG=~/.kube/k3s1.yaml

# 1. Runner prerequisites (shared with the old instance; skip if present)
kubectl -n ring-exec create secret generic wslproxy-vault \
  --from-literal=VAULT_ADDR=https://vault.workstation.co.uk \
  --from-literal=VAULT_TOKEN='<JWT>' \
  --from-literal=SOPS_AGE_KEY='<AGE-SECRET-KEY-…>'

# 2. Database ringpromoter_wsl on ring-system/ring-promoter-db, the
#    wslproxy-ring-promoter/ring-promoter Secret, and the RP_URL / RP_TOKEN
#    GitHub secrets. Idempotent; --rotate to mint new values.
scripts/ring-promoter-bootstrap.sh

# 3. Deploy the instance
gh workflow run deploy-ring-promoter.yml
```

4. **DNS:** `rp.wslproxy.com` CNAME `pop0.wslproxy.com` (Cloudflare, DNS-only,
   same as `rp.workstation.co.uk`).
5. **Edge vhost:** push `data/servers/prod/host:rp.wslproxy.com.json` to the
   pop0 edge (delivery pipeline, `DEPLOY_MODE=servers`), or create the server
   in the admin UI with rule `425e4925-8ce1-de5b-2d13-0b086621101f` and SSL
   enabled.

The seed workflow runs on GitHub-hosted runners, so it only works after steps
4–5 make `rp.wslproxy.com` public.

## What a seed does

1. Job `rp-wslproxy-k3s1-<ring>-…` in `ring-exec` (envFrom `wslproxy-vault`).
2. Clones this repo at `RP_VERSION`, applies CRDs, and fixes an IngressClass
   with the wrong (immutable) controller.
3. **prod:** `scripts/k3s1-bootstrap-control-plane.sh` (Zalando Postgres,
   migrations, `wslproxy-settings` + `wslproxy-pgsql` from Vault → SOPS), then
   `helm upgrade --wait=false` of `wslproxy-ingress` in `wslproxy-system` with
   the cloud003 overlay, and OpenResty **and** dashboard pinned to
   `sha-<7>`. Then it applies the cp.pop0.uk Traefik split and waits on the
   openresty and dashboard rollouts.
4. **int/test/acc:** helm only (`wslproxy-<ring>`, ClusterIP, one replica).
5. Health: prod uses `https://cp.pop0.uk/healthz`, because its pods sit on
   cloud003 and the CNI overlay to edge nodes doesn't carry traffic. Other
   rings use in-cluster `:8080/healthz`.

`--wait=false` is deliberate. `wslproxy-ingress-openresty` is a LoadBalancer
whose EXTERNAL-IP stays `<pending>` (Traefik holds 80/443 on the nodes), so
`helm --wait` can never succeed.

A 40-character git SHA maps to image tag `sha-<7chars>`.
