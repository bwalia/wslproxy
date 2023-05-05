local json = require("cjson")
-- local lfs = require "lfs"
local _Servers = {}

function _Servers.getServers()
    if ngx.req.get_method() == "GET" then
        local directory = "/usr/local/openresty/nginx/html/data/servers"
        local files = {}
        -- Run the 'ls' command to get a list of filenames
        local output = io.popen("ls /usr/local/openresty/nginx/html/data/servers"):read("*all")
        for filename in string.gmatch(output, "[^\r\n]+") do
            table.insert(files, filename)
        end
        -- Print the list of filenames
        for _, filename in ipairs(files) do
            print(filename)
        end
        local jsonData = {}
        for _, filename in ipairs(files) do
            local file, err = io.open("/usr/local/openresty/nginx/html/data/servers/" .. filename, "rb")
            if file == nil then
                ngx.say("Couldn't read file: " .. err)
            else
                local jsonString = file:read "*a"
                file:close()
                local servers = json.decode(jsonString)

                jsonData[_] = servers
            end
        end
        return json.encode({ data = jsonData, total = 3 })
    else
        local args, err = ngx.req.request_body()
        return ngx.say(args)
    end
end

-- function _Servers.postServer(ngx)
--     return json.encode(ngx.req.read_body())
-- end

return _Servers
