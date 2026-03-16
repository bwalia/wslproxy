-- Traffic Management API Module
-- REST handlers for traffic topology, backend stats, weight updates,
-- canary promote/rollback operations.

local cjson = require("cjson.safe")
local TrafficRouter = require("traffic_router")

local _M = {}

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-------------------------------------------------------------------------------
-- Helper: read all JSON files from a directory
-------------------------------------------------------------------------------
local function read_json_dir(dir_path)
    local results = {}
    local ok, lfs = pcall(require, "lfs")
    if not ok then return results end

    for file in lfs.dir(dir_path) do
        if file:match("%.json$") then
            local fh = io.open(dir_path .. file, "rb")
            if fh then
                local content = fh:read("*a")
                fh:close()
                local data = cjson.decode(content)
                if data then
                    table.insert(results, data)
                end
            end
        end
    end
    return results
end

-------------------------------------------------------------------------------
-- Helper: write JSON file atomically
-------------------------------------------------------------------------------
local function write_json_file(path, data)
    local json_str = cjson.encode(data)
    if not json_str then return false, "JSON encode failed" end

    local tmp_path = path .. ".tmp"
    local fh, err = io.open(tmp_path, "wb")
    if not fh then return false, "Cannot write: " .. tostring(err) end

    fh:write(json_str)
    fh:close()

    local ok, rename_err = os.rename(tmp_path, path)
    if not ok then
        os.remove(tmp_path)
        return false, "Rename failed: " .. tostring(rename_err)
    end
    return true
end

-------------------------------------------------------------------------------
-- GET /api/traffic/topology
-- Returns servers → rules → backends graph for the ingress overview
-------------------------------------------------------------------------------
function _M.get_topology(args)
    local profile_id = args.profile_id or "prod"
    local servers_dir = configPath .. "data/servers/" .. profile_id .. "/"
    local rules_dir = configPath .. "data/rules/" .. profile_id .. "/"

    local servers = read_json_dir(servers_dir)
    local rules = read_json_dir(rules_dir)

    -- Build a rules-by-id lookup
    local rules_map = {}
    for _, rule in ipairs(rules) do
        if rule.id then
            rules_map[rule.id] = rule
        end
    end

    -- Build topology nodes
    local topology = {
        servers = {},
        rules_with_backends = {},
        connections = {}
    }

    for _, server in ipairs(servers) do
        local server_node = {
            id = server.id,
            server_name = server.server_name,
            ssl_enabled = server.ssl_enabled,
            waf_enabled = server.waf_enabled,
            rate_limit_enabled = server.rate_limit_enabled,
            cache_enabled = server.cache_enabled,
            rule_ids = {}
        }

        -- Find associated rules
        if server.rules then
            local rule = rules_map[server.rules]
            if rule then
                table.insert(server_node.rule_ids, server.rules)

                -- If rule has backends, include in topology
                local response = rule.match and rule.match.response
                if response and response.backends and #response.backends > 0 then
                    local labels = {}
                    for _, b in ipairs(response.backends) do
                        table.insert(labels, b.label or b.address)
                    end

                    local stats = TrafficRouter.get_all_backend_stats(rule.id, labels)

                    table.insert(topology.rules_with_backends, {
                        rule_id = rule.id,
                        rule_name = rule.name,
                        server_name = server.server_name,
                        path = response.rules and response.rules.path or "/",
                        routing = response.routing or { mode = "weighted" },
                        backends = response.backends,
                        backend_stats = stats
                    })

                    -- Connections for visual graph
                    for _, b in ipairs(response.backends) do
                        table.insert(topology.connections, {
                            from = server.server_name,
                            to = b.address,
                            label = b.label,
                            weight = b.weight or 1
                        })
                    end
                else
                    -- Single backend via redirect_uri
                    if response and response.redirect_uri then
                        local single_label = response.redirect_uri
                        local single_stats = TrafficRouter.get_all_backend_stats(rule.id, { single_label })

                        table.insert(topology.rules_with_backends, {
                            rule_id = rule.id,
                            rule_name = rule.name,
                            server_name = server.server_name,
                            path = rule.match and rule.match.rules and rule.match.rules.path or "/",
                            routing = { mode = "single" },
                            backends = { { address = response.redirect_uri, label = single_label, weight = 100 } },
                            backend_stats = single_stats
                        })

                        table.insert(topology.connections, {
                            from = server.server_name,
                            to = response.redirect_uri,
                            label = "primary",
                            weight = 100
                        })
                    end
                end
            end
        end

        table.insert(topology.servers, server_node)
    end

    return { data = topology }
