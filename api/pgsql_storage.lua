-- pgsql_storage.lua
-- PostgreSQL storage backend for WSLProxy
--
-- Provides a Redis-compatible hash interface so it can replace the `red`
-- object in api.lua without changing any call-site code.
--
-- Supported methods (mirrors resty.redis hash ops used in api.lua):
--   store:hget(composite_key, field)
--   store:hset(composite_key, field, value)
--   store:hdel(composite_key, field)
--   store:hgetall(composite_key)
--   store:hlen(composite_key)
--   store:hscan(composite_key, cursor, "COUNT", count)
--   store:set_keepalive(timeout, pool_size)
--
-- composite_key format: "{resource_type}_{env_profile}"
-- Examples: "servers_prod", "request_rules_int", "servers_dev"

local cjson = Cjson or require("cjson")

local _M = {}

-- ─── Key parser ──────────────────────────────────────────────────────────────
-- Splits "servers_prod" → resource_type="servers", env_profile="prod"
-- Handles resource types that contain underscores (e.g. "request_rules_prod")
local function parse_key(composite_key)
    -- Find the LAST underscore — everything before is the type, after is the profile
    local last_pos = composite_key:match(".*()_")
    if not last_pos then
        return composite_key, "prod"
    end
    return composite_key:sub(1, last_pos - 1), composite_key:sub(last_pos + 1)
end

-- ─── Escape helper ───────────────────────────────────────────────────────────
-- pgmoon exposes escape_literal on the connection object; use it for all values
local function esc(pg, val)
    return pg:escape_literal(tostring(val))
end

