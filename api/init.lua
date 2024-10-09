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
local settings = getSettings()
local redisHost = settings.env_vars.REDIS_HOST or os.getenv("REDIS_HOST")
local redisEndPort = settings.env_vars.REDIS_PORT or os.getenv("REDIS_PORT")
if redisHost == nil then
  redisHost = "localhost"
end

if redisEndPort ~= nil then
  redisEndPort = 6379
end

require "resty.session".init({
  remember = true,
  audience = "whitefalcon",
  storage  = "redis",
  redis    = {
    host = redisHost,
    port = redisEndPort,
  }
})

auto_ssl = (require "resty.auto-ssl").new()

auto_ssl:set("allow_domain", function(domain)
  local redis                           = require "resty.redis"
  local host_header                     = ngx.var.host

  local ssl_certificate_domain_is_valid = false
  --
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
    local chunks = { ip:match("^" .. (("([a-fA-F0-9]*):"):rep(8):gsub(":$", "$"))) }
    if #chunks == 8
        or #chunks < 8 and ip:match('::') and not ip:gsub("::", "", 1):match('::') then
      for _, v in pairs(chunks) do
        if #v > 0 and tonumber(v, 16) > 65535 then return R.STRING end
      end
      return R.IPV6
    end

    return R.STRING
  end
  --
  --cannot issue tls cert for an IP
  if not ip_addr_get_type(domain) == 'IPV4' then
    ssl_certificate_domain_is_valid = true
  end
  --cannot issue tls cert for an empty domain
  if not domain == nil then
    ssl_certificate_domain_is_valid = true
  end
  --cannot issue tls cert for nil domain
  if not domain == '' then
    ssl_certificate_domain_is_valid = true
  end

  local red = redis:new()

  red:set_timeout(5000) -- 1 sec
  --local ok, err = red:connect("unix:/var/run/redis/redis.sock")
  --local ok, err = red:connect("127.0.0.1", 6379)

  local ok, err = red:connect(redisHost, redisEndPort)

  if not ok then
    ssl_certificate_domain_is_valid = false
    ngx.log(ngx.ERR, "failed to connect: ", err)
    return ssl_certificate_domain_is_valid
  end


  local res, err = red:get(host_header .. ':host')

  if not res then
    ssl_certificate_domain_is_valid = false
    ngx.log(ngx.ERR, host_header .. ' host_not_found: ', err)
    return ssl_certificate_domain_is_valid
  end

  if res == ngx.null then
    ssl_certificate_domain_is_valid = false
    ngx.log(ngx.ERR, host_header .. ' host_not_found: ', err)
    return ssl_certificate_domain_is_valid
  else
    --yepeee host is found in redis OK
    ssl_certificate_domain_is_valid = true
  end

  return ssl_certificate_domain_is_valid
end)

auto_ssl:set("storage_adapter", "resty.auto-ssl.storage_adapters.redis")
auto_ssl:set("redis", {
  host = redisHost
  --    socket = "unix:/var/run/redis/redis.sock"
})

auto_ssl:set("allow_domain", function(domain)
  return true
end)

auto_ssl:set("dir", "/tmp")
auto_ssl:init()
