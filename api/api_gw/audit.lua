-- api/api_gw/audit.lua
-- One structured JSON line per request, written to the nginx error log so a
-- Loki/Vector/Filebeat tail picks it up without a second sink.
--
-- Redaction is enforced here, not left to the caller: the emitter only ever
-- sees fields this module chose to copy, and header capture runs every name
-- through the redaction set that config.lua guarantees contains authorization,
-- cookie and the api-key names regardless of what the tenant configured.
-- Nothing in this file touches a request body or a query string unless the
-- tenant explicitly opted in, and even then the query string is truncated.
--
-- Client identity is written as `client_key_hash`, a tenant-salted digest.
-- The raw IP appears only when `audit.include_client_ip` is set.

local M = {}

local Keys = require("api_gw.keys")

M.MODULE = "audit"

-- cjson is resolved lazily: `Cjson` is installed as a global by api/init.lua,
-- which has always run before any request-path module loads. Requiring it at
-- module scope would also make the package unloadable outside OpenResty.
local function json()
    return Cjson or require("cjson")
end

local function ngx_level(name)
    if not ngx then return nil end
    local map = {
        debug = ngx.DEBUG, info = ngx.INFO, notice = ngx.NOTICE,
        warn = ngx.WARN, error = ngx.ERR,
    }
    return map[name] or ngx.INFO
end

--- Deterministic sampling so a single request either appears in full or not at
--- all. Errors and denials are always kept regardless of the rate — a sampled
--- audit trail that drops the 401s is worse than useless.
function M.should_emit(cfg_audit, ctx, status)
    if not cfg_audit.enabled then return false end
    -- Checked before the rate, not after: sample_rate 0 still has to keep the
    -- rejections, which is the whole reason an operator turns sampling on.
    if ctx.decision or (status and status >= 400) then return true end
    local rate = tonumber(cfg_audit.sample_rate) or 1
    if rate >= 1 then return true end
    if rate <= 0 then return false end
    return math.random() < rate
end

--- Copy the tenant's requested headers, dropping anything in the redaction
--- set. Values are truncated so a pathological header cannot bloat a log line.
function M.capture_headers(cfg_audit, headers)
    if #cfg_audit.include_headers == 0 then return nil end
    local out, n = {}, 0
    for _, name in ipairs(cfg_audit.include_headers) do
        local lname = tostring(name):lower()
        if not cfg_audit.redact_headers[lname] then
            local v = headers and headers[lname]
            if type(v) == "table" then v = v[1] end
            if type(v) == "string" and v ~= "" then
                out[lname] = (#v > 256) and (v:sub(1, 256) .. "…") or v
                n = n + 1
            end
        end
    end
    if n == 0 then return nil end
    return out
end

--- Build the audit record. Pure — returns a table, so tests can assert on the
--- exact field set without capturing log output.
function M.build(cfg, ctx, outcome)
    outcome = outcome or {}
    local a = cfg.audit

    local record = {
        ts             = outcome.ts or ((ngx and ngx.now) and ngx.now() or os.time()),
        tenant         = cfg.tenant,
        server         = cfg.server_name,
        profile        = cfg.profile_id,
        method         = ctx.method,
        path           = ctx.uri,
        status         = outcome.status,
        latency_ms     = outcome.latency_ms,
        correlation_id = ctx.correlation_id,
        client_key_hash = Keys.hash(cfg.tenant, ctx.client_ip),
        route          = ctx.route_name,
    }

    if a.include_client_ip then
        record.client_ip = ctx.client_ip
    end

    if a.include_query and ctx.query and ctx.query ~= "" then
        record.query = (#ctx.query > 512) and (ctx.query:sub(1, 512) .. "…") or ctx.query
    end

    if ctx.auth then
        record.auth = {
            strategy = ctx.auth.strategy,
            result   = ctx.auth.result,
            reason   = ctx.auth.reason,
            -- The consumer id may be an app user id; hash it like the IP.
            consumer_hash = ctx.consumer and Keys.hash(cfg.tenant, ctx.consumer) or nil,
            consumer_verified = ctx.consumer_verified,
        }
    end

    if ctx.rate_limit then
        record.rate_limit = {
            profile = ctx.rate_limit.profile,
            result  = ctx.rate_limit.result,
            count   = ctx.rate_limit.count,
            limit   = ctx.rate_limit.limit,
        }
    end

    if ctx.ivt then
        local signals = {}
        for _, f in ipairs(ctx.ivt.findings or {}) do
            signals[#signals + 1] = f.signal
        end
        record.ivt = {
            mode    = ctx.ivt.mode,
            verdict = ctx.ivt.verdict,
            score   = ctx.ivt.score,
            signals = (#signals > 0) and signals or nil,
        }
    end

    if ctx.cors then
        record.cors = { origin_allowed = ctx.cors.allowed, preflight = ctx.cors.preflight }
    end

    if ctx.stripped_headers and #ctx.stripped_headers > 0 then
        record.stripped_headers = ctx.stripped_headers
    end

    if ctx.decision then
        record.decision = {
            action = ctx.decision.action,
            module = ctx.decision.module,
            code   = ctx.decision.code,
            status = ctx.decision.status,
        }
    end

    local captured = M.capture_headers(a, ctx.headers)
    if captured then record.headers = captured end

    if outcome.bytes_sent then record.bytes_sent = outcome.bytes_sent end
    if outcome.upstream and outcome.upstream ~= "" then record.upstream = outcome.upstream end

    return record
end

--- Emit one line. Called from the log phase.
function M.emit(cfg, ctx, outcome)
    local a = cfg.audit
    if not M.should_emit(a, ctx, outcome and outcome.status) then return false end

    local record = M.build(cfg, ctx, outcome)
    local ok, encoded = pcall(function() return json().encode(record) end)
    if not ok then
        ngx.log(ngx.WARN, "[api_gw.audit] could not encode audit record: ", tostring(encoded))
        return false
    end
    ngx.log(ngx_level(a.level), a.tag, " ", encoded)
    return true
end

return M
