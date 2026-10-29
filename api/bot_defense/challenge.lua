-- api/bot_defense/challenge.lua
-- The self-hosted browser challenge (proof of work + automation check), its
-- verify endpoint, and the block response. No third-party script, no
-- external service: the page carries its own SHA-256.
--
-- Flow: a suspect page navigation gets the challenge page (403, no-store).
-- Its script finds a nonce n with sha256(token .. ":" .. n) starting with
-- `difficulty` zero bits, then POSTs {token, nonce, webdriver} to
-- verify_path. The server checks it with one hash, refuses replays, and sets
-- a session cookie marked as passed; the script reloads the original page.

local Session = require("bot_defense.session")

local M = {}

local function support_id()
    return ngx.var.request_id or Session.random_id(8)
end

local function json(status, body)
    ngx.status = status
    ngx.header["Content-Type"] = "application/json"
    ngx.header["Cache-Control"] = "no-store"
    ngx.say((Cjson or require("cjson")).encode(body))
    return ngx.exit(status)
end

-- Kept small and dependency-free: SHA-256 over an ASCII string, returning the
-- eight state words (only the first is needed for the zero-bit test).
local SOLVER_JS = [[
function sha256(s){var K=[0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
var i,j,n=s.length,len=(((n+8)>>6)+1)*16,w=[],W=[],H=[0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
for(i=0;i<len;i++)w[i]=0;for(i=0;i<n;i++)w[i>>2]|=(s.charCodeAt(i)&255)<<(24-(i%4)*8);
w[n>>2]|=0x80<<(24-(n%4)*8);w[len-1]=n*8;
for(j=0;j<len;j+=16){var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
for(i=0;i<64;i++){if(i<16)W[i]=w[j+i]|0;else{var x=W[i-15],y=W[i-2];W[i]=(((x>>>7|x<<25)^(x>>>18|x<<14)^(x>>>3))+W[i-7]+((y>>>17|y<<15)^(y>>>19|y<<13)^(y>>>10))+W[i-16])|0;}
var t1=(h+((e>>>6|e<<26)^(e>>>11|e<<21)^(e>>>25|e<<7))+((e&f)^(~e&g))+K[i]+W[i])|0,t2=(((a>>>2|a<<30)^(a>>>13|a<<19)^(a>>>22|a<<10))+((a&b)^(a&c)^(b&c)))|0;
h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0;}
H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;}
return H;}
]]
M.SOLVER_JS = SOLVER_JS

local PAGE = [[<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Checking your browser</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:560px;margin:5em auto;padding:2em;color:#1f2937;line-height:1.5}
h1{font-size:1.5em;margin:0 0 .5em}.bar{height:4px;background:#e5e7eb;border-radius:2px;overflow:hidden;margin:1.5em 0}
.bar i{display:block;height:100%;width:30%;background:#6366f1;animation:s 1.2s ease-in-out infinite}
@keyframes s{0%{margin-left:-30%}100%{margin-left:100%}}small{color:#6b7280}code{background:#f3f4f6;padding:2px 6px;border-radius:3px}</style></head>
<body><h1>Checking your browser&hellip;</h1>
<p id="msg">This takes a moment and happens once. You will be taken to the page automatically.</p>
<div class="bar"><i></i></div>
<noscript><p><strong>JavaScript is required to continue.</strong></p></noscript>
<p><small>Support ID: <code>__SUPPORT__</code> &middot; Protected by wslproxy Bot Defense</small></p>
<script>
__SOLVER__
(function(){var token="__TOKEN__",diff=__DIFF__,ret="__RETURN__",verify="__VERIFY__",shift=32-diff,nonce=0,msg=document.getElementById("msg");
function fail(r){msg.textContent="Verification failed ("+(r||"error")+"). Reload the page to try again.";}
function done(n){var x=new XMLHttpRequest();x.open("POST",verify,true);x.setRequestHeader("Content-Type","application/json");
x.onload=function(){var r={};try{r=JSON.parse(x.responseText)}catch(e){}if(x.status===200&&r.ok){location.replace(r["return"]||ret)}else{fail(r.reason)}};
x.onerror=function(){fail("network")};x.send(JSON.stringify({token:token,nonce:n,webdriver:navigator.webdriver===true}));}
function step(){var end=nonce+20000;for(;nonce<end;nonce++){if((sha256(token+":"+nonce)[0]>>>shift)===0){return done(String(nonce));}}setTimeout(step,0);}
setTimeout(step,0);})();
</script></body></html>]]

local BLOCK_PAGE = [[<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex"><title>Access denied</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;max-width:560px;margin:5em auto;padding:2em;color:#1f2937;line-height:1.5}
h1{font-size:1.5em;color:#b91c1c;margin:0 0 .5em}small{color:#6b7280}code{background:#f3f4f6;padding:2px 6px;border-radius:3px}</style></head>
<body><h1>403 &mdash; Access denied</h1>
<p>This request looks automated and was stopped. If you are a person using a normal browser, reload the page; if it keeps happening, contact the site with the Support ID below.</p>
<p><small>Support ID: <code>__SUPPORT__</code> &middot; Protected by wslproxy Bot Defense</small></p>
</body></html>]]

local function html_escape(s)
    return (tostring(s):gsub("[&<>\"']", { ["&"] = "&amp;", ["<"] = "&lt;", [">"] = "&gt;",
        ['"'] = "&quot;", ["'"] = "&#39;" }))
end

local function js_string(s)
    -- Return paths are percent-encoded already (request_uri); this guards the
    -- quote and the closing-script sequence regardless.
    return (tostring(s):gsub("[\\\"<>%c]", function(ch)
        return string.format("\\u%04x", ch:byte())
    end))
end

local function fill(template, values)
    return (template:gsub("__(%u+)__", function(k)
        local v = values[k]
        return v ~= nil and tostring(v) or ""
    end))
end

--- Answer with a challenge. Page navigations get the solver page; API and
--- asset requests (which cannot run it) get a JSON 403 naming the action.
function M.serve(st, ipk, ua, now, is_navigation)
    local cfg = st.cfg
    local id = support_id()
    ngx.header["X-WSL-Bot-Action"] = "challenge"
    ngx.header["X-Support-ID"] = id
    if not is_navigation then
        return json(403, { error = "bot_challenge_required", action = "challenge", support_id = id,
            message = "Open this site in a browser to continue." })
    end
    local token = Session.challenge_token(st.secret, now, cfg.challenge_ttl_s, cfg.pow_difficulty,
        ipk, ua, ngx.var.request_uri)
    ngx.status = 403
    ngx.header["Content-Type"] = "text/html; charset=utf-8"
    ngx.header["Cache-Control"] = "no-store"
    ngx.print(fill(PAGE, {
        SOLVER = SOLVER_JS,
        TOKEN = token,
        DIFF = cfg.pow_difficulty,
        RETURN = js_string(Session.safe_return(ngx.var.request_uri)),
        VERIFY = js_string(cfg.verify_path),
        SUPPORT = html_escape(id),
    }))
    return ngx.exit(403)
end

function M.block(is_navigation)
    local id = support_id()
    ngx.header["X-WSL-Bot-Action"] = "block"
    ngx.header["X-Support-ID"] = id
    if not is_navigation then
        return json(403, { error = "automated_traffic_blocked", action = "block", support_id = id })
    end
    ngx.status = 403
    ngx.header["Content-Type"] = "text/html; charset=utf-8"
    ngx.header["Cache-Control"] = "no-store"
    ngx.print(fill(BLOCK_PAGE, { SUPPORT = html_escape(id) }))
    return ngx.exit(403)
end

--- POST verify_path; answers the request. The outcome is recorded in
--- ngx.ctx.bot_defense.challenge_result before answering, because the
--- answer ends the request (the log phase reads it for metrics).
--- @param issue_cookie function(passed_until) → Set-Cookie value
function M.verify(st, ipk, ua, now, issue_cookie)
    local ctx = ngx.ctx.bot_defense or {}
    ngx.ctx.bot_defense = ctx
    local function result(r, status, body)
        ctx.challenge_result = r
        return json(status, body)
    end

    ngx.req.read_body()
    local body = ngx.req.get_body_data()
    if not body or #body > 4096 then
        return result("bad_request", 400, { ok = false, reason = "bad_request" })
    end
    local ok, req = pcall((Cjson or require("cjson")).decode, body)
    if not ok or type(req) ~= "table" or type(req.token) ~= "string" then
        return result("bad_request", 400, { ok = false, reason = "bad_request" })
    end

    local solved, reason = Session.verify_solution(st.secret, req.token, req.nonce, now, ipk, ua)
    if not solved then
        return result(reason, 403, { ok = false, reason = reason })
    end
    -- An automation framework announces itself through navigator.webdriver.
    if req.webdriver == true then
        return result("webdriver", 403, { ok = false, reason = "automation" })
    end
    -- One solution, one use: a solved token cannot be replayed by a farm.
    if st.dict then
        local fresh = st.dict:add("pow:" .. ngx.md5(req.token), true, st.cfg.challenge_ttl_s + 5)
        if not fresh then
            return result("replay", 403, { ok = false, reason = "replay" })
        end
    end

    require("helpers").appendSetCookie(issue_cookie(now + st.cfg.passed_ttl_s))
    return result("passed", 200, { ok = true, ["return"] = solved.return_path })
end

return M
