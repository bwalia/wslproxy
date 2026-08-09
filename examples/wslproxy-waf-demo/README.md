# wslproxy WAF demo — "before / after", F5-style

A self-contained demonstration that puts a deliberately-vulnerable **payments API**
behind the wslproxy WAF and shows, side by side, what a WAF stops. It covers the
OWASP Top 10 **and** modern classes an API-era WAF must handle — SSTI, Log4Shell,
Spring4Shell, SSRF, NoSQL injection, XXE, JWT `alg:none`, prototype pollution,
GraphQL introspection, mass assignment and scanner recon.

```
                         ┌─────────────────────────── same origin ───────────────────────────┐
 payments-open.…    ───► wslproxy (lon1 edge)  ──►  Acme Pay (k3s1, cloud001, NodePort 30084)
   (WAF OFF)              proxy only
 payments-secure.… ───► wslproxy (lon1 edge)  ──►  Acme Pay
   (WAF ON, block)        WAF: waf-policy-payments-hard (36 rules, block mode)
```

Both hostnames point at the **same** vulnerable origin. The only difference is
whether the wslproxy WAF is bound — so every "before/after" pair is apples-to-apples.

## Live hosts

| Host | WAF | Role |
|------|-----|------|
| https://payments-open.fictionally.org   | off            | BEFORE — origin fully exposed |
| https://payments-secure.fictionally.org | on, block mode | AFTER — wslproxy WAF in front  |

## Result (19 attacks)

```
OPEN   (no WAF):        18/19 attacks exploit the origin
SECURE (wslproxy WAF):  18/19 of those blocked (403 + X-WAF-Rule)
```

The single attack the WAF does **not** block is **BOLA / IDOR**
(`GET /api/accounts/9999`). That is deliberate and honest: object-level
authorization is a business-logic flaw with no malicious signature in the
request — no signature WAF (F5 included) blocks it by payload inspection. The
mitigation is app-side authz or a positive-security/allow-list model, not a
signature. Showing this gap is the point: a WAF is necessary, not sufficient.

See `results.sample.json` for the full machine-readable matrix (per-attack rule
attribution), and the published dashboard for the visual before/after.

## Components

| Path | What |
|------|------|
| `app/app.py` | Acme Pay — the vulnerable payments API (Python stdlib, no deps). Each handler genuinely *processes* the payload — safely simulated in-process (no real shell/egress/secrets) — so "before" shows real impact. |
| `k3s1-payments-api.yaml` | Namespace + Deployment (pinned to **cloud001**, the lon1 edge node) + NodePort 30084. App source is carried in a ConfigMap on a stock `python:3.12-alpine` image — no image build/registry push. |
| `gen_waf_rules.py` | Generates the 16 modern/API `waf_rules` + the hardened `waf-policy-payments-hard` policy. Patterns are authored as Python strings so JSON escaping is correct. |
| `data/waf_rules/prod/*.json` | The new rule set (SSTI, Log4Shell ×2, Spring4Shell, SSRF ×2, NoSQLi, XXE, JWT-none, prototype pollution, GraphQL, open-redirect, scanner-UA, encoded-traversal, cmdi, mass-assignment). |
| `data/waf_policies/prod/waf-policy-payments-hard.json` | Block-mode policy referencing the 20 base OWASP rules + these 16 = 36 rules, anomaly threshold 6, branded 403 block page. |
| `data/rules/prod/payments-demo-default.json` | wslproxy routing rule (305 proxy → `127.0.0.1:30084`). |
| `data/servers/prod/host:payments-{open,secure}.fictionally.org.json` | The two vhosts — identical except `waf_enabled` / `waf_policy_id` / `waf_mode_override`. |
| `attack_suite.py` | Fires the 19 attacks at both hosts and prints the before/after matrix (`--json` for machine output). |

## How it was deployed

1. **Origin** → `kubectl apply -f k3s1-payments-api.yaml` then load the app source:
   `kubectl -n wslproxy-waf-demo create configmap payments-api-src --from-file=app.py=app/app.py -o yaml --dry-run=client | kubectl apply -f -`.
   Pods are pinned to **cloud001** because the edge↔LAN pod overlay isn't routable
   from the edge nodes, so the lon1 wslproxy reaches the app on `127.0.0.1:30084`.
