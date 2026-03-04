-- MCP Resource Schemas
-- Defines the structure of MCP resources and resource list responses
-- Each WSLProxy domain object maps to a typed MCP resource

local _M = {
    type = "wslproxy.mcp.resource",
    version = "1.0.0",
    description = "MCP resource response containing structured gateway data"
}

-- Resource response envelope (returned by /mcp/resources/{id})
_M.properties = {
    jsonrpc = {
        type = "string",
        required = true,
        enum = {"2.0"}
    },
    result = {
        type = "object",
        required = true,
        properties = {
            contents = {
                type = "array",
                required = true,
                description = "Resource content items",
                items = {
                    type = "object",
                    properties = {
                        uri = { type = "string", required = true, description = "Resource URI" },
                        mimeType = { type = "string", required = true, description = "Content MIME type" },
                        data = { type = "object", required = true, description = "Resource data payload" }
                    }
                }
            }
        }
    }
}

-- Resource list schema (returned by /mcp/resources)
_M.list_schema = {
    type = "wslproxy.mcp.resource_list",
    version = "1.0.0",
    description = "List of all available MCP resources",
    properties = {
        jsonrpc = { type = "string", required = true, enum = {"2.0"} },
        result = {
            type = "object",
            required = true,
            properties = {
                resources = {
                    type = "array",
                    required = true,
                    items = {
                        type = "object",
                        properties = {
                            uri = { type = "string", required = true },
                            name = { type = "string", required = true },
                            description = { type = "string", required = true },
                            mimeType = { type = "string", required = true },
                            metadata = { type = "object", required = false }
                        }
                    }
                }
            }
        }
    }
}

-----------------------------------------------------------
-- Typed resource schemas for each WSLProxy domain object
-----------------------------------------------------------

-- wslproxy.server resource schema
_M.server = {
    type = "wslproxy.server",
    version = "1.0.0",
    description = "HTTP virtual host / server configuration",
    properties = {
        id = { type = "string", required = true, description = "Unique server identifier (UUID)" },
        server_name = { type = "string", required = true, description = "Server hostname / domain" },
        profile_id = { type = "string", required = true, description = "Environment profile (dev/staging/prod)" },
        listens = { type = "array", required = false, description = "Listen directives (port and protocol)" },
        ssl_enabled = { type = "boolean", required = false, description = "Whether SSL/TLS is enabled" },
        config_status = { type = "boolean", required = false, description = "Whether NGINX config is generated" },
        created_at = { type = "number", required = false, description = "Creation timestamp (epoch)" },
        updated_at = { type = "number", required = false, description = "Last update timestamp (epoch)" },
        custom_headers = { type = "object", required = false, description = "Custom HTTP response headers" },
        cache_enabled = { type = "boolean", required = false, description = "Whether caching is enabled" },
        waf_enabled = { type = "boolean", required = false, description = "Whether WAF inspection is enabled" },
        waf_policy_id = { type = "string", required = false, description = "Bound WAF policy identifier" },
        waf_mode_override = { type = "string", required = false, description = "Per-server WAF mode override (block/monitor)", enum = {"block", "monitor"} },
        rate_limit_enabled = { type = "boolean", required = false, description = "Whether rate limiting is enabled" },
        rate_limit = { type = "object", required = false, description = "Rate limit settings (requests_per_second, burst)" },
        varnish_enabled = { type = "boolean", required = false, description = "Whether Varnish reverse proxy/cache is enabled" }
    },
    relationships = {
        rules = { type = "wslproxy.rule", cardinality = "many", description = "Security rules applied to this server" },
        ssl = { type = "wslproxy.ssl", cardinality = "one", description = "SSL configuration for this server" },
        cache = { type = "wslproxy.cache", cardinality = "one", description = "Cache configuration" },
        waf_policy = { type = "wslproxy.waf_policy", cardinality = "one", description = "Bound WAF policy" },
        varnish = { type = "wslproxy.varnish", cardinality = "one", description = "Varnish proxy/cache configuration" }
    }
}

