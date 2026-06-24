-- MCP Gateway for WSLProxy
--
-- Turns wslproxy into a governed front door in front of *external* MCP
-- (Model Context Protocol) servers — filesystem, GitHub, Slack, internal
-- tools, etc.  Clients connect to wslproxy; wslproxy inspects the
-- JSON-RPC traffic and enforces policy before proxying upstream.
--
-- NOTE: this is the gateway (proxy to OTHER MCP servers).  It is distinct
-- from api/mcp/ which is wslproxy's own MCP *server* (manage the gateway
-- itself).  They don't share code.
--
-- MCP rides JSON-RPC 2.0 over Streamable HTTP.  Governance is entirely
-- request-side — inspect the `tools/call` on the way in, allow -> proxy,
-- deny -> return a JSON-RPC error without ever reaching the upstream.
-- No response rewriting, so no nginx template changes are required.
--
-- Capabilities (Phase 1 MVP):
--   * Auth bridging   — strip the client's inbound credential; the
--                       upstream MCP server's credential is injected via
--                       the server's custom_headers (secrets stay server-side).
--   * Tool/method allow-deny — block disallowed tools or JSON-RPC methods.
--   * Audit           — log every tools/call to the audit trail.
--   * Rate limiting   — per-client, optionally per-tool, via wsl_cache.
--
-- Activation is per-rule.  A rule's response carries:
--   "mcp_gateway": {
--     "enabled": true,
--     "strip_client_auth": true,
--     "tools":   { "mode": "deny", "list": ["delete_file","exec"] },
--     "methods": { "deny": ["resources/write"] },
--     "audit":   true,
--     "rate_limit": { "window": 60, "max": 120, "per_tool": { "search": 20 } }
--   }
--
-- Follow-ups (not in MVP): filter `tools/list` responses to the allowed
-- set (response-side), multi-upstream federation, per-subject identity
-- from JWT instead of remote_addr.

local _M = {}

local cjson = Cjson or require("cjson")
local cjson_safe = require("cjson.safe")
local _audit_ok, AuditLogger = pcall(require, "audit_logger")

-- ============================================================
-- Pure policy core (no ngx) — unit-testable
-- ============================================================

-- A decoded JSON-RPC batch is an array (has [1]); a single call is an
-- object (has .jsonrpc/.method).  cheap, allocation-free check.
function _M.is_batch(rpc)
    return type(rpc) == "table" and rpc[1] ~= nil
end

local function list_contains(list, value)
    if type(list) ~= "table" or value == nil then return false end
    for _, v in ipairs(list) do
        if v == value then return true end
    end
    return false
end

--- Is `tool` permitted by the policy?
---   mode "allow" -> only names in `list` pass (allowlist)
---   mode "deny"  -> names in `list` are blocked (denylist); default
---   no tools block at all -> everything passes
function _M.tool_allowed(cfg, tool)
    local t = cfg and cfg.tools
    if type(t) ~= "table" or type(t.list) ~= "table" or #t.list == 0 then
        return true
    end
    if t.mode == "allow" then
        return list_contains(t.list, tool)
    end
    -- default: denylist
    return not list_contains(t.list, tool)
end

--- Is a JSON-RPC `method` explicitly denied?
function _M.method_denied(cfg, method)
    local m = cfg and cfg.methods
    if type(m) ~= "table" then return false end
    return list_contains(m.deny, method)
end

--- Pure decision for one JSON-RPC call.  Rate limiting is stateful and
--- handled separately in the ngx layer.
--- Returns { allow = true, method, tool } OR
---         { allow = false, code, message }.
function _M.decision(cfg, call)
    if type(call) ~= "table" then
        return { allow = true }       -- not a JSON-RPC object; pass through
    end
    local method = call.method
    if type(method) == "string" and _M.method_denied(cfg, method) then
        return {
            allow = false, code = -32601,
            message = "MCP gateway: method '" .. method .. "' is not allowed by policy",
        }
    end
    if method == "tools/call" then
        local tool = call.params and call.params.name
        if not _M.tool_allowed(cfg, tool) then
            return {
                allow = false, code = -32000,
                message = "MCP gateway: tool '" .. tostring(tool) ..
                    "' is not allowed by policy",
            }
        end
        return { allow = true, method = method, tool = tool }
    end
    return { allow = true, method = method }
