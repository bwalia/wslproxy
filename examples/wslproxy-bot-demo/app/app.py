#!/usr/bin/env python3
"""Acme Shop — the origin for the wslproxy Bot Defense & IVT demo.

Python standard library only (runs on a stock python:3.12-alpine image from a
ConfigMap). It is a small shop with exactly what bots go after:

  /products, /product/<id>   catalogue + prices      → scraping
  /api/login                 account login           → credential stuffing
  /api/inventory/hold        limited stock (PS6)     → scalping / hoarding
  /ad/impression             paid ad impressions     → ad fraud (IVT)
  /api/giftcard/check        gift-card balances      → carding / enumeration
  /checkout                  checkout                → challenge-protected

Every handler records its business impact per host in /stats, so the lab can
show what each attack achieved: pages harvested, accounts taken over, stock
hoarded, impressions billed to the advertiser.

The ad endpoint shows the IVT side: behind Bot Defense the edge forwards its
verdict as X-WSL-Bot-IVT, and the shop only bills impressions marked "none".
Without Bot Defense there is no verdict, so every bot impression is billed.

/lab is the browser lab, and /lab/run is its server-side bot runner: a browser
cannot pose as a bot (it may not set User-Agent, drop cookies or forge
headers), so the runner fires each scripted attack from here, at this same
host, through the edge, and reports what came back. It only ever targets the
host it was called on, and only hosts in BOT_DEMO_TARGETS.
"""

import html
import json
import os
import random
import ssl
import threading
import time
import urllib.error
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qs, urlparse

PORT = int(os.environ.get("PORT", "8080"))
HERE = os.path.dirname(os.path.abspath(__file__))
TARGETS = {h.strip().lower() for h in os.environ.get(
    "BOT_DEMO_TARGETS", "bots-open.fictionally.org,bots-secure.fictionally.org").split(",") if h.strip()}
SCHEME = os.environ.get("BOT_DEMO_SCHEME", "https")
# Local testing: send runner traffic to this base URL with the real Host header.
UPSTREAM = os.environ.get("BOT_DEMO_UPSTREAM", "").rstrip("/")

STOCK_START = 100
LEAKED_ACCOUNT = ("jess@example.com", "Summer2024!")
VALID_GIFTCARD = "GIFT-7Q2M-91XZ"

PRODUCTS = [
    {"id": i, "name": n, "price": p} for i, (n, p) in enumerate([
        ("PS6 console", 549.00), ("Trail running shoes", 119.00), ("Noise-cancelling headphones", 279.00),
        ("Espresso machine", 399.00), ("Mechanical keyboard", 149.00), ("4K monitor", 329.00),
        ("Road bike helmet", 89.00), ("Smart watch", 249.00), ("Air fryer", 129.00), ("Desk lamp", 39.00),
        ("Hiking backpack", 99.00), ("Wireless earbuds", 159.00), ("Gaming chair", 299.00),
        ("Drone 4K", 699.00), ("Electric toothbrush", 69.00), ("Robot vacuum", 449.00),
        ("Blender", 89.00), ("E-reader", 139.00), ("Yoga mat", 29.00), ("Action camera", 349.00),
    ], start=1)
]

# ─── per-host business impact ────────────────────────────────────────────────

_lock = threading.Lock()
_stats = {}


def _fresh():
    return {
        "catalogue_pages_served": 0, "prices_exposed": 0,
        "login_attempts": 0, "accounts_taken_over": 0,
        "stock_remaining": STOCK_START, "stock_held_by_one_client": 0,
        "impressions_billable": 0, "impressions_invalid": 0,
        "giftcard_guesses": 0, "giftcards_cracked": 0,
        "checkouts": 0,
    }


def stats(host):
    with _lock:
        return _stats.setdefault(host, _fresh())


def bump(host, key, n=1):
    with _lock:
        s = _stats.setdefault(host, _fresh())
        s[key] += n
        return s[key]


def reset(host):
    with _lock:
        _stats[host] = _fresh()


# ─── pages ───────────────────────────────────────────────────────────────────

