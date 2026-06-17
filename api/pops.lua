-- POPs (Points of Presence) Manager Module for WSLProxy
--
-- A POP is a physical edge location running wslproxy — pop0 in London,
-- lon1 in London-DC2, jfk1 in New York, etc.  POPs are first-class
-- entities so that DNS provisioning, geo-aware routing, and health-
-- driven failover can reason about them by id rather than by
-- baked-in IPs scattered across configs.
--
-- Storage: data/pops/{id}.json — GLOBAL (not profile-scoped).
-- A pop is physical infrastructure; pop0 is pop0 whether the
-- referencing server lives in `prod`, `int`, or `test`.  This mirrors
-- how `data/profiles/` and `data/settings.json` work.
--
-- Public API:
--   _M.list(params)              → (list, total) | (nil, err)
--   _M.get(id)                   → record | (nil, err)
--   _M.create(payload, user)     → record | (nil, err)
--   _M.update(id, payload, user) → record | (nil, err)
--   _M.delete(id, opts, user)    → true | (nil, err)
--   _M.set_status(id, status, user) → record | (nil, err)
--   _M.find_servers_using(id)    → list of {server_id, profile_id}
--
-- Errors are returned as Lua tables of the form:
--   { code = "validation_failed", message = "...", details = {...} }
-- so the HTTP layer can translate to 400/409/404/500 cleanly and the
-- dashboard can highlight specific fields.

local _M = {}

local cjson = Cjson or require("cjson")
local lfs = LFS or require("lfs")
local Helper = require("helpers")
local AuditLogger = require("audit_logger")

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- ============================================================
-- Constants & schema
-- ============================================================

local POPS_DIR = configPath .. "data/pops"

-- Status enum.  Each state has a distinct operational meaning —
-- `draining` and `maintenance` look the same at the request layer
-- but signal different things to the oncall (planned vs unplanned)
-- and to the DNS health-checker (re-introduce vs leave-out).
local VALID_STATUSES = {
    active = true,        -- in rotation, accepting traffic
    draining = true,      -- not accepting new traffic, completing in-flight
    down = true,          -- unplanned outage, oncall paged
    maintenance = true,   -- planned outage, oncall NOT paged
}

-- Fields the caller is NEVER allowed to set or mutate.  `id` is
-- immutable after creation; `created_at` is set once; `updated_at`
-- is managed by the module.  These are stripped from any payload
-- before persistence.
local SERVER_MANAGED_FIELDS = {
    created_at = true,
    updated_at = true,
}

-- Slug pattern for `id`: lowercase alphanumeric + dash, 1-32 chars.
-- Matches the convention used elsewhere (e.g. profile ids) and is
-- safe in URLs, filesystem paths, and as a config-file basename.
local ID_PATTERN = "^[a-z0-9][a-z0-9%-]*[a-z0-9]$"

-- Cheap IPv4 sanity check.  Full RFC validation would mean writing
-- 100 lines of parser; this catches the obvious typos and lets the
-- network layer surface the rare edge case at first use.
local function is_valid_ipv4(s)
    if type(s) ~= "string" then return false end
    local a, b, c, d = s:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$")
    if not a then return false end
    for _, octet in ipairs({a, b, c, d}) do
        local n = tonumber(octet)
        if not n or n < 0 or n > 255 then return false end
    end
    return true
end

-- IPv6 is checked structurally only: at least two colons, hex digits
-- and colons only, length under 45 chars.  Same rationale as IPv4 —
-- precision-validating in Lua isn't worth the LOC cost.
local function is_valid_ipv6(s)
    if type(s) ~= "string" then return false end
    if #s > 45 or not s:find(":") then return false end
    if not s:match("^[%x:]+$") then return false end
    local _, count = s:gsub(":", "")
    return count >= 2
end

local function is_valid_country_code(s)
    return type(s) == "string" and #s == 2 and s:match("^[A-Z][A-Z]$") ~= nil
end

-- ============================================================
-- Internal helpers
-- ============================================================

local function ensure_pops_dir()
    if Helper.isDirectoryExists(POPS_DIR) then return true end
    local ok, err = pcall(Helper.createDirectoryRecursive, POPS_DIR)
    if not ok then
        ngx.log(ngx.ERR, "Pops: failed to create directory ", POPS_DIR, ": ", tostring(err))
        return false
    end
    return true
