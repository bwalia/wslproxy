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
-- Base64 of a self-contained HTML page styled like wslproxy.com (brand tokens
-- from its site.css, light + prefers-color-scheme dark). base64 -d to edit.
local DEFAULT_DENY_MESSAGE =
    "PCFkb2N0eXBlIGh0bWw+CjxodG1sIGxhbmc9ImVuIj4KPGhlYWQ+CjxtZXRhIGNoYXJzZXQ9InV0Zi04Ij4KPG1ldGEgbmFtZT0idmlld3BvcnQiIGNvbnRlbnQ9IndpZHRoPWRldmljZS13aWR0aCxpbml0aWFsLXNjYWxlPTEiPgo8bWV0YSBuYW1lPSJyb2JvdHMiIGNvbnRlbnQ9Im5vaW5kZXgiPgo8dGl0bGU+VlBOIHJlcXVpcmVkPC90aXRsZT4KPGxpbmsgcmVsPSJwcmVjb25uZWN0IiBocmVmPSJodHRwczovL2ZvbnRzLmdvb2dsZWFwaXMuY29tIj4KPGxpbmsgcmVsPSJwcmVjb25uZWN0IiBocmVmPSJodHRwczovL2ZvbnRzLmdzdGF0aWMuY29tIiBjcm9zc29yaWdpbj4KPGxpbmsgaHJlZj0iaHR0cHM6Ly9mb250cy5nb29nbGVhcGlzLmNvbS9jc3MyP2ZhbWlseT1KZXRCcmFpbnMrTW9ubzp3Z2h0QDUwMCZmYW1pbHk9UG9wcGluczp3Z2h0QDQwMDs1MDA7NjAwJmZhbWlseT1VbmJvdW5kZWQ6d2dodEA2MDAmZGlzcGxheT1zd2FwIiByZWw9InN0eWxlc2hlZXQiPgo8c3R5bGU+Cjpyb290ey0tc3RlZWw6I2Y3ZjlmYzstLXJhaXNlZDojZmZmOy0tbGluZTojZTJlOGYwOy0taW5rOiMwYjFjMmM7LS1tdXRlZDojNDc1NTY5Oy0tZmFpbnQ6IzY0NzQ4YjstLWJyYXNzOiMyNTVmYTg7LS1icmFzcy1kaW06IzFlNGM4ODstLWdsb3c6IzI1NWZhODMzOy0tc2lnbmFsOiMyNTVmYTg7LS1oZXJvLWdsb3c6IzM0NzZjMjFhOy0tY29kZS1iZzojZWVmMmY2Oy0tbG9nby1mcm9tOiM1NDkzZDY7LS1sb2dvLXRvOiMxZTRjODg7Y29sb3Itc2NoZW1lOmxpZ2h0fQpAbWVkaWEgKHByZWZlcnMtY29sb3Itc2NoZW1lOmRhcmspezpyb290ey0tc3RlZWw6IzBiMWMyYzstLXJhaXNlZDojMTIyMjMzOy0tbGluZTojMzM0MTU1Oy0taW5rOiNlZWYyZjY7LS1tdXRlZDojY2JkNWUxOy0tZmFpbnQ6Izk0YTNiODstLWJyYXNzOiMzNDc2YzI7LS1icmFzcy1kaW06IzI1NWZhODstLWdsb3c6IzM0NzZjMjQwOy0tc2lnbmFsOiM4N2I3ZTY7LS1oZXJvLWdsb3c6IzM0NzZjMjI0Oy0tY29kZS1iZzojMDgxNTFmO2NvbG9yLXNjaGVtZTpkYXJrfX0KKntib3gtc2l6aW5nOmJvcmRlci1ib3h9CmJvZHl7bWFyZ2luOjA7bWluLWhlaWdodDoxMDB2aDtkaXNwbGF5OmZsZXg7ZmxleC1kaXJlY3Rpb246Y29sdW1uO2ZvbnQ6MTVweC8xLjcgIlBvcHBpbnMiLCJIZWx2ZXRpY2EgTmV1ZSIsQXJpYWwsc2Fucy1zZXJpZjstd2Via2l0LWZvbnQtc21vb3RoaW5nOmFudGlhbGlhc2VkO2NvbG9yOnZhcigtLWluayk7YmFja2dyb3VuZDpyYWRpYWwtZ3JhZGllbnQoZWxsaXBzZSA4MCUgNTAlIGF0IDcwJSAtMTAlLHZhcigtLWhlcm8tZ2xvdyksdHJhbnNwYXJlbnQgNTUlKSx2YXIoLS1zdGVlbCk7YmFja2dyb3VuZC1hdHRhY2htZW50OmZpeGVkfQpoZWFkZXJ7aGVpZ2h0OjY0cHg7ZGlzcGxheTpmbGV4O2FsaWduLWl0ZW1zOmNlbnRlcjtwYWRkaW5nOjAgMjRweDtib3JkZXItYm90dG9tOjFweCBzb2xpZCB2YXIoLS1saW5lKX0KLmJyYW5ke3RleHQtZGVjb3JhdGlvbjpub25lO2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7Z2FwOjExcHg7Zm9udDo2MDAgMTdweCAiVW5ib3VuZGVkIiwiUG9wcGlucyIsc2Fucy1zZXJpZjtsZXR0ZXItc3BhY2luZzotLjAxNWVtO2NvbG9yOnZhcigtLWluayl9Ci5icmFuZCBzdmd7d2lkdGg6MzBweDtoZWlnaHQ6MzBweDtmaWx0ZXI6ZHJvcC1zaGFkb3coMCAycHggNnB4IHZhcigtLWdsb3cpKX0KLmJyYW5kIGJ7Y29sb3I6dmFyKC0tc2lnbmFsKTtmb250LXdlaWdodDo3MDB9Cm1haW57ZmxleDoxO2Rpc3BsYXk6ZmxleDthbGlnbi1pdGVtczpjZW50ZXI7anVzdGlmeS1jb250ZW50OmNlbnRlcjtwYWRkaW5nOjQ4cHggMTZweH0KLmNhcmR7d2lkdGg6MTAwJTttYXgtd2lkdGg6NTIwcHg7YmFja2dyb3VuZDp2YXIoLS1yYWlzZWQpO2JvcmRlcjoxcHggc29saWQgdmFyKC0tbGluZSk7Ym9yZGVyLXJhZGl1czoxMnB4O3BhZGRpbmc6MzZweCAzMnB4O2JveC1zaGFkb3c6MCAyMHB4IDUwcHggLTI0cHggdmFyKC0tZ2xvdyl9Ci5leWVicm93e2Rpc3BsYXk6aW5saW5lLWJsb2NrO2ZvbnQ6NTAwIC43NXJlbSAiSmV0QnJhaW5zIE1vbm8iLHVpLW1vbm9zcGFjZSxNZW5sbyxtb25vc3BhY2U7bGV0dGVyLXNwYWNpbmc6LjE0ZW07dGV4dC10cmFuc2Zvcm06dXBwZXJjYXNlO2NvbG9yOnZhcigtLXNpZ25hbCk7bWFyZ2luLWJvdHRvbToxMHB4fQpoMXtmb250OjYwMCBjbGFtcCgxLjVyZW0sMS4ycmVtICsgMS40dncsMnJlbSkvMS4xNSAiVW5ib3VuZGVkIiwiUG9wcGlucyIsc2Fucy1zZXJpZjtsZXR0ZXItc3BhY2luZzotLjAyZW07bWFyZ2luOjAgMCAxNHB4fQpwe21hcmdpbjowIDAgMTRweDtjb2xvcjp2YXIoLS1tdXRlZCl9CmNvZGV7Zm9udDo1MDAgLjg1ZW0gIkpldEJyYWlucyBNb25vIix1aS1tb25vc3BhY2UsTWVubG8sbW9ub3NwYWNlO2JhY2tncm91bmQ6dmFyKC0tY29kZS1iZyk7Ym9yZGVyOjFweCBzb2xpZCB2YXIoLS1saW5lKTtwYWRkaW5nOi4xcmVtIC40cmVtO2JvcmRlci1yYWRpdXM6NnB4O2NvbG9yOnZhcigtLWluayl9Ci5idG57ZGlzcGxheTppbmxpbmUtZmxleDttYXJnaW4tdG9wOjEwcHg7cGFkZGluZzoxMnB4IDIwcHg7Ym9yZGVyLXJhZGl1czoxMHB4O2ZvbnQtd2VpZ2h0OjYwMDtmb250LXNpemU6Ljk1cmVtO3RleHQtZGVjb3JhdGlvbjpub25lO2NvbG9yOiNmZmY7YmFja2dyb3VuZDpsaW5lYXItZ3JhZGllbnQoMTgwZGVnLGNvbG9yLW1peChpbiBzcmdiLHZhcigtLWJyYXNzKSA5MiUsI2ZmZiksdmFyKC0tYnJhc3MpKTtib3gtc2hhZG93OjAgMTBweCAyOHB4IHZhcigtLWdsb3cpfQouYnRuOmhvdmVye2JhY2tncm91bmQ6bGluZWFyLWdyYWRpZW50KDE4MGRlZyxjb2xvci1taXgoaW4gc3JnYix2YXIoLS1icmFzcykgODAlLCNmZmYpLHZhcigtLWJyYXNzLWRpbSkpfQouYnRuOmZvY3VzLXZpc2libGV7b3V0bGluZToycHggc29saWQgdmFyKC0tYnJhc3MpO291dGxpbmUtb2Zmc2V0OjNweH0KZm9vdGVye3BhZGRpbmc6MjBweCAxNnB4O3RleHQtYWxpZ246Y2VudGVyO2ZvbnQtc2l6ZTouOHJlbTtjb2xvcjp2YXIoLS1mYWludCl9CmZvb3RlciBhe2NvbG9yOnZhcigtLXNpZ25hbCk7dGV4dC1kZWNvcmF0aW9uOm5vbmV9CmZvb3RlciBhOmhvdmVyLC5tb3JlIGE6aG92ZXJ7dGV4dC1kZWNvcmF0aW9uOnVuZGVybGluZX0KLmFjdGlvbnN7ZGlzcGxheTpmbGV4O2ZsZXgtd3JhcDp3cmFwO2FsaWduLWl0ZW1zOmNlbnRlcjtnYXA6OHB4IDE4cHg7bWFyZ2luLXRvcDoxMHB4fQouYWN0aW9ucyAuYnRue21hcmdpbi10b3A6MH0KLm1vcmV7Zm9udC1zaXplOi45cmVtO2ZvbnQtd2VpZ2h0OjUwMH0KLm1vcmUgYXtjb2xvcjp2YXIoLS1zaWduYWwpO3RleHQtZGVjb3JhdGlvbjpub25lfQpAbWVkaWEgKG1heC13aWR0aDo0ODBweCl7LmNhcmR7cGFkZGluZzoyOHB4IDIwcHh9fQo8L3N0eWxlPgo8L2hlYWQ+Cjxib2R5Pgo8aGVhZGVyPgo8YSBjbGFzcz0iYnJhbmQiIGhyZWY9Imh0dHBzOi8vd3NscHJveHkub3JnLyIgdGl0bGU9IldTTFByb3h5IEdhdGV3YXkg4oCUIHdzbHByb3h5Lm9yZyI+PHN2ZyB2aWV3Qm94PSIwIDAgNDggNDgiIGZpbGw9Im5vbmUiIGFyaWEtaGlkZGVuPSJ0cnVlIj48ZGVmcz48bGluZWFyR3JhZGllbnQgaWQ9ImciIHgxPSIwJSIgeTE9IjAlIiB4Mj0iMTAwJSIgeTI9IjEwMCUiPjxzdG9wIG9mZnNldD0iMCUiIHN0b3AtY29sb3I9IiM1NDkzZDYiLz48c3RvcCBvZmZzZXQ9IjEwMCUiIHN0b3AtY29sb3I9IiMxZTRjODgiLz48L2xpbmVhckdyYWRpZW50PjwvZGVmcz48cGF0aCBkPSJNMjQgNEw2IDEydjEyYzAgMTEgOCAyMSAxOCAyNCAxMC0zIDE4LTEzIDE4LTI0VjEyTDI0IDR6IiBmaWxsPSJ1cmwoI2cpIi8+PGNpcmNsZSBjeD0iMjQiIGN5PSIxOCIgcj0iMyIgZmlsbD0iI2ZmZiIvPjxjaXJjbGUgY3g9IjE2IiBjeT0iMjgiIHI9IjIuNSIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjkiLz48Y2lyY2xlIGN4PSIzMiIgY3k9IjI4IiByPSIyLjUiIGZpbGw9IiNmZmYiIG9wYWNpdHk9Ii45Ii8+PGNpcmNsZSBjeD0iMjQiIGN5PSIzNiIgcj0iMiIgZmlsbD0iI2ZmZiIgb3BhY2l0eT0iLjgiLz48cGF0aCBkPSJNMjQgMjF2NU0xOCAyN2w0LTRNMzAgMjdsLTQtNE0yNCAzM3YtMyIgc3Ryb2tlPSIjZmZmIiBzdHJva2Utd2lkdGg9IjEuNSIgc3Ryb2tlLWxpbmVjYXA9InJvdW5kIiBvcGFjaXR5PSIuNyIvPjwvc3ZnPjxzcGFuPldTTDxiPlByb3h5PC9iPjwvc3Bhbj48L2E+CjwvaGVhZGVyPgo8bWFpbj4KPGRpdiBjbGFzcz0iY2FyZCI+CjxzcGFuIGNsYXNzPSJleWVicm93Ij40MDMgwrcgUmVzdHJpY3RlZDwvc3Bhbj4KPGgxPlZQTiByZXF1aXJlZDwvaDE+CjxwPlRoaXMgZW5kcG9pbnQgaXMgcmVzdHJpY3RlZCB0byB1c2VycyBjb25uZWN0ZWQgdGhyb3VnaCB0aGUgY29ycG9yYXRlIFZQTi48L3A+CjxwPkNvbm5lY3QsIHRoZW4gcmVsb2FkIHRoaXMgcGFnZS4gSWYgeW91IGFyZSBhbHJlYWR5IGNvbm5lY3RlZCBhbmQgc3RpbGwgc2VlIHRoaXMsIHlvdXIgZGV2aWNlIG1heSBub3QgaGF2ZSBhbiBhY3RpdmUgc2Vzc2lvbiDigJQgY2hlY2sgPGNvZGU+d3NsIHN0YXR1czwvY29kZT4uPC9wPgo8ZGl2IGNsYXNzPSJhY3Rpb25zIj4KPGEgY2xhc3M9ImJ0biIgaHJlZj0iIj5SZWxvYWQgcGFnZTwvYT4KPHNwYW4gY2xhc3M9Im1vcmUiPjxhIGhyZWY9Imh0dHBzOi8vd3NscHJveHkub3JnLyI+RXhwbG9yZSB0aGUgV1NMUHJveHkgR2F0ZXdheSAmcmFycjs8L2E+PC9zcGFuPgo8L2Rpdj4KPC9kaXY+CjwvbWFpbj4KPGZvb3Rlcj5Qcm90ZWN0ZWQgYnkgPGEgaHJlZj0iaHR0cHM6Ly93c2xwcm94eS5vcmcvIj5XU0xQcm94eSBHYXRld2F5PC9hPjwvZm9vdGVyPgo8L2JvZHk+CjwvaHRtbD4K"

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

