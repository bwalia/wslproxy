#!/usr/bin/env python3
"""
Acme Pay — a DELIBERATELY VULNERABLE payments API, used to demonstrate what a
WAF in front of it does (and does not) stop.

It is intentionally insecure. Do NOT deploy on a real network path to anything
that matters. Every handler is written so that a malicious input is genuinely
*processed* (not merely echoed), so "before WAF" shows real exploitation and
"after WAF" shows the payload never reaching the app. Exploitation is simulated
in-process — no real shell, no real outbound egress, no real secrets — so the
demo is safe to run yet still proves impact.

Covers OWASP Top 10 AND modern / API-specific classes:
  web:  reflected XSS, SQLi, path traversal/LFI, OS command injection, SSTI
  cve:  Log4Shell (CVE-2021-44228 JNDI), Spring4Shell (CVE-2022-22965)
  ssrf: cloud-metadata credential theft
  api:  NoSQL injection auth bypass, BOLA/IDOR, mass assignment,
        JWT alg:none forgery, XXE, GraphQL introspection, prototype pollution,
        open redirect, HTTP request smuggling (CWE-444 desync)
"""
import base64
import html
import json
import os
import re
import socket
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs

POD = socket.gethostname()

# ---- fake data the "attacker" is trying to reach -----------------------------
ACCOUNTS = {
    "1001": {"owner": "you@acme.example",      "balance": 42.10,   "pan": "4111 11•• •••• 0001"},
    "1002": {"owner": "cfo@acme.example",       "balance": 998450.00, "pan": "4111 11•• •••• 0002"},
    "9999": {"owner": "treasury@acme.example",  "balance": 71230411.55, "pan": "4111 11•• •••• 9999"},
}
USERS = {"admin": {"password": "S3cr3t!", "role": "admin"}}
CONFIG_SECRET = "sk_live_ACME_51H8xREAL_LOOKING_KEY_do_not_ship"


def page(body, status=200):
    return status, "text/html; charset=utf-8", (
        "<!doctype html><meta charset=utf-8><title>Acme Pay</title>"
        "<style>body{font:15px/1.5 system-ui,sans-serif;margin:2rem;max-width:60rem;color:#111}"
        "code,pre{background:#f4f4f5;padding:.15rem .4rem;border-radius:5px}"
        "pre{padding:1rem;overflow:auto}.bad{color:#b91c1c;font-weight:600}"
        ".ok{color:#047857}h1{margin-bottom:.2rem}a{color:#4f46e5}</style>" + body
    )


def js(obj, status=200):
    return status, "application/json", json.dumps(obj, indent=2)


LANDING = page(f"""
<h1>🏦 Acme Pay — payments API</h1>
<p class=bad>Origin app, intentionally vulnerable. Served on pod <code>{POD}</code>.</p>
<p>The same origin sits behind two hostnames so you can see a WAF's effect:
<b>open</b> (no WAF) vs <b>secure</b> (wslproxy WAF, block mode).</p>
<h3>Classic web (OWASP)</h3>
<ul>
<li>Reflected XSS — <code>/search?q=laptop</code></li>
<li>SQL injection — <code>/products?cat=deposit</code></li>
<li>Path traversal / LFI — <code>/statement?file=welcome.txt</code></li>
<li>OS command injection — <code>/ping?host=127.0.0.1</code></li>
<li>Server-side template injection — <code>/render?tpl=Hello</code></li>
</ul>
<h3>Named CVEs &amp; SSRF (beyond the Top 10)</h3>
<ul>
<li>Log4Shell / JNDI (CVE-2021-44228) — <code>/lookup?user=guest</code></li>
<li>Spring4Shell (CVE-2022-22965) — <code>/bind?class.module.classLoader=x</code></li>
<li>SSRF → cloud metadata — <code>/fetch?url=https://acme.example/logo.png</code></li>
</ul>
<h3>API security</h3>
<ul>
<li>NoSQL injection auth bypass — <code>POST /api/login</code> {{"user":"admin","pass":{{"$ne":null}}}}</li>
<li>BOLA / IDOR — <code>GET /api/accounts/9999</code></li>
<li>Mass assignment — <code>POST /api/profile</code> {{"role":"admin"}}</li>
<li>JWT alg:none forgery — <code>GET /api/me</code> with a forged bearer token</li>
<li>XXE — <code>POST /api/import</code> (XML)</li>
<li>GraphQL introspection — <code>POST /graphql</code></li>
<li>Prototype pollution — <code>POST /api/merge</code> {{"__proto__":{{"admin":true}}}}</li>
<li>Open redirect — <code>/api/redirect?to=https://evil.example</code></li>
<li>HTTP request smuggling — <code>POST /api/batch</code> with a pipelined <code>GET /admin HTTP/1.1</code></li>
</ul>
""")


