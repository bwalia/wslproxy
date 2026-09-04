-- Rotate SECRETS_ENCRYPTION_KEY: re-encrypt every value in
-- data/secrets/<profile>/*.json from OLD_SECRETS_ENCRYPTION_KEY to
-- NEW_SECRETS_ENCRYPTION_KEY.
--
-- Requires the OpenResty resty CLI.  Run from the repo root:
--
--   # Dry-run (prints what would change, mutates nothing):
--   OLD_SECRETS_ENCRYPTION_KEY=<old_b64> \
--   NEW_SECRETS_ENCRYPTION_KEY=<new_b64> \
--     resty scripts/rotate-secrets-key.lua <profile>
--
--   # Apply for real (writes .bak files before overwriting):
--   OLD_SECRETS_ENCRYPTION_KEY=<old_b64> \
--   NEW_SECRETS_ENCRYPTION_KEY=<new_b64> \
--     resty scripts/rotate-secrets-key.lua <profile> --apply
--
-- After a successful --apply on every profile, set the NEW key in
-- data/settings.json env_vars and reload OpenResty.  Then update the
-- password-manager + offline copies of the key.
--
-- Rollback: each rewritten file has a .bak alongside it.  If something
-- goes wrong, restore from .bak and leave the OLD key configured.
-- Once verified, delete the .bak files.

package.path = "api/?.lua;api/?/init.lua;" .. package.path

local aes = require "resty.aes"
local resty_random = require "resty.random"
local cjson = require "cjson"

local function die(msg)
    io.stderr:write("error: " .. msg .. "\n")
    os.exit(1)
end

local function b64_key(env_name)
    local b64 = os.getenv(env_name)
    if not b64 or b64 == "" then
        die(env_name .. " env var not set")
    end
    local raw = ngx.decode_base64(b64)
    if not raw or #raw ~= 32 then
        die(env_name .. " must decode to 32 raw bytes")
    end
    return raw
end

local CIPHER = aes.cipher(256, "gcm")

local function decrypt(key, blob)
    local ct = ngx.decode_base64(blob.ciphertext)
    local iv = ngx.decode_base64(blob.iv)
    local tag = ngx.decode_base64(blob.tag)
    if not ct or not iv or not tag then return nil, "invalid base64" end
    local a = aes:new(key, nil, CIPHER, { iv = iv }, nil, nil, false)
    if not a then return nil, "aes:new failed" end
    local pt, err = a:decrypt(ct, tag)
    if not pt then return nil, err or "decrypt failed" end
    return pt
end

local function encrypt(key, plaintext)
    local iv = resty_random.bytes(12, true)
    local a = aes:new(key, nil, CIPHER, { iv = iv }, nil, nil, false)
    if not a then return nil, "aes:new failed" end
    local res = a:encrypt(plaintext)
    local ct, tag = res[1], res[2]
    return {
        encrypted = true, alg = "aes-256-gcm",
        ciphertext = ngx.encode_base64(ct),
        iv = ngx.encode_base64(iv),
        tag = ngx.encode_base64(tag),
    }
end

local function read_file(path)
    local f, err = io.open(path, "rb")
    if not f then return nil, err end
    local content = f:read("*a"); f:close()
    return content
end

local function write_file(path, content)
    local f, err = io.open(path, "wb")
    if not f then return nil, err end
    f:write(content); f:close()
    return true
end

-- Argument parsing
local profile = arg[1]
local apply = false
for i = 2, #arg do
    if arg[i] == "--apply" then apply = true end
end
if not profile or profile == "" then
    die("usage: resty scripts/rotate-secrets-key.lua <profile> [--apply]")
end

local old_key = b64_key("OLD_SECRETS_ENCRYPTION_KEY")
local new_key = b64_key("NEW_SECRETS_ENCRYPTION_KEY")

local dir = "data/secrets/" .. profile
local ls = io.popen("ls " .. dir .. "/*.json 2>/dev/null")
if not ls then die("cannot list " .. dir) end

local rotated, skipped, errors = 0, 0, 0
for path in ls:lines() do
    local raw, rerr = read_file(path)
    if not raw then
        io.stderr:write("skip " .. path .. ": " .. tostring(rerr) .. "\n")
        errors = errors + 1
    else
        local ok, record = pcall(cjson.decode, raw)
        if not ok or type(record) ~= "table" then
            io.stderr:write("skip " .. path .. ": bad json\n")
            errors = errors + 1
        elseif type(record.secrets) ~= "table" then
            skipped = skipped + 1
        else
            local touched = false
            for _, entry in ipairs(record.secrets) do
                if type(entry.value) == "table" and entry.value.encrypted then
                    local pt, derr = decrypt(old_key, entry.value)
                    if not pt then
                        io.stderr:write("decrypt fail " .. path ..
                            " key=" .. tostring(entry.key) .. ": " .. tostring(derr) .. "\n")
                        errors = errors + 1
                    else
                        local newblob, eerr = encrypt(new_key, pt)
                        if not newblob then
                            io.stderr:write("re-encrypt fail " .. path ..
                                " key=" .. tostring(entry.key) .. ": " .. tostring(eerr) .. "\n")
                            errors = errors + 1
                        else
                            entry.value = newblob
                            touched = true
                        end
                    end
                end
            end
            if touched then
                if apply then
                    -- Write .bak before overwriting.
                    write_file(path .. ".bak", raw)
                    local ok2, werr = write_file(path, cjson.encode(record))
                    if not ok2 then
                        io.stderr:write("write fail " .. path .. ": " .. tostring(werr) .. "\n")
                        errors = errors + 1
                    else
                        rotated = rotated + 1
                        print("rotated: " .. path)
                    end
                else
                    rotated = rotated + 1
                    print("would rotate: " .. path)
                end
            else
                skipped = skipped + 1
            end
        end
    end
end
ls:close()

print(string.format("summary: rotated=%d skipped=%d errors=%d apply=%s",
    rotated, skipped, errors, tostring(apply)))
if errors > 0 then
    io.stderr:write("errors were encountered — see stderr\n")
    os.exit(1)
end
if not apply and rotated > 0 then
    print("dry-run complete.  Re-run with --apply to write changes.")
end
