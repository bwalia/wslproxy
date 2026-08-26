/* ──────────────────────────────────────────────────────────────────────────
   Input (form) Zod schemas.

   Intentionally separate from the RESPONSE schemas in
   `./schemas.ts`.  Responses must be tolerant (backend is authoritative
   and may return extras or partial data); form INPUT must be strict
   (validate what the user typed before we POST it).

   Conventions:
    - Required strings use `.min(1, "message")` for a clear error.
    - Optional strings default to `""` so react-hook-form controlled
      inputs never hold undefined.
    - Enum-like selects use `.enum()` or literal unions.
    - All schemas export an inferred INPUT type for form state.
   ────────────────────────────────────────────────────────────────────────── */

import { z } from "zod";

// ─── Profile ─────────────────────────────────────────────────────────────

export const profileInputSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Name is required")
    .max(64, "Name must be 64 characters or fewer")
    .regex(/^[a-z0-9][a-z0-9_-]*$/i, "Letters, numbers, - and _ only"),
  description: z.string().max(500, "Keep under 500 characters").default(""),
});

export type ProfileInput = z.input<typeof profileInputSchema>;

// ─── Secret ──────────────────────────────────────────────────────────────

const secretKVSchema = z.object({
  key: z
    .string()
    .trim()
    .min(1, "Key is required")
    .max(128, "Key too long"),
  value: z.string().default(""),
});

export const secretInputSchema = z.object({
  id: z.string().optional(),
  secret_name: z
    .string()
    .trim()
    .min(1, "Secret name is required")
    .max(128, "Too long"),
  description: z.string().max(500).default(""),
  profile_id: z.string().default(""),
  secrets: z
    .array(secretKVSchema)
    .default([])
    .refine(
      (arr) => new Set(arr.map((s) => s.key)).size === arr.length,
      { message: "Keys must be unique within a secret" },
    ),
});

export type SecretInput = z.input<typeof secretInputSchema>;

// ─── WAF policy ──────────────────────────────────────────────────────────

const wafModeSchema = z.enum(["block", "monitor"]);

export const wafPolicyInputSchema = z.object({
  id: z.string().optional(),
  name: z
    .string()
    .trim()
    .min(1, "Policy name is required")
    .max(128, "Too long"),
  description: z.string().max(500).default(""),
  profile_id: z.string().default(""),
  mode: wafModeSchema.default("block"),
  enabled: z.boolean().default(true),
  anomaly_threshold: z.coerce
    .number()
    .int()
    .min(1, "Must be at least 1")
    .max(100, "Must be 100 or less")
    .default(5),
  paranoia_level: z.coerce
    .number()
    .int()
    .min(1)
    .max(4)
    .default(1),
  body_inspection: z.boolean().default(true),
  max_body_size: z.coerce
    .number()
    .int()
    .positive("Must be positive")
    .default(1048576), // 1 MiB
  waf_rules: z.array(z.string()).default([]),
});

export type WafPolicyInput = z.input<typeof wafPolicyInputSchema>;

// ─── Password reset ──────────────────────────────────────────────────────

