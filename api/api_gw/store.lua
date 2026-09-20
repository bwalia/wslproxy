-- api/api_gw/store.lua
-- Shared-dict access and window counters for the api_gw package.
--
-- Every counter here is fail-open on infra failure: a missing `wsl_api_gw`
-- dict, a full dict, or an incr error returns `nil, err` and the calling
-- module lets the request through.  A missing shared dict is an operator
-- misconfiguration, not an attack signal — failing closed would turn a
-- forgotten nginx directive into a total outage for every tenant at once.
--
-- Two algorithms:
--   fixed   — one bucket per window.  Cheapest, but allows up to 2x the limit
--             across a window boundary.
--   sliding — current bucket plus a time-weighted share of the previous one.
--             Still O(1) and two dict ops, and smooths the boundary burst.
--             This is the default.

local M = {}

-- Preferred dict, then the fallback the rest of WSLProxy already declares.
-- Probing once per worker keeps the hot path to a table lookup.
local DICT_NAMES = { "wsl_api_gw", "wsl_cache" }

local _dict, _dict_name, _probed

--- The shared dict api_gw counters live in, or nil when none is declared.
--- @return table|nil dict
--- @return string|nil name
function M.dict()
    if _probed then return _dict, _dict_name end
    _probed = true
    if not ngx or not ngx.shared then return nil, nil end
    for _, name in ipairs(DICT_NAMES) do
        local d = ngx.shared[name]
        if d then
            _dict, _dict_name = d, name
            if name ~= DICT_NAMES[1] then
                ngx.log(ngx.WARN, "[api_gw] lua_shared_dict ", DICT_NAMES[1],
                    " is not declared; falling back to ", name,
                    " — add it to the nginx template to keep gateway counters off the cache dict")
            end
            return _dict, _dict_name
        end
    end
    ngx.log(ngx.ERR, "[api_gw] no shared dict available (wsl_api_gw / wsl_cache) — ",
        "rate limiting and burst guards are disabled (fail-open)")
    return nil, nil
end

--- Drop the cached dict handle.  Tests use this after swapping the ngx stub.
function M.reset()
    _dict, _dict_name, _probed = nil, nil, false
end

local function now()
    if ngx and ngx.now then return ngx.now() end
    return os.time()
end

--- Fixed-window counter.
---
--- @param key    string  tenant-scoped key from api_gw.keys
--- @param window number  window length in seconds
--- @return number|nil count  requests in this window including the current one
--- @return number|nil reset  epoch seconds when the window rolls over
--- @return string|nil err    set only on infra failure (caller fails open)
function M.incr_fixed(key, window)
    local dict = M.dict()
    if not dict then return nil, nil, "no shared dict" end
    window = tonumber(window) or 60
    if window <= 0 then window = 60 end

    local t = now()
    local bucket = math.floor(t / window)
    local bkey = key .. ":" .. bucket
    -- TTL of one extra window so the bucket survives long enough to be read
    -- as the "previous" bucket by the sliding estimator.
    local count, err = dict:incr(bkey, 1, 0, window * 2)
    if not count then
        return nil, nil, tostring(err)
    end
    return count, (bucket + 1) * window, nil
end

--- Sliding-window counter (two-bucket weighted approximation).
---
--- @param key    string
--- @param window number  window length in seconds
--- @return number|nil estimate  weighted request count, rounded up
--- @return number|nil reset     epoch seconds when the current bucket rolls over
--- @return string|nil err
function M.incr_sliding(key, window)
    local dict = M.dict()
    if not dict then return nil, nil, "no shared dict" end
    window = tonumber(window) or 60
    if window <= 0 then window = 60 end

    local t = now()
    local bucket = math.floor(t / window)
    local cur_key = key .. ":" .. bucket
    local prev_key = key .. ":" .. (bucket - 1)

    local cur, err = dict:incr(cur_key, 1, 0, window * 2)
    if not cur then
        return nil, nil, tostring(err)
    end

    local prev = dict:get(prev_key)
    prev = tonumber(prev) or 0

    -- Fraction of the previous window still inside the sliding view.
    local elapsed = t - (bucket * window)
    local weight = 1 - (elapsed / window)
    if weight < 0 then weight = 0 end

    local estimate = math.ceil(cur + (prev * weight))
    return estimate, (bucket + 1) * window, nil
end

--- Increment using the named algorithm ("sliding" | "fixed").
function M.incr(key, window, algorithm)
    if algorithm == "fixed" then
        return M.incr_fixed(key, window)
    end
    return M.incr_sliding(key, window)
end

return M
