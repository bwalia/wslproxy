"use client";

import React, { useMemo } from "react";
import { Globe } from "lucide-react";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { formatNumber } from "@/lib/utils/formatters";
import { cn } from "@/lib/utils/cn";

/* ──────────────────────────────────────────────────────────────────────────
   "Top Domains" chart — rendered as a simple CSS-bar list rather than
   a Recharts BarChart.

   Why we ditched Recharts here:
    - The card sits in a 4-column grid, so each instance is narrow.
      Recharts' vertical BarChart devotes ~140px to the YAxis label
      column before the bar starts rendering, leaving the actual bar
      cramped (the visible cutoff the user reported).
    - Rendering N rows of `<div className="w-[x%]">` gives us
      predictable layout at any width, no canvas/SVG overhead, and
      proper truncation on the domain name via `truncate`.
    - Legacy dashboard rendered this exact same list style — we're
      matching parity, not introducing a new pattern.
   ────────────────────────────────────────────────────────────────────────── */

interface DomainEntry {
  domain: string;
  requests: number;
}

interface TopDomainsChartProps {
  domains: DomainEntry[] | null;
  loading: boolean;
  /** Max rows rendered; everything beyond is trimmed silently. */
  limit?: number;
}

// ── Main component ───────────────────────────────────────────────────────

const TopDomainsChart: React.FC<TopDomainsChartProps> = ({
  domains,
  loading,
  limit = 8,
}) => {
  const { rows, maxRequests, total } = useMemo(() => {
    if (!Array.isArray(domains) || domains.length === 0) {
      return { rows: [], maxRequests: 0, total: 0 };
    }
    const sorted = [...domains]
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);
    return {
      rows: sorted,
      maxRequests: sorted[0]?.requests ?? 0,
      total: domains.reduce((s, d) => s + (d.requests ?? 0), 0),
    };
  }, [domains, limit]);

  return (
    <Card className="flex h-full flex-col">
      <Card.Header>
        <div className="flex min-w-0 items-center gap-2">
          <Globe className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            Top Domains
          </h3>
        </div>
        {total > 0 && (
          <span className="text-xs text-slate-500 dark:text-slate-400">
            {formatNumber(total)} total
          </span>
        )}
      </Card.Header>
      <Card.Body className="flex-1">
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-6 text-center text-slate-400 dark:text-slate-500">
            <Globe className="mb-1.5 h-6 w-6" aria-hidden="true" />
            <p className="text-xs">No domain traffic yet</p>
          </div>
        ) : (
          <ol className="space-y-2.5">
            {rows.map((row, idx) => (
              <DomainRow
                key={row.domain}
                rank={idx + 1}
                domain={row.domain}
                requests={row.requests}
                widthPct={
                  maxRequests > 0 ? (row.requests / maxRequests) * 100 : 0
                }
              />
            ))}
          </ol>
        )}
      </Card.Body>
    </Card>
  );
};

// ── Single row ───────────────────────────────────────────────────────────

interface DomainRowProps {
  rank: number;
  domain: string;
  requests: number;
  widthPct: number;
}

const DomainRow = React.memo(function DomainRow({
  rank,
  domain,
  requests,
  widthPct,
}: DomainRowProps) {
  return (
    <li className="flex items-center gap-2">
      <span
        className={cn(
          "w-4 shrink-0 text-right text-xs font-mono text-slate-400 dark:text-slate-500",
        )}
      >
        {rank}
      </span>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex items-baseline justify-between gap-2">
          <span
            className="truncate text-xs font-medium text-slate-700 dark:text-slate-200"
            title={domain}
          >
            {domain}
          </span>
          <span className="shrink-0 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
            {formatNumber(requests)}
          </span>
        </div>
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div
            className="h-full rounded-full bg-linear-to-r from-primary-500 to-primary-600 transition-[width] duration-500 ease-out"
            style={{ width: `${Math.max(widthPct, 2)}%` }}
          />
        </div>
      </div>
    </li>
  );
});

export default React.memo(TopDomainsChart);
