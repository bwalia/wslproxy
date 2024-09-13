local Conf = {}

local function isDirectoryExists(path)
    local attributes = LFS.attributes(path)
    return attributes and attributes.mode == "directory"
end

local function createDirectoryRecursive(path)
    return LFS.mkdir(path)
end

local function isDir(path)
    return LFS.attributes(path, "mode") == "directory"
end

local function fileMd5(filePath)
    local file = io.open(filePath, "r")
    if not file then
        error("Could not open file: " .. filePath)
    end

    local content = file:read("*a")
    file:close()

    local md5 = ngx.md5(content)
    return md5
end

function Conf.compareFiles(sourceFile, destinationFile)
    local md5File1 = fileMd5(sourceFile)
    local md5File2 = fileMd5(destinationFile)
    if md5File1 == md5File2 then
        return true
    else
        return false
    end
end

function Conf.CreateNginxFlag(rebootFilePath)
    local filePath = rebootFilePath
    local file, fileErr = io.open(filePath, "w")
    if file == nil then
        ngx.status = ngx.HTTP_BAD_REQUEST
        ngx.say(Cjson.encode({
            data = {
                message = fileErr .. " while creating " .. rebootFilePath
            }
        }))
        ngx.exit(ngx.HTTP_BAD_REQUEST)
    else
        file:write("nginx restart")
        file:close()
    end
end

local function cleanString(input)
    -- Remove double quotes from start and end
    local output = input:match('^"(.*)"$') or input

    -- Replace \n with new line
    output = output:gsub("\\n", "\n")

    return output
end

function Conf.saveConfFiles(dir, conf, fileName)
    if not isDirectoryExists(dir) then
        local parent = dir:match("^(.*)/[^/]+/?$")
        if parent and not isDir(parent) then
            createDirectoryRecursive(parent)
        end
        local success, errorMsg = createDirectoryRecursive(dir)
        if errorMsg ~= nil then
            ngx.status = ngx.HTTP_BAD_REQUEST
            ngx.say(Cjson.encode({
                data = {
                    message = errorMsg  .. " while creating " .. dir
                }
            }))
            ngx.exit(ngx.HTTP_BAD_REQUEST)
        end
    end

    local file, fileErr = io.open(dir .. "/" .. fileName, "w")
    if file == nil then
        ngx.status = ngx.HTTP_BAD_REQUEST
        ngx.say(Cjson.encode({
            data = {
                message = fileErr  .. " while opening " .. file
            }
        }))
        ngx.exit(ngx.HTTP_BAD_REQUEST)
    else
        local cleanedContent = conf:gsub('"(.-)"', function(s)
            return cleanString(s)
        end)
        file:write(cleanedContent)
        file:close()
    end
end

return Conf