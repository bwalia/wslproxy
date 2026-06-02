-- Geo Lookup Module
-- Provides fast country code lookup for nginx variables
-- Used in set_by_lua_block to populate $geo_country variable for logging

local _M = {}

-- Cache IP2Location instance (per-worker)
local ip2loc_instance = nil
local ip2loc_init_attempted = false

-- Initialize IP2Location (lazy loading)
local function get_ip2location()
    if ip2loc_instance then
        return ip2loc_instance
    end

    if ip2loc_init_attempted then
        return nil
    end

    ip2loc_init_attempted = true

    -- Use global IP2LocationPath from init.lua (loaded from settings.json)
    local path = IP2LocationPath
    if not path or path == "" then
        -- ERR (was silent) — rule-time country matching is broken,
        -- the operator must know so they can fix settings.json.
        ngx.log(ngx.ERR, "geo_lookup: IP2LocationPath not set in init.lua — rule-time country matching disabled")
        return nil
    end

    local ok, err = pcall(function()
        if IP2location then
            ip2loc_instance = IP2location:new(path)
        end
    end)

    if not ok then
        -- ERR (was WARN) — rule-time country matching is fully
        -- broken, default error_log level would have filtered WARN.
        ngx.log(ngx.ERR, "geo_lookup: Failed to init IP2Location from ", path, ": ", tostring(err),
            " — rule-time country matching disabled")
    end

    return ip2loc_instance
end

-- Get country code from IP address
-- Returns 2-letter country code or "-" if lookup fails
function _M.get_country(ip_address)
    if not ip_address or ip_address == "" then
        return "-"
    end

    -- Skip private/local IPs
    if ip_address:match("^127%.") or
       ip_address:match("^10%.") or
       ip_address:match("^192%.168%.") or
       ip_address:match("^172%.1[6-9]%.") or
       ip_address:match("^172%.2[0-9]%.") or
       ip_address:match("^172%.3[0-1]%.") or
       ip_address == "::1" then
        return "LOCAL"
    end

    local ip2loc = get_ip2location()
    if not ip2loc then
        return "-"
    end

    local ok, result = pcall(function()
        return ip2loc:get_all(ip_address)
    end)

    if ok and result and result.country_short and result.country_short ~= "-" then
        return result.country_short
    end

    return "-"
end

return _M
