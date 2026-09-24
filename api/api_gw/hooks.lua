-- api/api_gw/hooks.lua
-- Custom extension points for api_gw.
--
-- Two complementary mechanisms (both opt-in via api_gw.hooks):
--
--   1. Declarative header transforms — set / remove / rename request or
--      response headers without writing Lua. Safe for all tenants.
--
--   2. Named Lua hooks — either an on-disk file under
--      $NGINX_CONFIG_DIR/data/hooks/<name>.lua or an inline `source`
--      string that returns a function(cfg, ctx, policy). Fail-open on
--      every error; a broken hook never 500s the tenant.
--
-- Phases:
--   access_before  — after real_ip, before CORS/IVT/auth (request mutation)
--   access_after   — after rate_limit (last chance to deny / enrich ctx)
--   header_filter  — mutate response headers before they reach the client
--
-- A hook may return nil (continue) or a decision table from api_gw.response
-- (terminate). Mutating ctx.response_headers / ngx.req.set_header is the
-- usual way to enrich without terminating.

local M = {}

local Config = require("api_gw.config")

local ALLOWED_PHASES = {
    access_before = true,
    access_after  = true,
    header_filter = true,
}

-- Only relative paths under data/hooks/; no .., no absolute paths.
local function safe_hook_path(rel)
    if type(rel) ~= "string" or rel == "" then return nil end
    if rel:find("%.%.") then return nil end
    if rel:sub(1, 1) == "/" then return nil end
    if not rel:match("^hooks/[A-Za-z0-9_./%-]+%.lua$") then return nil end
    return rel
end

local function config_dir()
    local d = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
    if d:sub(-1) ~= "/" then d = d .. "/" end
    return d
end

-- Minimal sandbox for inline sources. ngx is available (OpenResty already
-- trusts the admin plane); os.execute / io.popen are NOT exposed.
local function sandbox_env()
    return {
        ngx      = ngx,
        type     = type,
        pairs    = pairs,
        ipairs   = ipairs,
        next     = next,
        tostring = tostring,
        tonumber = tonumber,
        pcall    = pcall,
        error    = error,
        assert   = assert,
        select   = select,
        unpack   = unpack or table.unpack,
        string   = string,
        table    = table,
        math     = math,
        cjson    = (Cjson or require("cjson.safe")),
        require  = function(name)
            -- Allow requiring other api_gw helpers only.
            if type(name) == "string" and name:match("^api_gw%.") then
                return require(name)
            end
            error("hooks sandbox: require('" .. tostring(name) .. "') not allowed")
        end,
    }
end

local function load_inline(source, label)
    if type(source) ~= "string" or source == "" then
        return nil, "empty source"
    end
    -- LuaJIT / 5.1: loadstring; Lua 5.2+: load
    local loader = loadstring or load
    local chunk, err = loader(source, label or "api_gw.hook")
    if not chunk then
        return nil, "compile: " .. tostring(err)
    end
    if setfenv then
        setfenv(chunk, sandbox_env())
    end
    local ok, fn = pcall(chunk)
    if not ok then
        return nil, "init: " .. tostring(fn)
    end
    if type(fn) ~= "function" then
        return nil, "source must return a function(cfg, ctx, policy)"
    end
    return fn
end

local function load_file(rel)
    local safe = safe_hook_path(rel)
    if not safe then return nil, "invalid file path" end
    local path = config_dir() .. "data/" .. safe
    local f, err = io.open(path, "rb")
    if not f then return nil, "open " .. path .. ": " .. tostring(err) end
    local src = f:read("*a")
    f:close()
    return load_inline(src, "@" .. safe)
end

local function resolve_hook_fn(entry)
    if type(entry) ~= "table" then return nil, "not a table" end
    if entry.file and entry.file ~= "" then
        return load_file(entry.file)
    end
    if entry.source and entry.source ~= "" then
        return load_inline(entry.source, "api_gw.hook:" .. tostring(entry.name or "inline"))
    end
    return nil, "no file or source"
end

--- Expand simple {{var}} tokens from ctx / cfg.
local function expand_value(value, cfg, ctx)
    if type(value) ~= "string" then return value end
    return (value:gsub("{{([%w_%.]+)}}", function(key)
        if key == "server_name" then return tostring(cfg.server_name or "") end
        if key == "tenant" then return tostring(cfg.tenant or "") end
        if key == "client_ip" then return tostring(ctx.client_ip or "") end
        if key == "correlation_id" then return tostring(ctx.correlation_id or "") end
        if key == "method" then return tostring(ctx.method or "") end
        if key == "uri" then return tostring(ctx.uri or "") end
        if key == "route_name" then return tostring(ctx.route_name or "") end
        return ""
    end))
end

