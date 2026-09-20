-- api/api_gw/response.lua
-- Uniform deny/decision handling for the api_gw pipeline.
--
-- Every module that can stop a request returns a decision table instead of
-- writing to ngx itself.  The pipeline hands the decision here, so the wire
-- format, the correlation header and the audit trail stay in one place and
-- cannot drift between modules.

local M = {}

-- cjson is resolved lazily: `Cjson` is installed as a global by api/init.lua,
-- which has always run before any request-path module loads. Requiring it at
-- module scope would also make the package unloadable outside OpenResty.
local function json()
    return Cjson or require("cjson")
end

M.CONTENT_TYPE = "application/json; charset=utf-8"

--- Build a decision that stops the pipeline and rejects the request.
--- @param status number   HTTP status to return
--- @param code   string   stable machine-readable error code
--- @param message string  human-readable, safe to show a caller
--- @param opts   table|nil { headers = {..}, module = "..", detail = {..} }
function M.deny(status, code, message, opts)
    opts = opts or {}
    return {
        action  = "deny",
        status  = status,
        code    = code,
        message = message,
        headers = opts.headers,
        module  = opts.module,
        detail  = opts.detail,
    }
end

--- Build a decision that ends the request successfully without proxying
--- (CORS preflight is the only current user).
function M.finish(status, opts)
    opts = opts or {}
    return {
        action  = "finish",
        status  = status,
        headers = opts.headers,
        module  = opts.module,
        body    = opts.body,
    }
end

local function apply_headers(headers)
    if type(headers) ~= "table" then return end
    for k, v in pairs(headers) do
        if v ~= nil then
            ngx.header[k] = v
        end
    end
end

--- Write a decision to the wire and terminate the request.
---
--- Returns true so callers can `if Response.send(...) then return true end`.
--- @param decision table
--- @param ctx table|nil  request context (for correlation id)
function M.send(decision, ctx)
    local status = decision.status or 403

    ngx.status = status
    apply_headers(ctx and ctx.response_headers)
    apply_headers(decision.headers)

    if decision.action == "finish" then
        if decision.body then
            ngx.header["Content-Type"] = M.CONTENT_TYPE
            ngx.print(decision.body)
        else
            -- 204/304 must not carry a body.
            ngx.header["Content-Length"] = "0"
        end
        ngx.exit(status)
        return true
    end

    ngx.header["Content-Type"] = M.CONTENT_TYPE
    local body = {
        error   = decision.code or "forbidden",
        message = decision.message or "Request rejected by the API gateway",
    }
    if ctx and ctx.correlation_id then
        body.correlation_id = ctx.correlation_id
    end
    local ok, encoded = pcall(function() return json().encode(body) end)
    ngx.say(ok and encoded or '{"error":"forbidden"}')
    ngx.exit(status)
    return true
end

return M
