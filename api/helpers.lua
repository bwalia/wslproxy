local ApiErrors = require("errors")
local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local Helper = {}

-- Load Global Settings
function Helper.settings()
    local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
    local settings = {}
    if readSettings == nil then
        ApiErrors.throwError("Couldn't read file: data/settings.json " .. errSettings, ngx.HTTP_BAD_REQUEST)
    else
        local jsonString = readSettings:read "*a"
        readSettings:close()
        settings = Cjson.decode(jsonString)
    end
    return settings
end

-- Asc Table
function Helper.sortAsc(field)
    return function(a, b)
        local aValue = a[field]
        local bValue = b[field]

        if aValue == nil and bValue == nil then
            return false
        elseif aValue == nil then
            return false
        elseif bValue == nil then
            return true
        end

        return aValue < bValue
    end
end

-- Desc Table
function Helper.sortDesc(field)
    return function(a, b)
        local aValue = a[field]
        local bValue = b[field]

        if aValue == nil and bValue == nil then
            return false
        elseif aValue == nil then
            return false
        elseif bValue == nil then
            return true
        end

        return aValue > bValue
    end
end

-- Generate UUID
function Helper.generate_uuid()
    local random = math.random(1000000000)
    local timestamp = os.time
    local hash = ngx.md5(tostring(random) .. tostring(timestamp))
    local uuid = string.format("%s-%s-%s-%s-%s", string.sub(hash, 1, 8), string.sub(hash, 9, 12),
        string.sub(hash, 13, 16), string.sub(hash, 17, 20), string.sub(hash, 21, 32))
    return uuid
end

-- Check if string is IP or not
function Helper.isIpAddress(str)
    local pattern = "^%d+%.%d+%.%d+%.%d+:%d*$" -- IP with port
    local ip_pattern = "^%d+%.%d+%.%d+%.%d+$" -- IP without port

    local ip_part = string.match(str, ip_pattern)
    local ip_with_port_part = string.match(str, pattern)

    if ip_part or ip_with_port_part then
        -- Extract IP and port if available
        local a, b, c, d, port = string.match(str, "(%d+)%.(%d+)%.(%d+)%.(%d+):?(%d*)")
        if tonumber(a) <= 255 and tonumber(b) <= 255 and tonumber(c) <= 255 and tonumber(d) <= 255 then
            if port == "" or (tonumber(port) and tonumber(port) <= 65535) then
                return true
            end
        end
    end
    return false
end

-- Test Nginx server block
function Helper.testNginxConfig()
    local openrestyPath = "sudo openresty"
    local command = openrestyPath .. " -t 2>&1"

    local handle = io.popen(command)
    if handle then
        local result = handle:read("*all")
        local success, _, _ = handle:close()
        return result, success
    else
        return "Failed to execute command.", false
    end
end

-- Check String contains Messagelocal function check_nginx_syntax_ok(output)
function Helper.isStringContains(stringPtrn, message)
    if string.find(message, stringPtrn) then
        return true
    else
        return false
    end
end

-- Check is Directory exists
function Helper.isDirectoryExists(path)
    local attr = LFS.attributes(path)
    return attr and attr.mode == "directory"
end

-- Delete Directory
function Helper.removeDir(path)
    -- Check if path exists
    if Helper.isDirectoryExists(path) then
        -- Recursively delete contents of the directory
        for file in LFS.dir(path) do
            if file ~= "." and file ~= ".." then
                local full_path = path .. "/" .. file
                local attr = LFS.attributes(full_path)
                if attr.mode == "directory" then
                    -- Recursively remove subdirectory
                    Helper.removeDir(full_path)
                else
                    -- Remove file
                    os.remove(full_path)
                end
            end
        end
        -- Remove the now empty directory
        LFS.rmdir(path)
        return "Directory removed: " .. path
    else
        return "Directory does not exist: " .. path
    end
end

