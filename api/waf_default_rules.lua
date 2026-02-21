-- WAF Default Rules Module
-- Built-in OWASP-inspired detection patterns for common attack vectors
-- These are used to seed data/waf_rules/{profile}/ via the /api/waf_rules/seed endpoint
--
-- Categories: sqli, xss, cmdi, lfi, protocol
-- Severity: critical, high, medium, low, info
-- Targets: url, headers, body, args, cookies, user_agent, all

local _M = {}

_M.rules = {
    -- ========================================================================
    -- SQL INJECTION (sqli)
    -- ========================================================================
    {
        id = "waf-rule-sqli-001",
        name = "SQL Injection - UNION SELECT",
        description = "Detects UNION SELECT SQL injection attempts used to extract data from databases",
        category = "sqli",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "(?i)(?:union\\s+(?:all\\s+)?select)",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "sqli", "a03" }
    },
    {
        id = "waf-rule-sqli-002",
        name = "SQL Injection - SELECT FROM",
        description = "Detects SELECT ... FROM SQL query patterns in request parameters",
        category = "sqli",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "(?i)(?:select\\s+.{1,200}?\\s+from\\s+)",
        pattern_type = "regex",
        action = "block",
        score = 8,
        tags = { "owasp-top10", "sqli", "a03" }
    },
    {
        id = "waf-rule-sqli-003",
        name = "SQL Injection - INSERT/UPDATE/DELETE",
        description = "Detects SQL data manipulation statements in request parameters",
        category = "sqli",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "(?i)(?:(?:insert\\s+into|update\\s+.{1,200}?\\s+set|delete\\s+from)\\s+)",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "sqli", "a03" }
    },
    {
        id = "waf-rule-sqli-004",
        name = "SQL Injection - DROP/ALTER/TRUNCATE",
        description = "Detects destructive SQL DDL statements (DROP TABLE, ALTER, TRUNCATE)",
        category = "sqli",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "(?i)(?:(?:drop|alter|truncate)\\s+(?:table|database|column|index))",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "sqli", "a03" }
    },
    {
        id = "waf-rule-sqli-005",
        name = "SQL Injection - Boolean-Based (OR 1=1)",
        description = "Detects boolean-based SQL injection tautologies (OR 1=1, OR 'a'='a')",
        category = "sqli",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "(?i)(?:\\bor\\b\\s+['\"]?\\d['\"]?\\s*=\\s*['\"]?\\d|\\bor\\b\\s+['\"][^'\"]+['\"]\\s*=\\s*['\"])",
        pattern_type = "regex",
        action = "block",
        score = 8,
        tags = { "owasp-top10", "sqli", "a03" }
    },
    {
        id = "waf-rule-sqli-006",
        name = "SQL Injection - Comment Sequences",
        description = "Detects SQL comment patterns used to terminate injected queries (-- , /*, */)",
        category = "sqli",
        severity = "medium",
        enabled = true,
        target = "url",
        pattern = "(?:--\\s*$|;\\s*--|/\\*|\\*/)",
        pattern_type = "regex",
        action = "monitor",
        score = 4,
        tags = { "owasp-top10", "sqli", "a03" }
    },
    {
        id = "waf-rule-sqli-007",
        name = "SQL Injection - Time-Based (SLEEP/BENCHMARK)",
        description = "Detects time-based blind SQL injection using SLEEP() or BENCHMARK() functions",
        category = "sqli",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "(?i)(?:benchmark\\s*\\(|sleep\\s*\\(|waitfor\\s+delay|pg_sleep)",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "sqli", "a03", "blind" }
    },

    -- ========================================================================
    -- CROSS-SITE SCRIPTING (xss)
    -- ========================================================================
    {
        id = "waf-rule-xss-001",
        name = "XSS - Script Tag Injection",
        description = "Detects <script> tag injection attempts",
        category = "xss",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "(?i)<\\s*script[\\s>]",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "xss", "a07" }
    },
    {
        id = "waf-rule-xss-002",
        name = "XSS - JavaScript Protocol Handler",
        description = "Detects javascript: protocol handler injection in URLs or attributes",
        category = "xss",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "(?i)javascript\\s*:",
        pattern_type = "regex",
        action = "block",
        score = 8,
        tags = { "owasp-top10", "xss", "a07" }
    },
    {
        id = "waf-rule-xss-003",
        name = "XSS - Event Handler Attributes",
        description = "Detects HTML event handler injection (onerror, onload, onclick, etc.)",
        category = "xss",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "(?i)\\bon(?:error|load|click|mouseover|focus|blur|submit|change|input|keydown|keyup|mouseout|dblclick)\\s*=",
        pattern_type = "regex",
        action = "block",
        score = 8,
        tags = { "owasp-top10", "xss", "a07" }
    },
    {
        id = "waf-rule-xss-004",
        name = "XSS - HTML Tag Injection",
        description = "Detects injection of HTML tags with src/data attributes (img, svg, iframe, object, embed)",
        category = "xss",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "(?i)<\\s*(?:img|svg|iframe|object|embed|video|audio|link|meta)\\b[^>]*(?:src|data|href|content)\\s*=",
        pattern_type = "regex",
        action = "block",
        score = 8,
        tags = { "owasp-top10", "xss", "a07" }
    },
    {
        id = "waf-rule-xss-005",
        name = "XSS - DOM Manipulation",
        description = "Detects DOM-based XSS via document.cookie, document.location, window.location access",
        category = "xss",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "(?i)(?:document\\.(?:cookie|location|write|domain)|window\\.(?:location|open)|eval\\s*\\()",
        pattern_type = "regex",
        action = "block",
        score = 8,
        tags = { "owasp-top10", "xss", "a07", "dom" }
    },

    -- ========================================================================
    -- COMMAND INJECTION (cmdi)
    -- ========================================================================
    {
        id = "waf-rule-cmdi-001",
        name = "Command Injection - Semicolon Chaining",
        description = "Detects OS command injection via semicolon chaining (;cat, ;ls, ;id, etc.)",
        category = "cmdi",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "(?:;\\s*(?:cat|ls|id|pwd|whoami|uname|wget|curl|nc|netcat|bash|sh|python|perl|ruby|php|chmod|chown)\\b)",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "cmdi", "a03" }
    },
    {
        id = "waf-rule-cmdi-002",
        name = "Command Injection - Pipe Injection",
        description = "Detects OS command injection via pipe operator (|cat, |ls, |id, etc.)",
        category = "cmdi",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "(?:\\|\\s*(?:cat|ls|id|pwd|whoami|uname|wget|curl|nc|netcat|bash|sh|python|perl|ruby|php)\\b)",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "cmdi", "a03" }
    },
    {
        id = "waf-rule-cmdi-003",
        name = "Command Injection - Backtick Execution",
        description = "Detects command execution via backtick syntax (`command`)",
        category = "cmdi",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "`[^`]+`",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "cmdi", "a03" }
    },
    {
        id = "waf-rule-cmdi-004",
        name = "Command Injection - Subshell Execution",
        description = "Detects command execution via $() subshell syntax",
        category = "cmdi",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "\\$\\([^)]+\\)",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "cmdi", "a03" }
    },

    -- ========================================================================
    -- LOCAL FILE INCLUSION / PATH TRAVERSAL (lfi)
    -- ========================================================================
    {
        id = "waf-rule-lfi-001",
        name = "Path Traversal - Directory Traversal Sequences",
        description = "Detects directory traversal attempts using ../ sequences",
        category = "lfi",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "(?:\\.\\./){2,}",
        pattern_type = "regex",
        action = "block",
        score = 8,
        tags = { "owasp-top10", "lfi", "a01" }
    },
    {
        id = "waf-rule-lfi-002",
        name = "Path Traversal - Sensitive File Access",
        description = "Detects attempts to access sensitive system files (passwd, shadow, hosts)",
        category = "lfi",
        severity = "critical",
        enabled = true,
        target = "url",
        pattern = "(?i)(?:etc/(?:passwd|shadow|hosts|group)|proc/self/(?:environ|cmdline|maps))",
        pattern_type = "regex",
        action = "block",
        score = 10,
        tags = { "owasp-top10", "lfi", "a01" }
    },

    -- ========================================================================
    -- PROTOCOL VIOLATIONS (protocol)
    -- ========================================================================
    {
        id = "waf-rule-proto-001",
        name = "Protocol Violation - Null Byte Injection",
        description = "Detects null byte injection (%00) used to bypass file extension checks",
        category = "protocol",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "%00",
        pattern_type = "string",
        action = "block",
        score = 8,
        tags = { "protocol", "bypass" }
    },
    {
        id = "waf-rule-proto-002",
        name = "Protocol Violation - CRLF Injection",
        description = "Detects CRLF injection (%0d%0a) used for HTTP response splitting",
        category = "protocol",
        severity = "high",
        enabled = true,
        target = "url",
        pattern = "(?i)%0d%0a",
        pattern_type = "string",
        action = "block",
        score = 8,
        tags = { "protocol", "response-splitting" }
    }
}

