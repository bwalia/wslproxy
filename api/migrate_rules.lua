#!/usr/bin/env lua
-- migrate_rules.lua
-- One-time migration script: decode over-encoded S3 keys in rule JSON files
-- and mark them as schema v2 (plaintext keys).
--
-- Usage:
--   resty migrate_rules.lua [config_path] [profile]
--   resty migrate_rules.lua /opt/nginx/ prod
--
-- Or standalone with luajit (needs cjson and base64 modules in path):
--   luajit migrate_rules.lua /opt/nginx/ prod
--
-- What it does:
--   1. Scans all rule JSON files in data/rules/{profile}/
--   2. For files with amazon_s3_access_key or amazon_s3_secret_key:
--      - Iteratively base64 decodes until the result is a valid AWS key
--      - Saves the decoded plaintext key back
--   3. Sets _schema_version = 2
--   4. Backs up originals to data/rules/{profile}/.backup/
--
-- Safe to run multiple times — skips files already at schema v2.

local cjson = require("cjson")

-- Minimal base64 decode for migration (works without OpenResty)
local b64_chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

local function base64_decode(data)
    data = data:gsub('[^'..b64_chars..'=]', '')
    return (data:gsub('.', function(x)
        if x == '=' then return '' end
        local r, f = '', (b64_chars:find(x) - 1)
        for i = 6, 1, -1 do r = r .. (f % 2^i - f % 2^(i-1) > 0 and '1' or '0') end
        return r
    end):gsub('%d%d%d?%d?%d?%d?%d?%d?', function(x)
        if #x ~= 8 then return '' end
        local c = 0
        for i = 1, 8 do c = c + (x:sub(i, i) == '1' and 2^(8-i) or 0) end
        return string.char(c)
    end))
end

--- Check if a string looks like a valid AWS access key (20 chars, alphanumeric)
local function looks_like_aws_access_key(s)
    if not s or #s < 16 or #s > 40 then return false end
    return s:match("^[A-Z0-9]+$") ~= nil
end

--- Check if a string looks like a valid AWS secret key (40 chars, base64-ish)
local function looks_like_aws_secret_key(s)
    if not s or #s < 30 or #s > 60 then return false end
    return s:match("^[A-Za-z0-9%+%/]+%=*$") ~= nil
end

--- Check if a string is purely printable ASCII
local function is_printable_ascii(s)
    return not s:match("[^%g]")
end

--- Iteratively decode base64 until we get something that looks like a real key
local function fully_decode(s, validator)
    if not s or s == "" then return s, false end
    local current = s
    local changed = false
    for round = 1, 5 do
        -- Check if current value already looks valid
        if validator(current) then
            return current, changed
        end
        -- Try decoding
        local ok, decoded = pcall(base64_decode, current)
        if not ok or not decoded or decoded == "" or decoded == current then
            break
        end
        -- Check if decoded is printable
        if not is_printable_ascii(decoded) then
            break
        end
        current = decoded
        changed = true
    end
    return current, changed
end

--- Read a file
local function read_file(path)
    local f = io.open(path, "rb")
    if not f then return nil end
    local content = f:read("*a")
    f:close()
    return content
end

--- Write a file
local function write_file(path, content)
    local f = io.open(path, "wb")
    if not f then return false end
    f:write(content)
    f:close()
    return true
end

--- Ensure directory exists
local function mkdir_p(path)
    os.execute("mkdir -p " .. path)
end

-- ─── Main ───────────────────────────────────────────────────────────────────

local config_path = arg[1] or "/opt/nginx/"
local profile = arg[2] or "prod"

if config_path:sub(-1) ~= "/" then
    config_path = config_path .. "/"
end

local rules_dir = config_path .. "data/rules/" .. profile .. "/"
local backup_dir = rules_dir .. ".backup/"

print("WSLProxy Rule Migration — S3 Key Decoding")
print("Rules directory: " .. rules_dir)
print("Backup directory: " .. backup_dir)
print("")

-- Create backup directory
mkdir_p(backup_dir)

-- Scan rule files
local p = io.popen('ls "' .. rules_dir .. '"*.json 2>/dev/null')
if not p then
    print("ERROR: Cannot list files in " .. rules_dir)
    os.exit(1)
end

local migrated = 0
local skipped = 0
local errors = 0

for file_path in p:lines() do
    local filename = file_path:match("([^/]+)$")
    local content = read_file(file_path)
    if not content then
        print("  SKIP (unreadable): " .. filename)
        skipped = skipped + 1
        goto continue
    end

    local ok, rule = pcall(cjson.decode, content)
    if not ok then
        print("  SKIP (invalid JSON): " .. filename)
        skipped = skipped + 1
        goto continue
    end

    -- Already migrated?
    if rule._schema_version and rule._schema_version >= 2 then
        print("  SKIP (already v2): " .. filename)
        skipped = skipped + 1
        goto continue
    end

    -- Check if this rule has S3 keys
    if not rule.match or not rule.match.rules then
        print("  SKIP (no match.rules): " .. filename)
        skipped = skipped + 1
        goto continue
    end

    local rules = rule.match.rules
    local has_s3 = rules.amazon_s3_access_key or rules.amazon_s3_secret_key
    if not has_s3 then
        -- No S3 keys but still mark as v2
        rule._schema_version = 2
        write_file(file_path, cjson.encode(rule))
        print("  MARK v2 (no S3 keys): " .. filename)
        skipped = skipped + 1
        goto continue
    end

    -- Backup original
    write_file(backup_dir .. filename, content)

    -- Decode access key
    local ak_changed = false
    if rules.amazon_s3_access_key and rules.amazon_s3_access_key ~= "" then
        local decoded, changed = fully_decode(rules.amazon_s3_access_key, looks_like_aws_access_key)
        if changed then
            print("  ACCESS KEY: " .. rules.amazon_s3_access_key:sub(1, 20) .. "... → " .. decoded)
            rules.amazon_s3_access_key = decoded
            ak_changed = true
        end
    end

    -- Decode secret key
    local sk_changed = false
    if rules.amazon_s3_secret_key and rules.amazon_s3_secret_key ~= "" then
        local decoded, changed = fully_decode(rules.amazon_s3_secret_key, looks_like_aws_secret_key)
        if changed then
            print("  SECRET KEY: " .. rules.amazon_s3_secret_key:sub(1, 20) .. "... → " .. decoded:sub(1, 10) .. "...")
            rules.amazon_s3_secret_key = decoded
            sk_changed = true
        end
    end

    -- Mark as v2 and save
    rule._schema_version = 2
    local save_ok = write_file(file_path, cjson.encode(rule))
    if save_ok then
        if ak_changed or sk_changed then
            print("  MIGRATED: " .. filename)
            migrated = migrated + 1
        else
            print("  MARK v2 (keys unchanged): " .. filename)
            skipped = skipped + 1
        end
    else
        print("  ERROR (write failed): " .. filename)
        errors = errors + 1
    end

    ::continue::
end
p:close()

print("")
print("Migration complete:")
print("  Migrated: " .. migrated)
print("  Skipped:  " .. skipped)
print("  Errors:   " .. errors)
