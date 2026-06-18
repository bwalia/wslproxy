-- MCP Tools Module for WSLProxy
-- Feature-flagged tools that allow controlled actions
-- All tools require explicit enablement and are gated by MCP mode

local _M = {}

local cjson = Cjson or require("cjson")
local McpConfig = require("mcp.config")

-- Tool definitions (schemas for AI agents)
_M.TOOL_REGISTRY = {
    {
        name = "validate_config",
        description = "Validate the current OpenResty/NGINX configuration without applying changes. Runs 'openresty -t' in dry-run mode and returns syntax check results.",
        inputSchema = {
            type = "object",
            properties = {},
            required = {}
        },
        annotations = {
            title = "Validate NGINX Config",
            readOnlyHint = true,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "get_error_logs",
        description = "Fetch the most recent OpenResty error log entries (last 10KB). Sensitive information is automatically redacted.",
        inputSchema = {
            type = "object",
            properties = {
                lines = {
                    type = "number",
                    description = "Maximum number of lines to return (default: 100, max: 500)"
                }
            },
            required = {}
        },
        annotations = {
            title = "Get Error Logs",
            readOnlyHint = true,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "reload_config",
        description = "Reload the OpenResty/NGINX configuration. Performs a syntax check first and only reloads if the config is valid. This is a controlled operation that does not cause downtime.",
        inputSchema = {
            type = "object",
            properties = {
                dry_run = {
                    type = "boolean",
                    description = "If true, only validate without reloading (default: true)"
                }
            },
            required = {}
        },
        annotations = {
            title = "Reload Config",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "bind_waf_policy",
        description = "Bind a WAF policy to a Virtual Server. Sets waf_enabled=true and associates the specified WAF policy. Optionally override enforcement mode per-server. Idempotent: calling again with same args is a no-op.",
        inputSchema = {
            type = "object",
            properties = {
                server_id = {
                    type = "string",
                    description = "Server config filename (e.g., 'host:example.com.json')"
                },
                waf_policy_id = {
                    type = "string",
                    description = "WAF policy filename (e.g., 'owasp-standard.json')"
                },
                mode_override = {
                    type = "string",
                    description = "Optional per-server mode override: 'block' or 'monitor'. Null = use policy default."
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile (default: 'prod')"
                }
            },
            required = {"server_id", "waf_policy_id"}
        },
        annotations = {
            title = "Bind WAF Policy to Server",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "unbind_waf_policy",
        description = "Remove WAF policy binding from a Virtual Server. Sets waf_enabled=false and clears WAF policy ID and mode override. Idempotent: calling on a server with no WAF binding is a no-op.",
        inputSchema = {
            type = "object",
            properties = {
                server_id = {
                    type = "string",
                    description = "Server config filename (e.g., 'host:example.com.json')"
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile (default: 'prod')"
                }
            },
            required = {"server_id"}
        },
        annotations = {
            title = "Unbind WAF Policy from Server",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "test_waf_rule",
        description = "Test a WAF rule pattern against sample input. Validates the regex pattern and checks if it matches the provided test string. Read-only, safe for AI agents.",
        inputSchema = {
            type = "object",
            properties = {
                pattern = {
                    type = "string",
                    description = "The regex or string pattern to test"
                },
                test_input = {
                    type = "string",
                    description = "The sample input string to test against"
                },
                pattern_type = {
                    type = "string",
                    description = "Pattern type: 'regex' (default) or 'string'"
                }
            },
            required = {"pattern", "test_input"}
        },
        annotations = {
            title = "Test WAF Rule Pattern",
            readOnlyHint = true,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "update_traffic_split",
        description = "Update traffic weight distribution for a rule's backends. Adjusts the percentage of traffic routed to each backend (e.g., 90% stable / 10% canary). Weights are normalized to sum to 100%. Changes take effect immediately without nginx reload.",
        inputSchema = {
            type = "object",
            properties = {
                rule_id = {
                    type = "string",
                    description = "The rule ID to update traffic weights for"
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile (default: 'prod')"
                },
                backends = {
                    type = "array",
                    description = "Array of backend weight updates",
                    items = {
                        type = "object",
                        properties = {
                            label = {
                                type = "string",
                                description = "Backend label (e.g., 'stable', 'canary')"
                            },
                            weight = {
                                type = "number",
                                description = "New weight percentage (0-100)"
                            }
                        },
                        required = {"label", "weight"}
                    }
                }
            },
            required = {"rule_id", "backends"}
        },
        annotations = {
            title = "Update Traffic Split Weights",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "promote_backend",
        description = "Promote a backend to receive 100% of traffic for a rule. Used to complete a canary deployment by shifting all traffic to the canary backend. All other backends are set to 0% weight. The rule's redirect_uri is updated to point to the promoted backend.",
        inputSchema = {
            type = "object",
            properties = {
                rule_id = {
                    type = "string",
                    description = "The rule ID containing the backend to promote"
                },
                promote_label = {
                    type = "string",
                    description = "Label of the backend to promote (e.g., 'canary')"
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile (default: 'prod')"
                }
            },
            required = {"rule_id", "promote_label"}
        },
        annotations = {
            title = "Promote Backend to 100%",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "rollback_backend",
        description = "Rollback a rule to single-backend routing by removing the backends array and routing configuration. Restores the rule to use only its redirect_uri for routing. Use this to undo a canary or A/B test deployment.",
        inputSchema = {
            type = "object",
            properties = {
                rule_id = {
                    type = "string",
                    description = "The rule ID to rollback to single-backend routing"
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile (default: 'prod')"
                }
            },
            required = {"rule_id"}
        },
        annotations = {
            title = "Rollback to Single Backend",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "deploy_varnish",
        description = "Deploy Varnish VCL configuration for a server. Generates VCL from config + snippets, validates syntax, loads into Varnish, and updates nginx routing. Supports dry_run for validation only. Rolls back on failure.",
        inputSchema = {
            type = "object",
            properties = {
                server_id = {
                    type = "string",
                    description = "Server config filename (e.g., 'host:example.com')"
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile (default: 'prod')"
                },
                dry_run = {
                    type = "boolean",
                    description = "If true, generate and validate VCL without deploying (default: true)"
                }
            },
            required = {"server_id"}
        },
        annotations = {
            title = "Deploy Varnish Configuration",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "purge_varnish",
        description = "Purge cached content from Varnish for a server. Supports URL pattern purging or full cache ban.",
        inputSchema = {
            type = "object",
            properties = {
                server_id = {
                    type = "string",
                    description = "Server config filename (e.g., 'host:example.com')"
                },
                url_pattern = {
                    type = "string",
                    description = "URL regex pattern to purge (default: '.*' for full purge)"
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile (default: 'prod')"
                }
            },
            required = {"server_id"}
        },
        annotations = {
            title = "Purge Varnish Cache",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "create_server",
        description = "Create a new Virtual Server in the specified profile.  Generates a minimal nginx server block, persists the server JSON, and (by default) leaves `config_status: false` so the server is staged but not yet active in nginx — a human can review in the dashboard and flip the activation flag.  Use `activate: true` to immediately activate (writes the .conf and signals reload).  Idempotent against `server_name`+`profile_id`: returns 409 if the server already exists.",
        inputSchema = {
            type = "object",
            properties = {
                server_name = {
                    type = "string",
                    description = "Domain to serve (e.g. 'api.example.com').  Becomes the server's id as `host:<server_name>`."
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile.  Required — do NOT default to prod from MCP; the caller must be explicit."
                },
                proxy_pass = {
                    type = "string",
                    description = "Default backend the rules fall through to (e.g. 'http://127.0.0.1:8080').  Most setups override this per-rule, so the value mostly matters when no rule matches."
                },
                ssl_enabled = {
                    type = "boolean",
                    description = "Enable TLS via Let's Encrypt auto-ssl.  Adds a 443 listener + ACME challenge block.  Default: false."
                },
                ssl_force_https = {
                    type = "boolean",
                    description = "When ssl_enabled, also emit a port-80 redirect block sending HTTP → HTTPS.  Default: same as ssl_enabled."
                },
                ssl_email = {
                    type = "string",
                    description = "Contact email for Let's Encrypt notifications.  Required when ssl_enabled+ssl_auto_renew."
                },
                ssl_auto_renew = {
                    type = "boolean",
                    description = "Auto-renew the cert before expiry.  Default: true when ssl_enabled."
                },
                activate = {
                    type = "boolean",
                    description = "Set config_status:true AND write the .conf into /opt/nginx/conf.d/ AND signal a reload.  Default: false — staged-only is the safer default for an LLM-driven create.  Flip to true only when the caller has confirmed."
                },
                dry_run = {
                    type = "boolean",
                    description = "If true, do NOT write any files — return the JSON that WOULD be created.  Useful for showing the proposed config to a human before commit.  Default: false."
                }
            },
            required = {"server_name", "profile_id"}
        },
        annotations = {
            title = "Create Virtual Server",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "create_rule",
        description = "Create a new routing rule and optionally attach it to one or more existing servers.  Supports response codes 200 (static HTML), 301/302 (HTTP redirect), 305 (reverse proxy — the common case), 306 (CAPTCHA challenge), and 403 (static block page).  For 3xx + 305, `redirect_uri` is the backend / redirect target.  Returns 409 if a rule with the same `name` already exists in the profile.",
        inputSchema = {
            type = "object",
            properties = {
                name = {
                    type = "string",
                    description = "Human-readable rule name.  Must be unique within the profile."
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile.  Required."
                },
                priority = {
                    type = "integer",
                    description = "Lower = evaluated earlier.  Default: 100."
                },
                path = {
                    type = "string",
                    description = "URL path to match.  Default: '/' (matches everything when paired with path_key starts_with)."
                },
                path_key = {
                    type = "string",
                    enum = {"starts_with", "equals", "ends_with"},
                    description = "How `path` is compared against the request URI.  Default: 'starts_with'."
                },
                country = {
                    type = "string",
                    description = "Optional country code or comma-separated list (e.g. 'US,UK').  Empty = no country filter."
                },
                country_key = {
                    type = "string",
                    enum = {"equals", "not_equals"},
                    description = "Comparator for `country`.  Default: 'equals'."
                },
                client_ip = {
                    type = "string",
                    description = "Optional client IP / CIDR (e.g. '10.0.0.0/8').  Empty = no IP filter."
                },
                client_ip_key = {
                    type = "string",
                    enum = {"equals", "not_equals", "starts_with"},
                    description = "Comparator for `client_ip`.  Default: 'equals'."
                },
                response_code = {
                    type = "integer",
                    enum = {200, 301, 302, 305, 306, 403},
                    description = "200=static HTML body, 301/302=redirect, 305=proxy_pass (the normal routing case), 306=CAPTCHA, 403=block."
                },
                redirect_uri = {
                    type = "string",
                    description = "For 305: the backend URL (e.g. 'https://backend.internal:8080').  For 301/302: the redirect target.  Required for 301/302/305."
                },
                message = {
                    type = "string",
                    description = "For 200/403: plain HTML body to serve.  Will be base64-encoded for storage."
                },
                strip_path = {
                    type = "boolean",
                    description = "For 305: strip the matched path prefix before forwarding (e.g. /api/foo → /foo if path=/api).  Default: false."
                },
                auto_redirect_https = {
                    type = "boolean",
                    description = "Force the backend connection to use https:// even if the inbound was http://.  Default: false."
                },
                servers = {
                    type = "array",
                    items = {type = "string"},
                    description = "Optional list of server ids (e.g. ['host:api.example.com']) to attach this rule to.  The rule is created either way; if this is present the listed servers are also updated to reference it."
                },
                dry_run = {
                    type = "boolean",
                    description = "If true, return the rule JSON that WOULD be created without writing.  Default: false."
                }
            },
            required = {"name", "profile_id", "response_code"}
        },
        annotations = {
            title = "Create Routing Rule",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "attach_rule",
        description = "Attach an EXISTING rule to a server.  Two mechanisms exist on the data model and rule_loader.lua reads both: `rules` (string or array, always AND-mode) and `match_cases` (array of {statement, condition}, per-rule AND/OR).  Default `method` is `match_cases` because it's additive — adding a rule there never touches an existing `rules` entry.  Idempotent: if the rule is already attached (in either field), returns success without writing.",
        inputSchema = {
            type = "object",
            properties = {
                rule_id = {
                    type = "string",
                    description = "The rule's id (e.g. uuid from create_rule, or a slug like 'wslproxy-org-rule')."
                },
                server_id = {
                    type = "string",
                    description = "The server's id, including the host: prefix (e.g. 'host:api.example.com')."
                },
                profile_id = {
                    type = "string",
                    description = "Environment profile.  Must match the profile both the rule and the server live in."
                },
                condition = {
                    type = "string",
                    enum = {"and", "or"},
                    description = "Match mode.  'and' = this rule must match alongside any others; 'or' = matching this alone is enough.  Default: 'and'.  Only meaningful when method=match_cases (the `rules` field is AND-only by design)."
                },
                method = {
                    type = "string",
                    enum = {"match_cases", "rules"},
                    description = "Which field to write to.  `match_cases` (default) is additive and safer.  `rules` is the historical primary field — pick this only if you specifically want the rule there.  Cannot use `rules` with condition=or; the field has no OR mode."
                },
                dry_run = {
                    type = "boolean",
                    description = "If true, return the server JSON that WOULD be written without persisting.  Default: false."
                }
            },
            required = {"rule_id", "server_id", "profile_id"}
        },
        annotations = {
            title = "Attach Rule to Server",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "update_server",
        description = "Update fields on an existing Virtual Server.  Partial update — only fields you pass are changed; everything else stays.  Forbids changes to `server_name`, `profile_id`, and `id` because those would require a rename + file move (use delete+create instead).  When `ssl_enabled` or `ssl_force_https` change, the generated `config` field is regenerated.  Does NOT touch /opt/nginx/conf.d/ or signal a reload — call `reload_config` afterward if you need nginx to pick up live config changes.",
        inputSchema = {
            type = "object",
            properties = {
                server_id = {type = "string", description = "Server id, e.g. 'host:api.example.com'."},
                profile_id = {type = "string", description = "Environment profile.  Must match the server's profile."},
                proxy_pass = {type = "string", description = "Default backend the rules fall through to."},
                ssl_enabled = {type = "boolean", description = "Enable / disable TLS.  Changing this regenerates the nginx config block."},
                ssl_force_https = {type = "boolean", description = "Add the port-80 → 443 redirect block.  Changing this regenerates config."},
                ssl_email = {type = "string", description = "Contact email for Let's Encrypt."},
                ssl_auto_renew = {type = "boolean", description = "Auto-renew the cert before expiry."},
                ssl_staging = {type = "boolean", description = "Use Let's Encrypt staging (for testing — produces untrusted certs)."},
                cache_enabled = {type = "boolean", description = "Enable Varnish caching for this server."},
                config_status = {type = "boolean", description = "Whether nginx treats this server as active.  Flipping this DOES NOT auto-reload nginx — call reload_config separately."},
                custom_headers = {type = "array", items = {type = "object"}, description = "Custom response headers to add."},
                dry_run = {type = "boolean", description = "If true, return the updated JSON that WOULD be written.  Default: false."}
            },
            required = {"server_id", "profile_id"}
        },
        annotations = {
            title = "Update Virtual Server",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "update_rule",
        description = "Update fields on an existing rule.  Partial update — only fields you pass are changed.  Forbids changes to `id` and `profile_id`.  Useful for changing priority, swapping a backend, tweaking path matching, or repointing a redirect — without touching rule attachments on servers.",
        inputSchema = {
            type = "object",
            properties = {
                rule_id = {type = "string", description = "Rule id (uuid or slug) to update."},
                profile_id = {type = "string", description = "Environment profile.  Must match the rule's profile."},
                name = {type = "string", description = "Human-readable rule name."},
                priority = {type = "integer", description = "Lower = evaluated earlier."},
                path = {type = "string", description = "URL path to match."},
                path_key = {type = "string", enum = {"starts_with", "equals", "ends_with"}, description = "How `path` is compared."},
                country = {type = "string", description = "Country code(s) filter, comma-separated."},
                country_key = {type = "string", enum = {"equals", "not_equals"}, description = "Country comparator."},
                client_ip = {type = "string", description = "Client IP / CIDR filter."},
                client_ip_key = {type = "string", enum = {"equals", "not_equals", "starts_with"}, description = "IP comparator."},
                response_code = {type = "integer", enum = {200, 301, 302, 305, 306, 403}, description = "Response code."},
                redirect_uri = {type = "string", description = "Backend / redirect target."},
                message = {type = "string", description = "For 200/403: HTML body (will be base64-encoded)."},
                strip_path = {type = "boolean", description = "For 305: strip the matched path prefix before forwarding."},
                auto_redirect_https = {type = "boolean", description = "Force https:// backend connection."},
                dry_run = {type = "boolean", description = "If true, return the updated JSON without writing.  Default: false."}
            },
            required = {"rule_id", "profile_id"}
        },
        annotations = {
            title = "Update Routing Rule",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "delete_server",
        description = "Delete a Virtual Server.  Destructive — requires `confirm: true` or the call returns a preview of what WOULD be deleted (analogous to dry_run but the inverse default).  Also detaches the server from any rules whose `servers` array references it (those rules keep existing, just minus this server).  If `config_status` was true, also removes /opt/nginx/conf.d/<name>.conf AND touches the reboot flag so the cron watcher picks up the removal.",
        inputSchema = {
            type = "object",
            properties = {
                server_id = {type = "string", description = "Server id (e.g. 'host:api.example.com')."},
                profile_id = {type = "string", description = "Environment profile."},
                confirm = {type = "boolean", description = "Must be true to actually delete.  Default false = preview-only.  This is the destructive-action gate; do NOT set true from an LLM call without explicit human approval."}
            },
            required = {"server_id", "profile_id"}
        },
        annotations = {
            title = "Delete Virtual Server",
            readOnlyHint = false,
            destructiveHint = true,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "delete_rule",
        description = "Delete a routing rule.  Destructive — requires `confirm: true` or returns a preview.  Also detaches the rule from every server that references it (servers' `rules` field AND `match_cases` array), so the deletion is clean — no stale references left behind that would silently no-op at request time.",
        inputSchema = {
            type = "object",
            properties = {
                rule_id = {type = "string", description = "Rule id to delete."},
                profile_id = {type = "string", description = "Environment profile."},
                confirm = {type = "boolean", description = "Must be true to actually delete.  Default false = preview-only."}
            },
            required = {"rule_id", "profile_id"}
        },
        annotations = {
            title = "Delete Routing Rule",
            readOnlyHint = false,
            destructiveHint = true,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    -- ──────────────────────────────────────────────────────────────
    -- POPs (Points of Presence) — the edge locations running wslproxy.
    -- Servers reference these by id (in `pop_ids`) to decide which
    -- POPs serve them.  The DNS provisioner reads the same list to
    -- decide which Cloudflare A records to publish.
    -- ──────────────────────────────────────────────────────────────
    {
        name = "list_pops",
        description = "List all POPs (Points of Presence) with optional filtering by status / region.  Read-only.  Returns id, display_name, public_ipv4, region, city, status, capacity_weight, tags for each.  Use this to discover available POPs before assigning them to a server or provisioning DNS.",
        inputSchema = {
            type = "object",
            properties = {
                status = {type = "string", description = "Optional filter: only POPs with this status ('active', 'draining', 'maintenance', 'down')."},
                region = {type = "string", description = "Optional filter: only POPs in this region (e.g. 'eu-west-1')."},
                q = {type = "string", description = "Optional free-text search across id/display_name/city/region/public_ipv4/provider."},
                limit = {type = "integer", description = "Max number of POPs to return (default 100, cap 500)."}
            },
            required = {}
        },
        annotations = {
            title = "List POPs",
            readOnlyHint = true,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "get_pop",
        description = "Fetch a single POP by id.  Read-only.  Returns the full record including metadata, lat/lng, country_code, provider, and timestamps.",
        inputSchema = {
            type = "object",
            properties = {
                pop_id = {type = "string", description = "POP id (e.g. 'pop0', 'lon1', 'us-east-1')."}
            },
            required = {"pop_id"}
        },
        annotations = {
            title = "Get POP",
            readOnlyHint = true,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "create_pop",
        description = "Create a new POP.  The id must be lowercase alphanumeric with optional dashes (2-32 chars, e.g. 'pop0', 'lon1', 'us-east-1').  public_ipv4 is required and must be a valid IPv4 address — this is the IP that DNS provisioning will publish.  Returns the created record.  Default behaviour is to actually create; pass dry_run=true to preview the validated payload without writing.",
        inputSchema = {
            type = "object",
            properties = {
                id = {type = "string", description = "Slug id, lowercase alphanumeric with optional dashes (e.g. 'lon2', 'us-west-1')."},
                display_name = {type = "string", description = "Human-readable name (e.g. 'London POP 2')."},
                public_ipv4 = {type = "string", description = "Public IPv4 address — the A record content DNS provisioning will publish."},
                public_ipv6 = {type = "string", description = "Optional public IPv6 address."},
                region = {type = "string", description = "Region identifier (e.g. 'eu-west-1')."},
                city = {type = "string", description = "City name."},
                country_code = {type = "string", description = "ISO 3166-1 alpha-2 (e.g. 'GB', 'US')."},
                provider = {type = "string", description = "Hosting provider name (e.g. 'aws', 'linode')."},
                status = {type = "string", description = "One of 'active', 'draining', 'maintenance', 'down' (default 'active')."},
                capacity_weight = {type = "number", description = "Routing weight in [0, 10]; 1.0 = default, 0 = drain (default 1.0)."},
                tags = {type = "array", items = {type = "string"}, description = "Optional tags (default [])."},
                dry_run = {type = "boolean", description = "If true, validates the payload but doesn't write.  Default false = actually create."}
            },
            required = {"id", "public_ipv4"}
        },
        annotations = {
            title = "Create POP",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = false,
            openWorldHint = false
        }
    },
    {
        name = "update_pop",
        description = "Update an existing POP by id.  Partial updates supported — only fields provided are changed.  Use this to flip status (drain → active), adjust capacity_weight, or fix metadata.  Default behaviour is to actually update; pass dry_run=true to preview.",
        inputSchema = {
            type = "object",
            properties = {
                pop_id = {type = "string", description = "POP id to update."},
                display_name = {type = "string"},
                public_ipv4 = {type = "string"},
                public_ipv6 = {type = "string"},
                region = {type = "string"},
                city = {type = "string"},
                country_code = {type = "string"},
                provider = {type = "string"},
                status = {type = "string", description = "One of 'active', 'draining', 'maintenance', 'down'."},
                capacity_weight = {type = "number"},
                tags = {type = "array", items = {type = "string"}},
                dry_run = {type = "boolean", description = "If true, validates the update but doesn't write.  Default false."}
            },
            required = {"pop_id"}
        },
        annotations = {
            title = "Update POP",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    {
        name = "delete_pop",
        description = "Delete a POP.  Destructive — requires `confirm: true` or returns a preview of which servers currently reference it.  If any server references the POP and `force: true` is not set, the call refuses with 409 + the list of referencing servers.  When `force: true`, every referencing server is detached (pop removed from its pop_ids) before the POP file is deleted.  If ANY detach fails, the whole operation aborts to avoid dangling pop_ids.",
        inputSchema = {
            type = "object",
            properties = {
                pop_id = {type = "string", description = "POP id to delete."},
                confirm = {type = "boolean", description = "Must be true to actually delete.  Default false = preview which servers would be affected."},
                force = {type = "boolean", description = "If true and servers reference this POP, detach them first then delete.  Default false = refuse if referenced."}
            },
            required = {"pop_id"}
        },
        annotations = {
            title = "Delete POP",
            readOnlyHint = false,
            destructiveHint = true,
            idempotentHint = true,
            openWorldHint = false
        }
    },
    -- ──────────────────────────────────────────────────────────────
    -- DNS Manager (Cloudflare provisioning).
    -- These talk to the live Cloudflare API.  lookup_dns is read-
    -- only.  provision_dns mutates external state (creates / updates
    -- / deletes A records); default dry_run=true so an agent gets the
    -- plan first and must explicitly opt in to apply.
    -- ──────────────────────────────────────────────────────────────
    {
        name = "lookup_dns",
        description = "Look up the current Cloudflare DNS records for a domain.  Read-only — calls Cloudflare's GET /zones/{id}/dns_records.  Returns each record annotated with `managed_by_wslproxy` (true if the record was created by wslproxy and carries the marker comment) and `pop_id` (the POP id parsed from the marker comment, if any).  The domain must fall under a zone listed in settings.dns.providers[].managed_zones, otherwise zone_not_allowed is returned BEFORE any HTTP call.",
        inputSchema = {
            type = "object",
            properties = {
                domain = {type = "string", description = "Fully-qualified domain to query (e.g. 'api.example.com')."},
                record_type = {type = "string", description = "Optional DNS record type filter (default: any; common: 'A')."}
            },
            required = {"domain"}
        },
        annotations = {
            title = "Lookup DNS Records",
            readOnlyHint = true,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = true
        }
    },
    {
        name = "provision_dns",
        description = "Converge Cloudflare DNS records for a server.  Supports four modes via `record_type`: \"A\" (default — one A per active POP using public_ipv4), \"AAAA\" (one AAAA per active POP using public_ipv6), \"BOTH\" (dual-stack — A AND AAAA), and \"CNAME\" (a single CNAME pointing at the server's dns_cname_target; POPs are not used).  If `record_type` is omitted, the server's stored `dns_record_type` is used (defaulting to \"A\" for backwards compatibility).  Computes a plan (create / update / delete / unchanged) and either previews it (dry_run=true) or applies it (dry_run=false).  Default is dry_run=true so an agent ALWAYS sees the plan first.  Only modifies records created by wslproxy (carrying the marker comment) — hand-curated records are never touched.  Returns the action list with each action tagged by its record_type, plus any skipped POPs with reasons.",
        inputSchema = {
            type = "object",
            properties = {
                server_id = {type = "string", description = "Server id (e.g. 'host:api.example.com')."},
                profile_id = {type = "string", description = "Environment profile (e.g. 'prod', 'int')."},
                dry_run = {type = "boolean", description = "If true (DEFAULT), returns the action plan without calling Cloudflare to write.  Pass false to actually apply."},
                include_inactive = {type = "boolean", description = "If true, POPs in 'down' or 'maintenance' status are included in the desired set.  Default false."},
                record_type = {type = "string", description = "One of \"A\", \"AAAA\", \"BOTH\", \"CNAME\".  Overrides the server's stored dns_record_type.  Omit to use whatever the server has configured."}
            },
            required = {"server_id", "profile_id"}
        },
        annotations = {
            title = "Provision DNS (Cloudflare)",
            readOnlyHint = false,
            destructiveHint = false,
            idempotentHint = true,
            openWorldHint = true
        }
    }
}

-- Tool: Validate NGINX configuration
function _M.validate_config()
    local Helper = require("helpers")
    local result, success = Helper.testNginxConfig()
    local is_valid = Helper.isStringContains("syntax is ok", result or "")

    return {
        tool = "validate_config",
        result = {
            valid = is_valid,
            output = result or "No output",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
        },
        isError = not is_valid
    }
end

-- Tool: Get error logs (redacted)
function _M.get_error_logs(params)
    local max_lines = math.min(tonumber(params.lines) or 100, 500)
    local log_path = "/var/log/nginx/error.log"

    local Helper = require("helpers")
    local content, status = Helper.readLogFile(log_path)

    if status ~= ngx.HTTP_OK then
        return {
            tool = "get_error_logs",
            result = {
                error = "Could not read error log",
                detail = tostring(content)
            },
            isError = true
        }
    end

    -- Redact sensitive patterns from logs
    local redacted = content
    if redacted then
        -- Redact JWT tokens
        redacted = redacted:gsub("eyJ[A-Za-z0-9_%-]+%.[A-Za-z0-9_%-]+%.[A-Za-z0-9_%-]+", "[REDACTED_JWT]")
        -- Redact API keys that look like hex/base64 strings longer than 20 chars
        redacted = redacted:gsub("([Aa]pi[_%-]?[Kk]ey[=: ]+)[%w%+/=]+", "%1[REDACTED]")
        -- Redact passwords
        redacted = redacted:gsub("([Pp]assword[=: ]+)[^%s,;]+", "%1[REDACTED]")
        -- Redact Bearer tokens
        redacted = redacted:gsub("(Bearer%s+)[%w%+/=%-_.]+", "%1[REDACTED]")
    end

    -- Limit lines
    local lines = {}
    local count = 0
    if redacted then
        for line in redacted:gmatch("[^\r\n]+") do
            count = count + 1
            table.insert(lines, line)
        end
    end

    -- Return only the last N lines
    local start_idx = math.max(1, #lines - max_lines + 1)
    local result_lines = {}
    for i = start_idx, #lines do
        table.insert(result_lines, lines[i])
    end

    return {
        tool = "get_error_logs",
        result = {
            total_lines = count,
            returned_lines = #result_lines,
            log_entries = result_lines,
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
        },
        isError = false
    }
end

-- Tool: Reload configuration (with mandatory dry-run)
function _M.reload_config(params)
    local dry_run = true
    if params.dry_run == false then
        dry_run = false
    end

    -- Always validate first
    local validation = _M.validate_config()
    if validation.isError then
        return {
            tool = "reload_config",
            result = {
                reloaded = false,
                dry_run = dry_run,
                validation = validation.result,
                message = "Configuration validation failed. Reload aborted."
            },
            isError = true
        }
    end

    if dry_run then
        return {
            tool = "reload_config",
            result = {
                reloaded = false,
                dry_run = true,
                validation = validation.result,
                message = "Dry run completed. Configuration is valid. Set dry_run=false to apply."
            },
            isError = false
        }
    end

    -- Execute reload
    local handle = io.popen("sudo openresty -s reload 2>&1")
    local reload_result = ""
    if handle then
        reload_result = handle:read("*all")
        handle:close()
    end

    ngx.log(ngx.INFO, "MCP: Configuration reload executed by MCP tool from ", ngx.var.remote_addr)

    return {
        tool = "reload_config",
        result = {
            reloaded = true,
            dry_run = false,
            validation = validation.result,
            reload_output = reload_result,
            message = "Configuration reloaded successfully.",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
        },
        isError = false
    }
end

-- Tool: Test WAF rule pattern (read-only)
function _M.test_waf_rule(params)
    local pattern = params.pattern
    local test_input = params.test_input
    local pattern_type = params.pattern_type or "regex"

    if not pattern or pattern == "" then
        return {
            tool = "test_waf_rule",
            result = { error = "Pattern is required" },
            isError = true
        }
    end
    if not test_input then
        return {
            tool = "test_waf_rule",
            result = { error = "Test input is required" },
            isError = true
        }
    end

    local matched = false
    local match_pos = nil
    local compile_error = nil

    if pattern_type == "string" then
        local pos = string.find(test_input, pattern, 1, true)
        matched = pos ~= nil
        match_pos = pos
    else
        local ok, compiled = pcall(ngx.re.compile, pattern, "ijo")
        if not ok then
            return {
                tool = "test_waf_rule",
                result = {
                    valid_pattern = false,
                    compile_error = tostring(compiled),
                    pattern = pattern,
                    pattern_type = pattern_type
                },
                isError = true
            }
        end

        local from, to, err = ngx.re.find(test_input, pattern, "ijo")
        if err then
            compile_error = err
        end
        matched = from ~= nil
        match_pos = from
    end

    return {
        tool = "test_waf_rule",
        result = {
            valid_pattern = true,
            matched = matched,
            match_position = match_pos,
            pattern = pattern,
            pattern_type = pattern_type,
            test_input_length = #test_input,
            compile_error = compile_error,
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
        },
        isError = false
    }
end

-- Tool: Bind WAF policy to a server
function _M.bind_waf_policy(params)
    local server_id = params.server_id
    local waf_policy_id = params.waf_policy_id
    local mode_override = params.mode_override
    local profile_id = params.profile_id or "prod"
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    if not server_id or server_id == "" then
        return { tool = "bind_waf_policy", result = { error = "server_id is required" }, isError = true }
    end
    if not waf_policy_id or waf_policy_id == "" then
        return { tool = "bind_waf_policy", result = { error = "waf_policy_id is required" }, isError = true }
    end
    if mode_override and mode_override ~= "" then
        local valid = { block = true, monitor = true }
        if not valid[mode_override] then
            return { tool = "bind_waf_policy", result = { error = "mode_override must be 'block' or 'monitor'" }, isError = true }
        end
    end

    -- Verify server exists
    local server_path = configPath .. "data/servers/" .. profile_id .. "/" .. server_id
    if not server_path:match("%.json$") then server_path = server_path .. ".json" end
    local f = io.open(server_path, "rb")
    if not f then
        return { tool = "bind_waf_policy", result = { error = "Server not found: " .. server_id }, isError = true }
    end
    local content = f:read("*a")
    f:close()

    local ok, server = pcall(cjson.decode, content)
    if not ok then
        return { tool = "bind_waf_policy", result = { error = "Failed to parse server config" }, isError = true }
    end

    -- Verify WAF policy exists
    local policy_path = configPath .. "data/waf_policies/" .. profile_id .. "/" .. waf_policy_id
    if not policy_path:match("%.json$") then policy_path = policy_path .. ".json" end
    local pf = io.open(policy_path, "rb")
    if not pf then
        return { tool = "bind_waf_policy", result = { error = "WAF policy not found: " .. waf_policy_id }, isError = true }
    end
    pf:close()

    -- Update server config
    server.waf_enabled = true
    server.waf_policy_id = waf_policy_id:gsub("%.json$", "")
    server.waf_mode_override = (mode_override and mode_override ~= "") and mode_override or nil

    -- Write back
    local wf = io.open(server_path, "wb")
    if not wf then
        return { tool = "bind_waf_policy", result = { error = "Failed to write server config" }, isError = true }
    end
    wf:write(cjson.encode(server))
    wf:close()

    ngx.log(ngx.INFO, "MCP: WAF policy '", waf_policy_id, "' bound to server '", server_id, "' by ", ngx.var.remote_addr)

    return {
        tool = "bind_waf_policy",
        result = {
            success = true,
            server_id = server_id,
            waf_policy_id = server.waf_policy_id,
            waf_enabled = true,
            waf_mode_override = server.waf_mode_override,
            message = "WAF policy bound successfully",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
        },
        isError = false
    }
end

-- Tool: Unbind WAF policy from a server
function _M.unbind_waf_policy(params)
    local server_id = params.server_id
    local profile_id = params.profile_id or "prod"
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    if not server_id or server_id == "" then
        return { tool = "unbind_waf_policy", result = { error = "server_id is required" }, isError = true }
    end

    -- Read server config
    local server_path = configPath .. "data/servers/" .. profile_id .. "/" .. server_id
    if not server_path:match("%.json$") then server_path = server_path .. ".json" end
    local f = io.open(server_path, "rb")
    if not f then
        return { tool = "unbind_waf_policy", result = { error = "Server not found: " .. server_id }, isError = true }
    end
    local content = f:read("*a")
    f:close()

    local ok, server = pcall(cjson.decode, content)
    if not ok then
        return { tool = "unbind_waf_policy", result = { error = "Failed to parse server config" }, isError = true }
    end

    -- Clear WAF binding
    server.waf_enabled = false
    server.waf_policy_id = nil
    server.waf_mode_override = nil

    -- Write back
    local wf = io.open(server_path, "wb")
    if not wf then
        return { tool = "unbind_waf_policy", result = { error = "Failed to write server config" }, isError = true }
    end
    wf:write(cjson.encode(server))
    wf:close()

    ngx.log(ngx.INFO, "MCP: WAF policy unbound from server '", server_id, "' by ", ngx.var.remote_addr)

    return {
        tool = "unbind_waf_policy",
        result = {
            success = true,
            server_id = server_id,
            waf_enabled = false,
            message = "WAF policy unbound successfully",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
        },
        isError = false
    }
end

-- Tool: Update traffic split weights
function _M.update_traffic_split(params)
    local TrafficMgmt = require("traffic_mgmt")
    local result = TrafficMgmt.update_weights({
        rule_id = params.rule_id,
        profile_id = params.profile_id,
        backends = params.backends
    })

    if result.status and result.status >= 400 then
        return {
            tool = "update_traffic_split",
            result = { error = result.message },
            isError = true
        }
    end

    ngx.log(ngx.INFO, "MCP: Traffic split updated for rule '", params.rule_id, "' by ", ngx.var.remote_addr)

    return {
        tool = "update_traffic_split",
        result = result.data,
        isError = false
    }
end

-- Tool: Promote backend to 100% traffic
function _M.promote_backend(params)
    local TrafficMgmt = require("traffic_mgmt")
    local result = TrafficMgmt.promote_backend({
        rule_id = params.rule_id,
        profile_id = params.profile_id,
        promote_label = params.promote_label
    })

    if result.status and result.status >= 400 then
        return {
            tool = "promote_backend",
            result = { error = result.message },
            isError = true
        }
    end

    ngx.log(ngx.INFO, "MCP: Backend '", params.promote_label, "' promoted for rule '", params.rule_id, "' by ", ngx.var.remote_addr)

    return {
        tool = "promote_backend",
        result = result.data,
        isError = false
    }
end

-- Tool: Rollback to single-backend routing
function _M.rollback_backend(params)
    local TrafficMgmt = require("traffic_mgmt")
    local result = TrafficMgmt.rollback_to_primary({
        rule_id = params.rule_id,
        profile_id = params.profile_id
    })

    if result.status and result.status >= 400 then
        return {
            tool = "rollback_backend",
            result = { error = result.message },
            isError = true
        }
    end

    ngx.log(ngx.INFO, "MCP: Backend rollback for rule '", params.rule_id, "' by ", ngx.var.remote_addr)

    return {
        tool = "rollback_backend",
        result = result.data,
        isError = false
    }
end

-- Tool: Deploy Varnish VCL configuration
function _M.deploy_varnish(params)
    local VarnishManager = require("varnish_manager")
    local VarnishVcl = require("varnish_vcl")

    local server_id = params.server_id
    local profile_id = params.profile_id or "prod"
    local dry_run = params.dry_run ~= false  -- default true
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    if not server_id or server_id == "" then
        return { tool = "deploy_varnish", result = { error = "server_id is required" }, isError = true }
    end

    -- Extract server_name from server_id (e.g., "host:example.com" -> "example.com")
    local server_name = server_id:match("^host:(.+)$") or server_id:gsub("%.json$", "")

    -- Get Varnish config
    local config = VarnishManager.get_varnish_config(server_name)
    if not config then
        return { tool = "deploy_varnish", result = { error = "No Varnish config found for: " .. server_name }, isError = true }
    end

    if not config.varnish_enabled then
        return { tool = "deploy_varnish", result = { error = "Varnish is not enabled for: " .. server_name }, isError = true }
    end

    local snippets = config.snippets or {}

    -- Step 1: Generate VCL
    local vcl, vcl_err = VarnishVcl.assemble(server_name, config, snippets)
    if not vcl then
        return { tool = "deploy_varnish", result = { error = "VCL generation failed: " .. (vcl_err or "unknown") }, isError = true }
    end

    -- Step 2: Validate VCL
    local valid, validate_output = VarnishVcl.validate_vcl(vcl)

    if dry_run then
        return {
            tool = "deploy_varnish",
            result = {
                server_name = server_name,
                dry_run = true,
                valid = valid,
                validation_output = validate_output,
                snippet_count = #snippets,
                message = valid and "VCL is valid. Set dry_run=false to deploy." or "VCL validation failed.",
                timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
            },
            isError = not valid
        }
    end

    if not valid then
        VarnishManager.set_deploy_status(server_name, {
            state = "failed",
            last_deployed_at = os.time(),
            last_error = validate_output
        })
        return { tool = "deploy_varnish", result = { error = "VCL validation failed: " .. validate_output }, isError = true }
    end

    -- Step 3: Save VCL to disk
    local save_ok, vcl_path = VarnishManager.save_generated_vcl(server_name, vcl)
    if not save_ok then
        return { tool = "deploy_varnish", result = { error = "Failed to save VCL: " .. tostring(vcl_path) }, isError = true }
    end

    -- Step 4: Load and activate VCL
    local admin_addr = (config.admin_listen_address or "127.0.0.1") .. ":" .. (config.admin_listen_port or 6082)
    local label = VarnishVcl.generate_vcl_label(server_name)
    local deploy_ok, deploy_output, deployed_label = VarnishVcl.deploy_vcl(vcl_path, admin_addr, label)

    if deploy_ok then
        VarnishManager.set_deploy_status(server_name, {
            state = "deployed",
            last_deployed_at = os.time(),
            last_vcl_label = deployed_label,
            last_error = nil
        })
        ngx.log(ngx.INFO, "MCP: Varnish VCL deployed for '", server_name, "' label '", deployed_label, "' by ", ngx.var.remote_addr)
    else
        VarnishManager.set_deploy_status(server_name, {
            state = "failed",
            last_deployed_at = os.time(),
            last_vcl_label = deployed_label,
            last_error = deploy_output
        })
    end

    return {
        tool = "deploy_varnish",
        result = {
            success = deploy_ok,
            server_name = server_name,
            vcl_label = deployed_label,
            message = deploy_ok and "VCL deployed and activated" or ("Deploy failed: " .. deploy_output),
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
        },
        isError = not deploy_ok
    }
end

-- Tool: Purge Varnish cache
function _M.purge_varnish(params)
    local VarnishManager = require("varnish_manager")
    local VarnishVcl = require("varnish_vcl")

    local server_id = params.server_id
    local url_pattern = params.url_pattern or ".*"

    if not server_id or server_id == "" then
        return { tool = "purge_varnish", result = { error = "server_id is required" }, isError = true }
    end

    local server_name = server_id:match("^host:(.+)$") or server_id:gsub("%.json$", "")

    local config = VarnishManager.get_varnish_config(server_name)
    if not config then
        return { tool = "purge_varnish", result = { error = "No Varnish config found for: " .. server_name }, isError = true }
    end

    local admin_addr = (config.admin_listen_address or "127.0.0.1") .. ":" .. (config.admin_listen_port or 6082)
    local success, output = VarnishVcl.purge_cache(admin_addr, url_pattern)

    ngx.log(ngx.INFO, "MCP: Varnish cache purge for '", server_name, "' pattern '", url_pattern, "' by ", ngx.var.remote_addr)

    return {
        tool = "purge_varnish",
        result = {
            success = success,
            server_name = server_name,
            url_pattern = url_pattern,
            output = output,
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time())
        },
        isError = not success
    }
end

-- ───────────────────────────────────────────────────────────────────────────
-- Helpers for create_server / create_rule
-- ───────────────────────────────────────────────────────────────────────────

-- Lightweight nginx server-block generator for MCP-created servers.
--
-- Why generate this server-side?  The dashboard composes the block in
-- TypeScript (openresty-admin-next dataProvider.handleConfigField); the
-- backend just stores whatever the dashboard sends.  MCP is a different
-- caller with no JS context, so we need a Lua-side equivalent for the
-- minimal case.  We intentionally keep it simple — TLS, an optional
-- HTTP→HTTPS redirect block, and an empty `location /` so the global
-- rewrite_by_lua_file (gateway_ack.lua) takes over from there.
local function generate_minimal_server_config(opts)
    local server_name = opts.server_name
    local ssl_enabled = opts.ssl_enabled and true or false
    local ssl_force_https = opts.ssl_force_https
    if ssl_force_https == nil then
        ssl_force_https = ssl_enabled
    end

    local parts = {}

    -- HTTP→HTTPS redirect block (only when both SSL and force_https are on).
    -- Mirrors the dashboard's pattern.  ACME challenge endpoint stays on
    -- :80 so renewals work without the redirect getting in the way.
    if ssl_enabled and ssl_force_https then
        table.insert(parts, table.concat({
            "server {",
            "    listen 80;",
            "    server_name " .. server_name .. ";",
            "    location /.well-known/acme-challenge/ { content_by_lua_block { auto_ssl:challenge_server() } }",
            "    location / { return 301 https://$host$request_uri; }",
            "}",
        }, "\n"))
    end

    local main = { "server {" }
    if ssl_enabled then
        table.insert(main, "    listen 443 ssl http2;")
        table.insert(main, "    ssl_certificate_by_lua_block { auto_ssl:ssl_certificate() }")
        table.insert(main, "    ssl_certificate /etc/ssl/resty-auto-ssl-fallback.crt;")
        table.insert(main, "    ssl_certificate_key /etc/ssl/resty-auto-ssl-fallback.key;")
        table.insert(main, "    ssl_protocols TLSv1.2 TLSv1.3;")
        table.insert(main, "    ssl_prefer_server_ciphers off;")
        table.insert(main, "    add_header Strict-Transport-Security \"max-age=31536000; includeSubDomains\" always;")
    end
    -- The non-SSL listen line is conditional: when SSL+force_https is on,
    -- the dedicated redirect block above owns :80, so we don't add it
    -- here (it would conflict).  When SSL is on without force_https, both
    -- :80 and :443 land on the rule pipeline.  When SSL is off, just :80.
    if not ssl_enabled then
        table.insert(main, "    listen 80;")
    elseif not ssl_force_https then
        table.insert(main, "    listen 80;")
    end
    table.insert(main, "    server_name " .. server_name .. ";")
    table.insert(main, "    root /var/www/html;")
    table.insert(main, "    index index.html index.htm;")
    table.insert(main, "    access_log logs/access.log;")
    table.insert(main, "    error_log logs/error.log;")
    if ssl_enabled then
        table.insert(main, "    location /.well-known/acme-challenge/ { content_by_lua_block { auto_ssl:challenge_server() } }")
    end
    -- Empty location / — the rules engine takes over via the global
    -- rewrite_by_lua_file directive in nginx.conf (gateway_ack.lua).
    -- Adding directives here would conflict with that pipeline.
    table.insert(main, "    location / {}")
    table.insert(main, "}")
    table.insert(parts, table.concat(main, "\n"))

    return table.concat(parts, "\n\n")
end

-- ───────────────────────────────────────────────────────────────────────────
-- Tool: Create a new Virtual Server
-- ───────────────────────────────────────────────────────────────────────────
function _M.create_server(params)
    local Helper = require("helpers")
    local AuditLogger = require("audit_logger")
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    -- ── Required parameters ──────────────────────────────────────────────
    local server_name = params.server_name
    local profile_id = params.profile_id
    if not server_name or server_name == "" then
        return {
            tool = "create_server",
            result = {error = "server_name is required"},
            isError = true,
        }
    end
    if not profile_id or profile_id == "" then
        return {
            tool = "create_server",
            result = {error = "profile_id is required (MCP must be explicit — do not default to prod)"},
            isError = true,
        }
    end
    -- Coarse domain validation — block obvious garbage before any I/O.
    -- A full RFC 1035 check would be stricter; this catches the common
    -- "Claude generated a URL instead of a hostname" mistake.
    if server_name:find("[/ ]") or server_name:find("^[%.-]") or server_name:find("[%.-]$") then
        return {
            tool = "create_server",
            result = {error = "server_name must be a bare hostname (no slashes, spaces, leading/trailing dots)"},
            isError = true,
        }
    end

    -- ── Conflict check ───────────────────────────────────────────────────
    local server_id = "host:" .. server_name
    local server_path = configPath .. "data/servers/" .. profile_id .. "/" .. server_id .. ".json"
    local existing = io.open(server_path, "rb")
    if existing then
        existing:close()
        return {
            tool = "create_server",
            result = {
                error = "Server already exists: " .. server_id .. " in profile " .. profile_id,
                existing_id = server_id,
            },
            isError = true,
        }
    end

    -- ── Build server JSON with safe defaults ─────────────────────────────
    local ssl_enabled = params.ssl_enabled and true or false
    local ssl_force_https = params.ssl_force_https
    if ssl_force_https == nil then ssl_force_https = ssl_enabled end
    local ssl_auto_renew = params.ssl_auto_renew
    if ssl_auto_renew == nil then ssl_auto_renew = ssl_enabled end
    if ssl_enabled and ssl_auto_renew and (not params.ssl_email or params.ssl_email == "") then
        return {
            tool = "create_server",
            result = {error = "ssl_email is required when ssl_enabled+ssl_auto_renew (Let's Encrypt contact address)"},
            isError = true,
        }
    end

    local listens = {{listen = "80"}}
    if ssl_enabled then
        listens = {{listen = "80"}, {listen = "443 ssl"}}
    end

    local config_block = generate_minimal_server_config({
        server_name = server_name,
        ssl_enabled = ssl_enabled,
        ssl_force_https = ssl_force_https,
    })

    local activate = params.activate and true or false
    local server_json = {
        id = server_id,
        server_name = server_name,
        proxy_server_name = server_name,
        profile_id = profile_id,
        proxy_pass = params.proxy_pass or "http://127.0.0.1",
        listens = listens,
        ssl_enabled = ssl_enabled,
        ssl_force_https = ssl_force_https,
        ssl_auto_renew = ssl_auto_renew,
        ssl_email = params.ssl_email or "",
        ssl_staging = false,
        cache_enabled = false,
        cache_bypass_auth = false,
        root = "/var/www/html",
        index = "index.html",
        access_log = "logs/access.log",
        error_log = "logs/error.log",
        custom_headers = setmetatable({}, cjson.empty_array_mt or nil),
        match_cases = setmetatable({}, cjson.empty_array_mt or nil),
        created_at = ngx.time(),
        -- config is base64-encoded — matches how the REST API persists.
        config = Base64.encode(config_block),
        -- config_status: false by default = staged, not yet in nginx.
        -- The activate flag explicitly opts in to going live.  This is
        -- the load-bearing safety: an LLM mistake stays inert until a
        -- human (or a second tool call) flips this.
        config_status = activate,
    }

    -- ── Dry-run short-circuit ────────────────────────────────────────────
    if params.dry_run then
        return {
            tool = "create_server",
            result = {
                dry_run = true,
                would_create = server_json,
                would_write_to = server_path,
                config_decoded_preview = config_block,
            },
            isError = false,
        }
    end

    -- ── Persist ──────────────────────────────────────────────────────────
    local server_dir = configPath .. "data/servers/" .. profile_id
    if not Helper.isDirectoryExists(server_dir) then
        local _, derr = Helper.createDirectoryRecursive(server_dir)
        if derr then
            return {
                tool = "create_server",
                result = {error = "Failed to create server directory: " .. tostring(derr)},
                isError = true,
            }
        end
    end

    local wf, werr = io.open(server_path, "wb")
    if not wf then
        return {
            tool = "create_server",
            result = {error = "Failed to write server JSON: " .. tostring(werr)},
            isError = true,
        }
    end
    wf:write(cjson.encode(server_json))
    wf:close()

    -- When activate=true, also write the decoded .conf so the cron
    -- watcher picks it up and a reload signal is meaningful.  When
    -- false (default), we deliberately leave the .conf absent — the
    -- server is metadata-only until activation.
    local conf_written = false
    if activate then
        local conf_dir = server_dir .. "/conf"
        if not Helper.isDirectoryExists(conf_dir) then
            Helper.createDirectoryRecursive(conf_dir)
        end
        local cf = io.open(conf_dir .. "/" .. server_name .. ".conf", "wb")
        if cf then
            cf:write(Helper.cleanString and Helper.cleanString(config_block) or config_block)
            cf:close()
            conf_written = true
        end
    end

    -- ── Audit ────────────────────────────────────────────────────────────
    local ok_audit = pcall(function()
        AuditLogger.log("create_server", nil, "servers", server_name, {
            server_id = server_id,
            profile_id = profile_id,
            ssl_enabled = ssl_enabled,
            activated = activate,
            source = "mcp",
        })
    end)
    if not ok_audit then
        ngx.log(ngx.WARN, "MCP create_server: audit log failed (non-fatal)")
    end

    ngx.log(ngx.INFO, "MCP: created server '", server_id, "' in profile '", profile_id,
        "' (activated=", tostring(activate), ") by ", ngx.var.remote_addr or "unknown")

    return {
        tool = "create_server",
        result = {
            success = true,
            id = server_id,
            server_name = server_name,
            profile_id = profile_id,
            ssl_enabled = ssl_enabled,
            config_status = activate,
            conf_written = conf_written,
            next_steps = activate
                and "Server is active.  Use reload_config to apply (or wait for the cron watcher to pick up the reboot flag)."
                or  "Server is staged (config_status=false).  Set activate=true on a follow-up call, or flip the toggle in the dashboard, to go live.",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time()),
        },
        isError = false,
    }
end

-- ───────────────────────────────────────────────────────────────────────────
-- Tool: Create a new routing rule
-- ───────────────────────────────────────────────────────────────────────────
function _M.create_rule(params)
    local Helper = require("helpers")
    local AuditLogger = require("audit_logger")
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    -- ── Required parameters ──────────────────────────────────────────────
    local name = params.name
    local profile_id = params.profile_id
    local response_code = params.response_code
    if not name or name == "" then
        return {
            tool = "create_rule",
            result = {error = "name is required"},
            isError = true,
        }
    end
    if not profile_id or profile_id == "" then
        return {
            tool = "create_rule",
            result = {error = "profile_id is required"},
            isError = true,
        }
    end
    if not response_code then
        return {
            tool = "create_rule",
            result = {error = "response_code is required (200/301/302/305/306/403)"},
            isError = true,
        }
    end
    local valid_codes = {[200]=true, [301]=true, [302]=true, [305]=true, [306]=true, [403]=true}
    if not valid_codes[response_code] then
        return {
            tool = "create_rule",
            result = {error = "response_code must be one of 200, 301, 302, 305, 306, 403"},
            isError = true,
        }
    end
    -- For HTTP redirects + proxy, a target is non-optional.  CAPTCHA (306)
    -- routes to a backend after challenge, so it also needs one.
    if (response_code == 301 or response_code == 302 or response_code == 305 or response_code == 306)
            and (not params.redirect_uri or params.redirect_uri == "") then
        return {
            tool = "create_rule",
            result = {error = "redirect_uri is required for response_code " .. response_code},
            isError = true,
        }
    end

    -- ── Path / match condition normalisation ─────────────────────────────
    local path = params.path or "/"
    local path_key = params.path_key or "starts_with"
    local valid_path_keys = {starts_with=true, equals=true, ends_with=true}
    if not valid_path_keys[path_key] then
        return {
            tool = "create_rule",
            result = {error = "path_key must be starts_with, equals, or ends_with"},
            isError = true,
        }
    end

    -- ── Conflict check (by name within profile) ──────────────────────────
    local rules_dir = configPath .. "data/rules/" .. profile_id
    if Helper.isDirectoryExists(rules_dir) then
        local lfs_ok, lfs = pcall(require, "lfs")
        if lfs_ok then
            for fname in lfs.dir(rules_dir) do
                if fname:match("%.json$") then
                    local existing_path = rules_dir .. "/" .. fname
                    local ef = io.open(existing_path, "rb")
                    if ef then
                        local content = ef:read("*a")
                        ef:close()
                        local ok, decoded = pcall(cjson.decode, content)
                        if ok and decoded and decoded.name == name then
                            return {
                                tool = "create_rule",
                                result = {
                                    error = "Rule with name '" .. name
                                        .. "' already exists in profile " .. profile_id,
                                    existing_id = decoded.id,
                                },
                                isError = true,
                            }
                        end
                    end
                end
            end
        end
    end

    -- ── Build the rule JSON ──────────────────────────────────────────────
    -- Helper.generate_uuid (helpers.lua:96) gives us a deterministic shape.
    local rule_id = Helper.generate_uuid()
    local rule_json = {
        id = rule_id,
        name = name,
        profile_id = profile_id,
        priority = tonumber(params.priority) or 100,
        version = 1,
        created_at = ngx.time(),
        match = {
            rules = {
                path = path,
                path_key = path_key,
                country = params.country or "",
                country_key = params.country_key or "equals",
                client_ip = params.client_ip or "",
                client_ip_key = params.client_ip_key or "equals",
                jwt_token_validation = "equals",
            },
            response = {
                code = response_code,
                redirect_uri = params.redirect_uri or "",
                -- Static-body responses encode the HTML to base64 (matches
                -- the dashboard's HtmlEditorInput round-trip), so the wire
                -- format is opaque-string regardless of content.
                message = (response_code == 200 or response_code == 403) and params.message
                    and Base64.encode(params.message) or (params.message or ""),
                allow = false,
                is_consul = false,
                strip_path = params.strip_path and true or false,
                auto_redirect_https = params.auto_redirect_https and true or false,
            },
        },
        servers = setmetatable({}, cjson.empty_array_mt or nil),
    }
    if params.servers and type(params.servers) == "table" and #params.servers > 0 then
        rule_json.servers = params.servers
    end

    -- ── Dry-run short-circuit ────────────────────────────────────────────
    local rule_path = rules_dir .. "/" .. rule_id .. ".json"
    if params.dry_run then
        return {
            tool = "create_rule",
            result = {
                dry_run = true,
                would_create = rule_json,
                would_write_to = rule_path,
            },
            isError = false,
        }
    end

    -- ── Persist the rule ─────────────────────────────────────────────────
    if not Helper.isDirectoryExists(rules_dir) then
        local _, derr = Helper.createDirectoryRecursive(rules_dir)
        if derr then
            return {
                tool = "create_rule",
                result = {error = "Failed to create rules directory: " .. tostring(derr)},
                isError = true,
            }
        end
    end
    local wf, werr = io.open(rule_path, "wb")
    if not wf then
        return {
            tool = "create_rule",
            result = {error = "Failed to write rule JSON: " .. tostring(werr)},
            isError = true,
        }
    end
    wf:write(cjson.encode(rule_json))
    wf:close()

    -- ── Optionally attach to servers ─────────────────────────────────────
    -- The rule_loader.lua picks up rules per request from the server's
    -- `rules` field + `match_cases`.  We add to `match_cases` so an
    -- existing rules entry on the server isn't clobbered.
    local attached = {}
    local failed_attachments = {}
    if rule_json.servers and #rule_json.servers > 0 then
        for _, sid in ipairs(rule_json.servers) do
            local spath = configPath .. "data/servers/" .. profile_id .. "/" .. sid .. ".json"
            local sf = io.open(spath, "rb")
            if not sf then
                table.insert(failed_attachments, {server_id = sid, reason = "not found"})
            else
                local scontent = sf:read("*a")
                sf:close()
                local sok, sdata = pcall(cjson.decode, scontent)
                if not sok then
                    table.insert(failed_attachments, {server_id = sid, reason = "decode error"})
                else
                    -- Attach via the server's `rules` field (the dashboard's
                    -- primary mechanism), not `match_cases`.  Functionally
                    -- equivalent at request time — rule_loader.lua reads both
                    -- and AND-merges them — but the dashboard convention is to
                    -- populate `rules`, so MCP-created servers match that
                    -- shape and look consistent in the UI.  The additive
                    -- `match_cases` path is still available via attach_rule
                    -- for OR-mode and multi-rule layering scenarios.
                    --
                    -- Normalise rules into an array so multiple create_rule
                    -- calls against the same server append cleanly.
                    local rules_field = sdata.rules
                    if rules_field == nil or rules_field == "" or
                            (type(rules_field) == "table" and next(rules_field) == nil) then
                        sdata.rules = {rule_id}
                    elseif type(rules_field) == "string" then
                        sdata.rules = {rules_field, rule_id}
                    elseif type(rules_field) == "table" then
                        table.insert(rules_field, rule_id)
                        sdata.rules = rules_field
                    end
                    local swf = io.open(spath, "wb")
                    if swf then
                        swf:write(cjson.encode(sdata))
                        swf:close()
                        table.insert(attached, sid)
                    else
                        table.insert(failed_attachments, {server_id = sid, reason = "write error"})
                    end
                end
            end
        end
    end

    -- ── Audit ────────────────────────────────────────────────────────────
    pcall(function()
        AuditLogger.log("create_rule", nil, "rules", name, {
            rule_id = rule_id,
            profile_id = profile_id,
            response_code = response_code,
            priority = rule_json.priority,
            attached_to = attached,
            source = "mcp",
        })
    end)

    ngx.log(ngx.INFO, "MCP: created rule '", name, "' (", rule_id, ") in profile '", profile_id,
        "' with code ", response_code, " by ", ngx.var.remote_addr or "unknown")

    return {
        tool = "create_rule",
        result = {
            success = true,
            id = rule_id,
            name = name,
            profile_id = profile_id,
            response_code = response_code,
            priority = rule_json.priority,
            attached_to = attached,
            failed_attachments = #failed_attachments > 0 and failed_attachments or nil,
            next_steps = (response_code == 305 or response_code == 301 or response_code == 302)
                and "Rule is live — rules evaluate per-request, no reload needed.  Test with a curl against the attached server."
                or  "Rule is live — rules evaluate per-request, no reload needed.",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time()),
        },
        isError = false,
    }
end

-- ───────────────────────────────────────────────────────────────────────────
-- Tool: Attach an existing rule to an existing server
-- ───────────────────────────────────────────────────────────────────────────
function _M.attach_rule(params)
    local AuditLogger = require("audit_logger")
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    -- ── Required parameters ──────────────────────────────────────────────
    local rule_id = params.rule_id
    local server_id = params.server_id
    local profile_id = params.profile_id
    if not rule_id or rule_id == "" then
        return {tool = "attach_rule", result = {error = "rule_id is required"}, isError = true}
    end
    if not server_id or server_id == "" then
        return {tool = "attach_rule", result = {error = "server_id is required (e.g. 'host:api.example.com')"}, isError = true}
    end
    if not profile_id or profile_id == "" then
        return {tool = "attach_rule", result = {error = "profile_id is required"}, isError = true}
    end

    local condition = params.condition or "and"
    if condition ~= "and" and condition ~= "or" then
        return {tool = "attach_rule", result = {error = "condition must be 'and' or 'or'"}, isError = true}
    end
    local method = params.method or "match_cases"
    if method ~= "match_cases" and method ~= "rules" then
        return {tool = "attach_rule", result = {error = "method must be 'match_cases' or 'rules'"}, isError = true}
    end
    -- The `rules` field is read by rule_loader.lua at line 209 as AND
    -- only — there is no OR semantics for it.  Reject the combination
    -- up front rather than silently writing a misleading shape.
    if method == "rules" and condition == "or" then
        return {
            tool = "attach_rule",
            result = {error = "method='rules' is AND-only; use method='match_cases' for OR-mode attachment"},
            isError = true,
        }
    end

    -- ── Verify rule exists ───────────────────────────────────────────────
    local rule_path = configPath .. "data/rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local rf = io.open(rule_path, "rb")
    if not rf then
        return {
            tool = "attach_rule",
            result = {error = "Rule not found: " .. rule_id .. " in profile " .. profile_id, expected_path = rule_path},
            isError = true,
        }
    end
    rf:close()

    -- ── Read server JSON ─────────────────────────────────────────────────
    local server_path = configPath .. "data/servers/" .. profile_id .. "/" .. server_id .. ".json"
    local sf = io.open(server_path, "rb")
    if not sf then
        return {
            tool = "attach_rule",
            result = {error = "Server not found: " .. server_id .. " in profile " .. profile_id, expected_path = server_path},
            isError = true,
        }
    end
    local scontent = sf:read("*a")
    sf:close()
    local ok, sdata = pcall(cjson.decode, scontent)
    if not ok or type(sdata) ~= "table" then
        return {
            tool = "attach_rule",
            result = {error = "Server JSON is malformed: " .. tostring(sdata)},
            isError = true,
        }
    end

    -- ── Idempotency check: is the rule already attached anywhere? ────────
    -- rule_loader reads BOTH `rules` and `match_cases`, so attaching to
    -- the second field when it's already in the first would cause the
    -- rule engine to evaluate it twice.  We treat "already in either
    -- field" as already-attached and return success — the user's
    -- desired state is already in place.
    local already_in_rules = false
    local rules_field = sdata.rules
    if type(rules_field) == "string" and rules_field == rule_id then
        already_in_rules = true
    elseif type(rules_field) == "table" then
        for _, r in ipairs(rules_field) do
            if r == rule_id then already_in_rules = true; break end
        end
    end

    local already_in_match_cases = false
    local existing_match_case = nil
    if type(sdata.match_cases) == "table" then
        for _, mc in ipairs(sdata.match_cases) do
            if mc.statement == rule_id then
                already_in_match_cases = true
                existing_match_case = mc
                break
            end
        end
    end

    if already_in_rules or already_in_match_cases then
        return {
            tool = "attach_rule",
            result = {
                success = true,
                already_attached = true,
                rule_id = rule_id,
                server_id = server_id,
                attached_via = already_in_rules and "rules" or "match_cases",
                existing_condition = existing_match_case and existing_match_case.condition or
                    (already_in_rules and "and" or nil),
                message = "Rule was already attached — no change made.",
            },
            isError = false,
        }
    end

    -- ── Apply the attachment in memory ───────────────────────────────────
    if method == "match_cases" then
        -- `match_cases` may not exist or may be the cjson empty-object
        -- ({}) on a freshly-created server — normalise to an array
        -- before appending.
        if type(sdata.match_cases) ~= "table" or
                (type(sdata.match_cases) == "table" and next(sdata.match_cases) == nil) then
            sdata.match_cases = {}
        end
        table.insert(sdata.match_cases, {statement = rule_id, condition = condition})
    else
        -- method == "rules" — normalise into an array so the second
        -- attachment doesn't have to switch shape.  rule_loader's
        -- parse_rule_ids() accepts both string and array.
        if rules_field == nil or rules_field == "" or
                (type(rules_field) == "table" and next(rules_field) == nil) then
            sdata.rules = {rule_id}
        elseif type(rules_field) == "string" then
            sdata.rules = {rules_field, rule_id}
        elseif type(rules_field) == "table" then
            table.insert(rules_field, rule_id)
            sdata.rules = rules_field
        end
    end

    -- ── Dry-run short-circuit ────────────────────────────────────────────
    if params.dry_run then
        return {
            tool = "attach_rule",
            result = {
                dry_run = true,
                would_attach = {
                    rule_id = rule_id,
                    server_id = server_id,
                    method = method,
                    condition = condition,
                },
                would_write_server = sdata,
                would_write_to = server_path,
            },
            isError = false,
        }
    end

    -- ── Persist ──────────────────────────────────────────────────────────
    local wf, werr = io.open(server_path, "wb")
    if not wf then
        return {
            tool = "attach_rule",
            result = {error = "Failed to write server JSON: " .. tostring(werr)},
            isError = true,
        }
    end
    wf:write(cjson.encode(sdata))
    wf:close()

    -- ── Audit ────────────────────────────────────────────────────────────
    pcall(function()
        AuditLogger.log("attach_rule", nil, "servers", sdata.server_name or server_id, {
            rule_id = rule_id,
            server_id = server_id,
            profile_id = profile_id,
            method = method,
            condition = condition,
            source = "mcp",
        })
    end)

    ngx.log(ngx.INFO, "MCP: attached rule '", rule_id, "' to server '", server_id,
        "' via ", method, " (", condition, "-mode) in profile '", profile_id, "' by ",
        ngx.var.remote_addr or "unknown")

    return {
        tool = "attach_rule",
        result = {
            success = true,
            rule_id = rule_id,
            server_id = server_id,
            profile_id = profile_id,
            method = method,
            condition = condition,
            -- Always-helpful caller hint: rule evaluation is per-request,
            -- so no reload step is required.
            next_steps = "Rule is live — rules are read per-request by rule_loader.lua.  Hit the server with curl to verify.",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time()),
        },
        isError = false,
    }
end

-- ───────────────────────────────────────────────────────────────────────────
-- Shared helper: walk every server in a profile and apply a callback.
-- Used by delete_server (no servers walked — only rules) and delete_rule
-- (every server walked to find references).  Avoids three near-identical
-- lfs.dir loops.  cb(filepath, decoded_json) returns either (true, updated)
-- to write the file back, or (false, _) to skip.
-- ───────────────────────────────────────────────────────────────────────────
local function for_each_server(profile_id, configPath, cb)
    local lfs_ok, lfs = pcall(require, "lfs")
    if not lfs_ok then return 0 end
    local servers_dir = configPath .. "data/servers/" .. profile_id
    local attr = lfs.attributes(servers_dir)
    if not attr or attr.mode ~= "directory" then return 0 end
    local updated_count = 0
    for fname in lfs.dir(servers_dir) do
        if fname:match("^host:.*%.json$") then
            local fp = servers_dir .. "/" .. fname
            local f = io.open(fp, "rb")
            if f then
                local content = f:read("*a")
                f:close()
                local ok, decoded = pcall(cjson.decode, content)
                if ok and type(decoded) == "table" then
                    local should_write, updated = cb(fp, decoded)
                    if should_write then
                        local wf = io.open(fp, "wb")
                        if wf then
                            wf:write(cjson.encode(updated))
                            wf:close()
                            updated_count = updated_count + 1
                        end
                    end
                end
            end
        end
    end
    return updated_count
end

-- ───────────────────────────────────────────────────────────────────────────
-- Tool: Update an existing Virtual Server
-- ───────────────────────────────────────────────────────────────────────────
function _M.update_server(params)
    local AuditLogger = require("audit_logger")
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    local server_id = params.server_id
    local profile_id = params.profile_id
    if not server_id or server_id == "" then
        return {tool = "update_server", result = {error = "server_id is required"}, isError = true}
    end
    if not profile_id or profile_id == "" then
        return {tool = "update_server", result = {error = "profile_id is required"}, isError = true}
    end

    -- ── Read current JSON ────────────────────────────────────────────────
    local server_path = configPath .. "data/servers/" .. profile_id .. "/" .. server_id .. ".json"
    local rf = io.open(server_path, "rb")
    if not rf then
        return {
            tool = "update_server",
            result = {error = "Server not found: " .. server_id, expected_path = server_path},
            isError = true,
        }
    end
    local content = rf:read("*a")
    rf:close()
    local ok, sdata = pcall(cjson.decode, content)
    if not ok or type(sdata) ~= "table" then
        return {tool = "update_server", result = {error = "Server JSON malformed"}, isError = true}
    end

    -- ── Apply partial updates ────────────────────────────────────────────
    -- Only touch fields the caller actually passed.  We track each
    -- change for the audit log and to know whether config regeneration
    -- is required.
    local changed = {}
    local needs_config_regen = false
    local updatable_strings = {"proxy_pass", "ssl_email"}
    local updatable_bools = {"ssl_enabled", "ssl_force_https", "ssl_auto_renew",
        "ssl_staging", "cache_enabled", "config_status"}
    local config_affecting = {ssl_enabled = true, ssl_force_https = true}

    for _, field in ipairs(updatable_strings) do
        if params[field] ~= nil then
            if sdata[field] ~= params[field] then
                table.insert(changed, field)
                sdata[field] = params[field]
            end
        end
    end
    for _, field in ipairs(updatable_bools) do
        if params[field] ~= nil then
            local new_val = params[field] and true or false
            if sdata[field] ~= new_val then
                table.insert(changed, field)
                sdata[field] = new_val
                if config_affecting[field] then needs_config_regen = true end
            end
        end
    end
    if params.custom_headers ~= nil and type(params.custom_headers) == "table" then
        table.insert(changed, "custom_headers")
        sdata.custom_headers = params.custom_headers
    end

    -- ── Regenerate the nginx config block if SSL flags changed ───────────
    if needs_config_regen then
        local config_block = generate_minimal_server_config({
            server_name = sdata.server_name,
            ssl_enabled = sdata.ssl_enabled,
            ssl_force_https = sdata.ssl_force_https,
        })
        sdata.config = Base64.encode(config_block)
        -- Also normalise the listens array so it matches the new SSL
        -- posture — otherwise a server toggled ssl_enabled=true could
        -- still have listens=[{listen:"80"}] only, which the rule
        -- loader is fine with but is confusing in the dashboard.
        if sdata.ssl_enabled then
            sdata.listens = {{listen = "80"}, {listen = "443 ssl"}}
        else
            sdata.listens = {{listen = "80"}}
        end
        table.insert(changed, "config")
    end

    if #changed == 0 then
        return {
            tool = "update_server",
            result = {
                success = true,
                no_op = true,
                message = "No fields differed from current state — nothing written.",
                server_id = server_id,
            },
            isError = false,
        }
    end

    -- ── Dry-run ──────────────────────────────────────────────────────────
    if params.dry_run then
        return {
            tool = "update_server",
            result = {
                dry_run = true,
                changed_fields = changed,
                would_write = sdata,
                would_write_to = server_path,
            },
            isError = false,
        }
    end

    -- ── Persist ──────────────────────────────────────────────────────────
    local wf, werr = io.open(server_path, "wb")
    if not wf then
        return {tool = "update_server", result = {error = "Write failed: " .. tostring(werr)}, isError = true}
    end
    wf:write(cjson.encode(sdata))
    wf:close()

    pcall(function()
        AuditLogger.log("update_server", nil, "servers", sdata.server_name or server_id, {
            server_id = server_id,
            profile_id = profile_id,
            changed_fields = changed,
            source = "mcp",
        })
    end)
    ngx.log(ngx.INFO, "MCP: updated server '", server_id, "' (",
        table.concat(changed, ", "), ") in profile '", profile_id, "'")

    return {
        tool = "update_server",
        result = {
            success = true,
            server_id = server_id,
            changed_fields = changed,
            config_regenerated = needs_config_regen,
            -- Inline membership check rather than a helper — only used here.
            next_steps = (function()
                if needs_config_regen then return true end
                for _, f in ipairs(changed) do if f == "config_status" then return true end end
                return false
            end)()
                and "SSL flags or activation changed — call reload_config to apply to nginx."
                or  "Data updated.  No reload needed unless caller flipped config_status.",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time()),
        },
        isError = false,
    }
end

-- ───────────────────────────────────────────────────────────────────────────
-- Tool: Update an existing rule
-- ───────────────────────────────────────────────────────────────────────────
function _M.update_rule(params)
    local AuditLogger = require("audit_logger")
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    local rule_id = params.rule_id
    local profile_id = params.profile_id
    if not rule_id or rule_id == "" then
        return {tool = "update_rule", result = {error = "rule_id is required"}, isError = true}
    end
    if not profile_id or profile_id == "" then
        return {tool = "update_rule", result = {error = "profile_id is required"}, isError = true}
    end

    local rule_path = configPath .. "data/rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local rf = io.open(rule_path, "rb")
    if not rf then
        return {
            tool = "update_rule",
            result = {error = "Rule not found: " .. rule_id, expected_path = rule_path},
            isError = true,
        }
    end
    local content = rf:read("*a")
    rf:close()
    local ok, rdata = pcall(cjson.decode, content)
    if not ok or type(rdata) ~= "table" then
        return {tool = "update_rule", result = {error = "Rule JSON malformed"}, isError = true}
    end
    -- Older rules may be missing the nested tables — guard before we index.
    rdata.match = rdata.match or {}
    rdata.match.rules = rdata.match.rules or {}
    rdata.match.response = rdata.match.response or {}

    local changed = {}

    -- Top-level fields
    if params.name ~= nil and rdata.name ~= params.name then
        table.insert(changed, "name"); rdata.name = params.name
    end
    if params.priority ~= nil then
        local new_pri = tonumber(params.priority)
        if new_pri and rdata.priority ~= new_pri then
            table.insert(changed, "priority"); rdata.priority = new_pri
        end
    end

    -- match.rules.* — the request-matching predicates
    local match_string_fields = {"path", "path_key", "country", "country_key", "client_ip", "client_ip_key"}
    for _, field in ipairs(match_string_fields) do
        if params[field] ~= nil and rdata.match.rules[field] ~= params[field] then
            table.insert(changed, "match.rules." .. field)
            rdata.match.rules[field] = params[field]
        end
    end

    -- match.response.* — what the rule does when it matches
    if params.response_code ~= nil then
        local new_code = tonumber(params.response_code)
        local valid_codes = {[200]=true, [301]=true, [302]=true, [305]=true, [306]=true, [403]=true}
        if not valid_codes[new_code] then
            return {tool = "update_rule", result = {error = "response_code must be 200/301/302/305/306/403"}, isError = true}
        end
        if rdata.match.response.code ~= new_code then
            table.insert(changed, "match.response.code"); rdata.match.response.code = new_code
        end
    end
    if params.redirect_uri ~= nil and rdata.match.response.redirect_uri ~= params.redirect_uri then
        table.insert(changed, "match.response.redirect_uri")
        rdata.match.response.redirect_uri = params.redirect_uri
    end
    if params.message ~= nil then
        -- Re-encode only when the caller updates the body.  We don't
        -- try to "are you sure?" the existing base64 value — that path
        -- belongs in delete + create.
        local code = rdata.match.response.code
        local new_msg = (code == 200 or code == 403) and Base64.encode(params.message) or params.message
        if rdata.match.response.message ~= new_msg then
            table.insert(changed, "match.response.message")
            rdata.match.response.message = new_msg
        end
    end
    if params.strip_path ~= nil then
        local v = params.strip_path and true or false
        if rdata.match.response.strip_path ~= v then
            table.insert(changed, "match.response.strip_path"); rdata.match.response.strip_path = v
        end
    end
    if params.auto_redirect_https ~= nil then
        local v = params.auto_redirect_https and true or false
        if rdata.match.response.auto_redirect_https ~= v then
            table.insert(changed, "match.response.auto_redirect_https"); rdata.match.response.auto_redirect_https = v
        end
    end

    if #changed == 0 then
        return {
            tool = "update_rule",
            result = {success = true, no_op = true, message = "No fields differed.", rule_id = rule_id},
            isError = false,
        }
    end

    if params.dry_run then
        return {
            tool = "update_rule",
            result = {
                dry_run = true,
                changed_fields = changed,
                would_write = rdata,
                would_write_to = rule_path,
            },
            isError = false,
        }
    end

    local wf, werr = io.open(rule_path, "wb")
    if not wf then
        return {tool = "update_rule", result = {error = "Write failed: " .. tostring(werr)}, isError = true}
    end
    wf:write(cjson.encode(rdata))
    wf:close()

    pcall(function()
        AuditLogger.log("update_rule", nil, "rules", rdata.name or rule_id, {
            rule_id = rule_id,
            profile_id = profile_id,
            changed_fields = changed,
            source = "mcp",
        })
    end)
    ngx.log(ngx.INFO, "MCP: updated rule '", rule_id, "' (",
        table.concat(changed, ", "), ") in profile '", profile_id, "'")

    return {
        tool = "update_rule",
        result = {
            success = true,
            rule_id = rule_id,
            changed_fields = changed,
            next_steps = "Rule updated.  Rules are read per-request — change is live with no reload.",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time()),
        },
        isError = false,
    }
end

-- ───────────────────────────────────────────────────────────────────────────
-- Tool: Delete a Virtual Server
-- ───────────────────────────────────────────────────────────────────────────
function _M.delete_server(params)
    local Helper = require("helpers")
    local AuditLogger = require("audit_logger")
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    local server_id = params.server_id
    local profile_id = params.profile_id
    if not server_id or server_id == "" then
        return {tool = "delete_server", result = {error = "server_id is required"}, isError = true}
    end
    if not profile_id or profile_id == "" then
        return {tool = "delete_server", result = {error = "profile_id is required"}, isError = true}
    end

    local server_path = configPath .. "data/servers/" .. profile_id .. "/" .. server_id .. ".json"
    local rf = io.open(server_path, "rb")
    if not rf then
        return {
            tool = "delete_server",
            result = {error = "Server not found: " .. server_id, expected_path = server_path},
            isError = true,
        }
    end
    local content = rf:read("*a")
    rf:close()
    local ok, sdata = pcall(cjson.decode, content)
    if not ok or type(sdata) ~= "table" then
        return {tool = "delete_server", result = {error = "Server JSON malformed"}, isError = true}
    end

    -- ── Find rules that reference this server (for cleanup) ──────────────
    -- A rule has a `servers` array listing the hosts it applies to.
    -- We don't delete the rules themselves — just remove this server
    -- from their reference list.
    local rules_to_detach = {}
    local lfs_ok, lfs = pcall(require, "lfs")
    if lfs_ok then
        local rules_dir = configPath .. "data/rules/" .. profile_id
        local attr = lfs.attributes(rules_dir)
        if attr and attr.mode == "directory" then
            for fname in lfs.dir(rules_dir) do
                if fname:match("%.json$") then
                    local fp = rules_dir .. "/" .. fname
                    local rfile = io.open(fp, "rb")
                    if rfile then
                        local rcontent = rfile:read("*a")
                        rfile:close()
                        local rok, rd = pcall(cjson.decode, rcontent)
                        if rok and type(rd) == "table" and type(rd.servers) == "table" then
                            for _, s in ipairs(rd.servers) do
                                if s == server_id then
                                    table.insert(rules_to_detach, {path = fp, id = rd.id, name = rd.name})
                                    break
                                end
                            end
                        end
                    end
                end
            end
        end
    end

    local was_active = sdata.config_status and true or false
    local live_conf_path = "/opt/nginx/conf.d/" .. (sdata.server_name or "") .. ".conf"
    local backup_conf_path = configPath .. "data/servers/" .. profile_id .. "/conf/" ..
        (sdata.server_name or "") .. ".conf"

    -- ── Preview mode (the default — confirm must be explicitly true) ─────
    -- Inverse of the create/update dry_run flag intentionally: deletes
    -- need confirmation, not preview-on-request.  destructiveHint on
    -- the schema annotation reinforces this for the LLM client.
    if not params.confirm then
        return {
            tool = "delete_server",
            result = {
                preview = true,
                confirm_required = true,
                server_id = server_id,
                server_name = sdata.server_name,
                profile_id = profile_id,
                was_active = was_active,
                would_remove = {
                    json_file = server_path,
                    backup_conf = backup_conf_path,
                    live_conf = was_active and live_conf_path or nil,
                },
                would_detach_from_rules = rules_to_detach,
                message = "Re-call with confirm=true to actually delete.",
            },
            isError = false,
        }
    end

    -- ── Detach from referencing rules ────────────────────────────────────
    local detached = {}
    for _, info in ipairs(rules_to_detach) do
        local rf2 = io.open(info.path, "rb")
        if rf2 then
            local rcontent = rf2:read("*a")
            rf2:close()
            local rok, rd = pcall(cjson.decode, rcontent)
            if rok and type(rd) == "table" and type(rd.servers) == "table" then
                local kept = {}
                for _, s in ipairs(rd.servers) do
                    if s ~= server_id then table.insert(kept, s) end
                end
                rd.servers = kept
                local wf = io.open(info.path, "wb")
                if wf then
                    wf:write(cjson.encode(rd))
                    wf:close()
                    table.insert(detached, info.id)
                end
            end
        end
    end

    -- ── Remove files ─────────────────────────────────────────────────────
    -- Three potential file removals, in increasing blast radius:
    --   1. The backup .conf (data/servers/{env}/conf/) — harmless
    --   2. The server JSON itself — what we're "deleting"
    --   3. The live .conf in /opt/nginx/conf.d/ — only if it was active
    local removals = {}
    if Helper.isFileExists and Helper.isFileExists(backup_conf_path) then
        os.remove(backup_conf_path); table.insert(removals, "backup_conf")
    end
    os.remove(server_path); table.insert(removals, "json")
    if was_active then
        local rok = os.remove(live_conf_path)
        if rok then
            table.insert(removals, "live_conf")
            -- Touch the reboot flag so the cron watcher signals nginx
            -- to drop the now-orphaned server block on the next pass.
            -- We don't run `openresty -s reload` ourselves — that's
            -- the same boundary api.lua respects, and the cron path
            -- gives a deferred-batch failure mode if multiple deletes
            -- happen in succession.
            local flag_path = "/tmp/nginx/nginx-reboot-required"
            pcall(function()
                local fh = io.open(flag_path, "w")
                if fh then fh:write("delete_server " .. server_id); fh:close() end
            end)
            table.insert(removals, "reboot_flag")
        end
    end

    pcall(function()
        AuditLogger.log("delete_server", nil, "servers", sdata.server_name or server_id, {
            server_id = server_id,
            profile_id = profile_id,
            was_active = was_active,
            detached_from_rules = detached,
            removals = removals,
            source = "mcp",
        })
    end)
    ngx.log(ngx.WARN, "MCP: DELETED server '", server_id, "' from profile '", profile_id,
        "' (was_active=", tostring(was_active), ", detached from ", #detached, " rule(s))")

    return {
        tool = "delete_server",
        result = {
            success = true,
            server_id = server_id,
            profile_id = profile_id,
            was_active = was_active,
            removals = removals,
            detached_from_rules = detached,
            next_steps = was_active
                and "Live config removed and reboot flag touched.  Cron watcher will pick it up; or call reload_config to force immediate apply."
                or  "Server data removed.  Nginx didn't have it active — no reload needed.",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time()),
        },
        isError = false,
    }
end

-- ───────────────────────────────────────────────────────────────────────────
-- Tool: Delete a routing rule
-- ───────────────────────────────────────────────────────────────────────────
function _M.delete_rule(params)
    local AuditLogger = require("audit_logger")
    local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

    local rule_id = params.rule_id
    local profile_id = params.profile_id
    if not rule_id or rule_id == "" then
        return {tool = "delete_rule", result = {error = "rule_id is required"}, isError = true}
    end
    if not profile_id or profile_id == "" then
        return {tool = "delete_rule", result = {error = "profile_id is required"}, isError = true}
    end

    local rule_path = configPath .. "data/rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local rf = io.open(rule_path, "rb")
    if not rf then
        return {
            tool = "delete_rule",
            result = {error = "Rule not found: " .. rule_id, expected_path = rule_path},
            isError = true,
        }
    end
    local content = rf:read("*a")
    rf:close()
    local ok, rdata = pcall(cjson.decode, content)
    if not ok or type(rdata) ~= "table" then
        return {tool = "delete_rule", result = {error = "Rule JSON malformed"}, isError = true}
    end

    -- ── Find every server that references this rule ──────────────────────
    -- Two reference paths (rules + match_cases) — strip both.
    local referencing_servers = {}
    for_each_server(profile_id, configPath, function(_, sdata)
        local in_rules = false
        local in_match_cases = false
        -- `rules` can be string or array
        if type(sdata.rules) == "string" and sdata.rules == rule_id then
            in_rules = true
        elseif type(sdata.rules) == "table" then
            for _, r in ipairs(sdata.rules) do
                if r == rule_id then in_rules = true; break end
            end
        end
        if type(sdata.match_cases) == "table" then
            for _, mc in ipairs(sdata.match_cases) do
                if mc.statement == rule_id then in_match_cases = true; break end
            end
        end
        if in_rules or in_match_cases then
            table.insert(referencing_servers, {
                id = sdata.id,
                in_rules = in_rules,
                in_match_cases = in_match_cases,
            })
        end
        return false  -- preview-only pass
    end)

    if not params.confirm then
        return {
            tool = "delete_rule",
            result = {
                preview = true,
                confirm_required = true,
                rule_id = rule_id,
                rule_name = rdata.name,
                profile_id = profile_id,
                response_code = rdata.match and rdata.match.response and rdata.match.response.code,
                would_remove = rule_path,
                would_detach_from_servers = referencing_servers,
                message = "Re-call with confirm=true to actually delete.",
            },
            isError = false,
        }
    end

    -- ── Detach: strip the rule reference from every server that has it ───
    local detached = {}
    for_each_server(profile_id, configPath, function(_, sdata)
        local touched = false
        -- Strip from `rules` (handle string and array shapes).  Bind
        -- to a local of the narrower type before ipairs() so the LSP
        -- can see the elseif branch is unambiguous.
        local rules_field = sdata.rules
        if type(rules_field) == "string" and rules_field == rule_id then
            sdata.rules = ""; touched = true
        elseif type(rules_field) == "table" then
            local rules_arr = rules_field  -- now narrowed to table
            local kept = {}
            for _, r in ipairs(rules_arr) do
                if r ~= rule_id then table.insert(kept, r) else touched = true end
            end
            sdata.rules = kept
        end
        -- Strip from match_cases
        if type(sdata.match_cases) == "table" then
            local kept = {}
            for _, mc in ipairs(sdata.match_cases) do
                if mc.statement ~= rule_id then table.insert(kept, mc) else touched = true end
            end
            sdata.match_cases = kept
        end
        if touched then table.insert(detached, sdata.id) end
        return touched, sdata
    end)

    -- ── Remove the rule file ─────────────────────────────────────────────
    os.remove(rule_path)

    pcall(function()
        AuditLogger.log("delete_rule", nil, "rules", rdata.name or rule_id, {
            rule_id = rule_id,
            profile_id = profile_id,
            detached_from_servers = detached,
            source = "mcp",
        })
    end)
    ngx.log(ngx.WARN, "MCP: DELETED rule '", rule_id, "' from profile '", profile_id,
        "' (detached from ", #detached, " server(s))")

    return {
        tool = "delete_rule",
        result = {
            success = true,
            rule_id = rule_id,
            profile_id = profile_id,
            detached_from_servers = detached,
            next_steps = "Rule deleted and detached.  Per-request rule loading means change is immediate; no reload needed.",
            timestamp = os.date("%Y-%m-%dT%H:%M:%SZ", ngx.time()),
        },
        isError = false,
    }
end

-- ──────────────────────────────────────────────────────────────────
-- POPs + DNS — implementations
-- ──────────────────────────────────────────────────────────────────

-- Helper: wrap a (data, err) backend return in the MCP response
-- shape.  Keeps each handler short and uniform.
local function pop_response(tool, data, err)
    if not data then
        return {
            tool = tool,
            result = {
                error = err and err.code or "internal_error",
                message = err and err.message or "Unknown error",
                details = err and err.details or nil,
            },
            isError = true,
        }
    end
    return {tool = tool, result = data, isError = false}
end

-- Tool: list_pops
function _M.list_pops(params)
    local Pops = require("pops")
    local limit = tonumber(params.limit) or 100
    if limit > 500 then limit = 500 end
    local filter = {}
    if params.status and params.status ~= "" then filter.status = params.status end
    if params.region and params.region ~= "" then filter.region = params.region end
    if params.q and params.q ~= "" then filter.q = params.q end
    local data, total = Pops.list({
        pagination = {page = 1, perPage = limit},
        sort = {field = "id", order = "ASC"},
        filter = filter,
    })
    return {
        tool = "list_pops",
        result = {pops = data, total = total, returned = #data},
        isError = false,
    }
end

-- Tool: get_pop
function _M.get_pop(params)
    local Pops = require("pops")
    if not params.pop_id or params.pop_id == "" then
        return pop_response("get_pop", nil, {
            code = "validation_failed", message = "pop_id is required"})
    end
    local rec, err = Pops.get(params.pop_id)
    return pop_response("get_pop", rec, err)
end

-- Tool: create_pop
function _M.create_pop(params)
    local Pops = require("pops")
    local payload = {
        id = params.id,
        display_name = params.display_name,
        public_ipv4 = params.public_ipv4,
        public_ipv6 = params.public_ipv6,
        region = params.region,
        city = params.city,
        country_code = params.country_code,
        provider = params.provider,
        status = params.status,
        capacity_weight = params.capacity_weight,
        tags = params.tags,
    }
    -- dry_run defaults to false here — operators creating POPs via an
    -- agent usually want the create to actually happen.  Pass
    -- dry_run=true explicitly to preview without writing.
    if params.dry_run then
        -- Lightweight preview: validate by running create then... not
        -- applying.  Pops doesn't expose a separate validator, so we
        -- approximate by returning what would be persisted alongside
        -- the message.  A future enhancement is to add Pops.validate().
        return {
            tool = "create_pop",
            result = {
                dry_run = true,
                would_create = payload,
                next_steps = "Re-run with dry_run=false to actually create.",
            },
            isError = false,
        }
    end
    local rec, err = Pops.create(payload, "mcp")
    if rec then
        ngx.log(ngx.INFO, "MCP: POP '", rec.id, "' created by ", ngx.var.remote_addr)
    end
    return pop_response("create_pop", rec, err)
end

-- Tool: update_pop
function _M.update_pop(params)
    local Pops = require("pops")
    if not params.pop_id or params.pop_id == "" then
        return pop_response("update_pop", nil, {
            code = "validation_failed", message = "pop_id is required"})
    end
    -- Build the delta — only include fields the caller actually
    -- passed, so an update of `status` doesn't accidentally clear
    -- `tags` by sending nil.
    local delta = {}
    for _, k in ipairs({"display_name", "public_ipv4", "public_ipv6",
                       "region", "city", "country_code", "provider",
                       "status", "capacity_weight", "tags"}) do
        if params[k] ~= nil then delta[k] = params[k] end
    end
    if params.dry_run then
        return {
            tool = "update_pop",
            result = {
                dry_run = true,
                pop_id = params.pop_id,
                would_patch = delta,
                next_steps = "Re-run with dry_run=false to apply.",
            },
            isError = false,
        }
    end
    local rec, err = Pops.update(params.pop_id, delta, "mcp")
    if rec then
        ngx.log(ngx.INFO, "MCP: POP '", params.pop_id, "' updated by ", ngx.var.remote_addr)
    end
    return pop_response("update_pop", rec, err)
end

-- Tool: delete_pop
function _M.delete_pop(params)
    local Pops = require("pops")
    if not params.pop_id or params.pop_id == "" then
        return pop_response("delete_pop", nil, {
            code = "validation_failed", message = "pop_id is required"})
    end
    -- Always inventory references first so the preview is useful
    -- (and so the destructive-action gate is informed).
    local refs = Pops.find_servers_using(params.pop_id) or {}
    if not params.confirm then
        return {
            tool = "delete_pop",
            result = {
                confirmed = false,
                pop_id = params.pop_id,
                referencing_servers = refs,
                will_cascade_detach = (#refs > 0) and (params.force or false) or nil,
                next_steps = (#refs > 0 and not params.force)
                    and "Servers reference this POP.  Re-run with confirm=true AND force=true to cascade-detach + delete, OR detach those servers first."
                    or "Re-run with confirm=true to actually delete.",
            },
            isError = false,
        }
    end
    local result, err = Pops.delete(
        params.pop_id, {force = params.force or false}, "mcp")
    if result then
        ngx.log(ngx.INFO, "MCP: POP '", params.pop_id, "' deleted by ",
            ngx.var.remote_addr, " (force=", tostring(params.force or false), ")")
        -- Pops.delete returns bare `true` on success; replace with a
        -- structured payload so the agent / dashboard sees what
        -- actually happened rather than an opaque boolean.
        return {
            tool = "delete_pop",
            result = {
                deleted = true,
                pop_id = params.pop_id,
                forced = params.force or false,
                detached_servers = (#refs > 0) and refs or nil,
            },
            isError = false,
        }
    end
    return pop_response("delete_pop", nil, err)
end

-- Tool: lookup_dns
function _M.lookup_dns(params)
    local DnsManager = require("dns_manager")
    if not params.domain or params.domain == "" then
        return pop_response("lookup_dns", nil, {
            code = "validation_failed", message = "domain is required"})
    end
    local result, err = DnsManager.lookup({
        domain = params.domain,
        type = params.record_type,
    })
    return pop_response("lookup_dns", result, err)
end

-- Tool: provision_dns
function _M.provision_dns(params)
    local DnsManager = require("dns_manager")
    if not params.server_id or params.server_id == "" then
        return pop_response("provision_dns", nil, {
            code = "validation_failed", message = "server_id is required"})
    end
    if not params.profile_id or params.profile_id == "" then
        return pop_response("provision_dns", nil, {
            code = "validation_failed", message = "profile_id is required"})
    end
    -- DEFAULT TO DRY-RUN.  This is the opposite of create_pop /
    -- update_pop: provisioning touches external state (Cloudflare),
    -- so an agent must always see the plan first.  The caller has
    -- to explicitly pass dry_run=false to actually apply.
    local dry_run = params.dry_run
    if dry_run == nil then dry_run = true end
    local result, err = DnsManager.provision_for_server({
        server_id = params.server_id,
        profile_id = params.profile_id,
        dry_run = dry_run,
        include_inactive = params.include_inactive,
        record_type = params.record_type,
    })
    if result and not dry_run then
        ngx.log(ngx.INFO, "MCP: DNS provisioned for server '",
            params.server_id, "' by ", ngx.var.remote_addr,
            " (", #(result.actions or {}), " actions)")
    end
    return pop_response("provision_dns", result, err)
end

-- Execute a tool by name
function _M.execute(tool_name, params)
    local config = McpConfig.load()

    -- Check if tools are enabled
    if not config.tools_enabled then
        return nil, "MCP tools are disabled. Set mcp.tools_enabled=true in settings.json"
    end

    params = params or {}

    local tool_handlers = {
        validate_config = function() return _M.validate_config() end,
        get_error_logs = function() return _M.get_error_logs(params) end,
        reload_config = function() return _M.reload_config(params) end,
        test_waf_rule = function() return _M.test_waf_rule(params) end,
        bind_waf_policy = function() return _M.bind_waf_policy(params) end,
        unbind_waf_policy = function() return _M.unbind_waf_policy(params) end,
        update_traffic_split = function() return _M.update_traffic_split(params) end,
        promote_backend = function() return _M.promote_backend(params) end,
        rollback_backend = function() return _M.rollback_backend(params) end,
        deploy_varnish = function() return _M.deploy_varnish(params) end,
        purge_varnish = function() return _M.purge_varnish(params) end,
        create_server = function() return _M.create_server(params) end,
        create_rule = function() return _M.create_rule(params) end,
        attach_rule = function() return _M.attach_rule(params) end,
        update_server = function() return _M.update_server(params) end,
        update_rule = function() return _M.update_rule(params) end,
        delete_server = function() return _M.delete_server(params) end,
        delete_rule = function() return _M.delete_rule(params) end,
        -- POPs + DNS (added in feature/pops-and-cloudflare-dns)
        list_pops = function() return _M.list_pops(params) end,
        get_pop = function() return _M.get_pop(params) end,
        create_pop = function() return _M.create_pop(params) end,
        update_pop = function() return _M.update_pop(params) end,
        delete_pop = function() return _M.delete_pop(params) end,
        lookup_dns = function() return _M.lookup_dns(params) end,
        provision_dns = function() return _M.provision_dns(params) end
    }

    local handler = tool_handlers[tool_name]
    if not handler then
        return nil, "Unknown tool: " .. tool_name
    end

    -- Check write permission for non-readonly tools
    local write_tools = {
        reload_config = true, bind_waf_policy = true, unbind_waf_policy = true,
        update_traffic_split = true, promote_backend = true, rollback_backend = true,
        deploy_varnish = true, purge_varnish = true,
        create_server = true, create_rule = true, attach_rule = true,
        update_server = true, update_rule = true,
        delete_server = true, delete_rule = true,
        -- POPs + DNS write tools.  provision_dns is in here even
        -- though it defaults to dry_run=true: a dry-run-only call
        -- doesn't mutate Cloudflare, but it still counts as a
        -- "write tool" for permission gating so an operator
        -- running MCP in read-only mode can't reach the apply path
        -- by accident.
        create_pop = true, update_pop = true, delete_pop = true,
        provision_dns = true
    }
    if write_tools[tool_name] then
        if tool_name == "reload_config" and params.dry_run ~= false then
            -- dry_run reload is read-only, allow it
        elseif tool_name == "provision_dns" and params.dry_run ~= false then
            -- dry_run provision is read-only (no Cloudflare writes),
            -- so allow even in read-only mode.  Mirrors the
            -- reload_config exception above.
        elseif McpConfig.is_read_only(config) then
            return nil, "Tool '" .. tool_name .. "' requires write mode. MCP is currently in read-only mode."
        end
    end

    local ok, result = pcall(handler)
    if not ok then
        ngx.log(ngx.ERR, "MCP: Tool execution error for '", tool_name, "': ", tostring(result))
        return nil, "Tool execution error: " .. tostring(result)
    end

    return result, nil
end

return _M
