# Ring Promoter — k3s1 Helm deploy

There is no Helm install of WSLProxy in a `k3s1.yaml` today. The VM edges
still roll out through Ring Promoter's **github** deployer
(`deploy-single-environment.yml`). This directory is the **k8sjob** path:
Ring Promoter creates a Job in `ring-exec` on k3s1, and that Job runs
`helm upgrade --install` of `ingress-controller/deploy/helm`.

| File | What it is |
|------|------------|
| [`k3s1.yaml`](k3s1.yaml) | Ring Promoter app registry entry (`deployer: k8sjob`) |
| [`k3s1-rbac.yaml`](k3s1-rbac.yaml) | Namespaces + RBAC for `ring-deploy-job` |

## One-time bootstrap on k3s1

```sh
kubectl apply -f deploy/ring-promoter/k3s1-rbac.yaml
```

Then append the `apps:` item from `k3s1.yaml` to the instance ConfigMap
(`diy-tax-return-uk` `devops/ring-promoter/configmap.yaml` for
ring-promoter.diytaxreturn.co.uk, or `ring-promoter`
`deploy/k8s/configmap.yaml` for rp.workstation.co.uk) and roll the pod:

```sh
kubectl apply -f <configmap>
kubectl rollout restart deploy/ring-promoter -n ring-system   # or workstation-ring-promoter
```

## What a seed/promote does

1. Ring Promoter creates Job `rp-wslproxy-k3s1-<ring>-…` in `ring-exec`.
2. The Job clones this repo at `RP_VERSION`, applies CRDs, then helm-upgrades:
   - **prod** → release `wslproxy-ingress`, namespace `wslproxy-system`, IngressClass `wslproxy`
   - **int/test/acc** → `wslproxy-<ring>` so they do not take over the live class
3. Health is in-cluster `GET /healthz` on the OpenResty API port (8080).

Seed an image tag that exists on Docker Hub (`latest`, `sha-<7chars>`, or an
`ingress-v*` tag). A 40-character git SHA is mapped to `sha-<7chars>`.
