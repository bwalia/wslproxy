-- Location for a 301/302 rule.
--
-- By default the rule's redirect_uri is used as written. With
-- `match.response.redirect_preserve_uri: true` the request's path and query
-- are appended, so https://old.example/a?b=1 → https://new.example/a?b=1.

local M = {}

--- @param base string        the rule's redirect_uri (scheme + host [+ path])
--- @param preserve any       the rule's redirect_preserve_uri flag
--- @param request_uri string ngx.var.request_uri (path + query, as received)
--- @return string
function M.build(base, preserve, request_uri)
    if not (preserve == true or preserve == "true") then
        return base
    end
    if type(request_uri) ~= "string" or request_uri == "" then
        return base
    end
    -- Collapse leading slashes: "//evil.example" after the base host stays a
    -- path on the base host either way, but a single slash is what was meant.
    local tail = "/" .. request_uri:gsub("^/+", "")
    return (base:gsub("/+$", "")) .. tail
end

return M