2. **WAF rules/policy/route/servers** → pushed to the lon1 control plane via
   `POST /api/projects/import` (dataType `waf_rules`, `waf_policies`, `rules`,
   `servers`). **Gotcha:** that endpoint form-parses the JSON body
   (`ngx.req.get_post_args` → `Helper.GetPayloads`), so a body containing `&` or
   `=` (our `&&` cmdi regex, the base64 block page) is truncated → HTTP 500.
   Percent-encode the whole JSON body before POSTing; the gateway decodes it back.
3. **DNS** → Cloudflare CNAMEs `payments-{open,secure}.fictionally.org → lon1.pop0.uk`
   (unproxied, so auto-ssl solves ACME HTTP-01). Certs issue on first HTTPS hit.

## The bug this demo surfaced (and fixed)

The wslproxy WAF had **never actually blocked anything** on this edge. The engine
called `ngx.re.compile()` in `api/waf_engine.lua`, but **OpenResty has no
`ngx.re.compile`** — every regex rule threw `attempt to call field 'compile' (a
nil value)`, and the fail-open wrapper swallowed it, so all traffic passed. It went
unnoticed because no vhost had a WAF policy bound until this demo.

Fix (`api/waf_engine.lua`): drop the fake compile step and pass the pattern
straight to `ngx.re.find(value, pattern, "jois")` — the `o` flag makes OpenResty
compile-once and cache per worker. Only vhosts with `waf_enabled=true` are
affected (the engine returns early otherwise), so the blast radius is this demo.

## Reproduce the before/after

```bash
python3 examples/wslproxy-waf-demo/attack_suite.py \
  --open   https://payments-open.fictionally.org \
  --secure https://payments-secure.fictionally.org
```

## WAF v2 — enterprise enforcement (beyond signatures)

The same policy also exercises the v2 engine (`api/waf_engine.lua` +
`api/waf_stages.lua` + `api/waf_support.lua`) — the controls a signature list
can't express. Design reference: [`docs/WAF_ENGINE_V2.md`](../../docs/WAF_ENGINE_V2.md);
policy JSON Schema: [`docs/waf-policy.schema.json`](../../docs/waf-policy.schema.json).

| Capability | Policy field | Demo behaviour | Violation |
|---|---|---|---|
| Method allow-list | `methods.allow` | `PUT /api/profile` → 403 | `VIOL_METHOD` |
| Filetype deny | `filetypes.deny` | `/config.env`, `/.git/config` → 403 | `VIOL_FILETYPE` |
| JWT algorithm policy | `jwt.denyAlg`/`requireAlg` | `alg:none` & `HS256` bearer → 403 (first-class, not a regex) | `VIOL_JWT_ALG` |
| JSON body profile | `jsonProfile.maxDepth`/`maxBytes` | deep or oversized JSON → 403 | `VIOL_JSON_DEPTH` / `VIOL_JSON_SIZE` |
| Brute-force velocity | `bruteForce[]` | 6th `POST /api/login` in 60s → 403 | `VIOL_BRUTE_FORCE` |
| IP / geo lists | `ipLists`, `geo.denyCountries` | allow-list bypass; country deny | `VIOL_IP_DENY` / `VIOL_GEO` |
| Signature staging | `signatures.stage[]` | open-redirect rule alarms (302), never blocks, until its date | — |
| Set / per-ID governance | `signatureSets`, `signatures.disable` | toggle a whole set to alarm-only, or disable one ID | — |
| Binding precedence | `routeOverrides[]` | `/preview` runs transparent while the domain blocks (route > server > domain) | — |
| Correlation IDs | (always) | every block returns `X-Support-ID` + prints it on the block page | — |
| Structured security log | `logging` | one `wafsec {...}` JSON line per decision (support_id, code, stage, signature_id, policy, binding, latency_us) | — |

Every one of these is proved by a golden test:

```bash
python3 examples/wslproxy-waf-demo/waf_features.py \
  --host https://payments-secure.fictionally.org
# → 12/12 golden tests passed
```

### The engine bug this depended on

v2 only works because the signature matcher works — and it didn't. See the
callout above: the engine called the non-existent `ngx.re.compile()`, so every
regex rule failed open. Fixed to `ngx.re.find(v, pattern, "jois")`.
