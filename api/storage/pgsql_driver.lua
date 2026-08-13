-- PostgreSQL driver. Typed tables + raw_json safety valve.
-- Reads reconstruct the record from raw_json (full round-trip), falling
-- back to typed columns if raw_json is missing. Writes always persist
-- both typed columns and the complete JSON document.

local cjson = Cjson or require("cjson")
local Driver = require("storage.driver")
local Query = require("storage.query")

local _M = {}

local TABLE_MAP = {
    servers      = "servers",
    rules        = "rules",
    secrets      = "secrets",
    instances    = "instances",
    upstreams    = "upstreams",
    waf_rules    = "waf_rules",
    waf_policies = "waf_policies",
    waf_events   = "waf_events",
    users        = "users",
    pops         = "pops",
    bookmarks    = "bookmarks",
    profiles     = "profiles",
    company_logo = "company_logo",
}

local SCOPED = {
    servers = true, rules = true, secrets = true, instances = true,
    upstreams = true, waf_rules = true, waf_policies = true, waf_events = true,
}

local function esc(s)
    if s == nil then
        return "NULL"
    end
    s = tostring(s):gsub("'", "''")
    return "'" .. s .. "'"
end

local function json_esc(tbl)
    local ok, encoded = pcall(cjson.encode, tbl)
    if not ok then
        return "NULL"
    end
    return esc(encoded)
end

local function bool_sql(v)
    if v == true or v == "true" or v == 1 or v == "1" then
        return "TRUE"
    end
    if v == false or v == "false" or v == 0 or v == "0" then
        return "FALSE"
    end
    return "NULL"
end

local function num_sql(v)
    local n = tonumber(v)
    if n == nil then
        return "NULL"
    end
    return tostring(n)
end

local function ident(name)
    return '"' .. tostring(name):gsub('"', "") .. '"'
end

function _M.new(opts)
    opts = opts or {}
    local self = {
        settings = opts.settings or {},
        pg = opts.pg,
    }
    setmetatable(self, { __index = _M })
    return self
end

function _M:connect()
    if self.pg then
        return self.pg
    end
    local ok_req, pgmoon = pcall(require, "pgmoon")
    if not ok_req or not pgmoon then
        return nil, "pgmoon not installed"
    end
    local cfg = self.settings.pgsql or {}
    local pg = pgmoon.new({
        host     = cfg.host or cfg.pg_host or os.getenv("WSLPROXY_PG_HOST") or "127.0.0.1",
        port     = tonumber(cfg.port or cfg.pg_port or os.getenv("WSLPROXY_PG_PORT")) or 5432,
        database = cfg.database or cfg.pg_database or os.getenv("WSLPROXY_PG_DB") or "wslproxy",
        user     = cfg.user or cfg.pg_user or os.getenv("WSLPROXY_PG_USER") or "wslproxy",
        password = cfg.password or cfg.pg_password or os.getenv("WSLPROXY_PG_PASSWORD") or "",
        ssl      = cfg.ssl == true,
    })
    local ok, err = pg:connect()
    if not ok then
        return nil, err or "pgsql connect failed"
    end
    self.pg = pg
    return pg
end

function _M:query(sql)
    local pg, err = self:connect()
    if not pg then
        return nil, err
    end
    local res, qerr = pg:query(sql)
    if not res then
        return nil, qerr
    end
    return res
end

