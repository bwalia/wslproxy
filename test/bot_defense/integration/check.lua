-- Assertions for the Bot Defense integration harness. Run by run.sh with the
-- `resty` CLI inside the same container as nginx.conf.

local http = require "resty.http"
local cjson = require "cjson.safe"
local sha256 = require "resty.sha256"

local SETTINGS = "/tmp/it/data/settings.json"
local ERROR_LOG = "/tmp/it/logs/error.log"

local passed, failed = 0, 0
local function check(cond, msg)
    if cond then passed = passed + 1 else failed = failed + 1; print("FAIL: " .. msg) end
end
local function section(name) print("== " .. name) end

local CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
-- What a real Chrome sends on a navigation (plain HTTP here, so no
-- Sec-CH-UA / Sec-Fetch-* are expected).
local BROWSER = {
    ["User-Agent"] = CHROME,
    ["Accept"] = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    ["Accept-Language"] = "en-GB,en;q=0.9",
    ["Accept-Encoding"] = "gzip, deflate",
}

local function merge(a, b)
    local out = {}
    for k, v in pairs(a or {}) do out[k] = v end
    for k, v in pairs(b or {}) do out[k] = v end
    return out
end

local function get(url)
    local hc = http.new()
    hc:set_timeout(5000)
    local res = hc:request_uri(url)
    return res and res.body or ""
end
local function flush() get("http://127.0.0.1:9104/flush") end

