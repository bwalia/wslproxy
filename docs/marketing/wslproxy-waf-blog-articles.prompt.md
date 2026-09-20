# Task: write a WSLProxy WAF blog post + long technical article (10‑min tour, AI efficacy testing, roadmap)

You are writing **two pieces of content** about **Workstation WSL Proxy (WSLProxy) WAF & security**, then filing them as **drafts** in the Workstation CMS (same pattern as `scripts/wsl-proxy-publish/` and Ring Promoter publish prompts).

Done means: two drafts exist, each embeds the WAF video (when the YouTube URL is available), claims are accurate against the sources below, and you send a short report (see “Report back”).

---

## Video (fill in before publish)

| Field | Value |
|-------|--------|
| **Working title** | WSLProxy WAF in 10 Minutes: Block Attacks Before They Reach Your Origin |
| **YouTube URL** | `{{YOUTUBE_URL}}` ← replace before embedding |
| **Embed URL** | `https://www.youtube.com/embed/{{VIDEO_ID}}` |
| **Thumbnail (repo)** | `bwalia/wslproxy` → `docs/marketing/wslproxy-youtube-thumbnail-waf-10min.png` |
| **Description paste** | `docs/marketing/youtube-description-waf-10min.txt` |
| **Duration** | **10 minutes** (never say 5 minutes) |

If `{{YOUTUBE_URL}}` is still a placeholder: write the pieces with a clear “Watch the 10‑minute WAF tour” section and a TODO comment; do **not** invent a video ID.

Also link the product WAF page: https://wslproxy.org/waf/

---

## 1. Get the facts first. Don’t invent anything.

Sources of truth, in this order:

1. `bwalia/wslproxy` → `docs/WAF_ENGINE_V2.md`
2. `bwalia/wslproxy` → `html/waf/index.html` (public feature page)
3. `bwalia/wslproxy` → `examples/wslproxy-waf-demo/` (demo + `waf_features.py` golden tests)
4. `bwalia/wslproxy` → `tools/waf_validate.py` + `.github/workflows/waf-validate.yml`
5. `bwalia/wslproxy` → `api/mcp/` (MCP tools for policies / bind)
6. https://wslproxy.org and https://wslproxy.org/waf/
7. Existing Workstation publish pattern: `scripts/wsl-proxy-publish/{blog,article}-body.html`

Hard rules:

- **British English** (behaviour, organisation, defence).
- No invented metrics, CVE “catch rates”, customer names, testimonials, uptime %, or pricing.
- No fake video timestamps unless the user supplies a chapter list from the cut.
- Code / config / API examples must come from the repo (policy schema, violation codes, demo paths) — do not invent endpoints or fields.
- Spell **efficacy** correctly (not “efficasy”). Prefer “WAF efficacy testing” or “proving WAF efficacy”.
- Brand as **Workstation WSL Proxy** on workstation.co.uk; **WSLProxy** / wslproxy.org is fine for product deep links.
- Avoid hype (“revolutionary”, “unbreakable”, “AI that stops all attacks”). Be precise: signatures + stages + governance; fail-open by default.
- Distinguish **what ships today (MVP)** vs **Phase 2 / Phase 3 roadmap** — never present roadmap as live.

### Fact sheet (verified)

**What it is:** WSLProxy is a live-config API gateway / reverse proxy on OpenResty. WAF runs on the request path after rule match / rate limit (`gateway_pipeline` → `waf_engine.inspect`). Policies bind per domain (and route overrides). Enforcement is **blocking** or **transparent (monitor/alarm)**. Engine fails open on internal errors so a WAF bug must not take the site down.

**Stages (first-class):** method allow-list · filetype deny · HTTP smuggling/desync · IP lists + geo deny · JWT alg policy · JSON depth/size · brute-force velocity · OpenAPI positive security (path+method). Then **governed signatures** + anomaly score threshold.

**Signatures:** Stable IDs under `data/waf_rules/` (SQLi, XSS, CMDi, LFI, SSRF, SSTI, XXE, Log4Shell, Spring4Shell, JWT none, GraphQL introspection, smuggling, scanner UA, …). Sets / per-ID disable / time-boxed **stage** (alarm-only until date).

**Explainability:** `X-WAF-Block`, `X-WAF-Rule`, `X-WAF-Violation`, `X-Support-ID`; structured `wafsec` logs; Prometheus counters; events API; Admin UI for policies/rules.

**Edge layers beyond WAF engine:** per-server rate limit · CAPTCHA rule status **306** · rule matcher JWT / S3 / cookie · geo/IP rule match.

**Ops surfaces:** React Admin / Next.js · Swagger REST · MCP (agents can bind policies / inspect) · `wslproxy-cli` pull/push for `waf_rules` / `waf_policies` · CI `waf-validate`.

**Efficacy testing today (use this language carefully):**

- Golden / feature tests in `examples/wslproxy-waf-demo/` (`waf_features.py` — per-binding monitor vs block proofs).
- Live demo origins and attack fixtures in the same example pack.
- CI validation of Lua + JSON Schema policies + signature referential integrity.
- **AI agents (MCP / Cursor / Claude):** use MCP + REST to pull policies, propose changes, re-run demo checks, and read WAF events — frame as **operator-assisted efficacy loops**, not autonomous “AI WAF that learns attacks”.
- Do **not** claim an official “AI red-team product” unless the user adds a named tool; describe the **pattern**: agent drives fixtures → edge → assert block/alarm/support ID → adjust policy in monitor → promote to block.

**Roadmap (from WAF_ENGINE_V2.md — label clearly as future):**