-- Read Log file
function Helper.readLogFile(path)
    local file, fileErr = io.open(path, "r")
    if not file then return fileErr, ngx.HTTP_BAD_REQUEST end
    
    local max_size = 10 * 1024  -- 10KB
    file:seek("end", -max_size)
    local content = file:read("*a")
    file:close()
    return content, ngx.HTTP_OK
end

-- Hash password
function Helper.hashPassword(password)
    local resty_sha256 = require "resty.sha256"
    local sha256 = resty_sha256:new()
    sha256:update(password)
    local digest = sha256:final()
    local hash = ngx.encode_base64(digest)
    return hash
end

-- Generate JWT Token
function Helper.generateToken()
    local settings = Helper.settings()
    local jwt = JWT
    local passPhrase = settings.env_vars.JWT_SECURITY_PASSPHRASE or os.getenv("JWT_SECURITY_PASSPHRASE")
    return jwt:sign(passPhrase, {
        header = {
            typ = "JWT",
            alg = "HS256"
        },
        payload = {
            sub = "123456",
            exp = ngx.time() + 3600
        }
    })
end

-- Check if file Exists on path
function Helper.isFileExists(filePath)
    local attr = LFS.attributes(filePath)
    if attr then
        return true
    else
        return false
    end
end

-- Read data from file
function Helper.getDataFromFile(path)
    local fileData = nil
    local file, err = io.open(path, "rb")
    if file ~= nil then
        fileData = file:read "*a"
        file:close()
    end
    return fileData, err
end

-- Clean the string remove double qoutes from start and end
function Helper.cleanString(input)
    -- Remove double quotes from start and end
    local output = input:match('^"(.*)"$') or input
    -- Replace \n with new line
    output = output:gsub("\\n", "\n")
    return output
end

-- Create Directory
function Helper.createDirectoryRecursive(path)
    return LFS.mkdir(path)
end

-- Save data to files
function Helper.setDataToFile(path, value, dir, fileType)
    -- Check if the directory exists
    if not Helper.isDirectoryExists(dir) then
        -- Directory doesn't exist, so create it
        local parent = dir:match("^(.*)/[^/]+/?$")
        if parent and not Helper.isDirectoryExists(parent) then
            Helper.createDirectoryRecursive(parent)  -- Recursively create parent directories
        end
        local success, errorMsg = Helper.createDirectoryRecursive(dir)
        if errorMsg ~= nil then
            ApiErrors.throwError(errorMsg .. " while creating " .. dir, ngx.HTTP_BAD_REQUEST)
        end
    end
    local file, err = io.open(path, "w")
    if file == nil then
        ApiErrors.throwError("Couldn't read file: " .. err, ngx.HTTP_BAD_REQUEST)
    else
        if fileType == "conf" then
            local cleanedContent = value:gsub('"(.-)"', function(s)
                return Helper.cleanString(s)
            end)
            file:write(cleanedContent)
            file:close()
        else
            file:write(Cjson.encode(value))
            file:close()
        end
    end
end

-- Convert payloads to Lua table
function Helper.GetPayloads(body)
    local keyset = {}
    local n = 0
    for k, v in pairs(body) do
        n = n + 1
        if type(v) == "string" then
            if v ~= nil and v ~= "" then
                table.insert(keyset, Cjson.decode(k .. v))
            end
        else
            table.insert(keyset, Cjson.decode(k))
        end
    end
    return keyset[1]
end

function Helper.isBase64(input)
    return input:match("^[A-Za-z0-9+/=]+$") ~= nil
end
local b='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
function Helper.decodeBase64(data)
    if not Helper.isBase64(data) then
        return nil, "Invalid Base64 input."
    end
    
    data = data:gsub('[^'..b..'=]', '')  -- Remove any non-base64 characters
    return (data:gsub('.', function(x)
        if x == '=' then return '' end
        local r, f = '', (b:find(x) - 1)
        for i = 6, 1, -1 do r = r .. (f % 2 ^ i - f % 2 ^ (i - 1) > 0 and '1' or '0') end
        return r;
    end):gsub('%d%d%d%d%d%d%d%d', function(x)
        return string.char(tonumber(x, 2))
    end))
end

return Helper