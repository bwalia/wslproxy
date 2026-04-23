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
