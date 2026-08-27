# POPs & Cloudflare DNS — End-to-End Guide

This guide walks you through the **POPs** (Points of Presence) feature and the **automatic Cloudflare DNS provisioning** that uses it.  It is written so a non-technical operator can follow it end-to-end with no prior Lua / OpenResty / Cloudflare knowledge — just copy the snippets and follow the screenshots-described steps.

> **TL;DR.** A POP is a server location (a real machine with a public IP that runs wslproxy).  Once you tell wslproxy which POPs serve a given domain, the dashboard's **Preview & Provision** button (or the equivalent Claude / MCP command) will create the right Cloudflare A records for you — without ever touching DNS records you curated by hand.

---

## The mental model in 60 seconds

The whole system is **two separate actions**, never tangled together:

| Action | What it does | Touches Cloudflare? |
|---|---|---|
| **SAVE** (server form → Save Changes) | Writes the server JSON on disk (pop_ids, record type, etc.) | **No.** |
| **PROVISION** (click Preview & Provision → Apply) | Reads what's currently in Cloudflare, computes the diff, writes the changes | **Yes.** |

This means you can edit a server twenty times a day — flip pop_ids, switch record type, change CNAME targets — and Cloudflare sees nothing.  Cloudflare is only touched when you explicitly click **Preview & Provision** and approve the plan.

### When *exactly* does Cloudflare get called?

| Moment | What wslproxy does | Calls |
|---|---|---|
| You open a server edit page | Loads the current DNS records to show in the State panel | 1 read |
| You click **Preview & Provision** | Builds a fresh action plan | 1 read |
| You click **Apply N changes** in the dialog | Writes each action | N writes |

That's it.  There's no cron job hitting Cloudflare.  There's no background sync.  Cloudflare is touched **only when an operator (or an AI agent) explicitly asks for it.**