CSS = """body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:960px;margin:2em auto;padding:0 1em;color:#1f2937}
header{display:flex;justify-content:space-between;align-items:center}a{color:#4f46e5}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:1em}
.card{border:1px solid #e5e7eb;border-radius:8px;padding:1em}.price{font-weight:700}"""
JS = "document.documentElement.dataset.js='1';"


def page(host, title, body):
    secure = "secure" in host
    banner = ("Protected by wslproxy Bot Defense" if secure
              else "No bot protection — the origin is fully exposed")
    return f"""<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>{html.escape(title)} · Acme Shop</title>
<link rel="stylesheet" href="/static/app.css"><script src="/static/app.js" defer></script></head>
<body><header><h1><a href="/" style="text-decoration:none">Acme Shop</a></h1>
<nav><a href="/products">Products</a> · <a href="/checkout">Checkout</a> · <a href="/lab"><b>Bot lab</b></a> · <a href="/features">Features</a></nav></header>
<p style="padding:.5em 1em;border-radius:6px;background:{'#ecfdf5' if secure else '#fef2f2'}">{banner}</p>
{body}</body></html>"""


def product_card(p):
    return (f'<div class="card"><a href="/product/{p["id"]}">{html.escape(p["name"])}</a>'
            f'<div class="price">£{p["price"]:.2f}</div></div>')


def h_products(host, q):
    try:
        n = max(1, int((q.get("page") or ["1"])[0]))
    except ValueError:
        n = 1
    items = [PRODUCTS[(n * 7 + i) % len(PRODUCTS)] for i in range(8)]
    bump(host, "catalogue_pages_served")
    bump(host, "prices_exposed", len(items))
    body = f'<h2>Products — page {n}</h2><div class="grid">{"".join(map(product_card, items))}</div>' \
           f'<p><a href="/products?page={n + 1}">Next page →</a></p>'
    return 200, "text/html; charset=utf-8", page(host, "Products", body)


def h_product(host, pid):
    p = next((x for x in PRODUCTS if str(x["id"]) == pid), None)
    if not p:
        return 404, "text/html; charset=utf-8", page(host, "Not found", "<h2>No such product</h2>")
    bump(host, "catalogue_pages_served")
    bump(host, "prices_exposed")
    return 200, "text/html; charset=utf-8", page(host, p["name"],
        f'<h2>{html.escape(p["name"])}</h2><p class="price">£{p["price"]:.2f}</p>')


def h_login(host, body):
    bump(host, "login_attempts")
    try:
        req = json.loads(body or b"{}")
    except ValueError:
        req = {}
    if (req.get("user"), req.get("pass")) == LEAKED_ACCOUNT:
        bump(host, "accounts_taken_over")
        return 200, "application/json", json.dumps({"ok": True, "session": "acct-" + str(random.randint(1000, 9999))})
    return 401, "application/json", json.dumps({"ok": False, "error": "invalid credentials"})


def h_hold(host, body):
    try:
        req = json.loads(body or b"{}")
    except ValueError:
        req = {}
    qty = max(1, min(4, int(req.get("qty", 2)) if str(req.get("qty", 2)).isdigit() else 2))
    with _lock:
        s = _stats.setdefault(host, _fresh())
        if s["stock_remaining"] < qty:
            return 409, "application/json", json.dumps({"ok": False, "error": "sold out"})
        s["stock_remaining"] -= qty
        s["stock_held_by_one_client"] += qty
        left = s["stock_remaining"]
    return 200, "application/json", json.dumps({"ok": True, "held": qty, "remaining": left})


def h_impression(host, headers):
    # The IVT verdict, if an edge in front of us produced one. "none" means
    # valid traffic; givt / sivt are invalid and never billed.
    ivt = (headers.get("X-WSL-Bot-IVT") or "").lower()
    if ivt in ("givt", "sivt"):
        bump(host, "impressions_invalid")
    else:
        bump(host, "impressions_billable")
    return 204, "image/gif", ""