end

local function pop_path(id)
    return POPS_DIR .. "/" .. id .. ".json"
end

local function file_exists(path)
    local f = io.open(path, "rb")
    if not f then return false end
    f:close()
    return true
end

local function read_pop_file(id)
    local content = Helper.getDataFromFile(pop_path(id))
    if not content then return nil end
    local ok, decoded = pcall(cjson.decode, content)
    if not ok or type(decoded) ~= "table" then return nil end
    return decoded
end

local function write_pop_file(id, record)
    local f, err = io.open(pop_path(id), "wb")
    if not f then return false, "Failed to open " .. pop_path(id) .. ": " .. tostring(err) end
    f:write(cjson.encode(record))
    f:close()
    return true
end

local function delete_pop_file(id)
    local ok, err = os.remove(pop_path(id))
    if not ok then return false, tostring(err) end
    return true
end

local function get_user(provided)
    if provided and provided ~= "" then return provided end
    local h = ngx.req.get_headers()["x-user"]
    if h and h ~= "" then return h end
    return "system"
end

-- ============================================================
-- Validation
-- ============================================================

-- Returns `nil` on success, or a list of {field, message} pairs on
-- failure.  Callers wrap the list into a structured error response.
--
-- `for_update = true` relaxes required-field enforcement, since
-- updates may be partial and only need to validate the fields the
-- caller actually passed.
local function validate(payload, for_update)
    local errs = {}

    local function bad(field, msg)
        table.insert(errs, {field = field, message = msg})
    end

    if type(payload) ~= "table" then
        return {{field = "_root", message = "Payload must be a JSON object."}}
    end

    -- ── id ───────────────────────────────────────────────────────────
    -- Required on create, forbidden in the body on update (URL carries it).
    if not for_update then
        if not payload.id or payload.id == "" then
            bad("id", "id is required")
        elseif type(payload.id) ~= "string" then
            bad("id", "id must be a string")
        elseif not payload.id:match(ID_PATTERN) then
            bad("id", "id must be lowercase alphanumeric with optional dashes, 2-32 chars (e.g. 'pop0', 'lon1', 'us-east-1')")
        elseif #payload.id > 32 then
            bad("id", "id must be 32 characters or fewer")
        end
    end

    -- ── display_name ─────────────────────────────────────────────────
    if not for_update or payload.display_name ~= nil then
        if not payload.display_name or payload.display_name == "" then
            bad("display_name", "display_name is required")
        elseif type(payload.display_name) ~= "string" then
            bad("display_name", "display_name must be a string")
        elseif #payload.display_name > 100 then
            bad("display_name", "display_name must be 100 characters or fewer")
        end
    end

    -- ── public_ipv4 ──────────────────────────────────────────────────
    -- The single field this whole feature exists for — required.
    if not for_update or payload.public_ipv4 ~= nil then
        if not payload.public_ipv4 or payload.public_ipv4 == "" then
            bad("public_ipv4", "public_ipv4 is required")
        elseif not is_valid_ipv4(payload.public_ipv4) then
            bad("public_ipv4", "public_ipv4 must be a valid IPv4 address (e.g. '187.124.112.155')")
        end
    end

    -- ── public_ipv6 (optional but if present, must be valid) ────────
    if payload.public_ipv6 ~= nil and payload.public_ipv6 ~= ngx.null and payload.public_ipv6 ~= "" then
        if not is_valid_ipv6(payload.public_ipv6) then
            bad("public_ipv6", "public_ipv6 must be a valid IPv6 address")
        end
    end

    -- ── country_code (optional but must be ISO if present) ──────────
    if payload.country_code ~= nil and payload.country_code ~= "" then
        if not is_valid_country_code(payload.country_code) then
            bad("country_code", "country_code must be an uppercase ISO 3166-1 alpha-2 code (e.g. 'GB', 'US')")
        end
    end

    -- ── lat / lng (optional, but checked together if either present) ─
    if payload.lat ~= nil or payload.lng ~= nil then
        local lat, lng = tonumber(payload.lat), tonumber(payload.lng)
        if payload.lat ~= nil then
            if not lat then
                bad("lat", "lat must be a number")
            elseif lat < -90 or lat > 90 then
                bad("lat", "lat must be between -90 and 90")
            end
        end
        if payload.lng ~= nil then
            if not lng then
                bad("lng", "lng must be a number")
            elseif lng < -180 or lng > 180 then
                bad("lng", "lng must be between -180 and 180")
            end
        end
    end

    -- ── status ───────────────────────────────────────────────────────
    if payload.status ~= nil then
        if not VALID_STATUSES[payload.status] then
            bad("status", "status must be one of: active, draining, down, maintenance")
        end
    end

    -- ── capacity_weight ──────────────────────────────────────────────
    if payload.capacity_weight ~= nil then
        local w = tonumber(payload.capacity_weight)
        if not w then
            bad("capacity_weight", "capacity_weight must be a number")
        elseif w < 0 or w > 1 then
            bad("capacity_weight", "capacity_weight must be between 0.0 and 1.0")
        end
    end

    -- ── tags (optional array of strings) ─────────────────────────────
    if payload.tags ~= nil and payload.tags ~= ngx.null then
        if type(payload.tags) ~= "table" then
            bad("tags", "tags must be an array of strings")
        else
            for i, v in ipairs(payload.tags) do
                if type(v) ~= "string" then
                    bad("tags", "tag at index " .. i .. " must be a string")
                    break
                end
            end
        end
    end

    -- ── metadata (optional object) ──────────────────────────────────
    if payload.metadata ~= nil and payload.metadata ~= ngx.null then
        if type(payload.metadata) ~= "table" then
            bad("metadata", "metadata must be an object")
        end
    end

    -- ── string fields with no special validation, only type/length ──
    local string_fields = {
        region = 50,
        city = 100,
        internal_hostname = 253,
        provider = 50,
    }
    for field, maxlen in pairs(string_fields) do
        if payload[field] ~= nil and payload[field] ~= "" then
            if type(payload[field]) ~= "string" then
                bad(field, field .. " must be a string")
            elseif #payload[field] > maxlen then
                bad(field, field .. " must be " .. maxlen .. " characters or fewer")
            end
        end
    end

    if #errs > 0 then return errs end
    return nil