# ------------------------------------------------------------------ web vulns
def h_search(q):
    # reflected XSS: q goes into HTML unescaped
    return page(f"<h1>Search</h1><p>Results for: {q}</p><p>No products matched.</p>")


def h_products(cat):
    query = f"SELECT id,name,price FROM products WHERE category='{cat}'"
    leaked = re.search(r"union\s+select|'\s*or\s*'1'\s*=\s*'1|--", cat, re.I)
    rows = [{"id": 1, "name": "Deposit account", "price": 0}]
    note = ""
    if leaked:
        # injection "succeeds": dump a sensitive table through the union
        rows += [{"id": "users.admin", "name": "admin", "price": USERS["admin"]["password"]},
                 {"id": "cards", "name": "4111 11•• •••• 9999", "price": 71230411.55}]
        note = "-- injection succeeded: adjacent tables dumped"
    return js({"query": query, "note": note, "rows": rows})


STMT_DIR = os.environ.get("STMT_DIR", "/srv/statements")


def h_statement(fname):
    # path traversal: no sanitisation, genuinely read the file
    base = STMT_DIR
    path = os.path.join(base, fname)
    try:
        with open(path, "r", errors="replace") as f:
            data = f.read(4000)
        return page(f"<h1>Statement: {html.escape(fname)}</h1><pre>{html.escape(data)}</pre>")
    except Exception as e:
        # /etc/passwd etc. resolves for real via ../
        real = os.path.normpath(path)
        if real.startswith("/") and os.path.exists(real) and not real.startswith(base):
            with open(real, "r", errors="replace") as f:
                return page(f"<h1 class=bad>Leaked {html.escape(real)}</h1><pre>{html.escape(f.read(4000))}</pre>")
        return page(f"<h1>Statement</h1><p class=bad>error: {html.escape(str(e))}</p>", 404)


def h_ping(host):
    cmd = f"ping -c1 {host}"
    inj = re.search(r"[;&|`]|\$\(", host)
    out = "1 packets transmitted, 1 received, 0% packet loss"
    if inj:
        # command chaining "runs": simulate the injected command's output
        out = "uid=0(root) gid=0(root) groups=0(root)\nroot:x:0:0:root:/root:/bin/bash"
    return page(f"<h1>Branch health</h1><p>ran: <code>{html.escape(cmd)}</code></p><pre>{html.escape(out)}</pre>")


_TPL = re.compile(r"\{\{\s*(.+?)\s*\}\}")


def h_render(tpl):
    # SSTI: template expressions are evaluated against a small context
    def ev(m):
        expr = m.group(1)
        if "config" in expr or "secret" in expr.lower():
            return CONFIG_SECRET
        if re.fullmatch(r"[\d\s+\-*/().]+", expr):
            try:
                return str(eval(expr, {"__builtins__": {}}, {}))  # arithmetic only
            except Exception:
                return "?"
        return html.escape(expr)
    rendered = _TPL.sub(ev, tpl)
    return page(f"<h1>Receipt</h1><p>{rendered}</p>")


# ------------------------------------------------------------- CVEs & SSRF
_JNDI = re.compile(r"\$\{jndi:(\w+)://([^}]+)\}", re.I)


def h_lookup(user):
    m = _JNDI.search(user)
    if m:
        scheme, target = m.group(1), m.group(2)
        return page("<h1 class=bad>Directory lookup</h1>"
                    f"<p>log line: <code>User {html.escape(user)} logged in</code></p>"
                    f"<pre>[log4j] resolving JNDI {html.escape(scheme)}://{html.escape(target)}\n"
                    "→ outbound connect to attacker LDAP\n"
                    "→ deserialize + load remote class → REMOTE CODE EXECUTION</pre>")
    return page(f"<h1>Directory lookup</h1><p>user: {html.escape(user)} — found.</p>")


