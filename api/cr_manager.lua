-- Change Request (CR) Manager Module for WSLProxy
-- Implements mandatory 4-eyes approval process for configuration changes
-- Storage: data/change_requests/CR-{id}.json + cr_sequence.json

local _M = {}

local cjson = require("cjson")
local lfs = LFS
local AuditLogger = require("audit_logger")
local VersionManager = require("version_manager")

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- CR states
local VALID_CR_STATES = {
    pending_approval = true,
    approved = true,
    rejected = true,
    cancelled = true,
}

-- ============================================================
-- Internal helpers
-- ============================================================

local function get_cr_dir()
    return configPath .. "data/change_requests"
end

local function get_cr_config_path()
    return get_cr_dir() .. "/cr_config.json"
end

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

local function read_json_file(path)
    local file = io.open(path, "rb")
    if not file then
        return nil, "File not found: " .. path
    end
    local content = file:read("*a")
    file:close()
    if not content or content == "" then
        return nil, "File is empty"
    end
    local ok, data = pcall(cjson.decode, content)
    if not ok then
        return nil, "Failed to parse JSON"
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

local function get_next_cr_id()
    local cr_dir = get_cr_dir()
    ensure_directory(cr_dir)

    local seq_path = cr_dir .. "/cr_sequence.json"
    local seq = read_json_file(seq_path)
    if not seq then
        seq = { next_id = 1 }
    end

    local cr_id = seq.next_id
    seq.next_id = cr_id + 1
    write_json_file(seq_path, seq)

    return string.format("CR-%04d", cr_id)
end

local function get_cr_path(cr_id)
    return get_cr_dir() .. "/" .. cr_id .. ".json"
end

-- ============================================================
-- Passphrase management
-- ============================================================

--- Get CR config (passphrase, settings)
function _M.get_cr_config()
    local config = read_json_file(get_cr_config_path())
    if not config then
        config = {
            approval_passphrase = nil,
            required_approvals = 2,
        }
    end
    return config
end

--- Set the CR approval passphrase
-- @param passphrase string: The passphrase to set
-- @param user string: User setting the passphrase
-- @return boolean, string|nil
function _M.set_passphrase(passphrase, user)
    if not passphrase or passphrase == "" then
        return false, "Passphrase cannot be empty"
    end
    local config = _M.get_cr_config()
    config.approval_passphrase = passphrase
    config.passphrase_set_by = user
    config.passphrase_set_at = os.time()
    local cr_dir = get_cr_dir()
    local ok, err = write_json_file(get_cr_config_path(), config, cr_dir)
    if not ok then
        return false, err
    end
    AuditLogger.log("cr_passphrase_updated", user, "system", "cr_config", {})
    return true
end

--- Check if passphrase is configured
function _M.has_passphrase()
    local config = _M.get_cr_config()
    return config.approval_passphrase ~= nil and config.approval_passphrase ~= ""
end

--- Validate a passphrase
local function validate_passphrase(passphrase)
    local config = _M.get_cr_config()
    if not config.approval_passphrase or config.approval_passphrase == "" then
        -- No passphrase configured, allow through
        return true
    end
    if not passphrase or passphrase == "" then
        return false, "Approval passphrase is required. Contact your admin for the CR approval code."
    end
    if passphrase ~= config.approval_passphrase then
        return false, "Invalid approval passphrase"
    end
    return true
end

-- ============================================================
-- Public API
-- ============================================================

