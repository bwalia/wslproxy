local http = require("resty.http")
local PushData = {}

function PushData.sendData(instance, Helper, configPath, Errors, JWT_PP)
    local instanceId, profile = instance.instance or nil, instance.profile or "prod"
    local instancePath = string.format("%sdata/instances/%s/%s.json", configPath, profile, instanceId)
    if instanceId then
        local instanceData, instanceErr = Helper.getDataFromFile(instancePath)
        if instanceData and instanceData ~= nil and instanceData ~= ngx.null then
            local instanceResult, folderPath = Cjson.decode(instanceData), string.format("%sdata/servers", configPath)
            
            local token = ngx.req.get_headers()["Authorization"]
            if not token then
                ngx.status = ngx.HTTP_UNAUTHORIZED
                ngx.say("Missing token")
                return ngx.exit(ngx.HTTP_UNAUTHORIZED)
            end
            token = string.gsub(token, "^Bearer ", "")

            PushData.pushToServer(
                instanceResult.host_ip,
                instanceResult.host_port,
                string.format("%s/%s", folderPath, instance.profile),
                Helper,
                "servers",
                Errors,
                token
            )
        else
            Errors.throwError("Couldn't read file: " .. instanceErr, ngx.HTTP_INTERNAL_SERVER_ERROR)
        end
    end
end

function PushData.pushToServer(server, port, folderPath, Helper, dataType, Errors, token)
    local httpc, apiUrl = http.new(), string.format("http://%s:%s/api/%s", server, port, dataType)
    for file_name in LFS.dir(folderPath) do
        if file_name:match("%.json$") then
            local file_path = folderPath .. "/" .. file_name
            local json_content, err = Helper.getDataFromFile(file_path)

            if not json_content then
                Errors.throwError("Couldn't read file: " .. err, ngx.HTTP_INTERNAL_SERVER_ERROR)
            else
                -- Parse JSON to validate
                local json_data = Cjson.decode(json_content)

                -- Send POST request
                local res, resErr = httpc:request_uri(apiUrl, {
                    method = "POST",
                    body = json_content,
                    headers = {
                        ["Content-Type"] = "application/json",
                        ["Authorization"] = "Bearer " .. token,
                    }
                })

                if not res then
                    Errors.throwError("Failed to send request for file " .. file_name .. " " .. resErr, ngx.HTTP_INTERNAL_SERVER_ERROR)
                else
                    ngx.say("Response for ", file_name, ": ", res.status, " - ", res.body)
                end
            end
        end
    end
end

return PushData
