-- Contract tests for api/bot_defense/ (native bot management + IVT).
-- Run: lua test/bot_defense/test_bot_defense.lua
--
-- Crypto is stubbed (ngx.hmac_sha1 → md5) so the structure is tested under
-- plain Lua; test/bot_defense/integration/ runs the real thing in OpenResty.

package.path = "api/?.lua;api/?/init.lua;test/?.lua;" .. package.path

local A = require("api_gw.support.assert")
local Stub = require("api_gw.support.ngx_stub")
local H = Stub.install({ dicts = { "wsl_bot_defense" } })

ngx.hmac_sha1 = function(key, data) return ngx.md5(tostring(key) .. "\0" .. tostring(data)) end
ngx.req.http_version = function() return H.http_version or 1.1 end

local Config = require("bot_defense.config")
local Signals = require("bot_defense.signals")
local Datacenter = require("bot_defense.datacenter")
local Behaviour = require("bot_defense.behaviour")
local Session = require("bot_defense.session")
local Crawlers = require("bot_defense.crawlers")
local Bot = require("bot_defense")

local function has(list, v)
    for _, x in ipairs(list) do if x == v then return true end end
    return false
end

local CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36"
local FIREFOX = "Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"
local SAFARI17 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15"
local SAFARI15 = "Mozilla/5.0 (Macintosh; Intel Mac OS X 12_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.1 Safari/605.1.15"
local WEBVIEW = "Mozilla/5.0 (Linux; Android 14; Pixel 8; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36"
local CUBOT = "Mozilla/5.0 (Linux; Android 10; CUBOT X30) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36"

local function browser(ua, over)
    local r = {
        ua = ua, accept = "text/html,application/xhtml+xml", accept_language = "en-GB,en;q=0.9",
        accept_encoding = "gzip, deflate, br", sec_ch_ua = '"Chromium";v="130"', sec_fetch_mode = "navigate",
        scheme = "https", http_version = 2.0,
    }
    for k, v in pairs(over or {}) do r[k] = v end
    return r
end

-- ─── config ─────────────────────────────────────────────────────────────────

