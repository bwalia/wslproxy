"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  CheckCircle2,
  XCircle,
  Activity,
  Server,
  HeartPulse,
  AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { useDataProvider } from "@/hooks/useResource";

// ── Types ───────────────────────────────────────────────────────────────

interface BackendStats {
  requests: number;
  errors: number;
  avg_latency_ms: number;
  error_rate: number;
}

interface HealthBackend {
  label: string;
  address: string;
  healthy: boolean;
  stats?: BackendStats;
}

interface HealthRule {
  rule_id: string;
  backends: HealthBackend[];
}

interface TopologyBackend {
  label: string;
  address: string;
  weight: number;
}

interface TopologyRule {
  rule_id: string;
  rule_name: string;
  server_name: string;
  path: string;
  routing: { mode: string };
  backends: TopologyBackend[];
  backend_stats?: Record<string, BackendStats>;
}

interface MergedBackend {
  label: string;
  address: string;
  weight: number;
  healthy: boolean;
  requests: number;
  errors: number;
  avg_latency_ms: number;
  error_rate: number;
}

interface MergedRule {
  rule_id: string;
  rule_name: string;
  server_name: string;
  path: string;
  routing_mode: string;
  backends: MergedBackend[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function latencyColor(ms: number): string {
  if (ms < 100) return "text-green-600 dark:text-green-400";
  if (ms < 500) return "text-amber-600 dark:text-amber-400";
  if (ms < 1000) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function latencyBarColor(ms: number): string {
  if (ms < 100) return "#22c55e";
  if (ms < 500) return "#f59e0b";
  if (ms < 1000) return "#f97316";
  return "#ef4444";
}

// ── Sub-components ──────────────────────────────────────────────────────

const SummaryCard = React.memo(function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  variant = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  const iconColors: Record<string, string> = {
    default: "text-slate-500 dark:text-slate-400",
    success: "text-green-500",
    danger: "text-red-500",
    warning: "text-amber-500",
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex items-center justify-center h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800",
            iconColors[variant]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {value}
          </p>
          {sub && (
            <p className="text-xs text-slate-400 dark:text-slate-500">{sub}</p>
          )}
        </div>
      </div>
    </Card>
  );
});

const BackendTable = React.memo(function BackendTable({
  backends,
}: {
  backends: MergedBackend[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
            <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">
              Backend
            </th>
            <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">
              Address
            </th>
            <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">
              Weight %
            </th>
            <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400">
              Health
            </th>
            <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400 text-right">
              Requests
            </th>
            <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400 text-right">
              Errors
            </th>
            <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400 text-right">
              Error Rate %
            </th>
            <th className="py-2 px-3 font-medium text-slate-500 dark:text-slate-400 text-right">
              Latency
            </th>
          </tr>
        </thead>
        <tbody>
          {backends.map((b) => (
            <tr
              key={b.label}
              className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
            >
              <td className="py-2 px-3 font-medium text-slate-900 dark:text-slate-100">
                {b.label}
              </td>
              <td className="py-2 px-3 font-mono text-xs text-slate-600 dark:text-slate-300">
                {b.address}
              </td>
              <td className="py-2 px-3 text-slate-700 dark:text-slate-300">
                {b.weight}%
              </td>
              <td className="py-2 px-3">
                {b.healthy ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <XCircle className="h-4 w-4 text-red-500" />
                )}
              </td>
              <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">
                {b.requests.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">
                {b.errors.toLocaleString()}
              </td>
              <td className="py-2 px-3 text-right text-slate-700 dark:text-slate-300">
                {b.error_rate.toFixed(2)}%
              </td>
              <td
                className={cn(
                  "py-2 px-3 text-right font-medium",
                  latencyColor(b.avg_latency_ms)
                )}
              >
                {b.avg_latency_ms.toFixed(1)}ms
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
});

const BackendCharts = React.memo(function BackendCharts({
  backends,
}: {
  backends: MergedBackend[];
}) {
  const chartData = useMemo(
    () =>
      backends.map((b) => ({
        name: b.label,
        requests: b.requests,
        errors: b.errors,
        latency: b.avg_latency_ms,
        latencyColor: latencyBarColor(b.avg_latency_ms),
      })),
    [backends]
  );

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
      <div>
        <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
          Requests &amp; Errors
        </h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
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
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-slate-900, #0f172a)",
                border: "1px solid var(--color-slate-700, #334155)",
                borderRadius: "8px",
                color: "#e2e8f0",
              }}
            />
            <Legend />
            <Bar dataKey="requests" fill="#3b82f6" radius={[4, 4, 0, 0]} />
            <Bar dataKey="errors" fill="#ef4444" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div>
        <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">
          Latency
        </h4>
        <ResponsiveContainer width="100%" height={250}>
          <BarChart data={chartData}>
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
              unit="ms"
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--color-slate-900, #0f172a)",
                border: "1px solid var(--color-slate-700, #334155)",
                borderRadius: "8px",
                color: "#e2e8f0",
              }}
              formatter={(value: number) => [`${value.toFixed(1)}ms`, "Latency"]}
            />
            <Bar
              dataKey="latency"
              radius={[4, 4, 0, 0]}
              fill="#8b5cf6"
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              shape={(props: any) => {
                const { x, y, width, height, payload } = props;
                return (
                  <rect
                    x={x}
                    y={y}
                    width={width}
                    height={height}
                    rx={4}
                    ry={4}
                    fill={payload.latencyColor}
                  />
                );
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

// ── Main component ──────────────────────────────────────────────────────

const BackendHealth: React.FC = () => {
  const dp = useDataProvider();
  const [loading, setLoading] = useState(true);
  const [healthRules, setHealthRules] = useState<HealthRule[]>([]);
  const [topologyRules, setTopologyRules] = useState<TopologyRule[]>([]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [healthRes, topoRes] = await Promise.all([
        dp.getTrafficHealth(),
        dp.getTrafficTopology(),
      ]);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const hData = (healthRes as any)?.data;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const tData = (topoRes as any)?.data;
      setHealthRules(Array.isArray(hData?.rules) ? hData.rules : []);
      setTopologyRules(Array.isArray(tData?.rules_with_backends) ? tData.rules_with_backends : []);
    } catch {
      setHealthRules([]);
      setTopologyRules([]);
    } finally {
      setLoading(false);
    }
  }, [dp]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const mergedRules = useMemo<MergedRule[]>(() => {
    const healthMap = new Map<string, Map<string, HealthBackend>>();
    for (const rule of healthRules) {
      const backendMap = new Map<string, HealthBackend>();
      for (const b of rule.backends) {
        backendMap.set(b.label, b);
      }
      healthMap.set(rule.rule_id, backendMap);
    }

    return topologyRules.map((tRule) => {
      const hBackends = healthMap.get(tRule.rule_id);
      const backends: MergedBackend[] = tRule.backends.map((tb) => {
        const hb = hBackends?.get(tb.label);
        const stats =
          hb?.stats ?? tRule.backend_stats?.[tb.label] ?? undefined;
        return {
          label: tb.label,
          address: tb.address,
          weight: tb.weight,
          healthy: hb?.healthy ?? true,
          requests: stats?.requests ?? 0,
          errors: stats?.errors ?? 0,
          avg_latency_ms: stats?.avg_latency_ms ?? 0,
          error_rate: stats?.error_rate ?? 0,
        };
      });

      return {
        rule_id: tRule.rule_id,
        rule_name: tRule.rule_name,
        server_name: tRule.server_name,
        path: tRule.path,
        routing_mode: tRule.routing?.mode ?? "unknown",
        backends,
      };
    });
  }, [healthRules, topologyRules]);

  const summaryStats = useMemo(() => {
    const totalBackends = mergedRules.reduce(
      (acc, r) => acc + r.backends.length,
      0
    );
    const healthyBackends = mergedRules.reduce(
      (acc, r) => acc + r.backends.filter((b) => b.healthy).length,
      0
    );
    const totalErrors = mergedRules.reduce(
      (acc, r) => acc + r.backends.reduce((a, b) => a + b.errors, 0),
      0
    );
    const totalRequests = mergedRules.reduce(
      (acc, r) => acc + r.backends.reduce((a, b) => a + b.requests, 0),
      0
    );
    const errorRate =
      totalRequests > 0 ? ((totalErrors / totalRequests) * 100).toFixed(2) : "0.00";

    return {
      rulesCount: mergedRules.length,
      totalBackends,
      healthyBackends,
      errorRate,
    };
  }, [mergedRules]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton variant="rectangular" className="h-16" />
            </Card>
          ))}
        </div>
        {Array.from({ length: 2 }).map((_, i) => (
          <Card key={i}>
            <Card.Header>
              <Skeleton className="h-5 w-48" />
            </Card.Header>
            <Card.Body>
              <Skeleton variant="rectangular" className="h-32" />
            </Card.Body>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={Activity}
          label="Rules with Backends"
          value={summaryStats.rulesCount}
        />
        <SummaryCard
          icon={Server}
          label="Total Backends"
          value={summaryStats.totalBackends}
        />
        <SummaryCard
          icon={HeartPulse}
          label="Backend Health"
          value={`${summaryStats.healthyBackends}/${summaryStats.totalBackends}`}
          variant={
            summaryStats.healthyBackends === summaryStats.totalBackends
              ? "success"
              : "danger"
          }
        />
        <SummaryCard
          icon={AlertTriangle}
          label="Error Rate"
          value={`${summaryStats.errorRate}%`}
          variant={
            parseFloat(summaryStats.errorRate) > 5
              ? "danger"
              : parseFloat(summaryStats.errorRate) > 1
                ? "warning"
                : "success"
          }
        />
      </div>

      {/* Per-rule cards */}
      {mergedRules.length === 0 && (
        <Card>
          <Card.Body>
            <p className="text-center text-slate-500 dark:text-slate-400 py-8">
              No traffic-split rules with backends found.
            </p>
          </Card.Body>
        </Card>
      )}

      {mergedRules.map((rule) => (
        <Card key={rule.rule_id}>
          <Card.Header>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
                {rule.rule_name}
              </h3>
              <Badge variant="info" size="sm">
                {rule.server_name}
              </Badge>
              <Badge variant="default" size="sm">
                {rule.path}
              </Badge>
              <Badge variant="primary" size="sm">
                {rule.routing_mode}
              </Badge>
            </div>
          </Card.Header>
          <Card.Body className="space-y-4">
            <BackendTable backends={rule.backends} />
            {rule.backends.length > 1 && (
              <BackendCharts backends={rule.backends} />
            )}
          </Card.Body>
        </Card>
      ))}
    </div>
  );
};

BackendHealth.displayName = "BackendHealth";

export default React.memo(BackendHealth);
