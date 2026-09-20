-- api/api_gw/init.lua
-- Public façade for the api_gw package.
--
-- Three entry points, one per nginx phase:
--
--   access(server_config, rule_data, profile_id)
--       rewrite phase, via gateway_pipeline.execute. Runs the staged access
--       pipeline. Returns true when the request has already been answered.
--
--   header_filter()
--       header_filter phase. Applies the response headers the access phase
--       collected (CORS, correlation id, RateLimit-*). Collected rather than
--       set directly because an upstream response can overwrite headers set
--       in an earlier phase.
--
--   log()
--       log phase, via log_handler. Emits the structured audit line.
--
-- The whole package is opt-in: with no `api_gw` block on a server, access()
-- returns false after one table lookup and nothing else in here runs.

local _M = {}

local Config = require("api_gw.config")
local Pipeline = require("api_gw.pipeline")
local Response = require("api_gw.response")
local Audit = require("api_gw.audit")

_M.VERSION = "1.0.0"

--- Build the per-request context the stages read and write.
--- Kept in ngx.ctx so the header_filter and log phases can pick it up.
function _M.new_context(cfg)
    local headers = {}
    if ngx and ngx.req and ngx.req.get_headers then
        local ok, h = pcall(ngx.req.get_headers)
        if ok and type(h) == "table" then headers = h end
    end

    local args
    if ngx and ngx.req and ngx.req.get_uri_args then
        local ok, a = pcall(ngx.req.get_uri_args)
        if ok and type(a) == "table" then args = a end
    end

    return {
        cfg              = cfg,
        headers          = headers,
        args             = args,
        method           = (ngx and ngx.req and ngx.req.get_method) and ngx.req.get_method() or "GET",
        uri              = (ngx and ngx.var and ngx.var.uri) or "/",
        query            = (ngx and ngx.var and ngx.var.args) or nil,
        peer_addr        = (ngx and ngx.var and ngx.var.remote_addr) or "0.0.0.0",
        client_ip        = (ngx and ngx.var and ngx.var.remote_addr) or "0.0.0.0",
        response_headers = {},
        findings         = {},
        started_at       = (ngx and ngx.now) and ngx.now() or os.time(),
    }
end

--- Access phase entry point.
---
--- @param server_config table  server JSON for this host
--- @param rule_data     table|nil  matched rule, for a per-rule override
--- @param profile_id    string|nil
--- @return boolean handled  true when the response has already been sent
function _M.access(server_config, rule_data, profile_id)
    local cfg = Config.resolve(server_config, rule_data, profile_id)
    if not cfg then
        return false
    end

    local ctx = _M.new_context(cfg)
    ngx.ctx.api_gw = ctx

    local decision = Pipeline.run(cfg, ctx)
    if not decision then
        return false
    end

    -- Audit the rejection here: the log phase still runs for a request we
    -- terminate, but recording at the decision point keeps the reason next to
    -- the code that produced it.
    ctx.terminated = true
    return Response.send(decision, ctx)
end

--- header_filter phase entry point. Safe to call unconditionally.
function _M.header_filter()
    local ctx = ngx.ctx.api_gw
    if not ctx or type(ctx.response_headers) ~= "table" then return end
    for k, v in pairs(ctx.response_headers) do
        if v ~= nil then
            ngx.header[k] = v
        end
    end
end

--- log phase entry point. Safe to call unconditionally.
function _M.log()
    local ctx = ngx.ctx.api_gw
    if not ctx or not ctx.cfg then return end
    if not Config.module_enabled(ctx.cfg, "audit") then return end

    local status = tonumber(ngx.status) or 0
    local request_time = tonumber(ngx.var.request_time) or
        (((ngx.now and ngx.now()) or 0) - (ctx.started_at or 0))

    local ok, err = pcall(Audit.emit, ctx.cfg, ctx, {
        status     = status,
        latency_ms = math.floor((request_time or 0) * 1000 + 0.5),
        bytes_sent = tonumber(ngx.var.bytes_sent),
        upstream   = ngx.var.upstream_addr,
    })
    if not ok then
        ngx.log(ngx.WARN, "[api_gw] audit emit failed: ", tostring(err))
    end
end

--- Exposed for docs, tests and the admin API: the deterministic stage order.
function _M.pipeline_order()
    return Pipeline.order()
end

--- Exposed so the admin plane can show a tenant its effective policy without
--- duplicating the normalisation rules.
_M.resolve_config = Config.resolve

return _M