do
    A.is_nil(Config.normalize_server(nil), "absent: off")
    A.is_nil(Config.normalize_server({}), "no mode: off")
    A.is_nil(Config.normalize_server({ mode = "off" }), "off")
    A.is_nil(Config.normalize_server({ mode = "nuke" }), "unknown mode: off")
    local p = Config.normalize_server({ mode = "Challenge" })
    A.eq(p.mode, "challenge", "mode is case-insensitive")
    A.eq(p.challenge_at, 40, "default challenge threshold")
    A.eq(p.block_at, 80, "default block threshold")
    A.eq(p.limits.burst_per_10s, 40, "default burst limit")
    A.ok(p.forward_headers, "forward headers by default")
    A.falsy(p.response_headers, "no response headers by default")
    A.ok(p.allow_verified_bots, "verified bots allowed by default")

    p = Config.normalize_server({ mode = "block", thresholds = { challenge = 70, block = 30 },
        limits = { burst_per_10s = 0, errors_per_min = "x" },
        skip_paths = { "/ok/", "bad", 7, "/sp ace" }, login_paths = { "/api/login" } })
    A.eq(p.block_at, 70, "block below challenge is raised to it")
    A.eq(p.limits.burst_per_10s, 1, "limit clamped to 1")
    A.eq(p.limits.errors_per_min, 20, "non-number limit falls back")
    A.eq(#p.skip_paths, 1, "invalid skip paths dropped")

    local g, warns = Config.normalize_global(nil)
    A.eq(g.pow_difficulty, 16, "default difficulty")
    A.eq(g.cookie_name, "wsl_bd", "default cookie")
    A.eq(#warns, 0, "defaults: no warnings")
    g, warns = Config.normalize_global({ pow_difficulty = 99, cookie_name = "bad name", ip_binding = "x",
        weights = { BD_DATACENTER = 5, BD_NOPE = 9 }, dns_nameservers = { "1.1.1.1", "evil;cmd" } })
    A.eq(g.pow_difficulty, 24, "difficulty clamped")
    A.eq(g.cookie_name, "wsl_bd", "invalid cookie name rejected")
    A.eq(g.ip_binding, "prefix", "invalid binding rejected")
    A.eq(g.weights.BD_DATACENTER, 5, "weight override")
    A.eq(g.weights.BD_BURST, Config.SIGNALS.BD_BURST.weight, "other weights default")
    A.eq(#g.dns_nameservers, 1, "invalid nameserver dropped")
    A.ok(#warns >= 2, "warnings for bad values")
    A.eq(select(2, Config.normalize_global("nope"))[1] ~= nil, true, "non-table warned")

    A.ok(Config.path_matches("/api/x", "/api/"), "slash prefix")
    A.ok(Config.path_matches("/apix", "/api*"), "star prefix")
    A.falsy(Config.path_matches("/apix", "/api"), "exact")
end

-- ─── fingerprint ────────────────────────────────────────────────────────────

do
    local s = Signals.evaluate({ ua = nil })
    A.ok(has(s, "BD_UA_MISSING"), "missing UA")
    s = Signals.evaluate({ ua = "curl/8.4.0", accept = "*/*" })
    A.ok(has(s, "BD_UA_AUTOMATION"), "curl")
    s = Signals.evaluate({ ua = "python-requests/2.31.0" })
    A.ok(has(s, "BD_UA_AUTOMATION"), "python-requests")
    s = Signals.evaluate({ ua = "sqlmap/1.7.11#stable (https://sqlmap.org)" })
    A.ok(has(s, "BD_UA_SCANNER") and #s == 1, "scanner, and only that")

    local info
    s, info = Signals.evaluate({ ua = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" })
    A.eq(#s, 0, "crawler claim: no signal before verification")
    A.eq(info.crawler and info.crawler.name, "google", "crawler family detected")
    s = Signals.evaluate({ ua = "Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)" })
    A.ok(has(s, "BD_UA_DECLARED_BOT"), "declared SEO bot")
    s = Signals.evaluate(browser(CUBOT))
    A.eq(#s, 0, "CUBOT phone is not a bot")

    s = Signals.evaluate(browser(CHROME))
    A.eq(#s, 0, "real Chrome over HTTPS: clean")
    s = Signals.evaluate(browser(CHROME, { accept_language = false }))
    A.ok(has(s, "BD_BROWSER_NO_LANGUAGE"), "Chrome without Accept-Language")
    s = Signals.evaluate(browser(CHROME, { sec_ch_ua = false, sec_fetch_mode = false }))
    A.ok(has(s, "BD_BROWSER_NO_HINTS") and has(s, "BD_BROWSER_NO_FETCH_META"), "Chrome without hints/fetch meta")
    s = Signals.evaluate(browser(CHROME, { scheme = "http", sec_ch_ua = false, sec_fetch_mode = false }))
    A.eq(#s, 0, "plain HTTP: hints and fetch metadata not expected")
    s = Signals.evaluate(browser(WEBVIEW, { sec_ch_ua = false, sec_fetch_mode = false }))
    A.eq(#s, 0, "Android WebView exempt")
    s = Signals.evaluate(browser(FIREFOX, { sec_ch_ua = false, sec_fetch_mode = false }))
    A.ok(has(s, "BD_BROWSER_NO_FETCH_META") and not has(s, "BD_BROWSER_NO_HINTS"), "Firefox: fetch meta, never hints")
    s = Signals.evaluate(browser(SAFARI17, { sec_ch_ua = false, sec_fetch_mode = false }))
    A.ok(has(s, "BD_BROWSER_NO_FETCH_META"), "Safari 17 without fetch meta")
    s = Signals.evaluate(browser(SAFARI15, { sec_ch_ua = false, sec_fetch_mode = false }))
    A.eq(#s, 0, "Safari 15 predates fetch metadata")
    s = Signals.evaluate(browser(CHROME, { http_version = 1.0 }))
    A.ok(has(s, "BD_OLD_PROTOCOL"), "HTTP/1.0 browser")
    s = Signals.evaluate(browser("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36",
        { accept_language = false }))
    A.ok(has(s, "BD_UA_HEADLESS") and has(s, "BD_BROWSER_NO_LANGUAGE"), "headless + inconsistencies")

    A.ok(Signals.is_asset("/static/app.CSS"), "asset by extension")
    A.falsy(Signals.is_asset("/products"), "page is not an asset")
    A.ok(Signals.is_navigation("GET", "text/html,*/*", "/products"), "navigation")
    A.falsy(Signals.is_navigation("GET", "application/json", "/api/x"), "API call is not a navigation")
    A.falsy(Signals.is_navigation("POST", "text/html", "/login"), "POST is not a navigation")
end

-- ─── data-centre ranges ─────────────────────────────────────────────────────

do
    local set, accepted, rejected = Datacenter.build({ "10.0.0.0/24", "10.0.0.128/25", "10.0.1.0/24",
        "192.0.2.7", "bogus", "300.1.1.1/8", "# comment", "", "2001:db8:1::/48", "2600:1f00::/24" })
    A.eq(accepted, 6, "valid ranges accepted")
    A.eq(rejected, 2, "invalid ranges counted")
    A.eq(#set.v4, 2, "adjacent/overlapping v4 ranges merged")
    A.ok(Datacenter.contains(set, "10.0.0.5"), "v4 inside")
    A.ok(Datacenter.contains(set, "10.0.1.255"), "v4 merged upper edge")
    A.falsy(Datacenter.contains(set, "10.0.2.0"), "v4 just outside")
    A.ok(Datacenter.contains(set, "192.0.2.7"), "single address")
    A.falsy(Datacenter.contains(set, "192.0.2.8"), "next address")
    A.ok(Datacenter.contains(set, "2001:db8:1:ffff::1"), "v6 inside /48")
    A.falsy(Datacenter.contains(set, "2001:db8:2::1"), "v6 outside")
    A.ok(Datacenter.contains(set, "2600:1fff:abcd::9"), "v6 /24 non-hextet boundary")
    A.falsy(Datacenter.contains(set, "2601::1"), "v6 /24 outside")
    A.falsy(Datacenter.contains(set, "not-an-ip"), "garbage never matches")
    A.falsy(Datacenter.contains(nil, "10.0.0.5"), "no set")
end

-- ─── score / class / IVT / action ──────────────────────────────────────────

do
    local w = Config.normalize_global(nil).weights
    A.eq(Bot.score(w, { "BD_UA_AUTOMATION" }), 35, "one signal")
    A.eq(Bot.score(w, { "BD_UA_SCANNER", "BD_FAKE_CRAWLER" }), 100, "capped at 100")
    A.eq(Bot.ivt_of({}), "none", "no signals: valid")
    A.eq(Bot.ivt_of({ "BD_DATACENTER" }), "givt", "data-centre: general IVT")
    A.eq(Bot.ivt_of({ "BD_DATACENTER", "BD_SCRAPING" }), "sivt", "sophisticated dominates")

    local ch = Config.normalize_server({ mode = "challenge" })
    local bl = Config.normalize_server({ mode = "block" })
    local mo = Config.normalize_server({ mode = "monitor" })
    local c, a = Bot.decide(ch, 10, {})
    A.eq(c .. "/" .. a, "human/allow", "low score allowed")
    c, a = Bot.decide(ch, 50, {})
    A.eq(c .. "/" .. a, "suspect/challenge", "challenge mode: suspect challenged")
    c, a = Bot.decide(ch, 90, {})
    A.eq(c .. "/" .. a, "bot/block", "challenge mode: bot blocked")
    c, a = Bot.decide(bl, 50, {})
    A.eq(c .. "/" .. a, "suspect/block", "block mode: suspect blocked")
    c, a = Bot.decide(mo, 100, {})
    A.eq(c .. "/" .. a, "bot/allow", "monitor never acts")
    c, a = Bot.decide(bl, 100, { monitored = true })
    A.eq(a, "allow", "monitored path never acts")
    c, a = Bot.decide(bl, 100, { verified = true })
    A.eq(c .. "/" .. a, "verified_bot/allow", "verified crawler allowed")
    c, a = Bot.decide(Config.normalize_server({ mode = "block", allow_verified_bots = false }), 100, { verified = true })
    A.eq(a, "block", "verified crawlers can be refused")
    c, a = Bot.decide(ch, 0, { challenge_path = true })
    A.eq(a, "challenge", "challenge path without a pass")
    c, a = Bot.decide(ch, 0, { challenge_path = true, passed = true })
    A.eq(a, "allow", "challenge path after a pass")
end

-- ─── behaviour ──────────────────────────────────────────────────────────────

do
    local d = H.dicts.wsl_bot_defense
    local limits = Config.normalize_server({ mode = "monitor", limits = {
        burst_per_10s = 3, distinct_paths_per_min = 3, errors_per_min = 2, logins_per_5min = 2,
        cookieless_requests = 2, pages_without_assets = 2 } }).limits
    local function obs(over)
        local c = { ip = "198.51.100.1", vk = "v1", ipua = "iu1", uri = "/", has_cookie = true }
        for k, v in pairs(over or {}) do c[k] = v end
        return Behaviour.observe(d, H.time, c, limits)
    end

    d:flush_all()
    for _ = 1, 3 do A.falsy(has(obs(), "BD_BURST"), "under the burst limit") end
    A.ok(has(obs(), "BD_BURST"), "burst over the limit")
    H.advance(10)
    A.falsy(has(obs(), "BD_BURST"), "burst window rolls over")

    d:flush_all()
    for i = 1, 3 do A.falsy(has(obs({ uri = "/p" .. i }), "BD_SCRAPING"), "distinct under limit") end
    A.falsy(has(obs({ uri = "/p1" }), "BD_SCRAPING"), "repeat path not counted")
    A.ok(has(obs({ uri = "/p4" }), "BD_SCRAPING"), "scraping over the limit")

    d:flush_all()
    for _ = 1, 3 do Behaviour.record_response(d, H.time, "198.51.100.1", 404) end
    Behaviour.record_response(d, H.time, "198.51.100.1", 200)
    A.ok(has(obs(), "BD_ERROR_STORM"), "error storm after 4xx responses")
    A.falsy(has(obs({ ip = "198.51.100.2" }), "BD_ERROR_STORM"), "per IP")

    d:flush_all()
    for _ = 1, 2 do A.falsy(has(obs({ is_login = true }), "BD_LOGIN_VELOCITY"), "logins under limit") end
    A.ok(has(obs({ is_login = true }), "BD_LOGIN_VELOCITY"), "credential stuffing")
    A.falsy(has(obs(), "BD_LOGIN_VELOCITY"), "only login requests carry it")

    d:flush_all()
    for _ = 1, 2 do A.falsy(has(obs({ has_cookie = false }), "BD_NO_COOKIE"), "first cookieless requests ok") end
    A.ok(has(obs({ has_cookie = false }), "BD_NO_COOKIE"), "never keeps the cookie")

    d:flush_all()
    for _ = 1, 2 do obs({ is_navigation = true }) end
    A.ok(has(obs({ is_navigation = true }), "BD_NO_ASSETS"), "pages without assets")
    d:flush_all()
    obs({ is_asset = true })
    for _ = 1, 4 do A.falsy(has(obs({ is_navigation = true }), "BD_NO_ASSETS"), "assets loaded: fine") end
end

-- ─── session + proof of work ───────────────────────────────────────────────

do
    local secret, now = "k", 1700000000
    local v = Session.issue(secret, "vid1", now, 600, 0, "198.51.100", CHROME)
    local s = Session.parse(secret, v, now + 10, "198.51.100", CHROME)
    A.ok(s and s.vid == "vid1" and not s.passed, "round trip, not passed")
    local p = Session.parse(secret, Session.issue(secret, "vid1", now, 600, now + 300, "198.51.100", CHROME),
        now + 10, "198.51.100", CHROME)
    A.ok(p and p.passed, "passed flag")
    A.falsy(Session.parse(secret, Session.issue(secret, "v", now, 600, now + 300, "1.2.3", CHROME),
        now + 400, "1.2.3", CHROME).passed, "pass expires before the session")
    local _, why = Session.parse("other", v, now, "198.51.100", CHROME)
    A.eq(why, "invalid", "wrong key")
    _, why = Session.parse(secret, v:sub(1, -2) .. (v:sub(-1) == "A" and "B" or "A"), now, "198.51.100", CHROME)
    A.eq(why, "invalid", "tampered MAC")
    _, why = Session.parse(secret, v, now + 601, "198.51.100", CHROME)
    A.eq(why, "expired", "expired")
    _, why = Session.parse(secret, v, now, "198.51.100", FIREFOX)
    A.eq(why, "rebound", "copied to another User-Agent")
    _, why = Session.parse(secret, v, now, "203.0.113", CHROME)
    A.eq(why, "rebound", "copied to another network")
    _, why = Session.parse(secret, "garbage", now, "198.51.100", CHROME)
    A.eq(why, "invalid", "garbage")
    _, why = Session.parse(secret, nil, now, "198.51.100", CHROME)
    A.eq(why, "absent", "absent")

    A.eq(Session.ip_key("198.51.100.77", "prefix"), "198.51.100", "/24 binding")
    A.eq(Session.ip_key("198.51.100.77", "exact"), "198.51.100.77", "exact binding")
    A.eq(Session.ip_key("198.51.100.77", "none"), "", "no binding")
    A.eq(Session.ip_key("2001:db8:1:2:3:4:5:6", "prefix"), "2001:db8:1:2", "/64 binding")

    A.eq(Session.safe_return("/a?b=1"), "/a?b=1", "path kept")
    A.eq(Session.safe_return("//evil.example/x"), "/", "protocol-relative refused")
    A.eq(Session.safe_return("https://evil.example"), "/", "absolute refused")
    A.eq(Session.safe_return("/x\\y"), "/", "backslash refused")

    A.eq(Session.leading_zero_bits("\0\0\1"), 23, "zero bits")
    A.eq(Session.leading_zero_bits("\128"), 0, "no zero bits")
    A.eq(Session.leading_zero_bits("\0\15"), 12, "partial byte")
    A.ok(Session.same("abc", "abc") and not Session.same("abc", "abd") and not Session.same("a", nil), "constant-time compare")
end

-- ─── crawler verification ──────────────────────────────────────────────────

do
    local d = H.dicts.wsl_bot_defense
    local google = Signals.CRAWLERS[1]
    local function resolver(ptr, fwd)
        return function()
            return {
                TYPE_A = 1, TYPE_AAAA = 28,
                reverse_query = function() return ptr[1], ptr[2] end,
                query = function() return fwd[1], fwd[2] end,
            }
        end
    end
    local real = Crawlers.new_resolver

    d:flush_all()
    Crawlers.new_resolver = resolver({ { { ptrdname = "crawl-66-249-66-1.googlebot.com" } } },
        { { { address = "66.249.66.1" } } })
    A.eq(Crawlers.verify(google, "66.249.66.1", d, {}), "verified", "reverse + forward match")
    Crawlers.new_resolver = function() error("must use the cache") end
    A.eq(Crawlers.verify(google, "66.249.66.1", d, {}), "verified", "cached")

    d:flush_all()
    Crawlers.new_resolver = resolver({ { { ptrdname = "evil.example.net" } } }, { {} })
    A.eq(Crawlers.verify(google, "203.0.113.5", d, {}), "fake", "PTR outside Google")
    -- An attacker controls both the PTR and the A record of their own domain,
    -- so a perfect reverse+forward match is still fake outside Google's zone.
    d:flush_all()
    Crawlers.new_resolver = resolver({ { { ptrdname = "googlebot.com.evil.example" } } },
        { { { address = "203.0.113.5" } } })
    A.eq(Crawlers.verify(google, "203.0.113.5", d, {}), "fake", "self-consistent DNS outside Google's zone")
    d:flush_all()
    Crawlers.new_resolver = resolver({ { { ptrdname = "evilgooglebot.com" } } },
        { { { address = "203.0.113.5" } } })
    A.eq(Crawlers.verify(google, "203.0.113.5", d, {}), "fake", "suffix must be a whole label")
    d:flush_all()
    Crawlers.new_resolver = resolver({ { errcode = 3 } }, { {} })
    A.eq(Crawlers.verify(google, "203.0.113.5", d, {}), "fake", "no PTR")
    d:flush_all()
    Crawlers.new_resolver = resolver({ { { ptrdname = "x.googlebot.com" } } }, { { { address = "66.249.66.9" } } })
    A.eq(Crawlers.verify(google, "203.0.113.5", d, {}), "fake", "forged PTR resolves elsewhere")
    d:flush_all()
    Crawlers.new_resolver = resolver({ nil, "timeout" }, { {} })
    A.eq(Crawlers.verify(google, "203.0.113.5", d, {}), "unknown", "DNS failure: unknown, not fake")
    d:flush_all()
    Crawlers.new_resolver = function() error("boom") end
    A.eq(Crawlers.verify(google, "203.0.113.5", d, {}), "unknown", "resolver error fails open")
    d:flush_all()
    Crawlers.new_resolver = resolver({ { { ptrdname = "crawl.googlebot.com." } } },
        { { { address = "2001:4860:4801:10:0:0:0:1" } } })
    A.eq(Crawlers.verify(google, "2001:4860:4801:10::1", d, {}), "verified", "IPv6 compared parsed")
    Crawlers.new_resolver = real
end

-- ─── request path (stubbed OpenResty) ──────────────────────────────────────

local settings_file = os.tmpname()
Bot.settings_file = settings_file
do
    local f = assert(io.open(settings_file, "wb"))
    f:write('{"bot_defense":{"secret":"unit-secret"}}')
    f:close()
end

local function request(over)
    H.reset()
    H.ngx.var = {
        uri = "/products", request_uri = "/products?page=1", remote_addr = "198.51.100.10",
        scheme = "https", server_port = "443", request_id = "req-1",
        http_user_agent = CHROME, http_accept = "text/html,*/*", http_accept_language = "en",
        http_accept_encoding = "gzip", http_sec_ch_ua = "x", http_sec_fetch_mode = "navigate",
    }
    for k, v in pairs(over or {}) do H.ngx.var[k] = v end
    H.request.method = (over and over.method) or "GET"
end

do
    Bot._reset()
    request()
    Bot.access({ server_name = "shop.example" })
    A.eq(#H.cleared_headers, 0, "no bot_defense on the server: request untouched")
    A.is_nil(H.ngx.ctx.bot_defense, "no ctx")

    request()
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "off" } })
    A.is_nil(H.ngx.ctx.bot_defense, "mode off: untouched")

    request()
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "monitor", response_headers = true } })
    local c = H.ngx.ctx.bot_defense
    A.eq(c and c.class, "human", "real browser: human")
    A.set_eq(H.cleared_headers, Bot.FORWARD_HEADERS, "spoofable headers stripped")
    A.eq(H.set_headers["X-WSL-Bot-Class"], "human", "verdict forwarded to origin")
    A.eq(H.ngx.header["X-WSL-Bot-Class"], "human", "verdict on the response when asked")
    A.contains(tostring(H.ngx.header["Set-Cookie"]), "wsl_bd=", "session cookie issued")
    A.contains(tostring(H.ngx.header["Set-Cookie"]), "Secure", "cookie Secure over HTTPS")
    A.is_nil(H.exited, "monitor never ends the request")

    request({ http_user_agent = "sqlmap/1.7" })
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "monitor" } })
    A.eq(H.ngx.ctx.bot_defense.class, "bot", "scanner scored as bot")
    A.is_nil(H.exited, "monitor: still not blocked")
    A.is_nil(H.ngx.header["X-WSL-Bot-Class"], "no response headers unless asked")

    request({ http_user_agent = "sqlmap/1.7" })
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "challenge" } })
    A.eq(H.exited, 403, "challenge mode: bot blocked")
    A.contains(table.concat(H.output), "Access denied", "block page")

    request({ uri = "/checkout", request_uri = "/checkout" })
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "challenge", challenge_paths = { "/checkout" } } })
    A.eq(H.exited, 403, "challenge path: challenged")
    A.contains(table.concat(H.output), "Checking your browser", "challenge page served")
    A.contains(table.concat(H.output), "function sha256", "solver inline, no external script")

    request({ http_user_agent = "curl/8", http_accept = "application/json", uri = "/checkout" })
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "challenge", challenge_paths = { "/checkout" } } })
    A.contains(table.concat(H.output), "bot_challenge_required", "API clients get JSON, not a page")

    request({ http_user_agent = "sqlmap/1.7", uri = "/webhooks/stripe" })
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "block", skip_paths = { "/webhooks/" } } })
    A.is_nil(H.exited, "skip path never acted on")
    A.set_eq(H.cleared_headers, Bot.FORWARD_HEADERS, "skip path still stripped")

    request({ http_user_agent = "sqlmap/1.7", uri = "/.well-known/acme-challenge/t" })
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "block" } })
    A.is_nil(H.exited, "ACME never challenged")

    request({ http_user_agent = "sqlmap/1.7", scheme = "http", server_port = "80" })
    Bot.access({ server_name = "shop.example", ssl_enabled = true, ssl_force_https = true,
        bot_defense = { mode = "block" } })
    A.is_nil(H.exited, "plain HTTP on force-HTTPS: left to the 301")
    A.is_nil(H.ngx.header["Set-Cookie"], "no cookie on the redirect")
    A.eq(H.ngx.ctx.bot_defense.class, "bot", "but still scored")

    -- Fail-open: a throwing stage must not escape.
    local real = Signals.evaluate
    Signals.evaluate = function() error("boom") end
    request()
    local ok = pcall(Bot.access, { server_name = "shop.example", bot_defense = { mode = "block" } })
    A.ok(ok, "module error does not escape")
    A.is_nil(H.exited, "module error: request proceeds")
    Signals.evaluate = real

    -- log(): only for requests access() scored.
    request()
    ok = pcall(Bot.log)
    A.ok(ok, "log without ctx is a no-op")
