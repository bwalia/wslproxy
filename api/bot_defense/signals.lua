-- api/bot_defense/signals.lua
-- Request fingerprint: what a single request says about its client, without
-- any history. Pure (takes a plain table), so it is unit testable.
--
-- The browser checks only run when the User-Agent claims to be a browser:
-- a real Chrome/Firefox/Safari always sends Accept, Accept-Language and
-- Accept-Encoding, and over HTTPS also Sec-Fetch-* (and Sec-CH-UA on
-- Chromium). A script that copies a browser User-Agent rarely copies those.

local M = {}

local find = string.find

-- Search engines whose crawlers can be verified by reverse + forward DNS.
-- `ua` is a lower-case substring of the User-Agent; `domains` are the PTR
-- suffixes the engine publishes for its crawlers.
M.CRAWLERS = {
    { name = "google", ua = { "googlebot", "google-inspectiontool", "googleother", "adsbot-google",
        "mediapartners-google", "apis-google", "feedfetcher-google" },
      domains = { "googlebot.com", "google.com", "googleusercontent.com" } },
    { name = "bing", ua = { "bingbot", "adidxbot", "bingpreview", "msnbot" }, domains = { "search.msn.com" } },
    { name = "apple", ua = { "applebot" }, domains = { "applebot.apple.com" } },
    { name = "yandex", ua = { "yandexbot", "yandexmobilebot", "yandeximages" },
      domains = { "yandex.ru", "yandex.net", "yandex.com" } },
    { name = "baidu", ua = { "baiduspider" }, domains = { "baidu.com", "baidu.jp" } },
}

local SCANNERS = {
    "sqlmap", "nikto", "nuclei", "masscan", "zgrab", "wpscan", "dirbuster", "gobuster",
    "ffuf", "acunetix", "nessus", "openvas", "nmap", "w3af", "arachni", "jaeles",
    "netsparker", "appscan", "burpcollaborator", "zap/", "feroxbuster", "wfuzz",
}

local AUTOMATION = {
    "curl/", "wget/", "python-requests", "python-urllib", "python-httpx", "aiohttp",
    "httpie", "go-http-client", "java/", "okhttp", "apache-httpclient", "libwww-perl",
    "lwp::", "node-fetch", "axios/", "undici", "got (", "ruby", "faraday", "guzzlehttp",
    "php/", "powershell", "postmanruntime", "insomnia", "scrapy", "colly", "mechanize",
    "http_request2", "winhttp", "reqwest", "httpclient", "python/", "urllib",
}

local HEADLESS = {
    "headlesschrome", "phantomjs", "selenium", "puppeteer", "playwright", "slimerjs",
    "htmlunit", "headless",
}

local function any(ua, list)
    for i = 1, #list do
        if find(ua, list[i], 1, true) then return list[i] end
    end
    return nil
end

--- Which verifiable crawler a User-Agent claims to be, if any.
--- @return table|nil crawler entry from M.CRAWLERS
function M.claimed_crawler(ua_lower)
    for _, c in ipairs(M.CRAWLERS) do
        if any(ua_lower, c.ua) then return c end
    end
    return nil
end

--- Browser family and major version a User-Agent claims.
--- @return string|nil family (chromium|firefox|safari), number|nil major
function M.claimed_browser(ua)
    if not ua or ua:sub(1, 8) ~= "Mozilla/" then return nil end
    local edge = ua:match("Edg/(%d+)")
    if edge then return "chromium", tonumber(edge) end
    local chrome = ua:match("Chrome/(%d+)")
    if chrome then return "chromium", tonumber(chrome) end
    local firefox = ua:match("Firefox/(%d+)")
    if firefox then return "firefox", tonumber(firefox) end
    local safari = ua:match("Version/(%d+)[%d%.]* .*Safari/")
    if safari then return "safari", tonumber(safari) end
    return nil
end

