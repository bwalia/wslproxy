-- Traffic Statistics Module for Dashboard
-- Tracks comprehensive request metrics for the dashboard
-- Uses nginx shared dictionary for cross-worker data sharing
-- Production-ready with proper error handling and race condition protection

local _M = {}

-- Safe require for cjson
local cjson_ok, cjson = pcall(require, "cjson.safe")
if not cjson_ok then
    cjson = {
        encode = function() return nil end,
        decode = function() return nil end
    }
end

local DICT_NAME = "traffic_stats"
local BUCKET_SIZE = 3600  -- 1 hour in seconds
local MAX_BUCKETS = 24    -- Keep last 24 hours of data
local MAX_DOMAINS = 50    -- Max domains to track
local MAX_ERROR_CODES = 20 -- Max error codes to track
local MAX_ERROR_DETAILS = 50 -- Max error details per status code
local ERROR_DETAILS_TTL = 86400 -- 24 hours TTL for error details

-- Get the shared dictionary
local function get_dict()
    local dict = ngx.shared[DICT_NAME]
    if not dict then
        ngx.log(ngx.WARN, "traffic_stats: shared dict '", DICT_NAME, "' not available")
    end
    return dict
end

-- Get the current time bucket key (hourly)
local function get_bucket_key(timestamp)
    timestamp = timestamp or ngx.time()
    local bucket = math.floor(timestamp / BUCKET_SIZE) * BUCKET_SIZE
    return bucket
end

-- Format timestamp to hour label (e.g., "14:00", "15:00")
local function format_hour_label(timestamp)
    local date = os.date("*t", timestamp)
    return string.format("%02d:00", date.hour)
end

-- Format timestamp to datetime label
local function format_datetime_label(timestamp)
    return os.date("%Y-%m-%d %H:%M", timestamp)
end

-- Record error details (URL, timestamp, host) for a specific status code
-- Uses atomic operations with locking to prevent race conditions
local function record_error_detail(dict, status, uri, host, method)
    if not dict or not cjson_ok then
        return false
    end

    local key = "errdetails:" .. tostring(status)
    local lock_key = "lock:" .. key

    -- Try to acquire a simple lock (with 100ms timeout)
    local lock_acquired = false
    for _ = 1, 10 do
        local ok, err = dict:add(lock_key, true, 0.1) -- 100ms TTL
        if ok then
            lock_acquired = true
            break
        end
        ngx.sleep(0.01) -- 10ms sleep between retries
    end

    if not lock_acquired then
        -- Could not acquire lock, skip this error detail (acceptable loss)
        ngx.log(ngx.DEBUG, "traffic_stats: could not acquire lock for ", key)
        return false
    end

    local success = false
    local pcall_ok, pcall_err = pcall(function()
        local existing = dict:get(key)
        local errors = {}

        if existing then
            local decoded = cjson.decode(existing)
            if decoded and type(decoded) == "table" then
                errors = decoded
            end
        end

        -- Create new error entry
        local current_time = ngx.time()
        local new_error = {
            url = uri or "/",
            host = host or "unknown",
            method = method or "GET",
            timestamp = current_time,
            datetime = os.date("%Y-%m-%d %H:%M:%S", current_time)
        }

        -- Add new error at the beginning
        table.insert(errors, 1, new_error)

        -- Keep only the last MAX_ERROR_DETAILS entries
        while #errors > MAX_ERROR_DETAILS do
            table.remove(errors)
        end

        -- Store back with TTL
        local encoded = cjson.encode(errors)
        if encoded then
            local ok, err = dict:set(key, encoded, ERROR_DETAILS_TTL)
            if not ok then
                ngx.log(ngx.WARN, "traffic_stats: failed to set error details: ", err)
            else
                success = true
            end
        end
    end)

    -- Release lock
    dict:delete(lock_key)

    if not pcall_ok then
        ngx.log(ngx.ERR, "traffic_stats: error in record_error_detail: ", pcall_err)
    end

    return success
end

