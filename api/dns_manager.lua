-- DNS Manager Module for WSLProxy
--
-- Provisions DNS records at external providers (Cloudflare today;
-- Route53 / Google DNS later as additional `provider.type` entries).
-- Reads each server's `pop_ids` field + the POP entities created by
-- pops.lua to compute the desired set of A records, then converges
-- Cloudflare to match.
--
-- Storage:  settings.json → `dns` block (token, managed_zones list,
--           defaults).  No on-disk state of its own — Cloudflare is
--           the source of truth.
-- Public API:
--   _M.is_enabled()                       → bool, missing-config string
--   _M.find_zone(domain)                  → zone_record | (nil, err)
--   _M.lookup(opts)                       → records[] | (nil, err)
--   _M.ensure_record(opts)                → record_info | (nil, err)
--   _M.provision_for_server(opts)         → summary | (nil, err)
--
-- Errors are structured tables of the form
--   { code = "<symbolic>", message = "<human>", details = {...} }
-- mirroring the convention from `pops.lua` so the HTTP layer can
-- map them onto 400 / 404 / 409 / 502 cleanly.
--
-- Safety properties:
--   1. The `managed_zones` allowlist in settings.json is the ONLY
--      thing wslproxy will write to.  Unknown zones are refused
--      before any HTTP call.  Hard guardrail against accidentally
--      modifying a customer's domain.
--   2. Every record wslproxy creates carries a `wslproxy-managed`
--      marker in its `comment` field.  Records without that marker
--      are NEVER touched, even by force-cleanup paths.  Hand-curated
--      records by a human operator stay safe.
--   3. Pops in `down` / `maintenance` status are skipped during
--      provisioning by default (with a note in the response).  An
--      explicit `include_inactive=true` is required to bring them
--      back into a record set.

local _M = {}

-- `lua-resty-http` is installed by infra/ansible/roles/wslproxy/tasks/
-- deploy_deps.yml, but that task uses `ignore_errors: true` on the
-- luarocks install loop — so a past failed install can leave prod
-- without the module while the deploy still reports success.  pcall
-- the require so dns_manager.lua doesn't fail to load and cascade-
-- break api.lua's `require("dns_manager")` at line 17 (which would
-- take the entire admin server offline).  cf_request() below checks
-- `http` is non-nil and surfaces a structured io_error if missing.
local _http_ok, http = pcall(require, "resty.http")
if not _http_ok then
    ngx.log(ngx.ERR, "dns_manager: resty.http not available — DNS ",
        "provisioning will return io_error.  Run: luarocks install ",
        "lua-resty-http (then reload openresty).  pcall error: ",
        tostring(http))
    http = nil
end
local cjson = Cjson or require("cjson")
local Helper = require("helpers")
local AuditLogger = require("audit_logger")
local Pops = require("pops")

local configPath = os.getenv("NGINX_CONFIG_DIR") or "/opt/nginx/"

-- ============================================================
-- Constants
-- ============================================================

local CF_BASE = "https://api.cloudflare.com/client/v4"
local DEFAULT_TIMEOUT_MS = 10000
local DEFAULT_TTL = 300            -- 5 min, dashboard-changeable per request
local DEFAULT_PROXIED = false      -- wslproxy terminates SSL; CF orange-cloud
                                    -- would conflict by default
local MARKER = "wslproxy-managed"
local MAX_RETRIES_ON_429 = 3       -- Cloudflare rate-limit retries
local RETRY_BASE_DELAY_MS = 250    -- exponential backoff base

-- ============================================================
-- Settings loading + zone discovery
-- ============================================================

