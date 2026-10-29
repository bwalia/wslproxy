# Bot Defense and invalid-traffic (IVT) classification

wslproxy's own bot management. It runs at the edge, inside the gateway, with
**no external service, no third-party script and no paid feed**. Each server
opts in on its own.

Code: `api/bot_defense/`. Operations: `docs/runbooks/bot-defense.md`. Live
demo: `examples/wslproxy-bot-demo/`.

## How it decides

```
request ─► fingerprint ─┐
           identity  ───┼─► score (0–100) ─► class + IVT tier ─► action ─► origin
           behaviour ───┘                                         │
                                                                  └─► X-WSL-Bot-* headers
```

Each request on a protected server is checked in three ways:

1. **Fingerprint** (`signals.lua`) looks at what the request claims and
   whether the rest of it agrees.
   - It flags tool User-Agents (curl, python-requests, Go, …), scanners and
     headless browsers.
   - If the User-Agent claims to be a browser, the headers must match. A real
     Chrome, Firefox or Safari always sends `Accept`, `Accept-Language` and
     `Accept-Encoding`. Over HTTPS it also sends `Sec-Fetch-*`, and Chromium
     sends `Sec-CH-UA`. A script that copies a browser User-Agent rarely
     copies those.
2. **Identity**
   - `crawlers.lua` checks a client claiming to be Google, Bing, Apple,
     Yandex or Baidu. Its IP's PTR record must sit under that engine's
     domain, and that name must resolve back to the same IP. This is the
     method those engines document. Real crawlers are **verified and
     allowed**; impostors are caught.
   - `datacenter.lua` matches client IPs against hosting and cloud ranges.
3. **Behaviour** (`behaviour.lua`) counts, in a shared dict, what this IP and
   this visitor have been doing across every worker:
   - bursts
   - distinct pages per minute (scraping)
   - 401/403/404/405 storms (scanning, enumeration, carding)
   - login attempts (credential stuffing)
   - never returning the session cookie
   - loading pages but never their CSS, JS or images

The **score** is the sum of the raised signals' weights, capped at 100.

**Classes**

| Class | When |
|---|---|
| `human` | score below `challenge` (default 40) |
| `suspect` | score from `challenge` |
| `bot` | score from `block` (default 80) |
| `verified_bot` | a DNS-verified search crawler |

**IVT tier** (MRC split), forwarded to the origin as `X-WSL-Bot-IVT`:

| Tier | Meaning |
|---|---|
| `none` | valid traffic |
| `givt` | **general** invalid traffic, found by lists and routine filtration: declared bots and tools, data-centre IPs, verified crawlers |
| `sivt` | **sophisticated** invalid traffic, found only by analysis: spoofed browsers, headless automation, impersonated crawlers, abnormal behaviour |

**Actions**

| Mode | Suspect | Bot |
|---|---|---|
| `monitor` | allow, score | allow, score |
| `challenge` | browser check | 403 |
| `block` | 403 | 403 |

- Page navigations get an HTML page (challenge or block). API and asset
  requests get JSON (`bot_challenge_required` / `automated_traffic_blocked`)
  with a support id.
- Per path, overriding the mode:

  | Setting | Effect |
  |---|---|
  | `challenge_paths` | always require a passed check |
  | `monitor_paths` | score and forward, never act |
  | `skip_paths` | not seen at all |

  ACME challenges are always skipped.

## The browser check

The challenge page is served by the edge. Its inline script does three things:

1. A **proof of work**: it finds `n` where `sha256(token:n)` starts with 16
   zero bits. That is about 65k hashes, roughly 0.15–0.3 s in a browser.
2. It reports `navigator.webdriver`.
3. It POSTs both to `/__wsl/bot/verify`.

The server checks the work with a single hash. A solved check sets the
`wsl_bd` cookie for `passed_ttl_s`. Several layers protect it:

- Token and cookie are **HMAC-signed**, with a constant-time compare.
- Both are **bound** to the client's IP prefix (/24, /64) and User-Agent, so
  they cannot be handed to another bot.
- Tokens are **single-use** (replay guard in the shared dict) and expire after
  `challenge_ttl_s`.
- Any client reporting `navigator.webdriver = true` (an automation framework)
  is refused.
- The return URL is same-site only; it cannot become an open redirect.
- After a pass, fingerprint signals are waived; the client proved it runs a
  real browser engine. **Behaviour still counts**: a farm that solves the
  check and then hammers the login is still stopped.

## Configuration

### Per server — `bot_defense` in the server JSON (admin UI: WAF tab)