end

-- Strip server-managed fields and normalise so storage shape is
-- consistent.  Optional fields that arrived as empty strings or
-- ngx.null are normalised to nil so the on-disk JSON stays clean.
local function normalise(payload)
    local out = {}
    for k, v in pairs(payload) do
        if not SERVER_MANAGED_FIELDS[k] and v ~= ngx.null then
            -- treat empty string the same as absence for nullable fields
            if v == "" and k ~= "display_name" and k ~= "id" then
                -- skip — don't persist empty optional strings
            else
                out[k] = v
            end
        end
    end
    return out
end

-- ============================================================
-- Public API
-- ============================================================

--- List POPs with pagination, sort, and filter.
---
--- Returns `(records, total)` on success or `(nil, err)` on failure.
--- The error table follows the module-wide shape:
--- `{ code = "...", message = "...", details? = {...} }`.
---
--- @param params table  `{ pagination={page,perPage}, sort={field,order}, filter={q,status,region} }`
--- @return table|nil records  Array of pop records, or nil on error
--- @return integer|table total_or_err  Total count on success, error table on failure
function _M.list(params)
    if not ensure_pops_dir() then
        return nil, {code = "io_error", message = "Pops directory unavailable"}
    end
    params = params or {}
    local pagination = params.pagination or {}
    local sort = params.sort or {}
    local filter = params.filter or {}

    local page = tonumber(pagination.page) or 1
    local per_page = tonumber(pagination.perPage) or 25
    local sort_field = sort.field or "id"
    local sort_order = sort.order or "ASC"
    sort_order = sort_order:upper()
    if sort_order ~= "ASC" and sort_order ~= "DESC" then sort_order = "ASC" end

    local all = {}
    for fname in lfs.dir(POPS_DIR) do
        if fname:match("%.json$") then
            local id = fname:sub(1, -6)
            local record = read_pop_file(id)
            if record then table.insert(all, record) end
        end
    end

    -- Apply filters.  Empty values are ignored so a UI can send
    -- {q="", status=""} without filtering anything out.
    local filtered = {}
    local q = filter.q and filter.q ~= "" and filter.q:lower() or nil
    local status_filter = filter.status and filter.status ~= "" or nil
    local region_filter = filter.region and filter.region ~= "" or nil
    for _, p in ipairs(all) do
        if status_filter and p.status ~= filter.status then goto continue end
        if region_filter and p.region ~= filter.region then goto continue end
        if q then
            local match = false
            for _, field in ipairs({"id", "display_name", "city", "region", "public_ipv4", "provider"}) do
                if p[field] and tostring(p[field]):lower():find(q, 1, true) then
                    match = true; break
                end
            end
            if not match then goto continue end
        end
        table.insert(filtered, p)
        ::continue::
    end

    -- Sort
    table.sort(filtered, function(a, b)
        local av, bv = a[sort_field], b[sort_field]
        if av == nil then return false end
        if bv == nil then return true end
        if sort_order == "ASC" then return tostring(av) < tostring(bv)
        else return tostring(av) > tostring(bv) end
    end)

    -- Paginate
    local total = #filtered
    local start_idx = (page - 1) * per_page + 1
    local end_idx = math.min(start_idx + per_page - 1, total)
    local page_data = {}
    for i = start_idx, end_idx do table.insert(page_data, filtered[i]) end

    return page_data, total
