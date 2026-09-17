# WSLProxy Postgres (Zalando) on k3s1 — central control-plane store

Creates an in-cluster Postgres for **wslproxy-system** via the Zalando
operator already running in `postgres`. The Ring Promoter app
`wslproxy-k3s1` (prod ring) runs `scripts/k3s1-bootstrap-control-plane.sh`
before helm so OpenResty mounts Vault settings with `storage_type: pgsql`.

| | |
|--|--|
| CR | `wslproxy-db` in `wslproxy-system` |
| Service | `wslproxy-db.wslproxy-system.svc.cluster.local:5432` |
| Database / user | `wslproxy` / `wslproxy` |
| Credentials | Secret `wslproxy.wslproxy-db.credentials.postgresql.acid.zalan.do` |
| App connection Secret | `wslproxy-pgsql` |
| Settings Secret | `wslproxy-settings` (from WSLVault prod) |

## WSLVault (prod)

UI: https://vault-ui.workstation.co.uk/  
API: https://vault.workstation.co.uk/  (Jobs must use this — UI has no `/v1/*`)

| Path | Purpose |
|--|--|
| `secret/data/wslproxy/prod/settings.json` | Full `settings.json` (WSLVault stores the JSON as a base64 string in `data`) |
| `secret/data/wslproxy/prod/pgsql` | Optional overlay (`pg_database`, `pg_user`, …) |

Bootstrap always sets `storage_type: "pgsql"` and points `pgsql.pg_host` at the
in-cluster Service. The DB password comes from the Zalando-managed secret
(operator-owned). After first bootstrap, copy that password into the Vault
`pgsql` secret if VM edges also need to reach Postgres.

Ensure `settings.json` in Vault is ready for pgsql (you can leave password empty):

```json
{
  "env_profile": "prod",
  "storage_type": "pgsql",
  "pgsql": {
    "pg_host": "wslproxy-db.wslproxy-system.svc.cluster.local",
    "pg_port": 5432,
    "pg_database": "wslproxy",
    "pg_user": "wslproxy"
  }
}
```

## One-time: Vault token for the deploy Job

```bash
export KUBECONFIG=~/.kube/k3s1.yaml
kubectl -n ring-exec create secret generic wslproxy-vault \
  --from-literal=VAULT_ADDR=https://vault.workstation.co.uk \
  --from-literal=VAULT_TOKEN='<JWT from int/wslvault-token or WSLVault>'
kubectl apply -f deploy/ring-promoter/k3s1-rbac.yaml
```

## Manual provision (without Ring Promoter)

```bash
export KUBECONFIG=~/.kube/k3s1.yaml
export VAULT_ADDR=https://vault.workstation.co.uk
export VAULT_TOKEN='<JWT>'
./scripts/k3s1-bootstrap-control-plane.sh
```

Then helm-upgrade with:

```text
--set openresty.settings.existingSecret=wslproxy-settings
--set openresty.pgsql.existingSecret=wslproxy-pgsql
```

Or seed/promote `wslproxy-k3s1` on the **prod** ring — the Job does both.

## Point POP edges at the central DB

Edges outside the cluster need a reachable Postgres endpoint (NodePort /
Ingress / VPN) and the same `storage_type: pgsql` + credentials (from Vault).
In-cluster control-plane pods use the ClusterIP Service name above.

## Control-plane dashboard — https://cp.pop0.uk

Prod helm sets `openresty.controlPlane.enabled=true`:

| Piece | Detail |
|--|--|
| K8s Ingress | host `cp.pop0.uk` → Service `…-openresty:8080` (admin UI) |
| NodePort | `32080` on **cloud003** (`77.68.126.63`) → container `8080` |
| Edge server | `data/servers/prod/host:cp.pop0.uk.json` |
| Edge rule | `data/rules/prod/cp-pop0-control-plane.json` → `77.68.126.63:32080` |
| Pin | `values-control-plane-cloud003.yaml` — `kubernetes.io/hostname=cloud003` + edge taint toleration |

DNS / Cloudflare: origin for `cp.pop0.uk` should be **cloud003** public IP `77.68.126.63`
(already wired). HTTPS is served by `traefik-edge` Ingress
`deploy/k3s1/wslproxy-cp-traefik-ingress.yaml` (TLS on `:443` + plain `:80`).

Admin API base URL is **not** baked into the image. At start,
`write-admin-runtime-config.sh` writes `/runtime-config.js` from
`WSLPROXY_API_URL` or `settings.admin.api_url` (default same-origin `/api`).
