# Task: turn WAF Engine v2 into a Workstation blog + long article (CMS drafts)

You are converting the design reference **“WSLProxy WAF — Engine v2 (enterprise enforcement)”** into two published-ready CMS pieces on the **Workstation Website**:

1. A **short blog** (benefits / skim)
2. A **long technical article** (architecture deep dive)

**Do not** build a documentation website in this task. A dedicated WSLProxy docs site comes later; for now the engine markdown stays in `bwalia/wslproxy` (`docs/WAF_ENGINE_V2.md`) and these CMS pages are the public Workstation narrative. Link to https://wslproxy.org/waf/ and https://wslproxy.org as product surfaces.

Done means: two **draft** posts exist (or `scripts/.../blog-body.html` + `article-body.html` + `build_json.py` ready to upsert), claims match the engine doc, and you send a short report (see “Report back”).

---

## 1. Sources of truth (read before writing)

Order of precedence:

1. `bwalia/wslproxy` → **`docs/WAF_ENGINE_V2.md`** (canonical — reproduce architecture, schema, binding, governance, observability, violation codes, roadmap, non-goals accurately)
2. `bwalia/wslproxy` → `docs/waf-policy.schema.json` (if citing fields)
3. https://wslproxy.org/waf/ and https://wslproxy.org
4. Existing Workstation pattern: `scripts/wsl-proxy-publish/` and `wslproxy-waf-blog-articles.prompt.md`
5. Product JSON if present: `src/app/data/en/wsl-proxy.json`

Hard rules:

- British English (behaviour, organisation, defence).
- No invented metrics, catch rates, customer names, testimonials, pricing, or ship dates for Phase 2/3.
- **MVP = done today.** Phase 2 / Phase 3 = future. Never blur them.
- Fail-open is the default; fail-closed body parse is roadmap P2 — say so if you mention it.
- Code samples: copy or minimally adapt from `WAF_ENGINE_V2.md` only (policy JSONC, signature JSONC, binding pseudocode, violation table). Do not invent Lua APIs or headers.
- Brand: **Workstation WSL Proxy** on workstation.co.uk; **WSLProxy** / wslproxy.org for product links.
- Inspired by F5 WAF for NGINX (App Protect) is OK as positioning; do not claim F5 parity or F5 trademark misuse.
- Optional video: if a WAF tour URL is known (e.g. `https://youtu.be/r10XSonA5JE`), embed it; otherwise omit video rather than inventing an ID.
- No Mermaid in CMS HTML if the site does not render it; use HTML tables / ordered lists / ASCII only when needed.

---

## 2. Fact sheet — distilled from WAF_ENGINE_V2.md

**Status:** Implemented MVP. Runs in the OpenResty request path: `api/waf_engine.lua`, `api/waf_stages.lua`, `api/waf_support.lua`.

**Goals:** Production WAF bindable per domain / service label / route; blocking or transparent mode; stable signature IDs; structured logs + correlation IDs — not a regex snippet.

**Design constraints:**

| Constraint | Meaning |
|---|---|
| In the NGINX path | LuaJIT, compiled-regex cache (`o` flag), shared dicts for velocity; no blocking I/O on the hot path |
| Fail-open by default | Engine/stage errors log and allow; must not take the site down |
| Backward compatible | v1 policies (`waf_rules` + `mode`) still work; v2 fields optional/additive |
| Explainable | Every block names policy, winning binding, stage, violation code, signature ID, support ID |

**Request path:**

```
gateway_ack (select route)
  → gateway_pipeline (rate-limit → WAF → …)
    → waf_engine.inspect (fail-open wrapper)
      → load policy (30s TTL cache)
      → resolve mode + binding
      → STAGE PIPELINE (8 stages)
      → SIGNATURE MATCHING (governed) + anomaly threshold
      → on block: 403 + X-WAF-Block + X-WAF-Rule + X-WAF-Violation + X-Support-ID + block page
```

Stages are pure `(policy, ctx) → finding|nil`. The **engine** decides block vs alarm from effective enforcement mode.

**Eight stages → violation codes:**

