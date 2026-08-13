Cjson = require("cjson")
IP2location = require('ip2location')
JWT = require "resty.jwt"
LFS = require("lfs")
Base64 = require "base64"

-- Base64.decode throws ("attempt to perform arithmetic on a nil value")
-- on input whose "=" padding was lost in transit, which would turn one
-- corrupt rule field into a 500 on every request of the vhost. Re-pad to
-- a multiple of 4 and pcall so request-path callers can never crash on
-- stored data; returns nil when the value is genuinely undecodable.
function Base64DecodeSafe(s)
  s = tostring(s or "")
  local rem = #s % 4
  if rem > 0 then
    s = s .. string.rep("=", 4 - rem)
  end
  local ok, decoded = pcall(Base64.decode, s)
  if ok then
    return decoded
  end
  ngx.log(ngx.WARN, "Base64DecodeSafe: undecodable base64 value")
  return nil
end

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
-- Ensure trailing slash for path concatenation
if configPath:sub(-1) ~= "/" then
  configPath = configPath .. "/"
end

local function getSettings()
  local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
  local settings = {}
  if readSettings == nil then
    ngx.log(ngx.ERR, "Couldn't read file: " .. errSettings)
    return settings
  else
    local jsonString = readSettings:read "*a"
    readSettings:close()
    if jsonString == nil or jsonString == "" then
      ngx.log(ngx.ERR, "Settings file is empty at: " .. configPath .. "data/settings.json")
      return settings
    end
    local ok, result = pcall(Cjson.decode, jsonString)
    if ok then
      settings = result
    else
      ngx.log(ngx.ERR, "Failed to decode settings JSON: " .. tostring(result))
      return settings
    end
  end
  return settings
end

-- Define Redis connection variables at module scope
local redisHost = os.getenv("REDIS_HOST") or "localhost"
local redisEndPort = tonumber(os.getenv("REDIS_PORT")) or 6379

local settings = getSettings()
if settings and settings ~= nil and settings.env_vars and settings.env_vars ~= nil then
  if settings.env_vars.REDIS_HOST then
    redisHost = settings.env_vars.REDIS_HOST
  end
  if settings.env_vars.REDIS_PORT then
    redisEndPort = tonumber(settings.env_vars.REDIS_PORT) or 6379
  end
end

-- Determine storage type at init time (not in callback)
local use_redis_storage = settings and settings.storage_type == "redis"

-- pgsql is fail-loud at worker init: refuse to start if Postgres is down.
if settings and settings.storage_type == "pgsql" then
  local ok, err = pcall(function()
    require("storage").init(settings)
  end)
  if not ok then
    ngx.log(ngx.EMERG, "pgsql storage init failed: ", err)
    error("pgsql storage unavailable: " .. tostring(err))
  end
end

-- Actionable operator warning when settings.json still holds the legacy
-- reboot-flag path.  api/server-conf.lua rewrites LEGACY_REBOOT_FLAG →
-- DEFAULT_REBOOT_FLAG at call time so this alone doesn't break saves —
-- but it's a signal that the deployed settings file drifted from the
-- current default (/tmp/nginx/nginx-reboot-required) and should be
-- corrected in the source (SOPS / Vault) so future deploys don't keep
-- re-writing the stale value onto the host.  Prod 2026-07-14 hit this
-- exact drift and every server-update returned HTTP 400 for weeks
-- because the older server-conf.lua deployed there didn't have the
-- rewrite.
if settings and settings.nginx and settings.nginx.reboot_file_path
    and settings.nginx.reboot_file_path:sub(1, 14) == "/var/run/nginx" then
    ngx.log(ngx.WARN,
        "startup: settings.nginx.reboot_file_path is legacy '",
        settings.nginx.reboot_file_path,
        "' — server-conf.lua rewrites this to /tmp/nginx/... at runtime, ",
        "but update the source (SOPS / Vault) to '/tmp/nginx/nginx-reboot-required' ",
        "so deploys stop re-writing the stale value onto the host")
end

-- Export IP2Location path as global variable for use in log_handler
-- and geo_lookup.  This is loaded at init time when file I/O is
-- allowed.
--
-- Fallback default matches where the ansible role installs the DB
-- (cdn-dependencies.sh.j2 + ip2location_db_path in role defaults).
-- A previous fallback of `/tmp/...` silently broke geographic
-- traffic in prod for weeks: the on-disk file lived at the new
-- path but settings.json (in Vault) still pointed at /tmp/, and
-- the fallback didn't catch the drift because it pointed at the
-- same wrong place.  `/tmp` is also a poor location — some systems
-- clear it on reboot.
IP2LocationPath = settings and settings.ip2location_path
    or "/usr/local/openresty/nginx/IP2LOCATION-LITE-DB11.IPV6.BIN"
