local Errors = {}

function Errors.throwError(message, statusCode)
    ngx.status = statusCode
    ngx.say(Cjson.encode({
        error = message
    }))
    ngx.exit(statusCode)
end

return Errors