# WAF session — HTTP request smuggling rule + WAF rule-library landing page

Session date: 2026-08-15 · branch `main` (work uncommitted at time of writing).

This is a session log for two related pieces of WAF work:

1. A new **HTTP Request Smuggling** detection (CWE-444), added to the engine and
   surfaced in the `payments*.fictionally.org` before/after demo.
2. A new **WAF rule-library landing page** (`waf-rules.html`) — a searchable
   catalogue of all 50 shipped WAF rules, each expandable to a detailed card,
   opening on an HTTP request-smuggling explainer.

Published landing page (private Artifact):
**https://claude.ai/code/artifact/6d606fba-bc35-4509-af17-afdd27c247f8**

---

## 1. HTTP Request Smuggling — how the detection works

Request smuggling makes a front-end proxy and a back-end server disagree on
**where one HTTP request ends and the next begins**. The attacker crafts
ambiguous framing so a hidden ("smuggled") request is prepended to the next
victim's request — bypassing front-end controls (WAF/auth), poisoning caches, or
hijacking sessions. The three classic shapes:

- **CL.TE (header injection)** — both `Content-Length` and `Transfer-Encoding`
  present; the two hops honour different headers.
- **TE.CL (chunked encoding)** — a chunk terminator (`0⏎⏎`) is placed so a
  trailing `GET /admin HTTP/1.1` is left queued.
- **TE.TE (mixed / obfuscated)** — duplicate or obfuscated `Transfer-Encoding`
  (`xchunked`, a leading tab, `chunked, identity`) so one hop chunks and the
  other does not.

WSLProxy detects this at **two layers**, mirroring the JWT-alg precedent
(first-class stage) plus the signature model:

### a) First-class stage `smuggling` → `VIOL_SMUGGLING`
`api/waf_stages.lua` — `_M.smuggling_check(policy, ctx)`, added to
`_M.PIPELINE` after `filetype`. A header-**relationship** check a single-target
signature can't express. Rejects:
- `Content-Length` **and** `Transfer-Encoding` together (CL.TE/TE.CL primitive),
- duplicate `Transfer-Encoding` or `Content-Length` (arrive as array values),
- obfuscated TE (anything not a clean `chunked` — `xchunked`, trailing comma…),
- malformed / multi-valued `Content-Length` (not `^%s*%d+%s*$`),
- optionally a clean `Transfer-Encoding: chunked` when `allowChunked:false`.

Gated on a `policy.smuggling` block, so **existing policies are unaffected**:
```json
"smuggling": { "enforce": true, "allowChunked": true }
```
Each stage is `pcall`'d and fails open; the engine (not the stage) decides
block vs alarm from the effective enforcement mode.

### b) Signature `waf-rule-smuggling-001` (category `smuggling`, target `all`)
Catches the **visible artefact** a normal HTTP client can actually put on the
wire: a second HTTP request line pipelined inside the body, or an obfuscated
`Transfer-Encoding` token. Pattern (PCRE, flags `jois`):
```
(?i)(?:(?:\r\n|\n|\r|^)[\t ]*(?:GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT|TRACE)[\t ]+\S+[\t ]+HTTP/\d(?:\.\d)?|transfer-encoding[\t ]*:[\t ]*(?:x?chunked\b|[^\r\n:,]*[\t ]chunked\b|chunked[^\r\n]*,))
```
Severity `critical`, score 9, block mode. Set id `SET_SMUGGLING` (default-on).

### Honest scope (documented in the demo README, like the BOLA caveat)
A modern OpenResty/nginx front-end already rejects the crudest CL+TE frame with
a `400` before Lua runs, and a true byte-level desync is framed at the TCP layer
(not sendable from a normal HTTP client). So the WAF here is **defence-in-depth**
— most load-bearing at the **inner** edge of the two-proxy k3s topology
(`CLAUDE.md` §10), where an upstream proxy can forward a `Transfer-Encoding` that
only the inner layer sees. What the demo actually fires and asserts is the
body-embedded smuggled request (the signature), which is deterministic.

---

## 2. Demo wiring (payments*.fictionally.org)

- **Vulnerable origin** `app/app.py`: new `POST /api/batch` handler that treats a
  trailing pipelined request line as a second, unauthenticated request →
  `{"smuggled": true, ...}` leaking the treasury account (`/api/accounts/9999`).
  Added to the landing page and the openapi allow-list.
- **`gen_waf_rules.py`**: added the smuggling signature to `NEW_RULES`, the
  `smuggling` stage block to the policy, and `/api/batch` (POST) to
  `openapi.paths`. Regenerated → **17 demo rules, policy references 37 rules**.
- **`attack_suite.py`**: new "HTTP request smuggling" attack row (20 attacks; 19
  exploited-open / 19 blocked-secure).
- **`test_waf_live.py`**: new CI `Case("http-request-smuggling", …)` asserting
  `waf-rule-smuggling-001` blocks on secure, open does not.
- **`waf_features.py`**: new golden case (block + `VIOL_ATTACK_SIGNATURE`) →
  now **16/16** golden tests.
- **`results.sample.json`**: smuggling row added; summary 20/19/19.
- **`dashboard.html`**: counts bumped (20 attacks, 19/20, 37 rules, 16/16
  golden), smuggling row + capability + coverage chip, `CWE-` label branch, and a
  link to the new rule-library page.

---

## 3. WAF rule-library landing page (`waf-rules.html`)