-- Record a request with full details (call from log_by_lua)
function _M.record_request(params)
    local dict = get_dict()
    if not dict then
        return false, "traffic_stats shared dict not available"
    end

    -- Validate and sanitize inputs
    local status = tonumber(params.status) or 0
    local bytes_sent = tonumber(params.bytes_sent) or 0
    local host = tostring(params.host or "unknown"):sub(1, 255) -- Limit host length
    local method = tostring(params.method or "GET"):sub(1, 10) -- Limit method length
    local request_time = tonumber(params.request_time) or 0
    local uri = tostring(params.uri or "/"):sub(1, 2048) -- Limit URI length

    local bucket_key = get_bucket_key()

    -- Basic request counts
    local requests_key = "req:" .. bucket_key
    local success_key = "suc:" .. bucket_key
    local errors_key = "err:" .. bucket_key

    -- Increment total requests (with error handling)
    local ok, err = dict:incr(requests_key, 1, 0)
    if not ok then
        ngx.log(ngx.WARN, "traffic_stats: failed to increment requests: ", err)
    end

    -- Track successful vs error responses
    if status >= 200 and status < 400 then
        dict:incr(success_key, 1, 0)
    elseif status >= 400 then
        dict:incr(errors_key, 1, 0)
    end

    -- Track bandwidth (bytes sent)
    local bandwidth_key = "bw:" .. bucket_key
    dict:incr(bandwidth_key, bytes_sent, 0)

    -- Track total bandwidth (all time counter, resets on restart)
    dict:incr("total_bandwidth", bytes_sent, 0)

    -- Track requests per domain (limit number of domains)
    local domain_count_key = "domain_count"
    local domain_count = dict:get(domain_count_key) or 0
    local domain_key = "dom:" .. host
    local existing_domain = dict:get(domain_key)

    if existing_domain or domain_count < MAX_DOMAINS then
        dict:incr(domain_key, 1, 0)
        if not existing_domain then
            dict:incr(domain_count_key, 1, 0)
        end
        -- Track domain bandwidth
        local domain_bw_key = "dombw:" .. host
        dict:incr(domain_bw_key, bytes_sent, 0)
    end

    -- Track error codes (for 4xx and 5xx)
    if status >= 400 then
        local error_code_key = "errcode:" .. bucket_key .. ":" .. tostring(status)
        dict:incr(error_code_key, 1, 0)

        -- Track total errors by code
        local total_error_key = "errcode_total:" .. tostring(status)
        dict:incr(total_error_key, 1, 0)

        -- Record error details (URL, timestamp, host) - non-blocking
        -- Use ngx.timer to avoid blocking the request
        local timer_ok, timer_err = ngx.timer.at(0, function(premature)
            if premature then return end
            local timer_dict = ngx.shared[DICT_NAME]
            if timer_dict then
                record_error_detail(timer_dict, status, uri, host, method)
            end
        end)

        if not timer_ok then
            -- Fallback to synchronous recording if timer fails
            record_error_detail(dict, status, uri, host, method)
        end
    end

    -- Track response time buckets for latency analysis
    local latency_bucket
    if request_time < 0.1 then
        latency_bucket = "fast"  -- < 100ms
    elseif request_time < 0.5 then
        latency_bucket = "normal"  -- 100-500ms
    elseif request_time < 1 then
        latency_bucket = "slow"  -- 500ms-1s
    else
        latency_bucket = "very_slow"  -- > 1s
    end
    local latency_key = "latency:" .. bucket_key .. ":" .. latency_bucket
    dict:incr(latency_key, 1, 0)

    -- Track request methods
    local method_key = "method:" .. method
    dict:incr(method_key, 1, 0)

    return true
end

-- Clean up old buckets (keep only last MAX_BUCKETS hours)
local function cleanup_old_buckets(dict)
    local current_bucket = get_bucket_key()
    local oldest_valid = current_bucket - (MAX_BUCKETS * BUCKET_SIZE)

    -- Get all keys and remove old ones
    local keys = dict:get_keys(1000)  -- Limit to prevent memory issues
    for _, key in ipairs(keys) do
        -- Check for time-bucketed keys
        local bucket_time = key:match(":(%d+)")
        if bucket_time then
            bucket_time = tonumber(bucket_time)
            if bucket_time and bucket_time < oldest_valid then
                dict:delete(key)
            end
        end
    end
end

-- Get traffic data for the dashboard chart (hourly)
function _M.get_traffic_data()
    local dict = get_dict()
    if not dict then
        return {}, "traffic_stats shared dict not available"
    end

    cleanup_old_buckets(dict)

    local current_time = ngx.time()
    local current_bucket = get_bucket_key(current_time)
    local data = {}

    for i = MAX_BUCKETS - 1, 0, -1 do
        local bucket_time = current_bucket - (i * BUCKET_SIZE)
        local requests_key = "req:" .. bucket_time
        local success_key = "suc:" .. bucket_time
        local errors_key = "err:" .. bucket_time
        local bandwidth_key = "bw:" .. bucket_time

        local requests = dict:get(requests_key) or 0
        local success = dict:get(success_key) or 0
        local errors = dict:get(errors_key) or 0
        local bandwidth = dict:get(bandwidth_key) or 0

        table.insert(data, {
            name = format_hour_label(bucket_time),
            timestamp = bucket_time,
            datetime = format_datetime_label(bucket_time),
            requests = requests,
            responses = success,
            errors = errors,
            bandwidth = bandwidth,
            total_responses = success + errors
        })
    end

    return data
end

