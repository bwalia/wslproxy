#!/usr/bin/env python3
"""
Live Bot Defense & IVT matrix for the bots-*.fictionally.org demo.

Drives the lab's own server-side runner (POST /lab/run) on each host, so it
asserts exactly what the lab shows:

  secure  every attack is stopped (challenged or blocked for at least half its
          requests); ad fraud is let through but billed nothing (all IVT); a
          real browser is never stopped; checkout requires the browser check
  open    every attack gets through, and does damage

Defaults (override with env or flags):
  BOT_SECURE_HOST = https://bots-secure.fictionally.org
  BOT_OPEN_HOST   = https://bots-open.fictionally.org
  BOT_UPSTREAM    = (unset) send to this base URL with the host as Host header,
                    e.g. http://localhost:18080 for the local Docker stack

Exit 0 only when every assertion passes. Zero third-party dependencies.
"""
from __future__ import annotations

import argparse
import json
import os
import ssl
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urlparse

CTX = ssl.create_default_context()
CHROME = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
          "(KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")

# Business damage each attack does when it gets through (open host).
DAMAGE = {
    "scraper": "prices_exposed",
    "spoofed-browser": "prices_exposed",
    "credential-stuffing": "accounts_taken_over",
    "scalper": "stock_held_by_one_client",
    "ad-fraud": "impressions_billable",
    "carding": "giftcards_cracked",
}


class Client:
    def __init__(self, base: str, upstream: str | None):
        u = urlparse(base)
        self.host = u.hostname
        self.base = (upstream or f"{u.scheme}://{u.netloc}").rstrip("/")
        self.cookies: dict[str, str] = {}

    def request(self, method, path, headers=None, body=None, keep_cookies=False):
        req = urllib.request.Request(self.base + path, data=body, method=method)
        req.add_header("Host", self.host)
        for k, v in (headers or {}).items():
            req.add_header(k, v)
        if keep_cookies and self.cookies:
            req.add_header("Cookie", "; ".join(f"{k}={v}" for k, v in self.cookies.items()))
        try:
            resp = urllib.request.urlopen(req, timeout=120, context=CTX)
            status, hdrs, data = resp.status, resp.headers, resp.read()
        except urllib.error.HTTPError as e:
            status, hdrs, data = e.code, e.headers, e.read()
        if keep_cookies:
            for line in hdrs.get_all("Set-Cookie") or []:
                kv = line.split(";", 1)[0]
                if "=" in kv:
                    k, v = kv.split("=", 1)
                    self.cookies[k.strip()] = v.strip()
        return status, hdrs, data

    def run(self, scenario):
        for attempt in range(5):
            status, _, data = self.request("POST", "/lab/run", {"Content-Type": "application/json"},
                                           json.dumps({"scenario": scenario}).encode())
            if status != 429:
                break
            time.sleep(1.5 * (attempt + 1))
        try:
            return status, json.loads(data)
        except ValueError:
            return status, {"error": data[:200].decode(errors="replace")}


class Matrix:
    def __init__(self, verbose):
        self.passed, self.failed, self.verbose = 0, 0, verbose

    def check(self, cond, msg):
        if cond:
            self.passed += 1
            if self.verbose:
                print(f"  [PASS] {msg}")
        else:
            self.failed += 1
            print(f"  [FAIL] {msg}")


def scenarios(client):
    status, _, data = client.request("GET", "/lab/scenarios")
    if status != 200:
        raise SystemExit(f"{client.host}: /lab/scenarios returned {status}")
    return [s["id"] for s in json.loads(data)["scenarios"]]


def test_secure(m, c):
    print(f"── secure: {c.host}")
    c.request("POST", "/lab/reset")
    for sid in scenarios(c):
        status, res = c.run(sid)
        if status != 200:
            m.check(False, f"{sid}: lab run failed ({status} {res.get('error')})")
            continue
        s, imp = res["summary"], res["impact"]
        if sid == "ad-fraud":
            m.check(imp.get("impressions_billable", 1) == 0 and imp.get("impressions_invalid", 0) > 0,
                    f"{sid}: fake impressions labelled IVT and not billed "
                    f"(billed={imp.get('impressions_billable')}, invalid={imp.get('impressions_invalid')})")
            continue
        stopped = s["challenged"] + s["blocked"]
        m.check(s["errors"] == 0 and stopped * 2 >= s["sent"],
                f"{sid}: stopped {stopped}/{s['sent']} (allowed {s['allowed']}, errors {s['errors']})")
        key = DAMAGE.get(sid)
        if key in ("accounts_taken_over", "giftcards_cracked"):
            m.check(imp.get(key, 1) == 0, f"{sid}: no {key.replace('_', ' ')}")

    # A real browser: full headers, keeps the session, loads assets. Same
    # route as the runner's client (c.base is the upstream or the host).
    person = Client(f"https://{c.host}", c.base)
    browser = {"User-Agent": CHROME, "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
               "Accept-Language": "en-GB,en;q=0.9", "Accept-Encoding": "identity",
               "Sec-CH-UA": '"Chromium";v="130"', "Sec-Fetch-Mode": "navigate", "Sec-Fetch-Site": "none"}
    classes = []
    for path in ("/", "/static/app.css", "/products?page=1", "/static/app.js", "/product/4", "/products?page=2"):
        status, hdrs, _ = person.request("GET", path, browser, keep_cookies=True)
        classes.append((status, hdrs.get("X-WSL-Bot-Class")))
    m.check(all(st == 200 for st, _ in classes), f"real browser never stopped {classes}")
    m.check(all(cl in (None, "human") for _, cl in classes), "real browser classified human")

    status, hdrs, body = Client(f"https://{c.host}", c.base).request("GET", "/checkout", browser)
    m.check(status == 403 and hdrs.get("X-WSL-Bot-Action") == "challenge" and b"Checking your browser" in body,
            f"checkout requires the browser check (status {status})")


def test_open(m, c):
    print(f"── open: {c.host}")
    c.request("POST", "/lab/reset")
    for sid in scenarios(c):
        status, res = c.run(sid)
        if status != 200:
            m.check(False, f"{sid}: lab run failed ({status} {res.get('error')})")
            continue
        s, imp = res["summary"], res["impact"]
        m.check(s["errors"] == 0 and s["allowed"] == s["sent"],
                f"{sid}: all {s['sent']} requests reach the origin (allowed {s['allowed']})")
        key = DAMAGE.get(sid)
        if key:
            m.check(imp.get(key, 0) > 0, f"{sid}: does damage ({key} +{imp.get(key)})")


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--secure", default=os.environ.get("BOT_SECURE_HOST", "https://bots-secure.fictionally.org"))
    ap.add_argument("--open", default=os.environ.get("BOT_OPEN_HOST", "https://bots-open.fictionally.org"))
    ap.add_argument("--upstream", default=os.environ.get("BOT_UPSTREAM") or None)
    ap.add_argument("--secure-only", action="store_true")
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    m = Matrix(args.verbose)
    test_secure(m, Client(args.secure, args.upstream))
    if not args.secure_only:
        test_open(m, Client(args.open, args.upstream))
    print(f"{m.passed} passed, {m.failed} failed")
    return 0 if m.failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
