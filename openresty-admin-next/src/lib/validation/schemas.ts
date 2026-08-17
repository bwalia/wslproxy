/* ──────────────────────────────────────────────────────────────────────────
   Runtime schemas for backend resources.

   The Lua backend returns loosely-typed JSON — fields come and go across
   versions, unknown shapes drift in, and a hot-reloaded admin UI must
   not trust arbitrary bytes blindly.  These Zod schemas are the
   contract at the network boundary.

   Design choices:
    - Every resource schema uses `.passthrough()` so unknown fields are
      preserved (backend can add fields without breaking the UI).
    - All "id-ish" fields are optional strings — the backend sometimes
      returns `null` or omits IDs during creation flows.
    - Booleans come through as both real booleans and string `"true"` /
      `"false"` from some endpoints — we accept both.
    - `listResultSchema(item)` wraps any item schema as the common
      `{ data: T[], total: number }` list shape.
    - `singleResultSchema(item)` mirrors that for `{ data: T }`.
   ────────────────────────────────────────────────────────────────────────── */

import { z } from "zod";

// ─── Primitive helpers ────────────────────────────────────────────────

/** Boolean coerced from "true"/"false" strings too (Lua sometimes stringifies). */
export const zBoolish = z.preprocess((v) => {
  if (typeof v === "boolean") return v;
  if (v === "true" || v === 1) return true;
  if (v === "false" || v === 0) return false;
  return v;
}, z.boolean().optional());

/** Number that may arrive as a numeric string. */
export const zNumish = z.preprocess((v) => {
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) {
    return Number(v);
  }
  return v;
}, z.number().optional());

/** Tolerant string — null/undefined become undefined. */
export const zOptStr = z.string().optional().nullable().transform((v) => v ?? undefined);

/**
 * Lua-tolerant array of strings.
 *
 * The OpenResty backend encodes empty collections as `{}` rather than
 * `[]` because Lua has no way to distinguish an empty array from an
 * empty object.  Consumers that call `.map()` on this blow up with
 * "map is not a function".  This preprocessor normalizes:
 *  - `undefined` / `null` → `[]`
 *  - `{}` (empty object) → `[]`
 *  - any non-array → `[]`
 *  - real arrays → passed through, non-string items filtered out
 */
export const zStringArray = z.preprocess((v) => {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (v && typeof v === "object" && Object.keys(v).length === 0) return [];
  return [];
}, z.array(z.string()).default([]));

/**
 * Id-list field — same Lua-tolerance as `zStringArray`, plus:
 *  - a single string "id" becomes `["id"]`
 *  - a comma-separated string "id1,id2" is split
 *
 * Use for fields like `server.rules` where the backend historically
 * accepted either a scalar id, a comma list, or an array.
 */
export const zIdList = z.preprocess((v) => {
  if (Array.isArray(v)) return v.filter((x) => typeof x === "string");
  if (typeof v === "string") {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}, z.array(z.string()).default([]));

// ─── Common response envelopes ────────────────────────────────────────

export function listResultSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: z.array(item).default([]),
    total: z.number().optional().default(0),
  });
}

export function singleResultSchema<T extends z.ZodTypeAny>(item: T) {
  return z.object({
    data: item.optional().nullable(),
  });
}

// ─── Resource schemas ────────────────────────────────────────────────

/** Server (virtual host) — a sizable record; we only assert on the
 *  fields the UI actually reads.  Everything else passes through. */
export const serverSchema = z
  .object({
    id: zOptStr,
    server_name: z.string(),
    proxy_server_name: zOptStr,
    profile_id: zOptStr,
    config: zOptStr,
    config_status: zBoolish,
    listens: z
      .array(z.object({ listen: z.string() }).passthrough())
      .optional(),
    ssl_enabled: zBoolish,
    ssl_force_https: zBoolish,
    ssl_auto_renew: zBoolish,
    ssl_staging: zBoolish,
    ssl_email: zOptStr,
    cache_enabled: zBoolish,
    cache_ttl: zNumish,
    cache_bypass_cookie: zOptStr,
    waf_enabled: zBoolish,
    waf_policy_id: zOptStr,
    rate_limit_enabled: zBoolish,
    varnish_enabled: zBoolish,
    rules: zIdList,
    match_cases: z.union([
      z.array(z.object({ statement: z.string(), condition: z.string() }).passthrough()),
      z.record(z.string(), z.unknown()),
    ]).optional(),
    servers_tags: zStringArray,
    created_at: zNumish,
  })
  .passthrough();

export type Server = z.infer<typeof serverSchema>;