-- Get summary statistics
function _M.get_summary()
    local dict = get_dict()
    if not dict then
        return {
            total_requests_24h = 0,
            total_success_24h = 0,
            total_errors_24h = 0,
            total_bandwidth_24h = 0,
            success_rate = 0,
            avg_requests_per_hour = 0
        }, "traffic_stats shared dict not available"
    end

    local current_bucket = get_bucket_key()
    local total_requests = 0
    local total_success = 0
    local total_errors = 0
    local total_bandwidth = 0

    for i = 0, MAX_BUCKETS - 1 do
        local bucket_time = current_bucket - (i * BUCKET_SIZE)
        local requests_key = "req:" .. bucket_time
        local success_key = "suc:" .. bucket_time
        local errors_key = "err:" .. bucket_time
        local bandwidth_key = "bw:" .. bucket_time

        total_requests = total_requests + (dict:get(requests_key) or 0)
        total_success = total_success + (dict:get(success_key) or 0)
        total_errors = total_errors + (dict:get(errors_key) or 0)
        total_bandwidth = total_bandwidth + (dict:get(bandwidth_key) or 0)
    end

    return {
        total_requests_24h = total_requests,
        total_success_24h = total_success,
        total_errors_24h = total_errors,
        total_bandwidth_24h = total_bandwidth,
        success_rate = total_requests > 0 and math.floor((total_success / total_requests) * 100) or 0,
        avg_requests_per_hour = math.floor(total_requests / MAX_BUCKETS)
    }
end