-- ─── Debug headers ──────────────────────────────────────────────────────────

--- Header-safe token: "group not held" → "group-not-held".
local function slug(s)
    s = tostring(s or ""):lower():gsub("[^%w]+", "-"):gsub("^%-+", ""):gsub("%-+$", "")
    if s == "" then
        return "denied"
    end
    return s:sub(1, 64)
end

--- What an access profile decided for this request, for the X-WSL-VPN headers.
---
--- Generated rule ids are "ap:<profile>:<rank>:allow|deny" (or
--- "ap:<profile>:failed" from rule_loader.deny_all_rule). When the deny rule
--- won, its allow sibling is in `evaluated` with per-condition results, which
--- says why access was refused.
---
--- @param winner    table|nil  the RuleSelector winner (a rule_matcher result)
--- @param evaluated table|nil  every rule_matcher result for this request
--- @return table|nil {verdict="allowed"|"blocked", profile=string, reason=string|nil}
---                   nil when the winner is not an access-profile rule
function M.decision(winner, evaluated)
    local id = winner and winner.rule_id
    if type(id) ~= "string" then
        return nil
    end
    local name, kind = id:match("^ap:(.+):%d+:(%a+)$")
    if not name then
        name = id:match("^ap:(.+):failed$")
        if name then
            return { verdict = "blocked", profile = name, reason = "profile-load-failed" }
        end
        return nil
    end
    if kind == "allow" then
        return { verdict = "allowed", profile = name }
    end
    if kind ~= "deny" then
        return nil
    end

    local reason = "unknown"
    local allow_id = id:gsub(":deny$", ":allow")
    for _, result in ipairs(evaluated or {}) do
        if result.rule_id == allow_id then
            local c = result.conditions or {}
            if c.ip and not c.ip.pass then
                reason = "client-ip-not-allowed"
            elseif c.vpn and not c.vpn.pass then
                reason = "vpn-" .. slug(c.vpn.reason)
            end
            break
        end
    end
    return { verdict = "blocked", profile = name, reason = reason }
end

--- Set X-WSL-VPN (allowed|blocked), X-WSL-VPN-Profile and, when blocked,
--- X-WSL-VPN-Reason. The address the CIDR was checked against is already in
--- X-Origin-IP (rule_matcher). Set in the rewrite phase, so they survive both
--- the 403 page and a proxied response.
function M.set_debug_headers(decision)
    if not decision then
        return
    end
    ngx.header["X-WSL-VPN"] = decision.verdict
    ngx.header["X-WSL-VPN-Profile"] = decision.profile
    if decision.reason then
        ngx.header["X-WSL-VPN-Reason"] = decision.reason
    end
end

M.DEFAULT_PRIORITY_BASE = DEFAULT_PRIORITY_BASE
M.DEFAULT_DENY_MESSAGE = DEFAULT_DENY_MESSAGE

return M
