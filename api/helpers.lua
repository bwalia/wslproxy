local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"
local Helper = {}

-- Load Global Settings
function Helper.settings()
    local readSettings, errSettings = io.open(configPath .. "data/settings.json", "rb")
    local settings = {}
    if readSettings == nil then
        ngx.say(Cjson.encode(
            "Couldn't read file: " .. errSettings
        ))
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
    local pattern = "^%d+%.%d+%.%d+%.%d+$"
    local match = string.match(str, pattern)
    if match then
        local a, b, c, d = string.match(str, "(%d+)%.(%d+)%.(%d+)%.(%d+)")
        if tonumber(a) <= 255 and tonumber(b) <= 255 and tonumber(c) <= 255 and tonumber(d) <= 255 then
            return true
        end
    end
    return false
end

return Helper