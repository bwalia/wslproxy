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

-- Helper function to check SSL enabled from disk storage
local function check_ssl_enabled_disk(server_name)
  local ssl_config_path = configPath .. "data/ssl/" .. server_name .. ".json"
  local ok, result = pcall(function()
    local file = io.open(ssl_config_path, "rb")
    if file then
      local content = file:read("*a")
      file:close()
      if content and content ~= "" then
        local config = Cjson.decode(content)
        return config and config.ssl_enabled == true
      end
    end
    return false
  end)
  if ok then
    return result
  end
  return false
end

-- Helper function to check if storage type is Redis
local function is_redis_storage()
  return settings and settings.storage_type == "redis"
end

-- Configure auto_ssl to check if domain has SSL enabled
-- Supports both Redis and disk storage based on settings.storage_type
auto_ssl:set("allow_domain", function(domain)
  local cjson = require "cjson"
  local host_header = ngx.var.host or domain

  -- Cannot issue TLS cert for an IP address
  local ip_type = ip_addr_get_type(domain)
  if ip_type == 1 or ip_type == 2 then -- IPV4 or IPV6
    ngx.log(ngx.INFO, "SSL: Cannot issue certificate for IP address: ", domain)
    return false
  end

  -- Cannot issue TLS cert for empty domain
  if not domain or domain == "" then
    ngx.log(ngx.INFO, "SSL: Cannot issue certificate for empty domain")
    return false
  end

  -- Check if using Redis or disk storage
  local use_redis = is_redis_storage()

  if use_redis then
    -- Try Redis first
    local redis_ok, redis = pcall(require, "resty.redis")
    if not redis_ok then
      ngx.log(ngx.WARN, "SSL: Redis module not available, falling back to disk")
      local is_enabled = check_ssl_enabled_disk(host_header)
      ngx.log(ngx.INFO, "SSL: Domain ", host_header, " ssl_enabled (from disk): ", tostring(is_enabled))
      return is_enabled
    end

    local red = redis:new()
    red:set_timeout(5000)

    local ok, err = red:connect(redisHost, redisEndPort)
    if not ok then
      ngx.log(ngx.WARN, "SSL: Failed to connect to Redis, falling back to disk: ", err)
      local is_enabled = check_ssl_enabled_disk(host_header)
      ngx.log(ngx.INFO, "SSL: Domain ", host_header, " ssl_enabled (from disk fallback): ", tostring(is_enabled))
      return is_enabled
    end

    -- Check for ssl_enabled key in Redis
    local ssl_enabled_key = host_header .. ':ssl_enabled'
    local ssl_enabled = red:get(ssl_enabled_key)

    if ssl_enabled and ssl_enabled ~= ngx.null then
      red:set_keepalive(10000, 100)
      local is_enabled = (ssl_enabled == "true" or ssl_enabled == "1")
      ngx.log(ngx.INFO, "SSL: Domain ", host_header, " ssl_enabled (from Redis key): ", tostring(is_enabled))
      return is_enabled
    end

    -- Fallback: Check if host exists in Redis and parse server config
    local host_key = host_header .. ':host'
    local host_data = red:get(host_key)

    if not host_data or host_data == ngx.null then
      red:set_keepalive(10000, 100)
      ngx.log(ngx.INFO, "SSL: Host not found in Redis: ", host_header)
      return false
    end

    -- Parse the server configuration to check ssl_enabled flag
    local server_config
    local parse_ok = pcall(function()
      server_config = cjson.decode(host_data)
    end)

    red:set_keepalive(10000, 100)

    if parse_ok and server_config and server_config.ssl_enabled == true then
      ngx.log(ngx.INFO, "SSL: Certificate allowed for domain: ", host_header)
      return true
    else
      ngx.log(ngx.INFO, "SSL: Certificate not enabled for domain: ", host_header)
      return false
    end
  else
    -- Use disk storage
    local is_enabled = check_ssl_enabled_disk(host_header)
    ngx.log(ngx.INFO, "SSL: Domain ", host_header, " ssl_enabled (from disk): ", tostring(is_enabled))
    return is_enabled
  end
end)

auto_ssl:set("storage_adapter", "resty.auto-ssl.storage_adapters.redis")
auto_ssl:set("redis", {
  host = redisHost
})

auto_ssl:set("dir", "/tmp")

-- Check if we should use staging mode (check settings or environment variable)
-- Default to staging for safety during testing
local use_staging = true  -- Default to staging

-- Check environment variable first
local staging_env = os.getenv("SSL_STAGING")
if staging_env ~= nil then
  use_staging = (staging_env == "true" or staging_env == "1")
else
  -- Check settings.json for ssl_staging global setting
  if settings and settings.ssl_staging ~= nil then
    use_staging = settings.ssl_staging
  end
end

if use_staging then
  -- Use Let's Encrypt staging environment for testing
  -- Staging certificates are NOT trusted by browsers but have higher rate limits
  auto_ssl:set("ca", "https://acme-staging-v02.api.letsencrypt.org/directory")
  ngx.log(ngx.WARN, "SSL: Using Let's Encrypt STAGING environment. Certificates will NOT be trusted by browsers.")
else
  -- Use Let's Encrypt production environment
  -- Production certificates ARE trusted by browsers but have lower rate limits
  auto_ssl:set("ca", "https://acme-v02.api.letsencrypt.org/directory")
  ngx.log(ngx.INFO, "SSL: Using Let's Encrypt PRODUCTION environment.")
end

auto_ssl:init()