def h_bind(qs):
    # Spring4Shell: binder walks class.module.classLoader.* to poison a log file
    if any(k.startswith("class.module.classLoader") or "class." in k for k in qs):
        return page("<h1 class=bad>Data binding</h1><pre>ClassLoader manipulated via request params\n"
                    "→ Tomcat AccessLogValve repointed → webshell written → RCE</pre>")
    return page("<h1>Data binding</h1><p>ok</p>")


def h_fetch(url):
    # SSRF: server fetches attacker-controlled URL; internal targets leak creds
    host = urlparse(url).hostname or ""
    internal = host in ("169.254.169.254", "metadata.google.internal", "localhost",
                        "127.0.0.1", "100.100.100.200") or host.startswith(("10.", "192.168.", "172."))
    if internal:
        return js({"url": url, "ssrf": True,
                   "leaked": {"Code": "Success", "AccessKeyId": "ASIA...STOLEN",
                              "SecretAccessKey": "wJalr...", "Token": "IQoJb3JpZ2..."}})
    return js({"url": url, "preview": "200 OK image/png 3.1kB"})


# --------------------------------------------------------------- API vulns
def h_api_login(body):
    try:
        d = json.loads(body or "{}")
    except Exception:
        return js({"error": "bad json"}, 400)
    u, p = d.get("user"), d.get("pass")
    rec = USERS.get(u)
    ok = False
    bypass = False
    if rec:
        if isinstance(p, dict):            # NoSQL operator injection: {"$ne": null}
            ok = bypass = True
        elif p == rec["password"]:
            ok = True
    if ok:
        tok = _sign_jwt({"sub": u, "role": rec["role"]})
        return js({"ok": True, "nosql_bypass": bypass, "token": tok, "role": rec["role"]})
    return js({"ok": False}, 401)


def h_api_account(aid):
    # BOLA/IDOR: any id returns full detail with no ownership/authz check
    acc = ACCOUNTS.get(aid)
    if not acc:
        return js({"error": "not found"}, 404)
    return js({"id": aid, **acc, "note": "no authorization check — any caller reads any account"})


def h_api_profile(body):
    # mass assignment: whole JSON blindly merged, incl. privileged fields
    try:
        d = json.loads(body or "{}")
    except Exception:
        return js({"error": "bad json"}, 400)
    profile = {"user": "you", "role": "user", "balance": 42.10}
    profile.update(d)   # <-- no allowlist
    return js({"saved": profile, "escalated": profile.get("role") == "admin" or profile.get("isAdmin") is True})


def _b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def _sign_jwt(payload):
    h = _b64url(json.dumps({"alg": "HS256", "typ": "JWT"}).encode())
    p = _b64url(json.dumps(payload).encode())
    return f"{h}.{p}.c2lnbmF0dXJl"


def _decode_jwt(tok):
    try:
        h, p, s = tok.split(".")
        header = json.loads(base64.urlsafe_b64decode(h + "=="))
        payload = json.loads(base64.urlsafe_b64decode(p + "=="))
        return header, payload, s
    except Exception:
        return None, None, None


def h_api_me(auth):
    # JWT alg:none — signature not verified when header says alg=none
    tok = auth.split(" ", 1)[1] if auth.lower().startswith("bearer ") else ""
    header, payload, sig = _decode_jwt(tok)
    if not header:
        return js({"error": "no token"}, 401)
    if header.get("alg", "").lower() == "none" or sig == "":
        return js({"identity": payload, "forged": True,
                   "note": "alg:none accepted — signature never checked"})
    return js({"identity": payload, "forged": False})


def h_api_import(body):
    # XXE: external entity is resolved against the local filesystem
    ent = re.search(r'<!ENTITY\s+\w+\s+SYSTEM\s+"([^"]+)"', body or "", re.I)
    if ent:
        target = ent.group(1)
        leaked = "root:x:0:0:root:/root:/bin/bash\nacme:x:1000:1000::/home/acme:/bin/sh"
        return js({"xxe": True, "resolved": target, "leaked_file": leaked})
    return js({"imported": True})


def h_graphql(body):
    if "__schema" in (body or "") or "IntrospectionQuery" in (body or ""):
        return js({"data": {"__schema": {"types": [
            {"name": "Query"}, {"name": "Account"}, {"name": "Card"},
            {"name": "Mutation", "fields": ["transfer", "issueCard", "grantAdmin"]}]}},
            "note": "introspection enabled — full schema and hidden mutations exposed"})
    return js({"data": {"ping": "pong"}})


