-- Audit Logger Module for WSLProxy
-- Logs all version control and change request actions
-- Stores logs as NDJSON files partitioned by date: data/audit/YYYY-MM/DD.json

local _M = {}

local cjson = require("cjson")
local lfs = LFS

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- ============================================================
-- Internal helpers
-- ============================================================

local function get_audit_dir()
    return configPath .. "data/audit"
end

local function ensure_directory(path)
    local ok, attr = pcall(function()
        return lfs.attributes(path)
    end)
    if ok and attr and attr.mode == "directory" then
        return true
    end

    -- Build path incrementally
    local parts = {}
    for part in string.gmatch(path, "[^/]+") do
        table.insert(parts, part)
    end

    local currentPath = ""
    if path:sub(1, 1) == "/" then
        currentPath = "/"
    end

    for _, part in ipairs(parts) do
        currentPath = currentPath .. part .. "/"
        local dir_ok, dir_attr = pcall(function()
            return lfs.attributes(currentPath)
        end)
        if not (dir_ok and dir_attr and dir_attr.mode == "directory") then
            pcall(function() lfs.mkdir(currentPath) end)
        end
    end

    return true
end

local function get_log_file_path(timestamp)
    local date = os.date("*t", timestamp)
    local month_dir = string.format("%s/%04d-%02d", get_audit_dir(), date.year, date.month)
    local file_path = string.format("%s/%02d.json", month_dir, date.day)
    return file_path, month_dir
end

local function get_user_from_request()
    local user = "system"
    local ok, _ = pcall(function()
        local auth_header = ngx.req.get_headers()["Authorization"]
        if auth_header then
            local token_str = auth_header:match("Bearer%s+(.+)")
            if token_str then
                -- Decode JWT payload to get user info
                local parts = {}
                for part in string.gmatch(token_str, "[^%.]+") do
                    table.insert(parts, part)
                end
                if #parts >= 2 then
                    local payload_b64 = parts[2]
                    -- Add padding
                    local remainder = #payload_b64 % 4
                    if remainder > 0 then
                        payload_b64 = payload_b64 .. string.rep("=", 4 - remainder)
                    end
                    local payload_json = ngx.decode_base64(payload_b64)
                    if payload_json then
                        local payload = cjson.decode(payload_json)
                        if payload.username then
                            user = payload.username
                        elseif payload.sub then
                            user = payload.sub
                        elseif payload.email then
                            user = payload.email
                        end
                    end
                end
            end
        end
        -- Also check x-user header as fallback
        local x_user = ngx.req.get_headers()["x-user"]
        if x_user and x_user ~= "" then
            user = x_user
        end
    end)
    return user
end

-- ============================================================
-- Public API
-- ============================================================

--- Log an audit event
-- @param action string: The action performed (e.g., "version_created", "cr_approved")
-- @param user string|nil: The user who performed the action (auto-detected if nil)
-- @param resource_type string: "servers" or "rules"
-- @param resource_name string: Name of the resource
-- @param details table|nil: Additional details (version, cr_id, etc.)
function _M.log(action, user, resource_type, resource_name, details)
    local timestamp = os.time()
    user = user or get_user_from_request()

    local entry = {
        timestamp = timestamp,
        datetime = os.date("!%Y-%m-%dT%H:%M:%SZ", timestamp),
        action = action,
        user = user,
        resource_type = resource_type,
        resource_name = resource_name,
        details = details or {},
    }

    -- Add IP address if available
    local ok, _ = pcall(function()
        entry.ip_address = ngx.var.remote_addr
    end)

    local file_path, month_dir = get_log_file_path(timestamp)
    ensure_directory(month_dir)

    local file, err = io.open(file_path, "a")
    if not file then
        ngx.log(ngx.WARN, "Audit Logger: Failed to open log file: ", tostring(err))
        return false, err
    end

    file:write(cjson.encode(entry) .. "\n")
    file:close()

    ngx.log(ngx.INFO, "Audit: ", action, " by ", user, " on ", resource_type, "/", resource_name)
    return true
end

--- List audit log entries with optional filters
-- @param filters table: Optional filters { date_from, date_to, user, action, resource_type, resource_name, limit, offset }
-- @return table: Array of log entries
function _M.list(filters)
    filters = filters or {}
    local limit = tonumber(filters.limit) or 100
    local offset = tonumber(filters.offset) or 0

    local now = os.time()
    local date_from = tonumber(filters.date_from) or (now - 30 * 86400) -- Default: last 30 days
    local date_to = tonumber(filters.date_to) or now

    local entries = {}
    local audit_dir = get_audit_dir()

    -- Iterate through month directories
    local dir_ok, iter, dir = pcall(lfs.dir, audit_dir)
    if not dir_ok or not iter then
        return entries, 0
    end

    local month_dirs = {}
    for entry in iter, dir do
        if entry ~= "." and entry ~= ".." and entry:match("^%d%d%d%d%-%d%d$") then
            table.insert(month_dirs, entry)
        end
    end
    table.sort(month_dirs, function(a, b) return a > b end) -- newest first

    for _, month_dir_name in ipairs(month_dirs) do
        local month_path = audit_dir .. "/" .. month_dir_name

        local day_ok, day_iter, day_dir = pcall(lfs.dir, month_path)
        if day_ok and day_iter then
            local day_files = {}
            for day_file in day_iter, day_dir do
                if day_file:match("^%d%d%.json$") then
                    table.insert(day_files, day_file)
                end
            end
            table.sort(day_files, function(a, b) return a > b end) -- newest first

            for _, day_file in ipairs(day_files) do
                local file_path = month_path .. "/" .. day_file
                local file = io.open(file_path, "r")
                if file then
                    local day_entries = {}
                    for line in file:lines() do
                        if line and line ~= "" then
                            local ok, entry = pcall(cjson.decode, line)
                            if ok and entry then
                                local include = true

                                -- Apply filters
                                if entry.timestamp and (entry.timestamp < date_from or entry.timestamp > date_to) then
                                    include = false
                                end
                                if filters.user and entry.user ~= filters.user then
                                    include = false
                                end
                                if filters.action and entry.action ~= filters.action then
                                    include = false
                                end
                                if filters.resource_type and entry.resource_type ~= filters.resource_type then
                                    include = false
                                end
                                if filters.resource_name and entry.resource_name ~= filters.resource_name then
                                    include = false
                                end

                                if include then
                                    table.insert(day_entries, entry)
                                end
                            end
                        end
                    end
                    file:close()

                    -- Add in reverse order (newest first within day)
                    for i = #day_entries, 1, -1 do
                        table.insert(entries, day_entries[i])
                    end
                end
            end
        end
    end

    local total = #entries

    -- Apply offset and limit
    local result = {}
    for i = offset + 1, math.min(offset + limit, total) do
        table.insert(result, entries[i])
    end

    return result, total
end

--- Get audit entries for a specific resource
-- @param resource_type string: "servers" or "rules"
-- @param resource_name string: Name of the resource
-- @param limit number: Max entries to return (default 50)
-- @return table: Array of log entries
function _M.get_by_resource(resource_type, resource_name, limit)
    return _M.list({
        resource_type = resource_type,
        resource_name = resource_name,
        limit = limit or 50,
    })
end

return _M