local function apply_header_ops(ops, cfg, ctx, on_request)
    if type(ops) ~= "table" then return end
    for _, op in ipairs(ops) do
        if type(op) == "table" and type(op.op) == "string" then
            local kind = op.op:lower()
            if kind == "set" and op.name and op.name ~= "" then
                local val = expand_value(op.value, cfg, ctx)
                if on_request then
                    if ngx and ngx.req and ngx.req.set_header then
                        pcall(ngx.req.set_header, op.name, val)
                    end
                    if type(ctx.headers) == "table" then
                        ctx.headers[op.name] = val
                        ctx.headers[op.name:lower()] = val
                    end
                else
                    ctx.response_headers = ctx.response_headers or {}
                    ctx.response_headers[op.name] = val
                end
            elseif kind == "remove" and op.name and op.name ~= "" then
                if on_request then
                    if ngx and ngx.req and ngx.req.clear_header then
                        pcall(ngx.req.clear_header, op.name)
                    end
                    if type(ctx.headers) == "table" then
                        ctx.headers[op.name] = nil
                        ctx.headers[op.name:lower()] = nil
                    end
                else
                    ctx.response_headers = ctx.response_headers or {}
                    ctx.response_headers[op.name] = nil
                    -- Empty string clears via header_filter assignment in some nginx builds;
                    -- prefer explicit nil and also set to empty to force drop.
                    if ngx and ngx.header then
                        ngx.header[op.name] = nil
                    end
                end
            elseif kind == "rename" and op["from"] and op["to"] then
                local from, to = op["from"], op["to"]
                if on_request then
                    local cur = ctx.headers and (ctx.headers[from] or ctx.headers[from:lower()])
                    if cur ~= nil then
                        if ngx and ngx.req then
                            pcall(ngx.req.set_header, to, cur)
                            if ngx.req.clear_header then pcall(ngx.req.clear_header, from) end
                        end
                        if type(ctx.headers) == "table" then
                            ctx.headers[to] = cur
                            ctx.headers[from] = nil
                            ctx.headers[from:lower()] = nil
                        end
                    end
                else
                    local cur = ctx.response_headers and ctx.response_headers[from]
                    if cur == nil and ngx and ngx.header then
                        cur = ngx.header[from]
                    end
                    if cur ~= nil then
                        ctx.response_headers = ctx.response_headers or {}
                        ctx.response_headers[to] = cur
                        ctx.response_headers[from] = nil
                        if ngx and ngx.header then ngx.header[from] = nil end
                    end
                end
            end
        end
    end
end

local function run_lua_hooks(cfg, ctx, policy, phase)
    local hooks = cfg.hooks
    if type(hooks) ~= "table" or type(hooks.lua) ~= "table" then return nil end

    for _, entry in ipairs(hooks.lua) do
        if type(entry) == "table" then
            local p = tostring(entry.phase or "access_before")
            if p == phase and ALLOWED_PHASES[p] then
                local fn, err = resolve_hook_fn(entry)
                if not fn then
                    ngx.log(ngx.WARN, "[api_gw] hook '", tostring(entry.name or "?"),
                        "' load failed: ", tostring(err), " — skipping (fail-open)")
                else
                    local ok, decision = pcall(fn, cfg, ctx, policy)
                    if not ok then
                        ngx.log(ngx.ERR, "[api_gw] hook '", tostring(entry.name or "?"),
                            "' errored: ", tostring(decision), " — continuing (fail-open)")
                    elseif decision then
                        decision.stage = decision.stage or ("hooks:" .. p)
                        decision.module = decision.module or "hooks"
                        return decision
                    end
                end
            end
        end
    end
    return nil
end

--- Access-phase stage: declarative request headers + lua access_before.
function M.request_phase(cfg, ctx, policy)
    if not Config.module_enabled(cfg, "hooks") then return nil end
    local hooks = cfg.hooks
    if type(hooks) ~= "table" or not hooks.enabled then return nil end

    apply_header_ops(hooks.request_headers, cfg, ctx, true)
    return run_lua_hooks(cfg, ctx, policy, "access_before")
end

--- Late access-phase stage: lua access_after.
function M.access_after(cfg, ctx, policy)
    if not Config.module_enabled(cfg, "hooks") then return nil end
    local hooks = cfg.hooks
    if type(hooks) ~= "table" or not hooks.enabled then return nil end
    return run_lua_hooks(cfg, ctx, policy, "access_after")
end

--- header_filter: declarative response headers + lua header_filter.
function M.header_filter(cfg, ctx)
    if not cfg or not Config.module_enabled(cfg, "hooks") then return end
    local hooks = cfg.hooks
    if type(hooks) ~= "table" or not hooks.enabled then return end

    apply_header_ops(hooks.response_headers, cfg, ctx, false)
    run_lua_hooks(cfg, ctx, ctx.policy, "header_filter")
end

return M