-- A tiny cookie jar so "browser" scenarios keep their session like a browser.
local function new_client(base_headers)
    local jar = {}
    local c = {}
    function c.req(o)
        o = o or {}
        local headers = merge(base_headers, o.headers)
        headers["Host"] = "shop.example.com"
        if o.mode then headers["X-Test-Mode"] = o.mode end
        local parts = {}
        for k, v in pairs(jar) do parts[#parts + 1] = k .. "=" .. v end
        if #parts > 0 and not o.no_cookies then headers["Cookie"] = table.concat(parts, "; ") end
        local hc = http.new()
        hc:set_timeout(10000)
        local res, err = hc:request_uri("http://127.0.0.1:8080" .. (o.path or "/"), {
            method = o.method or "GET", headers = headers, body = o.body,
        })
        if not res then return { status = 0, err = err, headers = {}, body = "" } end
        local sc = res.headers["Set-Cookie"]
        if type(sc) == "string" then sc = { sc } end
        for _, line in ipairs(sc or {}) do
            local k, v = line:match("^([^=;]+)=([^;]*)")
            if k and not o.no_cookies then jar[k] = v end
        end
        res.cookies = sc or {}
        res.origin = cjson.decode(res.body or "")
        return res
    end
    c.jar = jar
    return c
end

local function hdr(res, name) return res.headers and res.headers[name] end
local function has_cookie(res, name)
    for _, l in ipairs(res.cookies or {}) do if l:find("^" .. name .. "=") then return true end end
    return false
end

local function solve(token, diff)
    local n = 0
    while true do
        local h = sha256:new()
        h:update(token .. ":" .. n)
        local d = h:final()
        local bits = 0
        for i = 1, #d do
            local b = d:byte(i)
            if b == 0 then bits = bits + 8 else
                local m = 128
                while m > 0 and b < m do bits = bits + 1; m = m / 2 end
                break
            end
        end
        if bits >= diff then return tostring(n) end
        n = n + 1
    end
end

local function read(path)
    local f = io.open(path, "rb")
    if not f then return "" end
    local s = f:read("*a")
    f:close()
    return s
end
local function write(path, s) local f = assert(io.open(path, "wb")); f:write(s); f:close() end
local function log_has(needle) return read(ERROR_LOG):find(needle, 1, true) ~= nil end

-- ── off ─────────────────────────────────────────────────────────────────
section("no policy")
flush()
local spoofer = new_client({ ["User-Agent"] = "curl/8.4.0", ["X-WSL-Bot-Class"] = "human" })
local r = spoofer.req({})
check(r.status == 200, "no policy: proxied")
check(r.origin and r.origin.class == "human", "no policy: headers untouched (as before)")
check(not has_cookie(r, "wsl_bd"), "no policy: no cookie")

-- ── monitor ─────────────────────────────────────────────────────────────
section("monitor")
flush()
local human = new_client(BROWSER)
r = human.req({ mode = "monitor", path = "/products" })
check(r.status == 200, "human allowed")
check(hdr(r, "X-WSL-Bot-Class") == "human", "human classified (" .. tostring(hdr(r, "X-WSL-Bot-Class")) .. ")")
check(r.origin and r.origin.class == "human" and r.origin.ivt == "none", "origin told: human, valid traffic")
check(has_cookie(r, "wsl_bd") and has_cookie(r, "origin"), "session cookie alongside the origin's")
r = human.req({ mode = "monitor", path = "/products?page=2" })
check(not has_cookie(r, "wsl_bd"), "returning browser keeps its session (no new cookie)")

r = spoofer.req({ mode = "monitor" })
check(r.origin and r.origin.class ~= "absent" and r.origin.signals:find("BD_UA_AUTOMATION", 1, true),
    "client-sent X-WSL-Bot-Class replaced by the real verdict")
r = new_client({ ["User-Agent"] = "sqlmap/1.7.11" }).req({ mode = "monitor" })
check(r.status == 200 and hdr(r, "X-WSL-Bot-Class") == "bot", "monitor: scanner scored as bot but not blocked")

-- ── challenge mode ──────────────────────────────────────────────────────
section("challenge mode")
flush()
r = new_client({ ["User-Agent"] = "curl/8.4.0" }).req({ mode = "challenge" })
check(r.status == 200, "a single curl request is not blocked (score " .. tostring(hdr(r, "X-WSL-Bot-Score")) .. ")")
check(hdr(r, "X-WSL-Bot-IVT") == "givt", "but is general IVT")

r = new_client({ ["User-Agent"] = "sqlmap/1.7.11" }).req({ mode = "challenge" })
check(r.status == 403 and hdr(r, "X-WSL-Bot-Action") == "block", "scanner blocked")
check(hdr(r, "X-Support-ID") ~= nil, "block carries a support id")

flush()
local scraper = new_client({ ["User-Agent"] = "python-requests/2.31.0", ["Accept"] = "*/*" })
local ok200, blocked = 0, 0
for i = 1, 15 do
    r = scraper.req({ mode = "challenge", path = "/products?page=" .. i, no_cookies = true })
    if r.status == 200 then ok200 = ok200 + 1 elseif r.status == 403 then blocked = blocked + 1 end
end
check(blocked >= 8, "python scraper stopped (" .. ok200 .. " allowed, " .. blocked .. " blocked)")
check(ok200 >= 1, "its first requests were let through (graduated, not hair-trigger)")

flush()
local headless = new_client(merge(BROWSER, { ["User-Agent"] = CHROME:gsub("Chrome/", "HeadlessChrome/") }))
r = headless.req({ mode = "challenge", path = "/products" })
check(r.status == 403 and hdr(r, "X-WSL-Bot-Action") == "challenge", "headless browser challenged")
check(r.body:find("Checking your browser", 1, true) ~= nil, "challenge page served for a navigation")

flush()
r = new_client(merge(BROWSER, { ["User-Agent"] = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }))
    .req({ mode = "challenge" })
check(hdr(r, "X-WSL-Bot-Class") ~= "verified_bot", "Googlebot from a non-Google IP is not verified ("
    .. tostring(hdr(r, "X-WSL-Bot-Signals")) .. ")")

flush()
local stuffer = new_client(BROWSER)
stuffer.req({ mode = "challenge", path = "/" })
local login_statuses = {}
for i = 1, 6 do
    r = stuffer.req({ mode = "challenge", path = "/api/login", method = "POST",
        headers = { ["Content-Type"] = "application/json", ["Accept"] = "application/json" },
        body = '{"user":"u' .. i .. '","pass":"x"}' })
    login_statuses[#login_statuses + 1] = r.status
end
check(login_statuses[1] == 401 and login_statuses[#login_statuses] == 403,
    "credential stuffing: origin answers first, then stopped (" .. table.concat(login_statuses, ",") .. ")")
check(r.body:find("bot_challenge_required", 1, true) ~= nil or r.body:find("automated_traffic_blocked", 1, true) ~= nil,
    "API caller gets a JSON verdict, not an HTML page")

flush()
local prober = new_client({ ["User-Agent"] = "Go-http-client/1.1" })
local statuses = {}
for _ = 1, 9 do statuses[#statuses + 1] = prober.req({ mode = "challenge", path = "/missing" }).status end
check(statuses[1] == 404 and statuses[#statuses] == 403,
    "enumeration: 404 storm then stopped (" .. table.concat(statuses, ",") .. ")")

-- The enumeration above was this same IP, so its 404 storm would (rightly)
-- follow these requests too; start clean.
flush()
r = new_client({ ["User-Agent"] = "sqlmap/1.7.11" }).req({ mode = "block", path = "/webhooks/stripe" })
check(r.status == 200, "skip path never acted on")
r = new_client({ ["User-Agent"] = "sqlmap/1.7.11" }).req({ mode = "block", path = "/ad/impression?ad=7" })
check(r.status == 200 and r.origin and r.origin.ivt == "givt" and r.origin.class == "bot",
    "monitor path: flagged as invalid traffic for the origin, not blocked (status " .. tostring(r.status)
    .. ", origin saw " .. tostring(r.body):sub(1, 160) .. ")")

-- ── the challenge itself ────────────────────────────────────────────────
section("challenge round trip")
flush()
local person = new_client(BROWSER)
r = person.req({ mode = "challenge", path = "/checkout?step=1" })
check(r.status == 403 and r.body:find("Checking your browser", 1, true), "checkout requires a challenge")
local token = r.body:match('var token="([%w%-_%.]+)"')
local diff = tonumber(r.body:match("diff=(%d+)"))
check(token ~= nil and diff == 14, "page carries the token and difficulty")
check(r.body:find('ret="/checkout?step=1"', 1, true) ~= nil, "page returns to the original URL")

local nonce = solve(token, diff)
local function verify(client, body)
    return client.req({ mode = "challenge", path = "/__wsl/bot/verify", method = "POST",
        headers = { ["Content-Type"] = "application/json" }, body = body })
end

r = verify(new_client(merge(BROWSER, { ["User-Agent"] = "Mozilla/5.0 other" })),
    cjson.encode({ token = token, nonce = nonce, webdriver = false }))
check(r.status == 403 and r.body:find("rebound", 1, true), "token stolen by another client: refused")
r = verify(person, cjson.encode({ token = token, nonce = "1", webdriver = false }))
check(r.status == 403 and r.body:find("insufficient_work", 1, true), "no work: refused")
r = verify(person, cjson.encode({ token = token, nonce = nonce, webdriver = true }))
check(r.status == 403 and r.body:find("automation", 1, true), "navigator.webdriver: refused")
r = verify(person, cjson.encode({ token = token .. "x", nonce = nonce }))
check(r.status == 403 and r.body:find("bad_token", 1, true), "tampered token: refused")
r = verify(person, "not json")
check(r.status == 400, "garbage body: 400")

r = verify(person, cjson.encode({ token = token, nonce = nonce, webdriver = false }))
local vr = cjson.decode(r.body) or {}
check(r.status == 200 and vr.ok == true and vr["return"] == "/checkout?step=1", "solution accepted")
check(has_cookie(r, "wsl_bd"), "passed session cookie set")
r = verify(person, cjson.encode({ token = token, nonce = nonce, webdriver = false }))
check(r.status == 403 and r.body:find("replay", 1, true), "same solution twice: replay refused")

r = person.req({ mode = "challenge", path = "/checkout?step=1" })
check(r.status == 200 and r.origin and r.origin.class == "human", "after the challenge: checkout reached")
r = person.req({ mode = "challenge", path = "/checkout?step=1", headers = { ["User-Agent"] = "Mozilla/5.0 swapped" } })
check(r.status == 403, "the passed cookie does not work with another User-Agent")

-- ── behaviour across workers ────────────────────────────────────────────
section("burst across workers")
flush()
local burster = new_client(BROWSER)
local saw_burst = false
for _ = 1, 25 do
    r = burster.req({ mode = "monitor", headers = { ["X-Test-Burst"] = "15", ["Connection"] = "close" } })
    if (hdr(r, "X-WSL-Bot-Signals") or ""):find("BD_BURST", 1, true) then saw_burst = true end
end
check(saw_burst, "burst counted across both workers (new connection per request)")

-- ── hot reload ──────────────────────────────────────────────────────────
section("hot reload")
local base = read(SETTINGS)
local s = cjson.decode(base)
s.bot_defense.datacenter_cidrs = { "127.0.0.1/32", "not-a-cidr" }
write(SETTINGS, cjson.encode(s))
ngx.sleep(6.5)
flush()
r = new_client(BROWSER).req({ mode = "monitor" })
check((hdr(r, "X-WSL-Bot-Signals") or ""):find("BD_DATACENTER", 1, true) ~= nil, "data-centre list applied without a reload")
check(hdr(r, "X-WSL-Bot-IVT") == "givt", "data-centre traffic is general IVT")
check(log_has("ignored 1 invalid datacenter CIDR"), "bad CIDR reported")
write(SETTINGS, base)
ngx.sleep(6.5)
r = new_client(BROWSER).req({ mode = "monitor" })
check(not (hdr(r, "X-WSL-Bot-Signals") or ""):find("BD_DATACENTER", 1, true), "removed again")

-- ── metrics ─────────────────────────────────────────────────────────────
section("metrics")
ngx.sleep(2)
local m = get("http://127.0.0.1:9104/metrics")
check(m:find('wslproxy_bot_requests_total{class="bot"', 1, true) ~= nil, "metric: bot requests")
check(m:find('wslproxy_bot_signals_total{signal="BD_UA_SCANNER"}', 1, true) ~= nil, "metric: signals")
check(m:find('wslproxy_bot_challenges_total{result="passed"}', 1, true) ~= nil, "metric: passed challenges")
check(m:find('wslproxy_bot_challenges_total{result="replay"}', 1, true) ~= nil, "metric: replays")
check(m:find('wslproxy_bot_crawler_checks_total', 1, true) ~= nil, "metric: crawler checks")
check(log_has("botdef {"), "decision lines logged")

print(string.format("passed=%d failed=%d", passed, failed))
if failed > 0 then os.exit(1) end
