local cjson = Cjson
local lfs = require("lfs")
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- ============================================================
-- Helper functions
-- ============================================================

local function shell_exec(cmd)
    local handle = io.popen(cmd, 'r')
    if not handle then return nil end
    local output = handle:read('*a')
    handle:close()
    if output then
        output = output:gsub('^%s+', ''):gsub('%s+$', '')
    end
    return output
end

local function readFile(filePath)
    local file = io.open(filePath, "r")
    if not file then return nil end
    local content = file:read("*a")
    file:close()
    return content
end

local function parseEnvFile(content)
    local vars = {}
    if not content then return vars end
    for line in content:gmatch("[^\r\n]+") do
        -- Skip comments and blank lines
        if not line:match("^%s*#") and not line:match("^%s*$") then
            local key, value = line:match("^(%S+)%s*=%s*(.*)")
            if key and value then
                vars[key] = value
            end
        end
    end
    return vars
end

local function getSettings()
    local file, err = io.open(configPath .. "data/settings.json", "rb")
    if not file then
        return {}, false, "Cannot open settings.json: " .. (err or "unknown")
    end
    local jsonString = file:read("*a")
    file:close()
    local ok, decoded = pcall(cjson.decode, jsonString)
    if not ok then
        return {}, false, "Invalid JSON in settings.json: " .. tostring(decoded)
    end
    return decoded, true, nil
end

local function checkDir(path)
    local attr = lfs.attributes(path)
    local result = { exists = false, readable = false, writable = false }
    if not attr or attr.mode ~= "directory" then
        return result
    end
    result.exists = true
    -- Check readable by listing
    local ok, _ = pcall(lfs.dir, path)
    result.readable = ok
    -- Check writable by creating a temp file
    local probeFile = path .. "/.health_probe"
    local wf = io.open(probeFile, "w")
    if wf then
        wf:close()
        os.remove(probeFile)
        result.writable = true
    end
    return result
end

-- ============================================================
-- Load settings
-- ============================================================

local settings, settingsValid, settingsError = getSettings()
if not settings.env_vars then settings.env_vars = {} end
if not settings.dns_resolver then settings.dns_resolver = { nameservers = {} } end
if not settings.dns_resolver.nameservers then settings.dns_resolver.nameservers = {} end

local envProfile = settings.env_profile or "prod"

-- ============================================================
-- Determine response mode
-- ============================================================

local detailed = ngx.var.arg_detailed == "true"

ngx.header.content_type = "application/json"

-- ============================================================
-- BASIC MODE - fast, no heavy I/O
-- ============================================================

if not detailed then
    local basicStatus = "healthy"
    if not settingsValid then basicStatus = "unhealthy" end

    ngx.say(cjson.encode({
        status = basicStatus,
        response = "pong",
        timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
    }))
    return
end

-- ============================================================
-- DETAILED MODE
-- ============================================================

local overallStatus = "healthy"
local hasCriticalFailure = false
local hasWarning = false

-- ---------- Services ----------

local services = {}

-- OpenResty
local openrestyVersion = readFile("/opt/nginx/VERSION")
if not openrestyVersion then
    -- Fallback: try known binary paths then PATH lookup (native + Docker)
    local versionOutput = shell_exec("/usr/local/openresty/bin/openresty -v 2>&1") or ""
    if not versionOutput:match("openresty") then
        versionOutput = shell_exec("/usr/local/openresty/nginx/sbin/nginx -v 2>&1") or ""
    end
    if not versionOutput:match("openresty") and not versionOutput:match("nginx") then
        versionOutput = shell_exec("openresty -v 2>&1") or ""
    end
    if not versionOutput:match("openresty") and not versionOutput:match("nginx") then
        versionOutput = shell_exec("nginx -v 2>&1") or ""
    end
    if versionOutput then
        openrestyVersion = versionOutput:match("openresty/([%S]+)") or versionOutput:match("nginx/([%S]+)")
    end
end
if openrestyVersion then
    openrestyVersion = openrestyVersion:gsub('%s+', '')
end
services.openresty = {
    status = "ok",
    version = openrestyVersion or "unknown"
}

-- Nginx workers: pgrep -f works on GNU + BusyBox; ps fallback for minimal systems
local workerOutput = shell_exec("pgrep -f 'nginx.*worker' 2>/dev/null | wc -l")
if not workerOutput or workerOutput:gsub("%s+", "") == "" or workerOutput:gsub("%s+", "") == "0" then
    workerOutput = shell_exec("ps aux 2>/dev/null | grep 'nginx.*worker' | grep -v grep | wc -l")