ngx.log(ngx.INFO, "IP2Location: Using database path: ", IP2LocationPath)

-- Use shared dictionary for SSL domains cache
-- This ensures the cache is shared across all nginx worker processes
-- IMPORTANT: The shared dict "ssl_domains" must be defined in nginx.conf
local ssl_domains_shd = ngx.shared.ssl_domains

local function load_ssl_domains_from_disk()
  local ssl_dir = configPath .. "data/ssl/"
  ngx.log(ngx.INFO, "SSL: Loading SSL domains from disk directory: ", ssl_dir)

  -- First check if directory exists
  local dir_attr = LFS.attributes(ssl_dir)
  if not dir_attr or dir_attr.mode ~= "directory" then
    ngx.log(ngx.INFO, "SSL: SSL directory does not exist yet: ", ssl_dir)
    return
  end

  local domains_loaded = 0
  local ok, err = pcall(function()
    for file in LFS.dir(ssl_dir) do
      if file ~= "." and file ~= ".." and file:match("%.json$") then
        local server_name = file:gsub("%.json$", "")
        local file_path = ssl_dir .. file
        ngx.log(ngx.DEBUG, "SSL: Reading SSL config file: ", file_path)

        local read_ok, content = pcall(function()
          local f = io.open(file_path, "rb")
          if f then
            local c = f:read("*a")
            f:close()
            return c
          end
          return nil
        end)

        if read_ok and content and content ~= "" then
          local parse_ok, config = pcall(function()
            return Cjson.decode(content)
          end)
          if parse_ok and config then
            ngx.log(ngx.INFO, "SSL: Found config for domain: ", server_name,
                    ", ssl_enabled=", tostring(config.ssl_enabled))
            if config.ssl_enabled == true then
              if ssl_domains_shd then
                ssl_domains_shd:set(server_name, true)
                domains_loaded = domains_loaded + 1
                ngx.log(ngx.INFO, "SSL: Pre-loaded domain to shared dict: ", server_name)
              else
                ngx.log(ngx.WARN, "SSL: Shared dict not available, cannot cache domain: ", server_name)
              end
            end
          else
            ngx.log(ngx.WARN, "SSL: Failed to parse config for: ", file_path)
          end
        else
          ngx.log(ngx.WARN, "SSL: Failed to read config file: ", file_path)
        end
      end
    end
  end)

  if not ok then
    ngx.log(ngx.WARN, "SSL: Error loading SSL domains from disk: ", tostring(err))
  else
    ngx.log(ngx.INFO, "SSL: Loaded ", domains_loaded, " SSL-enabled domains from disk")
  end
end

-- Load SSL domains from disk at init time
load_ssl_domains_from_disk()

-- Ensure versioning directories exist at startup
local function ensure_versioning_dirs()
  local dirs = {
    configPath .. "data/versions",
    configPath .. "data/versions/servers",
    configPath .. "data/versions/rules",
    configPath .. "data/change_requests",
    configPath .. "data/audit",
  }
  for _, dir in ipairs(dirs) do
    local attr = LFS.attributes(dir)
    if not attr or attr.mode ~= "directory" then
      local ok, err = LFS.mkdir(dir)
      if ok then
        ngx.log(ngx.INFO, "Versioning: Created directory: ", dir)
      elseif not LFS.attributes(dir) then
        ngx.log(ngx.WARN, "Versioning: Failed to create directory: ", dir, " - ", tostring(err))
      end
    end
  end
end
ensure_versioning_dirs()

require "resty.session".init({
  remember = true,
  audience = "wslproxy",
  storage  = "redis",
  redis    = {
    host = redisHost,
    port = redisEndPort,
  }
})

auto_ssl = (require "resty.auto-ssl").new()

