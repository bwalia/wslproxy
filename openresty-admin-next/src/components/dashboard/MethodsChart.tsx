"use client";

import React, { useMemo } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import type { BadgeProps } from "@/components/ui/Badge";

// ── Types ────────────────────────────────────────────────────────────────

interface MethodsChartProps {
  methods: Record<string, number> | null;
  loading: boolean;
}

// ── Method color mapping ─────────────────────────────────────────────────

const METHOD_STYLES: Record<string, { variant: BadgeProps["variant"]; bg: string }> = {
  GET:     { variant: "info",    bg: "bg-blue-500" },
  POST:    { variant: "success", bg: "bg-green-500" },
  PUT:     { variant: "warning", bg: "bg-amber-500" },
  DELETE:  { variant: "danger",  bg: "bg-red-500" },
  PATCH:   { variant: "primary", bg: "bg-purple-500" },
  OPTIONS: { variant: "default", bg: "bg-slate-500" },
  HEAD:    { variant: "info",    bg: "bg-cyan-500" },
};

function getMethodStyle(method: string) {
  return METHOD_STYLES[method.toUpperCase()] ?? { variant: "default" as const, bg: "bg-slate-500" };
}

// ── Row component ────────────────────────────────────────────────────────

interface MethodRowProps {
  method: string;
  count: number;
  pct: number;
}

const MethodRow = React.memo(function MethodRow({
  method,
  count,
  pct,
}: MethodRowProps) {
  const style = getMethodStyle(method);

  return (
    <div className="flex items-center gap-3 py-1.5">
      <Badge variant={style.variant} size="sm" className="w-18 shrink-0 justify-center font-mono">
        {method}
      </Badge>
      <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={`absolute inset-y-0 left-0 rounded-full transition-all ${style.bg}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-14 shrink-0 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
        {count.toLocaleString()}
      </span>
    </div>
  );
});

// ── Main component ───────────────────────────────────────────────────────

const MethodsChart: React.FC<MethodsChartProps> = ({ methods, loading }) => {
  const sorted = useMemo(() => {
    if (!methods || typeof methods !== "object" || Array.isArray(methods)) return [];
    return Object.entries(methods)
      .map(([method, count]) => ({ method, count }))
      .sort((a, b) => b.count - a.count);
  }, [methods]);

  const total = useMemo(
    () => sorted.reduce((sum, e) => sum + e.count, 0),
    [sorted],
  );

  if (loading) {
    return (
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            HTTP Methods
          </h2>
        </Card.Header>
        <Card.Body className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          HTTP Methods
        </h2>
      </Card.Header>
      <Card.Body>
        {sorted.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
            No data available
          </p>
        ) : (
          <div className="space-y-0.5">
            {sorted.map(({ method, count }) => (
              <MethodRow
                key={method}
                method={method}
                count={count}
                pct={total > 0 ? (count / total) * 100 : 0}
              />
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default React.memo(MethodsChart);
