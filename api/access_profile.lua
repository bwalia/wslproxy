-- access_profile.lua
-- Expand a named access profile into ordinary rules.
--
-- An access profile is a reusable bundle of protected endpoints that a domain
-- attaches with one field. It is expanded into the normal rule format at load
-- time, so priority ranking, path specificity, condition modes and the response
-- contract all keep working exactly as they do for hand-written rules — there is
-- no second decision engine.
--
-- Each endpoint becomes a PAIR of rules:
--
--   allow — path + client_ip cidr → proxy to the origin
--   deny  — path only, lower priority → 403 page
--
-- The pair is mandatory, not stylistic. rule_selector filters to rules that
-- pass and then ranks them, so an allow rule whose IP condition fails simply
-- drops out of selection; without the deny rule beneath it the request falls
-- through to the domain's catch-all and is served. See docs/VPN_ACCESS.md.
--
-- The expansion logic is pure and testable: see test/rules/test_access_profile.lua.

local M = {}

-- Base priority for generated rules. Comfortably above hand-written rules,
-- which use small numbers, so a profile always outranks a catch-all.
local DEFAULT_PRIORITY_BASE = 1000

-- Shown when a request is denied and the profile defines no page of its own.
local DEFAULT_DENY_MESSAGE =
    "PCFkb2N0eXBlIGh0bWw+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPHRpdGxlPlZQTiByZXF1aXJlZDwvdGl0bGU+CjxzdHlsZT5ib2R5e2ZvbnQtZmFtaWx5OnN5c3RlbS11aSxzYW5zLXNlcmlmO21heC13aWR0aDozNHJlbTttYXJnaW46MjB2aCBhdXRvO3BhZGRpbmc6MCAxLjVyZW07Y29sb3I6IzIyMn1oMXtmb250LXNpemU6MS40cmVtO21hcmdpbjowIDAgLjZyZW19cHtsaW5lLWhlaWdodDoxLjY7Y29sb3I6IzU1NX1jb2Rle2JhY2tncm91bmQ6I2Y0ZjRmNTtwYWRkaW5nOi4xNXJlbSAuNHJlbTtib3JkZXItcmFkaXVzOi4yNXJlbX08L3N0eWxlPgo8aDE+VlBOIHJlcXVpcmVkPC9oMT4KPHA+VGhpcyBlbmRwb2ludCBpcyByZXN0cmljdGVkIHRvIHVzZXJzIGNvbm5lY3RlZCB0aHJvdWdoIHRoZSBjb3Jwb3JhdGUgVlBOLjwvcD4KPHA+Q29ubmVjdCwgdGhlbiByZWxvYWQgdGhpcyBwYWdlLiBJZiB5b3UgYXJlIGFscmVhZHkgY29ubmVjdGVkIGFuZCBzdGlsbCBzZWUgdGhpcywgeW91ciBkZXZpY2UgbWF5IG5vdCBoYXZlIGFuIGFjdGl2ZSBzZXNzaW9uIOKAlCBjaGVjayA8Y29kZT53c2wgc3RhdHVzPC9jb2RlPi48L3A+Cg=="

local function is_empty(s)
    return s == nil or s == "" or type(s) == "userdata"
end

local function trim(s)
    return (tostring(s):gsub("^%s*(.-)%s*$", "%1"))
end

--- Trimmed value, or nil when absent.
---
--- Deliberately not `is_empty(s) and nil or trim(s)`: when the middle operand
--- is nil Lua falls through to the third, so that idiom yields the string
--- "nil" for every absent field.
local function opt(s)
    if is_empty(s) then
        return nil
    end
    return trim(s)
end

--- Ordering weight for a path, mirroring match_path's specificity scoring in
--- rule_matcher so generated priorities agree with how the selector ranks.
local function path_weight(path, path_key)
    if is_empty(path) then
        return 0
    end
    local len = #trim(path)
    if path_key == "equals" then
        return len + 1000
    elseif path_key == "ends_with" then
        return len + 500
    end
    return len -- starts_with
end

--- Validate and normalise a profile document.
---
--- Returns nil plus a reason when the profile cannot be safely expanded. The
--- caller drops it: a profile that does not parse must not silently degrade
--- into "no restrictions".
---
--- @param doc table  decoded profile JSON
--- @return table|nil normalised profile
--- @return string|nil error
function M.normalise(doc)
    if type(doc) ~= "table" then
        return nil, "profile is not an object"
    end
    if is_empty(doc.name) then
        return nil, "profile name required"
    end
    if type(doc.endpoints) ~= "table" or #doc.endpoints == 0 then
        return nil, "profile has no endpoints"
    end

    local default_cidrs = opt(doc.allow_cidrs)
    local default_groups = opt(doc.groups)

    local endpoints = {}
    for i, ep in ipairs(doc.endpoints) do
        if type(ep) ~= "table" or is_empty(ep.path) then
            return nil, "endpoint " .. i .. " has no path"
        end
        local cidrs = opt(ep.allow_cidrs) or default_cidrs
        if is_empty(cidrs) then
            -- No allowlist anywhere means the allow rule could never pass and
            -- the endpoint would be permanently denied. Refuse rather than
            -- expand into something that looks configured but blackholes.
            return nil, "endpoint " .. i .. " (" .. tostring(ep.path) .. ") has no allow_cidrs"
        end
        local path_key = is_empty(ep.path_key) and "starts_with" or trim(ep.path_key)
        if path_key ~= "starts_with" and path_key ~= "ends_with" and path_key ~= "equals" then
            return nil, "endpoint " .. i .. " has unknown path_key: " .. path_key
        end
        table.insert(endpoints, {
            path = trim(ep.path),
            path_key = path_key,
            allow_cidrs = cidrs,
            origin = opt(ep.origin),
            groups = opt(ep.groups) or default_groups,
            weight = path_weight(ep.path, path_key),
        })
    end

    return {
        name = trim(doc.name),
        endpoints = endpoints,
        origin = opt(doc.origin),
        priority_base = tonumber(doc.priority_base) or DEFAULT_PRIORITY_BASE,
        deny_code = tonumber(doc.deny_code) or 403,
        deny_message = is_empty(doc.deny_message) and DEFAULT_DENY_MESSAGE or doc.deny_message,
    }