local function typed_columns(resource, env, id, rec)
    rec = rec or {}
    local now = os.date("!%Y-%m-%dT%H:%M:%SZ")
    if resource == "servers" then
        return {
            id = id,
            env_profile = env,
            server_name = rec.server_name or rec.id,
            proxy_server_name = rec.proxy_server_name,
            profile_id = rec.profile_id or env,
            ssl_enabled = rec.ssl_enabled,
            ssl_force_https = rec.ssl_force_https,
            cache_enabled = rec.cache_enabled,
            varnish_enabled = rec.varnish_enabled,
            waf_enabled = rec.waf_enabled,
            waf_policy_id = rec.waf_policy_id,
            rate_limit_enabled = rec.rate_limit_enabled,
            config_status = rec.config_status,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "rules" then
        local match = rec.match or {}
        local rules = match.rules or {}
        local response = match.response or {}
        return {
            id = id,
            env_profile = env,
            name = rec.name,
            priority = rec.priority or 0,
            profile_id = rec.profile_id or env,
            path = rules.path,
            path_key = rules.path_key,
            status_code = response.code,
            redirect_uri = response.redirect_uri,
            schema_version = rec._schema_version or 2,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "secrets" then
        return {
            id = id,
            env_profile = env,
            name = rec.name,
            kind = rec.kind or rec.type,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "upstreams" then
        return {
            id = id,
            env_profile = env,
            name = rec.name,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "waf_policies" then
        return {
            id = id,
            env_profile = env,
            name = rec.name,
            mode = rec.mode,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "waf_rules" then
        return {
            id = id,
            env_profile = env,
            name = rec.name,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "waf_events" then
        return {
            id = id,
            env_profile = env,
            created_at = rec.created_at or now,
        }
    elseif resource == "instances" then
        return {
            id = id,
            env_profile = env,
            name = rec.name,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "users" then
        return {
            id = id,
            username = rec.username or rec.name,
            email = rec.email,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "pops" then
        return {
            id = id,
            name = rec.name,
            status = rec.status,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "bookmarks" then
        return {
            id = id,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "profiles" then
        return {
            id = id,
            name = rec.name or id,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    elseif resource == "company_logo" then
        return {
            id = id,
            created_at = rec.created_at or now,
            updated_at = rec.updated_at or now,
        }
    end
    return { id = id, env_profile = env }
end

local function col_sql(resource, cols)
    local order
    if resource == "servers" then
        order = {
            "id", "env_profile", "server_name", "proxy_server_name", "profile_id",
            "ssl_enabled", "ssl_force_https", "cache_enabled", "varnish_enabled",
            "waf_enabled", "waf_policy_id", "rate_limit_enabled", "config_status",
            "created_at", "updated_at", "raw_json",
        }
    elseif resource == "rules" then
        order = {
            "id", "env_profile", "name", "priority", "profile_id",
            "path", "path_key", "status_code", "redirect_uri", "schema_version",
            "created_at", "updated_at", "raw_json",
        }
    elseif resource == "secrets" then
        order = { "id", "env_profile", "name", "kind", "created_at", "updated_at", "raw_json" }
    elseif resource == "upstreams" then
        order = { "id", "env_profile", "name", "created_at", "updated_at", "raw_json" }
    elseif resource == "waf_policies" then
        order = { "id", "env_profile", "name", "mode", "created_at", "updated_at", "raw_json" }
    elseif resource == "waf_rules" then
        order = { "id", "env_profile", "name", "created_at", "updated_at", "raw_json" }
    elseif resource == "waf_events" then
        order = { "id", "env_profile", "created_at", "raw_json" }
    elseif resource == "instances" then
        order = { "id", "env_profile", "name", "created_at", "updated_at", "raw_json" }
    elseif resource == "users" then
        order = { "id", "username", "email", "created_at", "updated_at", "raw_json" }
    elseif resource == "pops" then
        order = { "id", "name", "status", "created_at", "updated_at", "raw_json" }
    elseif resource == "bookmarks" then
        order = { "id", "created_at", "updated_at", "raw_json" }
    elseif resource == "profiles" then
        order = { "id", "name", "created_at", "updated_at", "raw_json" }
    elseif resource == "company_logo" then
        order = { "id", "created_at", "updated_at", "raw_json" }
    else
        order = { "id", "raw_json" }
    end

    local bools = {
        ssl_enabled = true, ssl_force_https = true, cache_enabled = true,
        varnish_enabled = true, waf_enabled = true, rate_limit_enabled = true,
        config_status = true,
    }
    local nums = { priority = true, schema_version = true, status_code = true }

    local names, values, updates = {}, {}, {}
    for _, col in ipairs(order) do
        names[#names + 1] = ident(col)
        local v
        if col == "raw_json" then
            v = "NULL" -- filled by caller
        elseif bools[col] then
            v = bool_sql(cols[col])
        elseif nums[col] then
            v = num_sql(cols[col])
        else
            v = esc(cols[col])
        end
        values[#values + 1] = v
        if col ~= "id" and col ~= "env_profile" then
            updates[#updates + 1] = ident(col) .. " = EXCLUDED." .. ident(col)
        end
    end
    return names, values, updates, order
end

local function conflict_target(resource)
    if SCOPED[resource] then
        return "(id, env_profile)"
    end
    return "(id)"
end

local function where_pk(resource, env, id)
    if SCOPED[resource] then
        return "id = " .. esc(id) .. " AND env_profile = " .. esc(env)
    end
    return "id = " .. esc(id)
end

local function row_to_record(row)
    if not row then
        return nil
    end
    local raw = row.raw_json
    if type(raw) == "table" then
        return raw
    end
    if type(raw) == "string" and raw ~= "" then
        local ok, decoded = pcall(cjson.decode, raw)
        if ok and type(decoded) == "table" then
            return decoded
        end
    end
    -- typed-column fallback (should be rare)
    local rec = {}
    for k, v in pairs(row) do
        if k ~= "raw_json" then
            rec[k] = v
        end
    end
    return rec
end

function _M:get(resource, env, id)
    local table_name = TABLE_MAP[resource]
    if not table_name then
        return nil, "unknown resource: " .. tostring(resource)
    end
    local sql = "SELECT * FROM " .. ident(table_name) .. " WHERE " .. where_pk(resource, env, id) .. " LIMIT 1"
    local res, err = self:query(sql)
    if not res then
        return nil, err
    end
    if type(res) ~= "table" or #res == 0 then
        return nil
    end
    return row_to_record(res[1])
end

function _M:list(resource, env, filter, sort, pagination)
    local table_name = TABLE_MAP[resource]
    if not table_name then
        return nil, "unknown resource: " .. tostring(resource)
    end
    local sql
    if SCOPED[resource] then
        sql = "SELECT * FROM " .. ident(table_name) .. " WHERE env_profile = " .. esc(env)
    else
        sql = "SELECT * FROM " .. ident(table_name)
    end
    -- Indexed equality filters when the column exists on the typed table.
    filter = filter or {}
    local extra = {}
    if resource == "servers" then
        if filter.server_name then extra[#extra + 1] = "server_name = " .. esc(filter.server_name) end
        if filter.waf_policy_id then extra[#extra + 1] = "waf_policy_id = " .. esc(filter.waf_policy_id) end
        if filter.ssl_enabled ~= nil and filter.ssl_enabled ~= "" then
            extra[#extra + 1] = "ssl_enabled = " .. bool_sql(filter.ssl_enabled)
        end
    elseif resource == "rules" then
        if filter.name then extra[#extra + 1] = "name = " .. esc(filter.name) end
        if filter.path_key then extra[#extra + 1] = "path_key = " .. esc(filter.path_key) end
        if filter.priority then extra[#extra + 1] = "priority = " .. num_sql(filter.priority) end
    end
    if #extra > 0 then
        if SCOPED[resource] then
            sql = sql .. " AND " .. table.concat(extra, " AND ")
        else
            sql = sql .. " WHERE " .. table.concat(extra, " AND ")
        end
    end
    local res, err = self:query(sql)
    if not res then
        return nil, err
    end
    local records = {}
    if type(res) == "table" then
        for _, row in ipairs(res) do
            local rec = row_to_record(row)
            if rec then
                records[#records + 1] = rec
            end
        end
    end
    local page, total = Query.paginate(records, filter, sort, pagination)
    return { records = page, total = total }
end

local function upsert_children(self, resource, env, id, rec)
    if resource == "servers" then
        self:query("DELETE FROM server_listens WHERE server_id = " .. esc(id) .. " AND env_profile = " .. esc(env))
        self:query("DELETE FROM server_rules WHERE server_id = " .. esc(id) .. " AND env_profile = " .. esc(env))
        local listens = rec.listens or {}
        for i, listen in ipairs(listens) do
            local val = type(listen) == "table" and (listen.listen or listen.value) or listen
            self:query(
                "INSERT INTO server_listens (server_id, env_profile, listen, position) VALUES ("
                .. esc(id) .. ", " .. esc(env) .. ", " .. esc(val) .. ", " .. tostring(i) .. ")"
            )
        end
        local rules = rec.rules
        if type(rules) == "string" and rules ~= "" then
            rules = { rules }
        end
        if type(rules) == "table" then
            for i, rid in ipairs(rules) do
                if type(rid) == "string" then
                    self:query(
                        "INSERT INTO server_rules (server_id, env_profile, rule_id, position) VALUES ("
                        .. esc(id) .. ", " .. esc(env) .. ", " .. esc(rid) .. ", " .. tostring(i) .. ")"
                    )
                end
            end
        end
        local cases = rec.match_cases or {}
        for i, mc in ipairs(cases) do
            local rid = type(mc) == "table" and (mc.statement or mc.rule_id) or mc
            if rid and tostring(rid) ~= "" then
                    self:query(
                        "INSERT INTO server_rules (server_id, env_profile, rule_id, position) VALUES ("
                        .. esc(id) .. ", " .. esc(env) .. ", " .. esc(rid) .. ", " .. tostring(i + 1000) .. ")"
                    )
            end
        end
    elseif resource == "rules" then
        self:query("DELETE FROM rule_backends WHERE rule_id = " .. esc(id) .. " AND env_profile = " .. esc(env))
        local backends = (((rec.match or {}).response or {}).backends) or rec.backends or {}
        for i, b in ipairs(backends) do
            if type(b) == "table" then
                self:query(
                    "INSERT INTO rule_backends (rule_id, env_profile, address, weight, label, position) VALUES ("
                    .. esc(id) .. ", " .. esc(env) .. ", " .. esc(b.address) .. ", "
                    .. num_sql(b.weight or 1) .. ", " .. esc(b.label) .. ", " .. tostring(i) .. ")"
                )
            end
        end
    end
end

function _M:create(resource, env, id, record)
    return self:update(resource, env, id, record)
end

function _M:update(resource, env, id, record)
    local table_name = TABLE_MAP[resource]
    if not table_name then
        return nil, "unknown resource: " .. tostring(resource)
    end
    if type(record) ~= "table" then
        return nil, "record must be a table"
    end
    record.id = record.id or id
    local cols = typed_columns(resource, env, id, record)
    local names, values, updates, order = col_sql(resource, cols)
    for i, col in ipairs(order) do
        if col == "raw_json" then
            values[i] = json_esc(record) .. "::jsonb"
        end
    end
    local sql = "INSERT INTO " .. ident(table_name) .. " (" .. table.concat(names, ", ") .. ") VALUES ("
        .. table.concat(values, ", ") .. ") ON CONFLICT " .. conflict_target(resource)
        .. " DO UPDATE SET " .. table.concat(updates, ", ")
    local _, err = self:query(sql)
    if err then
        return nil, err
    end
    local ok_ch, ch_err = pcall(upsert_children, self, resource, env, id, record)
    if not ok_ch and ngx and ngx.log then
        ngx.log(ngx.WARN, "pgsql child upsert failed: ", tostring(ch_err))
    end
    -- Keep config_store in sync so leftover pgsql_storage hash callers still work.
    local bucket = Driver.redis_hash(resource, env)
    if bucket then
        self:query(
            "INSERT INTO config_store (bucket, key, value, updated_at) VALUES ("
            .. esc(bucket) .. ", " .. esc(id) .. ", " .. json_esc(record) .. "::jsonb, NOW()) "
            .. "ON CONFLICT (bucket, key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()"
        )
    end
    return record
end

function _M:delete(resource, env, id)
    local table_name = TABLE_MAP[resource]
    if not table_name then
        return nil, "unknown resource: " .. tostring(resource)
    end
    if resource == "servers" then
        self:query("DELETE FROM server_listens WHERE server_id = " .. esc(id) .. " AND env_profile = " .. esc(env))
        self:query("DELETE FROM server_rules WHERE server_id = " .. esc(id) .. " AND env_profile = " .. esc(env))
    elseif resource == "rules" then
        self:query("DELETE FROM rule_backends WHERE rule_id = " .. esc(id) .. " AND env_profile = " .. esc(env))
    end
    local _, err = self:query("DELETE FROM " .. ident(table_name) .. " WHERE " .. where_pk(resource, env, id))
    if err then
        return nil, err
    end
    local bucket = Driver.redis_hash(resource, env)
    if bucket then
        self:query("DELETE FROM config_store WHERE bucket = " .. esc(bucket) .. " AND key = " .. esc(id))
    end
    return true
end

function _M:exists(resource, env, id)
    local table_name = TABLE_MAP[resource]
    if not table_name then
        return false, "unknown resource: " .. tostring(resource)
    end
    local res, err = self:query(
        "SELECT 1 FROM " .. ident(table_name) .. " WHERE " .. where_pk(resource, env, id) .. " LIMIT 1"
    )
    if err then
        return false, err
    end
    return type(res) == "table" and #res > 0
end

function _M:health()
    local t0 = os.clock()
    local res, err = self:query("SELECT 1 AS ok")
    local ms = (os.clock() - t0) * 1000
    if not res then
        return { ok = false, latency_ms = ms, detail = tostring(err) }
    end
    return { ok = true, latency_ms = ms, detail = "pgsql" }
end

return _M
