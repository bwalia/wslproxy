/* ──────────────────────────────────────────────────────────────────────────
   Dashboard-shared constants.

   Single source of truth for colors, palettes, and category → color
   mappings used across chart widgets.  Pulled directly from the
   legacy openresty-admin Dashboard hex values so the two UIs match
   pixel-for-pixel during the migration.

   IMPORTANT: these are raw hex strings used by Recharts (which does not
   parse Tailwind classes).  For UI chrome that IS styled via Tailwind,
   keep using Tailwind tokens — this file is only for chart fills /
   strokes / inline styles.
   ────────────────────────────────────────────────────────────────────────── */

export const COLORS = {
  primary: "#255fa8", // corporate blue
  success: "#10b981", // emerald
  warning: "#f59e0b", // amber
  error: "#ef4444", // red
  orange: "#f97316", // orange — latency 500-1000
  secondary: "#1a7a6d", // teal accent
  cyan: "#06b6d4",
  pink: "#ec4899",
  lime: "#84cc16",
  slateMuted: "#94a3b8", // neutral grey used for OPTIONS method
} as const;

/**
 * Stable cycle for per-backend chart fills so a rule with N backends
 * always shows the same color per backend across renders.  8 slots is
 * more than any realistic single-rule split; anything beyond wraps.
 */
export const BACKEND_COLORS: string[] = [
  COLORS.primary,
  COLORS.success,
  COLORS.warning,
  COLORS.error,
  COLORS.secondary,
  COLORS.cyan,
  COLORS.pink,
  COLORS.lime,
];

/**
 * HTTP method → chart fill.  Mirrors the legacy Dashboard so bar
 * charts stay consistent.  Methods not in this map default to slate.
 */
export const METHOD_COLORS: Record<string, string> = {
  GET: COLORS.primary,
  POST: COLORS.success,
  PUT: COLORS.warning,
  DELETE: COLORS.error,
  PATCH: COLORS.cyan,
  OPTIONS: COLORS.slateMuted,
  HEAD: COLORS.secondary,
};

/**
 * Latency bucket → color.  `latencyBucket(ms)` (see formatters.ts)
 * returns the key to look up here.
 */
export const LATENCY_COLORS: Record<
  "fast" | "normal" | "slow" | "very_slow",
  string
> = {
  fast: COLORS.success, // < 100ms
  normal: COLORS.warning, // 100-500ms
  slow: COLORS.orange, // 500-1000ms
  very_slow: COLORS.error, // > 1s
};

/**
 * AI insights severity → badge variant (maps to `Badge` component).
 * Kept here so AiInsightsWidget + any future caller agree.
 */
export const SEVERITY_BADGE: Record<
  "critical" | "high" | "medium" | "low",
  { badge: "warning" | "danger" | "info"; label: string }
> = {
  critical: { badge: "danger", label: "CRITICAL" },
  high: { badge: "danger", label: "HIGH" },
  medium: { badge: "warning", label: "MEDIUM" },
  low: { badge: "info", label: "LOW" },
};

/**
 * How long server-side dashboard fetches stay fresh before Next.js
 * revalidates in the background.  15 seconds matches the legacy
 * dashboard's auto-refresh cadence — close to real-time without
 * hammering the backend.
 */
export const DASHBOARD_REVALIDATE_SECONDS = 15;
