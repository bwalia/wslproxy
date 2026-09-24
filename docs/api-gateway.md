# API Gateway (`api_gw`)

Kong-class edge gateway controls for any WSLProxy tenant, configured entirely
in the server JSON. No per-app Kong deployment, no nginx reload, no Lua to
write: a tenant adds an `api_gw` block to its server record and the next
request goes through the pipeline.

- **Package:** `api/api_gw/`
- **Schema:** [`docs/api-gw.schema.json`](api-gw.schema.json)
- **Examples:** [`examples/api-gw/`](../examples/api-gw/)
- **Tests:** `test/api_gw/` (`make test-lua`)
- **Smoke script:** `scripts/api-gw-smoke.sh`
- **Kong migration:** [`docs/api-gateway-kong-migration.md`](api-gateway-kong-migration.md)

---

## 1. What it does

| Module | Responsibility |
|--------|----------------|
| `real_ip` | Resolve the client IP from a forwarded header, but only inside a configured trust boundary |
| `request_security` | Correlation IDs, Content-Type enforcement, body-size limits, advisory token-shape checks |
| `cors` | Per-tenant origins/methods/headers/credentials, including preflight |
| `ivt` | Invalid-traffic guard: method, path, Authorization shape, header spoofing, burst — in audit, monitor or block mode |
| `auth` | Optional edge auth: `none`, `passthrough` (default), `jwt`, `api_key` |
| `rate_limit` | Named quota profiles per tenant, per route class, per key |
| `audit` | One structured, redacted JSON line per request, for Loki/SIEM |

Everything is opt-in. A server with no `api_gw` block behaves exactly as it did
before: `gateway_pipeline.execute` does one table lookup and moves on.

---

## 2. Pipeline order

Fixed, declared once in `api/api_gw/pipeline.lua`, and exported by
`ApiGw.pipeline_order()` so docs and tests read it from the same source as the
runtime.

| Priority | Stage | Module | Why it sits here |
|---------:|-------|--------|------------------|
| 1000 | `real_ip` | `real_ip` | Everything downstream keys on the client IP |
| 995 | `hooks_request` | `hooks` | Declarative request-header transforms + Lua `access_before` |
| 980 | `correlation` | `request_security` | Established before anything can deny, so every rejection and audit line carries the same id |
| 950 | `cors` | `cors` | A preflight carries no credentials and must not be authenticated or rate limited; it terminates here |
| 900 | `ivt` | `ivt` | Cheap structural checks run before the verifier and before content parsing |
| 850 | `request_security` | `request_security` | Content-Type, body size, token shape — correctness checks on traffic already judged real |
| 800 | `auth` | `auth` | Credential verification; produces `ctx.consumer` |
| 700 | `rate_limit` | `rate_limit` | Last built-in stage, so a quota can key on the *verified* consumer |
| 650 | `hooks_access_after` | `hooks` | Lua `access_after` — last chance to deny or enrich before proxy |

`header_filter` also runs declarative response-header transforms and Lua
`header_filter` hooks (see `api/api_gw/hooks.lua`).

A stage returns nothing to continue, or a decision. The first decision wins and
the rest of the pipeline is skipped — so a request rejected by IVT never
reaches the JWT verifier, and a preflight never consumes quota.

### Where it sits in the wider request path

```
gateway_ack.lua        (rewrite_by_lua_file)
  cache → captcha-verify → load server → match rules → gateway_pipeline.execute:
      1. api_gw     ← this package
      2. rate_limit (legacy server-level limiter)
      3. WAF        (waf_engine.lua)
gateway_resp.lua       (access_by_lua_file)   status codes, backend selection
header_filter_by_lua   ApiGw.header_filter()  CORS / correlation / RateLimit-* headers
log_by_lua             log_handler → ApiGw.log()  structured audit line
```

### Phase mapping

| nginx phase | api_gw entry point | What happens |
|-------------|--------------------|--------------|
| `rewrite` (via `gateway_pipeline.execute`) | `ApiGw.access(server_config, rule_data, profile_id)` | The whole staged pipeline. Returns `true` when the request was already answered. |
| `header_filter` | `ApiGw.header_filter()` | Applies the response headers the access phase collected. Collected rather than set inline because an upstream response can overwrite headers set earlier. |
| `log` (via `log_handler.log_request`) | `ApiGw.log()` | Emits the audit line. No-op unless the access phase ran. |

`body_filter` is not used. Body inspection stays with `waf_engine.lua`, which
already owns it; duplicating it here would mean two modules buffering the same
request body.

