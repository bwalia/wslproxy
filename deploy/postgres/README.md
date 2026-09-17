# WSLProxy Postgres (Zalando) on k3s1 — central control-plane store

Creates an in-cluster Postgres for **wslproxy-system** via the Zalando
operator already running in `postgres`. The Ring Promoter app
`wslproxy-k3s1` (prod ring) runs `scripts/k3s1-bootstrap-control-plane.sh`
before helm so OpenResty mounts Secrets with `storage_type: pgsql`.

| | |
|--|--|
| CR | `wslproxy-db` in `wslproxy-system` |
| Service | `wslproxy-db.wslproxy-system.svc.cluster.local:5432` |
| Database / user | `wslproxy` / `wslproxy` |
| Credentials | Secret `wslproxy.wslproxy-db.credentials.postgresql.acid.zalan.do` |
| App connection Secret | `wslproxy-pgsql` → helm `openresty.pgsql.existingSecret` |
| Settings Secret | `wslproxy-settings` → helm `openresty.settings.existingSecret` |

## Secret source order

Same pattern as CI `secrets_mode: vault_or_sops`:

1. **Vault** — `https://vault.workstation.co.uk` (API; UI is vault-ui only)
2. **SOPS** — `infra/secrets/<env>/settings.sops.json` if Vault miss/unusable
3. **Kubernetes Secrets** — write `wslproxy-settings` + `wslproxy-pgsql` for helm

| Path | Purpose |
|--|--|
| `secret/data/wslproxy/prod/settings.json` | Full `settings.json` (WSLVault: base64 string in `data`) |
| `secret/data/wslproxy/prod/pgsql` | Optional overlay (`pg_database`, `pg_user`, …) |
| `infra/secrets/prod/settings.sops.json` | SOPS fallback for the same payload |

Bootstrap always sets `storage_type: "pgsql"` and points `pgsql.pg_host` at the
in-cluster Service. The DB password in `wslproxy-pgsql` comes from the
Zalando-managed secret (operator-owned). After first bootstrap, sync that
password into Vault/SOPS if VM edges also need to reach Postgres.

## One-time: credentials for the deploy Job

```bash
export KUBECONFIG=~/.kube/k3s1.yaml
kubectl -n ring-exec create secret generic wslproxy-vault \
  --from-literal=VAULT_ADDR=https://vault.workstation.co.uk \
  --from-literal=VAULT_TOKEN='<JWT from int/wslvault-token or WSLVault>' \
  --from-literal=SOPS_AGE_KEY='<AGE-SECRET-KEY-…>'   # optional SOPS fallback
kubectl apply -f deploy/ring-promoter/k3s1-rbac.yaml
```

## Manual provision (without Ring Promoter)

```bash
export KUBECONFIG=~/.kube/k3s1.yaml
export VAULT_ADDR=https://vault.workstation.co.uk
export VAULT_TOKEN='<JWT>'
# optional: export SOPS_AGE_KEY=...
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
Ingress / VPN) and the same `storage_type: pgsql` + credentials (from Vault,
SOPS fallback on Ansible `vault_or_sops`). In-cluster control-plane pods use
the ClusterIP Service name above.
