# WSLProxy Postgres (Zalando) on k3s1

Creates an in-cluster Postgres for **wslproxy-system** via the Zalando
operator already running in `postgres`.

| | |
|--|--|
| CR | `wslproxy-db` in `wslproxy-system` |
| Service | `wslproxy-db.wslproxy-system.svc.cluster.local:5432` |
| Database / user | `wslproxy` / `wslproxy` |
| Credentials | Secret `wslproxy.wslproxy-db.credentials.postgresql.acid.zalan.do` |
| App settings Secret | `wslproxy-pgsql` (host/port/db/user/password) |

## Provision

```bash
export KUBECONFIG=~/.kube/k3s1.yaml
./scripts/k3s1-provision-pgsql.sh
```

That applies the CR, waits until Running, applies `infra/pgsql/migrations`,
and writes `wslproxy-pgsql`.

## Point WSLProxy at it

Set in `settings.json` (or via the Next.js Storage selector):

```json
{
  "storage_type": "pgsql",
  "pgsql": {
    "pg_host": "wslproxy-db.wslproxy-system.svc.cluster.local",
    "pg_port": 5432,
    "pg_database": "wslproxy",
    "pg_user": "wslproxy",
    "pg_password": "<from secret wslproxy-pgsql>"
  }
}
```

From a VM edge outside the cluster you must expose the Service (NodePort /
Ingress / VPN); in-cluster pods use the ClusterIP Service name above.
