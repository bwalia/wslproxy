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
    }
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
        purge_varnish = function() return _M.purge_varnish(params) end
    }

    local handler = tool_handlers[tool_name]
    if not handler then
        return nil, "Unknown tool: " .. tool_name
    end

    -- Check write permission for non-readonly tools
    local write_tools = {
        reload_config = true, bind_waf_policy = true, unbind_waf_policy = true,
        update_traffic_split = true, promote_backend = true, rollback_backend = true,
        deploy_varnish = true, purge_varnish = true
    }
    if write_tools[tool_name] then
        if tool_name == "reload_config" and params.dry_run ~= false then
            -- dry_run reload is read-only, allow it
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