def h_giftcard(host, body):
    bump(host, "giftcard_guesses")
    try:
        code = json.loads(body or b"{}").get("code", "")
    except (ValueError, AttributeError):
        code = ""
    if code == VALID_GIFTCARD:
        bump(host, "giftcards_cracked")
        return 200, "application/json", json.dumps({"ok": True, "balance": 250.00})
    return 404, "application/json", json.dumps({"ok": False, "error": "unknown card"})


def h_checkout(host):
    bump(host, "checkouts")
    return 200, "text/html; charset=utf-8", page(host, "Checkout",
        "<h2>Checkout</h2><p>Your basket is reserved. (On the protected host you passed the "
        "browser check to get here.)</p>")


# ─── the lab's bot runner ────────────────────────────────────────────────────

CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
BROWSER_HEADERS = {
    "User-Agent": CHROME,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-GB,en;q=0.9",
    "Accept-Encoding": "identity",
    "Sec-CH-UA": '"Chromium";v="130", "Google Chrome";v="130", "Not?A_Brand";v="99"',
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
}
JSON_HEADERS = {"Content-Type": "application/json", "Accept": "application/json"}

_ssl_ctx = ssl.create_default_context()


class Jar:
    """The few cookies a scripted client keeps (or does not)."""

    def __init__(self, keep):
        self.keep, self.cookies = keep, {}

    def header(self):
        return "; ".join(f"{k}={v}" for k, v in self.cookies.items())

    def store(self, set_cookies):
        if not self.keep:
            return
        for line in set_cookies:
            kv = line.split(";", 1)[0]
            if "=" in kv:
                k, v = kv.split("=", 1)
                self.cookies[k.strip()] = v.strip()


def fire(host, method, path, headers, body=None, jar=None):
    url = (UPSTREAM or f"{SCHEME}://{host}") + path
    data = body.encode() if isinstance(body, str) else body
    req = urllib.request.Request(url, data=data, method=method)
    for k, v in headers.items():
        req.add_header(k, v)
    req.add_header("Host", host)
    if jar and jar.cookies:
        req.add_header("Cookie", jar.header())
    started = time.time()
    try:
        resp = urllib.request.urlopen(req, timeout=10, context=_ssl_ctx)
        status, h = resp.status, resp.headers
        resp.read()
    except urllib.error.HTTPError as e:
        status, h = e.code, e.headers
        e.read()
    except Exception as e:  # network, DNS, TLS — reported, never raised
        return {"status": 0, "error": str(e)[:120], "ms": int((time.time() - started) * 1000)}
    if jar:
        jar.store(h.get_all("Set-Cookie") or [])
    return {
        "status": status,
        "ms": int((time.time() - started) * 1000),
        "class": h.get("X-WSL-Bot-Class"),
        "score": h.get("X-WSL-Bot-Score"),
        "ivt": h.get("X-WSL-Bot-IVT"),
        "action": h.get("X-WSL-Bot-Action"),
        "signals": h.get("X-WSL-Bot-Signals"),
        "support_id": h.get("X-Support-ID"),
    }


def _browserish(**over):
    h = dict(BROWSER_HEADERS)
    h.update(over)
    return {k: v for k, v in h.items() if v is not None}


def sc_scraper(host):
    hdr = {"User-Agent": "python-requests/2.31.0", "Accept": "*/*", "Accept-Encoding": "identity"}
    return [fire(host, "GET", f"/products?page={i}", hdr) for i in range(1, 31)]


def sc_spoofed(host):
    # Copies Chrome's User-Agent and nothing else, keeps no cookies.
    hdr = {"User-Agent": CHROME, "Accept": "text/html,*/*", "Accept-Encoding": "identity"}
    return [fire(host, "GET", f"/product/{(i % len(PRODUCTS)) + 1}", hdr) for i in range(30)]


def sc_headless(host):
    hdr = _browserish(**{"User-Agent": CHROME.replace("Chrome/", "HeadlessChrome/")})
    jar = Jar(keep=True)
    return [fire(host, "GET", f"/products?page={i}", hdr, jar=jar) for i in range(1, 9)]


