# Prompt: add a proxied domain to wslproxy

Paste into Claude Code from the wslproxy repo root, filling in the
placeholders. Claude uses the `wslproxy-add-domain` skill
(`.claude/skills/wslproxy-add-domain/`), which wraps
`scripts/add_domain.py`. You can also invoke it directly with
`/wslproxy-add-domain`.

---

```text
Add a new proxied domain to the wslproxy edge, exactly like
dockpilot.workstation.co.uk and promptpilot.workstation.co.uk.

- Domain:   <app>.workstation.co.uk
- Backend:  <LAN host>:<port> (the app on the office network)
            → expose via office public IP 193.237.176.232:<18xxx port-forward>
- Template: dockpilot.workstation.co.uk (clone SSL / HTTPS settings)
- POPs:     lon1 (live) and lon2/pop0 (mirror)

Use the wslproxy-add-domain skill:
1. Dry-run add_domain.py first. If lon1 can't reach the backend, stop and
   tell me which router port-forward to create — don't use a LAN IP as the
   origin, the POPs can't route to 192.168.x.
2. Show me the plan (rule name/id, backend, pop_ids), then run all steps:
   lon1 install + reload, HTTPS verify, lon2 mirror check, import into
   cp.pop0.uk with the same ids, and the Cloudflare record copied from
   dockpilot.workstation.co.uk if ~/.config/cloudflare/token exists.
3. Dispatch the "Sync POP config from CP" workflow for lon1 then pop0 and
   give me the PR links to approve (don't bypass branch protection).
4. Report the URL, what changed where, and anything that needs my action.

Credentials are in ~/.config/wslproxy/cp.env (CP_API_USER / CP_API_PASSWD)
and ~/.config/cloudflare/token — never print them.
```

---

## Several domains in one go

```text
Using the wslproxy-add-domain skill, add these domains one at a time
(dry-run each first, stop on the first failure, single CP→git sync at the end):

| Domain | Backend (public IP:port) |
|--------|--------------------------|
| <a>.workstation.co.uk | 193.237.176.232:<port> |
| <b>.workstation.co.uk | 193.237.176.232:<port> |
```

## Before you run it

- Router: forward `193.237.176.232:<18xxx>` → `<LAN host>:<8xxx>`. Check it
  from lon1: `ssh root@195.20.255.201 curl -sI http://193.237.176.232:<18xxx>/`.
- The app gets a public URL. Put auth in front of anything that shows
  internal data (PromptPilot uses HTTP basic auth via `promptpilot.auth`).
- One-time files (chmod 600): `~/.config/wslproxy/cp.env`, and optionally
  `~/.config/cloudflare/token` (Zone:Read + DNS:Edit).
