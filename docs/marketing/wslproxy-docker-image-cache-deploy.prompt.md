# Task: Workstation blog + long technote — Docker image optimisations, Buildx/GHA cache, and the full WSLProxy deploy workflow

You are writing **two pieces of content** for **workstation-website** (Workstation CMS), using **WSLProxy (`bwalia/wslproxy`)** as the worked example for:

1. **Dockerfile / image optimisations and caching tricks**
2. **How those images feed a real full-deploy workflow** (shown as the **RHS** of the story — build/cache on the left, promote-and-deploy pipeline on the right)
3. **How AI-assisted engineering made this work ship** — the honest meta-story: this class of infra (prebuilt images, Buildx/GHA caches, deploy-mode defaults) is high leverage but usually **never gets done** under normal ticket pressure; pairing with an AI coding agent compressed research → implement → fix CI → merge into hours instead of a multi-sprint “nice-to-have”

Done means: two CMS-ready drafts exist under `workstation-website` (publish pack + draft registration), claims match the GitHub sources below, and you send a short report (see “Report back”).

**Workspace roots (open both if possible):**

| Repo | Path / remote |
|------|----------------|
| Product + facts | `bwalia/wslproxy` → https://github.com/bwalia/wslproxy |
| Publish destination | `workstation-website` (Workstation CMS scripts under `scripts/`) |

Mirror the existing pattern: `scripts/wsl-proxy-publish/` (blog-body.html, article-body.html, build_json.py).

---

## 1. Get the facts first. Don’t invent anything.

### Sources of truth (GitHub — prefer `origin/main` / live files)

**A. Prebuilt OpenResty image (compile once, pull many)**

| Item | Path / URL |
|------|------------|
| Prebuilt Dockerfile (multi-stage) | https://github.com/bwalia/wslproxy/blob/main/infra/openresty-prebuilt/Dockerfile |
| Buildx + Hub push + GHA cache workflow | https://github.com/bwalia/wslproxy/blob/main/.github/workflows/build-openresty-prebuilt.yml |
| Ansible extract/rsync installer | https://github.com/bwalia/wslproxy/blob/main/infra/ansible/roles/wslproxy/tasks/openresty_prebuilt.yml |
| Role defaults (`openresty_install_mode: prebuilt`) | https://github.com/bwalia/wslproxy/blob/main/infra/ansible/roles/wslproxy/defaults/main.yml |
| Express install helper | https://github.com/bwalia/wslproxy/blob/main/infra/openresty-prebuilt/openresty-express-install.sh |
| Legacy on-host compile (contrast) | https://github.com/bwalia/wslproxy/blob/main/infra/ansible/roles/wslproxy/templates/openresty.sh.j2 |
| Published image | `docker.io/bwalia/wslproxy-openresty` (tags: version e.g. `1.29.2.1`, `latest`) |

**B. App / fat Docker image (layer-order tricks)**

| Item | Path / URL |
|------|------------|
| Root multi-purpose Dockerfile | https://github.com/bwalia/wslproxy/blob/main/Dockerfile |
| Note: `mc` installed **before** frequent `COPY` so Hub/layer cache survives code churn | same file (~lines installing MinIO client) |
| MinIO client URL (AIStor path; classic `/client/mc` → **410**) | `https://dl.min.io/aistor/mc/release/linux-${ARCH}/mc` |

**C. CI caches that sit beside image cache**

| Item | Path / URL |
|------|------------|
| Deploy reusable workflow (npm + Next.js `.next/cache`) | https://github.com/bwalia/wslproxy/blob/main/.github/workflows/deploy-environment.yml |
| Delivery / promotion pipeline (`DEPLOY_MODE`, int→test→prod) | https://github.com/bwalia/wslproxy/blob/main/.github/workflows/deploy-wslproxy-delivery-pipeline.yml |
| CLI multi-arch Buildx + `cache-from/to: type=gha` | https://github.com/bwalia/wslproxy/blob/main/.github/workflows/build-wslproxy-cli.yml |
| Control-plane image build (same GHA cache pattern) | https://github.com/bwalia/wslproxy/blob/main/.github/workflows/deploy-control-plane-k3s1.yml |

