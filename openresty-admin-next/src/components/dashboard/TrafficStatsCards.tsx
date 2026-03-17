"use client";

import React, { useMemo } from "react";
import {
  Activity,
  Download,
  AlertTriangle,
  Globe,
  Clock,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";

// ── Types ────────────────────────────────────────────────────────────────

export interface TrafficSummary {
  total_requests_24h?: number;
  total_bandwidth_24h?: number;
  total_errors_24h?: number;
  total_success_24h?: number;
  success_rate?: number;
  avg_requests_per_hour?: number;
}

interface TrafficStatsCardsProps {
  summary: TrafficSummary | null;
  loading: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function formatNumber(n: number | undefined): string {
  if (n == null) return "0";
  return n.toLocaleString();
}

function formatBytes(bytes: number | undefined): string {
  if (bytes == null || bytes === 0) return "0 B";
  if (bytes >= 1_073_741_824) return `${(bytes / 1_073_741_824).toFixed(1)} GB`;
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatPercent(n: number | undefined): string {
  if (n == null) return "0.0%";
  return `${n.toFixed(1)}%`;
}

// ── Card definition ──────────────────────────────────────────────────────

interface StatDef {
  key: string;
  label: string;
  icon: LucideIcon;
  accentBorder: string;
  iconBg: string;
  iconColor: string;
  format: (summary: TrafficSummary) => string;
}

const STAT_DEFS: StatDef[] = [
  {
    key: "requests",
    label: "Requests (24h)",
    icon: Activity,
    accentBorder: "border-l-blue-500",
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    format: (s) => formatNumber(s.total_requests_24h),
  },
  {
    key: "bandwidth",
    label: "Bandwidth (24h)",
    icon: Download,
    accentBorder: "border-l-purple-500",
    iconBg: "bg-purple-50 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
    format: (s) => formatBytes(s.total_bandwidth_24h),
  },
  {
    key: "errors",
    label: "Errors (24h)",
    icon: AlertTriangle,
    accentBorder: "border-l-red-500",
    iconBg: "bg-red-50 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
    format: (s) => formatNumber(s.total_errors_24h),
  },
  {
    key: "domains",
    label: "Active Domains",
    icon: Globe,
    accentBorder: "border-l-emerald-500",
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    format: (s) => formatNumber(s.total_success_24h),
  },
  {
    key: "avg_hour",
    label: "Avg / Hour",
    icon: Clock,
    accentBorder: "border-l-amber-500",
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    format: (s) => formatNumber(s.avg_requests_per_hour),
  },
  {
    key: "success_rate",
    label: "Success Rate",
    icon: TrendingUp,
    accentBorder: "border-l-green-500",
    iconBg: "bg-green-50 dark:bg-green-900/30",
    iconColor: "text-green-600 dark:text-green-400",
    format: (s) => formatPercent(s.success_rate),
  },
];

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
  const value = useMemo(
    () => (summary ? def.format(summary) : "0"),
    [summary, def],
  );

  return (
    <Card
      className={cn(
        "border-l-4 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md",
        def.accentBorder,
      )}
    >
      <Card.Body className="flex items-center gap-4">
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg",
            def.iconBg,
            def.iconColor,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          {loading ? (
            <Skeleton className="mb-1 h-7 w-16" />
          ) : (
            <p className="truncate text-2xl font-bold text-slate-900 dark:text-slate-100">
              {value}
            </p>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
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
  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6">
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
