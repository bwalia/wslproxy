# POPs & Cloudflare DNS — End-to-End Guide

This guide walks you through the **POPs** (Points of Presence) feature and the **automatic Cloudflare DNS provisioning** that uses it.  It is written so a non-technical operator can follow it end-to-end with no prior Lua / OpenResty / Cloudflare knowledge — just copy the snippets and follow the screenshots-described steps.

> **TL;DR.** A POP is a server location (a real machine with a public IP that runs wslproxy).  Once you tell wslproxy which POPs serve a given domain, the dashboard's **Preview & Provision** button (or the equivalent Claude / MCP command) will create the right Cloudflare A records for you — without ever touching DNS records you curated by hand.

---

## Table of Contents

1. [What is a POP?](#1-what-is-a-pop)
2. [How DNS provisioning works](#2-how-dns-provisioning-works)
3. [One-time Cloudflare setup](#3-one-time-cloudflare-setup)
   - [3.1  Generate a Cloudflare API token](#31-generate-a-cloudflare-api-token)
   - [3.2  Find your zone ID](#32-find-your-zone-id)
   - [3.3  Add the dns block to settings.json](#33-add-the-dns-block-to-settingsjson)
   - [3.4  Reload OpenResty](#34-reload-openresty)
4. [Adding your POPs](#4-adding-your-pops)
   - [4.1  Via the dashboard](#41-via-the-dashboard)
   - [4.2  Via the REST API (curl)](#42-via-the-rest-api-curl)
   - [4.3  Via Claude / MCP (natural language)](#43-via-claude--mcp-natural-language)
5. [Assigning POPs to a server](#5-assigning-pops-to-a-server)
6. [Provisioning DNS](#6-provisioning-dns)
   - [6.1  Via the dashboard (Preview & Provision)](#61-via-the-dashboard-preview--provision)
   - [6.2  Via the REST API](#62-via-the-rest-api)
   - [6.3  Via Claude / MCP](#63-via-claude--mcp)
7. [Safety guarantees](#7-safety-guarantees)
8. [Troubleshooting](#8-troubleshooting)
9. [FAQ](#9-faq)

---

## 1. What is a POP?

A **POP** (Point of Presence) is a physical or virtual server somewhere in the world that runs wslproxy and serves real traffic.  Each POP has:

| Field | Example | What it's for |
|---|---|---|
| **id** | `pop0`, `lon1`, `us-east-1` | Short slug used everywhere wslproxy references this POP |
| **display_name** | `London POP 0` | Human-friendly label shown in the dashboard |
| **public_ipv4** | `187.124.112.155` | The public IP that DNS will point to |
| **region** | `eu-west-1` | Logical grouping (used to sort the picker) |
| **city** | `London` | For dashboards / context only |
| **country_code** | `GB` | ISO code, for context |
| **status** | `active` / `draining` / `maintenance` / `down` | Operational state — `draining` and `maintenance` are excluded from DNS by default |
| **capacity_weight** | `1.0` (default) / `0.5` / `0` | Routing weight; `0` = drained (no traffic) |

POPs are **global** — they're not per-environment.  The same `pop0` is referenced by your prod and int servers.

A **server** (Virtual Server / hostname) declares which POPs serve it via its `pop_ids` field.  When you provision DNS, wslproxy creates one A record per active POP, pointing the domain at each POP's `public_ipv4`.

```
Server: api.example.com
pop_ids: [pop0, lon1]

      ↓ Preview & Provision

Cloudflare A records:
  api.example.com → 187.124.112.155  (pop=pop0)
  api.example.com → 72.62.211.28     (pop=lon1)
```

---

## 2. How DNS provisioning works

When you click **Preview & Provision** (or call the equivalent MCP / REST endpoint), wslproxy does this in order:

1. **Loads your server's `pop_ids`** from disk.
2. **Resolves each pop_id** to a public IP by reading the POP's JSON.  POPs with status `down` / `maintenance` are skipped (unless you pass `include_inactive: true`).
3. **Resolves the Cloudflare zone** for the domain from your `managed_zones` allowlist.  **Domains outside the allowlist are refused before any HTTP call to Cloudflare.**
4. **Inventories existing records** for that domain from Cloudflare.  Each record carries a comment marker — `wslproxy-managed | server=… | profile=… | pop=…` — that tells wslproxy which records it owns.
5. **Builds a plan**: for each desired POP it decides `create` / `update` / `unchanged`.  Records that exist for POPs no longer in `pop_ids` get marked `delete`.
6. **In dry-run mode** (the default for Claude / MCP), the plan is returned without writing.  In apply mode, each action is executed against Cloudflare and reported back individually.

**Records wslproxy didn't create are never modified or deleted.**  This is the hard guarantee — your hand-curated records and other tools' records are safe.

---

## 3. One-time Cloudflare setup

### 3.1  Generate a Cloudflare API token

This token is what wslproxy uses to authenticate with Cloudflare.  It only needs DNS edit permission on the zones you want to manage.

1. Open https://dash.cloudflare.com/profile/api-tokens
2. Click **Create Token** (top right)
3. Find the template **"Edit zone DNS"** and click **Use template**
4. Under **Zone Resources**, you have two choices:
   - **Include → Specific zone → pick the zone you want to manage.**  This is the safer choice — the token can ONLY edit that one zone.
   - **Include → All zones.**  Use this if you have many zones and don't want to manage tokens per zone.  ⚠ This token can edit DNS on every zone in your account.
5. (Optional) **Client IP Address Filtering** — restrict to your wslproxy server's IP for extra safety.
6. (Optional) **TTL** — set an expiry if you want forced rotation (e.g. 1 year).
7. Click **Continue to summary** → **Create Token**.
8. **Copy the token now** — Cloudflare will not show it again.  It looks like `cfut_abc123…` or `xRandomString…`.

> **Important:** Treat this token like a password.  Don't paste it into chat logs, Slack, screenshots, or commit it to git.  `data/settings.json` is git-ignored so storing it there is safe.

### 3.2  Find your zone ID

Each Cloudflare zone has a 32-character hex ID.  To find it:

1. In the Cloudflare dashboard, click on your zone (the domain name).
2. Land on the **Overview** page.
3. Scroll down the right sidebar — the **Zone ID** is shown there (e.g. `023e105f4ecef8ad9ca31a8372d0c353`).  Click the copy icon next to it.

You'll need this ID for `settings.json`.

### 3.3  Add the dns block to settings.json

Open `data/settings.json` and add a top-level `dns` block.  Paste in your token (from 3.1) and zone (name + id from 3.2).  Example:

```jsonc
{
  // ... existing keys ...
  "dns": {
    "enabled": true,
    "default_ttl": 300,
    "default_proxied": false,
    "providers": [
      {
        "name": "cloudflare-primary",
        "type": "cloudflare",
        "api_token": "PASTE_YOUR_REAL_TOKEN_HERE",
        "managed_zones": [
          {
            "name": "example.com",
            "zone_id": "023e105f4ecef8ad9ca31a8372d0c353"
          }
        ]
      }
    ]
  }
}
```

**Field reference:**

| Field | Required? | What it does |
|---|---|---|
| `enabled` | yes | Set `true` to allow provisioning at all.  `false` to switch off without removing the block. |
| `default_ttl` | no | TTL (seconds) for created records.  300 = 5 minutes (a sensible default; tighter = faster fail-over, looser = less load on CF) |
| `default_proxied` | no | `false` = DNS-only ("grey cloud").  `true` = proxy through Cloudflare ("orange cloud", with CDN/WAF). |
| `providers[]` | yes | One entry per provider; today only `type: "cloudflare"` is supported. |
| `providers[].api_token` | yes | The token you generated. |
| `providers[].managed_zones[]` | yes | The **allowlist** — wslproxy refuses to write to any zone NOT in this list, even if the token has permission. |

> ✅ The `managed_zones` allowlist is your safety net.  Even if the token has "All zones" access, only the zones listed here can be touched.  Adding a new zone is a deliberate edit to `settings.json`.

### 3.4  Reload OpenResty

So OpenResty picks up the new settings:

```bash
# Inside the Docker container:
docker exec wslproxy-local /usr/local/openresty/bin/openresty -s reload

# On a bare-metal install:
sudo systemctl reload openresty
```

You're done with one-time setup.  Verify with a quick test:

```bash
curl -H "Authorization: Bearer YOUR_JWT" \
  "http://localhost:18280/api/dns/lookup?domain=anything-not-in-your-zone.test"
```

You should get a `zone_not_allowed` 403 — that proves the dns block is loaded and the allowlist works.

---

## 4. Adding your POPs

You can add POPs in three equivalent ways.  Use whichever fits your workflow.

### 4.1  Via the dashboard

1. Open `http://localhost:7619/pops` (dev) or your deployed dashboard URL.
2. Click **+ Create POP** (top right).
3. Fill in at minimum: `id`, `display_name`, `public_ipv4`.  The form will guide you through optional fields (region, city, country_code, status, capacity_weight, tags).
4. Click **Save**.
5. Verify the new POP shows up in the list with status badge `Active`.

### 4.2  Via the REST API (curl)

You need a JWT.  Get one by logging in:

```bash
TOKEN=$(curl -s -X POST http://localhost:18280/api/user/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_ADMIN_PASSWORD"}' | jq -r .accessToken)
```

Then create the POP:

```bash
curl -X POST http://localhost:18280/api/pops \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-platform: openresty-admin-next' \
  -H 'Content-Type: application/json' \
  -d '{
    "id": "lon2",
    "display_name": "London POP 2",
    "public_ipv4": "192.0.2.42",
    "region": "eu-west-1",
    "city": "London",
    "country_code": "GB",
    "status": "active"
  }'
```

### 4.3  Via Claude / MCP (natural language)

Once you've integrated wslproxy with Claude Desktop, Claude Code, or any other MCP client (see [api/mcp/README.md](api/mcp/README.md)), you can just ask:

```
You: Add a new POP called "lon2" in London, IP 192.0.2.42, eu-west-1 region.

Claude: [calls create_pop with dry_run=true]
        Here's what I'm about to create:
          - id: lon2
          - public_ipv4: 192.0.2.42
          - region: eu-west-1
          - city: London
        Should I proceed?

You: yes

Claude: [calls create_pop with dry_run=false]
        Done.  POP lon2 is now in the list.
```

Other natural-language commands that work:
- *"List all POPs"*
- *"What's the status of pop0?"*
- *"Drain lon1 — set its status to maintenance"*
- *"Delete the unused us-east-1 POP"*

---

## 5. Assigning POPs to a server

Once your POPs exist, you tell each server (Virtual Server / hostname) which POPs serve it.

**Dashboard:**

1. Open the server you want to edit at `/servers/host:your-domain.com`
2. Scroll to the **POPs (Points of Presence)** section (right after **Basic Settings**).
3. Tick the checkbox next to each POP that should serve this server.
4. Click **Save Changes** at the bottom.

**REST API:**

Update the server with a `pop_ids` array:

```bash
curl -X PUT "http://localhost:18280/api/servers/host:api.example.com" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-platform: openresty-admin-next' \
  -H 'Content-Type: application/json' \
  -d '{"pop_ids": ["pop0", "lon1"]}'
```

**Claude / MCP:**

```
You: For server host:api.example.com, set the POPs to pop0 and lon1.

Claude: [calls update_server with pop_ids=["pop0","lon1"]]
        Done.  api.example.com is now served by pop0 + lon1.
```

---

## 6. Provisioning DNS

This is the step that actually writes records to Cloudflare.

### 6.1  Via the dashboard (Preview & Provision)

After assigning POPs to a server (step 5), the **DNS State (Cloudflare)** card appears right below the POPs section.

1. The card auto-loads the current Cloudflare records for that domain.
2. Click **Preview & Provision**.
3. A modal opens showing **the plan**: what will be created, updated, or deleted, per POP, with the IP and Cloudflare record ID.  Records the orchestrator can't act on are listed under "Skipped POPs" with a reason.
4. Review the plan.  If it looks right, click **Apply N changes**.
5. The modal shows the executed result — successes and any per-action errors (Cloudflare may succeed on some records and fail on others; each is reported independently).
6. Close.  The DNS State panel refreshes to show the new live records.

**What the state panel shows you:**

| State | What it means | What to do |
|---|---|---|
| Records listed under "Managed by wslproxy" | These have the wslproxy comment marker and are subject to convergence | Normal state |
| Records listed under "External records" | wslproxy did NOT create these — they'll never be modified or deleted | Normal state for hand-curated records |
| `Replace the placeholder zone in settings.json` | You're still on a placeholder zone_id (`000…0`) | Edit `settings.json` to use a real zone_id (see step 3.3) |
| `No managed zone covers <domain>` | The domain's parent zone isn't in your allowlist | Add the parent zone to `managed_zones` |
| `DNS provisioning is not configured` | No `dns` block in `settings.json` | Complete step 3.3 |
| `Cloudflare rejected the request` with code 10000 | Token lacks permission for this zone | Generate a new token scoped to this zone, or add the zone to the existing token's scope |

### 6.2  Via the REST API

**Preview (dry-run):**

```bash
curl -X POST http://localhost:18280/api/dns/provision \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-platform: openresty-admin-next' \
  -H 'Content-Type: application/json' \
  -d '{
    "server_id": "host:api.example.com",
    "profile_id": "prod",
    "dry_run": true
  }'
```

**Apply (real):**

```bash
curl -X POST http://localhost:18280/api/dns/provision \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-platform: openresty-admin-next' \
  -H 'Content-Type: application/json' \
  -d '{
    "server_id": "host:api.example.com",
    "profile_id": "prod",
    "dry_run": false
  }'
```

**Look up current state:**

```bash
curl -H "Authorization: Bearer $TOKEN" \
  "http://localhost:18280/api/dns/lookup?domain=api.example.com"
```

### 6.3  Via Claude / MCP

The MCP `provision_dns` tool **defaults to dry-run** — so Claude will always show you the plan before applying.

```
You: Provision DNS for host:api.example.com in prod.

Claude: [calls provision_dns (dry_run defaults to true)]
        Here's what would change in Cloudflare:
          - CREATE A api.example.com → 187.124.112.155  (pop=pop0)
          - CREATE A api.example.com → 72.62.211.28    (pop=lon1)
        Should I apply these?

You: yes

Claude: [calls provision_dns with dry_run=false]
        Applied:
          - Created A record api.example.com → 187.124.112.155
          - Created A record api.example.com → 72.62.211.28
        Both records are now live in Cloudflare.

You: What DNS records exist for api.example.com right now?

Claude: [calls lookup_dns]
        Cloudflare has 2 A records:
          - 187.124.112.155  (managed by wslproxy, pop=pop0)
          - 72.62.211.28    (managed by wslproxy, pop=lon1)
        No hand-curated records.
```

For a full tour of the MCP setup (Claude Desktop, Claude Code, Cursor, Continue.dev, custom clients), see **[api/mcp/README.md](api/mcp/README.md)**.

---

## 7. Safety guarantees

The DNS provisioner has five hard guardrails:

1. **`managed_zones` allowlist.**  Domains outside the allowlist are refused before any HTTP call to Cloudflare.  Even if the token has "All zones" access, only the zones you list can be touched.
2. **`wslproxy-managed` comment marker.**  wslproxy only modifies or deletes records carrying this comment.  Hand-curated records with no marker are **never touched** — even if their names collide with a desired record.
3. **Down / maintenance POPs are skipped by default.**  Their A records are NOT created, even if they're in the server's `pop_ids`.  Pass `include_inactive: true` to override.
4. **`dry_run: true` is the default for MCP `provision_dns`.**  An AI agent always sees the plan first; applying requires an explicit `dry_run: false` follow-up.
5. **POP deletion refuses while in use.**  Deleting a POP that's referenced by any server returns `409` with the list of referencing servers.  Pass `force: true` to cascade-detach — and even then, if **any** server can't be safely rewritten, the whole delete aborts (no dangling pop_ids left behind).

---

## 8. Troubleshooting

### "DNS provisioning is not configured" in the panel
You haven't added the `dns` block to `settings.json` yet.  Go back to [step 3.3](#33-add-the-dns-block-to-settingsjson).

### "Replace the placeholder zone in settings.json"
Your `managed_zones[0].zone_id` is `00000000000000000000000000000000` (a placeholder we use during testing).  Replace it with the real zone_id from [step 3.2](#32-find-your-zone-id).

### "No managed zone covers \<domain\>"
The domain you're trying to provision is not under any of the zones in your `managed_zones` allowlist.  Either:
- Add the parent zone to `managed_zones` (with its zone_id), or
- Pick a different domain that IS under an allowed zone.

### "Cloudflare rejected the request (HTTP 403)" with code 10000 "Authentication error"
The token doesn't have permission to read/write DNS on the zone you're targeting.  Either:
- Regenerate the token with the correct zone scope, or
- Add this zone to the existing token's scope in Cloudflare dashboard → API tokens → edit token → Zone Resources.

### "Could not reach Cloudflare" / network errors
- Verify `api.cloudflare.com` is reachable from your wslproxy host: `curl https://api.cloudflare.com/client/v4`
- Check the trust store directive in nginx: `lua_ssl_trusted_certificate /etc/ssl/certs/ca-certificates.crt;` should be in the `http` block.  Debian ships the bundle via the `ca-certificates` package.
- On Docker for Mac: the bridge sometimes returns IPv6 with no v6 route — `ipv6=off` on the `resolver` directive avoids this.

### "Pre-existing CRUD on POPs returns 500 HTML page"
You hit a malformed JSON path.  This was fixed in commit `cd90ac8b` — make sure your `feature/pops-and-cloudflare-dns` branch is up to date.

### Records keep getting created instead of updated
Check the comment on the existing Cloudflare records.  wslproxy can only update records it created (those carrying the `wslproxy-managed | …` comment).  If someone (or another tool) created the record without the marker, wslproxy treats it as "external" and refuses to touch it.  Either:
- Delete the unmarked record in Cloudflare manually and re-run Preview & Provision, or
- Edit the Cloudflare record's comment to include `wslproxy-managed | server=… | profile=… | pop=…` and wslproxy will pick it up.

---

## 9. FAQ

**Q: Can I have multiple Cloudflare accounts / multiple providers?**
Yes.  `providers[]` is an array — add a second entry with a different token + different `managed_zones`.  Each provider has its own allowlist.

**Q: What about AAAA (IPv6) records?**
Today the provisioner manages A records only.  POPs have a `public_ipv6` field and the code is structured to support AAAA in a future change — but it's not exposed yet.  If you need it, file an issue or open a PR.

**Q: What about CNAME records?**
Not supported yet — same reason as AAAA.  Today wslproxy creates one A record per POP.  CNAME-via-single-hostname (e.g. all servers point to `wslproxy.example.com` which has A records for each POP) would be cleaner for fleets with rotating IPs, but isn't implemented.

**Q: Does the dashboard's "Refresh" button rate-limit Cloudflare?**
Each Refresh hits Cloudflare's `GET /zones/{id}/dns_records` once per domain.  Cloudflare's limit is ~1200 req/5min per token — you'd have to spam Refresh hundreds of times per minute to hit it.

**Q: What happens if I rename a domain (change `server_name`)?**
Today: nothing automatic.  The records for the old domain remain in Cloudflare (orphaned-but-marked).  You'd manually delete them in CF dashboard.  A future enhancement could detect rename and clean up.

**Q: Is the Cloudflare API token rotated automatically?**
No.  Tokens are static in `settings.json`.  We recommend setting a TTL in Cloudflare when you create the token (e.g. 1 year) and rotating manually.

**Q: Can I roll back a DNS change?**
Not directly — once applied, the change is in Cloudflare.  However, the audit log (`data/audit/YYYY-MM/DD.json`) records every action with timestamps and the previous state, so you can manually revert by replaying the inverse plan.  A "rollback last provision" feature is on the roadmap.

**Q: What's the difference between `dry_run` (DNS) and `confirm` (POP delete)?**
- `dry_run: true` returns a **plan preview** without writing — used for non-destructive changes you want to inspect first.
- `confirm: true` is a **destructive-action gate** — required for irreversible operations (delete) so an AI agent can't accidentally trigger them.

**Q: Can I use this without Cloudflare?**
Today no.  The provider abstraction is in place (`api/dns_manager.lua` is structured around a `provider` type), so adding Route 53, Google Cloud DNS, or Azure DNS is a discrete chunk of work.  The dashboard and MCP tools are provider-agnostic — they only care about the `dns_manager` interface, not Cloudflare specifically.

---

## See also

- **[api/mcp/README.md](api/mcp/README.md)** — full MCP server documentation: Claude Desktop / Code / Cursor / Continue.dev integration, all tool reference, troubleshooting
- **[CLAUDE.md](CLAUDE.md)** — repo-level architecture + conventions
- **`data/audit/YYYY-MM/DD.json`** — NDJSON audit trail of every POP and DNS action
- **`data/pops/*.json`** — POP records on disk (one file per POP)
- **`data/settings.json`** — global config including the `dns` block
