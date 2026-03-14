-- Version Manager Module for WSLProxy
-- Manages versioned configurations for Virtual Servers and Rules
-- Storage: data/versions/{servers|rules}/{profile}/{resource_name}/vN.json + meta.json

local _M = {}

local cjson = require("cjson")
local lfs = LFS
local AuditLogger = require("audit_logger")

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- Valid version states
local VALID_STATES = {
    draft = true,
    pending_approval = true,
    live = true,
    archived = true,
    rolled_back = true,
    rejected = true,
}

-- Valid state transitions
local VALID_TRANSITIONS = {
    draft           = { pending_approval = true },
    pending_approval = { live = true, rejected = true, draft = true },
    live            = { archived = true },
    rejected        = { draft = true },
    rolled_back     = {},  -- terminal state
    archived        = {},  -- terminal state
}

-- ============================================================
-- Internal helpers
-- ============================================================

local function ensure_directory(path)
    local ok, attr = pcall(function()
        return lfs.attributes(path)
    end)
    if ok and attr and attr.mode == "directory" then
        return true
    end

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

local function get_versions_dir(resource_type, profile, resource_name)
    return configPath .. "data/versions/" .. resource_type .. "/" .. profile .. "/" .. resource_name
end

local function get_meta_path(resource_type, profile, resource_name)
    return get_versions_dir(resource_type, profile, resource_name) .. "/meta.json"
end

local function get_version_path(resource_type, profile, resource_name, version)
    return get_versions_dir(resource_type, profile, resource_name) .. "/v" .. tostring(version) .. ".json"
end

local function read_json_file(path)
    local file = io.open(path, "rb")
    if not file then
        return nil, "File not found: " .. path
    end
    local content = file:read("*a")
    file:close()
    if not content or content == "" then
        return nil, "File is empty: " .. path
    end
    local ok, data = pcall(cjson.decode, content)
    if not ok then
        return nil, "Failed to parse JSON: " .. path
    end
    return data
end

local function write_json_file(path, data, dir)
    if dir then
        ensure_directory(dir)
    end
    local file, err = io.open(path, "w")
    if not file then
        return false, "Failed to write file: " .. tostring(err)
    end
    file:write(cjson.encode(data))
    file:close()
    return true
end

local function read_meta(resource_type, profile, resource_name)
    local meta_path = get_meta_path(resource_type, profile, resource_name)
    local meta = read_json_file(meta_path)
    if not meta then
        meta = {
            latest_version = 0,
            live_version = nil,
            resource_type = resource_type,
            profile = profile,
            resource_name = resource_name,
        }
    end
    return meta
end

local function write_meta(resource_type, profile, resource_name, meta)
    local dir = get_versions_dir(resource_type, profile, resource_name)
    local meta_path = get_meta_path(resource_type, profile, resource_name)
    return write_json_file(meta_path, meta, dir)
end

-- Get the main data path for a resource (where live configs are stored)
local function get_live_data_path(resource_type, profile, resource_name)
    if resource_type == "servers" then
        return configPath .. "data/servers/" .. profile .. "/" .. resource_name .. ".json"
    elseif resource_type == "rules" then
        return configPath .. "data/rules/" .. profile .. "/" .. resource_name .. ".json"
    end
    return nil
end

-- ============================================================
-- Public API
-- ============================================================

--- Create a new version (draft) for a resource
-- @param resource_type string: "servers" or "rules"
-- @param profile string: Profile ID (e.g., "prod", "int")
-- @param resource_name string: Resource identifier
-- @param config_payload table: The configuration data
-- @param user string: User who created the version
-- @param description string|nil: Description of changes
-- @return table|nil: The created version entry, or nil on error
-- @return string|nil: Error message
function _M.create_version(resource_type, profile, resource_name, config_payload, user, description)
    if not resource_type or not profile or not resource_name then
        return nil, "resource_type, profile, and resource_name are required"
    end
    if not config_payload then
        return nil, "config_payload is required"
    end

    local meta = read_meta(resource_type, profile, resource_name)
    local new_version = meta.latest_version + 1

    local version_entry = {
        version = new_version,
        state = "draft",
        created_by = user or "system",
        created_at = os.time(),
        updated_at = os.time(),
        approved_by = cjson.null,
        approved_at = cjson.null,
        description = description or "",
        config_payload = config_payload,
        resource_type = resource_type,
        profile = profile,
        resource_name = resource_name,
    }

    -- Write version file
    local dir = get_versions_dir(resource_type, profile, resource_name)
    local version_path = get_version_path(resource_type, profile, resource_name, new_version)
    local ok, err = write_json_file(version_path, version_entry, dir)
    if not ok then
        return nil, err
    end

    -- Update meta
    meta.latest_version = new_version
    write_meta(resource_type, profile, resource_name, meta)

    -- Audit log
    AuditLogger.log("version_created", user, resource_type, resource_name, {
        version = new_version,
        description = description,
    })

    return version_entry