--- Create a new Change Request
-- @param params table: {
--   resource_type: "servers"|"rules",
--   resource_name: string,
--   profile: string,
--   version: number,
--   change_type: "create"|"update"|"rollback"|"delete",
--   description: string
-- }
-- @param user string: User creating the CR
-- @return table|nil: Created CR
-- @return string|nil: Error message
function _M.create_cr(params, user)
    if not params.resource_type then
        return nil, "resource_type is required"
    end
    if not params.resource_name then
        return nil, "resource_name is required"
    end
    if not params.profile then
        return nil, "profile is required"
    end
    if not params.version then
        return nil, "version is required"
    end

    -- Verify the version exists and is in draft state
    local version_entry, ver_err = VersionManager.get_version(
        params.resource_type, params.profile, params.resource_name, tonumber(params.version)
    )
    if not version_entry then
        return nil, "Version not found: " .. (ver_err or "")
    end
    if version_entry.state ~= "draft" then
        return nil, "Version must be in 'draft' state to create a CR, current state: " .. version_entry.state
    end

    local cr_id = get_next_cr_id()

    local cr = {
        id = cr_id,
        state = "pending_approval",
        resource_type = params.resource_type,
        resource_name = params.resource_name,
        profile = params.profile,
        version = tonumber(params.version),
        change_type = params.change_type or "update",
        description = params.description or "",
        created_by = user,
        created_at = os.time(),
        updated_at = os.time(),
        approvals = {},
        rejections = {},
        required_approvals = 2,
        rollback_from_version = params.rollback_from_version,
        rollback_to_version = params.rollback_to_version,
    }

    local cr_dir = get_cr_dir()
    local cr_path = get_cr_path(cr_id)
    local ok, err = write_json_file(cr_path, cr, cr_dir)
    if not ok then
        return nil, err
    end

    -- Transition version state to pending_approval
    VersionManager.set_state(
        params.resource_type, params.profile, params.resource_name,
        tonumber(params.version), "pending_approval", user
    )

    -- Update version entry with CR reference
    version_entry.cr_id = cr_id
    version_entry.state = "pending_approval"
    version_entry.updated_at = os.time()
    local version_path = configPath .. "data/versions/" .. params.resource_type .. "/" ..
        params.profile .. "/" .. params.resource_name .. "/v" .. tostring(params.version) .. ".json"
    write_json_file(version_path, version_entry)

    AuditLogger.log("cr_created", user, params.resource_type, params.resource_name, {
        cr_id = cr_id,
        version = params.version,
        change_type = params.change_type,
        description = params.description,
    })

    return cr
end

--- Approve a Change Request
-- Enforces 4-eyes principle:
-- 1. Creator cannot approve
-- 2. Same user cannot approve twice
-- 3. Need required_approvals (default 2) distinct approvers
-- @param cr_id string: CR identifier
-- @param user string: Approving user
-- @param comment string|nil: Approval comment
-- @return table|nil: Updated CR
-- @return string|nil: Error message
function _M.approve_cr(cr_id, user, comment, passphrase)
    local cr, err = _M.get_cr(cr_id)
    if not cr then
        return nil, err or "CR not found"
    end

    if cr.state ~= "pending_approval" then
        return nil, "CR is not in 'pending_approval' state, current state: " .. cr.state
    end

    -- Validate approval passphrase
    local pass_ok, pass_err = validate_passphrase(passphrase)
    if not pass_ok then
        return nil, pass_err
    end

    -- 4-eyes: Creator cannot approve their own CR
    if cr.created_by == user then
        return nil, "4-eyes principle: The creator of a CR cannot approve it"
    end

    -- Check if user has already approved
    for _, approval in ipairs(cr.approvals) do
        if approval.user == user then
            return nil, "User has already approved this CR"
        end
    end

    -- Add approval
    table.insert(cr.approvals, {
        user = user,
        approved_at = os.time(),
        comment = comment or "",
    })

    cr.updated_at = os.time()

    AuditLogger.log("cr_approved", user, cr.resource_type, cr.resource_name, {
        cr_id = cr_id,
        approval_number = #cr.approvals,
        required = cr.required_approvals,
        comment = comment,
    })

    -- Check if we have enough approvals
    if #cr.approvals >= cr.required_approvals then
        cr.state = "approved"
        cr.approved_at = os.time()

        -- Activate the version
        local activate_ok, activate_err = VersionManager.activate_version(
            cr.resource_type, cr.profile, cr.resource_name, cr.version, user
        )
        if not activate_ok then
            -- Revert CR state if activation fails
            cr.state = "pending_approval"
            cr.approved_at = cjson.null
            local cr_path = get_cr_path(cr_id)
            write_json_file(cr_path, cr)
            return nil, "CR approved but activation failed: " .. (activate_err or "unknown error")
        end

        AuditLogger.log("cr_fully_approved", user, cr.resource_type, cr.resource_name, {
            cr_id = cr_id,
            version = cr.version,
        })
    end

    local cr_path = get_cr_path(cr_id)
    write_json_file(cr_path, cr)

    return cr
end

