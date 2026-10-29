-- api/bot_defense/behaviour.lua
-- What a client does over time, from counters in the wsl_bot_defense shared
-- dict (shared by every worker). Fixed windows keyed by time bucket: cheap
-- (one or two dict ops per signal) and memory-bounded (every key has a TTL).
--
--   ip key       the client IP — volume signals (burst, errors, logins), so a
--                bot cannot reset them by rotating User-Agents
--   visitor key  the session id when the client keeps our cookie, else
--                IP+User-Agent — shape signals (scraping, assets)
--   ip+ua key    for cookie persistence, which by definition has no session

local M = {}

local floor = math.floor

local function bucket(prefix, id, window, now)
    return prefix .. id .. ":" .. floor(now / window)
end

local function incr(dict, key, ttl)
    local v = dict:incr(key, 1, 0, ttl)
    return v or 0
end

--- Count this request and return the behaviour signals it raises.
--- @param c table { ip, vk, ipua, uri, is_login, is_navigation, is_asset, has_cookie }
--- @param limits table normalised policy limits
--- @return table list of signal codes
function M.observe(dict, now, c, limits)
    local out = {}

    if incr(dict, bucket("bb:", c.ip, 10, now), 20) > limits.burst_per_10s then
        out[#out + 1] = "BD_BURST"
    end

    -- Distinct URLs per visitor per minute. Paths are remembered only until
    -- the limit is crossed, so a scraper cannot use this to fill the dict.
    local dk = bucket("bd:", c.vk, 60, now)
    local distinct = dict:get(dk) or 0
    if distinct <= limits.distinct_paths_per_min then
        if dict:add(dk .. ":" .. ngx.md5(c.uri):sub(1, 12), true, 70) then
            distinct = incr(dict, dk, 70)
        end
    end
    if distinct > limits.distinct_paths_per_min then out[#out + 1] = "BD_SCRAPING" end

    -- 4xx responses are counted in the log phase (record_response); read the
    -- current minute here.
    if (dict:get(bucket("be:", c.ip, 60, now)) or 0) > limits.errors_per_min then
        out[#out + 1] = "BD_ERROR_STORM"
    end

    if c.is_login and incr(dict, bucket("bl:", c.ip, 300, now), 310) > limits.logins_per_5min then
        out[#out + 1] = "BD_LOGIN_VELOCITY"
    end

    -- A browser sends the cookie back from its second request on. Every
    -- request without it is counted per IP+UA; a client that never keeps it
    -- crosses the limit within a few requests.
    if not c.has_cookie and incr(dict, "bn:" .. c.ipua, 600) > limits.cookieless_requests then
        out[#out + 1] = "BD_NO_COOKIE"
    end

    if c.is_navigation then
        local pages = incr(dict, "bp:" .. c.vk, 600)
        if pages > limits.pages_without_assets and (dict:get("ba:" .. c.vk) or 0) == 0 then
            out[#out + 1] = "BD_NO_ASSETS"
        end
    elseif c.is_asset then
        incr(dict, "ba:" .. c.vk, 600)
    end

    return out
end

local ERROR_STATUS = { [401] = true, [403] = true, [404] = true, [405] = true }

--- Log phase: count the origin's 4xx answers per IP. Bot Defense's own
--- blocks are not counted, so a challenged client is not punished twice.
function M.record_response(dict, now, ip, status)
    if ERROR_STATUS[status] then
        incr(dict, bucket("be:", ip, 60, now), 70)
    end
end

return M