> **The single rule to remember:** "Save = wslproxy state only.  Provision = Cloudflare state."

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
   - [4.3  Via Ansible (production deploy)](#43-via-ansible-production-deploy)
   - [4.4  Via Claude / MCP (natural language)](#44-via-claude--mcp-natural-language)
5. [Assigning POPs and choosing the record type](#5-assigning-pops-and-choosing-the-record-type)
6. [Provisioning DNS](#6-provisioning-dns)
   - [6.1  Via the dashboard (Preview & Provision)](#61-via-the-dashboard-preview--provision)
   - [6.2  Via the REST API](#62-via-the-rest-api)
   - [6.3  Via Claude / MCP](#63-via-claude--mcp)
7. [Day-to-day operations](#7-day-to-day-operations)
8. [Safety guarantees](#8-safety-guarantees)
9. [Troubleshooting](#9-troubleshooting)
10. [FAQ](#10-faq)

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
  api.example.com → 195.20.255.201     (pop=lon1)
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

### Choosing the record type

Each server has a `dns_record_type` field — set via the **DNS Record Type** card on the server form — that controls what shape of record the provisioner publishes:

| Mode | What's published | Uses pop_ids? | Reads which POP field |
|---|---|---|---|
| **A** (default) | One A record per active POP | yes | `public_ipv4` |
| **AAAA** | One AAAA record per active POP | yes | `public_ipv6` |
| **BOTH** | Both A and AAAA per active POP (dual-stack) | yes | `public_ipv4` + `public_ipv6` |
| **CNAME** | ONE CNAME pointing at a hostname | no | uses `dns_cname_target` instead |

In **BOTH** mode, POPs that have `public_ipv4` but no `public_ipv6` still get an A record — the AAAA pass just skips them with reason `no_public_ipv6`.  In **CNAME** mode, POPs are not used at all; the server points at a single hostname.

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

### 4.3  Via Ansible (production deploy)

If you deploy wslproxy via the Ansible role, the two production POPs (`pop0` + `lon1`) are seeded automatically on the first deploy.  The seed is defined in `infra/ansible/roles/wslproxy/defaults/main.yml` under the `wslproxy_pops` variable, and the task lives at `tasks/seed_pops.yml`.

**Two important properties:**

1. **Idempotent.**  The seed uses `force: no` — if `/opt/nginx/data/pops/<id>.json` already exists on the target host (because an operator edited via the dashboard, or a previous deploy seeded it), the file is left untouched.  Re-running the role is safe.
2. **Customisable per-environment.**  Override `wslproxy_pops` in your inventory / group_vars to add environment-specific POPs:

```yaml
# inventory/group_vars/staging.yml
wslproxy_pops:
  - id: pop0
    display_name: "London POP 0"
    public_ipv4: "187.124.112.155"
    region: eu-west
    city: London
    country_code: GB
    status: active
    capacity_weight: 1.0
    tags: [production, primary]
    metadata: {}
  # ... add per-environment POPs here ...
  - id: staging-1
    display_name: "Staging EU"
    public_ipv4: "10.42.0.1"
    region: eu-staging
    status: maintenance
    capacity_weight: 0
    tags: [staging]
    metadata: {}
```

Run `ansible-playbook ... --tags pops` to re-run just the seed task on its own.

### 4.4  Via Claude / MCP (natural language)

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

## 5. Assigning POPs and choosing the record type

Once your POPs exist, you tell each server (Virtual Server / hostname) two things:
1. **Which POPs serve it** — the `pop_ids` list
2. **What shape of DNS record to publish** — A / AAAA / BOTH / CNAME

**Dashboard:**

1. Open the server you want to edit at `/servers/host:your-domain.com`
2. Scroll to the **POPs (Points of Presence)** section (right after **Basic Settings**).
3. Tick the checkbox next to each POP that should serve this server.
4. Scroll one more card down to **DNS Record Type** and pick:
   - **A** (default) — one IPv4 record per POP.  The right choice for most setups.
   - **AAAA** — one IPv6 record per POP.  Each POP must have `public_ipv6` set.
   - **BOTH** — dual-stack: A *and* AAAA per POP.  POPs without v6 still get their A record; the AAAA pass just skips them.
   - **CNAME** — one CNAME pointing at a hostname.  When you pick this, a **CNAME target** input appears — fill in the hostname (e.g. `edge.wslproxy.com`).  POPs are ignored in CNAME mode.
5. Click **Save Changes** at the bottom.

> 💡 The picker above shows `· v6 <addr>` next to each POP's IPv4 address when that POP has `public_ipv6` set.  Use that to spot v6-ready POPs before flipping a server to AAAA or BOTH mode.

**REST API:**

Update the server with `pop_ids`, `dns_record_type`, and (for CNAME mode) `dns_cname_target`:

```bash
# Standard dual-stack server
curl -X PUT "http://localhost:18280/api/servers/host:api.example.com" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-platform: openresty-admin-next' \
  -H 'Content-Type: application/json' \
  -d '{
    "pop_ids": ["pop0", "lon1"],
    "dns_record_type": "BOTH"
  }'

# CNAME server (pop_ids ignored)
curl -X PUT "http://localhost:18280/api/servers/host:cdn.example.com" \
  -H "Authorization: Bearer $TOKEN" \
  -H 'x-platform: openresty-admin-next' \
  -H 'Content-Type: application/json' \
  -d '{
    "dns_record_type": "CNAME",
    "dns_cname_target": "edge.wslproxy.com"
  }'
```

**Claude / MCP:**

```
You: For server host:api.example.com, set the POPs to pop0 and lon1
     and publish both A and AAAA records.

Claude: [calls update_server with pop_ids=["pop0","lon1"],
         dns_record_type="BOTH"]
        Done.  api.example.com is now served by pop0 + lon1, dual-stack.

You: For host:cdn.example.com, point it at edge.wslproxy.com via CNAME.

Claude: [calls update_server with dns_record_type="CNAME",
         dns_cname_target="edge.wslproxy.com"]
        Done.  cdn.example.com is now a CNAME alias for edge.wslproxy.com.
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
          - CREATE A api.example.com → 195.20.255.201    (pop=lon1)
        Should I apply these?

You: yes

Claude: [calls provision_dns with dry_run=false]
        Applied:
          - Created A record api.example.com → 187.124.112.155
          - Created A record api.example.com → 195.20.255.201
        Both records are now live in Cloudflare.

You: What DNS records exist for api.example.com right now?

Claude: [calls lookup_dns]
        Cloudflare has 2 A records:
          - 187.124.112.155  (managed by wslproxy, pop=pop0)
          - 195.20.255.201    (managed by wslproxy, pop=lon1)
        No hand-curated records.
```

For a full tour of the MCP setup (Claude Desktop, Claude Code, Cursor, Continue.dev, custom clients), see **[api/mcp/README.md](api/mcp/README.md)**.

---

## 7. Day-to-day operations

Once everything's set up, here's the rhythm operators repeat.  Every action follows the same shape: **edit → save → provision → apply.**  The "save" is local; the "apply" is the Cloudflare write.

| You want to… | What you click | What Cloudflare sees |
|---|---|---|
| **Add a new POP to a domain** | Tick another POP on the server form → Save → Preview & Provision → Apply | One new A (or AAAA) record |
| **Remove a POP from a domain** | Untick it on the server form → Save → Preview & Provision → Apply | One DELETE on the orphaned record |
| **Replace a POP's IP** | Edit the POP record's `public_ipv4` → Save → re-Provision on every domain that uses it | One UPDATE per affected domain |
| **Drain a POP for maintenance** | `/pops/<id>` → set status to "maintenance" → Save → re-Provision on each domain | One DELETE per affected domain (records come back when you flip status to active and re-provision) |
| **Switch a domain from A to BOTH** | Server form → DNS Record Type → BOTH → Save → Preview & Provision → Apply | New AAAA records created alongside the existing A records |
| **Switch a domain from A to CNAME** | Server form → DNS Record Type → CNAME + set target → Save → Preview & Provision → Apply | All A records deleted (orphaned), one CNAME created.  Because CNAME can't coexist with A at the same name, the orchestrator cleans up its old A records automatically. |
| **Add a new POP to your fleet** | `/pops` → + Create POP → Save | Nothing.  The new POP is just sitting in the inventory until a server adds it to its `pop_ids`. |
| **Audit "what records does wslproxy own?"** | Open server → DNS State panel.  Each row says "managed by wslproxy" or "external". | Nothing.  Read-only. |

### A few useful Claude prompts

Once Claude is connected via MCP ([api/mcp/README.md](api/mcp/README.md)):

> *"Show me which POPs are currently active."*
> *"Drain `lon1` for maintenance."*
> *"What does Cloudflare currently have for `api.example.com`?"*
> *"Add `pop2` in Frankfurt with IP 1.2.3.4 then provision DNS for `api.example.com` using all three POPs."*
> *"Switch `cdn.example.com` to CNAME mode pointing at `edge.wslproxy.com`."*

Claude will always **show you the action plan and wait for your "yes"** before writing to Cloudflare.  The `provision_dns` tool defaults to dry-run; the apply pass needs an explicit confirmation.

---

## 8. Safety guarantees

The DNS provisioner has five hard guardrails:

1. **`managed_zones` allowlist.**  Domains outside the allowlist are refused before any HTTP call to Cloudflare.  Even if the token has "All zones" access, only the zones you list can be touched.
2. **`wslproxy-managed` comment marker.**  wslproxy only modifies or deletes records carrying this comment.  Hand-curated records with no marker are **never touched** — even if their names collide with a desired record.
3. **Down / maintenance POPs are skipped by default.**  Their A records are NOT created, even if they're in the server's `pop_ids`.  Pass `include_inactive: true` to override.
4. **`dry_run: true` is the default for MCP `provision_dns`.**  An AI agent always sees the plan first; applying requires an explicit `dry_run: false` follow-up.
5. **POP deletion refuses while in use.**  Deleting a POP that's referenced by any server returns `409` with the list of referencing servers.  Pass `force: true` to cascade-detach — and even then, if **any** server can't be safely rewritten, the whole delete aborts (no dangling pop_ids left behind).

---

## 9. Troubleshooting

### "DNS provisioning is not configured" in the panel
You haven't added the `dns` block to `settings.json` yet.  Go back to [step 3.3](#33-add-the-dns-block-to-settingsjson).

### "Replace the placeholder zone in settings.json"
Your `managed_zones[0].zone_id` is `00000000000000000000000000000000` (a placeholder we use during testing).  Replace it with the real zone_id from [step 3.2](#32-find-your-zone-id).

### "No managed zone covers \<domain\>"
The domain you're trying to provision is not under any of the zones in your `managed_zones` allowlist.  Either:
- Add the parent zone to `managed_zones` (with its zone_id), or
- Pick a different domain that IS under an allowed zone.

### "CNAME target not set" in the DNS State panel
You picked **CNAME** for `dns_record_type` but the **CNAME target** input is empty.  Scroll up to the DNS Record Type card on the server form and fill in the target hostname (e.g. `edge.wslproxy.com`).

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

## 10. FAQ

**Q: Can I have multiple Cloudflare accounts / multiple providers?**
Yes.  `providers[]` is an array — add a second entry with a different token + different `managed_zones`.  Each provider has its own allowlist.

**Q: What about AAAA (IPv6) records?**
Supported.  On the server form, pick the **DNS Record Type** card and choose **AAAA** (or **BOTH** for dual-stack).  AAAA mode publishes one record per active POP using its `public_ipv6` field; POPs without v6 set get skipped with reason `no_public_ipv6` so you can see at a glance which need configuring.  Set each POP's `public_ipv6` either via the `/pops` dashboard or by setting the field in `data/pops/<id>.json`.

**Q: What about CNAME records?**
Supported.  Pick **CNAME** on the DNS Record Type card and fill in the **CNAME target** field — the hostname your domain should point at (e.g. `edge.wslproxy.com`).  CNAME mode publishes ONE record (not per-POP) and ignores `pop_ids`.  Note that the DNS spec forbids CNAME from coexisting with A/AAAA at the same name; the provisioner will clean up any old A/AAAA records it owns when you switch to CNAME (records you curated by hand outside wslproxy are left alone, as always).

**Q: When should I use BOTH vs A vs AAAA?**
- **A** (default): every POP has IPv4, you don't need v6 yet, no client requests AAAA.
- **AAAA**: pure v6 environment (rare for public-facing services, common for internal/eyeball clouds).
- **BOTH**: dual-stack — you want v4 and v6 clients to both reach the POP closest to them.  POPs without v6 still get an A record; the AAAA pass just skips them.
- **CNAME**: the domain is an alias for another hostname that already has the right records (e.g. a wholesale CDN endpoint, a managed-service hostname).  CNAME mode is incompatible with multi-POP routing on the same name.

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