A documentation "sub landing page" cataloguing **all 50 rules**:
**37 attack signatures + 13 enforcement stages / governance controls** (the 13:
method, filetype, smuggling-stage, ip-deny, geo, jwt-alg, json-size, json-depth,
brute-force, openapi-path, openapi-method, anomaly-score, signature-governance).

- Left: search box + category chips + a scrollable rule list (severity dot,
  name, id, kind badge). Right: a detail pane. Default view = a featured HTTP
  request-smuggling explainer. Click any rule → what it is, how the attack works,
  an example payload, the detection pattern/stage, mitigation, references;
  deep-linkable via `#rule-id`. Self-contained (no external deps), dark theme.
- **Generator**: `gen_waf_landing.py` reads the shipped rule JSON
  (`data/waf_rules/**` + the demo set) so the catalogue can't drift from the
  engine; per-rule narrative lives in the generator's `AUGMENT`/`CONTROLS`.
  Regenerate: `python3 examples/wslproxy-waf-demo/gen_waf_landing.py`.
- **Fix applied**: XSS example strings contain a literal `</script>` that would
  close the inline `<script>` in the browser's HTML parser. The generator
  serialises the embedded rule JSON with the `<` `>` `&` characters replaced by
  their `\uXXXX` JSON forms — the parsed JS string value is unchanged, but the
  HTML parser never sees a tag boundary.

---

## 4. Engine / docs / validator changes (outside the demo)

- **`api/waf_stages.lua`** — `smuggling_finding` helper + `smuggling_check`
  stage + PIPELINE entry.
- **`api/api.lua`** — `validateWafRulePayload`: (a) expanded the category
  allow-list to the real modern categories (`ssti, ssrf, nosqli, rce, xxe, jwt,
  graphql, redirect, scanner, proto-pollution, mass-assignment, smuggling`), and
  (b) **fixed a latent bug** — it validated regex with the non-existent
  `ngx.re.compile` (rejecting *every* regex rule via the API); now
  `pcall(ngx.re.find, "", pattern, "jo")`.
- **`docs/waf-policy.schema.json`** — added the `smuggling` object.
- **`docs/WAF_ENGINE_V2.md`** — pipeline diagram (now 8 stages), schema example,
  `VIOL_SMUGGLING` in the violation-code table, MVP roadmap + 16/16 golden count.

---

## 5. Validation (all green)

| Check | Result |
|---|---|
| `gen_waf_rules.py` regex self-check | ✓ 17 rules, policy → 37 |
| `tools/waf_validate.py` (jsonschema) | ✓ 37 rules, 2 policies, schema-valid, 0 errors |
| `py_compile` all demo scripts | ✓ |
| luajit `-bl` `waf_stages.lua`, `api.lua` (on pop1) | ✓ OK / OK |
| smuggling stage logic (luajit, 12 cases) | ✓ 12/12 |
| signature regex under **real `ngx.re`** `jois` (resty, pop1) | ✓ 6/6 (matches smuggling variants, ignores benign) |
| `waf-rules.html` — `node --check` JS + single `</script>` | ✓ 50 entries, browser-safe |

pop1 = `admin@18.133.126.242` (has `/usr/local/openresty/{luajit/bin/luajit,bin/resty}`);
temp test files were cleaned up after.

---

## 6. Files changed

Modified:
```
api/api.lua
api/waf_stages.lua
docs/WAF_ENGINE_V2.md
docs/waf-policy.schema.json
examples/wslproxy-waf-demo/README.md
examples/wslproxy-waf-demo/app/app.py
examples/wslproxy-waf-demo/attack_suite.py
examples/wslproxy-waf-demo/dashboard.html
examples/wslproxy-waf-demo/data/waf_policies/prod/waf-policy-payments-hard.json
examples/wslproxy-waf-demo/gen_waf_rules.py
examples/wslproxy-waf-demo/results.sample.json
examples/wslproxy-waf-demo/test_waf_live.py
examples/wslproxy-waf-demo/waf_features.py
```
New:
```
examples/wslproxy-waf-demo/data/waf_rules/prod/waf-rule-smuggling-001.json
examples/wslproxy-waf-demo/gen_waf_landing.py
examples/wslproxy-waf-demo/waf-rules.html
```

Not committed by this session (left for review). The live pop1/lon1 edges were
**not** modified — the payments-hard policy change reaches them only when the
demo is re-imported via `/api/projects/import` (see the demo README §"How it was
deployed"). CI (`.github/workflows/waf-validate.yml`) runs the offline schema
check on every WAF-touched PR and the live attack matrix on merge to `main`.

---

## 7. How to re-run / deploy

```bash
# regenerate rules + policy (regex self-check)
python3 examples/wslproxy-waf-demo/gen_waf_rules.py

# regenerate the landing page from the shipped rule JSON
python3 examples/wslproxy-waf-demo/gen_waf_landing.py

# offline CI gate (schema + referential integrity + regex compilability)
python3 tools/waf_validate.py

# live before/after (needs the demo hosts up)
python3 examples/wslproxy-waf-demo/attack_suite.py \
  --open https://payments-open.fictionally.org \
  --secure https://payments-secure.fictionally.org
python3 examples/wslproxy-waf-demo/test_waf_live.py -v
python3 examples/wslproxy-waf-demo/waf_features.py \
  --host https://payments-secure.fictionally.org   # → 16/16
```