--- Read the dns block from settings.json and return the primary
--- Cloudflare provider.  Returns a normalised provider record or a
--- structured error explaining what's missing.
local function load_provider()
    local settings = Helper.settings()
    local dns_cfg = settings and settings.dns
    if type(dns_cfg) ~= "table" then
        return nil, {
            code = "not_configured",
            message = "settings.json has no `dns` block — DNS provisioning is disabled.  Add a dns.providers[] entry with a Cloudflare api_token + managed_zones list.",
        }
    end
    if dns_cfg.enabled == false then
        return nil, {
            code = "disabled",
            message = "DNS provisioning is explicitly disabled (settings.json: dns.enabled = false).",
        }
    end
    local providers = dns_cfg.providers
    if type(providers) ~= "table" or #providers == 0 then
        return nil, {
            code = "not_configured",
            message = "settings.json: dns.providers is empty.  Add at least one provider entry.",
        }
    end
    -- For now we only handle Cloudflare.  Pick the first provider
    -- whose type matches; future work routes per-zone to different
    -- providers, but a single-provider deploy is the 99% case.
    for _, p in ipairs(providers) do
        if p.type == "cloudflare" then
            if not p.api_token or p.api_token == "" then
                return nil, {
                    code = "not_configured",
                    message = "Cloudflare provider '" .. (p.name or "?") ..
                        "' has no api_token.  Generate a token at https://dash.cloudflare.com/profile/api-tokens with 'Zone:Read' + 'DNS:Edit' scoped to your managed_zones.",
                }
            end
            if type(p.managed_zones) ~= "table" or #p.managed_zones == 0 then
                return nil, {
                    code = "not_configured",
                    message = "Cloudflare provider '" .. (p.name or "?") ..
                        "' has no managed_zones.  Add each zone explicitly to prevent accidental writes to other domains.",
                }
            end
            return {
                name = p.name or "cloudflare",
                type = "cloudflare",
                api_token = p.api_token,
                managed_zones = p.managed_zones,
                default_ttl = tonumber(dns_cfg.default_ttl) or DEFAULT_TTL,
                default_proxied = dns_cfg.default_proxied == true,
            }
        end
    end
    return nil, {
        code = "not_configured",
        message = "No Cloudflare provider found in dns.providers.  Only `type: cloudflare` is supported today.",
    }
end

