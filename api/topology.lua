-- topology.lua
-- Full service topology graph: VirtualServer → Rules → Backend Origins
-- Returns nodes + edges structure for the topology canvas visualization.
--
-- GET /api/topology/graph?profile_id=prod
--
-- Node kinds:
--   server   — Virtual Server (domain/hostname)
--   rule     — Routing rule (path match, redirect, proxy, block)
--   backend  — Backend origin (IP:port, domain, S3 bucket, unix socket)
--
-- Edges connect server→rule and rule→backend with metadata.

local cjson = require("cjson.safe")

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
-- Helper: parse rule IDs from server config (string, CSV, or array)
-------------------------------------------------------------------------------
local function parse_rule_ids(rules_field)
    if not rules_field or type(rules_field) == "userdata" then
        return {}
    end
    if type(rules_field) == "table" then
        local ids = {}
        for _, id in ipairs(rules_field) do
            if type(id) == "string" and id ~= "" then
                table.insert(ids, id:match("^%s*(.-)%s*$"))
            end
        end
        return ids
    end
    if type(rules_field) == "string" then
        local ids = {}
        for id in string.gmatch(rules_field, "[^,]+") do
            local trimmed = id:match("^%s*(.-)%s*$")
            if trimmed ~= "" then
                table.insert(ids, trimmed)
            end
        end
        return ids
    end
    return {}
end

-------------------------------------------------------------------------------
-- Helper: extract backend address details
-------------------------------------------------------------------------------
local function parse_backend_address(address)
    if not address or address == "" then return nil end

    local result = {
        raw = address,
        scheme = "http",
        host = address,
        port = nil,
        path = nil,
        type = "origin", -- origin, s3, unix, consul
    }

    -- Strip scheme
    if address:match("^https://") then
        result.scheme = "https"
        address = address:gsub("^https://", "")
    elseif address:match("^http://") then
        address = address:gsub("^http://", "")
    end

    -- Unix socket
    if address:match("^unix:/") then
        result.type = "unix"
        result.host = address
        return result
    end

    -- S3 detection
    if address:match("s3[%-.]") or address:match("amazonaws%.com") then
        result.type = "s3"
    end

    -- Separate path from host
    local slash_pos = address:find("/")
    if slash_pos then
        result.path = address:sub(slash_pos)
        address = address:sub(1, slash_pos - 1)
    end

    -- Extract port
    local host, port = address:match("^(.+):(%d+)$")
    if host and port then
        result.host = host
        result.port = tonumber(port)
    else
        result.host = address
        if result.scheme == "https" then
            result.port = 443
        else
            result.port = 80
        end
    end

    return result
end

-------------------------------------------------------------------------------
-- Helper: determine rule action type from status code
-------------------------------------------------------------------------------
local function rule_action_type(code)
    if code == 305 then return "proxy"
    elseif code == 301 then return "redirect_permanent"
    elseif code == 302 then return "redirect_temporary"
    elseif code == 200 then return "static_content"
    elseif code == 403 then return "block"
    elseif code == 306 then return "captcha"
    else return "unknown"
    end
end

-------------------------------------------------------------------------------
-- Helper: determine node health status
-------------------------------------------------------------------------------
local function get_backend_health(rule_id, address)
    local ok, TrafficRouter = pcall(require, "traffic_router")
    if ok and TrafficRouter and TrafficRouter.is_backend_healthy then
        local healthy = TrafficRouter.is_backend_healthy(rule_id, address)
        if healthy == true then return "healthy"
        elseif healthy == false then return "degraded"
        end
    end
    return "unknown"
end

-------------------------------------------------------------------------------
-- Helper: get backend stats
-------------------------------------------------------------------------------
local function get_backend_stats(rule_id, label)
    local ok, TrafficRouter = pcall(require, "traffic_router")
    if ok and TrafficRouter and TrafficRouter.get_backend_stats then
        return TrafficRouter.get_backend_stats(rule_id, label)
    end
    return nil
end