/** Rule — path/IP/country/JWT matcher + response definition. */
export const ruleSchema = z
  .object({
    id: zOptStr,
    name: zOptStr,
    priority: zNumish,
    profile_id: zOptStr,
    match: z
      .object({
        rules: z.record(z.string(), z.unknown()).optional(),
        response: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough()
      .optional(),
    rules_tags: zStringArray,
    _schema_version: zNumish,
  })
  .passthrough();

export type Rule = z.infer<typeof ruleSchema>;

/** Upstream — backend server pool. */
export const upstreamSchema = z
  .object({
    id: zOptStr,
    name: z.string(),
    profile_id: zOptStr,
    load_balancing_method: zOptStr,
    // `servers` arrives from Lua — coerce empty `{}` (Lua-table
    // ambiguity) to `[]` BEFORE the array shape check, otherwise
    // tolerant validation passes the raw `{}` through and downstream
    // `.map()` crashes.  Same pattern as `zStringArray` / `zIdList`.
    servers: z
      .preprocess(
        (v) => (Array.isArray(v) ? v : []),
        z
          .array(
            z
              .object({
                address: z.string(),
                port: zNumish,
                weight: zNumish,
                max_fails: zNumish,
                state: zOptStr,
              })
              .passthrough(),
          )
          .default([]),
      ),
  })
  .passthrough();

export type Upstream = z.infer<typeof upstreamSchema>;

/** AppSettings — read-only global config. */
export const appSettingsSchema = z
  .object({
    instance_id: zOptStr,
    instance_name: zOptStr,
    env_profile: zOptStr,
    storage_type: zOptStr,
    env_vars: z.record(z.string(), z.unknown()).optional(),
    pgsql: z
      .object({
        pg_host: zOptStr,
        pg_port: zNumish,
        pg_database: zOptStr,
        pg_user: zOptStr,
        host: zOptStr,
        port: zNumish,
        database: zOptStr,
        user: zOptStr,
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type AppSettings = z.infer<typeof appSettingsSchema>;

/**
 * Tolerant runtime validator for `GET /api/ping?detailed=true`.
 *
 * The authoritative compile-time shape is `HealthData` in
 * `src/types/index.ts` (match `api/ping.lua` exactly).  This schema
 * is intentionally loose — `.passthrough()` everywhere so unknown
 * fields flow through untouched and the UI never blanks out over
 * payload drift.  Only the few top-level fields that page renderers
 * actually branch on are declared; everything else passes through.
 */
export const healthDataSchema = z
  .object({
    status: zOptStr,
    response: zOptStr,
    timestamp: zOptStr,
    services: z
      .object({
        openresty: z.object({ status: zOptStr, version: zOptStr }).passthrough().optional(),
        nginx_workers: z
          .object({ status: zOptStr, worker_count: zNumish })
          .passthrough()
          .optional(),
        redis: z
          .object({
            status: zOptStr,
            message: zOptStr,
            host: zOptStr,
            port: zNumish,
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    settings: z
      .object({
        status: zOptStr,
        file_exists: zBoolish,
        valid_json: zBoolish,
        missing_keys: z.array(z.string()).optional(),
        env_profile: zOptStr,
        storage_type: zOptStr,
      })
      .passthrough()
      .optional(),
    // Keyed by path — record so cjson `{}` empties don't blow up.
    data_directories: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

/** Audit log entry.  Very loose — the backend writes arbitrary diffs. */
export const auditEntrySchema = z
  .object({
    timestamp: zNumish,
    user: zOptStr,
    action: zOptStr,
    resource_type: zOptStr,
    resource_name: zOptStr,
    actor: zOptStr,
    actor_ip: zOptStr,
    profile_id: zOptStr,
    diff: z.unknown().optional(),
  })
  .passthrough();

export type AuditEntry = z.infer<typeof auditEntrySchema>;

/** WAF event — emitted by the WAF engine on rule match. */
export const wafEventSchema = z
  .object({
    id: zOptStr,
    timestamp: zNumish,
    host: zOptStr,
    client_ip: zOptStr,
    method: zOptStr,
    uri: zOptStr,
    rule_id: zOptStr,
    rule_name: zOptStr,
    category: zOptStr,
    severity: zOptStr,
    action: zOptStr,
    score: zNumish,
    message: zOptStr,
  })
  .passthrough();

export type WafEvent = z.infer<typeof wafEventSchema>;

/** Session record (only populated when storage_type=redis). */
export const sessionSchema = z
  .object({
    id: z.union([z.string(), z.number()]).transform((v) => String(v)),
    session_id: zOptStr,
    subject: zOptStr,
    timeout: zNumish,
  })
  .passthrough();

export type Session = z.infer<typeof sessionSchema>;

/* ──────────────────────────────────────────────────────────────────────────
   The schemas below are tolerant boundary contracts — they exist purely to
   normalise empty Lua tables (`{}`) back into JS arrays (`[]`) on fields
   the UI will later iterate with `.map()` / `.length` / `.filter()`.
   Without these, the backend's cjson ambiguity propagates straight to the
   detail pages and crashes the form-hydrate step.
   See `zStringArray` / `zIdList` for the shared array-tolerance helpers.
   ────────────────────────────────────────────────────────────────────────── */

/** Bookmark — link with tags + visibility flag. */
export const bookmarkSchema = z
  .object({
    id: zOptStr,
    title: zOptStr,
    host: zOptStr,
    url: zOptStr,
    category: zOptStr,
    description: zOptStr,
    // `tags` is the field that crashes `tags.join(", ")` when it
    // arrives as `{}` from Lua — normalise here, not in every caller.
    tags: zStringArray,
    public: zBoolish,
    created_at: zNumish,
  })
  .passthrough();

export type Bookmark = z.infer<typeof bookmarkSchema>;

/** Secret — an opaque credential bag.  `secrets` is the field that
 *  feeds RHF's `useFieldArray` on the edit page — must always be a
 *  real array. */
export const secretSchema = z
  .object({
    id: zOptStr,
    secret_name: zOptStr,
    description: zOptStr,
    profile_id: zOptStr,
    secrets: z.preprocess(
      (v) => (Array.isArray(v) ? v : []),
      z.array(z.record(z.string(), z.unknown())).default([]),
    ),
    created_at: zNumish,
  })
  .passthrough();

export type Secret = z.infer<typeof secretSchema>;

/** WAF policy — bundles a set of WAF rules with a mode + tunables. */
export const wafPolicySchema = z
  .object({
    id: zOptStr,
    name: z.string(),
    description: zOptStr,
    profile_id: zOptStr,
    mode: zOptStr,
    enabled: zBoolish,
    anomaly_threshold: zNumish,
    paranoia_level: zNumish,
    body_inspection: zBoolish,
    max_body_size: zNumish,
    // `waf_rules` is iterated as an array in the policy editor.
    waf_rules: zIdList,
    created_at: zNumish,
  })
  .passthrough();

export type WafPolicy = z.infer<typeof wafPolicySchema>;

/** WAF rule — single rule definition.  Most fields are scalars; the
 *  passthrough handles category-specific extras. */
export const wafRuleSchema = z
  .object({
    id: zOptStr,
    name: z.string(),
    description: zOptStr,
    profile_id: zOptStr,
    category: zOptStr,
    severity: zOptStr,
    action: zOptStr,
    enabled: zBoolish,
    score: zNumish,
    created_at: zNumish,
  })
  .passthrough();

export type WafRule = z.infer<typeof wafRuleSchema>;

/** Profile — environment configuration (prod / int / acc / etc). */
export const profileSchema = z
  .object({
    id: zOptStr,
    name: zOptStr,
    description: zOptStr,
    createdAt: zNumish,
    updatedAt: zNumish,
  })
  .passthrough();

export type Profile = z.infer<typeof profileSchema>;

/** Instance — deployment record. */
export const instanceSchema = z
  .object({
    id: zOptStr,
    name: zOptStr,
    description: zOptStr,
    profile_id: zOptStr,
    host: zOptStr,
    port: zNumish,
    instances_tags: zStringArray,
    created_at: zNumish,
  })
  .passthrough();

export type Instance = z.infer<typeof instanceSchema>;

/** User — admin user record. */
export const userSchema = z
  .object({
    id: zOptStr,
    username: zOptStr,
    email: zOptStr,
    role: zOptStr,
    profile_id: zOptStr,
    created_at: zNumish,
  })
  .passthrough();

export type User = z.infer<typeof userSchema>;

/** Change request — 4-eyes approval record.  `approvals` and
 *  `rejections` are critical: any consumer that lists them as a count
 *  or maps a name list would crash on `{}`. */
export const changeRequestSchema = z
  .object({
    id: zOptStr,
    title: zOptStr,
    description: zOptStr,
    status: zOptStr,
    requester: zOptStr,
    resource_type: zOptStr,
    resource_id: zOptStr,
    approvals: zStringArray,
    rejections: zStringArray,
    diff: z.unknown().optional(),
    created_at: zNumish,
    updated_at: zNumish,
  })
  .passthrough();

export type ChangeRequest = z.infer<typeof changeRequestSchema>;
