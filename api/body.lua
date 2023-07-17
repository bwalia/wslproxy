ngx.req.read_body()  -- explicitly read the req body
local data = ngx.req.get_body_data()
if data then
    ngx.say("body data:")
    ngx.print(data)
    return
end

-- body may get buffered in a temp file:
local file = ngx.req.get_body_file()
if file then
    ngx.say("body is in file ", file)
else
    ngx.say("no body found")
end