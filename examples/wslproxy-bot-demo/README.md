# wslproxy Bot Defense & IVT demo — before / after

The bot-management companion to the [WAF demo](../wslproxy-waf-demo/). A small
shop, **Acme Shop**, has exactly what bots attack: a catalogue to scrape, a
login to credential-stuff, limited stock to scalp, paid ad impressions to fake,
gift cards to crack, and a checkout. It sits behind two hostnames:

```
                          ┌───────────────────────── same origin ─────────────────────────┐
 bots-open.…     ───►  wslproxy (lon1 edge)   ──►  Acme Shop (k3s1, cloud001, NodePort 30088)
  (no protection)        proxy only
 bots-secure.…   ───►  wslproxy (lon1 edge)   ──►  Acme Shop
  (Bot Defense)          bot_defense: challenge mode
```

The two hosts differ only in the server's `bot_defense` block, so every
before/after pair compares like with like. Bot Defense is native to wslproxy:
no external service, no third-party script, no paid feed (see
[docs/bot-defense.md](../../docs/bot-defense.md)).

## Live hosts

| Host | Bot Defense | Role |
|------|-------------|------|
| https://bots-open.fictionally.org   | off       | BEFORE — every attack succeeds |
| https://bots-secure.fictionally.org | challenge | AFTER — attacks stopped, people unaffected |

## The lab — `/lab` on both hosts

The lab is a browser page that runs every attack and shows the result:

- how many requests were allowed, challenged or blocked
- each request's verdict (class, score, IVT tier, action, signals)
- the **business impact** on the shop: prices harvested, accounts taken over,
  consoles hoarded, impressions billed, gift cards cracked

**Run all** fires everything; each row can also be fired alone. Two buttons
check the human side:

- **Test me (real browser)** — your own browsing is classed `human` and never
  stopped.
- **Open checkout** — on the protected host you get the browser check, which
  passes in well under a second, then the checkout.

**Why a server-side runner.** A browser cannot pose as a bot: scripts may not
set `User-Agent`, drop cookies or forge headers. So `/lab/run` on the shop
fires each scripted attack itself, at the host it was called on, through the
edge, and reports what came back. It only targets hosts in
`BOT_DEMO_TARGETS`, runs one scenario at a time, and is rate-limited.

## The attacks

| Scenario | IVT | How Bot Defense catches it | Open host | Secure host |
|---|---|---|---|---|
| Catalogue scraper (python-requests) | GIVT | tool User-Agent, never keeps the cookie | 30/30 pages, 240 prices | stopped from the 4th request |
| Price scraper posing as Chrome | SIVT | Chrome UA without Chrome's headers, drops cookies | 30/30 | challenged / blocked |
| Headless Chrome | SIVT | `HeadlessChrome`; the check also refuses `navigator.webdriver` | 8/8 | blocked |
| Fake Googlebot | SIVT | reverse + forward DNS — its IP is not Google's (real Googlebot is verified and allowed) | 10/10 | blocked |
| Credential stuffing | SIVT | perfect browser headers — caught by behaviour alone (login velocity) | **1 account taken over** | stopped after 6 tries, 0 taken over |
| Inventory scalper | GIVT | Go client, no cookies, burst | **50 consoles hoarded** | stopped after 3 holds |
| Ad-impression fraud | SIVT | not blocked — the ad path is score-only — but every impression is marked `X-WSL-Bot-IVT: sivt` and the shop does not bill it | **50 impressions billed** | 0 billed, 50 filtered as IVT |
| Gift-card cracking | GIVT | script client, no cookies, 404 storm | **1 card cracked** | blocked, 0 cracked |
| Vulnerability scanner | GIVT | scanner User-Agent | 3/3 | blocked on request 1 |

These figures are from the local end-to-end run: the real gateway, branch
code, and this origin. The same scenario code runs live.

## Test it

```bash
# Simplest: curl only. Scanner, headless and fake crawler stopped; checkout
# challenged; a browser allowed.
./test-bot-secure.sh

# Full live matrix: drives the lab's runner on both hosts. Secure must stop
# every attack (and bill no fake impressions), open must let them all through.
python3 test_bot_live.py -v

# Against the local Docker stack (see below)
python3 test_bot_live.py --secure http://bots-secure.fictionally.org \
  --open http://bots-open.fictionally.org --upstream http://localhost:18080 -v
```

## Components