def sc_fake_googlebot(host):
    hdr = {"User-Agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)",
           "Accept": "text/html,*/*", "Accept-Encoding": "identity"}
    return [fire(host, "GET", f"/products?page={i}", hdr) for i in range(1, 11)]


def sc_credential_stuffing(host):
    # A careful one: full browser headers, keeps its cookie, one IP. Only its
    # behaviour — login velocity — gives it away.
    jar = Jar(keep=True)
    fire(host, "GET", "/", _browserish(), jar=jar)
    combos = [(f"user{i}@example.com", f"Password{i}!") for i in range(19)]
    combos.insert(14, LEAKED_ACCOUNT)
    hdr = _browserish(**JSON_HEADERS, **{"Sec-Fetch-Mode": "cors", "Sec-Fetch-Site": "same-origin"})
    return [fire(host, "POST", "/api/login", hdr, json.dumps({"user": u, "pass": p}), jar=jar) for u, p in combos]


def sc_scalper(host):
    hdr = {"User-Agent": "Go-http-client/1.1", **JSON_HEADERS}
    return [fire(host, "POST", "/api/inventory/hold", hdr, json.dumps({"sku": "PS6", "qty": 2})) for _ in range(25)]


def sc_ad_fraud(host):
    # An impression farm: a copied browser UA, no cookies, hammering the beacon.
    hdr = {"User-Agent": CHROME, "Accept": "image/*", "Accept-Encoding": "identity"}
    return [fire(host, "GET", f"/ad/impression?ad=summer-sale&slot={i % 4}", hdr) for i in range(50)]


def sc_carding(host):
    hdr = {"User-Agent": "Go-http-client/1.1", **JSON_HEADERS}
    codes = [f"GIFT-{random.randint(1000, 9999)}-{random.randint(10, 99)}AB" for _ in range(24)]
    codes.insert(20, VALID_GIFTCARD)
    return [fire(host, "POST", "/api/giftcard/check", hdr, json.dumps({"code": c})) for c in codes]


def sc_scanner(host):
    hdr = {"User-Agent": "sqlmap/1.7.11#stable (https://sqlmap.org)", "Accept": "*/*"}
    return [fire(host, "GET", p, hdr) for p in ("/products?page=1", "/product/1", "/search?q=1")]


SCENARIOS = [
    {"id": "scraper", "name": "Catalogue scraper", "category": "Scraping", "ivt": "givt",
     "what": "python-requests pulls 30 catalogue pages, ignoring cookies.",
     "how": "HTTP-library User-Agent, never returns the session cookie, no CSS/JS.",
     "impact": ["catalogue_pages_served", "prices_exposed"], "run": sc_scraper},
    {"id": "spoofed-browser", "name": "Price scraper posing as Chrome", "category": "Scraping", "ivt": "sivt",
     "what": "Copies Chrome's User-Agent to harvest 30 product prices.",
     "how": "A real Chrome sends Accept-Language, Sec-CH-UA and Sec-Fetch-*; this one does not, and drops cookies.",
     "impact": ["catalogue_pages_served", "prices_exposed"], "run": sc_spoofed},
    {"id": "headless", "name": "Headless Chrome", "category": "Automation", "ivt": "sivt",
     "what": "Puppeteer/Playwright-style headless browser browsing the catalogue.",
     "how": "HeadlessChrome in the User-Agent; blocked or challenged — and the challenge refuses navigator.webdriver.",
     "impact": ["catalogue_pages_served"], "run": sc_headless},
    {"id": "fake-googlebot", "name": "Fake Googlebot", "category": "Impersonation", "ivt": "sivt",
     "what": "Claims to be Googlebot so a site lets it crawl everything.",
     "how": "Reverse + forward DNS: its IP does not resolve under googlebot.com. Real Googlebot is verified and allowed.",
     "impact": ["catalogue_pages_served"], "run": sc_fake_googlebot},
    {"id": "credential-stuffing", "name": "Credential stuffing", "category": "Account takeover", "ivt": "sivt",
     "what": "Tries 20 leaked email/password pairs; the 15th is a real customer's.",
     "how": "Looks like a browser on every request — caught by behaviour alone: login attempts per IP.",
     "impact": ["login_attempts", "accounts_taken_over"], "run": sc_credential_stuffing},
    {"id": "scalper", "name": "Inventory scalper", "category": "Scalping", "ivt": "givt",
     "what": "Holds 2 × PS6 consoles 25 times to resell them.",
     "how": "Go HTTP client, no cookies; stopped before the stock is gone.",
     "impact": ["stock_remaining", "stock_held_by_one_client"], "run": sc_scalper},
    {"id": "ad-fraud", "name": "Ad-impression fraud (IVT)", "category": "Invalid traffic", "ivt": "sivt",
     "what": "50 fake impressions of a paid ad, billed to the advertiser.",
     "how": "Not blocked — the ad path is score-only — but the edge marks each one X-WSL-Bot-IVT: sivt and the shop does not bill it.",
     "impact": ["impressions_billable", "impressions_invalid"], "run": sc_ad_fraud},
    {"id": "carding", "name": "Gift-card cracking", "category": "Carding", "ivt": "givt",
     "what": "Guesses 25 gift-card codes; the 21st is real.",
     "how": "Script User-Agent, no cookies, a storm of 404s from one IP.",
     "impact": ["giftcard_guesses", "giftcards_cracked"], "run": sc_carding},
    {"id": "scanner", "name": "Vulnerability scanner", "category": "Reconnaissance", "ivt": "givt",
     "what": "sqlmap probing the catalogue.",
     "how": "Scanner User-Agent: blocked on the first request.",
     "impact": ["catalogue_pages_served"], "run": sc_scanner},
]
SCENARIO_BY_ID = {s["id"]: s for s in SCENARIOS}