---

## 3. Multi-tenancy

Every shared-dict key is built through `api/api_gw/keys.lua`:

```
agw:1:<tenant>:<module>:<part>:<part>…
```

- `tenant` defaults to `"<profile_id>/<server_name>"`. The same hostname in
  `prod` and `int` is two tenants with two sets of counters.
- Set `api_gw.tenant_id` explicitly only when several hostnames should
  *deliberately* share one quota.
- `:` and `%` in any component are percent-escaped, so no tenant can forge a
  key boundary by putting a colon in a header value.
- Client identities (IP, API key, JWT subject) are never used raw: they are
  tenant-salted SHA-256 digests. The same client hashes differently for every
  tenant, in dict keys and in audit lines alike.

`test/api_gw/test_keys.lua` and the isolation sections of
`test/api_gw/test_rate_limit.lua`, `test_ivt.lua`, `test_cors.lua`,
`test_auth.lua` and `test_pipeline.lua` are the enforcement of all of this.

### Fail-open vs fail-closed

| Situation | Behaviour |
|-----------|-----------|
| `lua_shared_dict wsl_api_gw` missing | Fall back to `wsl_cache`; if that is absent too, rate limiting and burst guards are disabled and logged at `ERR`. Traffic flows. |
| Shared dict full, `incr` error | Fail open, recorded as `result: "unavailable"` in the audit line. |
| A stage throws | Logged at `ERR`, pipeline continues with the next stage. |
| Unknown rate profile named by a route | Not limited, recorded as `result: "unknown_profile"`. |
| Unresolvable enum value in config | Falls back to the documented default. |
| **Auth key/secret unresolvable** | **Fails closed (401).** Auth is the one place a missing credential source rejects rather than admits — an edge that cannot verify must not pretend it did. |
| Explicit policy decision (rate limit hit, IVT over threshold, credential invalid) | Fails closed, obviously. |

---

## 4. Enable it for a new tenant in under 10 minutes

**1. Confirm the shared dict exists** (once per deployment). Both nginx
templates already declare it:

```nginx
lua_shared_dict wsl_api_gw 20m;
```

`nginx-dev.conf.tmpl` (docker) and
`infra/ansible/roles/wslproxy/templates/nginx.conf.j2` (prod). If you run a
third template, add it there too — without it api_gw falls back to `wsl_cache`
and gateway counters compete with the content cache for eviction.

**2. Copy an example** onto the tenant's server record:

```bash
cp examples/api-gw/host:api.demo.example.com.json \
   /opt/nginx/data/servers/prod/host:api.yourtenant.com.json
```

…or paste the `api_gw` block into the existing record via the admin API:

```bash
curl -X PUT "$ADMIN/api/servers/host:api.yourtenant.com" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  --data @server-with-api-gw.json
```

The `api_gw` block is a nested object and passes through `CreateUpdateRecord`
untouched — no admin-API change was needed to support it.

**3. Change three things:** `server_name`, `cors.origins`, and the `routes`
paths. Leave `ivt.mode` at `audit` for the first rollout.

**4. Verify.** No reload — the next request picks it up:

```bash
BASE_URL=https://api.yourtenant.com API_PATH=/v1/ping ./scripts/api-gw-smoke.sh
```

