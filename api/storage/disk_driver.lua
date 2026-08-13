-- Disk JSON driver. Source of truth for the request path (rule_loader
-- still reads these files). Every CRUD write from the dual_writer lands here.

local cjson = Cjson or require("cjson")
local Helper = require("helpers")
local Driver = require("storage.driver")
local Query = require("storage.query")

local _M = {}

local function log_err(...)
    if ngx and ngx.log then
        ngx.log(ngx.ERR, ...)
    end
end

local function decode_record(raw)
    if raw == nil or raw == "" then
        return nil
    end
    if type(raw) == "table" then
        return raw
    end
    local ok, decoded = pcall(cjson.decode, raw)
    if ok and type(decoded) == "table" then
        return decoded
    end
    return nil, "invalid json"
end

local function record_id(rec, fallback)
    if type(rec) ~= "table" then
        return fallback
    end
    return rec.id or rec.uuid or rec.name or fallback
end

local function list_json_files(dir)
    local files = {}
    local ls = io.popen('ls -a "' .. dir .. '" 2>/dev/null')
    if not ls then
        return files
    end
    for name in ls:lines() do
        if name ~= "." and name ~= ".." and name ~= "conf"
            and not name:match("^%.")
            and name:match("%.json$") then
            files[#files + 1] = name
        end
    end
    ls:close()
    return files
end

local function read_array_file(path)
    local raw = Helper.getDataFromFile(path)
    if not raw or raw == "" then
        return {}
    end
    local recs = decode_record(raw)
    if type(recs) ~= "table" then
        return {}
    end
    -- users.json is historically a map keyed by id, or an array.
    if recs[1] ~= nil or next(recs) == nil then
        return recs
    end
    local arr = {}
    for k, v in pairs(recs) do
        if type(v) == "table" then
            v.id = v.id or k
            arr[#arr + 1] = v
        end
    end
    return arr
end

local function write_array_file(path, records)
    local dir = path:match("(.+)/[^/]+$")
    -- setDataToFile JSON-encodes tables itself; do not pre-encode.
    Helper.setDataToFile(path, records, dir, "json")
    return true
end

function _M.new(opts)
    opts = opts or {}
    local self = {
        config_path = opts.config_path or os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/",
    }
    if self.config_path:sub(-1) ~= "/" then
        self.config_path = self.config_path .. "/"
    end
    setmetatable(self, { __index = _M })
    return self
end

function _M:get(resource, env, id)
    local meta = Driver.meta(resource)
    if not meta then
        return nil, "unknown resource: " .. tostring(resource)
    end
    if meta.array_file then
        local path = Driver.disk_dir(self.config_path, resource, env)
        local recs = read_array_file(path)
        for _, rec in ipairs(recs) do
            if tostring(record_id(rec)) == tostring(id) then
                return rec
            end
        end
        return nil
    end
    local dir = Driver.disk_dir(self.config_path, resource, env)
    local path = dir .. "/" .. tostring(id) .. ".json"
    local raw = Helper.getDataFromFile(path)
    if not raw or raw == "" then
        return nil
    end
    return decode_record(raw)
end

function _M:list(resource, env, filter, sort, pagination)
    local meta = Driver.meta(resource)
    if not meta then
        return nil, "unknown resource: " .. tostring(resource)
    end
    local records = {}
    if meta.array_file then
        local path = Driver.disk_dir(self.config_path, resource, env)
        records = read_array_file(path)
    else
        local dir = Driver.disk_dir(self.config_path, resource, env)
        for _, name in ipairs(list_json_files(dir)) do
            local raw = Helper.getDataFromFile(dir .. "/" .. name)
            local rec = decode_record(raw)
            if rec then
                rec.id = rec.id or name:gsub("%.json$", "")
                records[#records + 1] = rec
            end
        end
    end
    local page, total = Query.paginate(records, filter, sort, pagination)
    return { records = page, total = total }
end

function _M:create(resource, env, id, record)
    return self:update(resource, env, id, record)
end

function _M:update(resource, env, id, record)
    local meta = Driver.meta(resource)
    if not meta then
        return nil, "unknown resource: " .. tostring(resource)
    end
    if type(record) ~= "table" then
        return nil, "record must be a table"
    end
    record.id = record.id or id
    if meta.array_file then
        local path = Driver.disk_dir(self.config_path, resource, env)
        local recs = read_array_file(path)
        local found = false
        for i, rec in ipairs(recs) do
            if tostring(record_id(rec)) == tostring(id) then
                recs[i] = record
                found = true
                break
            end
        end
        if not found then
            recs[#recs + 1] = record
        end
        write_array_file(path, recs)
        return record
    end
    local dir = Driver.disk_dir(self.config_path, resource, env)
    local path = dir .. "/" .. tostring(id) .. ".json"
    -- setDataToFile JSON-encodes tables itself (and throws on IO failure).
    Helper.setDataToFile(path, record, dir, "json")
    return record
end

function _M:delete(resource, env, id)
    local meta = Driver.meta(resource)
    if not meta then
        return nil, "unknown resource: " .. tostring(resource)
    end
    if meta.array_file then
        local path = Driver.disk_dir(self.config_path, resource, env)
        local recs = read_array_file(path)
        local kept = {}
        local found = false
        for _, rec in ipairs(recs) do
            if tostring(record_id(rec)) == tostring(id) then
                found = true
            else
                kept[#kept + 1] = rec
            end
        end
        if not found then
            return true
        end
        write_array_file(path, kept)
        return true
    end
    local dir = Driver.disk_dir(self.config_path, resource, env)
    local path = dir .. "/" .. tostring(id) .. ".json"
    os.remove(path)
    return true
end

function _M:exists(resource, env, id)
    local rec, err = self:get(resource, env, id)
    if err then
        return false, err
    end
    return rec ~= nil
end

function _M:health()
    local t0 = os.clock()
    local path = self.config_path .. "data/settings.json"
    local f = io.open(path, "r")
    if not f then
        return { ok = false, latency_ms = 0, detail = "settings.json unreadable" }
    end
    f:close()
    local ms = (os.clock() - t0) * 1000
    return { ok = true, latency_ms = ms, detail = "disk" }
end

return _M
