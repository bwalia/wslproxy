-- Plain Lua tests for the parsers in api/memory_metrics.lua.
-- Run: lua test/memory/test_memory_metrics.lua   (luajit works too)

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local failures = 0
local function assert_eq(a, b, msg)
    if a ~= b then
        failures = failures + 1
        io.stderr:write("FAIL: " .. (msg or "") .. " expected " .. tostring(b) .. " got " .. tostring(a) .. "\n")
    end
end

local M = require("memory_metrics")

-- /proc/self/status excerpt from a lon1 worker (2026-11-25).
local status = table.concat({
    "Name:\tnginx",
    "VmPeak:\t  670936 kB",
    "VmRSS:\t  170580 kB",
    "RssAnon:\t   70572 kB",
    "RssFile:\t    9692 kB",
    "RssShmem:\t   90340 kB",
    "VmSwap:\t       0 kB",
    "Threads:\t1",
}, "\n")
local st = M.parse_kb_fields(status)
assert_eq(st.VmRSS, 170580 * 1024, "VmRSS")
assert_eq(st.RssAnon, 70572 * 1024, "RssAnon")
assert_eq(st.RssShmem, 90340 * 1024, "RssShmem")
assert_eq(st.VmSwap, 0, "VmSwap")
assert_eq(st.Threads, nil, "fields without kB are ignored")

local meminfo = "MemTotal:        3966336 kB\nMemAvailable:    2885632 kB\nSwapTotal:       2097148 kB\nSwapFree:        2096124 kB\nHugePages_Total:       0\n"
local mem = M.parse_kb_fields(meminfo)
assert_eq(mem.SwapTotal - mem.SwapFree, 1024 * 1024, "swap used")
assert_eq(mem.MemAvailable, 2885632 * 1024, "MemAvailable")

assert_eq(next(M.parse_kb_fields(nil)), nil, "nil input gives empty table")

local cmdlines = {
    "nginx: worker process\0",
    "nginx: worker process is shutting down\0",
    "nginx: worker process is shutting down\0",
    "nginx: cache manager process\0",
    "",
}
assert_eq(M.count_shutting_down(cmdlines), 2, "two draining workers")
assert_eq(M.count_shutting_down({}), 0, "none")
assert_eq(M.count_shutting_down(nil), 0, "nil list")

if failures > 0 then
    io.stderr:write(failures .. " failure(s)\n")
    os.exit(1)
end
print("memory_metrics: all tests passed")
