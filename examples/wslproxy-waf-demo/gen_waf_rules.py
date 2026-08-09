#!/usr/bin/env python3
"""Generate the modern + API-security WAF rule JSON files and the hardened policy
for the wslproxy WAF demo. Patterns are written as native Python strings so json
handles all backslash escaping — hand-editing regex inside JSON is error-prone."""
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
RULES_DIR = os.path.join(HERE, "data", "waf_rules", "prod")
POL_DIR = os.path.join(HERE, "data", "waf_policies", "prod")
os.makedirs(RULES_DIR, exist_ok=True)
os.makedirs(POL_DIR, exist_ok=True)
TS = 1740000000

# id, name, category, severity, target, pattern, action, score, tags, description
NEW_RULES = [
    ("waf-rule-ssti-001", "SSTI - Template Expression Injection", "ssti", "high", "all",
     r"(?:\{\{[^}]{0,120}?\}\}|\{%[^%]{0,120}?%\}|<%=?[^>]{0,120}?%>|#\{[^}]{0,120}?\})",
     "block", 8, ["api-security", "ssti", "beyond-owasp"],
     "Detects server-side template injection using Jinja/Twig {{...}}, {%...%}, ERB/JSP <%...%> or Ruby #{...} expression syntax."),
    ("waf-rule-log4shell-001", "RCE - Log4Shell JNDI Lookup (CVE-2021-44228)", "rce", "critical", "all",
     r"(?i)\$\{jndi:(?:ldap|ldaps|rmi|dns|iiop|nis|corba|http)s?:",
     "block", 10, ["cve-2021-44228", "log4shell", "rce", "beyond-owasp"],
     "Detects Log4Shell exploitation: a ${jndi:...} lookup that makes Log4j fetch and execute a remote class."),
    ("waf-rule-log4shell-002", "RCE - Log4j Obfuscated Lookup", "rce", "high", "all",
     r"(?i)\$\{(?:\$\{|lower:|upper:|env:|sys:|java:|date:|main:|::-)",
     "block", 8, ["cve-2021-44228", "log4shell", "evasion"],
     "Detects obfuscated Log4j lookups (${lower:}, ${env:}, ${::-}, nested ${${...}}) used to evade naive jndi filters."),
    ("waf-rule-ssrf-001", "SSRF - Cloud Metadata / Internal Target", "ssrf", "high", "all",
     r"(?i)(?:169\.254\.169\.254|metadata\.google\.internal|100\.100\.100\.200|/latest/meta-data|fd00:ec2:|metadata\.azure\.com)",
     "block", 8, ["api-security", "ssrf", "beyond-owasp"],
     "Detects SSRF aimed at cloud instance-metadata endpoints (AWS/GCP/Azure/Alibaba) to steal instance credentials."),
    ("waf-rule-ssrf-002", "SSRF - Dangerous URL Scheme", "ssrf", "medium", "all",
     r"(?i)\b(?:gopher|dict|file|ftp|ldap)://",
     "block", 6, ["api-security", "ssrf"],
     "Detects non-HTTP URL schemes (gopher/dict/file/ftp/ldap) commonly used to pivot SSRF into internal services or file reads."),
    ("waf-rule-nosqli-001", "NoSQL Injection - Query Operator", "nosqli", "high", "all",
     r"(?:\$ne|\$gt|\$gte|\$lt|\$lte|\$regex|\$where|\$exists|\$elemMatch|\$in)\b",
     "block", 8, ["api-security", "nosqli", "beyond-owasp"],
     "Detects MongoDB/JSON query-operator injection ($ne, $gt, $regex, $where, ...) used to bypass authentication or extract data."),
    ("waf-rule-jwt-none-001", "Broken Auth - JWT alg:none Forgery", "jwt", "high", "all",
     r"eyJhbGciOiJ(?:ub25l|Ob25l|OT05F)",
     "block", 8, ["api-security", "jwt", "broken-auth", "beyond-owasp"],
     "Detects a forged JWT whose header declares alg:none (base64url eyJhbGciOiJub25l...), accepted only by servers that skip signature verification."),
    ("waf-rule-protopollute-001", "Prototype Pollution", "proto-pollution", "high", "all",
     r"(?:__proto__|constructor\.prototype|\bprototype\b\s*\[|\"constructor\"\s*:)",
     "block", 8, ["api-security", "prototype-pollution", "beyond-owasp"],
     "Detects JavaScript prototype-pollution payloads (__proto__, constructor.prototype) that mutate Object.prototype to escalate privileges."),
    ("waf-rule-xxe-001", "XXE - XML External Entity", "xxe", "high", "all",
     r"(?i)<!ENTITY\b|<!DOCTYPE[^>]{0,200}(?:SYSTEM|PUBLIC)\b",
     "block", 9, ["api-security", "xxe", "beyond-owasp"],
     "Detects XML External Entity payloads (<!ENTITY ... SYSTEM ...>) used to read local files or perform SSRF via XML parsers."),
    ("waf-rule-graphql-introspection-001", "API - GraphQL Introspection", "graphql", "medium", "all",
     r"(?i)__schema\b|IntrospectionQuery|__typename\b|\bqueryType\b",
     "block", 5, ["api-security", "graphql", "recon", "beyond-owasp"],
     "Detects GraphQL introspection queries that map the full schema, including hidden mutations, aiding targeted attacks."),
    ("waf-rule-openredirect-001", "Open Redirect", "redirect", "medium", "url",
     r"(?i)[?&](?:to|url|next|redirect|return|dest|continue|goto)=(?:https?%3a|https?:|//|%2f%2f)",
     "block", 6, ["owasp-top10", "open-redirect", "a01"],
     "Detects open-redirect payloads where a redirect parameter points to an absolute external URL, enabling phishing and token theft."),
    ("waf-rule-spring4shell-001", "RCE - Spring4Shell ClassLoader (CVE-2022-22965)", "rce", "critical", "all",
     r"(?i)class\.module\.classLoader|class\[[\"']module[\"']\]",
     "block", 9, ["cve-2022-22965", "spring4shell", "rce", "beyond-owasp"],
     "Detects Spring4Shell data-binding exploitation that walks class.module.classLoader.* to write a webshell and gain RCE."),
    ("waf-rule-scanner-ua-001", "Recon - Security Scanner User-Agent", "scanner", "medium", "user_agent",
     r"(?i)\b(?:sqlmap|nikto|nmap|masscan|nuclei|acunetix|nessus|whatweb|dirbuster|gobuster|ffuf|feroxbuster|wpscan|havij|zgrab|arachni|xsser|commix)\b",
     "block", 10, ["bot-defense", "scanner", "recon"],
     "Blocks requests whose User-Agent identifies an automated vulnerability scanner or fuzzing tool."),
    ("waf-rule-lfi-003", "LFI - Encoded Traversal / Sensitive File", "lfi", "high", "all",
     r"(?i)(?:\.\.%2f|\.\.%5c|%2e%2e/|%252e%252e)|/etc/passwd\b|/proc/self/environ|\bwin\.ini\b|\bboot\.ini\b",
     "block", 8, ["owasp-top10", "lfi", "a01", "evasion"],
     "Detects URL-encoded path traversal and direct references to sensitive OS files, catching evasions that plain ../ rules miss."),
    ("waf-rule-cmdi-json-001", "Command Injection - Substitution / Chaining", "cmdi", "critical", "all",
     r"(?:\$\([^)]{0,80}\)|`[^`]{0,80}`|(?:\|\||&&|;)\s*(?:id|cat|curl|wget|nc|bash|sh|python|whoami)\b)",
     "block", 9, ["owasp-top10", "cmdi", "a03"],
     "Detects command substitution $(...) / backticks and shell chaining (||, &&, ;) into common binaries, in body or query."),
    ("waf-rule-massassign-001", "API - Mass Assignment of Privileged Field", "mass-assignment", "high", "body",
     r"(?i)\"(?:role|isadmin|is_admin|admin|grant|privilege|is_superuser)\"\s*:\s*\"?(?:admin|true|root|superuser|1)\"?",
     "block", 7, ["api-security", "mass-assignment", "beyond-owasp"],
     "Detects mass-assignment payloads that set privileged fields (role, isAdmin, grant) in a request body — fields a client must never control on this API."),
]

