"use client";

import React, { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

// ── Types ────────────────────────────────────────────────────────────────

interface DomainEntry {
  domain: string;
  requests: number;
}

interface TopDomainsChartProps {
  domains: DomainEntry[] | null;
  loading: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max) + "\u2026" : str;
}

// ── Custom tooltip ───────────────────────────────────────────────────────

const CustomTooltip: React.FC<TooltipProps<number, string>> = ({
  active,
  payload,
}) => {
  if (!active || !payload?.length) return null;
  const entry = payload[0]?.payload as DomainEntry | undefined;
  if (!entry) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="font-medium text-slate-900 dark:text-slate-100">
        {entry.domain}
      </p>
      <p className="text-primary-600 dark:text-primary-400">
        {entry.requests.toLocaleString()} requests
      </p>
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────

const TopDomainsChart: React.FC<TopDomainsChartProps> = ({
  domains,
  loading,
}) => {
  const data = useMemo(() => {
    if (!Array.isArray(domains) || domains.length === 0) return [];
    return domains.slice(0, 8).map((d) => ({
      ...d,
      shortDomain: truncate(d.domain, 20),
    }));
  }, [domains]);

  if (loading) {
    return (
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Top Domains
          </h2>
        </Card.Header>
        <Card.Body>
          <Skeleton variant="rectangular" className="h-[300px] w-full" />
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Top Domains
        </h2>
      </Card.Header>
      <Card.Body className="pr-2">
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={data} layout="vertical" margin={{ left: 20 }}>
            <defs>
              <linearGradient id="barGradient" x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stopColor="var(--color-primary-500, #6366f1)" />
                <stop offset="100%" stopColor="var(--color-primary-700, #4338ca)" />
              </linearGradient>
            </defs>
            <XAxis
              type="number"
              tick={{ fontSize: 12 }}
              className="fill-slate-500 dark:fill-slate-400"
            />
            <YAxis
              type="category"
              dataKey="shortDomain"
              width={140}
              tick={{ fontSize: 12 }}
              className="fill-slate-500 dark:fill-slate-400"
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar
              dataKey="requests"
              fill="url(#barGradient)"
              radius={[0, 4, 4, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </Card.Body>
    </Card>
  );
};

export default React.memo(TopDomainsChart);