**D. Product / ops context (keep short; link out)**

| Item | Path / URL |
|------|------------|
| Developer guide (architecture, ports, Ansible vs Docker vs k3s) | https://github.com/bwalia/wslproxy/blob/main/CLAUDE.md |
| Product site | https://wslproxy.org |
| Ansible role entry | https://github.com/bwalia/wslproxy/blob/main/infra/ansible/roles/wslproxy/tasks/main.yml |

**E. Publish convention on workstation-website**

| Item | Path |
|------|------|
| Existing WSL Proxy pack | `scripts/wsl-proxy-publish/{blog-body.html,article-body.html,build_json.py}` |
| Shared upsert helper | `scripts/lib/articles_locales.py` (via `build_json.py`) |

Hard rules:

- **British English** (optimisations, behaviour, organisation).
- No invented wall-clock savings (% or minutes) unless measured numbers are pasted into this prompt’s “Measured timings” section below. If empty: describe **what** got faster (compile-once vs on-host; cache hits) and say timings are environment-dependent.
- No fake customer names, uptime %, or pricing.
- Code / paths / workflow names must match GitHub — do not invent files.
- Brand as **Workstation WSL Proxy** on workstation.co.uk; **WSLProxy** / wslproxy.org / GitHub for product deep links.
- Avoid hype (“10× forever”, “never rebuild”, “AI wrote everything unsupervised”). Be precise: **compile once in CI**, **reuse Buildx/GHA layers**, **prefer `DEPLOY_MODE=code` for routine deploys**, **`full`/`build` when OpenResty or OS deps change**.
- Distinguish **Docker app image** (dev/compose / Hub app container) vs **prebuilt OpenResty tree image** (bare-metal Ansible extract) — they solve different problems.
- On AI: frame as **operator + agent loop** (human owns intent, merge, and prod risk; agent accelerates search, scaffolding, CI log triage, iterative fixes). Do **not** claim autonomous production deploys or that AI “invented” OpenResty.

### Measured timings (optional — fill before claiming numbers)

| Scenario | Before | After | Source |
|----------|--------|-------|--------|
| On-host OpenResty compile (`openresty.sh.j2` / `DEPLOY_MODE=full`+build) | _e.g. ~8–30 min — only if verified_ | — | GHA run / SSH log |
| Prebuilt pull + extract + rsync | — | _fill_ | |
| Cold `build-openresty-prebuilt` | — | _fill_ | e.g. run URL |
| Warm Buildx GHA cache rebuild | — | _fill_ | e.g. https://github.com/bwalia/wslproxy/actions/runs/35500698371 (~3m with cache after ldconfig/mc fixes) |
| Next.js admin rebuild with npm + `.next/cache` | — | _fill_ | |

If this table is empty except the warm-build example: use qualitative language + that one citeable run only.

### Fact sheet (verified — use this language)

**Problem:** Bare-metal WSLProxy POPs historically ran **OpenResty compile on every host** via Ansible (`openresty.sh.j2`). A `DEPLOY_MODE=full` (or `build`) path could spend a large fraction of the job on `./configure` + `make`, luarocks, opm — and fail for brittle host reasons (PATH, GCC, missing `ldconfig`, stale download URLs).

**Prebuilt image pattern:**

1. CI builds `infra/openresty-prebuilt/Dockerfile` with **Buildx**, pushes `bwalia/wslproxy-openresty:<version>` + `:latest`.
2. **GHA cache** (`cache-from` / `cache-to: type=gha,mode=max`) keeps compile layers warm across pushes that only tweak late stages (e.g. `mc` URL).
3. Ansible `openresty_install_mode: prebuilt` (default): controller `docker pull` → `docker create` → `docker cp` `/usr/local/openresty` → **rsync to target**, excluding `nginx/conf`, `nginx/html`, `nginx/logs` so live config/site data survive.
4. Target still needs matching **runtime libs** + **glibc/arch match** to the build base (`BASE_IMAGE=debian:13` default — call out libc coupling explicitly).

**Dockerfile tricks worth teaching (with WSLProxy examples):**