end

-------------------------------------------------------------------------------
-- GET /api/traffic/backends
-- Returns per-backend stats from the router_state shared dict
-------------------------------------------------------------------------------
function _M.get_backend_stats(args)
    local rule_id = args.rule_id
    local profile_id = args.profile_id or "prod"

    if not rule_id then
        return { status = 400, message = "rule_id is required" }
    end

    -- Load rule to get backend labels
    local rule_path = configPath .. "data/rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local fh = io.open(rule_path, "rb")
    if not fh then
        return { status = 404, message = "Rule not found: " .. rule_id }
    end
    local content = fh:read("*a")
    fh:close()
    local rule = cjson.decode(content)
    if not rule then
        return { status = 500, message = "Failed to parse rule JSON" }
    end

    local response = rule.match and rule.match.response
    if not response or not response.backends then
        return { data = { rule_id = rule_id, backends = {}, message = "No backends configured" } }
    end

    local result = {}
    for _, b in ipairs(response.backends) do
        local label = b.label or b.address
        local stats = TrafficRouter.get_backend_stats(rule_id, label)
        local healthy = TrafficRouter.is_backend_healthy(rule_id, b.address)
        table.insert(result, {
            address = b.address,
            label = label,
            weight = b.weight or 1,
            healthy = healthy,
            stats = stats
        })
    end

    return { data = { rule_id = rule_id, routing = response.routing, backends = result } }
end

-------------------------------------------------------------------------------
-- POST /api/traffic/backends/weights
-- Update weights for a rule's backends (writes to disk, live immediately)
-------------------------------------------------------------------------------
function _M.update_weights(body)
    if not body then return { status = 400, message = "Request body is required" } end

    local rule_id = body.rule_id
    local profile_id = body.profile_id or "prod"
    local new_backends = body.backends

    if not rule_id then return { status = 400, message = "rule_id is required" } end
    if not new_backends or type(new_backends) ~= "table" or #new_backends == 0 then
        return { status = 400, message = "backends array is required" }
    end

    -- Load the rule
    local rule_path = configPath .. "data/rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local fh = io.open(rule_path, "rb")
    if not fh then return { status = 404, message = "Rule not found: " .. rule_id } end
    local content = fh:read("*a")
    fh:close()
    local rule = cjson.decode(content)
    if not rule then return { status = 500, message = "Failed to parse rule JSON" } end

    local response = rule.match and rule.match.response
    if not response or not response.backends then
        return { status = 400, message = "Rule has no backends configured" }
    end

    -- Build a label->weight map from the request
    local weight_map = {}
    for _, b in ipairs(new_backends) do
        if b.label and b.weight ~= nil then
            weight_map[b.label] = tonumber(b.weight) or 0
        end
    end

    -- Apply weights to existing backends
    local total_weight = 0
    for _, b in ipairs(response.backends) do
        local label = b.label or b.address
        if weight_map[label] ~= nil then
            b.weight = weight_map[label]
        end
        total_weight = total_weight + (b.weight or 1)
    end

    -- Normalize to sum=100 if needed
    if total_weight > 0 and total_weight ~= 100 then
        for _, b in ipairs(response.backends) do
            b.weight = math.floor((b.weight or 1) / total_weight * 100 + 0.5)
        end
    end

    -- Write back
    local ok, err = write_json_file(rule_path, rule)
    if not ok then return { status = 500, message = "Failed to write rule: " .. tostring(err) } end

    -- Update Prometheus weight gauges
    local m_ok, metrics = pcall(require, "prometheus_metrics")
    if m_ok and metrics then
        local m_weight = metrics.get_metric_traffic_weight()
        if m_weight then
            for _, b in ipairs(response.backends) do
                m_weight:set(b.weight or 0, { rule_id, b.label or b.address })
            end
        end
    end

    return {
        data = {
            rule_id = rule_id,
            backends = response.backends,
            effective_immediately = true,
            timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
        }
    }
