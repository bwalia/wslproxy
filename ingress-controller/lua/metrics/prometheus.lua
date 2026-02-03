-- prometheus.lua
-- Simple Prometheus metrics exporter for Lua
-- Based on lua-resty-prometheus but simplified

local _M = { _VERSION = '1.0.0' }

local metrics_dict = ngx.shared.prometheus_metrics

-- Initialize metrics table at module level (singleton pattern)
_M.metrics = {}

-- Create a new Prometheus instance (optional, module can be used directly)
function _M:new()
    local instance = {
        metrics = {}
    }
    setmetatable(instance, {__index = self})
    return instance
end

-- Counter metric
function _M:counter(name, help, labels)
    self.metrics[name] = {
        type = "counter",
        help = help,
        labels = labels or {}
    }

    return {
        inc = function(self, label_values, value)
            local key = name
            if label_values then
                for k, v in pairs(label_values) do
                    key = key .. ":" .. k .. "=" .. v
                end
            end

            local current = metrics_dict:get(key) or 0
            metrics_dict:set(key, current + (value or 1))
        end
    }
end

-- Histogram metric
function _M:histogram(name, help, labels)
    self.metrics[name] = {
        type = "histogram",
        help = help,
        labels = labels or {}
    }

    return {
        observe = function(self, label_values, value)
            local key = name
            if label_values then
                for k, v in pairs(label_values) do
                    key = key .. ":" .. k .. "=" .. v
                end
            end

            -- Store sum and count
            local sum_key = key .. ":sum"
            local count_key = key .. ":count"

            local current_sum = metrics_dict:get(sum_key) or 0
            local current_count = metrics_dict:get(count_key) or 0

            metrics_dict:set(sum_key, current_sum + value)
            metrics_dict:set(count_key, current_count + 1)
        end
    }
end

-- Collect and format metrics for Prometheus
function _M:collect()
    local output = {}

    -- Get all metrics from shared dict
    local keys = metrics_dict:get_keys(0)

    -- Group by metric name
    local grouped = {}
    for _, key in ipairs(keys) do
        local metric_name = key:match("^([^:]+)")
        if metric_name then
            if not grouped[metric_name] then
                grouped[metric_name] = {}
            end
            table.insert(grouped[metric_name], key)
        end
    end

    -- Format output
    for metric_name, metric_keys in pairs(grouped) do
        local metric_def = self.metrics[metric_name]
        if metric_def then
            table.insert(output, "# HELP " .. metric_name .. " " .. (metric_def.help or ""))
            table.insert(output, "# TYPE " .. metric_name .. " " .. metric_def.type)

            for _, key in ipairs(metric_keys) do
                if key:match(":sum$") or key:match(":count$") then
                    -- Skip, will be handled with histogram
                elseif key == metric_name then
                    -- No labels
                    local value = metrics_dict:get(key) or 0
                    table.insert(output, metric_name .. " " .. value)
                else
                    -- Has labels
                    local labels_str = key:gsub("^" .. metric_name .. ":", "")
                    labels_str = labels_str:gsub(":", ","):gsub("=", '="') .. '"'
                    local value = metrics_dict:get(key) or 0
                    table.insert(output, metric_name .. "{" .. labels_str .. "} " .. value)
                end
            end

            -- Handle histogram special case
            if metric_def.type == "histogram" then
                for _, key in ipairs(metric_keys) do
                    if key:match(":sum$") then
                        local base_key = key:gsub(":sum$", "")
                        local sum = metrics_dict:get(key) or 0
                        local count = metrics_dict:get(base_key .. ":count") or 0

                        local labels_str = base_key:gsub("^" .. metric_name .. ":", "")
                        if labels_str ~= base_key then
                            labels_str = labels_str:gsub(":", ","):gsub("=", '="') .. '"'
                            table.insert(output, metric_name .. "_sum{" .. labels_str .. "} " .. sum)
                            table.insert(output, metric_name .. "_count{" .. labels_str .. "} " .. count)
                        else
                            table.insert(output, metric_name .. "_sum " .. sum)
                            table.insert(output, metric_name .. "_count " .. count)
                        end
                    end
                end
            end
        end
    end

    ngx.say(table.concat(output, "\n"))
end

return _M