-- wslproxy.rule resource schema
_M.rule = {
    type = "wslproxy.rule",
    version = "1.0.0",
    description = "Security rule or HTTP routing policy",
    properties = {
        id = { type = "string", required = true, description = "Unique rule identifier (UUID)" },
        name = { type = "string", required = true, description = "Rule name" },
        profile_id = { type = "string", required = true, description = "Environment profile" },
        priority = { type = "number", required = false, description = "Rule evaluation priority (lower = first)" },
        version = { type = "number", required = false, description = "Rule version number" },
        match = {
            type = "object",
            required = false,
            description = "Match conditions (path, country, client IP, JWT)",
            properties = {
                rules = {
                    type = "object",
                    properties = {
                        path_key = { type = "string", description = "Path match operator (starts_with, equals, regex)" },
                        path = { type = "string", description = "URL path to match" },
                        country_key = { type = "string", description = "Country match operator" },
                        country = { type = "string", description = "ISO country code" },
                        client_ip_key = { type = "string", description = "IP match operator" },
                        client_ip = { type = "string", description = "Client IP or CIDR" }
                    }
                }
            }
        },
        response = {
            type = "object",
            required = false,
            description = "Response action when rule matches",
            properties = {
                allow = { type = "boolean", description = "Whether to allow or deny" },
                code = { type = "number", description = "HTTP status code" },
                message = { type = "string", description = "Response body (base64 encoded)" }
            }
        },
        created_at = { type = "number", required = false, description = "Creation timestamp" },
        updated_at = { type = "number", required = false, description = "Last update timestamp" }
    },
    relationships = {
        server = { type = "wslproxy.server", cardinality = "many", description = "Servers referencing this rule" }
    }
}

-- wslproxy.upstream resource schema
_M.upstream = {
    type = "wslproxy.upstream",
    version = "1.0.0",
    description = "Backend upstream server pool",
    properties = {
        id = { type = "string", required = true, description = "Upstream identifier" },
        name = { type = "string", required = false, description = "Upstream name" },
        profile = { type = "string", required = false, description = "Environment profile" },
        servers = {
            type = "array",
            required = false,
            description = "Backend server addresses",
            items = {
                type = "object",
                properties = {
                    address = { type = "string", description = "Server address (host:port)" },
                    weight = { type = "number", description = "Load balancing weight" }
                }
            }
        },
        algorithm = {
            type = "string",
            required = false,
            description = "Load balancing algorithm",
            enum = {"round-robin", "least-connections", "ip-hash", "random"}
        },
        health_check = { type = "object", required = false, description = "Health check configuration" }
    },
    relationships = {
        servers = { type = "wslproxy.server", cardinality = "many", description = "Servers using this upstream" }
    }
}

-- wslproxy.profile resource schema
_M.profile = {
    type = "wslproxy.profile",
    version = "1.0.0",
    description = "Deployment environment profile",
    properties = {
        id = { type = "string", required = true, description = "Profile identifier (e.g., prod, dev, staging)" },
        name = { type = "string", required = true, description = "Profile display name" },
        server_count = { type = "number", required = true, description = "Number of servers in this profile" }
    },
    relationships = {
        servers = { type = "wslproxy.server", cardinality = "many", description = "Servers in this profile" },
        rules = { type = "wslproxy.rule", cardinality = "many", description = "Rules in this profile" }
    }
}

-- wslproxy.ssl resource schema
_M.ssl = {
    type = "wslproxy.ssl",
    version = "1.0.0",
    description = "SSL/TLS certificate configuration",
    properties = {
        domain = { type = "string", required = true, description = "Domain name" },
        ssl_enabled = { type = "boolean", required = false, description = "SSL enabled flag" },
        ssl_auto_renew = { type = "boolean", required = false, description = "Auto-renewal via Let's Encrypt" },
        ssl_force_https = { type = "boolean", required = false, description = "Force HTTPS redirect" },
        ssl_email = { type = "string", required = false, description = "Contact email for certificate" },
        created_at = { type = "number", required = false, description = "Creation timestamp" }
    },
    relationships = {
        server = { type = "wslproxy.server", cardinality = "one", description = "Server this SSL config belongs to" }
    }
}

-- wslproxy.cache resource schema
_M.cache = {
    type = "wslproxy.cache",
    version = "1.0.0",
    description = "Static content cache configuration",
    properties = {
        server_name = { type = "string", required = true, description = "Server domain name" },
        cache_enabled = { type = "boolean", required = false, description = "Whether caching is active" },
        cache_ttl = { type = "number", required = false, description = "Cache TTL in seconds" },
        cached_extensions = { type = "array", required = false, description = "File extensions to cache" },
        updated_at = { type = "number", required = false, description = "Last update timestamp" }
    },
    relationships = {
        server = { type = "wslproxy.server", cardinality = "one", description = "Server this cache config belongs to" }
    }
}

