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
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import {
  Activity,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Server,
  ArrowUpDown,
  RefreshCw,
  Sparkles,
  Search,
  TrendingUp,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { useDataProvider } from "@/hooks/useResource";

// ── Types ────────────────────────────────────────────────────────────────

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

interface BackendMonitorProps {
  onAnalyze: (context: string) => void;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function latencyClass(ms: number): string {
  if (ms < 100) return "text-green-600 dark:text-green-400";
  if (ms < 500) return "text-amber-600 dark:text-amber-400";
  if (ms < 1000) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

function latencyBg(ms: number): string {
  if (ms < 100) return "bg-green-500";
  if (ms < 500) return "bg-amber-500";
  if (ms < 1000) return "bg-orange-500";
  return "bg-red-500";
}

const PIE_COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6"];

// ── Summary card ────────────────────────────────────────────────────────

const MetricCard = React.memo(function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  color,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
      <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg", color)}>
        <Icon className="h-5 w-5 text-white" />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        {sub && <p className="text-xs text-slate-400">{sub}</p>}
      </div>
    </div>
  );
});

// ── Backend row ─────────────────────────────────────────────────────────

const BackendRow = React.memo(function BackendRow({
  backend,
  maxRequests,
}: {
  backend: MergedBackend;
  maxRequests: number;
}) {
  const barWidth = maxRequests > 0 ? (backend.requests / maxRequests) * 100 : 0;

  return (
    <tr className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          {backend.healthy ? (
            <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />
          ) : (
            <XCircle className="h-4 w-4 text-red-500 shrink-0 animate-pulse" />
          )}
          <div>
            <p className="font-medium text-sm text-slate-900 dark:text-slate-100">{backend.label}</p>
            <p className="text-xs font-mono text-slate-400">{backend.address}</p>
          </div>
        </div>
      </td>
      <td className="py-3 px-3">
        <Badge variant={backend.healthy ? "success" : "danger"} size="sm">
          {backend.healthy ? "Healthy" : "Unhealthy"}
        </Badge>
      </td>
      <td className="py-3 px-3 text-right text-sm text-slate-700 dark:text-slate-300">
        {backend.weight}%
      </td>
      <td className="py-3 px-3">
        <div className="flex items-center gap-2">
          <div className="flex-1 h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-blue-500 rounded-full transition-all duration-500"
              style={{ width: `${barWidth}%` }}
            />
          </div>
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400 tabular-nums w-16 text-right">
            {backend.requests.toLocaleString()}
          </span>
        </div>
      </td>
      <td className="py-3 px-3 text-right">
        <span className={cn("text-sm font-medium", backend.errors > 0 ? "text-red-600 dark:text-red-400" : "text-slate-400")}>
          {backend.errors.toLocaleString()}
        </span>
      </td>
      <td className="py-3 px-3 text-right">
        <span className={cn("text-sm font-medium", backend.error_rate > 5 ? "text-red-600" : backend.error_rate > 1 ? "text-amber-600" : "text-green-600")}>
          {backend.error_rate.toFixed(2)}%
        </span>
      </td>
      <td className="py-3 px-3 text-right">
        <div className="flex items-center justify-end gap-1.5">
          <div className={cn("h-2 w-2 rounded-full", latencyBg(backend.avg_latency_ms))} />
          <span className={cn("text-sm font-medium tabular-nums", latencyClass(backend.avg_latency_ms))}>
            {backend.avg_latency_ms.toFixed(1)}ms
          </span>
        </div>
      </td>
    </tr>
  );
});

// ── Main component ──────────────────────────────────────────────────────

const BackendMonitor: React.FC<BackendMonitorProps> = ({ onAnalyze }) => {
  const dp = useDataProvider();
  const [loading, setLoading] = useState(true);
  const [healthRules, setHealthRules] = useState<HealthRule[]>([]);
  const [topologyRules, setTopologyRules] = useState<TopologyRule[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "requests" | "errors" | "latency">("name");

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
      const bMap = new Map<string, HealthBackend>();
      for (const b of rule.backends) bMap.set(b.label, b);
      healthMap.set(rule.rule_id, bMap);
    }

    return topologyRules.map((tRule) => {
      const hBackends = healthMap.get(tRule.rule_id);
      const backends: MergedBackend[] = tRule.backends.map((tb) => {
        const hb = hBackends?.get(tb.label);
        const stats = hb?.stats ?? tRule.backend_stats?.[tb.label];
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

  const filteredRules = useMemo(() => {
    let rules = mergedRules;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rules = rules.filter(
        (r) =>
          r.rule_name.toLowerCase().includes(q) ||
          r.server_name.toLowerCase().includes(q) ||
          r.backends.some((b) => b.label.toLowerCase().includes(q) || b.address.toLowerCase().includes(q)),
      );
    }
    return rules;
  }, [mergedRules, searchQuery]);

  const stats = useMemo(() => {
    const all = mergedRules.flatMap((r) => r.backends);
    const healthy = all.filter((b) => b.healthy).length;
    const totalReqs = all.reduce((a, b) => a + b.requests, 0);
    const totalErrs = all.reduce((a, b) => a + b.errors, 0);
    const avgLatency = all.length > 0 ? all.reduce((a, b) => a + b.avg_latency_ms, 0) / all.length : 0;
    return { total: all.length, healthy, unhealthy: all.length - healthy, totalReqs, totalErrs, avgLatency };
  }, [mergedRules]);

  const healthPieData = useMemo(() => [
    { name: "Healthy", value: stats.healthy },
    { name: "Unhealthy", value: stats.unhealthy },
  ], [stats]);

  const topBackendsChart = useMemo(() => {
    const all = mergedRules.flatMap((r) =>
      r.backends.map((b) => ({ ...b, rule: r.rule_name }))
    );
    return [...all]
      .sort((a, b) => b.requests - a.requests)
      .slice(0, 10)
      .map((b) => ({
        name: b.label.length > 15 ? b.label.slice(0, 15) + "..." : b.label,
        requests: b.requests,
        errors: b.errors,
        latency: b.avg_latency_ms,
      }));
  }, [mergedRules]);

  const handleAnalyzeAll = useCallback(() => {
    const unhealthy = mergedRules.flatMap((r) =>
      r.backends.filter((b) => !b.healthy || b.error_rate > 5).map((b) => `${b.label} (${b.address}) - ${!b.healthy ? "UNHEALTHY" : `${b.error_rate.toFixed(1)}% errors`}`)
    );
    const ctx = unhealthy.length > 0
      ? `Backends with issues:\n${unhealthy.join("\n")}`
      : `All ${stats.total} backends healthy. Total requests: ${stats.totalReqs}, errors: ${stats.totalErrs}, avg latency: ${stats.avgLatency.toFixed(1)}ms`;
    onAnalyze(ctx);
  }, [mergedRules, stats, onAnalyze]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4"><Skeleton variant="rectangular" className="h-16" /></Card>
          ))}
        </div>
        <Card><Card.Body><Skeleton variant="rectangular" className="h-64" /></Card.Body></Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary metrics */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <MetricCard icon={Server} label="Total Backends" value={stats.total} color="bg-blue-500" />
        <MetricCard icon={CheckCircle2} label="Healthy" value={stats.healthy} color="bg-green-500" />
        <MetricCard icon={XCircle} label="Unhealthy" value={stats.unhealthy} color={stats.unhealthy > 0 ? "bg-red-500" : "bg-slate-400"} />
        <MetricCard icon={Activity} label="Total Requests" value={stats.totalReqs.toLocaleString()} color="bg-purple-500" />
        <MetricCard icon={AlertTriangle} label="Total Errors" value={stats.totalErrs.toLocaleString()} color={stats.totalErrs > 0 ? "bg-orange-500" : "bg-slate-400"} />
        <MetricCard icon={Clock} label="Avg Latency" value={`${stats.avgLatency.toFixed(1)}ms`} color="bg-indigo-500" />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Health pie */}
        <Card>
          <Card.Header>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Backend Health</h3>
          </Card.Header>
          <Card.Body>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={healthPieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={2}
                  dataKey="value"
                >
                  {healthPieData.map((_, idx) => (
                    <Cell key={idx} fill={PIE_COLORS[idx]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </Card.Body>
        </Card>

        {/* Top backends bar chart */}
        <Card className="lg:col-span-2">
          <Card.Header>
            <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Top Backends by Requests</h3>
          </Card.Header>
          <Card.Body>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={topBackendsChart} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" className="stroke-slate-200 dark:stroke-slate-700" />
                <XAxis type="number" tick={{ fontSize: 11 }} className="fill-slate-500" />
                <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 11 }} className="fill-slate-500" />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "var(--color-slate-900, #0f172a)",
                    border: "1px solid var(--color-slate-700, #334155)",
                    borderRadius: "8px",
                    color: "#e2e8f0",
                  }}
                />
                <Bar dataKey="requests" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                <Bar dataKey="errors" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </Card.Body>
        </Card>
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search backends, rules, servers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
          />
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" icon={<RefreshCw className="h-4 w-4" />} onClick={fetchData}>
            Refresh
          </Button>
          <Button
            variant="primary"
            size="sm"
            icon={<Sparkles className="h-4 w-4" />}
            onClick={handleAnalyzeAll}
            className="bg-gradient-to-r from-violet-600 to-purple-600 hover:from-violet-700 hover:to-purple-700"
          >
            AI Diagnose
          </Button>
        </div>
      </div>

      {/* Per-rule tables */}
      {filteredRules.length === 0 ? (
        <Card>
          <Card.Body>
            <p className="py-8 text-center text-slate-500 dark:text-slate-400">
              No backend rules found{searchQuery ? " matching your search" : ""}.
            </p>
          </Card.Body>
        </Card>
      ) : (
        filteredRules.map((rule) => {
          const maxReqs = Math.max(...rule.backends.map((b) => b.requests), 1);
          return (
            <Card key={rule.rule_id} className="overflow-hidden">
              <Card.Header>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">{rule.rule_name}</h3>
                  <Badge variant="info" size="sm">{rule.server_name}</Badge>
                  <Badge variant="default" size="sm">{rule.path}</Badge>
                  <Badge variant="primary" size="sm">{rule.routing_mode}</Badge>
                </div>
              </Card.Header>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 text-left">
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Backend</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Status</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 text-right">Weight</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400">Requests</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 text-right">Errors</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 text-right">Error %</th>
                      <th className="py-2.5 px-3 text-xs font-semibold text-slate-500 dark:text-slate-400 text-right">Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rule.backends.map((b) => (
                      <BackendRow key={b.label} backend={b} maxRequests={maxReqs} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })
      )}
    </div>
  );
};

export default React.memo(BackendMonitor);