--- Reject a Change Request
-- @param cr_id string: CR identifier
-- @param user string: Rejecting user
-- @param reason string|nil: Rejection reason
-- @return table|nil: Updated CR
-- @return string|nil: Error message
function _M.reject_cr(cr_id, user, reason)
    local cr, err = _M.get_cr(cr_id)
    if not cr then
        return nil, err or "CR not found"
    end

    if cr.state ~= "pending_approval" then
        return nil, "CR is not in 'pending_approval' state"
    end

    cr.state = "rejected"
    cr.updated_at = os.time()
    table.insert(cr.rejections, {
        user = user,
        rejected_at = os.time(),
        reason = reason or "",
    })

    -- Transition version state back to draft so it can be edited
    VersionManager.set_state(
        cr.resource_type, cr.profile, cr.resource_name,
        cr.version, "rejected", user
    )

    local cr_path = get_cr_path(cr_id)
    write_json_file(cr_path, cr)

    AuditLogger.log("cr_rejected", user, cr.resource_type, cr.resource_name, {
        cr_id = cr_id,
        version = cr.version,
        reason = reason,
    })

    return cr
end

--- Cancel a Change Request (only creator can cancel)
-- @param cr_id string: CR identifier
-- @param user string: User requesting cancellation
-- @return table|nil: Updated CR
-- @return string|nil: Error message
function _M.cancel_cr(cr_id, user)
    local cr, err = _M.get_cr(cr_id)
    if not cr then
        return nil, err or "CR not found"
    end

    if cr.state ~= "pending_approval" then
        return nil, "Only pending CRs can be cancelled"
    end

    if cr.created_by ~= user then
        return nil, "Only the creator can cancel a CR"
    end

    cr.state = "cancelled"
    cr.updated_at = os.time()

    -- Transition version state back to draft
    VersionManager.set_state(
        cr.resource_type, cr.profile, cr.resource_name,
        cr.version, "draft", user
    )

    local cr_path = get_cr_path(cr_id)
    write_json_file(cr_path, cr)

    AuditLogger.log("cr_cancelled", user, cr.resource_type, cr.resource_name, {
        cr_id = cr_id,
        version = cr.version,
    })

    return cr
end

--- Get a specific CR
-- @param cr_id string: CR identifier
-- @return table|nil: CR data
-- @return string|nil: Error message
function _M.get_cr(cr_id)
    local cr_path = get_cr_path(cr_id)
    return read_json_file(cr_path)
end

--- List Change Requests with optional filters
-- @param filters table: { state, resource_type, resource_name, profile, created_by, limit, offset }
-- @return table: Array of CRs
-- @return number: Total count
function _M.list_crs(filters)
    filters = filters or {}
    local limit = tonumber(filters.limit) or 50
    local offset = tonumber(filters.offset) or 0

    local cr_dir = get_cr_dir()
    local crs = {}

    local dir_ok, iter, dir_obj = pcall(lfs.dir, cr_dir)
    if not dir_ok or not iter then
        return crs, 0
    end

    for file in iter, dir_obj do
        if file:match("^CR%-%d+%.json$") then
            local cr_path = cr_dir .. "/" .. file
            local cr = read_json_file(cr_path)
            if cr then
                local include = true

                if filters.state and cr.state ~= filters.state then
                    include = false
                end
                if filters.resource_type and cr.resource_type ~= filters.resource_type then
                    include = false
                end
                if filters.resource_name and cr.resource_name ~= filters.resource_name then
                    include = false
                end
                if filters.profile and cr.profile ~= filters.profile then
                    include = false
                end
                if filters.created_by and cr.created_by ~= filters.created_by then
                    include = false
                end

                if include then
                    table.insert(crs, cr)
                end
            end
        end
    end

    -- Sort by created_at descending (newest first)
    table.sort(crs, function(a, b)
        return (a.created_at or 0) > (b.created_at or 0)
    end)

    local total = #crs

    -- Apply offset and limit
    local result = {}
    for i = offset + 1, math.min(offset + limit, total) do
        table.insert(result, crs[i])
    end

    return result, total
end

--- Get pending CRs count (useful for UI badge)
function _M.get_pending_count()
    local crs, _ = _M.list_crs({ state = "pending_approval" })
    return #crs
end

return _M