end

-- ============================================================
-- ngx-facing wrappers
-- ============================================================

-- Per-client (optionally per-tool) sliding window via the shared dict.
-- Returns true to allow, false to reject.  Fails open on any infra issue.
local function rate_ok(cfg, tool)
    local rl = cfg.rate_limit
    if type(rl) ~= "table" then return true end
    local dict = ngx.shared.wsl_cache
    if not dict then return true end
    local max = rl.per_tool and tool and tonumber(rl.per_tool[tool]) or tonumber(rl.max)
    if not max then return true end           -- no limit configured for this tool
    local window = tonumber(rl.window) or 60
    local client = ngx.var.remote_addr or "0.0.0.0"
    local key = "mcpgw:" .. (tool or "_") .. ":" .. client
    local cur, err = dict:incr(key, 1, 0, window)
    if err then
        ngx.log(ngx.WARN, "mcp_gateway: rate counter error: ", err)
        return true                            -- fail-open
    end
    return not (cur and cur > max)
end

-- Send a JSON-RPC error response and end the request without proxying.
local function reject(id, code, message)
    ngx.status = ngx.HTTP_OK                   -- MCP surfaces errors in the JSON-RPC body
    ngx.header["Content-Type"] = "application/json"
    ngx.header["X-MCP-Gateway"] = "deny"
    ngx.say(cjson.encode({
        jsonrpc = "2.0",
        id = id,
        error = { code = code or -32000, message = message or "denied by MCP gateway policy" },
    }))
    return ngx.exit(ngx.HTTP_OK)
end

local function audit_call(cfg, call)
    if not cfg.audit or not _audit_ok or not AuditLogger then return end
    local tool = call.params and call.params.name
    pcall(AuditLogger.log, "mcp_tool_call", ngx.var.remote_addr or "unknown",
        "mcp", tool or "?", {
            method = call.method,
            client = ngx.var.remote_addr,
            request_id = ngx.var.request_id,
        })
end

--- Access-phase entry point.  Inspect the JSON-RPC request and enforce
--- policy.  Either returns (allowed — caller continues to proxy) or
--- finalises the request with a JSON-RPC error (denied / rate-limited).
--- Fails OPEN on anything it can't inspect (non-POST, unbuffered body,
--- non-JSON) so the gateway never breaks legitimate traffic it can't
--- reason about — governance applies to recognised tools/call only.
function _M.enforce(cfg)
    if type(cfg) ~= "table" or cfg.enabled == false then return end

    -- SSE GET (the server->client stream) and other non-body methods just
    -- proxy through; there's no tools/call to inspect.
    if ngx.req.get_method() ~= "POST" then return end

    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    if not body or body == "" then
        -- Body buffered to a temp file (large) — can't inspect cheaply.
        ngx.log(ngx.WARN, "mcp_gateway: request body not in memory; passing through")
        return
    end

    local rpc = cjson_safe.decode(body)
    if type(rpc) ~= "table" then return end    -- not JSON-RPC

    local calls = _M.is_batch(rpc) and rpc or { rpc }
    for _, call in ipairs(calls) do
        local d = _M.decision(cfg, call)
        if not d.allow then
            return reject(call.id, d.code, d.message)
        end
        if call.method == "tools/call" then
            local tool = call.params and call.params.name
            if not rate_ok(cfg, tool) then
                return reject(call.id, -32000,
                    "MCP gateway: rate limit exceeded for tool '" .. tostring(tool) .. "'")
            end
            audit_call(cfg, call)
        end
    end

    -- Allowed.  Auth bridging: drop the client's credential so it is not
    -- forwarded upstream — the upstream MCP server's own credential is
    -- injected by the server's custom_headers.
    if cfg.strip_client_auth then
        ngx.req.clear_header("Authorization")
    end
    ngx.ctx.mcp_gateway = { active = true }
end

return _M