end

--- Expand a normalised profile into loaded-rule entries.
---
--- Priorities are assigned by path specificity so that a narrower endpoint's
--- deny outranks a broader endpoint's allow. Without this, protecting both
--- "/admin" and "/admin/reports" with different ranges would let someone
--- allowed on "/admin" reach "/admin/reports" too, because the broader allow
--- would outrank the narrower deny at equal priority.
---
--- @param profile       table  from M.normalise
--- @param server_config table  the domain's server config (for proxy_pass)
--- @return table  list of {rule_data=table, condition_mode="and"}
--- @return string|nil error
function M.expand(profile, server_config)
    server_config = server_config or {}
    local fallback_origin = profile.origin or opt(server_config.proxy_pass)

    -- Rank endpoints by specificity: longer/more specific paths get higher
    -- priority so their rules win outright rather than relying on tie-breaks.
    local ordered = {}
    for i, ep in ipairs(profile.endpoints) do
        table.insert(ordered, { ep = ep, index = i })
    end
    table.sort(ordered, function(a, b)
        if a.ep.weight ~= b.ep.weight then
            return a.ep.weight < b.ep.weight
        end
        return a.index < b.index
    end)

    local expanded = {}
    for rank, entry in ipairs(ordered) do
        local ep = entry.ep
        local origin = ep.origin or fallback_origin
        if is_empty(origin) then
            -- A 305 with no redirect_uri is a 500 at response time. Fail the
            -- whole profile at load instead of at request time.
            return nil, "no origin for endpoint " .. ep.path ..
                " (set origin on the endpoint or profile, or proxy_pass on the server)"
        end

        local base = profile.priority_base + (rank - 1) * 2
        local id = "ap:" .. profile.name .. ":" .. rank

        -- deny: path only, so it catches every request the allow rule drops
        table.insert(expanded, {
            condition_mode = "and",
            rule_data = {
                id = id .. ":deny",
                name = profile.name .. " deny " .. ep.path,
                priority = base,
                _access_profile = profile.name,
                match = {
                    rules = {
                        path_key = ep.path_key,
                        path = ep.path,
                    },
                    response = {
                        allow = false,
                        code = profile.deny_code,
                        message = profile.deny_message,
                    },
                },
            },
        })

        -- allow: same path plus the CIDR condition, one step higher.
        -- When the endpoint names groups, identity is required too — the CIDR
        -- stays as defence in depth, so a leaked service token alone does not
        -- grant access from off the overlay.
        local allow_rules = {
            path_key = ep.path_key,
            path = ep.path,
            client_ip_key = "cidr",
            client_ip = ep.allow_cidrs,
        }
        if ep.groups then
            allow_rules.vpn_groups = ep.groups
        end

        table.insert(expanded, {
            condition_mode = "and",
            rule_data = {
                id = id .. ":allow",
                name = profile.name .. " allow " .. ep.path,
                priority = base + 1,
                _access_profile = profile.name,
                match = {
                    rules = allow_rules,
                    response = {
                        allow = true,
                        code = 305,
                        redirect_uri = origin,
                    },
                },
            },
        })
    end

    return expanded
end

--- Load a profile from disk and expand it.
---
--- @param name          string profile name
--- @param config_path   string base config path (e.g. "/opt/nginx/")
--- @param env           string environment profile (e.g. "prod")
--- @param server_config table  the domain's server config
--- @param deps          table|nil {read_file=fn, decode=fn} — injected in tests
--- @return table|nil expanded rules
--- @return string|nil error
function M.load_and_expand(name, config_path, env, server_config, deps)
    deps = deps or {}
    local read_file = deps.read_file or function(path)
        local file = io.open(path, "rb")
        if not file then
            return nil, "not found"
        end
        local content = file:read("*a")
        file:close()
        if not content or content == "" then
            return nil, "empty file"
        end
        return content
    end
    local decode = deps.decode or function(content)
        local ok, result = pcall(Cjson.decode, content)
        if not ok then
            return nil, tostring(result)
        end
        return result
    end

    if is_empty(name) then
        return nil, "no profile name"
    end
    local path = config_path .. "data/access_profiles/" .. env .. "/" .. trim(name) .. ".json"
    local content, read_err = read_file(path)
    if not content then
        return nil, "cannot read " .. path .. ": " .. tostring(read_err)
    end
    local doc, decode_err = decode(content)
    if not doc then
        return nil, "cannot parse " .. path .. ": " .. tostring(decode_err)
    end
    local profile, norm_err = M.normalise(doc)
    if not profile then
        return nil, "invalid profile " .. path .. ": " .. tostring(norm_err)
    end
    return M.expand(profile, server_config)
end

M.DEFAULT_PRIORITY_BASE = DEFAULT_PRIORITY_BASE
M.DEFAULT_DENY_MESSAGE = DEFAULT_DENY_MESSAGE

return M