| Trick | Where in repo | Teaching point |
|-------|---------------|----------------|
| Multi-stage builder → slim runtime | `infra/openresty-prebuilt/Dockerfile` | Ship the tree, not the compiler toolchain |
| Stable layers first (apt, compile, rocks) before volatile bits | same | Late `RUN` for `mc` / app files invalidates less |
| Explicit `PATH` including `/usr/sbin:/sbin` + `libc-bin` | same | Debian slim omits `ldconfig`; OpenResty LuaJIT configure aborts without it |
| Pin versions (`OPENRESTY_VERSION`, `lua-resty-jwt 0.2.3`) | Dockerfile + role | Reproducible edges; avoid “latest rock broke prod” |
| System Lua 5.1 for luarocks, LuaJIT for runtime tree | Dockerfile comments | LuaJIT constant limit vs luarocks manifest |
| Optional rocks `|| warn` vs hard-fail required rock | Dockerfile | Fail closed on JWT; fail open on optional auto-ssl bits |
| `--no-install-recommends` + `rm -rf /var/lib/apt/lists/*` | Dockerfile | Smaller layers |
| Install heavy binaries **before** `COPY` of changing app trees | root `Dockerfile` (`mc` before `COPY ./api`) | Classic Docker cache hygiene |
| Current upstream URLs (AIStor `mc`, not 410 `/client/mc`) | root + prebuilt Dockerfiles | Broken CDN paths look like “flaky CI” |
| Build args for base OS / version | workflow `workflow_dispatch` inputs | One Dockerfile, many target glibcs |
| `platforms: linux/amd64` (today) | build-openresty-prebuilt.yml | Be honest: not multi-arch yet unless extended |
| `provenance: false` / `sbom: false` where chosen | same | Note trade-off; don’t moralise — explain why teams sometimes disable |
| Extract-not-run: image as **distribution format** | openresty_prebuilt.yml | Docker as packaging for bare metal, not only as runtime |

**RHS — full deploy workflow (use a diagram; put deploy on the right):**

Left (build & cache):

```
GitHub push (infra/openresty-prebuilt/**)
  → build-openresty-prebuilt.yml
  → Buildx + GHA layer cache
  → Docker Hub: bwalia/wslproxy-openresty
```

Right (promote & deploy — “full deploy” path):

```
deploy-wslproxy-delivery-pipeline.yml
  → int → smoke → test → prod (lon1 / pop0 as configured)
  → deploy-environment.yml
       ├─ secrets (SOPS / vault_or_sops as configured)
       ├─ npm cache + Next.js .next/cache (when dashboard/full)
       └─ Ansible tags from DEPLOY_MODE
            code | nginx | servers | dashboard | dashboard-next
            build | full | os_deps | …
```

**DEPLOY_MODE teaching points (accurate):**

- Routine day-2: prefer **`code`** (Lua/api + data sync) — does **not** recompile OpenResty.
- **`build` / `full`**: OpenResty install path (`prebuilt` pull/extract **or** legacy source compile if mode overridden).
- **`dashboard` / `dashboard-next`**: UI rebuild; Next cache steps apply when mode includes dashboard or is `full`.
- Server JSON / rules can change without nginx reload for rules; `config_status: true` still drives conf + reboot flag for server blocks (link CLAUDE.md; don’t over-explain unless article depth needs it).

**Failure lessons (good blog colour — keep factual):**

1. Missing `ldconfig` on PATH → OpenResty configure: “you need to have ldconfig in your PATH when enabling luajit”.
2. Classic MinIO `dl.min.io/client/mc/...` → **HTTP 410**; fix to AIStor path (already in root Dockerfile comments).

### Why this usually does not get done (and how AI changed the economics)

Use this narrative in **both** pieces (short in the blog, a dedicated section in the technote). Keep it credible — no sci‑fi.

**The backlog reality (developers “normally do not get to it”):**