POLICY_ID = "waf-policy-payments-hard"

BASE_OWASP = [
    "waf-rule-sqli-001", "waf-rule-sqli-002", "waf-rule-sqli-003", "waf-rule-sqli-004",
    "waf-rule-sqli-005", "waf-rule-sqli-006", "waf-rule-sqli-007",
    "waf-rule-xss-001", "waf-rule-xss-002", "waf-rule-xss-003", "waf-rule-xss-004", "waf-rule-xss-005",
    "waf-rule-cmdi-001", "waf-rule-cmdi-002", "waf-rule-cmdi-003", "waf-rule-cmdi-004",
    "waf-rule-lfi-001", "waf-rule-lfi-002", "waf-rule-proto-001", "waf-rule-proto-002",
]


def main():
    ids = []
    for (rid, name, cat, sev, target, pattern, action, score, tags, desc) in NEW_RULES:
        ids.append(rid)
        rule = {
            "id": rid, "name": name, "description": desc,
            "category": cat, "severity": sev, "enabled": True,
            "target": target, "pattern": pattern, "pattern_type": "regex",
            "action": action, "score": score, "tags": tags,
            "profile_id": "prod", "created_at": TS, "updated_at": TS,
        }
        with open(os.path.join(RULES_DIR, rid + ".json"), "w") as f:
            json.dump(rule, f, indent=2)
        # self-check: every pattern must be a valid regex
        import re
        re.compile(pattern)

    block_html = (
        "<!doctype html><meta charset=utf-8><title>Request blocked</title>"
        "<style>body{font:16px/1.6 system-ui,sans-serif;background:#0b1020;color:#e5e7eb;"
        "display:grid;place-items:center;height:100vh;margin:0}.c{max-width:34rem;text-align:center;"
        "padding:2.5rem;background:#111827;border:1px solid #1f2937;border-radius:16px}"
        ".s{font-size:56px}h1{color:#f87171;margin:.4rem 0}code{color:#93c5fd}"
        ".f{color:#6b7280;font-size:13px;margin-top:1.5rem}</style>"
        "<div class=c><div class=s>&#128737;</div><h1>403 &mdash; Request blocked</h1>"
        "<p>This request matched a Web Application Firewall rule and was stopped before "
        "reaching the application.</p>"
        "<p class=f>Support ID: <code style='color:#93c5fd'>{{support_id}}</code></p>"
        "<p class=f>Protected by <b>WSLProxy WAF</b> &middot; modern &amp; API threat rules</p></div>"
    )
    import base64
    policy = {
        "id": POLICY_ID,
        "name": "Payments API — Hardened (modern + API)",
        "description": "F5-competitive WAF policy: OWASP Top 10 plus SSTI, Log4Shell, Spring4Shell, "
                       "SSRF, NoSQLi, XXE, JWT alg:none, prototype pollution, GraphQL introspection, "
                       "open redirect and scanner detection. Block mode.",
        "profile_id": "prod", "enabled": True,
        # v2: enforcementMode is the F5-style alias; `mode` kept for back-compat.
        "schema_version": 2, "enforcementMode": "blocking", "mode": "block",
        "service": "payments",
        "waf_rules": BASE_OWASP + ids,
        "paranoia_level": 2, "anomaly_threshold": 6,
        "body_inspection": True, "max_body_size": 1048576,

        # --- v2: signature governance -------------------------------------
        "signatureSets": [
            {"id": "SET_SQLI", "alarm": True, "block": True},
            {"id": "SET_XSS", "alarm": True, "block": True},
            {"id": "SET_RCE", "alarm": True, "block": True},
            {"id": "SET_SSRF", "alarm": True, "block": True},
            {"id": "SET_SSTI", "alarm": True, "block": True},
        ],
        "signatures": {
            # Newly-added rules ship in "staging": they alarm (log-only) until the
            # date, then enforce — the safe-rollout pattern F5 operators expect.
            "stage": [{"id": "waf-rule-openredirect-001", "until": "2026-12-31T00:00:00Z"}],
            "disable": [],
        },

        # --- v2: positive-security & protocol stages ----------------------
        "methods": {"allow": ["GET", "POST", "HEAD", "OPTIONS"]},
        "filetypes": {"deny": [".env", ".sql", ".bak", ".git", ".ini", ".pem", ".key"]},
        "geo": {"denyCountries": ["KP"]},
        "ipLists": {"allow": ["127.0.0.1"], "deny": []},

        # --- v2: API controls ---------------------------------------------
        "jwt": {"header": "Authorization", "denyAlg": ["none", "HS256"],
                "requireAlg": ["RS256", "ES256"], "verifySignature": False},
        "jsonProfile": {"maxDepth": 8, "maxBytes": 16384},
        "bruteForce": [{"path": "/api/login", "windowSec": 60, "maxAttempts": 5,
                        "action": "block", "keyBy": ["ip"]}],

        # --- v2 (P2): OpenAPI positive security on the API surface --------
        # Only declared path+method pairs under /api are allowed; an undeclared
        # endpoint or wrong method is rejected before it reaches the app.
        "openapi": {
            "basePath": "/api",
            "paths": [
                {"path": "/api/login", "methods": ["POST"]},
                {"path": "/api/accounts/{id}", "methods": ["GET"]},
                {"path": "/api/profile", "methods": ["POST"]},
                {"path": "/api/me", "methods": ["GET"]},
                {"path": "/api/import", "methods": ["POST"]},
                {"path": "/api/merge", "methods": ["POST"]},
                {"path": "/api/redirect", "methods": ["GET"]},
            ],
        },

        # --- v2: binding precedence (route > service > domain) ------------
        # /preview runs transparent (alarm-only) even though the policy blocks —
        # demonstrating a route override lowering enforcement for one path.
        "routeOverrides": [{"path": "/preview", "enforcementMode": "transparent"}],

        "logging": {"profile": "verbose", "destination": "syslog"},
        "blocked_response": {
            "status_code": 403, "content_type": "text/html",
            "body_base64": base64.b64encode(block_html.encode()).decode(),
        },
        "whitelist": {"ips": ["127.0.0.1"],
                      "paths": ["/health", "/.well-known/acme-challenge/"],
                      "user_agents": []},
        "created_at": TS, "updated_at": TS,
    }
    with open(os.path.join(POL_DIR, POLICY_ID + ".json"), "w") as f:
        json.dump(policy, f, indent=2)

    print(f"wrote {len(ids)} new rules + policy referencing {len(BASE_OWASP)+len(ids)} rules")
    print("new rule ids:", " ".join(ids))


if __name__ == "__main__":
    main()
