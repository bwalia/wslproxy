# Migrating from Kong plugins to WSLProxy `api_gw`

How an application that today runs a Kong deployment (or a Kong-shaped set of
expectations) maps onto WSLProxy's `api_gw` block. Nothing here is specific to
one app: the same table applies to any tenant.

Read [`docs/api-gateway.md`](api-gateway.md) first for the pipeline order and
the multi-tenancy model; this document is only the translation layer.

---

## 1. The shape of the change

| | Kong | WSLProxy `api_gw` |
|---|---|---|
| Unit of config | Service + Route + Plugin objects | One `api_gw` block on the server JSON |
| Where it lives | Kong's datastore / `kong.yaml` | `data/servers/<env>/host:<hostname>.json` |
| Applying a change | `deck sync` / Admin API, per Kong node | Save the record — next request picks it up |
| Ordering | Plugin `priority` numbers | Fixed, documented stage order |
| Multi-tenancy | One Kong per app, or shared Kong with workspaces | One WSLProxy, tenant-keyed counters |
| Consumers | First-class objects with credentials | A hashed identity derived per request |

The big structural difference: Kong models *consumers* as records it owns.
`api_gw` does not. It derives a consumer identity per request (a verified JWT
subject, a hashed API key) and uses it for quota keying and audit correlation
only. If your application needs consumer records — per-consumer plugin
overrides, credential rotation workflows, consumer groups — that stays with the
origin. `api_gw` is an edge control plane, not an identity provider.

---

## 2. Plugin-by-plugin

### `cors` → `api_gw.cors`

```yaml
# Kong
plugins:
  - name: cors
    config:
      origins: ["https://app.example.com"]
      methods: [GET, POST, OPTIONS]
      headers: [Authorization, Content-Type]
      exposed_headers: [X-Correlation-ID]
      credentials: true
      max_age: 3600
      preflight_continue: false
```

```json
"cors": {
  "origins": ["https://app.example.com"],
  "methods": ["GET", "POST", "OPTIONS"],
  "headers": ["Authorization", "Content-Type"],
  "expose_headers": ["X-Correlation-ID"],
  "credentials": true,
  "max_age": 3600,
  "preflight_continue": false
}
```

Field-for-field, with two differences worth knowing:

- `exposed_headers` is spelled `expose_headers` (matching the HTTP header).
- Kong will emit `Access-Control-Allow-Origin: *` alongside
  `Allow-Credentials: true` if you configure both. `api_gw` echoes the concrete
  origin instead, because browsers reject that combination outright.

Kong's regex origins are not supported. Use an exact origin or a single-label
wildcard (`https://*.example.com`), which covers the case regexes were usually
written for and cannot be got subtly wrong.

### `rate-limiting` / `rate-limiting-advanced` → `api_gw.rate_limit`

```yaml
# Kong
  - name: rate-limiting
    config:
      minute: 600
      policy: local
      limit_by: consumer
```

```json
"rate_limit": {
  "algorithm": "sliding",
  "default_profile": "standard",
  "profiles": {
    "standard": { "limit": 600, "window_seconds": 60, "key": "consumer" }
  }
}
```

| Kong | `api_gw` |
|---|---|
| `second` / `minute` / `hour` / `day` | one profile per window: `{limit, window_seconds}` |
| `limit_by: ip` | `"key": "ip"` |
| `limit_by: consumer` / `credential` | `"key": "consumer"` |
| `limit_by: header` + `header_name` | `"key": "header"`, `"header": "X-Name"` |
| `limit_by: path` | use a **route** with its own `rate_profile` |
| `policy: local` | the shared dict, per worker-set — equivalent |
| `policy: redis` / `cluster` | **not supported**; counters are node-local |
| `window_type: sliding` (advanced) | `"algorithm": "sliding"` — and it is the default |
| `hide_client_headers` | `headers.standard` / `headers.legacy` |

**Kong's multiple simultaneous windows have no direct equivalent.** Kong lets
one plugin enforce `minute: 600` *and* `hour: 10000` at once. `api_gw` applies
exactly one profile per request. Pick the window that actually protects the
origin — in practice the short one — and let the long-window concern move to
the origin or to the IVT burst counter.

**Counters are node-local.** If you run WSLProxy on several edges, each
enforces the configured limit independently, so the effective global limit is
`limit × nodes`. Kong's `policy: redis` centralises this; `api_gw` deliberately
does not, because a Redis round trip on every request is a latency and
availability cost that a per-edge limit usually does not justify. Divide your
limits by the edge count if the global number matters.

