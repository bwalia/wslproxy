"use client";

import React, { useMemo } from "react";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";

// ── Types ────────────────────────────────────────────────────────────────

interface LatencyData {
  fast?: number;
  normal?: number;
  slow?: number;
  very_slow?: number;
}

interface LatencyChartProps {
  latency: LatencyData | null;
  loading: boolean;
}

// ── Band definitions ─────────────────────────────────────────────────────

interface Band {
  key: keyof LatencyData;
  label: string;
  range: string;
  barColor: string;
}

const BANDS: Band[] = [
  { key: "fast", label: "Fast", range: "<100ms", barColor: "bg-green-500" },
  { key: "normal", label: "Normal", range: "100-500ms", barColor: "bg-amber-500" },
  { key: "slow", label: "Slow", range: "500ms-1s", barColor: "bg-orange-500" },
  { key: "very_slow", label: "Very Slow", range: ">1s", barColor: "bg-red-500" },
];

// ── Band row ─────────────────────────────────────────────────────────────

interface BandRowProps {
  band: Band;
  count: number;
  pct: number;
}

const BandRow = React.memo(function BandRow({ band, count, pct }: BandRowProps) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-700 dark:text-slate-300">
            {band.label}
          </span>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {band.range}
          </span>
        </div>
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {count.toLocaleString()}
        </span>
      </div>
      <div className="relative h-2.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
        <div
          className={cn("absolute inset-y-0 left-0 rounded-full transition-all", band.barColor)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
});

// ── Main component ───────────────────────────────────────────────────────

const LatencyChart: React.FC<LatencyChartProps> = ({ latency, loading }) => {
  const { total, bands } = useMemo(() => {
    const lat = latency ?? {};
    const values = BANDS.map((b) => lat[b.key] ?? 0);
    const sum = values.reduce((a, c) => a + c, 0);
    return {
      total: sum,
      bands: BANDS.map((b, i) => ({
        band: b,
        count: values[i],
        pct: sum > 0 ? (values[i] / sum) * 100 : 0,
      })),
    };
  }, [latency]);

  if (loading) {
    return (
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Latency Distribution
          </h2>
        </Card.Header>
        <Card.Body className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex items-center justify-between w-full">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Latency Distribution
          </h2>
          <span className="text-xs text-slate-400 dark:text-slate-500">
            {total.toLocaleString()} total
          </span>
        </div>
      </Card.Header>
      <Card.Body className="space-y-4">
        {bands.map(({ band, count, pct }) => (
          <BandRow key={band.key} band={band} count={count} pct={pct} />
        ))}
      </Card.Body>
    </Card>
  );
};

export default React.memo(LatencyChart);