-- Helper function to check if IP address
local function ip_addr_get_type(ip)
  local R = { ERROR = 0, IPV4 = 1, IPV6 = 2, STRING = 3 }
  if type(ip) ~= "string" then return R.ERROR end

  -- check for format 1.11.111.111 for ipv4
  local chunks = { ip:match("^(%d+)%.(%d+)%.(%d+)%.(%d+)$") }
  if #chunks == 4 then
    for _, v in pairs(chunks) do
      if tonumber(v) > 255 then return R.STRING end
    end
    return R.IPV4
  end

  -- check for ipv6 format, should be 8 'chunks' of numbers/letters
  -- without leading/trailing chars
  -- or fewer than 8 chunks, but with only one `::` group
  local ipv6_chunks = { ip:match("^" .. (("([a-fA-F0-9]*):"):rep(8):gsub(":$", "$"))) }
  if #ipv6_chunks == 8
      or #ipv6_chunks < 8 and ip:match('::') and not ip:gsub("::", "", 1):match('::') then
    for _, v in pairs(ipv6_chunks) do
      if #v > 0 and tonumber(v, 16) > 65535 then return R.STRING end
    end
    return R.IPV6
  end

  return R.STRING
end

-- Configure auto_ssl to check if domain has SSL enabled
-- IMPORTANT: This callback runs in ssl_certificate_by_lua context
-- where many APIs (io.open, os.getenv, ngx.var) are NOT available
-- Only Redis (cosockets) and shared dictionaries work here
auto_ssl:set("allow_domain", function(domain)
  -- Cannot issue TLS cert for an IP address
  local ip_type = ip_addr_get_type(domain)
  if ip_type == 1 or ip_type == 2 then -- IPV4 or IPV6
    return false
  end

  -- Cannot issue TLS cert for empty domain
  if not domain or domain == "" then
    return false
  end

  -- First check the shared dictionary cache (works across all workers)
  local shd = ngx.shared.ssl_domains
  if shd then
    local cached = shd:get(domain)
    if cached then
      return true
    end
  end

  -- If using Redis storage, check Redis
  if use_redis_storage then
    local redis_ok, redis = pcall(require, "resty.redis")
    if not redis_ok then
      -- Redis module not available, use shared dict cache only
      return shd and shd:get(domain) == true
    end

    local red = redis:new()
    red:set_timeout(5000)

    local ok, err = red:connect(redisHost, redisEndPort)
    if not ok then
      -- Redis connection failed, use shared dict cache
      return shd and shd:get(domain) == true
    end

    -- Check for ssl_enabled key in Redis
    local ssl_enabled_key = domain .. ':ssl_enabled'
    local ssl_enabled = red:get(ssl_enabled_key)

    if ssl_enabled and ssl_enabled ~= ngx.null then
      red:set_keepalive(10000, 100)
      local is_enabled = (ssl_enabled == "true" or ssl_enabled == "1")
      -- Update shared dict cache for future requests (across all workers)
      if is_enabled and shd then
        shd:set(domain, true)
      end
      return is_enabled
    end

    -- Fallback: Check if host exists in Redis and parse server config
    local host_key = domain .. ':host'
    local host_data = red:get(host_key)

    red:set_keepalive(10000, 100)

    if not host_data or host_data == ngx.null then
      return false
    end

    -- Parse the server configuration to check ssl_enabled flag
    local server_config
    local parse_ok = pcall(function()
      server_config = Cjson.decode(host_data)
    end)

    if parse_ok and server_config and server_config.ssl_enabled == true then
      -- Update shared dict cache
      if shd then
        shd:set(domain, true)
      end
      return true
    end

    return false
  else
    -- Disk storage mode - rely on shared dict cache
    return shd and shd:get(domain) == true
  end
end)

-- Set DNS resolver FIRST - needed for all ACME operations
-- Use Google DNS as fallback if primary resolvers are not available
local primary_dns = os.getenv("PRIMARY_DNS_RESOLVER") or "8.8.8.8"
local secondary_dns = os.getenv("SECONDARY_DNS_RESOLVER") or "8.8.4.4"
auto_ssl:set("resolver", primary_dns .. " " .. secondary_dns)
ngx.log(ngx.INFO, "SSL: Using DNS resolvers: ", primary_dns, " ", secondary_dns)

-- Configure storage adapter based on settings
if use_redis_storage then
  auto_ssl:set("storage_adapter", "resty.auto-ssl.storage_adapters.redis")
  auto_ssl:set("redis", {
    host = redisHost,
    port = redisEndPort
  })
  ngx.log(ngx.INFO, "SSL: Using Redis storage adapter at ", redisHost, ":", redisEndPort)
