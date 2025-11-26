-- Prometheus Metrics Endpoint Handler for Whitefalcon Gateway
-- This file is called by nginx location /metrics

local function serve_metrics()
    local ok, metrics = pcall(require, "prometheus_metrics")
    if ok and metrics.is_initialized() then
        local metric_connections = metrics.get_metric_connections()
        local prometheus = metrics.get_prometheus()
        if metric_connections and prometheus then
            -- Update connection metrics
            metric_connections:set(tonumber(ngx.var.connections_reading) or 0, {"reading"})
            metric_connections:set(tonumber(ngx.var.connections_waiting) or 0, {"waiting"})
            metric_connections:set(tonumber(ngx.var.connections_writing) or 0, {"writing"})
            -- Let prometheus library handle the output
            prometheus:collect()
        else
            -- Metrics available but not fully initialized
            ngx.status = 200
            ngx.header.content_type = "text/plain"
            ngx.say("# Prometheus metrics not available")
        end
    else
        -- Prometheus not available - log and return message
        ngx.log(ngx.ERR, "Failed to load metrics module: ", tostring(metrics))
        ngx.status = 200
        ngx.header.content_type = "text/plain"
        ngx.say("# Prometheus metrics not available")
    end
end

serve_metrics()
