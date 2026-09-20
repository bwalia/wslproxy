# `api_gw` example tenant configs

Two complete server records, both of which resolve and are exercised by
`test/api_gw/test_examples.lua` on every `make test-lua` — so if one stops
behaving the way its comments claim, the suite fails rather than sending an
operator down a dead end.

| File | Shape |
|------|-------|
| `host:api.demo.example.com.json` | Generic SaaS API. CORS for a browser front end, correlation IDs, IVT in **audit** mode, per-route rate classes, origin stays authoritative. This is the one to copy. |
| `host:api.fishers.example.com.json` | A tighter tenant: IVT in **block** mode, an edge API key on the admin surface only, quotas keyed on the JWT subject, an explicit shared `tenant_id`. |

The second file exists to demonstrate that a tenant with stricter requirements
needs **no new Lua** — only different JSON. Nothing in `api/api_gw/` knows
either tenant exists.

## Using one

```bash
# 1. copy and rename
cp examples/api-gw/host:api.demo.example.com.json \
   /opt/nginx/data/servers/prod/host:api.yourtenant.com.json

# 2. change three things: server_name, cors.origins, the routes' paths
#    (also change "id" to "host:<your server_name>")

# 3. no reload — verify on the next request
BASE_URL=https://api.yourtenant.com API_PATH=/v1/ping ./scripts/api-gw-smoke.sh
```

Or paste just the `api_gw` object into an existing server record through the
admin API; it is a nested object and passes through unchanged.

`config_status` is `false` in both files: these are policy examples, not
ready-to-activate nginx server blocks. Set the rest of the server record
(listens, SSL, rules) the way you normally would.

## Reference

- Schema: [`../../docs/api-gw.schema.json`](../../docs/api-gw.schema.json)
- Guide: [`../../docs/api-gateway.md`](../../docs/api-gateway.md)
- Coming from Kong: [`../../docs/api-gateway-kong-migration.md`](../../docs/api-gateway-kong-migration.md)
