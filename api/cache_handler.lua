-- Cache Handler Module for WSL Proxy
-- Implements static content caching using nginx shared dictionary
-- Called during access/header_filter/body_filter phases

local _M = {}

local cjson = require("cjson")

-- Shared dictionaries for caching (configured in nginx.conf)
local cache_dict_name = "wsl_cache"
local cache_keys_dict_name = "wsl_cache_keys"

-- Default MIME types to cache (used when config doesn't specify)
local DEFAULT_CACHED_MIME_TYPES = {
    "text/css",
    "text/javascript",
    "application/javascript",
    "application/x-javascript",
    "application/json",
    "application/xml",
    "text/xml",
    "text/plain",
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
    "image/x-icon",
    "image/vnd.microsoft.icon",
    "font/woff",
    "font/woff2",
    "application/font-woff",
    "application/font-woff2",
    "font/ttf",
    "font/otf",
    "application/x-font-ttf",
    "application/x-font-otf",
    "application/pdf",
    "audio/mpeg",
    "video/mp4",
    "video/webm",
}

-- Get Prometheus metrics module (may not be available)
local function get_metrics()
    local ok, metrics = pcall(require, "prometheus_metrics")
    if ok and metrics and metrics.is_initialized() then
        return metrics
    end
    return nil
end

-- Record cache hit metric
local function record_cache_hit(host, extension)
    local metrics = get_metrics()
    if metrics then
        local metric = metrics.get_metric_cache_hits()
        if metric then
            metric:inc(1, {host, extension or "unknown"})
        end
    end
end

-- Record cache miss metric
local function record_cache_miss(host, extension)
    local metrics = get_metrics()
    if metrics then
        local metric = metrics.get_metric_cache_misses()
        if metric then
            metric:inc(1, {host, extension or "unknown"})
        end
    end
end

-- Record cache bypass metric
local function record_cache_bypass(host, reason)
    local metrics = get_metrics()
    if metrics then
        local metric = metrics.get_metric_cache_bypasses()
        if metric then
            metric:inc(1, {host, reason or "unknown"})
        end
    end
end

-- Record cache store metric
local function record_cache_store(host, extension, content_type)
    local metrics = get_metrics()
    if metrics then
        local metric = metrics.get_metric_cache_stores()
        if metric then
            metric:inc(1, {host, extension or "unknown", content_type or "unknown"})
        end
    end
end

-- Update cache enabled gauge
local function update_cache_enabled_metric(host, enabled)
    local metrics = get_metrics()
    if metrics then
        local metric = metrics.get_metric_cache_enabled()
        if metric then
            metric:set(enabled and 1 or 0, {host})
        end
    end
end

-- Get shared dictionary with fallback
local function get_cache_dict()
    local dict = ngx.shared[cache_dict_name]
    if not dict then
        ngx.log(ngx.WARN, "Cache Handler: Shared dictionary '", cache_dict_name, "' not configured")
    end
    return dict
end

local function get_cache_keys_dict()
    local dict = ngx.shared[cache_keys_dict_name]
    if not dict then
        ngx.log(ngx.WARN, "Cache Handler: Shared dictionary '", cache_keys_dict_name, "' not configured")
    end
    return dict
end

-- Generate cache key from request
local function generate_cache_key(server_name)
    local uri = ngx.var.uri or ""
    local args = ngx.var.args or ""
    
    -- Include query string in cache key for more accurate caching
    local key = server_name .. ":" .. uri
    if args and args ~= "" then
        key = key .. "?" .. args
    end
    
    return key
end

-- Check if request should bypass cache
local function should_bypass_cache(config)
    -- Don't cache POST, PUT, DELETE, etc.
    local method = ngx.req.get_method()
    if method ~= "GET" and method ~= "HEAD" then
        return true, "non-GET method"
    end
    
    -- Check for cache bypass cookie
    if config.cache_bypass_cookie and config.cache_bypass_cookie ~= "" then
        local cookies = ngx.var["cookie_" .. config.cache_bypass_cookie]
        if cookies then
            return true, "bypass cookie present"
        end
    end
    
    -- Check for cache bypass header
    if config.cache_bypass_header and config.cache_bypass_header ~= "" then
        local header = ngx.req.get_headers()[config.cache_bypass_header]
        if header then
            return true, "bypass header present"
        end
    end
    
    -- Check for Cache-Control: no-cache
    local cache_control = ngx.req.get_headers()["Cache-Control"]
    if cache_control and (cache_control:find("no-cache") or cache_control:find("no-store")) then
        return true, "Cache-Control: no-cache/no-store"
    end
    
    -- Check for Authorization header (authenticated requests shouldn't be cached)
    if ngx.req.get_headers()["Authorization"] then
        return true, "Authorization header present"
    end
    
    return false, nil
end

-- Get file extension from URI
local function get_extension(uri)
    local ext = uri:match("%.([^%.?]+)%??")
    if ext then
        return ext:lower()
    end
    return nil
end

-- ============================================================
-- Main Cache Functions
-- ============================================================

-- Check if we have a cached response (access phase)
function _M.check_cache(server_name, config)
    -- Store extension for later use in headers
    local uri = ngx.var.uri or ""
    local ext = get_extension(uri)
    ngx.ctx.cache_extension = ext
    ngx.ctx.cache_server_name = server_name
    
    if not server_name or not config or not config.cache_enabled then
        ngx.ctx.cache_status = "DISABLED"
        ngx.ctx.cache_status_detail = "caching not enabled for this server"
        return false
    end
    
    -- Update Prometheus metric for cache enabled status
    update_cache_enabled_metric(server_name, true)
    
    -- Check for bypass conditions
    local bypass, reason = should_bypass_cache(config)
    if bypass then
        ngx.ctx.cache_bypass = true
        ngx.ctx.cache_bypass_reason = reason
        ngx.ctx.cache_status = "BYPASS"
        ngx.ctx.cache_status_detail = reason
        record_cache_bypass(server_name, reason)
        return false
    end
    
    if not ext then
        ngx.ctx.cache_bypass = true
        ngx.ctx.cache_bypass_reason = "no file extension"
        ngx.ctx.cache_status = "BYPASS"
        ngx.ctx.cache_status_detail = "no file extension detected"
        record_cache_bypass(server_name, "no_extension")
        return false
    end
    
    -- Check if extension is cacheable
    local cached_extensions = config.cached_extensions or {}
    local should_cache = false
    for _, cached_ext in ipairs(cached_extensions) do
        if cached_ext == ext then
            should_cache = true
            break
        end
    end
    
    if not should_cache then
        ngx.ctx.cache_bypass = true
        ngx.ctx.cache_bypass_reason = "extension not cacheable: " .. ext
        ngx.ctx.cache_status = "BYPASS"
        ngx.ctx.cache_status_detail = "extension ." .. ext .. " not in cacheable list"
        record_cache_bypass(server_name, "extension_not_cacheable")
        return false
    end
    
    -- Mark that we should try to cache this response
    ngx.ctx.should_cache = true
    ngx.ctx.cache_config = config
    
    -- Try to get from cache
    local cache_dict = get_cache_dict()
    if not cache_dict then
        ngx.ctx.cache_status = "ERROR"
        ngx.ctx.cache_status_detail = "cache dictionary not available"
        return false
    end
    
    local cache_key = generate_cache_key(server_name)
    ngx.ctx.cache_key = cache_key
    
    local cached_data = cache_dict:get(cache_key)
    if not cached_data then
        ngx.ctx.cache_miss = true
        ngx.ctx.cache_status = "MISS"
        ngx.ctx.cache_status_detail = "not found in cache, will cache response"
        record_cache_miss(server_name, ext)
        return false
    end
    
    -- Parse cached response
    local ok, cached = pcall(cjson.decode, cached_data)
    if not ok or not cached then
        ngx.log(ngx.WARN, "Cache Handler: Failed to decode cached data for key: ", cache_key)
        cache_dict:delete(cache_key)
        ngx.ctx.cache_status = "ERROR"
        ngx.ctx.cache_status_detail = "failed to decode cached data"
        return false
    end
    
    -- Serve from cache!
    ngx.ctx.cache_hit = true
    ngx.ctx.cache_status = "HIT"
    ngx.ctx.cache_status_detail = "served from cache"
    
    -- Record cache hit metric
    record_cache_hit(server_name, ext)
    
    -- Add detailed cache headers
    ngx.header["X-WSL-Cache"] = "HIT"
    ngx.header["X-WSL-Cache-Status"] = "HIT"
    ngx.header["X-WSL-Cache-Key"] = cache_key
    ngx.header["X-WSL-Cache-Server"] = server_name
    ngx.header["X-WSL-Cache-Extension"] = ext or "none"
    if cached.cached_at then
        local age = math.floor(ngx.now() - cached.cached_at)
        ngx.header["X-WSL-Cache-Age"] = tostring(age) .. "s"
    end
    
    -- Restore headers
    if cached.headers then
        for name, value in pairs(cached.headers) do
            -- Don't override certain headers
            if name ~= "transfer-encoding" and name ~= "connection" then
                ngx.header[name] = value
            end
        end
    end
    
    ngx.status = cached.status or 200
    ngx.say(cached.body or "")
    
    ngx.log(ngx.INFO, "Cache Handler: Served from cache: ", cache_key)
    
    return true  -- Request was served from cache
end

-- Store response in cache (header_filter phase)
function _M.process_response_headers()
    -- Skip if this was already a cache HIT (headers already set in check_cache)
    if ngx.ctx.cache_hit then
        return
    end
    
    -- Always add cache status headers for debugging
    local cache_status = ngx.ctx.cache_status or "NONE"
    local cache_detail = ngx.ctx.cache_status_detail or ""
    local server_name = ngx.ctx.cache_server_name or ngx.var.host:gsub("^www%.", "")
    local ext = ngx.ctx.cache_extension or "none"
    
    ngx.header["X-WSL-Cache"] = cache_status
    ngx.header["X-WSL-Cache-Status"] = cache_status
    ngx.header["X-WSL-Cache-Detail"] = cache_detail
    ngx.header["X-WSL-Cache-Server"] = server_name
    ngx.header["X-WSL-Cache-Extension"] = ext
    
    if not ngx.ctx.should_cache then
        return
    end
    
    if ngx.ctx.cache_bypass then
        return
    end
    
    -- Only cache successful responses
    local status = ngx.status
    local config = ngx.ctx.cache_config or {}
    local valid_codes = config.cache_valid_codes or { 200, 301, 302 }
    
    local should_cache_status = false
    for _, code in ipairs(valid_codes) do
        if status == code then
            should_cache_status = true
            break
        end
    end
    
    if not should_cache_status then
        ngx.ctx.should_cache = false
        ngx.ctx.cache_bypass = true
        ngx.ctx.cache_bypass_reason = "status code: " .. status
        return
    end
    
    -- Check Content-Type
    local content_type = ngx.header["Content-Type"]
    if content_type then
        local cached_mime_types = config.cached_mime_types
        -- Use defaults if config doesn't specify MIME types
        if not cached_mime_types or #cached_mime_types == 0 then
            cached_mime_types = DEFAULT_CACHED_MIME_TYPES
        end
        local mime_cacheable = false
        
        for _, mt in ipairs(cached_mime_types) do
            if content_type:find(mt, 1, true) then
                mime_cacheable = true
                break
            end
        end
        
        if not mime_cacheable then
            ngx.ctx.should_cache = false
            ngx.ctx.cache_bypass = true
            ngx.ctx.cache_bypass_reason = "content-type not cacheable: " .. content_type
            return
        end
    end
    
    -- Store headers for caching
    ngx.ctx.cache_headers = {}
    local headers_to_cache = {
        "Content-Type", "Content-Length", "Last-Modified", 
        "ETag", "Cache-Control", "Expires", "Content-Encoding"
    }
    
    for _, header_name in ipairs(headers_to_cache) do
        local value = ngx.header[header_name]
        if value then
            ngx.ctx.cache_headers[header_name:lower()] = value
        end
    end
    
    -- Initialize body collector
    ngx.ctx.cache_body_chunks = {}
end

-- Collect response body (body_filter phase)
function _M.collect_response_body()
    -- Skip if this was a cache HIT (already served from cache)
    if ngx.ctx.cache_hit then
        return
    end
    
    if not ngx.ctx.should_cache then
        return
    end
    
    if ngx.ctx.cache_bypass then
        return
    end
    
    -- Ensure cache_body_chunks is initialized
    if not ngx.ctx.cache_body_chunks then
        ngx.ctx.cache_body_chunks = {}
    end
    
    local chunk = ngx.arg[1]
    local eof = ngx.arg[2]
    
    if chunk and chunk ~= "" then
        table.insert(ngx.ctx.cache_body_chunks, chunk)
    end
    
    if eof then
        -- Store in cache
        _M.store_in_cache()
    end
end

-- Store collected response in cache
function _M.store_in_cache()
    if not ngx.ctx.should_cache then
        return
    end
    
    local cache_dict = get_cache_dict()
    if not cache_dict then
        return
    end
    
    local cache_key = ngx.ctx.cache_key
    if not cache_key then
        return
    end
    
    local config = ngx.ctx.cache_config or {}
    local ttl = config.cache_ttl or 3600
    
    -- Combine body chunks
    local body = table.concat(ngx.ctx.cache_body_chunks or {})
    
    -- Don't cache empty responses
    if not body or body == "" then
        return
    end
    
    -- Don't cache very large responses (>5MB by default)
    local max_cache_item_size = 5 * 1024 * 1024
    if #body > max_cache_item_size then
        ngx.log(ngx.INFO, "Cache Handler: Response too large to cache: ", #body, " bytes")
        return
    end
    
    -- Prepare cache entry
    local cache_entry = {
        status = ngx.status,
        headers = ngx.ctx.cache_headers,
        body = body,
        cached_at = ngx.now(),
        server_name = ngx.ctx.cache_server_name
    }
    
    local ok, json = pcall(cjson.encode, cache_entry)
    if not ok then
        ngx.log(ngx.WARN, "Cache Handler: Failed to encode cache entry: ", tostring(json))
        return
    end
    
    -- Store in shared dictionary
    local success, err, forcible = cache_dict:set(cache_key, json, ttl)
    if not success then
        ngx.log(ngx.WARN, "Cache Handler: Failed to store in cache: ", tostring(err))
        return
    end
    
    if forcible then
        ngx.log(ngx.INFO, "Cache Handler: Cache eviction occurred for: ", cache_key)
    end
    
    -- Record cache store metric
    local content_type = ngx.ctx.cache_headers and ngx.ctx.cache_headers["content-type"] or "unknown"
    record_cache_store(ngx.ctx.cache_server_name, ngx.ctx.cache_extension, content_type)
    
    -- Store key reference for cache management
    local cache_keys_dict = get_cache_keys_dict()
    if cache_keys_dict then
        local server_keys_key = ngx.ctx.cache_server_name .. ":keys"
        local existing_keys = cache_keys_dict:get(server_keys_key) or ""
        if not existing_keys:find(cache_key, 1, true) then
            cache_keys_dict:set(server_keys_key, existing_keys .. cache_key .. "\n", 0)  -- Never expire
        end
    end
    
    ngx.log(ngx.INFO, "Cache Handler: Stored in cache: ", cache_key, " (TTL: ", ttl, "s)")
end

-- ============================================================
-- Cache Management Functions
-- ============================================================

-- Clear cache for a specific server
function _M.clear_cache(server_name)
    if not server_name then
        return false, "Server name required"
    end
    
    local cache_dict = get_cache_dict()
    local cache_keys_dict = get_cache_keys_dict()
    
    if not cache_dict then
        return false, "Cache dictionary not available"
    end
    
    local cleared_count = 0
    
    -- If we have a keys dictionary, use it to find keys to delete
    if cache_keys_dict then
        local server_keys_key = server_name .. ":keys"
        local keys_str = cache_keys_dict:get(server_keys_key)
        
        if keys_str then
            for key in keys_str:gmatch("[^\n]+") do
                if key ~= "" then
                    cache_dict:delete(key)
                    cleared_count = cleared_count + 1
                end
            end
            cache_keys_dict:delete(server_keys_key)
        end
    else
        -- Fallback: iterate through all keys (less efficient)
        local keys = cache_dict:get_keys(0)  -- 0 = all keys
        for _, key in ipairs(keys or {}) do
            if key:find(server_name .. ":", 1, true) == 1 then
                cache_dict:delete(key)
                cleared_count = cleared_count + 1
            end
        end
    end
    
    ngx.log(ngx.INFO, "Cache Handler: Cleared ", cleared_count, " cache entries for ", server_name)
    return true, "Cleared " .. cleared_count .. " entries"
end

-- Clear all cache
function _M.clear_all_cache()
    local cache_dict = get_cache_dict()
    local cache_keys_dict = get_cache_keys_dict()
    
    if not cache_dict then
        return false, "Cache dictionary not available"
    end
    
    cache_dict:flush_all()
    
    if cache_keys_dict then
        cache_keys_dict:flush_all()
    end
    
    ngx.log(ngx.INFO, "Cache Handler: Cleared all cache entries")
    return true, "All cache cleared"
end

-- Get cache statistics
function _M.get_cache_stats()
    local cache_dict = get_cache_dict()
    
    if not cache_dict then
        return nil, "Cache dictionary not available"
    end
    
    return {
        capacity = cache_dict:capacity() or 0,
        free_space = cache_dict:free_space() or 0,
        keys_count = #(cache_dict:get_keys(0) or {})
    }
end

-- Get cache statistics for a specific server
function _M.get_server_cache_stats(server_name)
    if not server_name then
        return nil, "Server name required"
    end
    
    local cache_dict = get_cache_dict()
    if not cache_dict then
        return nil, "Cache dictionary not available"
    end
    
    local count = 0
    local total_size = 0
    local keys = cache_dict:get_keys(0)
    
    for _, key in ipairs(keys or {}) do
        if key:find(server_name .. ":", 1, true) == 1 then
            count = count + 1
            local value = cache_dict:get(key)
            if value then
                total_size = total_size + #value
            end
        end
    end
    
    return {
        server_name = server_name,
        cached_items = count,
        total_size_bytes = total_size
    }
end

return _M
