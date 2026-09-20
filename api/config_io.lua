-- config_io.lua
-- Shared load/list helpers for server & rule configs on disk.
-- Supports .json (cjson) and .yaml / .yml (pure-Lua tinyyaml).
-- Prefer .json when the same stem exists in multiple formats.
-- Admin CRUD continues to write .json only.

local cjson
if Cjson then
    cjson = Cjson
else
    local ok, mod = pcall(require, "cjson")
    if ok then
        cjson = mod
    end
end

local _M = {}

local EXTS = { ".json", ".yaml", ".yml" }

local function log_warn(...)
    if ngx and ngx.log then
        ngx.log(ngx.WARN, ...)
    end
end

local function log_err(...)
    if ngx and ngx.log then
        ngx.log(ngx.ERR, ...)
    end
end

local function file_exists(path)
    local f = io.open(path, "rb")
    if not f then
        return false
    end
    f:close()
    return true
end

local function read_raw(path)
    local f, err = io.open(path, "rb")
    if not f then
        return nil, err
    end
    local content = f:read("*a")
    f:close()
    if not content or content == "" then
        return nil, "empty file"
    end
    return content
end

local function is_yaml_ext(path)
    return type(path) == "string"
        and (path:match("%.ya?ml$") ~= nil)
end

local function decode_json(content)
    if not cjson or not cjson.decode then
        return nil, "cjson not available"
    end
    local ok, result = pcall(cjson.decode, content)
    if ok and type(result) == "table" then
        return result
    end
    return nil, tostring(result)
end

local function decode_yaml(content)
    local ok_req, tiny = pcall(require, "tinyyaml")
    if not ok_req or type(tiny) ~= "table" or type(tiny.parse) ~= "function" then
        return nil, "tinyyaml not available"
    end
    local ok, result = pcall(tiny.parse, content)
    if not ok then
        return nil, tostring(result)
    end
    if type(result) ~= "table" then
        return nil, "yaml root must be a mapping/sequence"
    end
    return result
end

--- Decode file contents using extension (or JSON-first sniff).
function _M.decode(content, path)
    if content == nil or content == "" then
        return nil, "empty"
    end
    if type(content) == "table" then
        return content
    end
    if path and is_yaml_ext(path) then
        return decode_yaml(content)
    end
    -- Default / .json: try JSON first
    local tbl, err = decode_json(content)
    if tbl then
        return tbl
    end
    -- Fall back to YAML when path unknown but content looks like YAML
    if path == nil or path == "" then
        local first = content:match("^%s*([^\r\n]+)")
        if first and (first:match("^[%w_.-]+:") or first:match("^%-%-%-")) then
            return decode_yaml(content)
        end
    end
    return nil, err or "decode failed"
end

--- Resolve base path without extension: try .json, then .yaml, then .yml.
--- Returns path, content  or nil, err
function _M.resolve_and_read(base_without_ext)
    local last_err
    for _, ext in ipairs(EXTS) do
        local path = base_without_ext .. ext
        if file_exists(path) then
            local content, err = read_raw(path)
            if content then
                if ext ~= ".json" then
                    -- Warn if a preferred .json sibling also exists (shouldn't —
                    -- we break on first hit, and .json is first).
                end
                return path, content
            end
            last_err = err
        end
    end
    return nil, last_err or "not found"
end

--- Load and decode a config by stem (path without extension).
function _M.load(base_without_ext)
    local path, content = _M.resolve_and_read(base_without_ext)
    if not path then
        return nil, content -- content is err here
    end
    local tbl, err = _M.decode(content, path)
    if not tbl then
        return nil, err or ("decode failed: " .. path)
    end
    return tbl, nil, path
end

local function stem_of(name)
    return name:gsub("%.json$", ""):gsub("%.ya?ml$", "")
end

local function ext_rank(name)
    if name:match("%.json$") then
        return 1
    end
    if name:match("%.yaml$") then
        return 2
    end
    if name:match("%.yml$") then
        return 3
    end
    return 99
end

--- List config filenames in dir (json/yaml/yml), deduped by stem (json wins).
function _M.list_files(dir)
    local by_stem = {}
    local ls = io.popen('ls -a "' .. dir .. '" 2>/dev/null')
    if not ls then
        return {}
    end
    for name in ls:lines() do
        if name ~= "." and name ~= ".." and name ~= "conf"
            and not name:match("^%.")
            and (name:match("%.json$") or name:match("%.ya?ml$")) then
            local stem = stem_of(name)
            local prev = by_stem[stem]
            if not prev or ext_rank(name) < ext_rank(prev) then
                if prev and prev ~= name then
                    log_warn("config_io: preferring ", name, " over ", prev, " in ", dir)
                end
                by_stem[stem] = name
            end
        end
    end
    ls:close()
    local files = {}
    for _, name in pairs(by_stem) do
        files[#files + 1] = name
    end
    table.sort(files)
    return files
end

function _M.is_config_name(name)
    return type(name) == "string"
        and (name:match("%.json$") or name:match("%.ya?ml$")) ~= nil
end

function _M.stem(name)
    return stem_of(name)
end

--- Path used for admin writes (always JSON).
function _M.write_path(dir, id)
    return dir .. "/" .. tostring(id) .. ".json"
end

--- Remove sibling yaml/yml when writing JSON so JSON remains canonical.
function _M.remove_yaml_siblings(dir, id)
    local base = dir .. "/" .. tostring(id)
    for _, ext in ipairs({ ".yaml", ".yml" }) do
        local p = base .. ext
        if file_exists(p) then
            local ok, err = os.remove(p)
            if ok then
                log_warn("config_io: removed sibling ", p, " after JSON write")
            else
                log_err("config_io: failed to remove sibling ", p, ": ", tostring(err))
            end
        end
    end
end

return _M
