--[[
    ACME HTTP-01 challenges across edges that share a DNS name
    ==========================================================
    With round-robin DNS (e.g. lon.pop0.uk -> lon1 + lon2) Let's Encrypt may
    fetch a challenge from the edge that did NOT request the certificate, and
    lua-resty-auto-ssl only knows its own challenges, so issuance and renewal
    fail most of the time. serve() answers from local storage first; on a miss
    it asks each peer edge once (one hop, marked with X-WSL-ACME-Peer so a peer
    never forwards again) and relays a 200 answer.

    Peers: settings.json "acme_peers" (not synced between edges, so each edge
    lists the others), e.g. ["85.190.106.189"], or env WSLPROXY_ACME_PEERS
    ("ip[:port],ip[:port]"). Port 80 by default. No peers = stock behaviour.
]]

local _M = {}

local PEER_HEADER = "X-WSL-ACME-Peer"
local MAX_BODY = 1024 -- key authorizations are ~90 bytes

function _M.peers()
    local list = {}
    local okh, Helper = pcall(require, "helpers")
    local s = okh and Helper.settings and Helper.settings() or {}
    local src = s.acme_peers
    if type(src) ~= "table" then
        src = {}
        for p in tostring(os.getenv("WSLPROXY_ACME_PEERS") or ""):gmatch("[^,%s]+") do src[#src + 1] = p end
    end
    for _, p in ipairs(src) do
        if type(p) == "string" and p:match("^[%w%.%-]+:?%d*$") then list[#list + 1] = p end
    end
    return list
end

--- content_by_lua handler for /.well-known/acme-challenge/<token>.
function _M.serve(auto_ssl)
    local token = (ngx.var.uri or ""):match("/([A-Za-z0-9_%-]+)$")
    if not token then return ngx.exit(ngx.HTTP_NOT_FOUND) end
    local domain = ngx.var.host
    local storage = auto_ssl and auto_ssl.storage
    local value = storage and storage:get_challenge(domain, token)
    if value then
        ngx.say(value)
        return ngx.exit(ngx.HTTP_OK)
    end
    -- A peer asking us: answer locally only, never forward again.
    if ngx.req.get_headers()[PEER_HEADER] then return ngx.exit(ngx.HTTP_NOT_FOUND) end

    local peers = _M.peers()
    if #peers == 0 then return ngx.exit(ngx.HTTP_NOT_FOUND) end
    local okh, http = pcall(require, "resty.http")
    if not okh then return ngx.exit(ngx.HTTP_NOT_FOUND) end
    for _, peer in ipairs(peers) do
        local c = http.new()
        c:set_timeout(3000)
        local res, err = c:request_uri("http://" .. peer .. "/.well-known/acme-challenge/" .. token, {
            method = "GET",
            headers = { Host = domain, [PEER_HEADER] = "1" },
        })
        if res and res.status == 200 and res.body and #res.body > 0 and #res.body <= MAX_BODY then
            ngx.log(ngx.INFO, "acme_peer: challenge for ", domain, " answered by peer ", peer)
            ngx.print(res.body)
            return ngx.exit(ngx.HTTP_OK)
        elseif err then
            ngx.log(ngx.WARN, "acme_peer: peer ", peer, " failed for ", domain, ": ", err)
        end
    end
    return ngx.exit(ngx.HTTP_NOT_FOUND)
end

return _M
