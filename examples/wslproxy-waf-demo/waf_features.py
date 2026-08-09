#!/usr/bin/env python3
"""
Golden tests for the wslproxy WAF v2 enforcement stages — the capabilities that
go beyond a signature list. Each case asserts an expected outcome against the
protected host (default payments-secure.fictionally.org):

  block   → HTTP 403 with X-WAF-Block, and (when given) a specific X-WAF-Violation
  allow   → not blocked (any non-403), used to prove staging / route overrides
  code    → an exact status code

Run:  python3 waf_features.py [--host https://payments-secure.fictionally.org]
"""
import argparse
import base64
import json
import ssl
import sys
import time
import urllib.request
import urllib.error
from urllib.parse import quote

CTX = ssl.create_default_context()


class _NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, *a, **k):
        return None  # surface 301/302 instead of following to dummy hosts


_OPENER = urllib.request.build_opener(_NoRedirect,
                                      urllib.request.HTTPSHandler(context=CTX))


def b64u(o):
    return base64.urlsafe_b64encode(json.dumps(o, separators=(",", ":")).encode()).rstrip(b"=").decode()


def req(host, method, path, body=None, headers=None, ctype=None):
    url = host.rstrip("/") + (path if "?" not in path else
                              path.split("?")[0] + "?" + quote(path.split("?", 1)[1], safe="=&/:%*(){}$<>\"'|"))
    data = body.encode() if isinstance(body, str) else body
    r = urllib.request.Request(url, data=data, method=method)
    r.add_header("User-Agent", "waf-features/1.0")
    if ctype:
        r.add_header("Content-Type", ctype)
    for k, v in (headers or {}).items():
        r.add_header(k, v)
    try:
        with _OPENER.open(r, timeout=20) as resp:
            return resp.status, dict(resp.headers)
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers)
    except Exception as e:
        return 0, {"error": str(e)}


def hdr(h, name):
    for k, v in h.items():
        if k.lower() == name.lower():
            return v
    return ""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--host", default="https://payments-secure.fictionally.org")
    a = ap.parse_args()
    H = a.host
    hs256 = f'{b64u({"alg":"HS256","typ":"JWT"})}.{b64u({"sub":"x"})}.sig'
    algnone = f'{b64u({"alg":"none","typ":"JWT"})}.{b64u({"sub":"admin","role":"admin"})}.'
    deep = json.dumps(eval("{'a':" * 11 + "1" + "}" * 11))     # depth ~11 > 8
    big = json.dumps({"x": "A" * 20000})                        # > 16 KB

    # (name, expectation, fn) — fn returns (status, headers)
    cases = [
        ("Method allow-list (PUT denied)", ("block", "VIOL_METHOD"),
         lambda: req(H, "PUT", "/api/profile", '{"x":1}', ctype="application/json")),
        ("Filetype deny (.env)", ("block", "VIOL_FILETYPE"),
         lambda: req(H, "GET", "/config.env")),
        ("Filetype deny (.git)", ("block", "VIOL_FILETYPE"),
         lambda: req(H, "GET", "/.git/config")),
        ("JWT alg deny (HS256)", ("block", "VIOL_JWT_ALG"),
         lambda: req(H, "GET", "/api/me", headers={"Authorization": f"Bearer {hs256}"})),
        ("JWT alg deny (none)", ("block", "VIOL_JWT_ALG"),
         lambda: req(H, "GET", "/api/me", headers={"Authorization": f"Bearer {algnone}"})),
        ("JSON max depth", ("block", "VIOL_JSON_DEPTH"),
         lambda: req(H, "POST", "/api/merge", deep, ctype="application/json")),
        ("JSON max bytes", ("block", "VIOL_JSON_SIZE"),
         lambda: req(H, "POST", "/api/merge", big, ctype="application/json")),
        ("Route override: /preview is transparent", ("allow", None),
         lambda: req(H, "GET", "/preview?q=<script>alert(1)</script>")),
        ("Same attack on /search still blocks", ("block", "VIOL_ATTACK_SIGNATURE"),
         lambda: req(H, "GET", "/search?q=<script>alert(1)</script>")),
        ("Staged signature (open-redirect) alarms, not blocks", ("allow", None),
         lambda: req(H, "GET", "/api/redirect?to=https://evil.example/x")),
        ("Legit request passes", ("code", 200),
         lambda: req(H, "GET", "/products?cat=deposit")),
    ]

    print(f"\nWAF v2 golden tests → {H}\n" + "-" * 66)
    passed = 0
    for name, exp, fn in cases:
        status, headers = fn()
        blocked = status == 403 and hdr(headers, "x-waf-block") == "true"
        viol = hdr(headers, "x-waf-violation")
        sid = hdr(headers, "x-support-id")
        kind = exp[0]
        if kind == "block":
            ok = blocked and (exp[1] is None or viol == exp[1])
            got = f"403 {viol} sid={sid[:16]}" if blocked else f"NOT blocked ({status})"
        elif kind == "allow":
            ok = not blocked
            got = f"pass ({status})" if ok else "blocked"
        else:  # code
            ok = status == exp[1]
            got = str(status)
        passed += ok
        print(f"  [{'PASS' if ok else 'FAIL'}] {name.ljust(46)} {got}")

    # brute-force needs its own burst
    print("  ---- brute force (POST /api/login ×7, max 5 / 60s) ----")
    bf_blocked = 0
    codes = []
    for i in range(7):
        s, h = req(H, "POST", "/api/login", '{"user":"admin","pass":"wrong"}', ctype="application/json")
        codes.append(s)
        if s == 403 and hdr(h, "x-waf-violation") == "VIOL_BRUTE_FORCE":
            bf_blocked += 1
    bf_ok = bf_blocked >= 1
    passed += bf_ok
    print(f"  [{'PASS' if bf_ok else 'FAIL'}] Brute-force velocity block".ljust(53) +
          f" attempts={codes} blocked={bf_blocked}")

    total = len(cases) + 1
    print("-" * 66)
    print(f"{passed}/{total} golden tests passed\n")
    sys.exit(0 if passed == total else 1)


if __name__ == "__main__":
    main()