-- ─── Factory ─────────────────────────────────────────────────────────────────
-- Returns a store object on success, or nil + error string on failure.
-- config fields (all optional, fall back to env vars):
--   pg_host, pg_port, pg_database, pg_user, pg_password
function _M.new(config)
    local cfg = config or {}

    local host     = cfg.pg_host     or os.getenv("WSLPROXY_PG_HOST")     or "postgres"
    local port     = tonumber(cfg.pg_port or os.getenv("WSLPROXY_PG_PORT") or 5432)
    local database = cfg.pg_database or os.getenv("WSLPROXY_PG_DB")       or "wslproxy"
    local user     = cfg.pg_user     or os.getenv("WSLPROXY_PG_USER")     or "wslproxy"
    local password = cfg.pg_password or os.getenv("WSLPROXY_PG_PASSWORD")  or ""

    local pgmoon_ok, pgmoon = pcall(require, "pgmoon")
    if not pgmoon_ok then
        return nil, "pgsql_storage: pgmoon library not found — install via luarocks: luarocks install pgmoon"
    end

    local pg = pgmoon.new({
        host     = host,
        port     = port,
        database = database,
        user     = user,
        password = password,
    })

    local ok, err = pg:connect()
    if not ok then
        return nil, "pgsql_storage: connection failed (" .. host .. ":" .. tostring(port) .. "/" .. database .. "): " .. tostring(err)
    end

    -- ── Store object ──────────────────────────────────────────────────────────
    local store = { _pg = pg }

    -- hget: fetch one record → returns JSON string or ngx.null
    function store:hget(composite_key, field)
        local rtype, profile = parse_key(composite_key)
        local sql = string.format(
            "SELECT payload FROM config_store"
            .. " WHERE resource_type = %s AND resource_name = %s AND env_profile = %s AND status = 'active'"
            .. " LIMIT 1",
            esc(self._pg, rtype), esc(self._pg, field), esc(self._pg, profile)
        )
        local res, query_err = self._pg:query(sql)
        if not res or #res == 0 then
            return ngx.null
        end
        -- pgmoon decodes JSONB automatically; re-encode to JSON string to match
        -- the format callers expect (they call cjson.decode on the result)
        local ok_enc, encoded = pcall(cjson.encode, res[1].payload)
        if not ok_enc then return ngx.null end
        return encoded
    end

    -- hset: upsert one record (ON CONFLICT … DO UPDATE)
    function store:hset(composite_key, field, value)
        local rtype, profile = parse_key(composite_key)
        -- value is already a JSON string; cast to ::jsonb in SQL
        local sql = string.format(
            "INSERT INTO config_store (resource_type, resource_name, env_profile, payload)"
            .. " VALUES (%s, %s, %s, %s::jsonb)"
            .. " ON CONFLICT (resource_type, resource_name, env_profile) WHERE status = 'active'"
            .. " DO UPDATE SET payload = EXCLUDED.payload, updated_at = NOW()"
            .. " RETURNING id",
            esc(self._pg, rtype), esc(self._pg, field), esc(self._pg, profile), esc(self._pg, value)
        )
        local res, query_err = self._pg:query(sql)
        if not res then
            ngx.log(ngx.ERR, "pgsql_storage hset error: ", tostring(query_err))
            return false
        end
        return true
    end

    -- hmset: set multiple hash fields at once (mirrors Redis HMSET)
    -- Expects: hmset(composite_key, { [field1] = value1, [field2] = value2, ... })
    -- Each value is a JSON string. Calls hset internally for each field.
    function store:hmset(composite_key, field_values)
        if type(field_values) ~= "table" then
            ngx.log(ngx.ERR, "pgsql_storage hmset: expected table, got ", type(field_values))
            return false
        end
        for field, value in pairs(field_values) do
            local ok = self:hset(composite_key, field, value)
            if not ok then
                ngx.log(ngx.ERR, "pgsql_storage hmset: failed to set field '", field, "' on key '", composite_key, "'")
                return false
            end
        end
        return true
    end

    -- hdel: soft-delete a record
    function store:hdel(composite_key, field)
        local rtype, profile = parse_key(composite_key)
        local sql = string.format(
            "UPDATE config_store SET status = 'deleted', updated_at = NOW()"
            .. " WHERE resource_type = %s AND resource_name = %s AND env_profile = %s AND status = 'active'",
            esc(self._pg, rtype), esc(self._pg, field), esc(self._pg, profile)
        )
        local res, query_err = self._pg:query(sql)
        if not res then
            ngx.log(ngx.ERR, "pgsql_storage hdel error: ", tostring(query_err))
            return false
        end
        return true
    end

    -- hgetall: fetch all records as flat [key, value, key, value, …] array
    -- (matches Redis HGETALL wire format consumed by some callers)
    function store:hgetall(composite_key)
        local rtype, profile = parse_key(composite_key)
        local sql = string.format(
            "SELECT resource_name, payload FROM config_store"
            .. " WHERE resource_type = %s AND env_profile = %s AND status = 'active'"
            .. " ORDER BY updated_at DESC",
            esc(self._pg, rtype), esc(self._pg, profile)
        )
        local res, query_err = self._pg:query(sql)
        if not res then return {} end

        local result = {}
        for _, row in ipairs(res) do
            local ok_enc, encoded = pcall(cjson.encode, row.payload)
            if ok_enc then
                table.insert(result, row.resource_name)
                table.insert(result, encoded)
            end
        end
        return result
    end

    -- hlen: count active records
    function store:hlen(composite_key)
        local rtype, profile = parse_key(composite_key)
        local sql = string.format(
            "SELECT COUNT(*)::int AS cnt FROM config_store"
            .. " WHERE resource_type = %s AND env_profile = %s AND status = 'active'",
            esc(self._pg, rtype), esc(self._pg, profile)
        )
        local res, query_err = self._pg:query(sql)
        if not res or #res == 0 then return 0 end
        return tonumber(res[1].cnt) or 0
    end

    -- hscan: paginated scan — emulates Redis HSCAN cursor semantics
    -- cursor is treated as a numeric OFFSET; "0" means start
    -- Returns {next_cursor_string, {key1, val1, key2, val2, …}}
    function store:hscan(composite_key, cursor, _, count)
        local rtype, profile = parse_key(composite_key)
        local offset = tonumber(cursor) or 0
        local limit  = tonumber(count)  or 100

        local sql = string.format(
            "SELECT resource_name, payload FROM config_store"
            .. " WHERE resource_type = %s AND env_profile = %s AND status = 'active'"
            .. " ORDER BY id"
            .. " LIMIT %d OFFSET %d",
            esc(self._pg, rtype), esc(self._pg, profile), limit, offset
        )
        local res, query_err = self._pg:query(sql)
        if not res then return {"0", {}} end

        local items = {}
        for _, row in ipairs(res) do
            local ok_enc, encoded = pcall(cjson.encode, row.payload)
            if ok_enc then
                table.insert(items, row.resource_name)
                table.insert(items, encoded)
            end
        end

        -- next cursor: "0" signals end-of-scan (like Redis), else new offset
        local next_cursor = "0"
        if #res == limit then
            next_cursor = tostring(offset + limit)
        end
        return {next_cursor, items}
    end

    -- set_keepalive: return connection to pgmoon pool
    function store:set_keepalive(timeout, pool_size)
        local ok, err = self._pg:keepalive()
        if not ok then
            ngx.log(ngx.WARN, "pgsql_storage: keepalive failed: ", tostring(err))
        end
        return ok
    end

    return store
end

return _M