_run_lock = threading.Lock()
_last_run = {}


def run_scenario(host, sid):
    s = SCENARIO_BY_ID.get(sid)
    if not s:
        return 404, {"error": "unknown scenario"}
    if not _run_lock.acquire(blocking=False):
        return 429, {"error": "another scenario is running; try again in a moment"}
    try:
        if time.time() - _last_run.get(host, 0) < 1.0:
            return 429, {"error": "slow down"}
        before = dict(stats(host))
        started = time.time()
        results = s["run"](host)
        _last_run[host] = time.time()
        after = dict(stats(host))
    finally:
        _run_lock.release()
    counts = {"sent": len(results), "allowed": 0, "challenged": 0, "blocked": 0, "errors": 0}
    for r in results:
        if r["status"] == 0:
            counts["errors"] += 1
        elif r.get("action") == "challenge":
            counts["challenged"] += 1
        elif r["status"] == 403:
            counts["blocked"] += 1
        else:
            counts["allowed"] += 1
    impact = {k: after[k] - before[k] for k in s["impact"]}
    return 200, {"scenario": sid, "host": host, "ms": int((time.time() - started) * 1000),
                 "summary": counts, "impact": impact, "requests": results}


# ─── features page ───────────────────────────────────────────────────────────

# Mirrors api/bot_defense/config.lua SIGNALS (test/bot_defense checks every
# code appears here, so the page cannot drift from the engine).
SIGNALS = [
    ("Fingerprint", "BD_UA_MISSING", "givt", 40, "No User-Agent header."),
    ("Fingerprint", "BD_UA_AUTOMATION", "givt", 35, "HTTP library or CLI tool User-Agent (curl, python-requests, Go, Java, …)."),
    ("Fingerprint", "BD_UA_SCANNER", "givt", 90, "Vulnerability scanner User-Agent (sqlmap, nikto, nuclei, …)."),
    ("Fingerprint", "BD_UA_DECLARED_BOT", "givt", 30, "Self-declared bot, crawler or spider that is not a verified search engine."),
    ("Fingerprint", "BD_UA_HEADLESS", "sivt", 70, "Headless or automated browser (HeadlessChrome, PhantomJS, Selenium, …)."),
    ("Fingerprint", "BD_BROWSER_NO_ACCEPT", "sivt", 15, "Claims to be a browser but sends no Accept header."),
    ("Fingerprint", "BD_BROWSER_NO_LANGUAGE", "sivt", 20, "Claims to be a browser but sends no Accept-Language."),
    ("Fingerprint", "BD_BROWSER_NO_ENCODING", "sivt", 15, "Claims to be a browser but sends no Accept-Encoding."),
    ("Fingerprint", "BD_BROWSER_NO_HINTS", "sivt", 15, "Claims to be Chromium but sends no Sec-CH-UA client hints over HTTPS."),
    ("Fingerprint", "BD_BROWSER_NO_FETCH_META", "sivt", 15, "Claims to be a modern browser but sends no Sec-Fetch-* metadata over HTTPS."),
    ("Fingerprint", "BD_OLD_PROTOCOL", "sivt", 15, "Claims to be a browser but speaks HTTP/1.0."),
    ("Identity", "BD_FAKE_CRAWLER", "sivt", 90, "Claims to be Googlebot/Bingbot/… but reverse + forward DNS says otherwise."),
    ("Identity", "BD_DATACENTER", "givt", 25, "Client IP is in a hosting / cloud provider range."),
    ("Behaviour", "BD_BURST", "sivt", 30, "Request burst from one IP above the per-10s limit."),
    ("Behaviour", "BD_SCRAPING", "sivt", 35, "Too many distinct pages per minute for one visitor."),
    ("Behaviour", "BD_ERROR_STORM", "sivt", 30, "Many 401/403/404/405 responses for one IP — scanning, enumeration, carding."),
    ("Behaviour", "BD_LOGIN_VELOCITY", "sivt", 50, "Too many login attempts from one IP — credential stuffing."),
    ("Behaviour", "BD_NO_COOKIE", "sivt", 25, "Never returns the session cookie it is given."),
    ("Behaviour", "BD_NO_ASSETS", "sivt", 20, "Loads many pages but never the CSS/JS/images a browser fetches."),
]


