-- api/configuration_export.lua
-- Build a POP-filtered configuration bundle for CP → git → edge publish.
--
-- GET /api/configuration/export?pop_id=lon1&env=prod
-- Returns JSON: { data = { manifest, servers, rules, waf_policies, waf_rules, secrets } }
--
-- Closure: servers tagged with pop_id → referenced rules / waf_policies /
-- waf_rules / secret:// blobs. api_gw rides on the server JSON (no separate tree).

local _M = {}

local cjson = require("cjson.safe")
local Repo = require("repo")
local Pops = require("pops")

local function uuid_v4ish()
    -- Not cryptographic; good enough for export_id correlation in manifests.
    local t = {}
    for i = 1, 16 do
        t[i] = string.format("%02x", math.random(0, 255))
    end
    t[7] = string.format("%02x", (tonumber(t[7], 16) % 16) + 64) -- version 4-ish
    t[9] = string.format("%02x", (tonumber(t[9], 16) % 64) + 128) -- variant
    return table.concat({
        table.concat(t, "", 1, 4),
        table.concat(t, "", 5, 6),
        table.concat(t, "", 7, 8),
        table.concat(t, "", 9, 10),
        table.concat(t, "", 11, 16),
    }, "-")
end

local function pop_ids_include(server, pop_id)
    local ids = server and server.pop_ids
    if type(ids) ~= "table" then
        return false
    end
    -- Support both array form and (legacy) map form.
    for k, v in pairs(ids) do
        if v == pop_id or (type(k) == "string" and k == pop_id and v) then
            return true
        end
    end
    return false
end

local function add_rule_id(set, id)
    if type(id) == "string" and id ~= "" then
        set[id] = true
    end
end

local function collect_rule_ids_from_server(server, set)
    if not server then
        return
    end
    local rules = server.rules
    if type(rules) == "string" then
        add_rule_id(set, rules)
    elseif type(rules) == "table" then
        for _, id in ipairs(rules) do
            add_rule_id(set, id)
        end
        -- also tolerate map-like tables
        for k, v in pairs(rules) do
            if type(k) == "string" and #k > 8 and type(v) ~= "table" then
                add_rule_id(set, k)
            elseif type(v) == "string" then
                add_rule_id(set, v)
            end
        end
    end
    local cases = server.match_cases
    if type(cases) == "table" then
        for _, c in ipairs(cases) do
            if type(c) == "table" then
                add_rule_id(set, c.statement or c.rule_id or c.id)
            elseif type(c) == "string" then
                add_rule_id(set, c)
            end
        end
    end
end

local function collect_secret_refs(obj, set, depth)
    depth = depth or 0
    if depth > 8 or type(obj) ~= "table" then
        return
    end
    for _, v in pairs(obj) do
        if type(v) == "string" then
            local id = v:match("^secret://([^#]+)")
            if id and id ~= "" then
                set[id] = true
            end
        elseif type(v) == "table" then
            collect_secret_refs(v, set, depth + 1)
        end
    end
end

local function sha256_hex(s)
    local resty_sha256 = require("resty.sha256")
    local str = require("resty.string")
    local sha = resty_sha256:new()
    sha:update(s or "")
    return str.to_hex(sha:final())
end

-- Empty Lua tables encode as {} without a metatable; pin list fields to [].
local function json_array()
    local t = {}
    local mt = cjson.array_mt or cjson.empty_array_mt
    if mt then
        setmetatable(t, mt)
    end
    return t
end

local function as_json_array(t)
    if type(t) ~= "table" then
        return json_array()
    end
    local mt = cjson.array_mt or cjson.empty_array_mt
    if mt then
        setmetatable(t, mt)
    end
    return t
end