| Code | Stage |
|---|---|
| `VIOL_METHOD` | method allow-list |
| `VIOL_FILETYPE` | filetype deny |
| `VIOL_SMUGGLING` | HTTP smuggling / desync (CL+TE, obfuscated/duplicate TE, malformed CL) |
| `VIOL_IP_DENY` / `VIOL_GEO` | IP lists / geo |
| `VIOL_JWT_ALG` | JWT algorithm policy |
| `VIOL_JSON_SIZE` / `VIOL_JSON_DEPTH` | JSON body profile |
| `VIOL_BRUTE_FORCE` | velocity control |
| `VIOL_OPENAPI_PATH` / `VIOL_OPENAPI_METHOD` | OpenAPI positive security |
| `VIOL_ATTACK_SIGNATURE` | signature match |
| `VIOL_ANOMALY_SCORE` | cumulative score ≥ threshold |

**Policy v2 (high level):** `enforcementMode` blocking|transparent · `service` label · `anomaly_threshold` · `waf_rules[]` · `signatureSets` · `signatures.disable` / `signatures.stage` · `methods` · `filetypes` · `smuggling` · `geo` · `ipLists` · `jwt` · `jsonProfile` · `bruteForce` · `routeOverrides` · `logging` · `blocked_response` · `whitelist`. Schema file: `docs/waf-policy.schema.json`.

**Signature unit:** stable `id` (e.g. `waf-rule-ssti-001`), category → default `SET_<CATEGORY>`, target, pattern, action block|monitor, score, optional CWE/OWASP `references` (P2: rendered).

**Binding precedence (most specific wins):**

```
route override  >  server waf_mode_override  >  policy enforcementMode
```

Longest path prefix wins (`/api/admin` beats `/api`). `binding` is recorded on every finding. Service→policy **selection map** is Phase 2 (today `service` is a log label).

**Signature governance:** disable by ID · stage until timestamp (alarm only; does **not** contribute to anomaly score) · set toggle `block:false` → alarm-only for the set.

**Observability:** `WSL-<epoch>-<rand>` as `X-Support-ID` · `wafsec` JSON logs · `waf_events` shared dict / recent-events API · Prometheus `waf_blocked`, `waf_monitored`, `waf_inspections`, `waf_latency`, `waf_errors`.

**MVP done (cite as shipped):** domain+route bind · signature sets / per-ID disable-stage · method & filetype · IP+geo · JWT alg · JSON profile · brute-force · OpenAPI path+method · smuggling stage + signature · structured logs + support IDs · Prometheus · block page · golden tests `examples/wslproxy-waf-demo/waf_features.py` · CI `tools/waf_validate.py` · Admin UI WafPolicies/WafRules.

**Phase 2 (future):** service→policy map · OpenAPI param/type · XML profile · GraphQL profile · cookie integrity · JWT JWKS · Data Guard · references in events · fail-closed parse option · bot classes / JA3 · threat packs · `aegisctl`-style CLI.

**Phase 3 (future):** behavioural L7 DoS · IP reputation · MaxMind geo · gRPC/protobuf · Ingress CRDs · Hyperscan/Vectorscan.

**Non-goals (v1):** full RASP · proprietary signature DB clones · in-path ML training.

---

## 3. Write the two pieces

### Piece A — Blog (benefits-led)

- **Audience:** platform leads, DevOps/SRE, security buyers evaluating “explainable edge WAF”.
- **Length:** 1,200–1,600 words.
- **Suggested slug:** `wslproxy-waf-engine-v2-enterprise-enforcement`
- **CMS path:** `/en/docs/blogs/<slug>`
- **Working title:** *WSLProxy WAF Engine v2: Enterprise Enforcement You Can Explain*
- **Angle:** From regex snippets to governed policies — monitor/block bindings, stable signature IDs, support IDs on every block. Tease architecture; point to the long article for the full pipeline and schema.

**Structure:**

