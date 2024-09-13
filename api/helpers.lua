local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local Helper = {}

-- Load Global Settings
function Helper.settings()
    local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
    local settings = {}
    if readSettings == nil then
        ngx.say(Cjson.encode(
            "Couldn't read file: data/settings.json " .. errSettings
        ))
        ngx.status = ngx.HTTP_BAD_REQUEST
        ngx.exit(ngx.HTTP_BAD_REQUEST)
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
    local openrestyPath = "openresty"
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
function Helper.directoryExists(path)
    local attr = LFS.attributes(path)
    return attr and attr.mode == "directory"
end

-- Delete Directory
function Helper.removeDir(path)
    -- Check if path exists
    if Helper.directoryExists(path) then
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

return Helper