end

--- Get a single POP by id.
function _M.get(id)
    if not id or id == "" then
        return nil, {code = "validation_failed", message = "id is required"}
    end
    local record = read_pop_file(id)
    if not record then
        return nil, {code = "not_found", message = "POP '" .. id .. "' not found"}
    end
    return record
end

--- Create a new POP.  Errors with code="conflict" if id exists.
function _M.create(payload, user)
    if not ensure_pops_dir() then
        return nil, {code = "io_error", message = "Pops directory unavailable"}
    end

    local verrs = validate(payload, false)
    if verrs then
        return nil, {code = "validation_failed", message = "Invalid payload", details = verrs}
    end

    if file_exists(pop_path(payload.id)) then
        return nil, {
            code = "conflict",
            message = "POP '" .. payload.id .. "' already exists",
            details = {existing_id = payload.id},
        }
    end

    local now = ngx.time()
    local record = normalise(payload)
    record.created_at = now
    record.updated_at = now
    -- Apply sane defaults for fields the caller omitted.
    if record.status == nil then record.status = "active" end
    if record.capacity_weight == nil then record.capacity_weight = 1.0 end
    if record.tags == nil then record.tags = setmetatable({}, cjson.empty_array_mt or nil) end
    if record.metadata == nil then record.metadata = setmetatable({}, cjson.empty_array_mt or nil) end

    local ok, err = write_pop_file(record.id, record)
    if not ok then
        return nil, {code = "io_error", message = err}
    end

    pcall(function()
        AuditLogger.log("pop_create", get_user(user), "pops", record.id, {
            display_name = record.display_name,
            region = record.region,
            public_ipv4 = record.public_ipv4,
            status = record.status,
        })
    end)

    return record
end

--- Update an existing POP.  Partial — only fields in payload are
--- changed.  Returns the resulting record, or no_op if nothing
--- differed.
function _M.update(id, payload, user)
    local existing, err = _M.get(id)
    if not existing then return nil, err end

    -- The id in the URL is authoritative.  An id field in the body
    -- is silently dropped (per SERVER_MANAGED_FIELDS) but we also
    -- reject an attempt to change it explicitly because that's
    -- usually a caller bug, not intent.
    if payload.id ~= nil and payload.id ~= id then
        return nil, {
            code = "validation_failed",
            message = "id cannot be changed; delete + create the POP under a new id instead",
            details = {{field = "id", message = "id is immutable"}},
        }
    end

    local verrs = validate(payload, true)
    if verrs then
        return nil, {code = "validation_failed", message = "Invalid payload", details = verrs}
    end

    local normalised = normalise(payload)
    local changed = {}
    for k, v in pairs(normalised) do
        if existing[k] ~= v then
            existing[k] = v
            table.insert(changed, k)
        end
    end

    if #changed == 0 then
        return existing, nil  -- no-op
    end

    existing.updated_at = ngx.time()

    local ok, werr = write_pop_file(id, existing)
    if not ok then
        return nil, {code = "io_error", message = werr}
    end

    pcall(function()
        AuditLogger.log("pop_update", get_user(user), "pops", id, {
            changed_fields = changed,
        })
    end)

    return existing
end