--- Find the zone whose name is the longest suffix of `domain`.
--- Refuses domains not covered by any managed zone — that's the
--- safety guarantee that prevents accidental writes outside the
--- declared scope.
function _M.find_zone(domain)
    if type(domain) ~= "string" or domain == "" then
        return nil, {code = "validation_failed", message = "domain is required"}
    end
    local provider, err = load_provider()
    if not provider then return nil, err end
    local lower_domain = domain:lower()
    local best_match = nil
    local best_len = 0
    for _, z in ipairs(provider.managed_zones) do
        if type(z.name) == "string" and type(z.zone_id) == "string" then
            local zname = z.name:lower()
            -- Match if domain == zone OR domain ends in ".<zone>"
            if lower_domain == zname or
                    lower_domain:sub(-(#zname + 1)) == ("." .. zname) then
                if #zname > best_len then
                    best_match = {
                        zone_id = z.zone_id,
                        zone_name = z.name,
                        provider = provider,
                    }
                    best_len = #zname
                end
            end
        end
    end
    if not best_match then
        local zone_names = {}
        for _, z in ipairs(provider.managed_zones) do
            table.insert(zone_names, z.name)
        end
        return nil, {
            code = "zone_not_allowed",
            message = "Domain '" .. domain .. "' is not covered by any managed_zone.  Add the parent zone to settings.json (with its Cloudflare zone_id) before provisioning records under it.",
            details = {managed_zones = zone_names},
        }
    end
    return best_match
end

--- Cheap public-facing check.  Used by the HTTP layer to decide
--- whether to render "DNS disabled" UX vs the normal flow.
function _M.is_enabled()
    local provider, err = load_provider()
    if provider then return true end
    return false, err and err.message or "DNS not configured"
end

-- ============================================================
-- HTTP client wrapper
-- ============================================================

--- One-shot HTTP request to Cloudflare with structured error
--- handling.  Decodes the standard `{success, errors, result}`
--- envelope and surfaces Cloudflare error codes as our own structured
--- errors.  Retries on 429 with exponential backoff up to
--- MAX_RETRIES_ON_429 attempts; everything else fails fast.
local function cf_request(provider, method, path, body)
    -- Defensive check matching the pcall guard at module load: if
    -- lua-resty-http failed to install, return a clear actionable
    -- error rather than letting the missing global trip a Lua
    -- runtime error that would surface as a generic 500 HTML page.
    if not http then
        return nil, {
            code = "io_error",
            message = "lua-resty-http is not installed on this host.  " ..
                "DNS provisioning cannot reach Cloudflare until it is.  " ..
                "Run: luarocks install lua-resty-http (then reload " ..
                "openresty).  See deploy_deps.yml.",
        }
    end
    local url = CF_BASE .. path
    local attempt = 0
    while true do
        attempt = attempt + 1
        local httpc = http.new()
        httpc:set_timeout(DEFAULT_TIMEOUT_MS)
        local opts = {
            method = method,
            headers = {
                ["Authorization"] = "Bearer " .. provider.api_token,
                ["Content-Type"] = "application/json",
            },
        }
        if body then opts.body = cjson.encode(body) end

        local res, err = httpc:request_uri(url, opts)
        if not res then
            return nil, {
                code = "network_error",
                message = "Cloudflare API call failed: " .. tostring(err),
                details = {url = url, method = method},
            }
        end

        -- 429: rate-limited.  Honour Retry-After if present, else
        -- exponential backoff.  Don't loop forever — bail after
        -- MAX_RETRIES_ON_429 so a misconfigured token can't pin a
        -- request indefinitely.
        if res.status == 429 then
            if attempt > MAX_RETRIES_ON_429 then
                return nil, {
                    code = "rate_limited",
                    message = "Cloudflare API rate limit; retries exhausted.",
                    details = {attempts = attempt},
                }
            end
            local retry_after = tonumber(res.headers["Retry-After"] or "")
            local sleep_ms = retry_after and (retry_after * 1000) or
                (RETRY_BASE_DELAY_MS * math.pow(2, attempt - 1))
            ngx.sleep(sleep_ms / 1000)
            -- loop continues to retry
        else
            -- Normal path — decode envelope and return
            local body_ok, decoded = pcall(cjson.decode, res.body or "")
            if not body_ok or type(decoded) ~= "table" then
                return nil, {
                    code = "decode_error",
                    message = "Cloudflare returned non-JSON or malformed body",
                    details = {status = res.status, body = (res.body or ""):sub(1, 200)},
                }
            end
            if decoded.success == false then
                -- Pull the first Cloudflare error for a concise summary;
                -- keep the full list in details for the operator.
                local first = decoded.errors and decoded.errors[1]
                return nil, {
                    code = "provider_error",
                    message = first and (first.message or "Cloudflare error " .. tostring(first.code))
                        or "Cloudflare reported failure with no error details",
                    details = {
                        http_status = res.status,
                        cloudflare_errors = decoded.errors,
                    },
                }
            end
            return decoded.result
        end
    end
end

-- ============================================================
-- Comment marker — provenance tracking
-- ============================================================

local function build_comment(server_id, profile_id, pop_id)
    -- `MARKER` is intentionally first so a single substring grep
    -- against Cloudflare's `comment` field reliably identifies
    -- wslproxy-managed records.  Each subsequent piece is a key=value
    -- pair so future parsers (cleanup tools, audit replay) can
    -- structure-decode without ambiguity.
    return string.format("%s | server=%s | profile=%s | pop=%s",
        MARKER, server_id, profile_id, pop_id)
end

local function is_wslproxy_managed(record)
    return type(record.comment) == "string" and
        record.comment:find(MARKER, 1, true) ~= nil
end

--- Parse the pop_id out of a wslproxy-managed comment.  Returns nil
--- for records that aren't ours or don't have a pop assigned (older
--- formats).
local function extract_pop_id(record)
    if not is_wslproxy_managed(record) then return nil end
    return record.comment:match("pop=([^ |]+)")
end

-- ============================================================
-- Cloudflare CRUD primitives
-- ============================================================

local function list_records_for_name(provider, zone_id, name, record_type)
    local q = "?name=" .. ngx.escape_uri(name)
    if record_type then q = q .. "&type=" .. record_type end
    return cf_request(provider, "GET", "/zones/" .. zone_id .. "/dns_records" .. q)
end

local function create_record(provider, zone_id, body)
    return cf_request(provider, "POST", "/zones/" .. zone_id .. "/dns_records", body)
end

local function update_record(provider, zone_id, record_id, body)
    return cf_request(provider, "PUT",
        "/zones/" .. zone_id .. "/dns_records/" .. record_id, body)
end

local function delete_record(provider, zone_id, record_id)
    return cf_request(provider, "DELETE",
        "/zones/" .. zone_id .. "/dns_records/" .. record_id)
end

-- ============================================================
-- Public: read-only lookup
-- ============================================================

--- Return the current set of Cloudflare records for `domain`,
--- annotated with whether each one is wslproxy-managed.  Used by
--- the dashboard's "DNS State" panel and by the provision logic
--- internally.
function _M.lookup(opts)
    opts = opts or {}
    local domain = opts.domain
    if not domain or domain == "" then
        return nil, {code = "validation_failed", message = "domain is required"}
    end
    local zone, err = _M.find_zone(domain)
    if not zone then return nil, err end
    local records, lerr = list_records_for_name(
        zone.provider, zone.zone_id, domain, opts.type)
    if not records then
        -- Enrich provider/network errors with the zone we tried so the
        -- operator can immediately see *which* zone_id Cloudflare
        -- refused — without this context an "Authentication error" is
        -- noise; with it, the operator can spot a wrong zone_id at a
        -- glance.  Doesn't change the error code, just the details
        -- payload.  Defensive against a `nil` lerr (cf_request always
        -- returns one with the failure, but LSP can't prove that).
        local enriched = lerr or {code = "io_error", message = "Cloudflare call returned nil"}
        enriched.details = enriched.details or {}
        enriched.details.zone = {name = zone.zone_name, id = zone.zone_id}
        return nil, enriched
    end
    local annotated = {}
    for _, r in ipairs(records) do
        table.insert(annotated, {
            id = r.id,
            type = r.type,
            name = r.name,
            content = r.content,
            ttl = r.ttl,
            proxied = r.proxied,
            comment = r.comment,
            managed_by_wslproxy = is_wslproxy_managed(r),
            pop_id = extract_pop_id(r),
        })
    end
    return {
        domain = domain,
        zone_id = zone.zone_id,
        zone_name = zone.zone_name,
        records = annotated,
    }
end

-- ============================================================
-- Public: idempotent ensure_record (low-level)
-- ============================================================

--- Idempotent upsert for a single record.  Mostly used by
--- provision_for_server; exposed publicly for ad-hoc ops.
---
--- opts: {
---   domain (req), type (req, default "A"), content (req),
---   ttl, proxied, comment, dry_run
--- }
function _M.ensure_record(opts)
    if not opts.domain or opts.domain == "" then
        return nil, {code = "validation_failed", message = "domain is required"}
    end
    if not opts.content or opts.content == "" then
        return nil, {code = "validation_failed", message = "content is required"}
    end
    local zone, err = _M.find_zone(opts.domain)
    if not zone then return nil, err end
    local record_type = opts.type or "A"
    local existing, lerr = list_records_for_name(
        zone.provider, zone.zone_id, opts.domain, record_type)
    if not existing then
        local enriched = lerr or {code = "io_error", message = "Cloudflare call returned nil"}
        enriched.details = enriched.details or {}
        enriched.details.zone = {name = zone.zone_name, id = zone.zone_id}
        return nil, enriched
    end

    -- Find a wslproxy-managed record we can update in place.  If a
    -- record matches by content AND comment, it's already correct;
    -- if it matches by comment but content differs, it's a stale
    -- target we should update; if neither matches we create new.
    local same = nil
    local stale = nil
    for _, r in ipairs(existing) do
        if is_wslproxy_managed(r) and (not opts.comment or r.comment == opts.comment) then
            if r.content == opts.content then
                same = r
            else
                stale = r
            end
            break
        end
    end

    local body = {
        type = record_type,
        name = opts.domain,
        content = opts.content,
        ttl = tonumber(opts.ttl) or zone.provider.default_ttl,
        proxied = opts.proxied == true or
            (opts.proxied == nil and zone.provider.default_proxied),
        comment = opts.comment,
    }

    if opts.dry_run then
        return {
            dry_run = true,
            action = same and "unchanged" or (stale and "would_update" or "would_create"),
            would_write = body,
            existing_record_id = (same or stale) and (same or stale).id or nil,
            zone_id = zone.zone_id,
        }
    end

    if same then
        return {action = "unchanged", record_id = same.id, content = same.content}
    elseif stale then
        local updated, uerr = update_record(zone.provider, zone.zone_id, stale.id, body)
        if not updated then return nil, uerr end
        return {action = "updated", record_id = updated.id, content = updated.content}
    else
        local created, cerr = create_record(zone.provider, zone.zone_id, body)
        if not created then return nil, cerr end
        return {action = "created", record_id = created.id, content = created.content}
    end
end

-- ============================================================
-- Public: high-level orchestrator — provision DNS for a server
-- ============================================================

--- Plan the per-POP convergence for a single record type (A or
--- AAAA).  Extracted from provision_for_server so the BOTH mode can
--- run it twice without duplicating the loop.
---
--- `ip_field` is which POP field to read for the record content
--- (`public_ipv4` for A; `public_ipv6` for AAAA).  POPs missing that
--- specific field skip with a type-specific reason — the operator
--- sees "no_public_ipv6" rather than a generic "no_public_ipv4" when
--- they're running AAAA mode against POPs that only have v4.
---
--- Every action emitted carries a `record_type` field so the
--- executor below can call create/update/delete with the right type
--- when BOTH mode produces a mixed action list.
local function plan_per_pop(opts, server, zone, pop_ids,
                            record_type, ip_field, no_ip_reason)
    local desired = {}
    local skipped = {}
    for _, pid in ipairs(pop_ids) do
        -- Capture both returns from Pops.get so we don't masquerade
        -- io_error / decode_error as "not_found".
        local pop, perr = Pops.get(pid)
        if type(pop) ~= "table" then
            table.insert(skipped, {
                pop_id = pid,
                reason = (perr and perr.code) or "not_found",
                record_type = record_type,
            })
        elseif not pop[ip_field] or pop[ip_field] == "" then
            table.insert(skipped, {
                pop_id = pid,
                reason = no_ip_reason,
                record_type = record_type,
            })
        elseif (pop.status == "down" or pop.status == "maintenance") and
                not opts.include_inactive then
            table.insert(skipped, {
                pop_id = pid,
                reason = "status_" .. pop.status,
                record_type = record_type,
            })
        else
            table.insert(desired, {pop_id = pid, content = pop[ip_field]})
        end
    end

    -- Inventory CF records OF THIS TYPE for the domain.  Filtering
    -- by type matters: BOTH mode plans A and AAAA independently and
    -- must not see one type's records in the other's plan.
    local existing, lerr = list_records_for_name(
        zone.provider, zone.zone_id, server.server_name, record_type)
    if not existing then
        local enriched = lerr or {code = "io_error", message = "Cloudflare call returned nil"}
        enriched.details = enriched.details or {}
        enriched.details.zone = {name = zone.zone_name, id = zone.zone_id}
        enriched.details.record_type = record_type
        return nil, nil, enriched
    end

    local by_pop = {}
    local untracked_ours = {}
    for _, r in ipairs(existing) do
        if is_wslproxy_managed(r) then
            local rpop = extract_pop_id(r)
            if rpop and rpop ~= "cname" then
                by_pop[rpop] = r
            else
                table.insert(untracked_ours, r)
            end
        end
    end

    local actions = {}
    local seen_pops = {}
    for _, d in ipairs(desired) do
        seen_pops[d.pop_id] = true
        local existing_rec = by_pop[d.pop_id]
        local desired_comment = build_comment(opts.server_id, opts.profile_id, d.pop_id)
        if not existing_rec then
            table.insert(actions, {
                pop_id = d.pop_id, action = "create",
                content = d.content, comment = desired_comment,
                record_type = record_type,
            })
        elseif existing_rec.content == d.content then
            table.insert(actions, {
                pop_id = d.pop_id, action = "unchanged",
                content = d.content, record_id = existing_rec.id,
                record_type = record_type,
            })
        else
            table.insert(actions, {
                pop_id = d.pop_id, action = "update",
                content = d.content, comment = desired_comment,
                record_id = existing_rec.id,
                from_content = existing_rec.content,
                record_type = record_type,
            })
        end
    end
    for pop_id, rec in pairs(by_pop) do
        if not seen_pops[pop_id] then
            table.insert(actions, {
                pop_id = pop_id, action = "delete",
                record_id = rec.id, from_content = rec.content,
                record_type = record_type,
            })
        end
    end
    for _, rec in ipairs(untracked_ours) do
        table.insert(actions, {
            pop_id = nil, action = "delete_legacy",
            record_id = rec.id, from_content = rec.content,
            record_type = record_type,
        })
    end

    return actions, skipped
end

--- Plan the single-record convergence for CNAME mode.  CNAME is
--- fundamentally different from A/AAAA: it's ONE record pointing at
--- a hostname, not per-POP fan-out.  Reads `server.dns_cname_target`
--- as the target hostname.  POPs are not involved.
---
--- Cloudflare and the DNS spec disallow CNAME records coexisting
--- with other record types at the same name, so callers should not
--- combine CNAME with A/AAAA on the same server.
local function plan_cname(opts, server, zone)
    local target = server.dns_cname_target
    if not target or target == "" then
        return nil, nil, {
            code = "no_cname_target",
            message = "Server '" .. opts.server_id ..
                "' has dns_record_type='CNAME' but no dns_cname_target set.  " ..
                "Set the hostname this server should point at (e.g. " ..
                "'edge.wslproxy.com') in the server form's DNS section.",
        }
    end

    local existing, lerr = list_records_for_name(
        zone.provider, zone.zone_id, server.server_name, "CNAME")
    if not existing then
        local enriched = lerr or {code = "io_error", message = "Cloudflare call returned nil"}
        enriched.details = enriched.details or {}
        enriched.details.zone = {name = zone.zone_name, id = zone.zone_id}
        enriched.details.record_type = "CNAME"
        return nil, nil, enriched
    end

    -- There should be at most ONE wslproxy-managed CNAME per name.
    -- If there are more (somehow corrupted state), the later one
    -- "wins" and the earlier ones get cleaned up as legacy.
    local our_existing
    local untracked_ours = {}
    for _, r in ipairs(existing) do
        if is_wslproxy_managed(r) then
            if our_existing then
                table.insert(untracked_ours, our_existing)
            end
            our_existing = r
        end
    end

    local actions = {}
    local desired_comment = build_comment(opts.server_id, opts.profile_id, "cname")
    if not our_existing then
        table.insert(actions, {
            pop_id = nil, action = "create",
            content = target, comment = desired_comment,
            record_type = "CNAME",
        })
    elseif our_existing.content == target then
        table.insert(actions, {
            pop_id = nil, action = "unchanged",
            content = target, record_id = our_existing.id,
            record_type = "CNAME",
        })
    else
        table.insert(actions, {
            pop_id = nil, action = "update",
            content = target, comment = desired_comment,
            record_id = our_existing.id,
            from_content = our_existing.content,
            record_type = "CNAME",
        })
    end
    for _, rec in ipairs(untracked_ours) do
        table.insert(actions, {
            pop_id = nil, action = "delete_legacy",
            record_id = rec.id, from_content = rec.content,
            record_type = "CNAME",
        })
    end

    return actions, {}
end

--- The main user-facing flow.  Dispatches on `record_type` (or
--- `server.dns_record_type`, falling back to "A"):
---
---   - "A"    — one A record per active POP using public_ipv4
---   - "AAAA" — one AAAA record per active POP using public_ipv6
---   - "BOTH" — both of the above; produces a mixed action list
---   - "CNAME" — one CNAME pointing at server.dns_cname_target;
---               POPs are not used in this mode
---
--- Orphaned wslproxy-managed records (POPs removed from the server,
--- or records of the wrong type for the current mode) are deleted.
---
--- opts: {
---   server_id (req), profile_id (req),
---   dry_run (bool), include_inactive (bool),
---   record_type ("A"|"AAAA"|"BOTH"|"CNAME") — overrides
---              server.dns_record_type if set,
--- }
---
--- Returns a summary table:
--- {
---   domain, zone_id, zone_name, record_type,
---   actions = [ {action, content, pop_id, record_type, record_id?, error?}, ... ],
---   skipped = [ {pop_id, record_type, reason}, ... ],
--- }
function _M.provision_for_server(opts)
    opts = opts or {}
    local user = opts.user or "system"
    if not opts.server_id or opts.server_id == "" then
        return nil, {code = "validation_failed", message = "server_id is required"}
    end
    if not opts.profile_id or opts.profile_id == "" then
        return nil, {code = "validation_failed", message = "profile_id is required"}
    end

    -- 1. Read server JSON
    local server_path = configPath .. "data/servers/" .. opts.profile_id ..
        "/" .. opts.server_id .. ".json"
    local content = Helper.getDataFromFile(server_path)
    if not content then
        return nil, {
            code = "not_found",
            message = "Server '" .. opts.server_id .. "' not found in profile '" ..
                opts.profile_id .. "'",
            details = {expected_path = server_path},
        }
    end
    local ok_dec, server = pcall(cjson.decode, content)
    if not ok_dec or type(server) ~= "table" then
        return nil, {code = "io_error", message = "Server JSON is malformed"}
    end
    local domain = server.server_name
    if not domain or domain == "" then
        return nil, {
            code = "validation_failed",
            message = "Server has no server_name — cannot resolve a Cloudflare zone for it",
        }
    end

    -- 2. Decide which record type(s) to converge.  Explicit
    -- opts.record_type beats server.dns_record_type beats "A".
    -- Upper-casing is forgiving (operators write "a" or "cname"
    -- interchangeably).  The validation rejects anything not in the
    -- enum before we start touching Cloudflare.
    local record_type = opts.record_type or server.dns_record_type or "A"
    record_type = string.upper(tostring(record_type))
    local VALID_TYPES = {A = true, AAAA = true, BOTH = true, CNAME = true}
    if not VALID_TYPES[record_type] then
        return nil, {
            code = "validation_failed",
            message = "Invalid record_type '" .. record_type ..
                "'.  Must be one of: A, AAAA, BOTH, CNAME.",
        }
    end

    -- 3. Resolve Cloudflare zone for the domain (one lookup, reused
    -- by both planners — the zone allowlist check is the safety gate
    -- that runs BEFORE any record-shape decision).
    local zone, zerr = _M.find_zone(domain)
    if not zone then return nil, zerr end

    -- 4. Dispatch on record_type.  CNAME is a fundamentally different
    -- shape (one record, no POP fan-out) so it has its own planner.
    -- A / AAAA / BOTH all share the per-POP planner; BOTH runs it
    -- twice and accumulates.
    local actions = {}
    local skipped = {}
    if record_type == "CNAME" then
        local cnames, cskipped, cerr = plan_cname(opts, server, zone)
        if cerr then return nil, cerr end
        -- `or {}` fallbacks are defensive: plan_cname's contract is
        -- "return (actions, skipped) OR (nil, nil, err)", but the
        -- LSP can't narrow that across the error guard above.
        actions = cnames or {}
        skipped = cskipped or {}
    else
        local pop_ids = server.pop_ids
        if type(pop_ids) ~= "table" or #pop_ids == 0 then
            return nil, {
                code = "no_pops_assigned",
                message = "Server '" .. opts.server_id ..
                    "' has no pop_ids assigned.  Assign at least one POP on the server form before provisioning DNS.",
            }
        end
        -- BOTH mode → run the planner twice; A and AAAA → once.
        -- Each pass returns actions tagged with its record_type so
        -- the executor below can route to the right CF endpoint.
        local types_to_do
        if record_type == "BOTH" then
            types_to_do = {{type = "A", field = "public_ipv4", reason = "no_public_ipv4"},
                           {type = "AAAA", field = "public_ipv6", reason = "no_public_ipv6"}}
        elseif record_type == "AAAA" then
            types_to_do = {{type = "AAAA", field = "public_ipv6", reason = "no_public_ipv6"}}
        else
            types_to_do = {{type = "A", field = "public_ipv4", reason = "no_public_ipv4"}}
        end
        for _, t in ipairs(types_to_do) do
            local pacts, pskipped, perr = plan_per_pop(
                opts, server, zone, pop_ids, t.type, t.field, t.reason)
            if perr then return nil, perr end
            -- Same defensive narrowing as the CNAME branch.
            for _, x in ipairs(pacts or {}) do table.insert(actions, x) end
            for _, x in ipairs(pskipped or {}) do table.insert(skipped, x) end
        end
        -- "no_targets" only fires when every plan came back empty
        -- AND there are no deletes either.  For BOTH mode this means
        -- both v4 and v6 had no work — usually because every POP was
        -- skipped (e.g. all in maintenance).  Deletes are still
        -- useful work, so an actions list of [delete, delete] is
        -- allowed through.
        local has_any_action = #actions > 0
        if not has_any_action then
            return nil, {
                code = "no_targets",
                message = "No active POPs to provision and no records to clean up.  All assigned POPs were skipped — see the `skipped` list.",
                details = {skipped = skipped, record_type = record_type},
            }
        end
    end

    -- 6. Execute (or just plan)
    if opts.dry_run then
        return {
            dry_run = true,
            domain = domain,
            zone_id = zone.zone_id,
            zone_name = zone.zone_name,
            record_type = record_type,
            actions = actions,
            skipped = skipped,
        }
    end

    local executed = {}
    for _, a in ipairs(actions) do
        -- Per-action record_type — BOTH mode produces a mixed list
        -- of A and AAAA actions; each must call CF with its own type.
        -- Fallback to opts.record_type is for old callers and CNAME
        -- (where every action already carries `record_type = "CNAME"`).
        local rt = a.record_type or opts.record_type or "A"
        if a.action == "create" then
            local rec, err = create_record(zone.provider, zone.zone_id, {
                type = rt,
                name = domain,
                content = a.content,
                ttl = zone.provider.default_ttl,
                proxied = zone.provider.default_proxied,
                comment = a.comment,
            })
            if rec then
                table.insert(executed, {
                    action = "created", pop_id = a.pop_id,
                    content = a.content, record_id = rec.id,
                    record_type = rt,
                })
            else
                table.insert(executed, {
                    action = "error", pop_id = a.pop_id,
                    content = a.content, record_type = rt,
                    error = (err and err.message) or "unknown error",
                })
            end
        elseif a.action == "update" then
            local rec, err = update_record(zone.provider, zone.zone_id, a.record_id, {
                type = rt,
                name = domain,
                content = a.content,
                ttl = zone.provider.default_ttl,
                proxied = zone.provider.default_proxied,
                comment = a.comment,
            })
            if rec then
                table.insert(executed, {
                    action = "updated", pop_id = a.pop_id,
                    content = a.content, record_id = rec.id,
                    from_content = a.from_content,
                    record_type = rt,
                })
            else
                table.insert(executed, {
                    action = "error", pop_id = a.pop_id,
                    content = a.content, record_type = rt,
                    error = (err and err.message) or "unknown error",
                })
            end
        elseif a.action == "delete" or a.action == "delete_legacy" then
            local ok2, err = delete_record(zone.provider, zone.zone_id, a.record_id)
            if ok2 then
                table.insert(executed, {
                    action = a.action == "delete_legacy" and "deleted_legacy" or "deleted",
                    pop_id = a.pop_id, from_content = a.from_content,
                    record_id = a.record_id, record_type = rt,
                })
            else
                table.insert(executed, {
                    action = "error", pop_id = a.pop_id,
                    record_type = rt,
                    error = (err and err.message) or "unknown error",
                })
            end
        else  -- unchanged
            table.insert(executed, {
                action = "unchanged", pop_id = a.pop_id,
                content = a.content, record_id = a.record_id,
                record_type = rt,
            })
        end
    end

    -- 7. Audit log + return summary
    pcall(function()
        AuditLogger.log("dns_provision", user, "servers", opts.server_id, {
            profile_id = opts.profile_id,
            domain = domain,
            zone_id = zone.zone_id,
            record_type = record_type,
            actions_count = #executed,
            skipped = skipped,
        })
    end)

    return {
        domain = domain,
        zone_id = zone.zone_id,
        zone_name = zone.zone_name,
        record_type = record_type,
        actions = executed,
        skipped = skipped,
    }
end

return _M
