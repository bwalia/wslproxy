Cjson = require("cjson")
IP2location = require('ip2location')
JWT = require "resty.jwt"
LFS = require("lfs")
Base64 = require "base64"

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

local function getSettings()
  local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
  local settings = {}
  if readSettings == nil then
    ngx.log(ngx.ERR, "Couldn't read file: " .. errSettings)
    return "Couldn't read file: " .. errSettings
  else
    local jsonString = readSettings:read "*a"
    readSettings:close()
    settings = Cjson.decode(jsonString)
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

-- Pre-load SSL domains from disk into memory at init time
-- This is used as fallback when Redis is not available or for disk storage mode
local ssl_domains_cache = {}

local function load_ssl_domains_from_disk()
  local ssl_dir = configPath .. "data/ssl/"

  -- First check if directory exists
  local dir_attr = LFS.attributes(ssl_dir)
  if not dir_attr or dir_attr.mode ~= "directory" then
    ngx.log(ngx.INFO, "SSL: SSL directory does not exist yet: ", ssl_dir)
    return
  end

  local ok, err = pcall(function()
    for file in LFS.dir(ssl_dir) do
      if file ~= "." and file ~= ".." and file:match("%.json$") then
        local server_name = file:gsub("%.json$", "")
        local file_path = ssl_dir .. file
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
          if parse_ok and config and config.ssl_enabled == true then
            ssl_domains_cache[server_name] = true
            ngx.log(ngx.INFO, "SSL: Pre-loaded domain from disk: ", server_name)
          end
        end
      end
    end
  end)

  if not ok then
    ngx.log(ngx.WARN, "SSL: Error loading SSL domains from disk: ", tostring(err))
  end
end

-- Load SSL domains from disk at init time
load_ssl_domains_from_disk()

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

  -- First check the pre-loaded cache (for disk storage mode)
  if ssl_domains_cache[domain] then
    return true
  end

  -- If using Redis storage, check Redis
  if use_redis_storage then
    local redis_ok, redis = pcall(require, "resty.redis")
    if not redis_ok then
      -- Redis module not available, use cache only
      return ssl_domains_cache[domain] == true
    end

    local red = redis:new()
    red:set_timeout(5000)

    local ok, err = red:connect(redisHost, redisEndPort)
    if not ok then
      -- Redis connection failed, use cache
      return ssl_domains_cache[domain] == true
    end

    -- Check for ssl_enabled key in Redis
    local ssl_enabled_key = domain .. ':ssl_enabled'
    local ssl_enabled = red:get(ssl_enabled_key)

    if ssl_enabled and ssl_enabled ~= ngx.null then
      red:set_keepalive(10000, 100)
      local is_enabled = (ssl_enabled == "true" or ssl_enabled == "1")
      -- Update cache for future requests
      if is_enabled then
        ssl_domains_cache[domain] = true
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
      -- Update cache
      ssl_domains_cache[domain] = true
      return true
    end

    return false
  else
    -- Disk storage mode - rely on pre-loaded cache
    return ssl_domains_cache[domain] == true
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

auto_ssl:init()
ngx.log(ngx.INFO, "SSL: lua-resty-auto-ssl initialized successfully")

-- Export function to refresh SSL domains cache (can be called from API)
function RefreshSslDomainsCache()
  ssl_domains_cache = {}
  load_ssl_domains_from_disk()
  return true
end

-- Export function to add domain to SSL cache (called when SSL is enabled via API)
function AddSslDomainToCache(domain)
  if domain and domain ~= "" then
    ssl_domains_cache[domain] = true
    return true
  end
  return false
end

-- Export function to remove domain from SSL cache (called when SSL is disabled via API)
function RemoveSslDomainFromCache(domain)
  if domain and domain ~= "" then
    ssl_domains_cache[domain] = nil
    return true
  end
  return false
end