end

-------------------------------------------------------------------------------
-- POST /api/traffic/backends/promote
-- Promote a backend to 100% traffic
-------------------------------------------------------------------------------
function _M.promote_backend(body)
    if not body then return { status = 400, message = "Request body is required" } end

    local rule_id = body.rule_id
    local profile_id = body.profile_id or "prod"
    local promote_label = body.promote_label

    if not rule_id then return { status = 400, message = "rule_id is required" } end
    if not promote_label then return { status = 400, message = "promote_label is required" } end

    -- Load the rule
    local rule_path = configPath .. "data/rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local fh = io.open(rule_path, "rb")
    if not fh then return { status = 404, message = "Rule not found: " .. rule_id } end
    local content = fh:read("*a")
    fh:close()
    local rule = cjson.decode(content)
    if not rule then return { status = 500, message = "Failed to parse rule JSON" } end

    local response = rule.match and rule.match.response
    if not response or not response.backends then
        return { status = 400, message = "Rule has no backends configured" }
    end

    -- Find the promoted backend and set it to 100%
    local promoted_address = nil
    for _, b in ipairs(response.backends) do
        if b.label == promote_label then
            b.weight = 100
            promoted_address = b.address
        else
            b.weight = 0
        end
    end

    if not promoted_address then
        return { status = 404, message = "Backend with label '" .. promote_label .. "' not found" }
    end

    -- Update redirect_uri to the promoted backend
    response.redirect_uri = promoted_address

    local ok, err = write_json_file(rule_path, rule)
    if not ok then return { status = 500, message = "Failed to write rule: " .. tostring(err) } end

    return {
        data = {
            rule_id = rule_id,
            promoted_label = promote_label,
            promoted_address = promoted_address,
            backends = response.backends,
            timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
        }
    }
end

-------------------------------------------------------------------------------
-- POST /api/traffic/backends/rollback
-- Remove backends array, restore single-backend redirect_uri routing
-------------------------------------------------------------------------------
function _M.rollback_to_primary(body)
    if not body then return { status = 400, message = "Request body is required" } end

    local rule_id = body.rule_id
    local profile_id = body.profile_id or "prod"

    if not rule_id then return { status = 400, message = "rule_id is required" } end

    local rule_path = configPath .. "data/rules/" .. profile_id .. "/" .. rule_id .. ".json"
    local fh = io.open(rule_path, "rb")
    if not fh then return { status = 404, message = "Rule not found: " .. rule_id } end
    local content = fh:read("*a")
    fh:close()
    local rule = cjson.decode(content)
    if not rule then return { status = 500, message = "Failed to parse rule JSON" } end

    local response = rule.match and rule.match.response
    if not response then
        return { status = 400, message = "Rule has no response configuration" }
    end

    local previous_backends = response.backends
    response.backends = nil
    response.routing = nil

    local ok, err = write_json_file(rule_path, rule)
    if not ok then return { status = 500, message = "Failed to write rule: " .. tostring(err) } end

    return {
        data = {
            rule_id = rule_id,
            redirect_uri = response.redirect_uri,
            removed_backends = previous_backends,
            timestamp = os.date("!%Y-%m-%dT%H:%M:%SZ")
        }
    }
end

-------------------------------------------------------------------------------
-- GET /api/traffic/health
-- Returns health status of all backends across all rules
-------------------------------------------------------------------------------
function _M.get_backend_health(args)
    local profile_id = args.profile_id or "prod"
    local rules_dir = configPath .. "data/rules/" .. profile_id .. "/"
    local rules = read_json_dir(rules_dir)

    local result = {}
    for _, rule in ipairs(rules) do
        local response = rule.match and rule.match.response
        if response and response.backends and #response.backends > 0 then
            local backends_health = {}
            for _, b in ipairs(response.backends) do
                local healthy = TrafficRouter.is_backend_healthy(rule.id, b.address)
                table.insert(backends_health, {
                    address = b.address,
                    label = b.label,
                    weight = b.weight,
                    healthy = healthy
                })
            end
            table.insert(result, {
                rule_id = rule.id,
                rule_name = rule.name,
                backends = backends_health
            })
        end
    end

    return { data = result }
end

return _M