- Day-2 work is **features, incidents, and customer-facing bugs**. A 30‑minute `full` deploy that recompiles OpenResty is painful but **survivable**, so it stays on the “we should fix that” list for months.
- The fix is **cross-cutting**: Dockerfile multi-stage design, Hub credentials, GHA Buildx cache, Ansible extract/rsync that must not wipe `conf`/`html`/`logs`, pipeline `DEPLOY_MODE` defaults, Next.js npm/`.next` caches, and glibc/base-image coupling. That is several specialised domains in one change set — hard to staff as a single “small PR”.
- Failure modes are **opaque** (configure PATH, 410 CDN URLs, cache misses that look like “flaky CI”). Without a fast diagnose→patch→re-run loop, one bad green-hope burn can kill the initiative.
- Review cost is high: reviewers must trust that bare-metal extract will not clobber live nginx trees. Teams defer rather than risk a POP.

**What AI-assisted delivery actually helped with (WSLProxy pattern — describe, don’t mythologise):**

| Phase | Human still owns | Agent accelerates |
|-------|------------------|-------------------|
| Problem framing | “`full` deploys are dominated by OpenResty compile; prefer prebuilt + code deploys” | Map slow job → role tags → `openresty.sh.j2` vs extract path; draft an implementation plan |
| Scaffolding | Approve design (image as artefact, not only runtime) | Draft `infra/openresty-prebuilt/Dockerfile`, `build-openresty-prebuilt.yml`, `openresty_prebuilt.yml`, wire `openresty_install_mode`, Next cache steps in `deploy-environment.yml` |
| Repo archaeology | Decide what must stay identical to production compile flags | Grep/read `openresty.sh.j2`, `deploy_deps.yml`, `cdn-dependencies.sh.j2`, root `Dockerfile` for `mc` URL precedent |
| CI failure loop | Merge / secrets / Hub push policy | Read failed Actions logs (e.g. ldconfig PATH, MinIO 410), patch, push, watch re-run until green |
| Docs & narrative | Voice, claims, publish | Turn the landed tree into a blog/technote prompt and CMS pack |

**Honest limits (must include):**

- AI does not replace knowing **glibc must match the host**, or that rsync excludes protect live config.
- Humans still **merge to `main`/`release`**, hold Hub credentials, and choose `DEPLOY_MODE` on real POPs.
- The win is **time-to-first-working-pipeline** and **stamina through 2–3 CI breakages** — the exact reasons this work dies in normal sprints.

**One-line thesis for CTAs / subheads:**  
*AI did not invent prebuilt OpenResty — it made the boring, multi-file “make deploys stop compiling nginx every time” project cheap enough to finish.*

Concrete public artefacts you may cite as the outcome of that loop (links, not mythology):

- Workflow: https://github.com/bwalia/wslproxy/blob/main/.github/workflows/build-openresty-prebuilt.yml
- Image build Actions: https://github.com/bwalia/wslproxy/actions/workflows/build-openresty-prebuilt.yml
- Example warm/cached success after iterative fixes: https://github.com/bwalia/wslproxy/actions/runs/35500698371
- Commits/themes on `main`: prebuilt image + Next caches; ldconfig PATH fix; AIStor `mc` URL fix; `main` → `release` promotion

---

## 2. Write the two pieces

### Composition rule (both pieces)

Use an explicit **left / right** mental model (and at least one mermaid or two-column HTML figure):

| LHS — Images & cache | RHS — Full deploy |
|----------------------|-------------------|
| Dockerfile stages, Buildx, Hub, GHA cache, extract/rsync | Delivery pipeline, `DEPLOY_MODE`, Ansible tags, Next/npm caches, int→prod |

Readers should finish knowing: **when to rebuild the OpenResty image**, **when a code-only deploy is enough**, and **which GitHub files to copy as a pattern**.

### Piece A — Blog post (benefits-led, skim-readable)

- **Audience:** platform engineers, DevOps/SRE, tech leads tired of 30‑minute “full” deploys that mostly recompile nginx.
- **Length:** 1,100–1,500 words.
- **Slug (suggested):** `wslproxy-docker-image-cache-faster-deploys`
- **CMS path:** `/en/docs/blogs/<slug>`
- **Angle:** “Stop compiling OpenResty on every POP — treat the binary tree as a cached artefact, keep day-2 deploys on the fast path — and admit why teams rarely ship this until an AI-assisted loop makes the cross-cutting work finishable.”

**Structure:**