export const passwordResetInputSchema = z
  .object({
    oldPassword: z.string().min(1, "Current password is required"),
    newPassword: z
      .string()
      .min(8, "New password must be at least 8 characters")
      .max(128, "Too long"),
    confirmPassword: z.string().min(1, "Please confirm your new password"),
  })
  .refine((v) => v.newPassword === v.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((v) => v.newPassword !== v.oldPassword, {
    path: ["newPassword"],
    message: "New password must differ from the old one",
  });

export type PasswordResetInput = z.input<typeof passwordResetInputSchema>;

// ─── Server (validation-gate only) ───────────────────────────────────────
//
// The Servers form is large and already uses plain `useState` with
// fine-grained `setForm` across several lazy-loaded tabs.  Migrating
// every input to react-hook-form would be a ~1800-line refactor with
// no user-visible improvement.
//
// Instead, this schema runs at submit time only (see `runValidationGate`).
// It asserts the same invariants as the legacy react-admin Form.jsx +
// the Lua backend, so the user gets a structured error before the
// network round-trip.  It intentionally DOES NOT enumerate every
// server field — only the ones with preconditions that the backend
// or downstream rule evaluation actually depends on.

const hostnameRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*$/i;

// Nginx `listen` directive — bare port, port + flags (ssl/http2/proxy_protocol),
// or `address:port` with optional flags.  Bracketed IPv6 also allowed.
//   80
//   443 ssl
//   443 ssl http2
//   0.0.0.0:8080
//   [::]:443 ssl
const listenDirectiveRegex =
  /^(\[[0-9a-fA-F:]+\]:|\d{1,3}(?:\.\d{1,3}){3}:)?\d{1,5}(\s+(ssl|http2|http3|proxy_protocol|default_server|reuseport|deferred))*\s*$/;

export const serverInputSchema = z
  .object({
    server_name: z
      .string()
      .trim()
      .min(1, "Server name is required")
      .max(253, "Hostname too long")
      .regex(hostnameRegex, "Must be a valid hostname (letters, digits, dot, hyphen)"),
    proxy_server_name: z
      .string()
      .trim()
      .default("")
      // Only validated when set — empty means "use server_name".
      .refine(
        (v) => v.length === 0 || hostnameRegex.test(v),
        "Must be a valid hostname (letters, digits, dot, hyphen)",
      ),
    mirror_host_header: z
      .string()
      .trim()
      .default("")
      // Only validated when set — empty means "no mirror Host override".
      .refine(
        (v) => v.length === 0 || hostnameRegex.test(v),
        "Must be a valid hostname (letters, digits, dot, hyphen)",
      ),
    profile_id: z.string().trim().min(1, "Profile is required"),
    listens: z
      .array(
        z.object({
          listen: z
            .string()
            .trim()
            .min(1, "Listen directive cannot be empty")
            .regex(
              listenDirectiveRegex,
              "Format: port (e.g. 80) or address:port [ssl|http2|...]",
            ),
        }),
      )
      .min(1, "At least one listen directive is required"),
    ssl_enabled: z.boolean(),
    ssl_email: z.string().trim(),
    rate_limit_enabled: z.boolean(),
    rate_limit: z.object({
      requests_per_second: z.coerce.number(),
      burst: z.coerce.number(),
    }),
  })
  // If SSL is enabled, the email is required AND must be a valid format.
  // Let's Encrypt needs a real address for expiry notices.
  .refine((v) => !v.ssl_enabled || v.ssl_email.length > 0, {
    path: ["ssl_email"],
    message: "SSL email is required when SSL is enabled",
  })
  .refine(
    (v) => !v.ssl_enabled || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.ssl_email),
    {
      path: ["ssl_email"],
      message: "SSL email must be a valid email address",
    },
  )
  // If rate limiting is on, the numeric settings must be positive — a
  // zero `requests_per_second` would silently block all traffic.
  .refine(
    (v) => !v.rate_limit_enabled || v.rate_limit.requests_per_second > 0,
    {
      path: ["rate_limit", "requests_per_second"],
      message: "Must be at least 1 when rate limiting is enabled",
    },
  )
  .refine(
    (v) => !v.rate_limit_enabled || v.rate_limit.burst >= 0,
    {
      path: ["rate_limit", "burst"],
      message: "Burst must be ≥ 0",
    },
  );

export type ServerInput = z.input<typeof serverInputSchema>;

// ─── Rule (validation-gate only) ─────────────────────────────────────────

const ruleNameRegex = /^[A-Za-z0-9][A-Za-z0-9_.:/-]*$/;

// URL paths used in rule matching go straight into nginx's location/uri
// match.  Whitespace would break the matcher and is almost always a
// paste-error from the user.  Allow the standard URL path character set
// plus a few wildcards rules sometimes use (`*`, `?`).
const rulePathRegex = /^[A-Za-z0-9._~!$&'()*+,;=:@/?%-]+$/;

// IPv4, IPv4-with-CIDR, IPv6, IPv6-with-CIDR.  Permissive on purpose —
// we only need to catch the obvious "user typed words instead of an
// IP" mistake.  The Lua gateway does the actual range matching.
const ipv4Octet = "(25[0-5]|2[0-4]\\d|1\\d\\d|[1-9]?\\d)";
const ipv4Regex = new RegExp(
  `^${ipv4Octet}\\.${ipv4Octet}\\.${ipv4Octet}\\.${ipv4Octet}(/(3[0-2]|[12]?\\d))?$`,
);
const ipv6Regex =
  /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|::([0-9a-fA-F]{1,4}:){0,5}[0-9a-fA-F]{1,4}|::)(\/(12[0-8]|1[01]\d|\d?\d))?$/;