else
  -- Use file storage adapter for disk-based storage
  auto_ssl:set("storage_adapter", "resty.auto-ssl.storage_adapters.file")
  auto_ssl:set("dir", configPath .. "data/ssl-certs")
  ngx.log(ngx.INFO, "SSL: Using file storage adapter at ", configPath, "data/ssl-certs")
end

-- Check if we should use staging mode (check settings or environment variable)
-- Default to production (false) for real certificates
local use_staging = false  -- Default to production

-- Check environment variable first (read at init time, not in callback)
local staging_env = os.getenv("SSL_STAGING")
if staging_env ~= nil then
  use_staging = (staging_env == "true" or staging_env == "1")
else
  -- Check settings.json for ssl_staging global setting
  if settings and settings.ssl_staging ~= nil then
    use_staging = settings.ssl_staging
  end
end

-- Set Let's Encrypt CA based on staging mode
local ca_url
if use_staging then
  -- Use Let's Encrypt staging environment for testing
  -- Staging certificates are NOT trusted by browsers but have higher rate limits
  ca_url = "https://acme-staging-v02.api.letsencrypt.org/directory"
  auto_ssl:set("ca", ca_url)
  ngx.log(ngx.WARN, "SSL: Using Let's Encrypt STAGING environment: ", ca_url)
  ngx.log(ngx.WARN, "SSL: Staging certificates will NOT be trusted by browsers!")
else
  -- Use Let's Encrypt production environment
  -- Production certificates ARE trusted by browsers but have lower rate limits
  ca_url = "https://acme-v02.api.letsencrypt.org/directory"
  auto_ssl:set("ca", ca_url)
  ngx.log(ngx.INFO, "SSL: Using Let's Encrypt PRODUCTION environment: ", ca_url)
end

-- ============================================================
-- OCSP Stapling Configuration
-- OCSP stapling improves SSL handshake performance and privacy
-- but can fail if the CA's OCSP responder is unreachable
-- ============================================================
local ocsp_stapling_enabled = true  -- Default enabled

-- Check settings for OCSP configuration
if settings and settings.ssl_ocsp_stapling ~= nil then
  ocsp_stapling_enabled = settings.ssl_ocsp_stapling
end

-- Check environment variable override
local ocsp_env = os.getenv("SSL_OCSP_STAPLING")
if ocsp_env ~= nil then
  ocsp_stapling_enabled = (ocsp_env == "true" or ocsp_env == "1")
end

if not ocsp_stapling_enabled then
  -- Disable OCSP stapling to prevent errors when CA's OCSP responder is unavailable
  auto_ssl:set("ocsp_stapling_error_level", ngx.NOTICE)
  ngx.log(ngx.INFO, "SSL: OCSP stapling errors will be logged at NOTICE level (non-blocking)")
else
  -- Enable OCSP stapling with graceful degradation
  -- Errors will be logged but won't block SSL handshakes
  auto_ssl:set("ocsp_stapling_error_level", ngx.WARN)
  ngx.log(ngx.INFO, "SSL: OCSP stapling enabled with graceful degradation")
end

auto_ssl:init()
ngx.log(ngx.INFO, "SSL: lua-resty-auto-ssl initialized successfully")

-- Export function to refresh SSL domains cache (can be called from API)
function RefreshSslDomainsCache()
  local shd = ngx.shared.ssl_domains
  if shd then
    shd:flush_all()
  end
  load_ssl_domains_from_disk()
  return true
end

-- Export function to add domain to SSL cache (called when SSL is enabled via API)
-- Uses shared dictionary so it's immediately available across all workers
function AddSslDomainToCache(domain)
  if domain and domain ~= "" then
    local shd = ngx.shared.ssl_domains
    if shd then
      local ok, err = shd:set(domain, true)
      if ok then
        ngx.log(ngx.INFO, "SSL: Added domain to shared cache: ", domain)
        return true
      else
        ngx.log(ngx.ERR, "SSL: Failed to add domain to shared cache: ", domain, " - ", tostring(err))
        return false
      end
    else
      ngx.log(ngx.ERR, "SSL: Shared dict 'ssl_domains' not available")
      return false
    end
  end
  return false
end

-- Export function to remove domain from SSL cache (called when SSL is disabled via API)
function RemoveSslDomainFromCache(domain)
  if domain and domain ~= "" then
    local shd = ngx.shared.ssl_domains
    if shd then
      shd:delete(domain)
      ngx.log(ngx.INFO, "SSL: Removed domain from shared cache: ", domain)
      return true
    end
  end
  return false
end