end
local workerCount = tonumber(workerOutput) or 0
services.nginx_workers = {
    status = workerCount > 0 and "ok" or "error",
    worker_count = workerCount
}
if workerCount == 0 then hasCriticalFailure = true end

-- Redis
local storageType = settings.storage_type or os.getenv("STORAGE_TYPE") or "disk"
local redisHost = settings.env_vars.REDIS_HOST or os.getenv("REDIS_HOST") or "localhost"
local redisPort = settings.env_vars.REDIS_PORT or os.getenv("REDIS_PORT") or 6379

if storageType == "redis" then
    local ok, redis = pcall(require, "resty.redis")
    if ok then
        local red = redis:new()
        red:set_timeouts(1000, 1000, 1000)
        local conn_ok, conn_err = red:connect(redisHost, redisPort)
        if conn_ok then
            services.redis = { status = "ok", message = "Connected", host = redisHost, port = redisPort }
        else
            services.redis = { status = "error", message = "Failed to connect: " .. (conn_err or "unknown"), host = redisHost, port = redisPort }
            hasCriticalFailure = true
        end
    else
        services.redis = { status = "error", message = "resty.redis module not available" }
        hasCriticalFailure = true
    end
else
    services.redis = { status = "skipped", message = "Storage type is '" .. storageType .. "', Redis not required" }
end

-- ---------- Data Directories ----------

local dataDir = configPath .. "data/"
local dirsToCheck = {
    "servers/" .. envProfile,
    "rules/" .. envProfile,
    "ssl-certs",
    "profiles",
    "instances",
    "secrets",
    "error-pages",
    "upstreams/prod"
}

local dataDirectories = {}
for _, dir in ipairs(dirsToCheck) do
    local fullPath = dataDir .. dir
    local result = checkDir(fullPath)
    dataDirectories[dir] = result
    if not result.exists or not result.writable then
        hasWarning = true
    end
    if (dir == "servers/" .. envProfile or dir == "rules/" .. envProfile) and not result.exists then
        hasCriticalFailure = true
    end
end

-- ---------- Settings Validation ----------

local settingsCheck = {
    status = "ok",
    file_exists = settingsValid or false,
    valid_json = settingsValid or false,
    missing_keys = {},
    env_profile = settings.env_profile or "NOT SET",
    storage_type = settings.storage_type or "NOT SET"
}

if not settingsValid then
    settingsCheck.status = "error"
    settingsCheck.error = settingsError
    hasCriticalFailure = true
else
    local requiredKeys = { "env_profile", "storage_type", "env_vars", "nginx", "super_user", "dns_resolver" }
    for _, key in ipairs(requiredKeys) do
        if settings[key] == nil then
            table.insert(settingsCheck.missing_keys, key)
        end
    end
    if #settingsCheck.missing_keys > 0 then
        settingsCheck.status = "warning"
        hasWarning = true
    end
end

-- ---------- Frontend .env ----------
-- Try multiple known locations for the frontend .env file
local frontEnvPaths = {
    "/usr/local/openresty/nginx/html/openresty-admin/.env",
    configPath .. "openresty-admin/.env",
}

local frontEnvPath = nil
local frontEnvContent = nil
for _, path in ipairs(frontEnvPaths) do
    frontEnvContent = readFile(path)
    if frontEnvContent and frontEnvContent:gsub("%s+", "") ~= "" then
        frontEnvPath = path
        break
    end
    frontEnvContent = nil
end

local frontEnvVars = parseEnvFile(frontEnvContent)

-- For the new Next.js admin, the env vars are NEXT_PUBLIC_* not VITE_*
-- Check both sets and report whichever is found
local requiredFrontVars = {
    "VITE_API_URL",
    "VITE_APP_VERSION",
    "VITE_DEPLOYMENT_TIME"
}

local frontendEnv = {
    status = "ok",
    file_exists = frontEnvContent ~= nil,
    env_path = frontEnvPath or "not found",
    variables = {},
    missing = {}
}

if not frontEnvContent then
    -- No .env file is OK for production/Next.js deployments where env is injected at build time
    frontendEnv.status = "ok"
    frontendEnv.note = "Frontend env is baked at build time — .env file not required at runtime"