--- Quick helper for the common case of just flipping status.
--- Logged as a distinct action so it shows up clearly in the audit
--- trail (e.g. when an oncall drains a POP, that's worth its own row).
function _M.set_status(id, new_status, user)
    if not VALID_STATUSES[new_status] then
        return nil, {
            code = "validation_failed",
            message = "status must be one of: active, draining, down, maintenance",
            details = {{field = "status", message = "invalid status"}},
        }
    end
    local existing, err = _M.get(id)
    if not existing then return nil, err end
    if existing.status == new_status then
        return existing, nil  -- already there
    end

    local prev_status = existing.status
    existing.status = new_status
    existing.updated_at = ngx.time()

    local ok, werr = write_pop_file(id, existing)
    if not ok then
        return nil, {code = "io_error", message = werr}
    end

    pcall(function()
        AuditLogger.log("pop_status_change", get_user(user), "pops", id, {
            from = prev_status,
            to = new_status,
        })
    end)

    return existing
end

--- Find all servers across all profiles that reference this POP.
--- Used by delete to enforce referential integrity, and exposed
--- publicly so the dashboard can render "in use by" badges.
function _M.find_servers_using(id)
    local servers_dir = configPath .. "data/servers"
    local results = {}

    -- Don't wrap `lfs.dir` in pcall — it returns (iterator, state,
    -- control) and pcall only captures the first value, which breaks
    -- the for-loop protocol.  Check the directory exists with
    -- lfs.attributes first; if missing or not a directory, there's
    -- nothing to walk and we return empty.
    local attr = lfs.attributes(servers_dir)
    if not attr or attr.mode ~= "directory" then return results end

    for profile in lfs.dir(servers_dir) do
        if profile ~= "." and profile ~= ".." then
            local profile_dir = servers_dir .. "/" .. profile
            local profile_attr = lfs.attributes(profile_dir)
            if profile_attr and profile_attr.mode == "directory" then
                for fname in lfs.dir(profile_dir) do
                    if fname:match("^host:.*%.json$") then
                        local content = Helper.getDataFromFile(profile_dir .. "/" .. fname)
                        if content then
                            local ok_d, server = pcall(cjson.decode, content)
                            if ok_d and type(server) == "table"
                                    and type(server.pop_ids) == "table" then
                                for _, pid in ipairs(server.pop_ids) do
                                    if pid == id then
                                        table.insert(results, {
                                            server_id = server.id,
                                            server_name = server.server_name,
                                            profile_id = profile,
                                        })
                                        break
                                    end
                                end
                            end
                        end
                    end
                end
            end
        end
    end
    return results
end

--- Delete a POP.  Default refuses if any server references it.
--- Pass {force=true} to cascade-detach (audited separately per
--- detached server).
function _M.delete(id, opts, user)
    opts = opts or {}
    local existing, err = _M.get(id)
    if not existing then return nil, err end

    local refs = _M.find_servers_using(id)
    if #refs > 0 and not opts.force then
        return nil, {
            code = "conflict",
            message = "POP '" .. id .. "' is in use by " .. #refs ..
                " server(s); pass force=true to cascade-detach",
            details = {referencing_servers = refs},
        }
    end

    -- Cascade-detach if forced.  We write each server before
    -- deleting the POP so an error mid-way leaves the system in a
    -- safe state (no dangling pop_ids referencing a deleted POP).
    local detached = {}
    if opts.force and #refs > 0 then
        for _, ref in ipairs(refs) do
            local spath = configPath .. "data/servers/" .. ref.profile_id ..
                "/" .. ref.server_id .. ".json"
            local content = Helper.getDataFromFile(spath)
            if content then
                local ok_d, server = pcall(cjson.decode, content)
                if ok_d and type(server) == "table" and type(server.pop_ids) == "table" then
                    local kept = {}
                    for _, pid in ipairs(server.pop_ids) do
                        if pid ~= id then table.insert(kept, pid) end
                    end
                    server.pop_ids = kept
                    local f = io.open(spath, "wb")
                    if f then
                        f:write(cjson.encode(server))
                        f:close()
                        table.insert(detached, ref.server_id)
                    end
                end
            end
        end
    end

    local ok, derr = delete_pop_file(id)
    if not ok then
        return nil, {code = "io_error", message = "Failed to remove file: " .. derr}
    end

    pcall(function()
        AuditLogger.log("pop_delete", get_user(user), "pops", id, {
            forced = opts.force or false,
            detached_servers = detached,
        })
    end)

    return true
end

return _M