def h_features(host):
    rows = "".join(
        f"<tr><td>{html.escape(g)}</td><td><code>{c}</code></td><td>{ivt.upper()}</td><td>{w}</td>"
        f"<td>{html.escape(d)}</td></tr>" for g, c, ivt, w, d in SIGNALS)
    body = f"""<h2>Bot Defense &amp; IVT — how it decides</h2>
<p>Native to wslproxy, at the edge, no external service. Every request on a protected server is scored from
three kinds of evidence, then classed and acted on.</p>
<ol><li><b>Fingerprint</b> — what the request claims, and whether the rest of it agrees.</li>
<li><b>Identity</b> — verified search crawlers (reverse + forward DNS) and data-centre IP ranges.</li>
<li><b>Behaviour</b> — what this IP and this visitor have been doing, across every worker.</li></ol>
<p>The score is the sum of the signal weights, capped at 100: below <b>40</b> human, from 40 <b>suspect</b>,
from 80 <b>bot</b>. Verified crawlers are a class of their own and are allowed.</p>
<h3>Actions</h3><ul>
<li><b>monitor</b> — score and forward the verdict, never act.</li>
<li><b>challenge</b> — suspects get a self-hosted browser check (proof of work + automation check, no third-party
script); bots are blocked. A solved check is trusted for the session, bound to the client's network and
User-Agent, single-use, and cannot be replayed by another client.</li>
<li><b>block</b> — suspects and bots are blocked.</li>
<li>Per path: <i>always challenge</i> (checkout), <i>score only</i> (ad beacons, analytics), <i>skip</i> (webhooks).</li></ul>
<h3>Invalid traffic (IVT)</h3>
<p>Each verdict carries an MRC-style tier, forwarded to the origin as <code>X-WSL-Bot-IVT</code>:
<b>none</b> (valid), <b>GIVT</b> — general invalid traffic, found by lists and routine filtration (declared bots,
tools, data-centre traffic, verified crawlers), and <b>SIVT</b> — sophisticated invalid traffic that needs
analysis (spoofed browsers, headless automation, impersonated crawlers, abnormal behaviour). The ad scenario in
the lab shows an origin using it to stop billing for invalid impressions.</p>
<h3>Signals</h3><table border="1" cellpadding="6" style="border-collapse:collapse;font-size:.9em">
<tr><th>Kind</th><th>Signal</th><th>IVT</th><th>Weight</th><th>Meaning</th></tr>{rows}</table>
<h3>Failure behaviour</h3><p>Fails open: any internal error lets the request through and is logged and counted.
Search-engine verification that cannot reach DNS is "unknown", never "fake".</p>"""
    return 200, "text/html; charset=utf-8", page(host, "Bot Defense features", body)