-------------------------------------------------------------------------------
-- GET /api/topology/graph
-- Returns full topology graph: nodes[] + edges[]
-------------------------------------------------------------------------------
function _M.get_graph(args)
    local profile_id = args.profile_id or "prod"
    local servers_dir = configPath .. "data/servers/" .. profile_id .. "/"
    local rules_dir = configPath .. "data/rules/" .. profile_id .. "/"

    local servers = read_json_dir(servers_dir)
    local rules = read_json_dir(rules_dir)

    -- Build rules lookup
    local rules_map = {}
    for _, rule in ipairs(rules) do
        if rule.id then
            rules_map[rule.id] = rule
        end
    end

    local nodes = {}
    local edges = {}
    local added_nodes = {} -- dedup
    local added_backends = {} -- dedup backends

    -- ── Build server nodes ──
    for _, server in ipairs(servers) do
        local server_id = "server/" .. (server.server_name or server.id or "unknown")

        if not added_nodes[server_id] then
            added_nodes[server_id] = true

            -- Determine server status
            local status = "healthy"
            local listen_ports = {}
            if server.listens and type(server.listens) == "table" then
                for _, l in ipairs(server.listens) do
                    if l.listen then
                        table.insert(listen_ports, tostring(l.listen))
                    end
                end
            end
            if #listen_ports == 0 then
                listen_ports = { "80" }
                if server.ssl_enabled then
                    table.insert(listen_ports, "443")
                end
            end

            -- Collect all rule IDs from both fields
            local all_rule_ids = parse_rule_ids(server.rules)

            -- Also collect from match_cases
            if server.match_cases and type(server.match_cases) == "table" then
                for _, mc in ipairs(server.match_cases) do
                    if mc.statement and mc.statement ~= "" then
                        table.insert(all_rule_ids, mc.statement)
                    end
                end
            end

            local proxy_name = server.proxy_server_name
            if not proxy_name or proxy_name == "" or type(proxy_name) == "userdata" then
                proxy_name = server.server_name
            end

            table.insert(nodes, {
                id = server_id,
                kind = "server",
                name = server.server_name or "unknown",
                status = status,
                ssl_enabled = server.ssl_enabled or false,
                ssl_force_https = server.ssl_force_https or false,
                waf_enabled = server.waf_enabled or false,
                rate_limit_enabled = server.rate_limit_enabled or false,
                cache_enabled = server.cache_enabled or false,
                proxy_server_name = proxy_name,
                listen_ports = listen_ports,
                rule_count = #all_rule_ids,
                custom_headers_count = server.custom_headers and #server.custom_headers or 0,
                custom_response_headers_count = server.custom_response_headers and #server.custom_response_headers or 0,
            })

            -- ── Build rule nodes + edges ──
            for _, rule_id in ipairs(all_rule_ids) do
                local rule = rules_map[rule_id]
                if rule then
                    local rule_node_id = "rule/" .. rule_id

                    if not added_nodes[rule_node_id] then
                        added_nodes[rule_node_id] = true

                        local match_rules = rule.match and rule.match.rules or {}
                        local response = rule.match and rule.match.response or {}
                        local code = response.code or 305
                        local action = rule_action_type(code)

                        local path = match_rules.path or "/"
                        local path_key = match_rules.path_key or "starts_with"

                        -- Conditions summary
                        local conditions = {}
                        if match_rules.path and match_rules.path ~= "" then
                            table.insert(conditions, "path")
                        end
                        if match_rules.client_ip and match_rules.client_ip ~= "" and type(match_rules.client_ip) ~= "userdata" then
                            table.insert(conditions, "ip")
                        end
                        if match_rules.country and match_rules.country ~= "" and type(match_rules.country) ~= "userdata" then
                            table.insert(conditions, "country")
                        end
                        if match_rules.jwt_token_validation and match_rules.jwt_token_validation ~= "" and type(match_rules.jwt_token_validation) ~= "userdata" then
                            table.insert(conditions, "auth")
                        end

                        table.insert(nodes, {
                            id = rule_node_id,
                            kind = "rule",
                            name = rule.name or rule_id,
                            status = "healthy",
                            action = action,
                            status_code = code,
                            priority = rule.priority or 0,
                            path = path,
                            path_key = path_key,
                            conditions = conditions,
                            condition_count = #conditions,
                            has_backends = (response.backends and #response.backends > 0) and true or false,
                            auto_redirect_https = match_rules.auto_redirect_https or false,
                            strip_path = match_rules.strip_path or false,
                        })
                    end

                    -- Edge: server → rule
                    table.insert(edges, {
                        from = server_id,
                        to = "rule/" .. rule_id,
                        label = "routes",
                    })

                    -- ── Build backend nodes from this rule ──
                    local response = rule.match and rule.match.response or {}

                    if response.backends and type(response.backends) == "table" and #response.backends > 0 then
                        -- Multi-backend (traffic routing)
                        for _, b in ipairs(response.backends) do
                            local addr = b.address or ""
                            local backend_id = "backend/" .. addr
                            local parsed = parse_backend_address(addr)

                            if parsed and not added_backends[backend_id] then
                                added_backends[backend_id] = true
                                added_nodes[backend_id] = true

                                local health = get_backend_health(rule_id, addr)
                                local stats = get_backend_stats(rule_id, b.label or addr)

                                table.insert(nodes, {
                                    id = backend_id,
                                    kind = "backend",
                                    name = b.label or parsed.host,
                                    status = health,
                                    address = addr,
                                    host = parsed.host,
                                    port = parsed.port,
                                    scheme = parsed.scheme,
                                    path = parsed.path,
                                    backend_type = parsed.type,
                                    weight = b.weight,
                                    stats = stats,
                                })
                            end

                            table.insert(edges, {
                                from = "rule/" .. rule_id,
                                to = backend_id,
                                label = b.label or "backend",
                                weight = b.weight or 0,
                            })
                        end
                    elseif response.redirect_uri and response.redirect_uri ~= "" and type(response.redirect_uri) ~= "userdata" then
                        -- Single backend
                        local addr = response.redirect_uri
                        local backend_id = "backend/" .. addr
                        local parsed = parse_backend_address(addr)

                        if parsed and not added_backends[backend_id] then
                            added_backends[backend_id] = true
                            added_nodes[backend_id] = true

                            local health = get_backend_health(rule_id, addr)
                            local stats = get_backend_stats(rule_id, addr)

                            table.insert(nodes, {
                                id = backend_id,
                                kind = "backend",
                                name = parsed.host,
                                status = health,
                                address = addr,
                                host = parsed.host,
                                port = parsed.port,
                                scheme = parsed.scheme,
                                path = parsed.path,
                                backend_type = parsed.type,
                                stats = stats,
                            })
                        end

                        table.insert(edges, {
                            from = "rule/" .. rule_id,
                            to = backend_id,
                            label = "primary",
                            weight = 100,
                        })
                    end
                end
            end
        end
    end

    -- Summary counts
    local kind_counts = { server = 0, rule = 0, backend = 0 }
    for _, node in ipairs(nodes) do
        kind_counts[node.kind] = (kind_counts[node.kind] or 0) + 1
    end

    return {
        data = {
            nodes = nodes,
            edges = edges,
            summary = {
                total_nodes = #nodes,
                total_edges = #edges,
                servers = kind_counts.server,
                rules = kind_counts.rule,
                backends = kind_counts.backend,
                profile_id = profile_id,
            },
        },
    }
end

return _M
