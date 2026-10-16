# Prompt: Redirect browser (non-API) traffic on vault.workstation.co.uk → vault-ui

Paste into Claude Code from the **wslproxy** repo root. Goal: humans hitting
the Vault API host in a browser land on the Vault UI host; API clients keep
talking to `vault.workstation.co.uk`.

---

```text
Implement a wslproxy redirect rule so browser / non-API requests to
https://vault.workstation.co.uk/ permanently redirect to
https://vault-ui.workstation.co.uk/ (preserve path + query when possible).

## Why
- Vault UI lives at https://vault-ui.workstation.co.uk/ (Next.js / SPA, HTML 200).
- Vault API host is https://vault.workstation.co.uk/ (WSLVault HTTP API).
- Today both hosts share the same 305 rule `wslvault-region-a-cloud001`
  (backend http://72.62.211.28). Browser GET https://vault.workstation.co.uk/
  returns 404 from the API origin — bad UX for demos and bookmarks.
- hello-java / WSLVault docs link humans to the Vault UI; API clients and
  agents must keep using vault.workstation.co.uk for /v1/… (and any other
  real API prefixes).

## Current edge facts (verify before changing)
- Server: data/servers/prod/host:vault.workstation.co.uk.json
  rules: ["wslvault-region-a-cloud001"]
- Server: data/servers/prod/host:vault-ui.workstation.co.uk.json
  rules: ["wslvault-region-a-cloud001"]
- Rule: data/rules/prod/wslvault-region-a-cloud001.json
  code 305, path "/" starts_with, servers include vault + vault-ui (+ vault-a)
- Live: GET vault.workstation.co.uk/ → 404; GET vault-ui → 200 HTML;
  GET vault.workstation.co.uk/v1/sys/health → 401 (API reachable)
- gateway_resp.lua: code 301/302 call ngx.redirect(selectedRule.redirectUri)
  with the URI as-is (does NOT append request_uri today).

## Desired behaviour
On Host: vault.workstation.co.uk only:

1. **API / machine traffic — keep proxying (305)** to the existing WSLVault
   backend (same as wslvault-region-a-cloud001):
   - Paths that must NOT redirect, at minimum:
     - `/v1` (and everything under it) — primary Vault HTTP API
     - `/.well-known/acme-challenge/` — LE renewal (already special-cased
       for HTTP→HTTPS; do not break it)
   - Prefer matching by path prefix, not User-Agent sniffing. Optional extra
     signal: `Accept: application/json` may stay on API host, but path rules
     are the source of truth.

2. **Browser / non-API traffic — 301 to Vault UI**:
   - `https://vault.workstation.co.uk/` → `https://vault-ui.workstation.co.uk/`
   - Prefer preserving path + query:
     `https://vault.workstation.co.uk/<path>?<query>`
     → `https://vault-ui.workstation.co.uk/<path>?<query>`
   - If the engine cannot preserve path yet (redirectUri is literal), either:
     a) implement a small, explicit enhancement (e.g. `redirect_preserve_uri:
        true` or `redirect_uri` hosting only the scheme+host and appending
        `ngx.var.request_uri`), with a regression test in QA/08_uri_redirect_test.go,
        OR
     b) ship a `/` (and any known UI entry paths) 301 to vault-ui root first,
        document the limitation, and follow up with (a).

3. **Do not** attach the redirect rule to vault-ui.workstation.co.uk (avoid loops).
4. **Do not** change vault-ui’s own 305 backend unless required for the split.
5. Priority: API proxy rules must win over the catch-all browser redirect
   (higher priority and/or longer `starts_with` path specificity for `/v1`).

## Suggested rule shape (adjust to real schema / admin API)
- New rule id/name e.g. `vault-workstation-browser-to-vault-ui`
- profile_id: prod
- servers: ["host:vault.workstation.co.uk"] only
- match.rules: path `/` starts_with (or narrower if you split UI paths)
- match.response: code 301, redirect_uri `https://vault-ui.workstation.co.uk`
  (+ preserve-uri flag if you add it)
- Keep / tighten `wslvault-region-a-cloud001` (or a sibling) for `/v1`
  starts_with → 305 to http://72.62.211.28 (or current backends array)
- Wire the new rule into host:vault.workstation.co.uk `rules` list
- Mirror to pop0 / lon1 per normal CP→POP sync; do not bypass branch protection

## Acceptance tests
```bash
# Browser-ish: must 301 to vault-ui (follow Location host)
curl -sSI https://vault.workstation.co.uk/ | rg -i 'HTTP/|location:'
# expect 301 and Location: https://vault-ui.workstation.co.uk/  (or …/<path>)

curl -sSI -H 'Accept: text/html' https://vault.workstation.co.uk/ | rg -i 'HTTP/|location:'

# API: must NOT redirect — stay on vault host / proxy to API
curl -sSI https://vault.workstation.co.uk/v1/sys/health | rg -i 'HTTP/|location:|x-wsl-rule'
# expect 401/200/503 from API path, Location must not be vault-ui

# UI host still serves HTML
curl -sSI https://vault-ui.workstation.co.uk/ | rg -i 'HTTP/|content-type'

# No redirect loop
curl -sSI -L --max-redirs 3 https://vault.workstation.co.uk/ | rg -i 'HTTP/|location:'
```

## Out of scope
- Changing WSLVault application code
- Moving the API to another hostname
- hello-java deploy (callers should already use vault-ui for human links;
  API addr remains vault.workstation.co.uk)

## Deliver
1. Rule + server JSON (and any gateway_resp enhancement) with a short PR
2. Live verify on pop0 / lon1 after sync
3. Report: rule ids, priority order, curl evidence for browser 301 vs /v1 no-redirect
```

---

## One-liner for chat

```text
On wslproxy: add a prod 301 rule so non-API browser hits on
vault.workstation.co.uk redirect to vault-ui.workstation.co.uk (preserve
path/query if possible), while /v1/* keeps the existing 305 WSLVault proxy.
Do not attach the redirect to vault-ui. See
docs/prompts/vault-host-browser-redirect-to-vault-ui.md.
```