--- Evaluate one request.
--- `r`: { ua, accept, accept_language, accept_encoding, sec_ch_ua,
---        sec_fetch_mode, scheme, http_version }
--- Returns the list of signal codes, then an info table
--- { crawler, browser, major, tool, declared_bot }.
function M.evaluate(r)
    local out, info = {}, {}
    local ua = r.ua
    if type(ua) ~= "string" or ua:match("^%s*$") then
        out[#out + 1] = "BD_UA_MISSING"
        return out, info
    end
    local lua = ua:lower()

    local scanner = any(lua, SCANNERS)
    if scanner then
        out[#out + 1] = "BD_UA_SCANNER"
        info.tool = scanner
        return out, info
    end

    local headless = any(lua, HEADLESS)
    if headless then
        out[#out + 1] = "BD_UA_HEADLESS"
        info.tool = headless
    end

    local crawler = M.claimed_crawler(lua)
    if crawler then
        -- Verified (or exposed as fake) by the caller with reverse DNS; the
        -- browser checks below do not apply to crawlers.
        info.crawler = crawler
        return out, info
    end

    if not headless then
        local tool = any(lua, AUTOMATION)
        if tool then
            out[#out + 1] = "BD_UA_AUTOMATION"
            info.tool = tool
            return out, info
        end
        -- "bot" must end a token followed by / ; ) - or the string end:
        -- "AhrefsBot/7.0", "PetalBot;", "Slackbot-LinkExpanding" — but not the
        -- "CUBOT X30" phone model, which a bare "bot" match would flag.
        if find(lua, "bot[/;%)%-]") or find(lua, "bot$") or find(lua, "spider", 1, true)
            or find(lua, "crawl", 1, true) or find(lua, "slurp", 1, true)
            or find(lua, "facebookexternalhit", 1, true) then
            out[#out + 1] = "BD_UA_DECLARED_BOT"
            info.declared_bot = true
            return out, info
        end
    end

    local family, major = M.claimed_browser(ua)
    if not family then return out, info end
    info.browser, info.major = family, major

    if not r.accept then out[#out + 1] = "BD_BROWSER_NO_ACCEPT" end
    if not r.accept_language then out[#out + 1] = "BD_BROWSER_NO_LANGUAGE" end
    if not r.accept_encoding then out[#out + 1] = "BD_BROWSER_NO_ENCODING" end
    if r.http_version == 1.0 then out[#out + 1] = "BD_OLD_PROTOCOL" end

    -- Fetch metadata and client hints are only sent to secure origins, and
    -- Android WebView ("; wv)") is not consistent about either.
    if r.scheme == "https" and not find(ua, "; wv)", 1, true) then
        local modern = (family == "chromium" and major and major >= 80)
            or (family == "firefox" and major and major >= 90)
            or (family == "safari" and major and major >= 17)
        if modern and not r.sec_fetch_mode then out[#out + 1] = "BD_BROWSER_NO_FETCH_META" end
        if family == "chromium" and major and major >= 90 and not r.sec_ch_ua then
            out[#out + 1] = "BD_BROWSER_NO_HINTS"
        end
    end

    return out, info
end

--- Static asset requests: what a browser loads after a page and a scraper skips.
local ASSET_EXT = {
    css = true, js = true, mjs = true, png = true, jpg = true, jpeg = true, gif = true,
    svg = true, webp = true, avif = true, ico = true, woff = true, woff2 = true, ttf = true,
    otf = true, eot = true, map = true,
}
function M.is_asset(uri)
    local ext = uri:match("%.([%w]+)$")
    return ext ~= nil and ASSET_EXT[ext:lower()] == true
end

--- A top-level page navigation (not an API call, not an asset).
function M.is_navigation(method, accept, uri)
    if method ~= "GET" and method ~= "HEAD" then return false end
    if M.is_asset(uri) then return false end
    return type(accept) == "string" and find(accept, "text/html", 1, true) ~= nil
end

return M