| Path | What |
|------|------|
| `app/app.py` | Acme Shop — the origin, the per-host impact counters (`/stats`), the lab's bot runner (`/lab/run`, `/lab/scenarios`, `/lab/reset`) and the features page (`/features`). Python stdlib only. |
| `lab.html` | The lab page, served by the shop at `/lab` on both hosts. |
| `k3s1-shop-api.yaml` | Namespace `wslproxy-bot-demo`, Deployment (1 replica — the impact counters live in memory) pinned to **cloud001**, NodePort **30088**. Source in a ConfigMap on stock `python:3.12-alpine`. |
| `data/servers/prod/host:bots-{open,secure}.fictionally.org.json` | The two vhosts — identical except `bot_defense`. |
| `data/rules/prod/bot-demo-default.json` | Routing rule (305 → `origin-uk-001.pop0.uk:30088`). |
| `test_bot_live.py` | Live matrix (zero dependencies). |
| `test-bot-secure.sh` | curl-only smoke test. |

The secure host's policy is `mode: challenge`, with these paths:

| Setting | Paths |
|---|---|
| `challenge_paths` | `/checkout` |
| `login_paths` | `/api/login` |
| `monitor_paths` | `/ad/` |
| `skip_paths` | `/lab*`, `/stats`, `/health` |

It also sets `response_headers: true`, so the lab can show verdicts. In
production keep that off: verdicts go to the origin only.

## How to deploy (needs approval — touches lon1, k3s1 and DNS)

1. **Edge code.** Deploy wslproxy to lon1 (and pop0) in `nginx` mode, then
   `code` mode. Bot Defense needs the `wsl_bot_defense` shared dict and the
   init/log hooks.
2. **Origin.** Apply the manifest, then load the app and lab into the
   ConfigMap and restart:

   ```bash
   kubectl apply -f k3s1-shop-api.yaml
   kubectl -n wslproxy-bot-demo create configmap shop-api-src \
     --from-file=app.py=app/app.py --from-file=lab.html=lab.html \
     -o yaml --dry-run=client | kubectl apply -f -
   kubectl -n wslproxy-bot-demo rollout restart deploy/shop-api
   ```

3. **Vhosts and rule.** Import them to the lon1 control plane through
   `POST /api/projects/import` (`rules`, then `servers`). Percent-encode the
   JSON body, as the WAF demo README explains.
4. **DNS.** Add Cloudflare CNAMEs `bots-{open,secure}.fictionally.org →
   lon1.pop0.uk`, unproxied so auto-ssl can solve HTTP-01. Certificates issue
   on the first HTTPS hit.

## Run it locally

The real gateway (branch code, dev template) and the shop run on one Docker
network. The runner targets the gateway with `BOT_DEMO_UPSTREAM`, and the
vhosts are switched to plain HTTP.

1. Copy the demo `data/` into a scratch directory.
2. Set `"ssl_enabled": false` and `"ssl_force_https": false` in both server
   JSONs.
3. In the rule, set `redirect_uri` to the shop container's IP (`<ip>:8080`).
   Use the IP, not the container name: the gateway resolves backend names
   through `settings.dns_resolver`, which cannot see Docker names. Drop the
   rule's `backends` and `routing` too: `nginx-dev.conf.tmpl` lacks the
   `router_state` dict that multi-backend rules need, which is a known
   dev-template gap.
4. Start both containers on one network:

   ```bash
   docker network create bd-net
   docker run -d --name shop-origin --network bd-net -v $PWD:/demo:ro \
     -e BOT_DEMO_SCHEME=http -e BOT_DEMO_UPSTREAM=http://wslp-bd \
     --entrypoint sh wslproxy-wslproxy:latest \
     -c 'mkdir -p /tmp/run && cp /demo/app/app.py /demo/lab.html /tmp/run/ && exec python3 /tmp/run/app.py'
   docker run -d --name wslp-bd --network bd-net -p 18080:80 \
     -v $REPO/api:/usr/local/openresty/nginx/html/api:ro \
     -v $REPO/nginx-dev.conf.tmpl:/usr/local/openresty/nginx/conf/nginx.conf:ro \
     -v <scratch>/data:/opt/nginx/data wslproxy-wslproxy:latest
   ```

Over plain HTTP the `Sec-CH-UA` / `Sec-Fetch-*` checks do not apply, which is
correct behaviour, so the spoofed-browser scenario is caught a little later
than over HTTPS.
