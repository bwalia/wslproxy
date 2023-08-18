ngx.var.proxy_host_override = ngx.ctx.proxy_host_override
if false then
    ngx.var.proxy_host = "10.43.69.108"
    ngx.var.proxy_port = "3009"
end
ngx.var.upstream_server = ngx.var.proxy_host..":"..ngx.var.proxy_port