### `key-auth` → `api_gw.auth.strategy: "api_key"`

```yaml
  - name: key-auth
    config:
      key_names: [apikey]
      key_in_header: true
      key_in_query: true
```

```json
"auth": {
  "strategy": "api_key",
  "protected_paths": ["/v1/"],
  "api_key": {
    "header": "apikey",
    "query_param": "apikey",
    "keys_ref": "env://TENANT_EDGE_API_KEYS"
  }
}
```

Kong stores keys as `keyauth_credential` objects attached to consumers.
`api_gw` holds a flat key set resolved from a `secret://` record or an env var.
The consequence: **you lose per-consumer identity at the edge**, and get a
hashed digest of whichever key matched instead. If the origin needs to know
*which* consumer called, it must keep reading the key itself — which it can,
because the header is forwarded untouched.

Only one header name and one query parameter are supported, not Kong's
`key_names` list.

### `jwt` → `api_gw.auth.strategy: "jwt"`

```yaml
  - name: jwt
    config:
      key_claim_name: iss
      claims_to_verify: [exp, nbf]
      maximum_expiration: 3600
```

```json
"auth": {
  "strategy": "jwt",
  "protected_paths": ["/v1/"],
  "jwt": {
    "secret_ref": "secret://tenant-gw#jwt_hs256",
    "alg": "HS256",
    "issuer": "https://idp.example.com",
    "audience": "api",
    "leeway": 60,
    "claim_key": "sub"
  }
}
```

Kong resolves the signing key by looking up a `jwt_secret` credential keyed on
a claim (`iss` by default), which lets one route accept tokens from many
issuers. `api_gw` verifies against **one** configured key and optionally pins
`iss` and `aud`. Multi-issuer setups are the main case where the edge cannot do
the job and `passthrough` is the right answer.

`maximum_expiration` has no equivalent — the edge accepts whatever `exp` the
token carries, within `leeway`.

### `correlation-id` → `api_gw.request_security.correlation`

```yaml
  - name: correlation-id
    config:
      header_name: X-Correlation-ID
      generator: uuid
      echo_downstream: true
```

```json
"request_security": {
  "correlation": {
    "enabled": true,
    "header": "X-Correlation-ID",
    "echo_downstream": true,
    "accept_inbound": true
  }
}
```

One behavioural difference worth calling out: `api_gw` **validates** an inbound
id before adopting it (safe charset, length cap) and replaces it when it does
not pass, so a client cannot inject a newline or a quote into your audit lines.
Kong adopts whatever arrives. Set `accept_inbound: false` to always mint a
fresh one.

The generator is not configurable; ids are 32 hex characters.

### `request-size-limiting` → `api_gw.request_security.max_body_bytes`

```yaml
  - name: request-size-limiting
    config:
      allowed_payload_size: 8   # MB
      size_unit: megabytes
      require_content_length: false
```

```json
"request_security": {
  "max_body_bytes": 8388608,
  "require_content_length": false
}
```

Bytes, not megabytes. Per-route limits go on the route
(`"max_body_bytes": 8192` on the login route is the common case).

Like Kong's default, the check reads `Content-Length`, so a chunked request
that declares no length is not caught here — nginx's `client_max_body_size` is
the hard backstop. `require_content_length: true` closes that hole at the cost
of breaking streaming clients.

### `request-termination`, `ip-restriction`, `bot-detection` → `api_gw.ivt`

Kong splits these across three plugins; `api_gw` folds the equivalent signals
into one weighted guard.

| Kong | `api_gw` |
|---|---|
| `ip-restriction` `allow`/`deny` | Not in `api_gw` — use WSLProxy's existing rule `client_ip` / `client_ip_key: "cidr"` matching, which already does this and predates this package |
| `bot-detection` `deny` UA patterns | `ivt.path_denylist` for paths; for user-agents use a WAF rule (`waf_engine.lua` already inspects headers) |
| `request-termination` | A rule with status code 403 and a `message` |
| — | `ivt.methods.allow` / `.deny`, `require_auth_shape`, `strip_header_prefixes`, `burst` have no Kong equivalent |

The mode ladder (`audit` → `monitor` → `block`) is the part with no Kong
analogue and the part worth using: deploy in `audit`, read the audit lines for
a week, then tighten. Kong plugins are on or off.

### `http-log` / `file-log` / `syslog` → `api_gw.audit`

