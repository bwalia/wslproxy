-- memory_metrics.lua
-- Per-worker memory gauges for Prometheus, so a Lua heap leak or a pile-up of
-- worker generations shows on a graph before the kernel OOM-kills OpenResty
-- (lon1, 2026-11-25: docs/runbooks/edge-memory.md).
--
--   wslproxy_worker_lua_heap_bytes{worker}     collectgarbage("count")
--   wslproxy_worker_rss_bytes{worker}          VmRSS  (/proc/self/status)
--   wslproxy_worker_rss_anon_bytes{worker}     RssAnon: private memory, i.e.
--                                              Lua heap + C allocations. RSS
--                                              also counts shared-dict pages
--                                              the worker touched.
--   wslproxy_shdict_capacity_bytes{dict}       ngx.shared.DICT:capacity()
--   wslproxy_shdict_free_bytes{dict}           ngx.shared.DICT:free_space()
--   wslproxy_nginx_workers_shutting_down       old-generation workers still
--                                              draining after a reload
--   wslproxy_host_swap_used_bytes              SwapTotal - SwapFree
--   wslproxy_host_mem_available_bytes          MemAvailable
--
-- Every worker samples its own heap and RSS on a timer (a /metrics scrape is
-- served by one worker, so it cannot see the others). Worker 0 also samples
-- the shared dicts, the host and the draining workers. A worker that is
-- shutting down stops sampling, so a new generation's worker N overwrites
-- worker N's series.
--
-- The parsers are pure Lua (test/memory/test_memory_metrics.lua).

local _M = {}

local INTERVAL = 15 -- seconds

local gauges

local function read_file(path)
    local f = io.open(path, "rb")
    if not f then
        return nil
    end
    local s = f:read("*a")
    f:close()
    return s
end

--- Parse "Key:   123 kB" lines (/proc/<pid>/status, /proc/meminfo).
--- @return table key -> bytes
function _M.parse_kb_fields(text)
    local out = {}
    if type(text) ~= "string" then
        return out
    end
    for key, kb in text:gmatch("([%w_%(%)]+):%s+(%d+) kB") do
        out[key] = tonumber(kb) * 1024
    end
    return out
end

--- Count draining workers among the master's children, given their
--- cmdlines. nginx renames a worker to "nginx: worker process is shutting
--- down" once it has been told to exit gracefully.
function _M.count_shutting_down(cmdlines)
    local n = 0
    for _, c in ipairs(cmdlines or {}) do
        -- /proc/<pid>/cmdline is NUL-separated.
        c = c:gsub("%z", " ")
        if c:find("worker process is shutting down", 1, true) then
            n = n + 1
        end
    end
    return n
end

local function master_children(master_pid)
    local s = read_file("/proc/" .. master_pid .. "/task/" .. master_pid .. "/children")
    if not s then
        return nil
    end
    local pids = {}
    for pid in s:gmatch("%d+") do
        pids[#pids + 1] = pid
    end
    return pids
end

local function sample_shared()
    local g = gauges
    for name, dict in pairs(ngx.shared) do
        if type(dict) == "table" and dict.capacity then
            local okc, cap = pcall(dict.capacity, dict)
            local okf, free = pcall(dict.free_space, dict)
            if okc and cap then
                g.shdict_capacity:set(cap, { name })
            end
            if okf and free then
                g.shdict_free:set(free, { name })
            end
        end
    end

    local mem = _M.parse_kb_fields(read_file("/proc/meminfo"))
    if mem.SwapTotal and mem.SwapFree then
        g.swap_used:set(mem.SwapTotal - mem.SwapFree)
    end
    if mem.MemAvailable then
        g.mem_available:set(mem.MemAvailable)
    end

    local okp, process = pcall(require, "ngx.process")
    local master = okp and process.get_master_pid and process.get_master_pid()
    if master then
        local pids = master_children(master)
        if pids then
            local cmdlines = {}
            for _, pid in ipairs(pids) do
                cmdlines[#cmdlines + 1] = read_file("/proc/" .. pid .. "/cmdline") or ""
            end
            g.draining:set(_M.count_shutting_down(cmdlines))
        end
    end
end

local function sample(premature)
    if premature or ngx.worker.exiting() or not gauges then
        return
    end
    local worker = tostring(ngx.worker.id() or 0)
    local g = gauges
    g.lua_heap:set(collectgarbage("count") * 1024, { worker })
    local st = _M.parse_kb_fields(read_file("/proc/self/status"))
    if st.VmRSS then
        g.rss:set(st.VmRSS, { worker })
    end
    if st.RssAnon then
        g.rss_anon:set(st.RssAnon, { worker })
    end
    if ngx.worker.id() == 0 then
        local ok, err = pcall(sample_shared)
        if not ok then
            ngx.log(ngx.WARN, "memory_metrics: shared sample failed: ", tostring(err))
        end
    end
end

--- Register the gauges and start the per-worker timer. Call once per worker
--- from init_worker (prometheus_metrics.init does).
function _M.init(prometheus)
    if gauges or not prometheus then
        return
    end
    gauges = {
        lua_heap = prometheus:gauge("wslproxy_worker_lua_heap_bytes",
            "Lua heap of one nginx worker (collectgarbage count)", { "worker" }),
        rss = prometheus:gauge("wslproxy_worker_rss_bytes",
            "Resident set size of one nginx worker (VmRSS)", { "worker" }),
        rss_anon = prometheus:gauge("wslproxy_worker_rss_anon_bytes",
            "Private (anonymous) resident memory of one nginx worker (RssAnon)", { "worker" }),
        shdict_capacity = prometheus:gauge("wslproxy_shdict_capacity_bytes",
            "lua_shared_dict size", { "dict" }),
        shdict_free = prometheus:gauge("wslproxy_shdict_free_bytes",
            "lua_shared_dict free pages (free_space)", { "dict" }),
        draining = prometheus:gauge("wslproxy_nginx_workers_shutting_down",
            "Old-generation nginx workers still draining after a reload"),
        swap_used = prometheus:gauge("wslproxy_host_swap_used_bytes",
            "Swap in use on the host (SwapTotal - SwapFree)"),
        mem_available = prometheus:gauge("wslproxy_host_mem_available_bytes",
            "MemAvailable on the host"),
    }
    -- First sample soon after start, then every INTERVAL.
    ngx.timer.at(1, sample)
    local ok, err = ngx.timer.every(INTERVAL, sample)
    if not ok then
        ngx.log(ngx.ERR, "memory_metrics: failed to start timer: ", tostring(err))
    end
end

return _M