1. Hook — full deploy wall clock dominated by compile + cold UI builds; “we’ll optimise the pipeline later” never comes.
2. Why developers normally don’t get to it — survivable pain, cross-cutting blast radius, opaque CI failures (short; see fact sheet).
3. LHS snapshot — prebuilt image + Buildx/GHA cache in one short list (link GitHub files).
4. RHS snapshot — delivery pipeline + `DEPLOY_MODE=code` vs `full`/`build`.
5. How AI helped speed *this* process — plan → scaffold → log triage → green build (operator-in-the-loop; not autopilot).
6. Five portable tricks (table): layer order, multi-stage, base OS match, pin versions, cache Next/npm beside Docker.
7. War story (ldconfig PATH + MinIO 410) — agent-readable logs + human merge still required.
8. CTA: GitHub examples · long technote · https://wslproxy.org · product `/en/wsl-proxy`.

Cross-link the long article at top and bottom (same pattern as `wsl-proxy-publish/blog-body.html`).

Suggested title: **Faster WSLProxy Deploys: Prebuilt Images, Build Cache — and Using AI So the Pipeline Work Actually Ships**

### Piece B — Long technical article / technote

- **Audience:** SREs and platform engineers implementing Dockerised build artefacts for bare-metal or hybrid edges; teams copying patterns into their own Ansible/GHA stacks.
- **Length:** 3,000–4,500 words.
- **Slug (suggested):** `workstation-wsl-proxy-docker-image-optimisation-deploy-workflow`
- **CMS path:** `/en/articles/<slug>`
- **Angle:** Deep dive with copy-pasteable GitHub references — Dockerfile anatomy, Buildx cache semantics, extract-to-host installer, RHS full-deploy state machine — plus a practical section on **AI-assisted infra delivery**: why this work languishes, and a repeatable human+agent workflow others can copy.

**Structure:**

1. Lead + link to blog companion (include the “AI made the boring pipeline finishable” thesis early).
2. Architecture dual diagram (LHS image factory / RHS deploy) — mermaid `flowchart LR` or `TB` with subgraphs.
3. Why on-host compile hurts (contrast `openresty.sh.j2` vs prebuilt).
4. **Section — “Why teams don’t ship this”** — backlog economics, cross-cutting risk, opaque failures (expand the fact sheet).
5. **Section — “AI-assisted delivery loop (WSLProxy)”** — phased table (frame → scaffold → archaeology → CI loop → docs); what stayed human; what the agent sped up; cite Actions runs / file paths as evidence of iteration, not as proof of autonomy.
6. Prebuilt Dockerfile walkthrough (stages, PATH/ldconfig, luarocks/LuaJIT split, rocks policy, `mc`, runtime stage).
7. GitHub Actions: `build-openresty-prebuilt.yml` — triggers (`paths:`), Buildx, Hub login secrets (`DOCKER_USER` / `DOCKER_PASSWD`), tags, `cache-from`/`cache-to`, dispatch inputs for version/base.
8. Ansible consumer: `openresty_prebuilt.yml` step-by-step (pull → create → cp → rsync excludes → symlinks).
9. glibc / `BASE_IMAGE` coupling — how to rebuild for debian:12 vs :13 safely.
10. Root `Dockerfile` lessons for **app** images (order of `RUN` vs `COPY`; caching `mc`).
11. RHS full deploy: `deploy-wslproxy-delivery-pipeline.yml` stages; `deploy-environment.yml` Node/npm + `.next/cache` keys; mapping `DEPLOY_MODE` → Ansible tags.
12. Operator playbook: when to bump image version, when `code` suffices, when to force `build`/`full`, how to verify (`openresty -V`, health on admin port).
13. Pitfalls checklist (PATH, 410 URLs, wrong glibc, overwriting conf/html/logs, treating every push as `full`) — note which ones an agent can triage from logs vs which need human judgement.
14. **Playbook for other teams:** “Use an agent to draft the prebuilt path + cache wiring; you own merge, secrets, and first POP soak.” Keep vendor-neutral (Cursor / Claude / Copilot-class assistants — don’t hard-sell one product unless Workstation messaging requires it).
15. Appendix: link table to every cited GitHub file (permalinks to `main`).

Optional code samples (short, attributed):