```yaml
  - name: file-log
    config:
      path: /dev/stdout
      custom_fields_by_lua: ...
```

```json
"audit": {
  "enabled": true,
  "level": "info",
  "tag": "wsl_api_gw",
  "include_headers": ["user-agent", "referer"]
}
```

`api_gw` writes one JSON line to the nginx error log and expects a log shipper
to pick it up. There is no HTTP sink, no buffering, no queue — deliberately: an
in-process HTTP log sink is a latency and back-pressure risk on the request
path, and every environment already runs something that tails a file.

The field set is fixed (see `docs/api-gateway.md` §9). You can add headers with
`include_headers`, but **not** bodies, and not the credential headers, which
are dropped even when named explicitly.

### Plugins with no `api_gw` equivalent

| Kong plugin | Where it goes instead |
|---|---|
| `acl` | Origin. The edge has no consumer-group model. |
| `oauth2`, `openid-connect` | Origin, or `passthrough` + origin. `api_gw` verifies tokens, it does not issue or introspect them. |
| `request-transformer`, `response-transformer` | Server `custom_headers` / `custom_response_headers`, or a rule's `strip_path` |
| `proxy-cache` | WSLProxy's own `cache_enabled` / Varnish integration |
| `upstream` load balancing, health checks | WSLProxy rule `backends` + `traffic_router.lua` |
| `canary` | Rule `backends` with weights, or `routing.mode: "header"` |
| `prometheus` | `prometheus_metrics.lua`, already wired |
| `acme` | `auto-ssl`, already wired |

---

## 3. A worked migration

Assume a Kong config like:

```yaml
services:
  - name: app-api
    url: http://app-origin:8080
    routes:
      - name: public;  paths: ["/v1/public"]
      - name: api;     paths: ["/v1"]
    plugins:
      - name: cors
        config: { origins: ["https://app.example.com"], credentials: true }
      - name: correlation-id
        config: { header_name: X-Correlation-ID, echo_downstream: true }
      - name: rate-limiting
        config: { minute: 600, limit_by: consumer }
      - name: request-size-limiting
        config: { allowed_payload_size: 1 }
      - name: key-auth
        config: { key_names: [apikey] }
```

**Step 1 — the service and routes** are already WSLProxy concepts: the server
record with its `server_name` and the rules that proxy to `http://app-origin:8080`.
Nothing in `api_gw` replaces them.

**Step 2 — translate the plugins** into one block:

```json
"api_gw": {
  "enabled": true,
  "cors": { "origins": ["https://app.example.com"], "credentials": true },
  "request_security": {
    "correlation": { "enabled": true, "header": "X-Correlation-ID" },
    "max_body_bytes": 1048576
  },
  "auth": {
    "strategy": "api_key",
    "public_paths": ["/v1/public"],
    "api_key": { "header": "apikey", "keys_ref": "env://APP_EDGE_API_KEYS" }
  },
  "rate_limit": {
    "default_profile": "standard",
    "profiles": { "standard": { "limit": 600, "window_seconds": 60, "key": "consumer" } }
  },
  "ivt": { "mode": "audit" },
  "audit": { "enabled": true }
}
```

**Step 3 — do not enable `auth` on day one.** Start with
`"strategy": "passthrough"` and the origin still checking the key. Read the
audit lines: `auth.result` tells you what the edge *would* have decided.
Switch to `api_key` only once those lines look right. Kong's cutover is
all-or-nothing; this one does not have to be.

**Step 4 — smoke it:**

```bash
BASE_URL=https://api.example.com API_PATH=/v1/ping API_KEY=$KEY \
  ./scripts/api-gw-smoke.sh
```

**Step 5 — roll back** by setting `"enabled": false`, with no reload, if
anything looks wrong.

---

## 4. Things to decide before you migrate

1. **Do you need cluster-wide rate limits?** If yes, keep Kong + Redis for that
   one concern, or accept `limit × edge_count` and divide accordingly.
2. **Do you need multi-issuer JWT?** The edge verifies against one key. Use
   `passthrough` and let the origin verify.
3. **Do you need per-consumer plugin overrides?** Kong's consumer model has no
   equivalent here. That logic belongs in the origin.
4. **Does anything depend on Kong's `X-Consumer-*` headers?** `api_gw` does not
   inject them. The origin still receives the original credential and can
   derive the same information itself.
5. **Are you behind another proxy?** Configure `real_ip.trusted_cidrs` before
   turning on any per-IP quota, or you are rate limiting your own load
   balancer.