-- wslproxy.health resource schema
_M.health = {
    type = "wslproxy.health",
    version = "1.0.0",
    description = "Gateway health status and diagnostics",
    properties = {
        status = {
            type = "string",
            required = true,
            description = "Overall health status",
            enum = {"healthy", "degraded", "unhealthy"}
        },
        timestamp = { type = "number", required = true, description = "Check timestamp (epoch)" },
        datetime = { type = "string", required = true, description = "ISO 8601 datetime" },
        openresty = {
            type = "object",
            required = true,
            description = "OpenResty worker information",
            properties = {
                worker_pid = { type = "number", description = "Current worker PID" },
                worker_count = { type = "number", description = "Total worker count" }
            }
        },
        mcp = {
            type = "object",
            required = true,
            description = "MCP server status",
            properties = {
                enabled = { type = "boolean" },
                mode = { type = "string", enum = {"read-only", "read-write"} },
                version = { type = "string" }
            }
        },
        shared_dicts = {
            type = "object",
            required = false,
            description = "NGINX shared dictionary status"
        }
    }
}

-- wslproxy.metrics resource schema
_M.metrics = {
    type = "wslproxy.metrics",
    version = "1.0.0",
    description = "Aggregated traffic metrics (non-PII, non-secret)",
    properties = {
        timestamp = { type = "number", required = true, description = "Metrics timestamp (epoch)" },
        datetime = { type = "string", required = true, description = "ISO 8601 datetime" },
        traffic = {
            type = "object",
            required = false,
            description = "Traffic statistics",
            properties = {
                total_requests_24h = { type = "number" },
                total_success_24h = { type = "number" },
                total_errors_24h = { type = "number" },
                success_rate = { type = "number" },
                avg_requests_per_hour = { type = "number" }
            }
        },
        connections = {
            type = "object",
            required = true,
            description = "Active NGINX connections",
            properties = {
                reading = { type = "number" },
                writing = { type = "number" },
                waiting = { type = "number" },
                active = { type = "number" }
            }
        },
        latency = { type = "object", required = false, description = "Latency distribution" },
        request_methods = { type = "object", required = false, description = "Request method distribution" },
        top_domains = { type = "array", required = false, description = "Top domains by request count" },
        error_codes = { type = "object", required = false, description = "Error code breakdown" }
    }
}

-- wslproxy.settings resource schema
_M.settings = {
    type = "wslproxy.settings",
    version = "1.0.0",
    description = "Non-sensitive gateway configuration settings",
    properties = {
        storage_type = { type = "string", required = false, description = "Data storage type" },
        ssl_staging = { type = "boolean", required = false, description = "SSL staging mode flag" },
        ssl_ocsp_stapling = { type = "boolean", required = false, description = "OCSP stapling enabled" },
        dns_resolver = { type = "string", required = false, description = "DNS resolver address" },
        mcp = { type = "object", required = false, description = "MCP configuration (secrets redacted)" }
    }
}

-- wslproxy.waf_rule resource schema
_M.waf_rule = {
    type = "wslproxy.waf_rule",
    version = "1.0.0",
    description = "WAF detection rule with regex/string pattern matching",
    properties = {
        id = { type = "string", required = true, description = "Unique WAF rule identifier" },
        name = { type = "string", required = true, description = "Rule display name" },
        description = { type = "string", required = false, description = "Rule description" },
        category = { type = "string", required = true, description = "Attack category (sqli, xss, cmdi, lfi, rfi, protocol, custom)" },
        severity = { type = "string", required = false, description = "Severity level (critical, high, medium, low, info)" },
        enabled = { type = "boolean", required = false, description = "Whether this rule is active" },
        target = { type = "string", required = true, description = "Request component to inspect (url, headers, body, args, cookies, user_agent, all)" },
        pattern = { type = "string", required = true, description = "Detection pattern (regex or string)" },
        pattern_type = { type = "string", required = false, description = "Pattern matching type (regex or string)" },
        action = { type = "string", required = true, description = "Action when pattern matches (block, monitor, allow)" },
        score = { type = "number", required = false, description = "Anomaly score contribution" },
        tags = { type = "array", required = false, description = "Classification tags" },
        profile_id = { type = "string", required = false, description = "Environment profile" },
        created_at = { type = "number", required = false, description = "Creation timestamp" },
        updated_at = { type = "number", required = false, description = "Last update timestamp" }
    }
}

