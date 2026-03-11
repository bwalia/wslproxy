-- CAPTCHA Module for WSLProxy Gateway
-- Supports Cloudflare Turnstile (default) and Google reCAPTCHA v3
-- Integrated via rule system: statusCode 306 = "CAPTCHA before proxy"
--
-- How it works with rules:
--   Use statusCode: 306 in a rule's response — the rule system handles
--   path, IP, and country matching as usual. When rule matches with 306,
--   gateway_resp.lua calls this module to check/serve the CAPTCHA challenge.
--
-- Example rule config (non-EU traffic on /login must pass CAPTCHA):
--   {
--     "path": "/login",
--     "path_key": "starts_with",
--     "country": "EU",
--     "country_key": "not_equals",
--     "response": {
--       "code": 306,
--       "redirect_uri": "127.0.0.1:8080"  -- backend to proxy to after CAPTCHA passes
--     }
--   }
--
-- Settings.json captcha config:
--   "captcha": {
--     "provider": "turnstile",
--     "site_key": "0x...",
--     "secret_key": "0x...",
--     "theme": "dark",
--     "cookie_ttl": 3600
--   }

local _M = {}

local cjson = Cjson or require("cjson")

local COOKIE_NAME = "wsl_captcha_verified"
local COOKIE_TTL = 3600 -- 1 hour default

-- ============================================================================
-- HMAC COOKIE SIGNING (prevents forgery)
-- ============================================================================

local function get_hmac_secret(settings)
    local secret = nil
    if settings and settings.captcha and settings.captcha.cookie_secret then
        secret = settings.captcha.cookie_secret
    end
    if not secret and settings and settings.env_vars then
        secret = settings.env_vars.JWT_SECURITY_PASSPHRASE
    end
    return secret or "wslproxy-captcha-default-secret"
end

local function sign_cookie(ip, timestamp, secret)
    local data = ip .. ":" .. timestamp
    local digest = ngx.hmac_sha1(secret, data)
    return ngx.encode_base64(data .. "|" .. ngx.encode_base64(digest))
end

local function verify_cookie(cookie_value, secret, ttl)
    if not cookie_value then return false end

    local decoded = ngx.decode_base64(cookie_value)
    if not decoded then return false end

    local data, sig = decoded:match("^(.+)|(.+)$")
    if not data or not sig then return false end

    local expected_sig = ngx.encode_base64(ngx.hmac_sha1(secret, data))
    if sig ~= expected_sig then return false end

    local ip, timestamp = data:match("^(.+):(%d+)$")
    if not ip or not timestamp then return false end

    if ip ~= ngx.var.remote_addr then return false end

    local age = ngx.time() - tonumber(timestamp)
    if age > (ttl or COOKIE_TTL) then return false end

    return true
end

-- ============================================================================
-- TOKEN VERIFICATION (server-side API call to provider)
-- ============================================================================

function _M.verify_token(token, settings)
    if not token or token == "" then
        return false, "empty token"
    end

    local captcha_config = settings.captcha or {}
    local provider = captcha_config.provider or "turnstile"
    local secret_key = captcha_config.secret_key

    if not secret_key or secret_key == "" then
        ngx.log(ngx.ERR, "captcha: secret_key not configured in settings.json")
        return false, "captcha not configured"
    end

    local verify_url
    if provider == "recaptcha" then
        verify_url = "https://www.google.com/recaptcha/api/siteverify"
    else
        verify_url = "https://challenges.cloudflare.com/turnstile/v0/siteverify"
    end

    local http = require("resty.http")
    local httpc = http.new()
    httpc:set_timeout(5000)

    local res, err = httpc:request_uri(verify_url, {
        method = "POST",
        headers = {
            ["Content-Type"] = "application/x-www-form-urlencoded",
        },
        body = "secret=" .. ngx.escape_uri(secret_key)
            .. "&response=" .. ngx.escape_uri(token)
            .. "&remoteip=" .. ngx.escape_uri(ngx.var.remote_addr),
        ssl_verify = false,
    })

    if not res then
        ngx.log(ngx.ERR, "captcha: verification request failed: ", err)
        return false, "verification request failed"
    end

    local ok, result = pcall(cjson.decode, res.body)
    if not ok then
        ngx.log(ngx.ERR, "captcha: invalid JSON response from provider")
        return false, "invalid provider response"
    end

    if result.success then
        return true, nil
    else
        local codes = result["error-codes"] or {}
        return false, table.concat(codes, ", ")
    end
end

-- ============================================================================
-- CHALLENGE PAGE RENDERING
-- ============================================================================