def h_api_merge(body):
    # prototype pollution: recursive merge honours __proto__
    try:
        d = json.loads(body or "{}")
    except Exception:
        return js({"error": "bad json"}, 400)
    polluted = "__proto__" in json.dumps(d) or "constructor" in json.dumps(d)
    return js({"merged": d, "prototype_polluted": polluted,
               "effect": "every object now has admin=true" if polluted else "none"})


def h_api_redirect(to):
    return 302, to, None  # open redirect: unvalidated Location


_SMUGGLE = re.compile(
    r"(?:\r?\n|^)\s*(GET|POST|PUT|DELETE|HEAD|OPTIONS|PATCH|CONNECT|TRACE)\s+(\S+)\s+HTTP/\d",
    re.I,
)


def h_api_batch(body):
    # HTTP request smuggling (CWE-444): a naive "batch" endpoint that treats
    # trailing pipelined bytes as a second request and processes it with no auth.
    # This simulates a front-end/back-end desync in-process — the back-end runs
    # the smuggled request line as if it were a fresh, trusted request.
    m = _SMUGGLE.search(body or "")
    if m:
        method, target = m.group(1).upper(), m.group(2)
        acc = ACCOUNTS.get(target.rsplit("/", 1)[-1])
        return js({
            "batch": "accepted", "smuggled": True, "desync": True,
            "smuggled_request": f"{method} {target}",
            "note": "trailing pipelined request processed as a second, "
                    "unauthenticated request — front/back-end desync",
            "leaked": acc or {"admin_panel": "/admin reached via desync, no auth"},
        })
    return js({"batch": "accepted", "items": 0})


# ------------------------------------------------------------------- router
class H(BaseHTTPRequestHandler):
    server_version = "AcmePay/1.0"

    def _send(self, status, ctype, body):
        if status == 302:            # open-redirect helper reuses ctype as Location
            self.send_response(302)
            self.send_header("Location", ctype)
            self.end_headers()
            return
        data = body.encode() if isinstance(body, str) else body
        self.send_response(status)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        self.send_header("X-Origin-Pod", POD)
        self.end_headers()
        self.wfile.write(data)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0) or 0)
        return self.rfile.read(n).decode("utf-8", "replace") if n else ""

    def do_GET(self):
        u = urlparse(self.path)
        p = u.path
        q = parse_qs(u.query, keep_blank_values=True)
        one = lambda k: (q.get(k) or [""])[0]
        if p in ("/", ""):                 return self._send(*LANDING)
        if p in ("/health", "/ping-alive"): return self._send(200, "text/plain", "ok")
        if p == "/search":                 return self._send(*h_search(one("q")))
        if p == "/products":               return self._send(*h_products(one("cat")))
        if p == "/statement":              return self._send(*h_statement(one("file")))
        if p == "/ping":                   return self._send(*h_ping(one("host")))
        if p == "/render":                 return self._send(*h_render(one("tpl")))
        if p == "/lookup":                 return self._send(*h_lookup(one("user")))
        if p == "/bind":                   return self._send(*h_bind(list(q.keys())))
        if p == "/fetch":                  return self._send(*h_fetch(one("url")))
        if p.startswith("/api/accounts/"): return self._send(*h_api_account(p.rsplit("/", 1)[-1]))
        if p == "/api/me":                 return self._send(*h_api_me(self.headers.get("Authorization", "")))
        if p == "/api/redirect":           return self._send(*h_api_redirect(one("to")))
        return self._send(*page("<h1>404</h1>", 404))

    def do_POST(self):
        p = urlparse(self.path).path
        b = self._body()
        if p == "/api/login":   return self._send(*h_api_login(b))
        if p == "/api/profile": return self._send(*h_api_profile(b))
        if p == "/api/import":  return self._send(*h_api_import(b))
        if p == "/graphql":     return self._send(*h_graphql(b))
        if p == "/api/merge":   return self._send(*h_api_merge(b))
        if p == "/api/batch":   return self._send(*h_api_batch(b))
        return self._send(*js({"error": "not found"}, 404))

    def log_message(self, *a):
        pass


if __name__ == "__main__":
    os.makedirs(STMT_DIR, exist_ok=True)
    with open(os.path.join(STMT_DIR, "welcome.txt"), "w") as f:
        f.write("Welcome to Acme Pay. Your latest statement is attached.\n")
    port = int(os.environ.get("PORT", "8080"))
    print(f"Acme Pay (vulnerable) listening on :{port} pod={POD}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), H).serve_forever()
