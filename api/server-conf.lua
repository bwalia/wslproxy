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

-- The reboot flag is an optional signal for the cron watcher
-- (nginx_restart_if_required.sh.j2) that a config change wants a
-- reload.  Routing (rules + server JSON) is already live per-request
-- via the gateway lua chain, so a failure to write this file MUST NOT
-- block the API save — it only delays the reload.
--
-- History: the flag originally lived at /var/run/nginx/... but that
-- directory is root-owned tmpfs on modern Debian/systemd — the
-- www-data openresty worker can't create files there without a chmod.
-- A pre-2026-07 CreateNginxFlag threw HTTP 400 into the API response
-- on this write failure, breaking every server-update on prod for
-- weeks.  Two mitigations layered so the class-of-bug can't return:
--
--   1. CreateNginxFlag below silently REWRITES the legacy path to the
--      /tmp default before io.open, and treats any remaining write
--      failure as a non-fatal WARN (never propagates to the caller).
--   2. fix-permissions.sh.j2 relaxes /var/run/nginx to mode 775 as
--      belt-and-braces — even a hypothetical direct-io caller that
--      skipped the rewrite would still succeed.
--
-- init.lua also emits a WARN at startup if settings.reboot_file_path
-- is still the legacy value so operators notice the source drift.
local DEFAULT_REBOOT_FLAG = "/tmp/nginx/nginx-reboot-required"
local LEGACY_REBOOT_FLAG = "/var/run/nginx/nginx-reboot-required"

local function ensureParentDir(filePath)
    local parent = string.match(filePath, "(.+)/[^/]+$")
    if not parent or isDirectoryExists(parent) then
        return
    end
    local grandparent = parent:match("^(.*)/[^/]+/?$")
    if grandparent and not isDir(grandparent) then
        createDirectoryRecursive(grandparent)
    end
    createDirectoryRecursive(parent)
end

local function writeRebootFlag(filePath)
    local file, fileErr = io.open(filePath, "w")
    if file == nil then
        return false, fileErr
    end
    file:write("nginx restart")
    file:close()
    return true
end

function Conf.CreateNginxFlag(rebootFilePath)
    -- Optional signal for the cron watcher to restart openresty. Routing
    -- (rules + server JSON) is already live per-request without this.
    if rebootFilePath == LEGACY_REBOOT_FLAG or rebootFilePath == nil or rebootFilePath == "" then
        rebootFilePath = DEFAULT_REBOOT_FLAG
    end

    ensureParentDir(rebootFilePath)
    local ok, fileErr = writeRebootFlag(rebootFilePath)
    if not ok and rebootFilePath ~= DEFAULT_REBOOT_FLAG then
        ensureParentDir(DEFAULT_REBOOT_FLAG)
        ok, fileErr = writeRebootFlag(DEFAULT_REBOOT_FLAG)
    end
    if not ok then
        ngx.log(ngx.WARN, "CreateNginxFlag: ", fileErr or "unknown error",
            " while creating ", rebootFilePath,
            " — server data saved; reload is optional and can be done separately")
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
                message = fileErr  .. " while opening " .. fileName
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