-- Return seed rules as a flat array
function _M.get_rules()
    return _M.rules
end

-- Get rules for writing to disk as JSON files
function _M.get_seed_data(profile_id)
    profile_id = profile_id or "prod"
    local seed = {}
    local now = os.time(os.date("!*t"))
    for _, rule in ipairs(_M.rules) do
        local r = {}
        for k, v in pairs(rule) do
            r[k] = v
        end
        r.profile_id = profile_id
        r.created_at = now
        r.updated_at = now
        table.insert(seed, r)
    end
    return seed
end

-- Get default policy referencing all seed rules
function _M.get_default_policy(profile_id)
    profile_id = profile_id or "prod"
    local rule_ids = {}
    for _, rule in ipairs(_M.rules) do
        table.insert(rule_ids, rule.id)
    end
    local now = os.time(os.date("!*t"))
    return {
        id = "waf-policy-default",
        name = "Default WAF Policy",
        description = "Standard WAF protection with OWASP-inspired rules. Starts in monitor mode for safe rollout.",
        profile_id = profile_id,
        enabled = true,
        mode = "monitor",
        waf_rules = rule_ids,
        paranoia_level = 1,
        anomaly_threshold = 5,
        body_inspection = true,
        max_body_size = 1048576,
        blocked_response = {
            status_code = 403,
            content_type = "text/html"
        },
        whitelist = {
            ips = { "127.0.0.1" },
            paths = { "/health", "/ping", "/metrics", "/.well-known/acme-challenge/" },
            user_agents = {}
        },
        created_at = now,
        updated_at = now
    }
end

return _M