# ─── server ──────────────────────────────────────────────────────────────────

def read_lab():
    try:
        with open(os.path.join(HERE, "lab.html"), "rb") as f:
            return 200, "text/html; charset=utf-8", f.read()
    except OSError:
        return 404, "text/plain", "lab.html missing (load it into the ConfigMap)"


class Handler(BaseHTTPRequestHandler):
    server_version = "AcmeShop/1.0"

    def _host(self):
        return (self.headers.get("Host") or "localhost").split(":")[0].lower()

    def _send(self, status, ctype, body, extra=None):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-store")
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(data)

    def _json(self, status, obj):
        return self._send(status, "application/json", json.dumps(obj))

    def _body(self):
        n = int(self.headers.get("Content-Length") or 0)
        return self.rfile.read(min(n, 65536)) if n else b""

    def do_HEAD(self):
        return self.do_GET()

    def do_GET(self):
        u = urlparse(self.path)
        p, q, host = u.path, parse_qs(u.query), self._host()
        if p == "/health":
            return self._send(200, "text/plain", "ok")
        if p == "/":
            items = "".join(map(product_card, PRODUCTS[:8]))
            return self._send(200, "text/html; charset=utf-8", page(host, "Home",
                f'<h2>Featured</h2><div class="grid">{items}</div>'))
        if p == "/products":
            return self._send(*h_products(host, q))
        if p.startswith("/product/"):
            return self._send(*h_product(host, p.rsplit("/", 1)[-1]))
        if p == "/search":
            term = (q.get("q") or [""])[0].lower()
            hits = [x for x in PRODUCTS if term in x["name"].lower()]
            return self._send(200, "text/html; charset=utf-8", page(host, "Search",
                f'<div class="grid">{"".join(map(product_card, hits))}</div>'))
        if p == "/checkout":
            return self._send(*h_checkout(host))
        if p == "/ad/impression":
            return self._send(*h_impression(host, self.headers))
        if p == "/static/app.css":
            return self._send(200, "text/css", CSS)
        if p == "/static/app.js":
            return self._send(200, "application/javascript", JS)
        if p == "/stats":
            return self._json(200, {"host": host, "stats": stats(host)})
        if p in ("/lab", "/lab.html"):
            return self._send(*read_lab())
        if p == "/lab/scenarios":
            return self._json(200, {"host": host, "targets": sorted(TARGETS), "scenarios": [
                {k: v for k, v in s.items() if k != "run"} for s in SCENARIOS]})
        if p == "/features":
            return self._send(*h_features(host))
        return self._send(404, "text/html; charset=utf-8", page(host, "Not found", "<h2>Not found</h2>"))

    def do_POST(self):
        p, host, body = urlparse(self.path).path, self._host(), self._body()
        if p == "/api/login":
            return self._send(*h_login(host, body))
        if p == "/api/inventory/hold":
            return self._send(*h_hold(host, body))
        if p == "/api/giftcard/check":
            return self._send(*h_giftcard(host, body))
        if p == "/lab/run":
            if host not in TARGETS:
                return self._json(403, {"error": f"{host} is not a lab target"})
            try:
                sid = json.loads(body or b"{}").get("scenario", "")
            except ValueError:
                sid = ""
            status, result = run_scenario(host, sid)
            return self._json(status, result)
        if p == "/lab/reset":
            reset(host)
            return self._json(200, {"host": host, "stats": stats(host)})
        return self._json(404, {"error": "not found"})

    def log_message(self, fmt, *args):
        pass


if __name__ == "__main__":
    ThreadingHTTPServer(("0.0.0.0", PORT), Handler).serve_forever()