--- Build export bundle. Returns data table or nil, err_string.
function _M.build(pop_id, env)
    if type(pop_id) ~= "string" or pop_id:match("^%s*$") then
        return nil, "pop_id is required"
    end
    env = (type(env) == "string" and env ~= "" and env) or "prod"

    local pop, perr = Pops.get(pop_id)
    if not pop then
        local detail = ""
        if type(perr) == "table" and perr.message then
            detail = " (" .. tostring(perr.message) .. ")"
        elseif perr then
            detail = " (" .. tostring(perr) .. ")"
        end
        return nil, "unknown pop_id: " .. pop_id .. detail
    end

    local all_servers, serr = Repo.scan("servers", env)
    if not all_servers then
        return nil, "failed to list servers: " .. tostring(serr)
    end

    local servers = json_array()
    local rule_ids, waf_policy_ids, secret_ids = {}, {}, {}

    for _, srv in ipairs(all_servers) do
        if pop_ids_include(srv, pop_id) then
            servers[#servers + 1] = srv
            collect_rule_ids_from_server(srv, rule_ids)
            if type(srv.waf_policy_id) == "string" and srv.waf_policy_id ~= "" then
                waf_policy_ids[srv.waf_policy_id] = true
            end
            collect_secret_refs(srv, secret_ids)
        end
    end

    table.sort(servers, function(a, b)
        return tostring(a.id or "") < tostring(b.id or "")
    end)

    local rules = json_array()
    for id in pairs(rule_ids) do
        local rec = Repo.get("rules", env, id)
        if type(rec) == "table" then
            rules[#rules + 1] = rec
            collect_secret_refs(rec, secret_ids)
        end
    end
    table.sort(rules, function(a, b)
        return tostring(a.id or "") < tostring(b.id or "")
    end)

    local waf_policies = json_array()
    local waf_rule_ids = {}
    for id in pairs(waf_policy_ids) do
        local rec = Repo.get("waf_policies", env, id)
        if type(rec) == "table" then
            waf_policies[#waf_policies + 1] = rec
            -- common shapes: rules = ["id", ...] or rule_ids
            local wr = rec.rules or rec.rule_ids or rec.waf_rules
            if type(wr) == "table" then
                for _, rid in ipairs(wr) do
                    if type(rid) == "string" then
                        waf_rule_ids[rid] = true
                    elseif type(rid) == "table" and type(rid.id) == "string" then
                        waf_rule_ids[rid.id] = true
                    end
                end
            end
        end
    end
    table.sort(waf_policies, function(a, b)
        return tostring(a.id or "") < tostring(b.id or "")
    end)

    local waf_rules = json_array()
    for id in pairs(waf_rule_ids) do
        local rec = Repo.get("waf_rules", env, id)
        if type(rec) == "table" then
            waf_rules[#waf_rules + 1] = rec
        end
    end
    table.sort(waf_rules, function(a, b)
        return tostring(a.id or "") < tostring(b.id or "")
    end)

    local secrets = json_array()
    for id in pairs(secret_ids) do
        local rec = Repo.get("secrets", env, id)
        if type(rec) == "table" then
            secrets[#secrets + 1] = rec
        end
    end
    table.sort(secrets, function(a, b)
        return tostring(a.id or "") < tostring(b.id or "")
    end)

    servers = as_json_array(servers)
    rules = as_json_array(rules)
    waf_policies = as_json_array(waf_policies)
    waf_rules = as_json_array(waf_rules)
    secrets = as_json_array(secrets)

    local body = {
        servers = servers,
        rules = rules,
        waf_policies = waf_policies,
        waf_rules = waf_rules,
        secrets = secrets,
    }
    -- Deterministic hash of the payload (excluding manifest).
    local encoded = cjson.encode(body) or ""
    local export_id = uuid_v4ish()
    local manifest = {
        pop_id = pop_id,
        env_profile = env,
        export_id = export_id,
        content_sha256 = sha256_hex(encoded),
        source_host = ngx.var and ngx.var.host or "wslproxy",
        exported_at = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        record_counts = {
            servers = #servers,
            rules = #rules,
            waf_policies = #waf_policies,
            waf_rules = #waf_rules,
            secrets = #secrets,
        },
        pop = {
            id = pop.id,
            display_name = pop.display_name,
            public_ipv4 = pop.public_ipv4,
            status = pop.status,
        },
    }

    return {
        manifest = manifest,
        servers = servers,
        rules = rules,
        waf_policies = waf_policies,
        waf_rules = waf_rules,
        secrets = secrets,
    }
end

return _M
