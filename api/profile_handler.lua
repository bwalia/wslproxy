local function handle_post_request(args)
    
end
if ngx.req.get_method() == "POST" then
    ngx.req.read_body()
    handle_post_request(ngx.req.get_post_args())
end