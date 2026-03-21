-- rule_loader.lua
-- Load server and rule JSON configs from disk, normalize formats
-- Handles legacy data (base64-encoded S3 keys) and format variations

local M = {}

local cjson = Cjson

local function load_file(path)
    local file, err = io.open(path, "rb")
    if not file then
        return nil, err
    end
    local content = file:read("*a")
    file:close()
    if not content or content == "" then
        return nil, "empty file"
    end
    return content
end

local function parse_json(content)
    local ok, result = pcall(cjson.decode, content)
    if ok then
        return result
    end
    return nil, result
end

--- Try to decode a base64-encoded string. Returns decoded if it looks valid, else original.
local function try_decode_b64(s)
    if not s or s == "" or type(s) == "userdata" then return s end
    local ok, decoded = pcall(Base64.decode, tostring(s))
    if ok and decoded and #decoded > 0 then
        -- Check if decoded looks like ASCII (valid AWS key characters)
        if decoded:match("^[%w%+%/%=]+$") then
            return decoded
        end
    end
    return s
end

--- Iteratively decode a base64 string up to max_rounds until it stops changing.
--- Used for migration of over-encoded S3 keys.
local function fully_decode_b64(s, max_rounds)
    max_rounds = max_rounds or 5
    if not s or s == "" or type(s) == "userdata" then return s end
    local current = tostring(s)
    for _ = 1, max_rounds do
        local ok, decoded = pcall(Base64.decode, current)
        if not ok or not decoded or decoded == "" or decoded == current then
            break
        end
        -- Check if decoded result looks like a valid AWS key (printable ASCII, reasonable length)
        local is_printable = not decoded:match("[^%g]")  -- no non-printable chars
        if is_printable and #decoded >= 16 and #decoded <= 128 then
            -- This looks like a real key, stop here
            return decoded
        end
        -- If decoded looks like another base64 string, keep going
        if decoded:match("^[A-Za-z0-9%+%/%=]+$") then
            current = decoded
        else
            -- Not base64-like, return current
            return current
        end
    end
    return current
end

--- Normalize S3 credentials in a rule's match.rules object.
--- Schema v2 (plaintext) passes through unchanged.
--- Schema v1 (base64-encoded) gets decoded.
local function normalize_s3_keys(rule_data, schema_version)
    if not rule_data or not rule_data.match or not rule_data.match.rules then
        return rule_data
    end
    local rules = rule_data.match.rules
    if schema_version and schema_version >= 2 then
        -- v2: keys are plaintext, no decoding needed
        return rule_data
    end
    -- v1 or unversioned: decode base64 (may be multi-layered)
    if rules.amazon_s3_access_key and type(rules.amazon_s3_access_key) ~= "userdata" then
        rules.amazon_s3_access_key = fully_decode_b64(rules.amazon_s3_access_key)
    end
    if rules.amazon_s3_secret_key and type(rules.amazon_s3_secret_key) ~= "userdata" then
        rules.amazon_s3_secret_key = fully_decode_b64(rules.amazon_s3_secret_key)
    end
    return rule_data
end

-- ─── Public API ─────────────────────────────────────────────────────────────

--- Load a server config by hostname.
--- Tries exact match first, then strips "www." prefix.
---
--- @param hostname    string  The request hostname
--- @param config_path string  Base config path (e.g. "/opt/nginx/")
--- @param profile     string  Environment profile (e.g. "prod")
--- @return table|nil  server config, or nil if not found
--- @return string|nil error message
function M.load_server(hostname, config_path, profile)
    local path = config_path .. "data/servers/" .. profile .. "/host:" .. hostname .. ".json"
    local content, err = load_file(path)

    -- Fallback: strip "www." prefix
    if not content and hostname:sub(1, 4) == "www." then
        local bare = hostname:sub(5)
        path = config_path .. "data/servers/" .. profile .. "/host:" .. bare .. ".json"
        content, err = load_file(path)
    end

    if not content then
        return nil, err
    end

    return parse_json(content)
end

--- Load a single rule by ID.
---
--- @param rule_id     string  Rule UUID
--- @param config_path string  Base config path
--- @param profile     string  Environment profile
--- @return table|nil  rule config, or nil if not found
function M.load_rule(rule_id, config_path, profile)
    local path = config_path .. "data/rules/" .. profile .. "/" .. rule_id .. ".json"
    local content = load_file(path)
    if not content then
        return nil
    end
    local rule_data = parse_json(content)
    if not rule_data then
        return nil
    end
    -- Normalize S3 keys based on schema version
    rule_data = normalize_s3_keys(rule_data, rule_data._schema_version)
    return rule_data
end

--- Parse the rules field from a server config into a list of rule IDs.
--- Handles: single string, comma-separated string, array of strings.
---
--- @param rules_field  string|table  The server's "rules" field
--- @return table  list of rule ID strings
function M.parse_rule_ids(rules_field)
    if not rules_field or type(rules_field) == "userdata" then
        return {}
    end
    if type(rules_field) == "table" then
        -- Already an array
        local ids = {}
        for _, id in ipairs(rules_field) do
            if type(id) == "string" and id ~= "" then
                table.insert(ids, id:match("^%s*(.-)%s*$"))
            end
        end
        return ids
    end
    if type(rules_field) == "string" then
        local ids = {}
        for id in string.gmatch(rules_field, "[^,]+") do
            local trimmed = id:match("^%s*(.-)%s*$")
            if trimmed ~= "" then
                table.insert(ids, trimmed)
            end
        end
        return ids
    end
    return {}
end

--- Parse match_cases from a server config.
--- Returns ALL conditions (both AND and OR), each tagged with its mode.
---
--- @param match_cases table  The server's "match_cases" array
--- @return table  list of {rule_id=string, condition=string}
function M.parse_match_cases(match_cases)
    if not match_cases or type(match_cases) ~= "table" then
        return {}
    end
    local results = {}
    for _, entry in ipairs(match_cases) do
        if entry.statement and entry.statement ~= "" then
            table.insert(results, {
                rule_id = entry.statement,
                condition = entry.condition or "and",
            })
        end
    end
    return results
end

--- Load all rules for a server config.
--- Returns a flat list of rule objects, each annotated with condition_mode.
---
--- @param server_config table  The parsed server config
--- @param config_path   string Base config path
--- @param profile       string Environment profile
--- @return table  list of {rule_data=table, condition_mode=string}
function M.load_all_rules(server_config, config_path, profile)
    local loaded_rules = {}

    -- 1. Load rules from the "rules" field (default: AND mode)
    local rule_ids = M.parse_rule_ids(server_config.rules)
    for _, rid in ipairs(rule_ids) do
        local rule = M.load_rule(rid, config_path, profile)
        if rule and rule.match and rule.match.rules then
            table.insert(loaded_rules, {
                rule_data = rule,
                condition_mode = "and",  -- primary rules default to AND
            })
        end
    end

    -- 2. Load rules from match_cases (AND or OR as specified)
    local cases = M.parse_match_cases(server_config.match_cases)
    for _, case in ipairs(cases) do
        local rule = M.load_rule(case.rule_id, config_path, profile)
        if rule and rule.match and rule.match.rules then
            table.insert(loaded_rules, {
                rule_data = rule,
                condition_mode = case.condition,
            })
        end
    end

    return loaded_rules
end

-- Export for migration script
M.fully_decode_b64 = fully_decode_b64

return M
