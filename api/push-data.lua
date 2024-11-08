local http = require("resty.http")
local PushData = {}

function PushData.sendData(instance, Helper, configPath, Errors)
    local instanceId, profile = instance.instance or nil, instance.profile or "prod"
    local instancePath = string.format("%sdata/instances/%s/%s.json", configPath, profile, instanceId)
    if instanceId then
        local instanceData, instanceErr = Helper.getDataFromFile(instancePath)
        if instanceData and instanceData ~= nil and instanceData ~= ngx.null then
            local instanceResult, serversFolderPath = Cjson.decode(instanceData), string.format("%sdata/servers", configPath)
            local servers, rules, message = {}, {}, {}
            if instanceResult.instance_status == "true" then
                local rulesFolderPath = string.format("%sdata/rules", configPath)
    
                local token = ngx.req.get_headers()["Authorization"]
                if not token then
                    Errors.throwError("Missing JWT Bearer token", ngx.HTTP_UNAUTHORIZED)
                end
                token = string.gsub(token, "^Bearer ", "")
    
                servers = PushData.pushToServer(
                    instanceResult.host_ip,
                    instanceResult.host_port,
                    string.format("%s/%s", serversFolderPath, instance.profile),
                    Helper,
                    "servers",
                    Errors,
                    token
                )
                rules = PushData.pushToServer(
                    instanceResult.host_ip,
                    instanceResult.host_port,
                    string.format("%s/%s", rulesFolderPath, instance.profile),
                    Helper,
                    "rules",
                    Errors,
                    token
                )
                table.insert(message, string.format("servers and rules are successfully pushed to %s", instanceResult.instance_name))
            else
                table.insert(message, string.format("You can't push data to %s because it is not active.", instanceResult.instance_name))
            end
            ngx.say(Cjson.encode({
                data = {
                    servers = servers,
                    rules = rules,
                    message = message
                }
            }))
            ngx.exit(ngx.HTTP_OK)
        else
            Errors.throwError("Couldn't read file: " .. instanceErr, ngx.HTTP_INTERNAL_SERVER_ERROR)
        end
    end
end

function PushData.pushToServer(server, port, folderPath, Helper, dataType, Errors, token)
    local httpc, apiUrl = http.new(), string.format("http://%s:%s/api/%s", server, port, dataType)
    local response = {}
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
                    local result = {
                        file_name = file_name,
                        error = resErr,
                    }
                    table.insert(response, result)
                else
                    local result = {
                        file_name = file_name,
                        status = res.status
                    }
                    table.insert(response, result)
                end
            end
        end
    end
    return response
end

return PushData
