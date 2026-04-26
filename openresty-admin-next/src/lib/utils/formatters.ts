/* ──────────────────────────────────────────────────────────────────────────
   Shared display formatters used across the dashboard and anywhere
   else that renders numeric metrics.

   All formatters match the legacy openresty-admin/src/Dashboard
   behaviour exactly — same rounding, same SI suffixes, same zero-case
   strings — so the two UIs show identical values for identical data
   during the migration.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Byte count → human-readable string.  1024-based (KiB/MiB/etc.),
 * but uses the shorter "K/M/G/T B" suffixes to match the legacy
 * visuals.  Zero → "0 B".
 */
export function formatBytes(bytes: number | undefined | null, decimals = 2): string {
  if (!bytes || bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  const value = bytes / Math.pow(k, i);
  return `${value.toFixed(decimals)} ${sizes[i]}`;
}

/**
 * Count → "1.2K" / "3.4M" shorthand.  Below 1000 shows the raw
 * integer.  Used for request / error counts anywhere space is tight.
 */
export function formatNumber(num: number | undefined | null): string {
  if (num === undefined || num === null) return "0";
  const abs = Math.abs(num);
  if (abs >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(num / 1_000).toFixed(1)}K`;
  return String(num);
}

/**
 * Numeric percent → "87.3%" (one decimal).  Accepts either a ratio
 * (0–1) when `isRatio: true` or a plain percent (0–100) by default.
 */
export function formatPercent(
  value: number | undefined | null,
  { isRatio = false, decimals = 1 }: { isRatio?: boolean; decimals?: number } = {},
): string {
  if (value === undefined || value === null || Number.isNaN(value)) return "0%";
  const pct = isRatio ? value * 100 : value;
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Latency ms → color bucket matching the legacy palette.  Used by
 * the traffic split / backend health table so fast / slow backends
 * share the same visual language as the old dashboard.
 */
export function latencyBucket(ms: number | undefined | null): "fast" | "normal" | "slow" | "very_slow" {
  if (!ms || ms < 100) return "fast";
  if (ms < 500) return "normal";
  if (ms < 1000) return "slow";
  return "very_slow";
}