```json
"bot_defense": {
  "mode": "challenge",
  "thresholds": { "challenge": 40, "block": 80 },
  "challenge_paths": ["/checkout"],
  "login_paths": ["/api/login"],
  "monitor_paths": ["/ad/"],
  "skip_paths": ["/webhooks/"],
  "allow_verified_bots": true,
  "forward_headers": true,
  "response_headers": false,
  "limits": {
    "burst_per_10s": 40, "distinct_paths_per_min": 40, "errors_per_min": 20,
    "logins_per_5min": 6, "cookieless_requests": 3, "pages_without_assets": 12
  }
}
```

- Read per request: no reload needed, and `"mode": "off"` is the kill switch.
- In path lists, a trailing `/` or `*` makes an entry a prefix; anything else
  matches exactly.
- `response_headers` exposes the verdict to the client. Use it for debugging
  and demos only, because it helps bots tune themselves.
- The admin API rejects invalid values on save.

### Edge-wide — `bot_defense` in `settings.json` (optional, hot-reloaded)

| Key | Default | Notes |
|---|---|---|
| `secret` | derived | HMAC key. If unset, derived from `env_vars.JWT_SECURITY_PASSPHRASE`; if that is missing too, a random per-host key (sessions then do not carry between edges). **Every edge serving the same hosts must end up with the same key.** |
| `pow_difficulty` | 16 | Leading zero bits, 8–24. Each +1 doubles the work. |
| `challenge_ttl_s` / `passed_ttl_s` / `session_ttl_s` | 120 / 1800 / 1800 | |
| `datacenter_cidrs` | — | Inline CIDR list. |
| `datacenter_file` | — | One CIDR per line. Build it with `scripts/bot-defense-datacenter-ranges.sh` (AWS, GCP, Oracle and DigitalOcean's own published lists, about 21k ranges, about 1 µs per lookup). |
| `dns_nameservers` | `/etc/resolv.conf` | For crawler verification. |
| `dns_timeout_ms` | 500 | |
| `ip_binding` | `prefix` | `prefix` (/24, /64), `exact` or `none`. |
| `weights` | built-in | Per-signal override, e.g. `{"BD_DATACENTER": 10}`. |
| `cookie_name` | `wsl_bd` | |
| `reload_interval_s` | 30 | Read once at start. |

The edge needs `lua_shared_dict wsl_bot_defense 20m;`; both nginx templates
declare it. Without it, fingerprint scoring still runs, but behaviour
signals, crawler verification and replay protection are off, and a warning is
logged.

### Admin UI — the Bot Management section

The sidebar's **Bot Management** section has four pages, backed by
`api/bot_defense/admin.lua` behind the usual admin JWT:

| Page | What it does | Endpoint |
|---|---|---|
| Overview | Engine status (key source, never the key), last-24 h totals, requests per hour by class, every server with an inline mode switch | `GET /api/bot_defense/overview?envprofile=` |
| Events | Live decision feed with filters; find a user's Support ID here | `GET /api/bot_defense/events?host=&class=&action=&type=&limit=` |
| Settings & signals | The editable edge-wide keys above, and every signal's weight | `GET` / `PUT /api/bot_defense/settings` |
| Simulator | Scores a described request with the live fingerprint and identity code. Nothing is sent to the site and no counters move | `POST /api/bot_defense/evaluate` |

A server's full policy (paths, thresholds, limits) stays on its WAF tab. The
overview links there (`/servers/<id>?tab=waf`).

- **Saving a server's mode** (`PUT /api/bot_defense/servers/<id>?envprofile=`):
  - The record is written exactly as stored. Only `bot_defense` changes.
  - A version snapshot and an audit entry are made, as for any server save.
  - It is refused when the admin instance does not allow mutations (403),
    when the policy is invalid (422), or when `envprofile` is malformed (400).
    A malformed env is never treated as prod.
- **Settings saved here** go to `data/bot_defense/settings.json` and override
  `settings.bot_defense` for these keys only: `pow_difficulty`,
  `challenge_ttl_s`, `passed_ttl_s`, `session_ttl_s`, `ip_binding`,
  `weights`, `datacenter_cidrs`, `datacenter_file`, `dns_nameservers` and
  `dns_timeout_ms`.
  - The key, the cookie name and the dict name are refused. They stay in SOPS.
  - The file is applied by every worker within `reload_interval_s`.
  - **It is per edge.** Deploys do not touch it, and edge-sync does not copy
    it. Set it on lon1 and pop0 alike, or put shared values in SOPS.
- **Events and hourly counters** live in the edge's shared dict:
  - the last 500 events, kept for 24 h
  - the counters, kept for 26 h

  Each edge shows its own, and a restart clears them. Prometheus is the
  durable record.

## Signals

| Signal | Kind | IVT | Weight |
|---|---|---|---|
| `BD_UA_MISSING` | fingerprint | givt | 40 |
| `BD_UA_AUTOMATION` | fingerprint | givt | 35 |
| `BD_UA_SCANNER` | fingerprint | givt | 90 |
| `BD_UA_DECLARED_BOT` | fingerprint | givt | 30 |
| `BD_UA_HEADLESS` | fingerprint | sivt | 70 |
| `BD_BROWSER_NO_ACCEPT` / `_NO_LANGUAGE` / `_NO_ENCODING` | fingerprint | sivt | 15 / 20 / 15 |
| `BD_BROWSER_NO_HINTS` / `_NO_FETCH_META` (HTTPS only) | fingerprint | sivt | 15 / 15 |
| `BD_OLD_PROTOCOL` | fingerprint | sivt | 15 |
| `BD_FAKE_CRAWLER` | identity | sivt | 90 |
| `BD_DATACENTER` | identity | givt | 25 |
| `BD_BURST` | behaviour | sivt | 30 |
| `BD_SCRAPING` | behaviour | sivt | 35 |
| `BD_ERROR_STORM` | behaviour | sivt | 30 |
| `BD_LOGIN_VELOCITY` | behaviour | sivt | 50 |
| `BD_NO_COOKIE` | behaviour | sivt | 25 |
| `BD_NO_ASSETS` | behaviour | sivt | 20 |

A single tool request scores 35, so it is allowed but labelled `givt`. A tool
that also drops cookies or scrapes crosses 40 within a few requests. That
graduation is deliberate, so one `curl` is not a block.

## What the origin receives

With `forward_headers` on (the default):

| Header | Content |
|---|---|
| `X-WSL-Bot-Class` | the class |
| `X-WSL-Bot-Score` | the score |
| `X-WSL-Bot-IVT` | the IVT tier |
| `X-WSL-Bot-Signals` | the raised signals |

Client-sent copies of these headers are **always stripped**, on every
request to a protected server, skip paths included. This is how an app filters
traffic it does not want to block, for example billing only ad impressions
with `X-WSL-Bot-IVT: none`. The demo's ad scenario shows exactly that.

## Failure behaviour

| Failure | Result |
|---|---|
| Any internal error | Request proceeds; logged (rate-limited) and counted in `wslproxy_bot_errors_total` |
| DNS failure during crawler verification | `unknown`, scored as a declared bot (30), never as `fake` |
| Missing shared dict | Fingerprint only (see above) |
| Bad `settings.bot_defense` values | Defaults, with a warning |
| Missing or unreadable `settings.json` | Keeps the current config |
| Plain HTTP to a force-HTTPS server | Scored but never acted on; the 301 goes out and the HTTPS request gets the real check |

With no server using `bot_defense`, responses are byte-identical to before.
This was verified against `main` across 17 requests, covering cache hits, the
force-HTTPS redirect, the no-server page and the captcha POST.

## Observability

| Metric | Labels |
|---|---|
| `wslproxy_bot_requests_total` | `class`, `ivt`, `action` |
| `wslproxy_bot_signals_total` | `signal` |
| `wslproxy_bot_challenges_total` | `result`: `passed`, `insufficient_work`, `rebound`, `replay`, `webdriver`, `expired`, `bad_token`, `bad_request` |
| `wslproxy_bot_crawler_checks_total` | `result`: `verified`, `fake`, `unknown` |
| `wslproxy_bot_errors_total` | `phase` |

There is also one `botdef {...}` JSON log line per suspicious visitor per
minute, carrying host, IP, URI, User-Agent, class, IVT, score, action,
signals, status and support id. The same entry goes to the Bot Events feed.

## Honest scope

This is a rules-and-behaviour engine, and nothing leaves the edge. It reliably
stops:

- commodity automation: HTTP libraries, scanners, headless browsers
- browser impersonation
- crawler impersonation
- scraping, credential stuffing, carding and scalping from a single source

What large commercial bot managers add on top:

- machine-learning models trained across many customers' traffic
- shared threat intelligence (known bot IPs, residential-proxy networks)
- TLS/HTTP2 fingerprinting (JA3/JA4)
- mobile-SDK attestation
- captcha-farm detection

A determined attacker driving real browsers through residential proxies can
pass a proof-of-work check. Rate and behaviour limits still bound what they
can do from any one IP or session.

Natural next steps, all doable natively:
- JA4 fingerprinting in `ssl_client_hello_by_lua`
- header-order fingerprinting
- per-ASN aggregation
- a shared IP reputation across edges, through the control plane
