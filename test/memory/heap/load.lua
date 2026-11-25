-- Load generator for the heap harness (run with `resty`). Replays edge-like
-- traffic: 440 configured hosts, scanners sending random Host headers, a large
-- pool of client IPs, a few junk methods. Prints per-worker heap after a full
-- GC every STEP requests:  <requests> <series> <worker0 KB> <worker1 KB>
local TOTAL = tonumber(arg and arg[1]) or 200000
local STEP = tonumber(arg and arg[2]) or 20000
local THREADS = 32

math.randomseed(42)
local hosts = {}
for i = 1, 440 do hosts[i] = "site" .. i .. ".example.test" end
local methods = { "GET", "GET", "GET", "GET", "POST", "HEAD", "PUT", "OPTIONS" }
local junk = { "PROPFIND", "TRACE", "XYZ", "SEARCH", "MKCOL" }

local function rnd_ip()
    return string.format("%d.%d.%d.%d", math.random(1, 223), math.random(0, 255),
        math.random(0, 255), math.random(1, 254))
end

local function one(sock)
    local host, configured
    if math.random() < 0.7 then
        host, configured = hosts[math.random(#hosts)], "1"
    else
        host, configured = "scan" .. math.random(1, 1e9) .. ".invalid", "0"
    end
    local m = math.random() < 0.03 and junk[math.random(#junk)] or methods[math.random(#methods)]
    local path = (math.random() < 0.5) and "/" or ("/p" .. math.random(1, 1e6))
    local req = m .. " " .. path .. " HTTP/1.1\r\nHost: " .. host
        .. "\r\nX-Forwarded-For: " .. rnd_ip()
        .. "\r\nX-Test-Server: " .. configured
        .. "\r\nContent-Length: 0\r\n\r\n"
    local ok, err = sock:send(req)
    if not ok then return nil, err end
    local clen = 0
    while true do
        local line, rerr = sock:receive("*l")
        if not line then return nil, rerr end
        if line == "" then break end
        local cl = line:match("^[Cc]ontent%-[Ll]ength:%s*(%d+)")
        if cl then clen = tonumber(cl) end
    end
    if clen > 0 and m ~= "HEAD" then
        local _, berr = sock:receive(clen)
        if berr then return nil, berr end
    end
    return true
end

local function worker(n)
    local sock = ngx.socket.tcp()
    sock:settimeout(5000)
    assert(sock:connect("127.0.0.1", 8080))
    for _ = 1, n do
        local ok = one(sock)
        if not ok then
            sock:close()
            sock = ngx.socket.tcp()
            sock:settimeout(5000)
            assert(sock:connect("127.0.0.1", 8080))
        end
    end
    sock:close()
end

local function get(path)
    local sock = ngx.socket.tcp()
    sock:settimeout(5000)
    assert(sock:connect("127.0.0.1", 9104))
    sock:send("GET " .. path .. " HTTP/1.0\r\nHost: x\r\n\r\n")
    local body = sock:receive("*a")
    sock:close()
    return (body or ""):match("\r\n\r\n(.*)$") or ""
end

local function heap()
    local seen = {}
    for _ = 1, 40 do
        local w, kb = get("/heap"):match("(%d+) (%d+)")
        if w then seen[tonumber(w)] = tonumber(kb) end
        if seen[0] and seen[1] then break end
    end
    return seen[0] or -1, seen[1] or -1
end

ngx.sleep(2)
local done = 0
local w0, w1 = heap()
print(string.format("%d %d %d %d", 0, tonumber(get("/series")) or -1, w0, w1))
while done < TOTAL do
    local threads = {}
    for i = 1, THREADS do
        threads[i] = ngx.thread.spawn(worker, math.floor(STEP / THREADS))
    end
    for i = 1, THREADS do ngx.thread.wait(threads[i]) end
    done = done + STEP
    ngx.sleep(1.5) -- let the 1 s counter / key-index sync run
    w0, w1 = heap()
    print(string.format("%d %d %d %d", done, tonumber(get("/series")) or -1, w0, w1))
end