function _M.serve_challenge_page(settings, original_uri)
    local captcha_config = settings.captcha or {}
    local site_key = captcha_config.site_key or ""
    local provider = captcha_config.provider or "turnstile"
    local theme = captcha_config.theme or "dark"

    local script_src, widget_html
    if provider == "recaptcha" then
        script_src = "https://www.google.com/recaptcha/api.js"
        widget_html = '<div class="g-recaptcha" data-sitekey="' .. site_key
            .. '" data-callback="onCaptchaSuccess" data-theme="' .. theme .. '"></div>'
    else
        script_src = "https://challenges.cloudflare.com/turnstile/v0/api.js"
        widget_html = '<div class="cf-turnstile" data-sitekey="' .. site_key
            .. '" data-callback="onCaptchaSuccess" data-theme="' .. theme .. '"></div>'
    end

    local html = [[<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Security Check | WSL Proxy</title>
    <link rel="icon" type="image/png" href="/images/logo.png"/>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet"/>
    <script src="]] .. script_src .. [[" async defer></script>
    <style>
      :root {
        --primary: #6366f1;
        --secondary: #0ea5e9;
        --accent: #10b981;
        --dark: #0f172a;
        --dark-light: #1e293b;
        --white: #ffffff;
        --gradient: linear-gradient(135deg, #6366f1 0%, #0ea5e9 50%, #10b981 100%);
        --gradient-dark: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
      }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body {
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        background: var(--gradient-dark);
        color: var(--white);
        min-height: 100vh;
        display: flex;
        flex-direction: column;
        overflow-x: hidden;
      }
      body::before {
        content: '';
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="0.5"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
        pointer-events: none;
        z-index: 0;
      }
      .glow {
        position: fixed;
        width: 600px; height: 600px;
        background: radial-gradient(circle, rgba(99, 102, 241, 0.15) 0%, transparent 70%);
        top: -200px; right: -100px;
        pointer-events: none;
      }
      .glow-2 {
        position: fixed;
        width: 400px; height: 400px;
        background: radial-gradient(circle, rgba(14, 165, 233, 0.1) 0%, transparent 70%);
        bottom: -100px; left: -100px;
        pointer-events: none;
      }
      .navbar {
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(20px);
        padding: 1rem 2rem;
        border-bottom: 1px solid rgba(255,255,255,0.1);
        position: relative;
        z-index: 10;
      }
      .navbar-brand {
        font-size: 1.5rem;
        font-weight: 800;
        color: var(--white);
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        gap: 0.5rem;
      }
      .navbar-brand span {
        background: var(--gradient);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
      }
      .content {
        flex: 1;
        display: flex;
        align-items: center;
        justify-content: center;
        position: relative;
        z-index: 1;
        padding: 2rem;
      }
      .captcha-container {
        text-align: center;
        max-width: 500px;
        width: 100%;
      }
      .shield-icon {
        width: 80px; height: 80px;
        margin: 0 auto 1.5rem;
        background: rgba(99, 102, 241, 0.15);
        border: 2px solid rgba(99, 102, 241, 0.3);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
      }
      .shield-icon svg { color: #6366f1; }
      .captcha-title {
        font-size: 2rem;
        font-weight: 700;
        margin-bottom: 0.75rem;
      }
      .captcha-subtitle {
        font-size: 1.1rem;
        color: rgba(255,255,255,0.6);
        line-height: 1.6;
        margin-bottom: 2rem;
      }
      .divider {
        width: 80px; height: 4px;
        background: var(--gradient);
        border-radius: 2px;
        margin: 0 auto 2rem;
      }
      .captcha-box {
        background: rgba(30, 41, 59, 0.8);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        padding: 2rem;
        margin-bottom: 1.5rem;
        display: flex;
        justify-content: center;
        align-items: center;
        min-height: 100px;
      }
      .status-msg {
        margin-top: 1rem;
        font-size: 0.95rem;
        color: rgba(255,255,255,0.5);
        min-height: 1.5em;
      }
      .status-msg.error { color: #ef4444; }
      .status-msg.success { color: #10b981; }
      .footer {
        text-align: center;
        padding: 1.5rem;
        color: rgba(255,255,255,0.3);
        font-size: 0.875rem;
        position: relative;
        z-index: 1;
        border-top: 1px solid rgba(255,255,255,0.05);
      }
      @media (max-width: 768px) {
        .captcha-title { font-size: 1.5rem; }
        .captcha-box { padding: 1.5rem; }
      }
    </style>
</head>
<body>
    <div class="glow"></div>
    <div class="glow-2"></div>
    <nav class="navbar">
      <a href="/" class="navbar-brand"><span>WSL Proxy</span></a>
    </nav>
    <div class="content">
      <div class="captcha-container">
        <div class="shield-icon">
          <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
        </div>
        <h1 class="captcha-title">Security Check</h1>
        <div class="divider"></div>
        <p class="captcha-subtitle">
          Please verify you are human to continue.<br/>
          This helps us protect the site from automated abuse.
        </p>
        <div class="captcha-box">
          ]] .. widget_html .. [[
        </div>
        <div id="status" class="status-msg">Waiting for verification...</div>
      </div>
    </div>
    <div class="footer">&copy; WSL Proxy &mdash; Workstation Solutions Limited</div>
    <script>
    function onCaptchaSuccess(token) {
      var el = document.getElementById('status');
      el.textContent = 'Verified! Redirecting...';
      el.className = 'status-msg success';
      var form = new XMLHttpRequest();
      form.open('POST', '/__captcha/verify', true);
      form.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
      form.onload = function() {
        if (form.status === 200) {
          window.location.reload();
        } else {
          el.textContent = 'Verification failed. Please try again.';
          el.className = 'status-msg error';
        }
      };
      form.onerror = function() {
        el.textContent = 'Network error. Please try again.';
        el.className = 'status-msg error';
      };
      form.send('token=' + encodeURIComponent(token) + '&redirect=]] .. ngx.escape_uri(original_uri or "/") .. [[');
    }
    </script>
</body>
</html>]]

    ngx.status = 200
    ngx.header["Content-Type"] = "text/html; charset=utf-8"
    ngx.header["Cache-Control"] = "no-store, no-cache, must-revalidate"
    ngx.say(html)
    return ngx.exit(200)
end

-- ============================================================================
-- VERIFICATION ENDPOINT HANDLER (POST /__captcha/verify)
-- ============================================================================

function _M.handle_verify(settings)
    if ngx.req.get_method() ~= "POST" then
        ngx.status = 405
        ngx.say('{"error":"method not allowed"}')
        return ngx.exit(405)
    end

    ngx.req.read_body()
    local args, err = ngx.req.get_post_args()
    if not args then
        ngx.status = 400
        ngx.say('{"error":"bad request"}')
        return ngx.exit(400)
    end

    local token = args.token

    local success, verify_err = _M.verify_token(token, settings)
    if not success then
        ngx.log(ngx.WARN, "captcha: verification failed: ", verify_err or "unknown")
        ngx.status = 403
        ngx.header["Content-Type"] = "application/json"
        ngx.say('{"error":"captcha verification failed"}')
        return ngx.exit(403)
    end

    -- Set signed HMAC cookie
    local captcha_config = settings.captcha or {}
    local ttl = tonumber(captcha_config.cookie_ttl) or COOKIE_TTL
    local secret = get_hmac_secret(settings)
    local cookie_value = sign_cookie(ngx.var.remote_addr, ngx.time(), secret)

    local secure_flag = ""
    if ngx.var.scheme == "https" then
        secure_flag = "; Secure"
    end

    ngx.header["Set-Cookie"] = COOKIE_NAME .. "=" .. cookie_value
        .. "; Path=/; HttpOnly; SameSite=Lax; Max-Age=" .. ttl
        .. secure_flag

    ngx.status = 200
    ngx.header["Content-Type"] = "application/json"
    ngx.say('{"success":true}')
    return ngx.exit(200)
end

-- ============================================================================
-- RULE-BASED CHECK (called from gateway_resp.lua for statusCode 306)
-- ============================================================================

-- Check if user has valid CAPTCHA cookie. If yes, return false (continue to proxy).
-- If no, serve challenge page and return true (request handled).
function _M.check(settings)
    -- Handle the verification POST endpoint
    local uri = ngx.var.uri
    if uri == "/__captcha/verify" then
        _M.handle_verify(settings)
        return true
    end

    -- Check for valid captcha cookie
    local captcha_config = settings.captcha or {}
    local ttl = tonumber(captcha_config.cookie_ttl) or COOKIE_TTL
    local secret = get_hmac_secret(settings)
    local cookie = ngx.var["cookie_" .. COOKIE_NAME]

    if verify_cookie(cookie, secret, ttl) then
        return false -- valid cookie, let gateway_resp continue to proxy (treat as 305)
    end

    -- No valid cookie — serve challenge page
    _M.serve_challenge_page(settings, uri)
    return true
end

return _M