**5. Watch the audit lines** before tightening anything (if nothing appears,
see §12 — the gateway blocks' `error_log` level filters `info` by default):

```bash
tail -f /usr/local/openresty/nginx/logs/error.log \
  | grep -o 'wsl_api_gw {.*}' \
  | jq 'select(.tenant == "prod/api.yourtenant.com") | {path, status, ivt, rate_limit}'
```

**6. Tighten once the numbers look right:** `ivt.mode` `audit` → `monitor` →
`block`, then lower the rate profiles.

### Rollback

```json
"api_gw": { "enabled": false }
```

One field, no reload, effective on the next request. Every module stops; the
server falls back to exactly the behaviour it had before the block existed. To
roll back one route rather than the tenant, drop that route's entry or set its
`ivt_mode` to `disabled`.

---

## 5. Route policy matrix

`routes` is the declarative path → policy table. The most specific match wins:

1. `equals` beats every prefix
2. a longer `starts_with` prefix beats a shorter one
3. `regex` sits below both
4. ties break on declaration order

Selection is therefore deterministic and does **not** depend on the order
routes happen to appear in the JSON.

```json
"routes": [
  { "name": "health", "path": "/health",   "path_key": "equals",      "auth": "none", "rate_profile": "health", "ivt_mode": "disabled" },
  { "name": "login",  "path": "/v1/auth",  "path_key": "starts_with", "auth": "none", "rate_profile": "auth", "max_body_bytes": 8192 },
  { "name": "api",    "path": "/v1/",      "path_key": "starts_with", "auth": "jwt",  "rate_profile": "standard" },
  { "name": "all",    "path": "/",         "path_key": "starts_with", "rate_profile": "public" }
]
```

A route may override `auth`, `rate_profile`, `max_body_bytes`, `ivt_mode` and
`cors`. Anything it does not set falls through to the server-level policy.

`methods` scopes a route to specific verbs, which is how you give writes a
tighter quota than reads on the same path.

### Path lists are segment-aware

`auth.public_paths`, `auth.protected_paths` and
`request_security.content_type.exempt_paths` match on path segments, not raw
prefixes: `/v1/public` covers `/v1/public` and `/v1/public/docs` but **not**
`/v1/publicadmin`. A raw prefix there would be an auth bypass waiting to
happen. Prefix an entry with `~` to use a regex instead (`"~^/v\\d+/public"`).

A route's `path_key: "starts_with"` is a raw prefix, because that is what it
says on the tin — write `"/v1/"` with the trailing slash when you mean the
segment.

---

## 6. Rate-limit profiles

Six named profiles ship by default and can be re-tuned or replaced:

| Profile | Default limit | Window | Key |
|---------|--------------:|-------:|-----|
| `health` | unlimited | — | — |
| `auth` | 10 | 60s | ip |
| `public` | 120 | 60s | ip |
| `standard` | 600 | 60s | consumer |
| `expensive` | 30 | 60s | consumer |
| `webhook` | 1200 | 60s | ip |

Keys: `ip`, `consumer`, `header` (with `header: "X-Name"`), `jwt.sub`.
`consumer` and `jwt.sub` fall back to the client IP when no subject was
resolved — never to a single shared bucket, which would let one caller
exhaust everyone else's quota.

The default algorithm is a two-bucket weighted **sliding** window: the current
bucket plus a time-weighted share of the previous one. It is still O(1) and two
dict operations, and it smooths the boundary burst that a fixed window allows.
Set `algorithm: "fixed"` per module or per profile if you prefer the cheaper
behaviour.

Responses carry both header families by default:

```
RateLimit-Limit: 600      X-RateLimit-Limit: 600
RateLimit-Remaining: 597  X-RateLimit-Remaining: 597
RateLimit-Reset: 42       X-RateLimit-Reset: 1789885920
```

`RateLimit-Reset` is seconds-until-reset (the draft standard);
`X-RateLimit-Reset` is an absolute epoch (the de-facto legacy form). Turn
either off with `rate_limit.headers.{standard,legacy}: false`.

---

## 7. The IVT guard

Four modes, so a tenant can roll it out without risking its own traffic:

- `disabled` — nothing runs
- `audit` — evaluate, record findings for the audit log, never react
- `monitor` — audit, plus an `X-WSL-IVT: <verdict>;score=<n>` response header a
  canary can alert on
- `block` — reject once the accumulated weight reaches `block_threshold`

Signals are **weighted and summed**, not individually fatal: one odd signal is
noise, three at once is a scanner.

| Signal | Default weight | Fires when |
|--------|---------------:|------------|
| `method_not_allowed` / `method_denied` | 5 | Method outside `methods.allow`, or inside `methods.deny` |
| `path_denied` | 5 | URI matches a `path_denylist` pattern |
| `auth_malformed` | 3 | `Authorization` is present but is not `<scheme> <token>`, or uses an unlisted scheme |
| `header_spoof` | 1 | Incoming headers matched `strip_header_prefixes` |
| `burst_exceeded` | 5 | Sliding burst counter over `burst.max_requests` |

Default `block_threshold` is 3.

**Header spoof stripping happens in every non-disabled mode**, including
`audit`. Removing a header a client should never have been able to set is
strictly safer than forwarding it, whatever the mode; the mode gates rejection
only. Both the upstream request and the internal request context are cleaned,
so no later stage can read a header the guard just declared untrustworthy.

The rejected credential value itself never appears in a finding, a log line or
a response — only the fact that the shape was wrong.

---

## 8. Auth

The default is `passthrough`: WSLProxy forwards the credential untouched and
the origin stays authoritative. An edge gateway that re-implements an app's
authorisation model ends up disagreeing with it, and the disagreement is always
discovered in production. Enforce at the edge only for the coarse checks an
edge can get right.

| Strategy | Behaviour |
|----------|-----------|
| `passthrough` (default) | Forward as-is. Still resolves an (unverified) subject for rate-limit keying. |
| `none` | The scope is public; no credential expected. |
| `jwt` | Verify signature via `resty.jwt`, plus `exp`/`nbf` with leeway, `iss`, `aud`, and `alg` against the configured value. |
| `api_key` | Match a shared key from a header or query parameter, byte-by-byte. |

**Secrets never live in the tenant JSON in git.** Use
`secret://<record-id>#<key>` (the existing encrypted secret store) or
`env://VAR_NAME`. An unresolvable ref resolves to `nil` and the request is
rejected — it never resolves to the ref string itself, which would turn a typo
into a shared password.

**A rejection never says why.** The caller gets
`{"error":"unauthorized","message":"Valid credentials are required for this
route.","correlation_id":"…"}`; the specific reason (`expired`,
`issuer_mismatch`, `key_unavailable`) goes to the audit line. Telling a caller
which check failed is a probing oracle.

### On keying quotas by `jwt.sub`

A `passthrough` route has no verified subject, so `key: "jwt.sub"` reads the
claim **without verifying the signature**. It is a fairness key, never an
authorisation decision, and it is spoofable by anyone who can mint a token
body. Set `auth.allow_unverified_subject: false` to fall back to the client IP
instead. The audit line always records `consumer_verified` so you can tell
which you were getting.

---

## 9. Audit logging

One JSON line per request on the nginx error log, tagged for the shipper:

```
wsl_api_gw {"ts":1789885904.58,"tenant":"prod/api.demo.example.com","server":"api.demo.example.com",
"profile":"prod","method":"GET","path":"/v1/orders","status":200,"latency_ms":12,
"correlation_id":"a780fd52…","client_key_hash":"f361971120a1e70b","route":"api",
"auth":{"strategy":"api_key","result":"verified","consumer_hash":"c007536168095ee7","consumer_verified":true},
"rate_limit":{"profile":"standard","result":"allowed","count":3,"limit":600},
"ivt":{"mode":"monitor","verdict":"clean","score":0},"bytes_sent":397}
```

Ship it with:

```
tail -F logs/error.log | grep -o 'wsl_api_gw {.*}' | jq .
```

> **If that command returns nothing, check your `error_log` level before
> anything else** — the line is emitted at `info` and the gateway blocks in
> both templates override `error_log` without a level. See §12.

### Redaction is not configurable downward

`audit.redact_headers` is **added to** a baseline — `authorization`,
`proxy-authorization`, `cookie`, `set-cookie`, `x-api-key`, `api-key`,
`x-auth-token` — that a tenant cannot remove. Naming `Authorization` in
`include_headers` does not capture it.

Also off by default, and deliberately:

- **the query string** (`include_query`) — query strings routinely carry
  tokens; truncated to 512 chars even when enabled
- **the raw client IP** (`include_client_ip`) — `client_key_hash` is always
  present instead, tenant-salted so it cannot be correlated across tenants
- **request and response bodies** — never captured, at all

Captured header values are truncated to 256 characters so a pathological header
cannot bloat a log line.

`sample_rate` drops ordinary traffic but **always keeps** gateway rejections
and any 4xx/5xx. A sampled audit trail that drops the 401s is worse than
useless.

---

## 10. Trusted proxies

```json
"real_ip": { "trusted_cidrs": ["10.0.0.0/8"], "recursive": true }
```

With no `trusted_cidrs` the forwarded header is **never** consulted and the TCP
peer is the client. That is the default and the only safe one: without it, any
caller sets its own `X-Forwarded-For` and walks straight through a per-IP rate
limit or an IP allowlist.

With a trust boundary configured:

- an untrusted peer's forwarded header is ignored entirely
- a trusted peer's header is walked right-to-left past trusted hops; the first
  untrusted address is the furthest point we can vouch for, and that is the
  client
- `recursive: false` takes the last entry instead, which is correct when
  exactly one trusted proxy sits in front

IPv4 only, via `api/ip_cidr.lua`. An IPv6 peer never matches an IPv4 CIDR and
so is never treated as trusted.

---

## 11. Rule-level overrides

A rule can tighten (or disable) the gateway for the traffic it matches, at its
root or under `match.response`:

```json
{ "id": "…", "api_gw": { "ivt": { "mode": "block" } } }
```

The override is merged over the server policy one level into each module table,
so untouched keys survive. `"api_gw": {"enabled": false}` on a rule switches
the gateway off for that rule's traffic only.

---

## 12. Three things that will catch you out

### `modules` takes MODULE names, not stage names

The pipeline runs seven stages gated on six module names, because
`correlation` and `request_security` are two stages sharing one module
(`api_gw/pipeline.lua` `M.STAGES`). The valid values are:

```
real_ip   request_security   cors   ivt   auth   rate_limit   audit
```

Listing `correlation` there does not enable the correlation id — it names
something that is not a module, so the stage is filtered out and the header
silently disappears. Nothing warns you: the other modules keep working, so the
policy looks live.

```jsonc
"modules": ["real_ip", "correlation", "cors", ...]      // no correlation id
"modules": ["real_ip", "request_security", "cors", ...] // correct
```

Omitting `modules` entirely runs everything the config configures, which is
the safe default. Set it only to deliberately narrow the pipeline.


### The audit line is emitted at `info` — check your `error_log` level

Both nginx templates override `error_log` **inside** the gateway server blocks:

```nginx
error_log  /var/log/nginx/error.log;    # no level → defaults to "error"
```

A directive with no level defaults to `error`, which silently discards the
audit line even though `http{}` above is configured for `info`. The symptom is
the worst kind: you enable `audit`, everything else works, and the log is
simply empty — nothing reports a failure, because nothing failed.

Verified on a live dev stack: with the default `audit.level: "info"` and a
level-less `error_log`, zero lines were written; raising the level produced
them immediately.

Two remedies, pick one per deployment:

```nginx
error_log  /var/log/nginx/error.log info;   # preferred: keeps audit at info
```

```json
"audit": { "level": "error" }               // if you cannot change the log level
```

`nginx-dev.conf.tmpl` now carries `info` on both gateway blocks so the docker
dev stack works out of the box. **The production template is deliberately left
alone** — raising a prod `error_log` to `info` is a per-deployment call about
log volume, not something a feature should decide for you. Make it consciously
before you rely on the audit trail in prod.

### api_gw does not strip an origin's own CORS headers

For an **allowed** origin, api_gw's `Access-Control-Allow-Origin` replaces
whatever the upstream sent. For a **disallowed** one, api_gw adds nothing — so
if your origin emits a blanket `Access-Control-Allow-Origin: *` of its own, that
header survives and the browser honours it. The gateway allowlist has not been
bypassed so much as rendered moot by the origin.

api_gw is an access gateway, not a response sanitiser, and silently deleting
headers an origin deliberately set would be its own kind of surprise. If you
need the allowlist to be authoritative, stop the origin sending its own CORS
headers, or strip them with `proxy_hide_header Access-Control-Allow-Origin;`.

You can tell the two apart at a glance: api_gw's allowed-origin responses also
carry `Vary: Origin` and, when configured, `Access-Control-Allow-Credentials`
and `Access-Control-Expose-Headers`. A bare `*` on its own came from upstream.

---

## 13. Operational notes

- **No reload for policy changes.** Server JSON is read from disk per request
  by `rule_loader.lua`, and `api_gw` normalises it per request. Save the record
  and the next request uses it. The only reload-requiring change is adding the
  `lua_shared_dict` line itself.
- **Normalisation is not cached.** It is a few table operations against a small
  table and runs alongside disk reads that already dominate. Caching it would
  put a staleness window in front of the no-reload guarantee.
- **Two nginx templates must stay in sync** — `nginx-dev.conf.tmpl` and
  `infra/ansible/roles/wslproxy/templates/nginx.conf.j2`. Both carry the shared
  dict and the `header_filter` hook.
- **The k3s ingress layer** (`ingress-controller/deploy/helm/files/nginx.conf`)
  is a separate deployment and does not carry api_gw. If you enable api_gw on
  an outer edge that proxies into k3s, the inner layer is unaffected — which is
  usually what you want, but check both layers before concluding a policy is
  not applying.

## 14. Testing

```bash
make test-lua                                          # plain lua
make test-lua LUA=/usr/local/openresty/luajit/bin/luajit
```

The suite runs without OpenResty: `test/api_gw/support/ngx_stub.lua` provides a
fake `ngx` with working shared dicts and a driveable clock, so window rollover
and burst expiry are tested without sleeping.

`test/api_gw/test_examples.lua` loads the files in `examples/api-gw/` and
asserts they resolve the way their comments claim, so the examples cannot rot.
