local PushData = {}

function PushData.sendData(instance)
    ngx.say(Cjson.encode(instance))
    ngx.exit(ngx.HTTP_OK)
end

return PushData