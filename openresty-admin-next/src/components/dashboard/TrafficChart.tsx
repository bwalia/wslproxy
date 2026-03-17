"use client";

import React, { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  type TooltipProps,
} from "recharts";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

// ── Types ────────────────────────────────────────────────────────────────

interface ChartDatum {
  name: string;
  requests: number;
  success?: number;
  errors: number;
}

interface TrafficChartProps {
  chartData: ChartDatum[] | null;
  loading: boolean;
}

// ── Custom tooltip ───────────────────────────────────────────────────────

const CustomTooltip: React.FC<TooltipProps<number, string>> = ({
  active,
  payload,
  label,
}) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm shadow-lg dark:border-slate-700 dark:bg-slate-800">
      <p className="mb-1 font-medium text-slate-900 dark:text-slate-100">
        {label}
      </p>
      {payload.map((entry) => (
        <p key={entry.dataKey} style={{ color: entry.color }}>
          {entry.name}: {(entry.value ?? 0).toLocaleString()}
        </p>
      ))}
    </div>
  );
};

// ── Main component ───────────────────────────────────────────────────────

const TrafficChart: React.FC<TrafficChartProps> = ({ chartData, loading }) => {
  const data = useMemo(() => (Array.isArray(chartData) ? chartData : []), [chartData]);

  if (loading) {
    return (
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Traffic Overview (24h)
          </h2>
        </Card.Header>
        <Card.Body>
          <Skeleton variant="rectangular" className="h-80 w-full" />
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Traffic Overview (24h)
        </h2>
      </Card.Header>
      <Card.Body className="pr-2">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorRequests" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorSuccess" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#10b981" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="colorErrors" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-slate-200 dark:stroke-slate-700"
            />
            <XAxis
              dataKey="name"
              tick={{ fontSize: 12 }}
              className="fill-slate-500 dark:fill-slate-400"
            />
            <YAxis
              tick={{ fontSize: 12 }}
              className="fill-slate-500 dark:fill-slate-400"
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="requests"
              name="Requests"
              stroke="#6366f1"
              fill="url(#colorRequests)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="success"
              name="Success"
              stroke="#10b981"
              fill="url(#colorSuccess)"
              strokeWidth={2}
            />
            <Area
              type="monotone"
              dataKey="errors"
              name="Errors"
              stroke="#ef4444"
              fill="url(#colorErrors)"
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </Card.Body>
    </Card>
  );
};

export default React.memo(TrafficChart);