- **Phase 2:** service→policy map · full OpenAPI param/type validation · XML profile · GraphQL profile · cookie integrity · JWT JWKS verify · response Data Guard · CWE/OWASP refs in events · fail-closed body parse option · bot classes beyond UA · `aegisctl`-style CLI (compile/validate/test/bench).
- **Phase 3:** behavioural L7 DoS · IP reputation feeds · gRPC/protobuf malformed · Ingress CRDs (`WAFPolicy`/`WAFBinding`) · Hyperscan/Vectorscan matching.
- **Non-goals (v1):** full RASP · proprietary signature DB clones · in-path ML training.

**Related product future (Workstation narrative, keep soft):** MCP Gateway / Agents Gateway as governed front doors for agent traffic — already hinted on the WSL Proxy product page; do not over-promise ship dates.

---

## 2. Write the two pieces

### Piece A — Blog post (benefits-led, skim-readable)

- **Audience:** CISOs adjacent platform leads, DevOps/SRE, security engineers evaluating edge WAF vs “nginx + regex”.
- **Length:** 1,100–1,500 words.
- **Slug (suggested):** `wslproxy-waf-10-minute-tour-efficacy-ai-agents`
- **CMS path (Workstation):** `/en/docs/blogs/<slug>`
- **Angle:** “You can’t trust a WAF you can’t explain — or prove.” Tie the **10‑minute tour** to day‑2 ops: monitor → stage signatures → block, and using **AI agents** to run repeatable efficacy checks against the demo / your staging POP.

**Structure:**

1. Hook — origin WAF vs edge WAF; reload-heavy configs vs live policies.
2. **Video embed** (10‑min tour) + one sentence on what it shows (policies, stages, monitor/block — not a full CVE catalogue).
3. What ships today (short capability bullets; link https://wslproxy.org/waf/).
4. Efficacy testing with AI agents — the loop (fixtures → assert → support ID → policy tweak). Honest limits.
5. What’s coming (Phase 2/3 in plain language; “fully protect” = layered controls + roadmap, not magic).
6. CTA: wslproxy.org/waf · GitHub · long article · product `/en/wsl-proxy`.

Cross-link the long article at top and bottom (same pattern as existing `wsl-proxy-publish/blog-body.html`).

### Piece B — Long technical article (deep dive)

- **Audience:** security engineers, platform architects, SREs implementing WAF on OpenResty edges.
- **Length:** 2,800–4,000 words.
- **Slug (suggested):** `workstation-wsl-proxy-waf-efficacy-ai-agents-roadmap`
- **CMS path (Workstation):** `/en/articles/<slug>`
- **Angle:** Architecture of WAF Engine v2 + how to **prove** it with demos/CI/agents + honest roadmap toward fuller protection of online systems.

**Structure:**

1. Lead + link to blog companion.
2. Video embed + pointer to https://wslproxy.org/waf/.
3. Request-path architecture (pipeline diagram in prose or mermaid; stages → signatures → block headers).
4. Policy schema highlights (enforcementMode, routeOverrides, signatureSets, anomaly_threshold) — cite `docs/waf-policy.schema.json` / Engine v2 doc.
5. Binding precedence (route > server override > policy default).
6. Efficacy testing playbook:
   - Demo pack layout (`examples/wslproxy-waf-demo/`)
   - Golden tests / what “pass” means (monitor vs block bindings)
   - CI `waf-validate`
   - **AI agent workflow** (MCP tools + REST): pull policy, run attack fixtures, read events, propose staged signature changes, never flip prod to block without monitor soak — step list, not fantasy autonomy
7. Layered edge security (rate limit, 306 CAPTCHA, rule auth/geo) as defence in depth.
8. Roadmap Phase 2 / Phase 3 — table or sections; how each closes a protection gap.
9. Limitations & non-goals (fail-open, no RASP, no ML-in-path yet).
10. Where to start + links (engine doc, Swagger, CLI, MCP).

Optional: one simple mermaid sequence: Client → WSLProxy (rate limit → WAF stages → signatures) → Origin / 403+Support-ID.

---

## 3. Deliverables in the website project

Follow the existing Workstation publish convention (mirror `scripts/wsl-proxy-publish/`):

1. Create `scripts/wslproxy-waf-publish/` (or similar) with:
   - `blog-body.html` — Piece A HTML body (CMS-ready)
   - `article-body.html` — Piece B HTML body
   - `build_json.py` — if that is how sibling packs register drafts (copy pattern from `wsl-proxy-publish/build_json.py`)
2. Embed video with responsive iframe + poster link pattern used in `wsl-proxy-publish/blog-body.html`.
3. Use cover/thumbnail: prefer the 10‑min marketing PNG once copied into the website `img/` (or YouTube maxres once URL exists).
4. File **drafts** in the CMS (do not publish live unless asked).
5. Also (optional, if `bwalia/wslproxy` is in the workspace): add a matching static post under `html/blog/` on wslproxy.org and a card on `html/index.html` / `html/waf/` linking to it — only if asked or if the task explicitly includes product-site sync.

Suggested titles:

| Piece | Title |
|-------|--------|
| Blog | WSLProxy WAF in 10 Minutes: Prove Edge Protection with Agents |
| Article | Workstation WSL Proxy WAF — Efficacy Testing with AI Agents and the Roadmap to Stronger Edge Protection |

---

## 4. Report back

Short report with:

1. Draft URLs / CMS IDs (or file paths if CMS unreachable).
2. Final titles + slugs.
3. Confirmation video ID used (or “placeholder — awaiting URL”).
4. Any facts you wanted but could not verify.
5. Diff summary of files created under the website repo.

---

## 5. Out of scope

- Changing WAF engine code or shipping new signatures.
- Claiming Phase 2/3 features as released.
- Inventing AI “auto-hardening” that writes blocking policies to production without human approval.
- Rewriting the 20‑minute product intro article unless needed for cross-links.