end

--- Get a specific version
-- @param resource_type string: "servers" or "rules"
-- @param profile string: Profile ID
-- @param resource_name string: Resource identifier
-- @param version number: Version number
-- @return table|nil: Version entry
-- @return string|nil: Error message
function _M.get_version(resource_type, profile, resource_name, version)
    local version_path = get_version_path(resource_type, profile, resource_name, tonumber(version))
    return read_json_file(version_path)
end

--- List all versions for a resource (metadata only, no config_payload)
-- @param resource_type string: "servers" or "rules"
-- @param profile string: Profile ID
-- @param resource_name string: Resource identifier
-- @return table: Array of version summaries
function _M.list_versions(resource_type, profile, resource_name)
    local dir = get_versions_dir(resource_type, profile, resource_name)
    local versions = {}

    local dir_ok, iter, dir_obj = pcall(lfs.dir, dir)
    if not dir_ok or not iter then
        return versions
    end

    for file in iter, dir_obj do
        if file:match("^v%d+%.json$") then
            local version_path = dir .. "/" .. file
            local entry = read_json_file(version_path)
            if entry then
                -- Return summary without full config payload
                table.insert(versions, {
                    version = entry.version,
                    state = entry.state,
                    created_by = entry.created_by,
                    created_at = entry.created_at,
                    updated_at = entry.updated_at,
                    approved_by = entry.approved_by,
                    approved_at = entry.approved_at,
                    description = entry.description,
                    cr_id = entry.cr_id,
                    resource_type = entry.resource_type,
                    profile = entry.profile,
                    resource_name = entry.resource_name,
                })
            end
        end
    end

    -- Sort by version number descending
    table.sort(versions, function(a, b) return a.version > b.version end)
    return versions
end

--- Get the currently live version for a resource
-- @return table|nil: Live version entry (full, with config_payload)
-- @return string|nil: Error message
function _M.get_live_version(resource_type, profile, resource_name)
    local meta = read_meta(resource_type, profile, resource_name)
    if not meta.live_version then
        return nil, "No live version found"
    end
    return _M.get_version(resource_type, profile, resource_name, meta.live_version)
end

--- Get metadata for a resource
function _M.get_meta(resource_type, profile, resource_name)
    return read_meta(resource_type, profile, resource_name)
end

--- Transition a version's state
-- @param resource_type string: "servers" or "rules"
-- @param profile string: Profile ID
-- @param resource_name string: Resource identifier
-- @param version number: Version number
-- @param new_state string: Target state
-- @param user string: User performing the transition
-- @return boolean: Success
-- @return string|nil: Error message
function _M.set_state(resource_type, profile, resource_name, version, new_state, user)
    if not VALID_STATES[new_state] then
        return false, "Invalid state: " .. tostring(new_state)
    end

    local entry, err = _M.get_version(resource_type, profile, resource_name, version)
    if not entry then
        return false, err or "Version not found"
    end

    local current_state = entry.state
    if not VALID_TRANSITIONS[current_state] or not VALID_TRANSITIONS[current_state][new_state] then
        return false, "Invalid state transition from '" .. current_state .. "' to '" .. new_state .. "'"
    end

    entry.state = new_state
    entry.updated_at = os.time()

    local version_path = get_version_path(resource_type, profile, resource_name, version)
    local ok, write_err = write_json_file(version_path, entry)
    if not ok then
        return false, write_err
    end

    AuditLogger.log("version_state_changed", user, resource_type, resource_name, {
        version = version,
        from_state = current_state,
        to_state = new_state,
    })

    return true
end