- Snippet: Buildx cache block from `build-openresty-prebuilt.yml`
- Snippet: `docker cp` extract from `openresty_prebuilt.yml`
- Snippet: Next.js `actions/cache` paths from `deploy-environment.yml`
- Snippet: `ENV PATH=.../usr/sbin:/sbin...` from prebuilt Dockerfile

Suggested title: **Workstation WSL Proxy — Docker Image Optimisation, Build Cache, Full Deploy Workflow, and Shipping It with AI Assistance**

---

## 3. Deliverables in workstation-website

Create a new publish pack (name suggestion):

`scripts/wslproxy-docker-cache-deploy-publish/`

Containing:

1. `blog-body.html` — Piece A (CMS-ready HTML; British English; internal cross-links)
2. `article-body.html` — Piece B
3. `build_json.py` — copy structure from `scripts/wsl-proxy-publish/build_json.py`; new slugs/titles/tags; upsert drafts via `scripts/lib/articles_locales.py`
4. Optional: `PROMPT.md` symlink or one-line README pointing back to this file in `bwalia/wslproxy` for provenance

HTML guidance:

- Use semantic headings; keep GitHub links as full `https://github.com/bwalia/wslproxy/blob/main/...` URLs.
- Include at least one diagram (mermaid rendered to SVG/PNG **or** a simple HTML figure with LHS/RHS columns — match whatever sibling articles do).
- Cover image: reuse `/img/wsl-proxy-cover.svg` or a new diagram asset under `public/img/` if you create one (keep simple; no stock photo clutter).
- Tags: favour devops / sre / docker / ci-cd / openresty-adjacent tags already used in sibling packs — do not invent CMS tag IDs; copy IDs from an existing publish script when unsure.
- File **drafts** in the CMS (do not publish live unless asked).

Also (optional): if asked later, sync a short pointer on https://wslproxy.org blog — **out of scope unless requested**.

---

## 4. Report back

Short report with:

1. Draft URLs / CMS IDs (or file paths if CMS unreachable).
2. Final titles + slugs.
3. Which GitHub sample links were embedded (checklist).
4. Whether measured timings were used or kept qualitative.
5. How the AI-assisted delivery thesis was framed (and confirmation you avoided autonomy/hype claims).
6. Diff summary under `workstation-website/scripts/wslproxy-docker-cache-deploy-publish/`.

---

## 5. Out of scope

- Changing WSLProxy CI/Ansible/Dockerfiles (this prompt is content-only).
- Claiming multi-arch prebuilt images if the workflow still lists `linux/amd64` only.
- Inventing Hub download counts or customer savings.
- Publishing live without an explicit “publish” ask.
- Rewriting Ring Promoter or diy-tax-return-uk deploy docs unless citing them as separate consumers.
- Claiming AI autonomously merged to production, rotated secrets, or “guaranteed” deploy-time savings.
- Naming private chat transcripts or internal agent IDs; stick to public GitHub artefacts and the process pattern.

---

## 6. Quick copy-paste link bank (embed liberally)

```
https://github.com/bwalia/wslproxy
https://github.com/bwalia/wslproxy/blob/main/infra/openresty-prebuilt/Dockerfile
https://github.com/bwalia/wslproxy/blob/main/.github/workflows/build-openresty-prebuilt.yml
https://github.com/bwalia/wslproxy/blob/main/infra/ansible/roles/wslproxy/tasks/openresty_prebuilt.yml
https://github.com/bwalia/wslproxy/blob/main/infra/ansible/roles/wslproxy/defaults/main.yml
https://github.com/bwalia/wslproxy/blob/main/infra/openresty-prebuilt/openresty-express-install.sh
https://github.com/bwalia/wslproxy/blob/main/Dockerfile
https://github.com/bwalia/wslproxy/blob/main/.github/workflows/deploy-environment.yml
https://github.com/bwalia/wslproxy/blob/main/.github/workflows/deploy-wslproxy-delivery-pipeline.yml
https://github.com/bwalia/wslproxy/blob/main/.github/workflows/build-wslproxy-cli.yml
https://github.com/bwalia/wslproxy/actions/workflows/build-openresty-prebuilt.yml
https://wslproxy.org
```
