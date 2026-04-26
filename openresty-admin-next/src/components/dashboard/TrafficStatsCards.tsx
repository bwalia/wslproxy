"use client";

import React, { useMemo } from "react";
import {
  Activity,
  Download,
  AlertTriangle,
  Globe,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";
import {
  formatBytes,
  formatNumber,
  formatPercent,
} from "@/lib/utils/formatters";

/* ──────────────────────────────────────────────────────────────────────────
   Dashboard stats strip — 6 small cards with 24-hour summary metrics.

   Layout principles:
    - Fixed card shape (icon top-left, label top-right, value bottom).
      Value + label never compete for width; we always know where
      each element sits.
    - Tabular numerals on the value so card heights stay identical
      when digits change.
    - `formatNumber` / `formatBytes` collapse large values to K/M/G
      so the cards never show a 9-digit number that blows out width.
    - Trend badge rendered below the value, not beside it, so long
      trends (+15.3%) can't cause a horizontal cutoff.
    - Responsive grid steps from 2 cols on mobile → 3 on small
      desktop → 6 on wide, so each card always has ≥160px.
   ────────────────────────────────────────────────────────────────────────── */

export interface TrafficSummary {
  total_requests_24h?: number;
  total_bandwidth_24h?: number;
  total_errors_24h?: number;
  total_success_24h?: number;
  success_rate?: number;
  avg_requests_per_hour?: number;
  /**
   * Count of unique domains with traffic — derived by the parent
   * component from `top_domains.length`.  Matches the legacy dashboard,
   * which did the same (no dedicated backend field).
   */
  total_domains?: number;
  /** Signed percent changes vs the previous period (optional). */
  requests_trend_pct?: number;
  errors_trend_pct?: number;
  success_rate_trend_pct?: number;
}

interface TrafficStatsCardsProps {
  summary: TrafficSummary | null;
  loading: boolean;
}

// ── Card definition ──────────────────────────────────────────────────────

type AccentKey =
  | "blue"
  | "violet"
  | "red"
  | "emerald"
  | "amber"
  | "green";

interface StatDef {
  key: string;
  label: string;
  icon: LucideIcon;
  accent: AccentKey;
  format: (summary: TrafficSummary) => string;
  trend?: (summary: TrafficSummary) => number | undefined;
}

// Color accents kept in one place so the icon tile, left border, and
// dark-mode variants all stay in lockstep.  Using Tailwind arbitrary
// colors in-line would fragment this and make future theme tweaks
// painful.
const ACCENT_STYLES: Record<AccentKey, {
  border: string;
  iconBg: string;
  iconColor: string;
}> = {
  blue: {
    border: "border-l-blue-500",
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  violet: {
    border: "border-l-violet-500",
    iconBg: "bg-violet-50 dark:bg-violet-900/30",
    iconColor: "text-violet-600 dark:text-violet-400",
  },
  red: {
    border: "border-l-red-500",
    iconBg: "bg-red-50 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
  },
  emerald: {
    border: "border-l-emerald-500",
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
  amber: {
    border: "border-l-amber-500",
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  green: {
    border: "border-l-green-500",
    iconBg: "bg-green-50 dark:bg-green-900/30",
    iconColor: "text-green-600 dark:text-green-400",
  },
};

const STAT_DEFS: StatDef[] = [
  {
    key: "requests",
    label: "Requests (24h)",
    icon: Activity,
    accent: "blue",
    format: (s) => formatNumber(s.total_requests_24h),
    trend: (s) => s.requests_trend_pct,
  },
  {
    key: "bandwidth",
    label: "Bandwidth (24h)",
    icon: Download,
    accent: "violet",
    format: (s) => formatBytes(s.total_bandwidth_24h),
  },
  {
    key: "errors",
    label: "Errors (24h)",
    icon: AlertTriangle,
    accent: "red",
    format: (s) => formatNumber(s.total_errors_24h),
    trend: (s) => s.errors_trend_pct,
  },
  {
    key: "domains",
    label: "Active Domains",
    icon: Globe,
    accent: "emerald",
    format: (s) => formatNumber(s.total_domains),
  },
  {
    key: "avg_hour",
    label: "Avg / Hour",
    icon: Clock,
    accent: "amber",
    format: (s) => formatNumber(s.avg_requests_per_hour),
  },
  {
    key: "success_rate",
    label: "Success Rate",
    icon: TrendingUp,
    accent: "green",
    format: (s) => formatPercent(s.success_rate),
    trend: (s) => s.success_rate_trend_pct,
  },
];

// ── Trend badge ──────────────────────────────────────────────────────────

function TrendBadge({ pct }: { pct: number }) {
  const flat = Math.abs(pct) < 0.1;
  const up = pct > 0;
  const tone = flat
    ? "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
    : up
      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
      : "bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-300";
  const Icon = flat ? Minus : up ? TrendingUp : TrendingDown;
  const label = `${up && !flat ? "+" : ""}${pct.toFixed(1)}%`;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums",
        tone,
      )}
      title={`${label} vs previous period`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden="true" />
      {label}
    </span>
  );
}

// ── Single stat card ─────────────────────────────────────────────────────

interface SingleStatProps {
  def: StatDef;
  summary: TrafficSummary | null;
  loading: boolean;
}

const SingleStatCard = React.memo(function SingleStatCard({
  def,
  summary,
  loading,
}: SingleStatProps) {
  const Icon = def.icon;
  const accent = ACCENT_STYLES[def.accent];
  const value = useMemo(
    () => (summary ? def.format(summary) : "0"),
    [summary, def],
  );
  const trendPct = useMemo(
    () => (summary && def.trend ? def.trend(summary) : undefined),
    [summary, def],
  );

  return (
    <Card
      className={cn(
        "overflow-hidden border-l-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        accent.border,
      )}
    >
      <Card.Body className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              accent.iconBg,
              accent.iconColor,
            )}
          >
            <Icon className="h-4 w-4" aria-hidden="true" />
          </div>
          {trendPct !== undefined && !loading && <TrendBadge pct={trendPct} />}
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="mb-1.5 h-7 w-20" />
          ) : (
            <p
              className="truncate text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100"
              title={value}
            >
              {value}
            </p>
          )}
          <p className="truncate text-xs font-medium text-slate-500 dark:text-slate-400">
            {def.label}
          </p>
        </div>
      </Card.Body>
    </Card>
  );
});

// ── Main component ───────────────────────────────────────────────────────

const TrafficStatsCards: React.FC<TrafficStatsCardsProps> = ({
  summary,
  loading,
}) => (
  // Responsive grid: 2 cols phones → 3 small tablets → 6 wide desktops.
  // Guarantees each card ≥160px even at laptop widths, eliminating the
  // cut-off observed in the older 1/sm:2/md:3/lg:6 stack.
  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
    {STAT_DEFS.map((def) => (
      <SingleStatCard
        key={def.key}
        def={def}
        summary={summary}
        loading={loading}
      />
    ))}
  </div>
);

export default React.memo(TrafficStatsCards);
