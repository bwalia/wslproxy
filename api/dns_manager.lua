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

local http = require("resty.http")
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

--- The main user-facing flow.  Reads server.pop_ids, looks up each
--- POP's IP, and converges Cloudflare to publish exactly one A
--- record per active POP.  Orphaned wslproxy-managed records (POPs
--- that were removed from the server) are deleted.
---
--- opts: {
---   server_id (req), profile_id (req),
---   dry_run (bool), include_inactive (bool), record_type ("A")
--- }
---
--- Returns a summary table:
--- {
---   domain, zone_id, zone_name,
---   actions = [ {action, content, pop_id, record_id?, error?}, ... ],
---   skipped = [ {pop_id, reason}, ... ],
---   warnings = [ ... ],
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

    -- 2. Resolve target IPs from pop_ids
    local pop_ids = server.pop_ids
    if type(pop_ids) ~= "table" or #pop_ids == 0 then
        return nil, {
            code = "no_pops_assigned",
            message = "Server '" .. opts.server_id ..
                "' has no pop_ids assigned.  Assign at least one POP on the server form before provisioning DNS.",
        }
    end
    local desired = {}      -- list of {pop_id, content (IP)}
    local skipped = {}
    for _, pid in ipairs(pop_ids) do
        -- Capture both returns from Pops.get so we don't masquerade
        -- io_error / decode_error as "not_found".  The operator sees
        -- the real reason in the skipped list (e.g. "io_error" when a
        -- pop file is unreadable — distinct from a genuinely missing
        -- POP).
        local pop, perr = Pops.get(pid)
        if type(pop) ~= "table" then
            local reason = (perr and perr.code) or "not_found"
            table.insert(skipped, {pop_id = pid, reason = reason})
        elseif not pop.public_ipv4 or pop.public_ipv4 == "" then
            table.insert(skipped, {pop_id = pid, reason = "no_public_ipv4"})
        elseif (pop.status == "down" or pop.status == "maintenance") and
                not opts.include_inactive then
            table.insert(skipped, {pop_id = pid, reason = "status_" .. pop.status})
        else
            table.insert(desired, {pop_id = pid, content = pop.public_ipv4})
        end
    end
    if #desired == 0 then
        return nil, {
            code = "no_targets",
            message = "No active POPs to provision.  All assigned POPs were skipped — see the `skipped` list.",
            details = {skipped = skipped},
        }
    end

    -- 3. Resolve Cloudflare zone for the domain
    local zone, zerr = _M.find_zone(domain)
    if not zone then return nil, zerr end

    -- 4. Inventory existing wslproxy-managed records for this name
    local existing, lerr = list_records_for_name(
        zone.provider, zone.zone_id, domain, opts.record_type or "A")
    if not existing then
        local enriched = lerr or {code = "io_error", message = "Cloudflare call returned nil"}
        enriched.details = enriched.details or {}
        enriched.details.zone = {name = zone.zone_name, id = zone.zone_id}
        return nil, enriched
    end
    -- Index by pop_id (when extractable) for O(1) diff lookup.
    -- Records that are NOT wslproxy-managed are left untouched
    -- regardless of their content — the marker is what protects
    -- hand-curated records from this orchestrator.
    local by_pop = {}
    local untracked_ours = {}  -- our records with no pop_id parseable
    for _, r in ipairs(existing) do
        if is_wslproxy_managed(r) then
            local rpop = extract_pop_id(r)
            if rpop then
                by_pop[rpop] = r
            else
                table.insert(untracked_ours, r)
            end
        end
    end

    -- 5. Compute the action plan: for each desired POP, decide
    -- create / update / unchanged.  Then collect orphans for delete.
    local actions = {}
    local seen_pops = {}
    for _, d in ipairs(desired) do
        seen_pops[d.pop_id] = true
        local existing_rec = by_pop[d.pop_id]
        local desired_comment = build_comment(opts.server_id, opts.profile_id, d.pop_id)
        if not existing_rec then
            table.insert(actions, {
                pop_id = d.pop_id,
                action = "create",
                content = d.content,
                comment = desired_comment,
            })
        elseif existing_rec.content == d.content then
            table.insert(actions, {
                pop_id = d.pop_id,
                action = "unchanged",
                content = d.content,
                record_id = existing_rec.id,
            })
        else
            table.insert(actions, {
                pop_id = d.pop_id,
                action = "update",
                content = d.content,
                comment = desired_comment,
                record_id = existing_rec.id,
                from_content = existing_rec.content,
            })
        end
    end
    for pop_id, rec in pairs(by_pop) do
        if not seen_pops[pop_id] then
            table.insert(actions, {
                pop_id = pop_id,
                action = "delete",
                record_id = rec.id,
                from_content = rec.content,
            })
        end
    end
    -- Also clean up any legacy our-records that have no pop_id —
    -- these would be from earlier provisioning shapes and don't
    -- belong in the new desired set.
    for _, rec in ipairs(untracked_ours) do
        table.insert(actions, {
            pop_id = nil,
            action = "delete_legacy",
            record_id = rec.id,
            from_content = rec.content,
        })
    end

    -- 6. Execute (or just plan)
    if opts.dry_run then
        return {
            dry_run = true,
            domain = domain,
            zone_id = zone.zone_id,
            zone_name = zone.zone_name,
            actions = actions,
            skipped = skipped,
        }
    end

    local executed = {}
    for _, a in ipairs(actions) do
        if a.action == "create" then
            local rec, err = create_record(zone.provider, zone.zone_id, {
                type = opts.record_type or "A",
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
                })
            else
                table.insert(executed, {
                    action = "error", pop_id = a.pop_id,
                    content = a.content,
                    error = (err and err.message) or "unknown error",
                })
            end
        elseif a.action == "update" then
            local rec, err = update_record(zone.provider, zone.zone_id, a.record_id, {
                type = opts.record_type or "A",
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
                })
            else
                table.insert(executed, {
                    action = "error", pop_id = a.pop_id,
                    content = a.content,
                    error = (err and err.message) or "unknown error",
                })
            end
        elseif a.action == "delete" or a.action == "delete_legacy" then
            local ok2, err = delete_record(zone.provider, zone.zone_id, a.record_id)
            if ok2 then
                table.insert(executed, {
                    action = a.action == "delete_legacy" and "deleted_legacy" or "deleted",
                    pop_id = a.pop_id, from_content = a.from_content,
                    record_id = a.record_id,
                })
            else
                table.insert(executed, {
                    action = "error", pop_id = a.pop_id,
                    error = (err and err.message) or "unknown error",
                })
            end
        else  -- unchanged
            table.insert(executed, {
                action = "unchanged", pop_id = a.pop_id,
                content = a.content, record_id = a.record_id,
            })
        end
    end

    -- 7. Audit log + return summary
    pcall(function()
        AuditLogger.log("dns_provision", user, "servers", opts.server_id, {
            profile_id = opts.profile_id,
            domain = domain,
            zone_id = zone.zone_id,
            actions_count = #executed,
            skipped = skipped,
        })
    end)

    return {
        domain = domain,
        zone_id = zone.zone_id,
        zone_name = zone.zone_name,
        actions = executed,
        skipped = skipped,
    }
end

return _M
