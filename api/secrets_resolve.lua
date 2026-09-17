-- Resolve PostgreSQL credentials from external secret stores.
-- Order: explicit override → Vault → SOPS file → WSLPROXY_PG_PASSWORD env.
--
-- Vault (WSLVault or HashiCorp KV v2 URL shape):
--   GET $VAULT_ADDR/v1/secret/data/wslproxy/{env}/pgsql
--   GET $VAULT_ADDR/v1/secret/data/wslproxy/{env}/settings.json  (.pgsql)
--
-- SOPS fallback (requires `sops` + age key on the host):
--   $SOPS_SETTINGS_PATH, or settings.sops_settings_path, or
--   {NGINX_CONFIG_DIR}/secrets/{env}/settings.sops.json

local _M = {}

local cjson = require("cjson.safe")

local function trim(s)
    if type(s) ~= "string" then
        return ""
    end
    return (s:gsub("^%s+", ""):gsub("%s+$", ""))
end

local function shell_quote(path)
    return "'" .. tostring(path):gsub("'", "'\\''") .. "'"
end

local function password_from_table(t)
    if type(t) ~= "table" then
        return nil
    end
    local pg = t.pgsql
    if type(pg) == "table" then
        local p = trim(pg.pg_password or pg.password or "")
        if p ~= "" then
            return p
        end
    end
    local p = trim(t.pg_password or t.password or "")
    if p ~= "" then
        return p
    end
    return nil
end

-- Decode WSLVault {"data":"<base64-json>"} or HashiCorp {"data":{"data":{...}}}.
function _M.decode_vault_body(body)
    local obj, err = cjson.decode(body or "")
    if type(obj) ~= "table" then
        return nil, err or "invalid vault JSON"
    end
    local data = obj.data
    if type(data) == "string" then
        local raw = ngx.decode_base64(data)
        if not raw then
            return nil, "vault data is not valid base64"
        end
        local inner = cjson.decode(raw)
        if type(inner) == "table" then
            return inner
        end
        -- single-value secret stored as raw string
        return { value = raw }
    end
    if type(data) == "table" then
        if type(data.data) == "table" then
            return data.data
        end
        if type(data.data) == "string" then
            local raw = ngx.decode_base64(data.data) or data.data
            local inner = cjson.decode(raw)
            if type(inner) == "table" then
                return inner
            end
            return { value = raw }
        end
        return data
    end
    return nil, "unsupported vault payload shape"
end

local function vault_addr_token(settings)
    settings = type(settings) == "table" and settings or {}
    local env_vars = type(settings.env_vars) == "table" and settings.env_vars or {}
    local vault = type(settings.vault) == "table" and settings.vault or {}
    local addr = trim(
        vault.addr
            or env_vars.VAULT_ADDR
            or os.getenv("VAULT_ADDR")
            or ""
    )
    if addr == "" then
        addr = "https://vault.workstation.co.uk"
    end
    local token = trim(
        vault.token
            or env_vars.VAULT_TOKEN
            or os.getenv("VAULT_TOKEN")
            or ""
    )
    return addr:gsub("/+$", ""), token
end

function _M.vault_get(settings, path)
    local addr, token = vault_addr_token(settings)
    if token == "" then
        return nil, "VAULT_TOKEN not configured"
    end
    local ok_http, http = pcall(require, "resty.http")
    if not ok_http or not http then
        return nil, "resty.http unavailable"
    end
    local url = addr .. "/v1/" .. tostring(path):gsub("^/+", "")
    local httpc = http.new()
    httpc:set_timeout(5000)
    local res, err = httpc:request_uri(url, {
        method = "GET",
        headers = {
            ["X-Vault-Token"] = token,
            ["Accept"] = "application/json",
        },
        ssl_verify = true,
    })
    if not res then
        return nil, "vault request failed: " .. tostring(err)
    end
    if res.status ~= 200 then
        return nil, "vault HTTP " .. tostring(res.status)
    end
    return _M.decode_vault_body(res.body)
end

local function sops_candidate_paths(settings, env_profile)
    local paths = {}
    local function add(p)
        p = trim(p or "")
        if p ~= "" then
            paths[#paths + 1] = p
        end
    end
    add(os.getenv("SOPS_SETTINGS_PATH"))
    if type(settings) == "table" then
        add(settings.sops_settings_path)
        if type(settings.secrets) == "table" then
            add(settings.secrets.sops_settings_path)
        end
    end
    local base = (os.getenv("NGINX_CONFIG_DIR") or configPath or "/opt/nginx/"):gsub("/+$", "") .. "/"
    local env = trim(env_profile or "")
    if env ~= "" then
        add(base .. "secrets/" .. env .. "/settings.sops.json")
        add(base .. "data/secrets/" .. env .. "/settings.sops.json")
        -- repo-relative layout when api is run from a checkout (dev)
        add(base .. "../infra/secrets/" .. env .. "/settings.sops.json")
    end
    return paths
end

function _M.sops_decrypt_json(path)
    path = trim(path or "")
    if path == "" then
        return nil, "empty sops path"
    end
    local f = io.open(path, "r")
    if not f then
        return nil, "sops file not found"
    end
    f:close()
    local cmd = "sops -d " .. shell_quote(path) .. " 2>/dev/null"
    local pipe = io.popen(cmd)
    if not pipe then
        return nil, "sops popen failed"
    end
    local raw = pipe:read("*a")
    local ok_close = pipe:close()
    if not ok_close or not raw or raw == "" then
        return nil, "sops decrypt failed"
    end
    local obj, err = cjson.decode(raw)
    if type(obj) ~= "table" then
        return nil, err or "sops output not JSON"
    end
    return obj
end

--- Resolve pg password. Returns password, source_label or nil, err.
function _M.resolve_pgsql_password(settings, opts)
    opts = type(opts) == "table" and opts or {}
    local override = trim(opts.override or "")
    if override ~= "" then
        return override, "override"
    end

    local env = trim(
        opts.env_profile
            or (type(settings) == "table" and settings.env_profile)
            or os.getenv("TARGET_ENV")
            or "prod"
    )

    -- 1) Vault dedicated pgsql secret, then full settings.json
    local vault_paths = {
        "secret/data/wslproxy/" .. env .. "/pgsql",
        "secret/data/wslproxy/" .. env .. "/settings.json",
    }
    for _, path in ipairs(vault_paths) do
        local data, err = _M.vault_get(settings, path)
        if data then
            local pw = password_from_table(data) or trim(data.value or "")
            if pw ~= "" then
                return pw, "vault:" .. path
            end
        else
            ngx.log(ngx.INFO, "secrets_resolve: vault miss ", path, " ", tostring(err))
        end
    end

    -- 2) SOPS file fallback
    for _, path in ipairs(sops_candidate_paths(settings, env)) do
        local data, err = _M.sops_decrypt_json(path)
        if data then
            local pw = password_from_table(data)
            if pw and pw ~= "" then
                return pw, "sops:" .. path
            end
            ngx.log(ngx.INFO, "secrets_resolve: sops has no pgsql.pg_password at ", path)
        else
            ngx.log(ngx.INFO, "secrets_resolve: sops miss ", path, " ", tostring(err))
        end
    end

    -- 3) Process env (Zalando / k8s secret inject)
    local from_env = trim(os.getenv("WSLPROXY_PG_PASSWORD") or "")
    if from_env ~= "" then
        return from_env, "env:WSLPROXY_PG_PASSWORD"
    end

    return nil, nil, "PostgreSQL password not found in Vault or SOPS"
end

return _M
