---
name: wslproxy-vpn-only-hosts
description: >-
  Make selected hosts of a domain reachable only over the VPN / home LAN
  (everyone else gets 403 "VPN required") using a wslproxy access profile.
  Use when the user asks to "lock int/test to the VPN", "make preprod
  VPN-only", "restrict <host> to home IP", or attach/create an
  `access_profile` for a vhost.
---

# VPN-only hosts with access profiles

Selected vhosts answer only to allowed source ranges; everyone else gets
the built-in 403 "VPN required" page. Use the mechanism that already exists,
the **access profile** (`api/access_profile.lua`, `docs/VPN_ACCESS.md`).
Don't invent a new one. No hand-written allow/deny rules, no nginx
`allow/deny`, no private DNS.

## 1. Ask first (do not assume)

Ask for all of these in one message. Leave out any you can already read from disk or the repo.

1. **Base domain**, e.g. `example.com`.
2. **Which hosts** must be VPN-only. If the user says "preprod", that means `int.<domain>` and
   `test.<domain>`. Acc and prod stay public unless the user says otherwise.
3. **Profile name.** Reuse an existing one if it fits (JobShout uses
   `jobshout-preprod`). Otherwise propose `<product>-preprod`.
4. **Allowed CIDR(s)**, as the edge sees them: the public/home IP that
   WireGuard NATs to, usually `<ip>/32`. If unknown, read the existing
   profile (`data/access_profiles/prod/*.json`, the app repo's
   `deploy/edge/access-profiles/prod/`, or the live edge) before guessing.
   Never invent an IP.
5. **Origin URL** that allowed requests are proxied to. Use the same backend
   the vhost's current rule uses. It must be explicit. Without it the allow
   rule falls back to the server's `proxy_pass`, which is often
   `http://localhost`.
6. **Where the profile lives.** wslproxy reads profiles from disk only:
   `/opt/nginx/data/access_profiles/prod/<name>.json` on each edge, with
   the in-repo copy beside the app's edge specs (e.g.
   `deploy/edge/access-profiles/prod/<name>.json`) or in this repo under
   `data/access_profiles/prod/`.
7. **Confirm** that DNS stays public, and that `/.well-known/acme-challenge/` stays
   reachable without VPN. It does by design: ACME has its own nginx
   `location` that never runs the rule gateway, so a profile on `/` cannot
   block it. Don't add anything that would change this.

## 2. How it works (facts to rely on)

- On each VPN-only vhost (`host:<fqdn>.json`), set
  `"access_profile": "<name>"`. That field is the only change.
- At load time the profile expands into an allow/deny pair per endpoint:
  `allow` = path + `cidr` match → 305 to `origin`; `deny` = path → 403.
  Base priority is 1000, so the pair outranks the vhost's own rules.
- Profile shape (`docs/VPN_ACCESS.md` § Fields has the full list):

  ```json
  {
    "name": "<profile-name>",
    "allow_cidrs": "<ip>/32",
    "origin": "http://<backend-host>:<port>",
    "endpoints": [{ "path": "/", "path_key": "starts_with" }]
  }
  ```

  `name` must equal the filename. `allow_cidrs` accepts a comma-separated
  list, and it is IPv4 only.
- **It fails closed.** If the profile is missing or invalid, every request to that
  host gets 403, and the edge logs
  `access_profile failed, denying all requests for <host>`.
- **Install order matters.** Put the profile on the edges **before** any vhost
  references it.
- **Edge-sync does not copy profiles.** `infra/edge-sync/` mirrors
  `servers/ rules/ waf_policies/ secrets/` from lon1 to pop0, but not
  `access_profiles/`. A vhost change on lon1 reaches pop0 within 5 minutes. If the
  profile isn't already on pop0, pop0 then denies everything. Install the
  profile on **every** edge that serves the host: lon1
  (`root@195.20.255.201`) and pop0 (`administrator@85.190.106.189`).
- The real client IP must already be correct (`data/real_ip/`). Check it with
  `curl -sI https://<host>/ | grep -i x-origin-ip`.

Reference implementation (JobShout monorepo, `jobshout-com/`):
`deploy/edge/wslproxy-server-int.json`, `deploy/edge/wslproxy-server-test.json`,
`deploy/edge/access-profiles/prod/jobshout-preprod.json`, and
`deploy/edge/README.md` § "int and test are VPN / home-LAN only".

## 3. Do it (once the answers are in)

1. **Profile.** Create the profile in the repo, or update it there. Validate it with
   `python3 -m json.tool <file>`.
2. **Vhost specs.** Add `"access_profile": "<name>"` to each VPN-only host
   spec. Keep the existing `rules`, `match_cases`, `pop_ids` and SSL fields. Don't touch
   public hosts.
3. **Never** put credentials in the profile or spec. Don't restrict ACME
   paths, and don't make DNS private.
4. **Apply on the edges, profile first:**

   ```bash
   for h in root@195.20.255.201 administrator@85.190.106.189; do
     scp <name>.json "$h:/tmp/<name>.json"
     ssh "$h" 'sudo install -D -m 0644 /tmp/<name>.json \
       /opt/nginx/data/access_profiles/prod/<name>.json && rm /tmp/<name>.json'
   done
   ```

   Then push the vhost change the way that domain is normally managed: the app repo's
   import workflow (`POST /api/projects/import`, which keeps ids), the admin
   UI/API on lon1, or the `wslproxy-add-domain` skill. Never edit pop0's
   servers directly, because edge-sync reverts them. Neither rules nor profiles need a reload.
5. **Show the diffs** for the profile and every spec you touched.

## 4. Verify

```bash
# From VPN / home LAN: expect 200/3xx and X-WSL-VPN: allowed
curl -sI https://int.<domain>/ | grep -iE '^(HTTP|x-wsl-vpn|x-origin-ip)'

# From public (phone off Wi-Fi, or a GitHub ubuntu-latest runner):
# expect 403, X-WSL-VPN: blocked, X-WSL-VPN-Reason: client-ip-not-allowed
curl -sI https://int.<domain>/ | grep -iE '^(HTTP|x-wsl-vpn)'

# ACME still public (404 for a made-up token is fine; 403 is not)
curl -so /dev/null -w '%{http_code}\n' http://int.<domain>/.well-known/acme-challenge/x

# Public hosts unaffected: no X-WSL-VPN header at all
curl -sI https://<domain>/ | grep -ic x-wsl-vpn   # 0
```

Check both edges. `curl --resolve int.<domain>:443:<edge-ip> ...` sends the request to one edge.
`X-WSL-VPN-Reason: profile-load-failed` means the profile is missing on
that edge.

Health probes or smoke tests that run on hosted runners and expect 200 from
these hosts **will now fail**. That is expected. Tell the user, and point those
checks at a public host or a self-hosted runner on the LAN.

## 5. Warn about the limits

- **Dynamic home IP.** If the ISP changes the address in `allow_cidrs`, the user is
  locked out until the profile is updated on every edge.
- **A residential IP allows the whole LAN.** Every device behind that NAT gets in,
  VPN or not.
- **Bypass via the origin.** If the origin port-forward
  (e.g. `193.237.176.232:18xxx`) is open to the world, anyone can skip the edge
  and the profile with it. Restrict the forward to the edge IPs.
- This is a network boundary, not identity. For per-user access, add
  `groups` to the endpoints (`docs/VPN_ACCESS.md` § Per-user access).

## Output

- Any questions still unanswered, as a short checklist
- Diffs for the profile and the specs
- The exact scp/API steps per edge, profile first
- The verification commands for the VPN-only hosts and the public ones
