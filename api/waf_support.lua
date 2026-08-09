-- WAF support module: correlation IDs + structured security logging.
-- Every enforcement decision (block or alarm) is assigned a stable support_id
-- that is echoed to the client (X-Support-ID header / block page) and written
-- to a structured JSON security log, so an operator can pivot from a user's
-- "I got a 403, ref WSL-..." straight to the exact finding.

local _M = {}
local cjson = Cjson or require("cjson")

-- Generate a correlation id. ngx.now() gives sub-second resolution; the random
-- suffix disambiguates concurrent requests on the same worker.
function _M.support_id()
    local t = ngx.now()
    return string.format("WSL-%x-%04x", math.floor(t), math.random(0, 0xffff))
end

-- Build the canonical finding record shared by logs, metrics and the API.
-- stage      : which pipeline stage produced it (e.g. "method", "signature", "jwt")
-- action     : "block" | "alarm"
-- code       : violation code (e.g. "VIOL_METHOD", "VIOL_ATTACK_SIGNATURE")
-- sig_id     : signature / rule id when applicable
function _M.finding(fields)
    return {
        support_id = fields.support_id,
        stage = fields.stage,
        action = fields.action,
        code = fields.code,
        signature_id = fields.sig_id,
        signature_set = fields.sig_set,
        category = fields.category,
        severity = fields.severity,
        target = fields.target,
        detail = fields.detail,
        policy = fields.policy,
        service = fields.service,
        binding = fields.binding, -- which binding won: "route:/x" | "domain"
    }
end

-- Emit a structured security-log line. Tagged "wafsec" so it can be grepped or
-- routed to syslog/OTel by a log shipper. Latency is in microseconds.
function _M.log_security(server_config, finding, latency_us)
    local rec = {
        ts = ngx.time(),
        support_id = finding.support_id,
        action = finding.action,
        code = finding.code,
        stage = finding.stage,
        signature_id = finding.signature_id,
        signature_set = finding.signature_set,
        category = finding.category,
        severity = finding.severity,
        target = finding.target,
        detail = finding.detail,
        policy = finding.policy,
        service = finding.service,
        binding = finding.binding,
        host = (server_config and server_config.server_name) or ngx.var.host or "unknown",
        client_ip = ngx.var.remote_addr or "",
        method = ngx.req.get_method() or "",
        uri = ngx.var.request_uri or "",
        latency_us = latency_us and math.floor(latency_us * 1000000) or nil,
        user_agent = ngx.var.http_user_agent or "",
    }
    local ok, line = pcall(cjson.encode, rec)
    if ok then
        -- WARN keeps it visible without the noise of ERR; the "wafsec " prefix
        -- is the stable grep/parse anchor.
        ngx.log(ngx.WARN, "wafsec ", line)
    end

    -- Also retain in the shared dict for the recent-events API.
    local waf_events = ngx.shared.waf_events
    if waf_events then
        local key = ngx.time() .. ":" .. math.random(1, 1000000)
        pcall(function() waf_events:set(key, line, 3600) end)
    end
end

return _M