-- Get top domains by request count
function _M.get_top_domains(limit)
    local dict = get_dict()
    if not dict then
        return {}, "traffic_stats shared dict not available"
    end

    limit = limit or 10
    local domains = {}
    local keys = dict:get_keys(1000)

    for _, key in ipairs(keys) do
        local domain = key:match("^dom:(.+)$")
        if domain then
            local count = dict:get(key) or 0
            local bw_key = "dombw:" .. domain
            local bandwidth = dict:get(bw_key) or 0
            table.insert(domains, {
                domain = domain,
                requests = count,
                bandwidth = bandwidth
            })
        end
    end

    -- Sort by request count descending
    table.sort(domains, function(a, b)
        return a.requests > b.requests
    end)

    -- Return top N domains
    local result = {}
    for i = 1, math.min(limit, #domains) do
        result[i] = domains[i]
    end

    return result
end

-- Get all domains with stats
function _M.get_all_domains()
    local dict = get_dict()
    if not dict then
        return {}, 0, "traffic_stats shared dict not available"
    end

    local domains = {}
    local keys = dict:get_keys(1000)

    for _, key in ipairs(keys) do
        local domain = key:match("^dom:(.+)$")
        if domain then
            local count = dict:get(key) or 0
            local bw_key = "dombw:" .. domain
            local bandwidth = dict:get(bw_key) or 0
            table.insert(domains, {
                domain = domain,
                requests = count,
                bandwidth = bandwidth
            })
        end
    end

    -- Sort by request count descending
    table.sort(domains, function(a, b)
        return a.requests > b.requests
    end)

    return domains, #domains
end

-- Get error code breakdown
function _M.get_error_codes()
    local dict = get_dict()
    if not dict then
        return {}, "traffic_stats shared dict not available"
    end

    local error_codes = {}
    local code_counts = {}
    local keys = dict:get_keys(1000)

    -- First try to get from total keys
    for _, key in ipairs(keys) do
        local code = key:match("^errcode_total:(%d+)$")
        if code then
            local count = dict:get(key) or 0
            if count > 0 then
                code_counts[code] = (code_counts[code] or 0) + count
            end
        end
    end

    -- If no totals found, aggregate from hourly buckets
    if next(code_counts) == nil then
        for _, key in ipairs(keys) do
            local bucket, code = key:match("^errcode:(%d+):(%d+)$")
            if bucket and code then
                local count = dict:get(key) or 0
                if count > 0 then
                    code_counts[code] = (code_counts[code] or 0) + count
                end
            end
        end
    end

    -- Convert to array
    for code, count in pairs(code_counts) do
        table.insert(error_codes, {
            code = tonumber(code),
            count = count
        })
    end

    -- Sort by count descending
    table.sort(error_codes, function(a, b)
        return a.count > b.count
    end)

    return error_codes
end

-- Get error codes over time (for chart)
function _M.get_error_timeline()
    local dict = get_dict()
    if not dict then
        return {}, "traffic_stats shared dict not available"
    end

    local current_bucket = get_bucket_key()
    local timeline = {}

    for i = MAX_BUCKETS - 1, 0, -1 do
        local bucket_time = current_bucket - (i * BUCKET_SIZE)
        local hour_data = {
            name = format_hour_label(bucket_time),
            timestamp = bucket_time,
            ["400"] = 0,
            ["401"] = 0,
            ["403"] = 0,
            ["404"] = 0,
            ["500"] = 0,
            ["502"] = 0,
            ["503"] = 0,
            ["504"] = 0,
            other = 0
        }

        -- Get all error codes for this bucket
        local keys = dict:get_keys(1000)
        for _, key in ipairs(keys) do
            local b_time, code = key:match("^errcode:(%d+):(%d+)$")
            if b_time and code and tonumber(b_time) == bucket_time then
                local count = dict:get(key) or 0
                if hour_data[code] then
                    hour_data[code] = count
                else
                    hour_data.other = hour_data.other + count
                end
            end
        end

        table.insert(timeline, hour_data)
    end

    return timeline
end

-- Get latency distribution
function _M.get_latency_distribution()
    local dict = get_dict()
    if not dict then
        return {
            fast = 0,
            normal = 0,
            slow = 0,
            very_slow = 0
        }, "traffic_stats shared dict not available"
    end

    local current_bucket = get_bucket_key()
    local distribution = {
        fast = 0,      -- < 100ms
        normal = 0,    -- 100-500ms
        slow = 0,      -- 500ms-1s
        very_slow = 0  -- > 1s
    }

    for i = 0, MAX_BUCKETS - 1 do
        local bucket_time = current_bucket - (i * BUCKET_SIZE)
        for _, bucket_name in ipairs({"fast", "normal", "slow", "very_slow"}) do
            local key = "latency:" .. bucket_time .. ":" .. bucket_name
            distribution[bucket_name] = distribution[bucket_name] + (dict:get(key) or 0)
        end
    end

    return distribution
end

-- Get request methods distribution
function _M.get_methods_distribution()
    local dict = get_dict()
    if not dict then
        return {}, "traffic_stats shared dict not available"
    end

    local methods = {}
    local keys = dict:get_keys(1000)

    for _, key in ipairs(keys) do
        local method = key:match("^method:(.+)$")
        if method then
            methods[method] = dict:get(key) or 0
        end
    end

    return methods
end

-- Get current hour stats
function _M.get_current_hour_stats()
    local dict = get_dict()
    if not dict then
        return {
            requests = 0,
            success = 0,
            errors = 0,
            bandwidth = 0,
            hour = "00:00"
        }, "traffic_stats shared dict not available"
    end

    local current_bucket = get_bucket_key()
    local requests_key = "req:" .. current_bucket
    local success_key = "suc:" .. current_bucket
    local errors_key = "err:" .. current_bucket
    local bandwidth_key = "bw:" .. current_bucket

    return {
        requests = dict:get(requests_key) or 0,
        success = dict:get(success_key) or 0,
        errors = dict:get(errors_key) or 0,
        bandwidth = dict:get(bandwidth_key) or 0,
        hour = format_hour_label(current_bucket)
    }
end

-- Get error details for a specific status code
function _M.get_error_details(status_code)
    local dict = get_dict()
    if not dict then
        return {}, "traffic_stats shared dict not available"
    end

    if not cjson_ok then
        return {}, "cjson module not available"
    end

    -- Validate status_code
    status_code = tonumber(status_code)
    if not status_code or status_code < 400 or status_code > 599 then
        return {}, "invalid status code"
    end

    local key = "errdetails:" .. tostring(status_code)
    local existing = dict:get(key)

    if existing then
        local errors = cjson.decode(existing)
        if errors and type(errors) == "table" then
            return errors
        end
    end

    return {}
end

-- Get all error details (for all status codes)
function _M.get_all_error_details()
    local dict = get_dict()
    if not dict then
        return {}, "traffic_stats shared dict not available"
    end

    if not cjson_ok then
        return {}, "cjson module not available"
    end

    local all_details = {}
    local keys = dict:get_keys(1000)

    for _, key in ipairs(keys) do
        local code = key:match("^errdetails:(%d+)$")
        if code then
            local existing = dict:get(key)
            if existing then
                local errors = cjson.decode(existing)
                if errors and type(errors) == "table" then
                    all_details[tonumber(code)] = errors
                end
            end
        end
    end

    return all_details
end

-- Debug function to check what keys exist in the shared dict
function _M.debug_keys()
    local dict = get_dict()
    if not dict then
        return {}, "traffic_stats shared dict not available"
    end

    local keys = dict:get_keys(100)
    local result = {}
    for _, key in ipairs(keys) do
        table.insert(result, {
            key = key,
            value_type = type(dict:get(key))
        })
    end
    return result
end

-- Get comprehensive dashboard data (all in one call)
function _M.get_dashboard_data()
    return {
        chart_data = _M.get_traffic_data(),
        summary = _M.get_summary(),
        top_domains = _M.get_top_domains(10),
        error_codes = _M.get_error_codes(),
        error_timeline = _M.get_error_timeline(),
        latency = _M.get_latency_distribution(),
        methods = _M.get_methods_distribution(),
        current_hour = _M.get_current_hour_stats()
    }
end

return _M