end

-- ─── admin: validation ─────────────────────────────────────────────────────

do
    A.eq(#Config.validate_server(nil), 0, "absent policy is valid")
    A.eq(#Config.validate_server({ mode = "challenge", thresholds = { challenge = 40, block = 80 },
        skip_paths = { "/webhooks/" }, limits = { burst_per_10s = 50 }, response_headers = false }), 0, "valid policy")
    local e = Config.validate_server({ mode = "nuke" })
    A.eq(e[1] and e[1].field, "bot_defense.mode", "bad mode rejected")
    e = Config.validate_server({ thresholds = { challenge = 90, block = 50 } })
    A.contains(e[1] and e[1].message or "", "block threshold", "block below challenge rejected")
    e = Config.validate_server({ limits = { burst_per_10s = 0, nope = 5 } })
    A.eq(#e, 2, "bad and unknown limits rejected")
    e = Config.validate_server({ skip_paths = { "relative", "/ok/" } })
    A.eq(e[1] and e[1].field, "bot_defense.skip_paths[1]", "bad path pinpointed")
    e = Config.validate_server({ forward_headers = "yes" })
    A.eq(e[1] and e[1].field, "bot_defense.forward_headers", "non-boolean flag rejected")
    A.eq(Config.validate_server("x")[1].field, "bot_defense", "non-object rejected")

    local clean, errs = Config.validate_overlay({ pow_difficulty = 18, ip_binding = "exact",
        weights = { BD_DATACENTER = 10 }, datacenter_cidrs = { "203.0.113.0/24" }, dns_nameservers = { "1.1.1.1" },
        datacenter_file = "data/bot_defense/datacenter.cidr" })
    A.ok(clean and #errs == 0, "valid overlay accepted")
    A.eq(clean and clean.weights.BD_DATACENTER, 10, "weights kept")
    clean, errs = Config.validate_overlay({ secret = "x", cookie_name = "y" })
    A.is_nil(clean, "operational keys refused")
    A.eq(#errs, 2, "both refused")
    clean, errs = Config.validate_overlay({ pow_difficulty = 30, weights = { BD_NOPE = 1, BD_BURST = 200 } })
    A.is_nil(clean, "out-of-range values refused")
    A.eq(#errs, 3, "difficulty, unknown signal, weight range")
    _, errs = Config.validate_overlay({ datacenter_file = "/etc/shadow" })
    A.eq(errs[1] and errs[1].field, "datacenter_file", "absolute file refused")
    _, errs = Config.validate_overlay({ datacenter_file = "data/../../etc/shadow" })
    A.eq(errs[1] and errs[1].field, "datacenter_file", "traversal refused")
    _, errs = Config.validate_overlay({ datacenter_cidrs = { "10.0.0.0/8; rm -rf" } })
    A.eq(errs[1] and errs[1].field, "datacenter_cidrs[1]", "garbage CIDR refused")
end

-- ─── admin: overlay, feed, stats, simulator ────────────────────────────────

do
    local overlay_file = os.tmpname()
    Bot.overlay_file = overlay_file
    local f = assert(io.open(settings_file, "wb"))
    f:write('{"bot_defense":{"secret":"unit-secret","pow_difficulty":16}}')
    f:close()
    f = assert(io.open(overlay_file, "wb"))
    f:write('{"pow_difficulty":20,"secret":"from-ui","weights":{"BD_UA_AUTOMATION":50}}')
    f:close()
    Bot._reset()
    H.reset()
    Bot.reload()
    local st = Bot._state()
    A.eq(st.cfg.pow_difficulty, 20, "overlay wins over settings")
    A.eq(st.secret, "unit-secret", "overlay can never set the secret")
    A.eq(st.cfg.weights.BD_UA_AUTOMATION, 50, "overlay weights applied")
    A.ok(st.overlay_active, "overlay reported")
    A.eq(Bot.status().secret_source, "settings", "status reports the key source, not the key")
    A.falsy(Cjson.encode(Bot.status()):find("unit-secret", 1, true), "status never carries the secret")

    -- Feed: decisions for suspicious visitors, bounded and newest first.
    -- request() resets the stub (and so the dict); these need it kept.
    local d = H.dicts.wsl_bot_defense
    d:flush_all()
    local fresh = request
    local function request(over)
        local flush = d.flush_all
        d.flush_all = function() end
        fresh(over)
        d.flush_all = flush
    end
    for i = 1, 3 do
        request({ http_user_agent = "sqlmap/1.7", remote_addr = "198.51.100." .. i, uri = "/p" .. i, request_uri = "/p" .. i })
        Bot.access({ server_name = "shop.example", bot_defense = { mode = "monitor" } })
        Bot.log()
    end
    request()
    Bot.access({ server_name = "shop.example", bot_defense = { mode = "monitor" } })
    Bot.log()
    local ev = Bot.events({})
    A.eq(#ev, 3, "three suspicious decisions in the feed, the human not")
    A.eq(ev[1].uri, "/p3", "newest first")
    A.eq(ev[1].class, "bot", "class recorded")
    A.eq(#Bot.events({ host = "other.example" }), 0, "host filter")
    A.eq(#Bot.events({ class = "bot", limit = 2 }), 2, "limit")

    local stats = Bot.stats(24, { "shop.example" })
    A.eq(#stats.hourly, 24, "24 hourly rows")
    A.eq(stats.totals.class.bot, 3, "bots counted")
    A.eq(stats.totals.class.human, 1, "humans counted")
    A.eq(stats.totals.ivt.givt, 3, "IVT counted")
    A.eq(stats.hosts["shop.example"].bot, 3, "per-host breakdown")

    -- Ring: never more than its slots.
    for i = 1, 520 do
        request({ http_user_agent = "sqlmap/1.7", remote_addr = "203.0.113." .. (i % 250), uri = "/r" .. i, request_uri = "/r" .. i })
        H.ngx.var.http_accept = "*/*"
        Bot.access({ server_name = "shop.example", bot_defense = { mode = "monitor" } })
        Bot.log()
        H.advance(61) -- next minute, so each visitor is logged again
    end
    ev = Bot.events({ limit = 1000 })
    A.ok(#ev <= 500, "feed bounded at 500 (" .. #ev .. ")")
    A.eq(ev[1].uri, "/r520", "ring keeps the newest")

    -- Simulator: same scoring as live traffic, no side effects.
    local keys_before = #d:get_keys(0)
    local sim = Bot.simulate({ ua = "python-requests/2.31", accept = "*/*", path = "/", ip = "198.51.100.9" })
    A.eq(sim.score, 50, "score uses the overlay weight")
    A.eq(sim.class, "suspect", "overlay weight lifts a tool over the challenge threshold")
    A.eq(sim.ivt, "givt", "IVT tier")
    A.eq(#d:get_keys(0), keys_before, "simulator writes no behaviour state")
    sim = Bot.simulate({ ua = "sqlmap/1.7", path = "/", ip = "198.51.100.9", accept = "text/html" }, { mode = "challenge" })
    A.eq(sim.action, "block", "scanner blocked under challenge policy")
    A.contains(sim.response, "block page", "navigation gets the block page")
    sim = Bot.simulate({ ua = "sqlmap/1.7", path = "/webhooks/x", ip = "198.51.100.9" }, { mode = "block", skip_paths = { "/webhooks/" } })
    A.eq(sim.action, "skip", "skip path reported")

    -- A corrupt overlay is ignored, not fatal.
    f = assert(io.open(overlay_file, "wb"))
    f:write("{ not json")
    f:close()
    A.is_nil(Bot.read_overlay(), "corrupt overlay ignored")
    os.remove(overlay_file)
end

-- ─── demo drift guard ──────────────────────────────────────────────────────
-- The demo's /features page lists every signal; it must match the engine.

do
    local f = io.open("examples/wslproxy-bot-demo/app/app.py", "rb")
    if f then
        local src = f:read("*a")
        f:close()
        for code, spec in pairs(Config.SIGNALS) do
            local ivt, weight = src:match('"' .. code .. '", "(%a+)", (%d+),')
            A.ok(ivt ~= nil, "demo features page lists " .. code)
            A.eq(ivt, spec.ivt, code .. " IVT tier matches the engine")
            A.eq(tonumber(weight), spec.weight, code .. " weight matches the engine")
        end
    end
end

os.remove(settings_file)
A.done("test_bot_defense")