// HTTP / HTTPS URL — required for redirect_uri on 301/302 and
// recommended for the proxy-pass target on 305.
const httpUrlRegex =
  /^https?:\/\/[A-Za-z0-9._~!$&'()*+,;=:@%-]+(:\d{1,5})?(\/[^\s]*)?$/i;

function isValidIpEntry(value: string): boolean {
  const trimmed = value.trim();
  if (trimmed.length === 0) return false;
  return ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed);
}

export const ruleInputSchema = z
  .object({
    name: z
      .string()
      .trim()
      .min(1, "Rule name is required")
      .max(128, "Rule name too long")
      .regex(
        ruleNameRegex,
        "Letters, numbers, and - _ . : / only; must start alphanumeric",
      ),
    priority: z.coerce
      .number()
      .int("Priority must be a whole number")
      .min(1, "Priority must be at least 1")
      .max(10_000, "Priority must be 10000 or less"),
    code: z.coerce.number().int(),
    // Required.  An empty path matches everything, which is almost
    // always wrong; force the user to explicitly type "/" if they
    // really mean it.
    path: z
      .string()
      .trim()
      .min(1, "Path is required")
      .max(1024, "Path too long")
      .regex(
        rulePathRegex,
        "Path cannot contain whitespace; use URL-safe characters only",
      ),
    path_key: z.enum(["starts_with", "ends_with", "equals"]).default("starts_with"),
    // Optional — only validated when present.  Accepts a comma-separated
    // list so users can match multiple ranges in one rule.
    client_ip: z.string().trim().default(""),
    country: z.string().default(""),
    redirect_uri: z.string().trim().default(""),
    backends: z
      .array(
        z.object({
          address: z.string().trim(),
          weight: z.coerce.number().default(100),
        }),
      )
      .default([]),
  })
  // Path must start with "/" for starts_with / equals matching — those
  // modes match against the full request URI which always begins with /.
  .refine(
    (v) =>
      !(v.path_key === "starts_with" || v.path_key === "equals") ||
      v.path.startsWith("/"),
    {
      path: ["path"],
      message: 'Path must start with "/" for starts_with / equals matching',
    },
  )
  // When client_ip is set, every comma-separated entry must look like
  // a real IP / CIDR — catches the "Lorem ipsum" paste mistake.
  .refine(
    (v) =>
      v.client_ip.length === 0 ||
      v.client_ip
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .every(isValidIpEntry),
    {
      path: ["client_ip"],
      message:
        "Must be IPv4, IPv6, CIDR (1.2.3.0/24), or comma-separated list of those",
    },
  )
  // 301/302 redirects require a destination URI — otherwise the rule
  // matches but the gateway has nothing to redirect to.
  .refine(
    (v) =>
      !(v.code === 301 || v.code === 302) ||
      v.redirect_uri.length > 0,
    {
      path: ["redirect_uri"],
      message: "Redirect URI is required for 301 / 302 responses",
    },
  )
  // For 301 / 302 (real HTTP redirects) the destination MUST be a
  // full `http(s)://` URL — the gateway puts it verbatim into the
  // `Location:` response header, and browsers refuse anything without
  // a scheme.  305 (proxy pass) does NOT carry that constraint: the
  // Lua gateway strips/prefixes the scheme itself before opening
  // the upstream connection, so the user can type any of
  // `https://backend:8080`, `backend:8080`, or `1.2.3.4` and they all
  // resolve to the same proxy target.  Don't force a scheme there.
  .refine(
    (v) =>
      !(v.code === 301 || v.code === 302) ||
      v.redirect_uri.length === 0 ||
      httpUrlRegex.test(v.redirect_uri),
    {
      path: ["redirect_uri"],
      message: "Must be a full http(s):// URL",
    },
  )
  // 305 = proxy pass.  Backends[] is now the only target shape the UI
  // writes — the Lua router overwrites redirect_uri whenever backends
  // is non-empty, so a single-target rule is just backends[0] with
  // weight 100.  Legacy rules that still carry only redirect_uri get
  // auto-migrated on load in the rule editor (seeded as backends[0]).
  .refine(
    (v) => v.code !== 305 || v.backends.length > 0,
    {
      path: ["backends"],
      message: "Proxy-pass (305) needs at least one backend",
    },
  )
  // Each backend in a 305 rule needs an address — empty entries produce
  // broken upstream config.
  .refine(
    (v) =>
      v.code !== 305 ||
      v.backends.every((b) => b.address.trim().length > 0),
    {
      path: ["backends"],
      message: "Every backend must have a non-empty address",
    },
  );

export type RuleInput = z.input<typeof ruleInputSchema>;
