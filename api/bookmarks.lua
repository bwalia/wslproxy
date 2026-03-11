-- Bookmarks Module for WSLProxy Admin
-- Auto-generates lean bookmarks from Virtual Servers and merges with user-saved bookmarks
--
-- Data flow:
--   1. Read all virtual servers from /opt/nginx/data/servers/{env}/*.json
--   2. Generate lean bookmark entries (auto_generated = true)
--   3. Read user bookmarks from /opt/nginx/data/bookmarks/bookmarks.json
--   4. Merge: user bookmarks override lean bookmarks by host match
--   5. Return combined list with pagination

local _M = {}

local cjson = Cjson or require("cjson")
local Helper = require("helpers")
local lfs = LFS or require("lfs")
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

local BOOKMARKS_DIR = configPath .. "data/bookmarks/"
local BOOKMARKS_FILE = BOOKMARKS_DIR .. "bookmarks.json"

-- Force an empty Lua table to encode as JSON [] instead of {}
local function empty_json_array()
    if cjson.empty_array then
        return cjson.empty_array
    end
    local t = {}
    if cjson.empty_array_mt then
        setmetatable(t, cjson.empty_array_mt)
    end
    return t
end

-- Ensure tags is always a JSON array (not object)
local function ensure_tags_array(bm)
    if bm.tags == nil or (type(bm.tags) == "table" and next(bm.tags) == nil) then
        bm.tags = empty_json_array()
    elseif type(bm.tags) == "table" then
        -- Ensure it's a sequential table
        local arr = {}
        for _, v in ipairs(bm.tags) do
            arr[#arr + 1] = v
        end
        bm.tags = arr
    end
    return bm
end

-- ============================================================================
-- LEAN BOOKMARK GENERATION (from Virtual Servers)
-- ============================================================================

-- Generate a lean bookmark from a server config
local function server_to_bookmark(server)
    local host = server.server_name or ""
    local scheme = server.ssl_enabled and "https" or "http"

    return {
        id = "auto-" .. host:gsub("%.", "-"):gsub(":", "-"),
        title = host,
        host = host,
        url = scheme .. "://" .. host,
        tags = empty_json_array(),
        category = "",
        description = "",
        auto_generated = true,
        ssl_enabled = server.ssl_enabled or false,
        profile_id = server.profile_id or "",
        proxy_pass = server.proxy_pass or "",
        created_at = server.created_at or os.time(),
    }
end

-- Load all virtual servers across all environments and generate lean bookmarks
function _M.generate_lean_bookmarks()
    local bookmarks = {}
    local servers_base = configPath .. "data/servers/"

    -- Iterate environment directories
    local iter, dir_obj = lfs.dir(servers_base)
    if not iter then return bookmarks end

    for env_dir in iter, dir_obj do
        if env_dir ~= "." and env_dir ~= ".." then
            local env_path = servers_base .. env_dir
            local attr = lfs.attributes(env_path)
            if attr and attr.mode == "directory" then
                -- Read server JSON files in this env
                for file_name in lfs.dir(env_path) do
                    if file_name:match("%.json$") then
                        local file_path = env_path .. "/" .. file_name
                        local content = Helper.getDataFromFile(file_path)
                        if content then
                            local ok, server = pcall(cjson.decode, content)
                            if ok and server and server.server_name then
                                local bookmark = server_to_bookmark(server)
                                bookmark.profile_id = env_dir
                                bookmarks[server.server_name] = bookmark
                            end
                        end
                    end
                end
            end
        end
    end

    return bookmarks
end

-- ============================================================================
-- USER BOOKMARKS (persistent storage)
-- ============================================================================

function _M.load_user_bookmarks()
    local content = Helper.getDataFromFile(BOOKMARKS_FILE)
    if not content then return {} end

    local ok, data = pcall(cjson.decode, content)
    if not ok or type(data) ~= "table" then return {} end

    return data
end

function _M.save_user_bookmarks(bookmarks)
    -- Ensure directory exists
    if not Helper.isDirectoryExists(BOOKMARKS_DIR) then
        Helper.createDirectoryWithParents(BOOKMARKS_DIR)
    end

    local file, err = io.open(BOOKMARKS_FILE, "w")
    if not file then
        return false, "Failed to write bookmarks: " .. (err or "unknown")
    end
    file:write(cjson.encode(bookmarks))
    file:close()
    return true, nil
end

-- ============================================================================
-- MERGE LOGIC
-- ============================================================================

-- Merge lean bookmarks with user bookmarks
-- User bookmarks take priority (matched by host)
function _M.get_merged_bookmarks()
    local lean = _M.generate_lean_bookmarks()
    local user_bookmarks = _M.load_user_bookmarks()

    -- Index user bookmarks by host for quick lookup
    local user_by_host = {}
    for _, bm in ipairs(user_bookmarks) do
        if bm.host then
            user_by_host[bm.host] = bm
        end
    end

    -- Build merged list: user bookmark wins over lean
    local merged = {}
    local seen_hosts = {}

    -- Add user bookmarks first (they have priority)
    for _, bm in ipairs(user_bookmarks) do
        bm.auto_generated = false
        table.insert(merged, bm)
        if bm.host then
            seen_hosts[bm.host] = true
        end
    end

    -- Add lean bookmarks for servers not already covered
    for host, lean_bm in pairs(lean) do
        if not seen_hosts[host] then
            table.insert(merged, lean_bm)
        end
    end

    return merged
end

-- ============================================================================
-- API HANDLERS
-- ============================================================================

-- GET /api/bookmarks — list all bookmarks (merged)
function _M.list(args)
    local params = args.params
    local qParams = {}

    if params == nil then
        qParams = {
            pagination = {
                page = tonumber(args['pagination[page]']) or 1,
                perPage = tonumber(args['pagination[perPage]']) or 100
            },
            sort = {
                field = args['sort[field]'] or 'title',
                order = args['sort[order]'] or 'ASC'
            },
            filter = {
                q = args['filter[q]'] or nil,
                category = args['filter[category]'] or nil,
                auto_generated = args['filter[auto_generated]'] or nil,
            }
        }
    else
        qParams = cjson.decode(params)
    end

    local all_bookmarks = _M.get_merged_bookmarks()

    -- Apply search filter
    if qParams.filter and qParams.filter.q and qParams.filter.q ~= "" then
        local q = qParams.filter.q:lower()
        local filtered = {}
        for _, bm in ipairs(all_bookmarks) do
            if (bm.title and bm.title:lower():find(q, 1, true))
                or (bm.host and bm.host:lower():find(q, 1, true))
                or (bm.description and bm.description:lower():find(q, 1, true)) then
                table.insert(filtered, bm)
            end
        end
        all_bookmarks = filtered
    end

    -- Apply category filter
    if qParams.filter and qParams.filter.category and qParams.filter.category ~= "" then
        local cat = qParams.filter.category
        local filtered = {}
        for _, bm in ipairs(all_bookmarks) do
            if bm.category == cat then
                table.insert(filtered, bm)
            end
        end
        all_bookmarks = filtered
    end

    -- Sort: user bookmarks first, then by field
    local sort_field = qParams.sort and qParams.sort.field or "title"
    local sort_order = qParams.sort and qParams.sort.order or "ASC"

    table.sort(all_bookmarks, function(a, b)
        -- User bookmarks always first
        if a.auto_generated ~= b.auto_generated then
            return not a.auto_generated
        end
        local va = a[sort_field] or ""
        local vb = b[sort_field] or ""
        if type(va) == "string" then va = va:lower() end
        if type(vb) == "string" then vb = vb:lower() end
        if sort_order == "DESC" then
            return va > vb
        else
            return va < vb
        end
    end)

    local total = #all_bookmarks

    -- Paginate
    local page = qParams.pagination and qParams.pagination.page or 1
    local perPage = qParams.pagination and qParams.pagination.perPage or 100
    local startIdx = (page - 1) * perPage + 1
    local endIdx = math.min(startIdx + perPage - 1, total)

    local page_data = {}
    for i = startIdx, endIdx do
        if all_bookmarks[i] then
            table.insert(page_data, ensure_tags_array(all_bookmarks[i]))
        end
    end

    ngx.say(cjson.encode({
        data = page_data,
        total = total
    }))
end

-- GET /api/bookmarks/{id} — get single bookmark
function _M.get(args, id)
    local all_bookmarks = _M.get_merged_bookmarks()
    for _, bm in ipairs(all_bookmarks) do
        if bm.id == id then
            return ngx.say(cjson.encode(ensure_tags_array(bm)))
        end
    end
    ngx.status = 404
    ngx.say(cjson.encode({ error = "Bookmark not found" }))
end

-- POST /api/bookmarks — create/update (promote lean → user bookmark)
function _M.create_or_update(args)
    local body = Helper.GetPayloads(args)
    if not body then
        ngx.status = 400
        ngx.say(cjson.encode({ error = "Invalid request body" }))
        return
    end

    -- Ensure required fields
    if not body.host or body.host == "" then
        ngx.status = 400
        ngx.say(cjson.encode({ error = "host is required" }))
        return
    end

    -- Generate ID if not provided
    if not body.id or body.id == "" then
        body.id = "bm-" .. body.host:gsub("%.", "-"):gsub(":", "-")
    end

    body.auto_generated = false
    body.updated_at = os.time()
    if not body.created_at then
        body.created_at = os.time()
    end

    -- Load existing user bookmarks
    local user_bookmarks = _M.load_user_bookmarks()

    -- Update existing or add new
    local found = false
    for i, bm in ipairs(user_bookmarks) do
        if bm.host == body.host or bm.id == body.id then
            user_bookmarks[i] = body
            found = true
            break
        end
    end

    if not found then
        table.insert(user_bookmarks, body)
    end

    local ok, err = _M.save_user_bookmarks(user_bookmarks)
    if not ok then
        ngx.status = 500
        ngx.say(cjson.encode({ error = err }))
        return
    end

    ngx.say(cjson.encode({
        data = body
    }))
end

-- DELETE /api/bookmarks/{id} — remove user bookmark (reverts to lean)
function _M.delete(args, id)
    local user_bookmarks = _M.load_user_bookmarks()

    local new_bookmarks = {}
    local deleted = false
    for _, bm in ipairs(user_bookmarks) do
        if bm.id ~= id then
            table.insert(new_bookmarks, bm)
        else
            deleted = true
        end
    end

    if not deleted then
        -- Not a user bookmark — might be auto-generated, can't delete
        ngx.status = 400
        ngx.say(cjson.encode({ error = "Cannot delete auto-generated bookmark. Edit it to customize instead." }))
        return
    end

    local ok, err = _M.save_user_bookmarks(new_bookmarks)
    if not ok then
        ngx.status = 500
        ngx.say(cjson.encode({ error = err }))
        return
    end

    ngx.say(cjson.encode({
        data = { id = id }
    }))
end

return _M
