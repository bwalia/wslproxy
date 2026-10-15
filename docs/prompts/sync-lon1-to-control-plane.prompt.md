# Prompt: push lon1's live rules + servers back to the central control plane

Use this in the **wslproxy** repo. Goal: config that was changed **directly on
lon1** (the prod edge / data plane) must flow back into the **central control
plane** — its rules + servers store and this repo's `data/` — so central stays
the source of truth for every data plane, nothing is lost on the next deploy or
re-import, and drift is detected automatically from now on.

Read `CLAUDE.md` first (especially gotchas 16 and 22, "pop0 mirrors lon1",
storage layer, promotion chain) and `infra/edge-sync/`,
`infra/ansible/deploy-configs.yml`, `deploy-environment.yml`
(`push_repo_data`), `deploy-wslproxy-virtual-servers.yml`,
`scripts/pg-import-from-disk.sh`, `api/repo/`, `api/storage/`.

**Safety:** read-only against lon1 and pop0 unless explicitly approved. Never
overwrite lon1 from repo data. Never mint new rule ids (re-creating a rule in
the admin UI forks it from git — gotcha 16). Never print tokens, keys or
`settings.json` secrets. Work on a branch; open PRs.

## Why this is needed (2026-10-06)

App repos import their own rules/servers straight into lon1 with
`POST /api/projects/import` (gateway `prod-our.wslproxy.com` → `195.20.255.201`
= lon1), which preserves committed ids. These changes were made that way and
**exist on lon1 (and pop0 via edge-sync) but not in this repo's
`data/{rules,servers}/prod/` or the central store**:

| Object | Owner repo (source file) | Change |
|---|---|---|
| rule `shop-prod-cloud003` (new) | `bwalia/workstation-website` `.github/wslproxy/data/rules/prod/shop-prod-cloud003.json` | prod shop host routed to cloud003's traefik-edge; then a second backend: `origin-uk-003.pop0.uk` + `origin-uk-002.pop0.uk` (vps002), weight 50/50, `least_conn` |
| server `host:shop.workstation.co.uk` (new) | same repo, `.github/wslproxy/data/servers/prod/` | `rules: shop-prod-cloud003`, ssl auto-renew |
| server `host:int-shop.workstation.co.uk` (new) | same | `rules: wsw-prod-default` |
| rule `wsw-prod-default` (changed) | same repo `rules/prod/wsw-prod-default.json` | `servers[]` gained `host:int-shop…`; `host:shop…` moved to `shop-prod-cloud003` |
| rule `opsapi-prod-cloud003` (exists on lon1, check here) | `bwalia/opsapi` `.github/wslproxy/data/rules/prod/opsapi-prod-cloud003.json` | `opsapi.workstation.co.uk` + `opsapi-ui…` → `origin-uk-003.pop0.uk` |

The repo copy of `data/rules/prod/wsw-prod-default.json` and
`data/servers/prod/` is therefore stale (no `host:shop…`/`host:int-shop…`,
old `servers[]`). There are likely more drifted objects from other app repos
(diytaxreturn, academy, beaconpulse, sysops…) — find them all.

## Tasks

1. **Map the planes precisely** (document in `docs/architecture/` or the
   runbook): which component is the *central control plane* today (the k3s1
   `wslproxy-system` control plane + its storage — disk JSON / Redis / pgsql
   dual-write — vs lon1's disk JSON), which nodes are *data planes* (lon1,
   pop0 mirror, any k3s ingress), and the current direction of every sync
   (`wslproxy-edge-sync` pull lon1 → pop0, `/frontdoor/opsapi/sync`,
   `deploy-configs.yml` repo → edge, app-repo imports → lon1). Note where
   "lon1 is source of truth" (gotcha 22) conflicts with "central control plane
   is source of truth" and propose the end state.
2. **Drift report (read-only):** export lon1's live `rules/` + `servers/` for
   every profile (`infra/edge-sync/wslproxy-edge-export` or the API
   `GET /api/rules|servers?profile=…`), compare with (a) this repo's `data/`,
   (b) the central control-plane store, (c) each owning app repo's
   `.github/wslproxy/data/` on **origin/main** (use `git show origin/main:…`,
   not local checkouts). Report per object: only-on-lon1 / only-central /
   different (field-level diff) / same, plus which repo owns it. Ignore volatile
   fields (timestamps, `config_status` toggles, runtime counters) — list which
   fields you treated as volatile.
3. **Reconcile into central** — a script, e.g.
   `scripts/pull-lon1-to-central.sh` (idempotent, `--dry-run` default):
   pull lon1 JSON, write into the central store **preserving ids** (import
   path, not create), and update this repo's `data/{rules,servers}/<profile>/`
   so git matches. App-owned objects: central/repo copy must equal the app
   repo's origin/main; if lon1 differs from the app repo, flag it, don't pick a
   winner silently.
4. **Make it continuous:** a scheduled job (systemd timer or GitHub workflow on
   the self-hosted runner that can reach lon1) that runs the drift report and
   opens a PR / alerts on drift, so direct-to-lon1 changes can't silently
   diverge again. Consider making app-repo imports target the central control
   plane, which then fans out to data planes, instead of lon1 directly.
5. **Guard the reverse path:** confirm `push_repo_data: auto` still skips lon1,
   and add a pre-flight in `deploy-configs.yml` that refuses to push repo data
   to any data plane whose live config is newer than the repo copy (would have
   prevented the 2026-09-24 pop0 overwrite).
6. **Apply** (only after approval): run the reconcile for `prod`, verify
   central == lon1 for every object in the table above, and that pop0 still
   mirrors lon1 within 5 min.

## Deliverables

- Drift report (markdown) committed under `docs/runbooks/`.
- PR with the reconcile script, updated `data/` for `prod` (at minimum the
  five objects above), the continuous drift check, the deploy pre-flight, and a
  runbook "Changing edge config: app repo → central → data planes".
- A short note in `CLAUDE.md` gotchas describing the new flow.

## Verification

- `--dry-run` output before/after; field-level diff empty for reconciled
  objects.
- `curl -s -o /dev/null -w '%{http_code}'` for `shop.workstation.co.uk`,
  `int-shop.workstation.co.uk`, `opsapi.workstation.co.uk`, `www`, `int`
  unchanged (200/307) after reconcile.
- No rule ids changed (compare id sets before/after).