else
    for _, varName in ipairs(requiredFrontVars) do
        if frontEnvVars[varName] and frontEnvVars[varName] ~= "" then
            frontendEnv.variables[varName] = frontEnvVars[varName]
        else
            frontendEnv.variables[varName] = "NOT SET"
            table.insert(frontendEnv.missing, varName)
        end
    end
    if #frontendEnv.missing > 0 then
        frontendEnv.status = "warning"
        hasWarning = true
    end
end

-- ---------- Backend Environment ----------

local jwtPassPhrase = settings.env_vars.JWT_SECURITY_PASSPHRASE or os.getenv("JWT_SECURITY_PASSPHRASE")
local primaryNS = settings.dns_resolver.nameservers.primary or os.getenv("PRIMARY_DNS_RESOLVER")
local secondaryNS = settings.dns_resolver.nameservers.secondary or os.getenv("SECONDARY_DNS_RESOLVER")
local dnsPort = settings.dns_resolver.nameservers.port or os.getenv("DNS_RESOLVER_PORT")
local apiUrl = settings.env_vars.CONTROL_PLANE_API_URL or os.getenv("CONTROL_PLANE_API_URL")
local frontUrl = settings.env_vars.FRONT_URL or os.getenv("FRONT_URL")

local environment = {
    backend = {
        NGINX_CONFIG_DIR = configPath and "Found" or "Not Found",
        JWT_SECURITY_PASSPHRASE = jwtPassPhrase and "Found" or "Not Found",
        PRIMARY_DNS_RESOLVER = primaryNS and "Found" or "Not Found",
        SECONDARY_DNS_RESOLVER = secondaryNS and "Found" or "Not Found",
        DNS_RESOLVER_PORT = dnsPort and "Found" or "Not Found",
        FRONT_URL = frontUrl or "Not Found",
        API_URL = apiUrl or "Not Found",
    },
    frontend = {
        status = (frontEnvContent and next(frontEnvVars) ~= nil) and "configured" or "build-time",
        note = (not frontEnvContent or next(frontEnvVars) == nil)
            and "Frontend env vars are baked at build time — runtime .env not required"
            or nil,
        VITE_API_URL = frontEnvVars.VITE_API_URL or "build-time",
        VITE_FRONT_URL = frontEnvVars.VITE_FRONT_URL or "build-time",
        VITE_APP_VERSION = frontEnvVars.VITE_APP_VERSION or "build-time",
        VITE_DEPLOYMENT_TIME = frontEnvVars.VITE_DEPLOYMENT_TIME or "build-time",
        VITE_APP_DISPLAY_NAME = frontEnvVars.VITE_APP_DISPLAY_NAME or "build-time",
        VITE_JWT_SECURITY_PASSPHRASE = frontEnvVars.VITE_JWT_SECURITY_PASSPHRASE and "Found" or "server-side-only",
    }
}

-- ---------- Nginx Process Metrics ----------

-- Nginx memory: ps aux works on GNU + BusyBox (columns: %CPU=3, VSZ=5, RSS=6 on GNU; varies on BusyBox)
-- Use ps -eo first (GNU), fall back to ps -o (BusyBox)
local nginxRssKb = shell_exec("ps -eo rss,comm 2>/dev/null | grep nginx | awk '{sum+=$1} END {print sum+0}'")
if not nginxRssKb or nginxRssKb:gsub("%s+", "") == "" or nginxRssKb:gsub("%s+", "") == "0" then
    -- BusyBox: ps -o rss,comm — values may have 'm' suffix (megabytes)
    nginxRssKb = shell_exec("ps -o rss,comm 2>/dev/null | grep nginx | awk '{v=$1; if(v~/m$/){gsub(/m/,\"\",v); v=v*1024}; sum+=v} END {print sum+0}'")
end
nginxRssKb = (nginxRssKb or "0"):gsub("%s+", "")
local nginxRssMb = string.format("%.1f", (tonumber(nginxRssKb) or 0) / 1024)

local nginxVszKb = shell_exec("ps -eo vsz,comm 2>/dev/null | grep nginx | awk '{sum+=$1} END {print sum+0}'")
if not nginxVszKb or nginxVszKb:gsub("%s+", "") == "" or nginxVszKb:gsub("%s+", "") == "0" then
    nginxVszKb = shell_exec("ps -o vsz,comm 2>/dev/null | grep nginx | awk '{v=$1; if(v~/m$/){gsub(/m/,\"\",v); v=v*1024}; sum+=v} END {print sum+0}'")