--- Activate a version (make it live)
-- This is called after CR approval. It:
-- 1. Archives the current live version
-- 2. Sets the approved version as live
-- 3. Copies config to the main data directory
-- 4. Triggers nginx reload
-- @return boolean: Success
-- @return string|nil: Error message
function _M.activate_version(resource_type, profile, resource_name, version, user)
    version = tonumber(version)
    local entry, err = _M.get_version(resource_type, profile, resource_name, version)
    if not entry then
        return false, err or "Version not found"
    end

    if entry.state ~= "pending_approval" then
        return false, "Version must be in 'pending_approval' state to activate, current state: " .. entry.state
    end

    local meta = read_meta(resource_type, profile, resource_name)

    -- Step 1: Archive current live version
    if meta.live_version then
        local live_entry = _M.get_version(resource_type, profile, resource_name, meta.live_version)
        if live_entry and live_entry.state == "live" then
            live_entry.state = "archived"
            live_entry.updated_at = os.time()
            local live_path = get_version_path(resource_type, profile, resource_name, meta.live_version)
            write_json_file(live_path, live_entry)

            AuditLogger.log("version_archived", user, resource_type, resource_name, {
                version = meta.live_version,
                reason = "superseded_by_v" .. tostring(version),
            })
        end
    end

    -- Step 2: Set approved version as live
    entry.state = "live"
    entry.updated_at = os.time()
    entry.activated_at = os.time()
    entry.activated_by = user
    local version_path = get_version_path(resource_type, profile, resource_name, version)
    write_json_file(version_path, entry)

    -- Step 3: Update meta
    meta.live_version = version
    write_meta(resource_type, profile, resource_name, meta)

    -- Step 4: Copy config to main data directory
    local live_data_path = get_live_data_path(resource_type, profile, resource_name)
    if live_data_path and entry.config_payload then
        local data_dir = live_data_path:match("^(.*)/[^/]+$")
        write_json_file(live_data_path, entry.config_payload, data_dir)
    end

    -- Step 5: Trigger nginx reload
    local reload_ok = pcall(function()
        local handle = io.popen("sudo openresty -s reload 2>&1")
        if handle then
            local result = handle:read("*a")
            handle:close()
            ngx.log(ngx.INFO, "Version Manager: nginx reload result: ", result)
        end
    end)

    AuditLogger.log("version_activated", user, resource_type, resource_name, {
        version = version,
        nginx_reload = reload_ok,
    })

    return true
end

--- Generate a diff between two versions
-- @param resource_type string: "servers" or "rules"
-- @param profile string: Profile ID
-- @param resource_name string: Resource identifier
-- @param v1 number: First version number
-- @param v2 number: Second version number
-- @return table: Diff result { changes: [{field, old_value, new_value}], v1_version, v2_version }
function _M.diff_versions(resource_type, profile, resource_name, v1, v2)
    local entry1, err1 = _M.get_version(resource_type, profile, resource_name, tonumber(v1))
    if not entry1 then
        return nil, "Version " .. tostring(v1) .. " not found: " .. (err1 or "")
    end

    local entry2, err2 = _M.get_version(resource_type, profile, resource_name, tonumber(v2))
    if not entry2 then
        return nil, "Version " .. tostring(v2) .. " not found: " .. (err2 or "")
    end

    local config1 = entry1.config_payload or {}
    local config2 = entry2.config_payload or {}

    -- Recursive diff function
    local changes = {}

    local function diff_tables(t1, t2, prefix)
        prefix = prefix or ""
        local all_keys = {}
        local seen = {}

        if type(t1) == "table" then
            for k, _ in pairs(t1) do
                if not seen[k] then
                    table.insert(all_keys, k)
                    seen[k] = true
                end
            end
        end
        if type(t2) == "table" then
            for k, _ in pairs(t2) do
                if not seen[k] then
                    table.insert(all_keys, k)
                    seen[k] = true
                end
            end
        end

        table.sort(all_keys, function(a, b) return tostring(a) < tostring(b) end)

        for _, key in ipairs(all_keys) do
            local field = prefix ~= "" and (prefix .. "." .. tostring(key)) or tostring(key)
            local val1 = t1 and t1[key]
            local val2 = t2 and t2[key]

            if type(val1) == "table" and type(val2) == "table" then
                diff_tables(val1, val2, field)
            elseif type(val1) ~= type(val2) or cjson.encode(val1 or cjson.null) ~= cjson.encode(val2 or cjson.null) then
                table.insert(changes, {
                    field = field,
                    old_value = val1,
                    new_value = val2,
                    change_type = val1 == nil and "added" or (val2 == nil and "removed" or "modified"),
                })
            end
        end
    end

    diff_tables(config1, config2)

    return {
        v1 = {
            version = entry1.version,
            state = entry1.state,
            created_by = entry1.created_by,
            created_at = entry1.created_at,
        },
        v2 = {
            version = entry2.version,
            state = entry2.state,
            created_by = entry2.created_by,
            created_at = entry2.created_at,
        },
        changes = changes,
        total_changes = #changes,
        config_v1 = config1,
        config_v2 = config2,
    }
