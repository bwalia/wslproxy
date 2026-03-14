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
if openrestyVersion then
    openrestyVersion = openrestyVersion:gsub('%s+', '')
end
services.openresty = {
    status = "ok",
    version = openrestyVersion or "unknown"
}

-- Nginx workers
local workerOutput = shell_exec("pgrep -c 'nginx: worker' 2>/dev/null")
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

local currentDir = lfs.currentdir()
if not currentDir or currentDir == "/" then
    currentDir = "/usr/local/openresty/nginx/html/openresty-admin"
end

local frontEnvPath = currentDir .. "/.env"
local frontEnvContent = readFile(frontEnvPath)
local frontEnvVars = parseEnvFile(frontEnvContent)

local requiredFrontVars = {
    "VITE_API_URL",
    "VITE_FRONT_URL",
    "VITE_APP_VERSION",
    "VITE_DEPLOYMENT_TIME"
}

local frontendEnv = {
    status = "ok",
    file_exists = frontEnvContent ~= nil,
    variables = {},
    missing = {}
}

if not frontEnvContent then
    frontendEnv.status = "error"
    frontendEnv.error = "File not found: " .. frontEnvPath
    hasWarning = true
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
        VITE_API_URL = frontEnvVars.VITE_API_URL or "Not Found",
        VITE_FRONT_URL = frontEnvVars.VITE_FRONT_URL or "Not Found",
        VITE_APP_VERSION = frontEnvVars.VITE_APP_VERSION or "Not Found",
        VITE_DEPLOYMENT_TIME = frontEnvVars.VITE_DEPLOYMENT_TIME or "Not Found",
        VITE_APP_DISPLAY_NAME = frontEnvVars.VITE_APP_DISPLAY_NAME or "Not Found",
        VITE_JWT_SECURITY_PASSPHRASE = frontEnvVars.VITE_JWT_SECURITY_PASSPHRASE and "Found" or "Not Found",
    }
}

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
    swagger_url = ngx.var.scheme .. "://" .. ngx.var.http_host .. "/swagger/"
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