1. Hook — opaque WAFs vs explainable edge enforcement.
2. What Engine v2 is (MVP on OpenResty hot path; F5 App Protect–inspired goals, not a clone claim).
3. Optional video embed (if URL provided).
4. Four design constraints in plain language (path, fail-open, compatible, explainable).
5. Pipeline in 60 seconds (stages then signatures).
6. Why operators care: binding precedence, staging signatures, support IDs.
7. Soft nod to roadmap (one short paragraph; label future).
8. CTA: https://wslproxy.org/waf/ · long article · `/en/wsl-proxy` · GitHub engine doc (optional: link raw `WAF_ENGINE_V2.md` on GitHub until docs site exists).

Cross-link Piece B at top and bottom.

### Piece B — Long article (engine deep dive)

- **Audience:** security engineers, platform architects implementing WAF on OpenResty.
- **Length:** 3,500–5,500 words.
- **Suggested slug:** `workstation-wsl-proxy-waf-engine-v2`
- **CMS path:** `/en/articles/<slug>`
- **Working title:** *Inside Workstation WSL Proxy WAF Engine v2: Stages, Signatures, and Binding Precedence*
- **Angle:** Faithful technical walkthrough of `WAF_ENGINE_V2.md` for a Workstation audience — architecture, policy/signature schemas, binding algorithm, governance, observability, violation catalogue, MVP vs P2/P3, non-goals. Note that full docs site comes later; this article is the interim deep dive.

**Structure:**

1. Lead + companion blog link + product WAF page.
2. Goals & design constraints (table).
3. Request-path architecture (reproduce the pipeline; HTML `<pre>` or structured list).
4. Policy schema v2 — annotated excerpts from the doc (payments-hard example).
5. Signature schema — stable IDs as the addressable unit.
6. Binding resolution — route > server > policy; longest prefix; what `binding` means in logs.
7. Signature governance table (disable / stage / set toggle) + anomaly score rule.
8. Observability (headers, `wafsec`, metrics, support ID).
9. Full violation code table.
10. MVP checklist (shipped) vs Phase 2 / Phase 3 (clearly labelled future).
11. Non-goals.
12. How to operate today: Admin UI, CI validate, demo golden tests — brief pointers only.
13. Closing: link wslproxy.org/waf/, engine markdown on GitHub, promise of future docs site **without** inventing a docs URL.

Include at least one policy JSON example and the binding precedence block from the source doc.

---

## 4. Deliverables in the website project

Follow `scripts/wsl-proxy-publish/`:

1. Create e.g. `scripts/wslproxy-waf-engine-v2-publish/` with:
   - `blog-body.html`
   - `article-body.html`
   - `build_json.py` (copy pattern from `wsl-proxy-publish/build_json.py`; new slugs/uuids/titles)
2. File **drafts** in the CMS (do not publish live unless asked).
3. Tags: security, devops, sre, openresty/nginx-adjacent if available, waf if available.
4. Cover: reuse `/img/wsl-proxy-cover.svg` or WAF thumbnail if already in website `img/`.
5. **Do not** create a docs.wslproxy.org (or similar) site in this task.

Suggested meta:

| Piece | Title | Subtitle idea |
|-------|--------|----------------|
| Blog | WSLProxy WAF Engine v2: Enterprise Enforcement You Can Explain | Stable signature IDs, monitor/block bindings, and support IDs on every decision |
| Article | Inside Workstation WSL Proxy WAF Engine v2 | Stages, signatures, binding precedence, and the roadmap beyond MVP |

---

## 5. Report back

1. Draft URLs / CMS IDs or file paths created.
2. Final titles + slugs.
3. Confirmation that Phase 2/3 are labelled future.
4. Any engine-doc facts you could not verify against the repo.
5. Explicit note: “Docs website deferred — article points at GitHub `docs/WAF_ENGINE_V2.md` and wslproxy.org/waf/.”

---

## 6. Out of scope

- Building or scaffolding a documentation website / Docusaurus / MkDocs.
- Changing Lua engine code or shipping new signatures.
- Claiming F5 feature parity.
- Merging this with the separate “10‑minute tour / AI efficacy” prompt unless the user asks to combine — this prompt is **engine-doc → CMS**, that other prompt is **tour video + efficacy narrative**.
