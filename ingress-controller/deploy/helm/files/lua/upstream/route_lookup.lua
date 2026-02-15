-- route_lookup.lua
-- Route resolution module for WSLProxy Ingress Controller
-- Matches incoming Host + URI to the correct backend_name

local cjson = require "cjson.safe"

local _M = { _VERSION = '1.0.0' }

local routes_dict = ngx.shared.routes

-- resolve(host, uri) → backend_name or nil
-- Looks up the routes shared dict for matching host,
-- then finds the longest matching path prefix.
function _M.resolve(host, uri)
    if not host or host == "" then
        return nil
    end

    -- Normalize: strip port from host if present (e.g. "example.com:80" → "example.com")
    local clean_host = host:match("^([^:]+)")

    local route_key = "route:" .. clean_host
    local paths_json = routes_dict:get(route_key)

    if not paths_json then
        return nil
    end

    local paths, err = cjson.decode(paths_json)
    if not paths then
        ngx.log(ngx.ERR, "Failed to decode routes for ", clean_host, ": ", err)
        return nil
    end

    -- Paths are pre-sorted longest first (by update_route.lua)
    -- Find the longest matching prefix
    for _, route in ipairs(paths) do
        local path = route.path or "/"
        local path_type = route.path_type or "Prefix"

        if path_type == "Exact" then
            if uri == path then
                return route.backend
            end
        else
            -- Prefix match: URI starts with path
            if path == "/" then
                -- Root path matches everything
                return route.backend
            end

            if uri == path or uri:sub(1, #path) == path and (uri:sub(#path + 1, #path + 1) == "/" or uri:sub(#path + 1, #path + 1) == "" or uri:sub(#path + 1, #path + 1) == "?") then
                return route.backend
            end
        end
    end

    return nil
end

return _M