end

--- Create a rollback version (copies config from a previous version as a new draft)
-- @param resource_type string: "servers" or "rules"
-- @param profile string: Profile ID
-- @param resource_name string: Resource identifier
-- @param target_version number: Version to rollback to
-- @param user string: User requesting the rollback
-- @return table|nil: New draft version entry
-- @return string|nil: Error message
function _M.create_rollback_version(resource_type, profile, resource_name, target_version, user)
    target_version = tonumber(target_version)
    local target_entry, err = _M.get_version(resource_type, profile, resource_name, target_version)
    if not target_entry then
        return nil, err or "Target version not found"
    end

    local description = "Rollback to v" .. tostring(target_version)
    local new_version, create_err = _M.create_version(
        resource_type, profile, resource_name,
        target_entry.config_payload, user, description
    )
    if not new_version then
        return nil, create_err
    end

    -- Mark the new version with rollback metadata
    new_version.rollback_from_version = target_version
    local version_path = get_version_path(resource_type, profile, resource_name, new_version.version)
    write_json_file(version_path, new_version)

    AuditLogger.log("rollback_initiated", user, resource_type, resource_name, {
        new_version = new_version.version,
        rollback_to_version = target_version,
    })

    return new_version
end

--- Initialize versioning for an existing resource (migration)
-- Creates v1 from current live config
-- @return table|nil: Created version entry
-- @return string|nil: Error message
function _M.initialize_resource(resource_type, profile, resource_name, user)
    local meta = read_meta(resource_type, profile, resource_name)
    if meta.latest_version > 0 then
        return nil, "Resource already has versions"
    end

    -- Read existing config from live data path
    local live_data_path = get_live_data_path(resource_type, profile, resource_name)
    if not live_data_path then
        return nil, "Invalid resource type"
    end

    local config = read_json_file(live_data_path)
    if not config then
        return nil, "No existing config found at " .. live_data_path
    end

    -- Create v1 directly as live
    local version_entry = {
        version = 1,
        state = "live",
        created_by = user or "system",
        created_at = os.time(),
        updated_at = os.time(),
        approved_by = "system",
        approved_at = os.time(),
        activated_at = os.time(),
        activated_by = "system",
        description = "Initial version (migrated from existing config)",
        config_payload = config,
        resource_type = resource_type,
        profile = profile,
        resource_name = resource_name,
    }

    local dir = get_versions_dir(resource_type, profile, resource_name)
    local version_path = get_version_path(resource_type, profile, resource_name, 1)
    local ok, err = write_json_file(version_path, version_entry, dir)
    if not ok then
        return nil, err
    end

    meta.latest_version = 1
    meta.live_version = 1
    write_meta(resource_type, profile, resource_name, meta)

    AuditLogger.log("version_migrated", user or "system", resource_type, resource_name, {
        version = 1,
    })

    return version_entry
end

--- Check if versioning is initialized for a resource
function _M.is_initialized(resource_type, profile, resource_name)
    local meta = read_meta(resource_type, profile, resource_name)
    return meta.latest_version > 0
end

--- Update a draft version's config payload
-- Only drafts can be edited
function _M.update_draft(resource_type, profile, resource_name, version, config_payload, user, description)
    version = tonumber(version)
    local entry, err = _M.get_version(resource_type, profile, resource_name, version)
    if not entry then
        return nil, err or "Version not found"
    end

    if entry.state ~= "draft" then
        return false, "Only draft versions can be edited, current state: " .. entry.state
    end

    entry.config_payload = config_payload
    entry.updated_at = os.time()
    if description then
        entry.description = description
    end

    local version_path = get_version_path(resource_type, profile, resource_name, version)
    local ok, write_err = write_json_file(version_path, entry)
    if not ok then
        return nil, write_err
    end

    AuditLogger.log("draft_updated", user, resource_type, resource_name, {
        version = version,
    })

    return entry
end

return _M