-- wslproxy.waf_policy resource schema
_M.waf_policy = {
    type = "wslproxy.waf_policy",
    version = "1.0.0",
    description = "WAF policy grouping rules with mode and threshold settings",
    properties = {
        id = { type = "string", required = true, description = "Unique WAF policy identifier" },
        name = { type = "string", required = true, description = "Policy display name" },
        description = { type = "string", required = false, description = "Policy description" },
        mode = { type = "string", required = true, description = "Enforcement mode (block or monitor)" },
        enabled = { type = "boolean", required = false, description = "Whether this policy is active" },
        waf_rules = { type = "array", required = false, description = "List of WAF rule IDs" },
        anomaly_threshold = { type = "number", required = false, description = "Score threshold for blocking" },
        paranoia_level = { type = "number", required = false, description = "Detection sensitivity (1-4)" },
        body_inspection = { type = "boolean", required = false, description = "Whether to inspect request bodies" },
        max_body_size = { type = "number", required = false, description = "Max body size to inspect (bytes)" },
        whitelist = { type = "object", required = false, description = "Whitelisted IPs, paths, user-agents" },
        profile_id = { type = "string", required = false, description = "Environment profile" },
        created_at = { type = "number", required = false, description = "Creation timestamp" },
        updated_at = { type = "number", required = false, description = "Last update timestamp" }
    }
}

-- wslproxy.gateway_config resource schema (composite view of server gateway settings)
_M.gateway_config = {
    type = "wslproxy.gateway_config",
    version = "1.0.0",
    description = "Virtual Server gateway configuration: WAF binding, rate limiting, security posture",
    properties = {
        id = { type = "string", required = true, description = "Server identifier" },
        server_name = { type = "string", required = true, description = "Server hostname" },
        profile_id = { type = "string", required = true, description = "Environment profile" },
        waf_enabled = { type = "boolean", required = true, description = "Whether WAF inspection is active" },
        waf_policy_id = { type = "string", required = false, description = "Bound WAF policy identifier" },
        waf_mode_override = { type = "string", required = false, description = "Per-server WAF mode override", enum = {"block", "monitor"} },
        rate_limit_enabled = { type = "boolean", required = true, description = "Whether rate limiting is active" },
        rate_limit = { type = "object", required = false, description = "Rate limit settings (requests_per_second, burst)" },
        ssl_enabled = { type = "boolean", required = false, description = "Whether SSL/TLS is enabled" },
        cache_enabled = { type = "boolean", required = false, description = "Whether caching is enabled" }
    },
    relationships = {
        waf_policy = { type = "wslproxy.waf_policy", cardinality = "one", description = "Bound WAF policy" },
        profile = { type = "wslproxy.profile", cardinality = "one", description = "Environment profile" }
    }
}

-- wslproxy.waf_event resource schema
_M.waf_event = {
    type = "wslproxy.waf_event",
    version = "1.0.0",
    description = "WAF inspection event (blocked or monitored request)",
    properties = {
        id = { type = "string", required = true, description = "Event identifier" },
        timestamp = { type = "number", required = true, description = "Event timestamp (epoch)" },
        type = { type = "string", required = true, description = "Event type (blocked, monitored, error)" },
        host = { type = "string", required = false, description = "Request host" },
        rule_id = { type = "string", required = false, description = "Matching WAF rule ID" },
        rule_name = { type = "string", required = false, description = "Matching WAF rule name" },
        category = { type = "string", required = false, description = "Attack category" },
        severity = { type = "string", required = false, description = "Rule severity" },
        client_ip = { type = "string", required = false, description = "Client IP address" },
        uri = { type = "string", required = false, description = "Request URI" },
        method = { type = "string", required = false, description = "HTTP method" },
        score = { type = "number", required = false, description = "Anomaly score" },
        matched_data = { type = "string", required = false, description = "Matched pattern snippet" }
    }
}

-- wslproxy.varnish resource schema
_M.varnish = {
    type = "wslproxy.varnish",
    version = "1.0.0",
    description = "Varnish reverse proxy/cache configuration per server",
    properties = {
        server_name = { type = "string", required = true, description = "Server domain name" },
        varnish_enabled = { type = "boolean", required = false, description = "Whether Varnish is active" },
        listen_port = { type = "number", required = false, description = "Varnish listen port" },
        listen_address = { type = "string", required = false, description = "Varnish listen address" },
        cache_ttl_default = { type = "number", required = false, description = "Default cache TTL in seconds" },
        cache_grace = { type = "number", required = false, description = "Grace period in seconds" },
        cache_size = { type = "string", required = false, description = "Cache storage size" },
        health_check_enabled = { type = "boolean", required = false, description = "Backend health check enabled" },
        snippet_count = { type = "number", required = false, description = "Number of VCL snippets" },
        deploy_status = { type = "object", required = false, description = "Last deployment status" },
        updated_at = { type = "number", required = false, description = "Last update timestamp" }
    },
    relationships = {
        server = { type = "wslproxy.server", cardinality = "one", description = "Server this Varnish config belongs to" }
    }
}

return _M