end
nginxVszKb = (nginxVszKb or "0"):gsub("%s+", "")
local nginxVszMb = string.format("%.1f", (tonumber(nginxVszKb) or 0) / 1024)

-- Nginx limits and config
local openFilesLimit = shell_exec("cat /proc/1/limits 2>/dev/null | grep 'Max open files' | awk '{print $4}'") or shell_exec("ulimit -n 2>/dev/null") or "unknown"
openFilesLimit = openFilesLimit:gsub("%s+", "")
-- nginx config values: parse from config file directly (works regardless of user permissions)
local nginxConfPaths = {
    "/usr/local/openresty/nginx/conf/nginx.conf",
    "/etc/nginx/nginx.conf",
    "/opt/nginx/nginx.conf",
}
local nginxConf = nil
for _, path in ipairs(nginxConfPaths) do
    nginxConf = readFile(path)
    if nginxConf then break end
end
local workerConnections = "unknown"
local workerProcessesConf = "unknown"
local workerRlimitNofile = nil
if nginxConf then
    workerConnections = nginxConf:match("worker_connections%s+(%d+)") or "unknown"
    workerProcessesConf = nginxConf:match("worker_processes%s+(%S+)") or "unknown"
    workerProcessesConf = workerProcessesConf:gsub(";", "")
    local rlimit = nginxConf:match("worker_rlimit_nofile%s+(%d+)")
    if rlimit then workerRlimitNofile = rlimit end
end

-- Total system memory for percentage calculation
local totalMemKb = (shell_exec("grep MemTotal /proc/meminfo 2>/dev/null | awk '{print $2}'") or "0"):gsub("%s+", "")
local nginxMemPercent = string.format("%.1f", (tonumber(nginxRssKb) or 0) / (tonumber(totalMemKb) or 1) * 100)

-- CPU: /proc/stat is most reliable across all Linux (GNU, BusyBox, SUSE, Debian)
local systemCpuUsage = shell_exec("cat /proc/stat 2>/dev/null | head -1 | awk '{total=0; for(i=2;i<=NF;i++) total+=$i; idle=$5; if(total>0) printf \"%.1f\", 100*(total-idle)/total; else print \"0\"}'")
systemCpuUsage = (systemCpuUsage or "0"):gsub("%s+", "")

local cpuCores = shell_exec("nproc 2>/dev/null") or shell_exec("grep -c ^processor /proc/cpuinfo 2>/dev/null") or "unknown"
cpuCores = cpuCores:gsub("%s+", "")

-- ---------- System Info ----------

local appName = settings.env_vars.APP_NAME or os.getenv("APP_NAME") or "wslproxy"
local appVersion = settings.env_vars.VERSION or os.getenv("VERSION") or "unknown"
local appHost = settings.env_vars.HOSTNAME or os.getenv("HOSTNAME") or "unknown"
local deploymentTime = settings.env_vars.VITE_DEPLOYMENT_TIME or os.getenv("VITE_DEPLOYMENT_TIME")

local system = {
    app = appName,
    version = appVersion,
    hostname = appHost,
    openresty_version = openrestyVersion or "unknown",
    storage_type = storageType,
    env_profile = envProfile,
    deployment_time = deploymentTime,
    uptime = shell_exec("uptime -s 2>/dev/null") or "unknown",
    swagger_url = ngx.var.scheme .. "://" .. ngx.var.http_host .. "/swagger/",
    cpu = {
        cores = cpuCores,
        system_usage_percent = systemCpuUsage,
    },
    nginx = {
        worker_count = workerCount,
        worker_processes_conf = workerProcessesConf,
        worker_connections = workerConnections,
        worker_rlimit_nofile = workerRlimitNofile,
        open_files_limit = openFilesLimit,
        memory_rss_mb = nginxRssMb,
        memory_vsz_mb = nginxVszMb,
        memory_percent = nginxMemPercent,
    }
}

-- ---------- Overall Status ----------

if hasCriticalFailure then
    overallStatus = "unhealthy"
elseif hasWarning then
    overallStatus = "degraded"
end

-- ---------- Response ----------

local data = {
    status = overallStatus,
    response = "pong",
    timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ"),
    services = services,
    data_directories = dataDirectories,
    settings = settingsCheck,
    frontend_env = frontendEnv,
    environment = environment,
    system = system
}

ngx.say(cjson.encode(data))
