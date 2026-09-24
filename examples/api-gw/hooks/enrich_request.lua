-- Example custom api_gw hook.
-- Install as: $NGINX_CONFIG_DIR/data/hooks/enrich_request.lua
-- Reference from server JSON:
--   "hooks": { "enabled": true, "lua": [{ "name": "enrich", "phase": "access_before", "file": "hooks/enrich_request.lua" }] }
--
-- Must return a function(cfg, ctx, policy). Return nil to continue, or a
-- decision table (see api_gw.response) to terminate the request.

return function(cfg, ctx, policy)
    -- Stamp a tenant header for the origin (also doable declaratively).
    if ngx and ngx.req and ngx.req.set_header then
        ngx.req.set_header("X-WSL-Tenant", tostring(cfg.tenant or ""))
        ngx.req.set_header("X-WSL-Client-IP", tostring(ctx.client_ip or ""))
    end

    -- Example: reject a debug header in block-ish fashion via decision
    local headers = ctx.headers or {}
    local debug = headers["x-debug-bypass"] or headers["X-Debug-Bypass"]
    if debug and tostring(debug) ~= "" then
        local Response = require("api_gw.response")
        return Response.deny(403, "debug_bypass_forbidden", "X-Debug-Bypass is not allowed", {
            module = "hooks",
        })
    end

    return nil
end
