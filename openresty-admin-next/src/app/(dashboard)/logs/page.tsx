"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ScrollText,
  AlertTriangle,
  Server,
  Sparkles,
  Activity,
  Clock,
  TrendingUp,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import LogViewer from "@/components/logs/LogViewer";
import AIAnalysisPanel from "@/components/logs/AIAnalysisPanel";
import BackendMonitor from "@/components/logs/BackendMonitor";
import RequestInspector from "@/components/logs/RequestInspector";
import { useDataProvider } from "@/hooks/useResource";
import type { AccessLogEntry, ErrorLogEntry, LogFilters } from "@/types";

// ── Tab definition ──────────────────────────────────────────────────────

interface Tab {
  id: string;
  label: string;
  icon: React.ElementType;
  badge?: string | number;
}

// ── Quick stat card ─────────────────────────────────────────────────────

const QuickStat = React.memo(function QuickStat({
  icon: Icon,
  label,
  value,
  color,
  sub,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  color: string;
  sub?: string;
}) {
  return (
    <div className={cn("flex items-center gap-3 rounded-xl border-l-4 bg-white px-4 py-3 dark:bg-slate-800", color)}>
      <Icon className="h-5 w-5 text-slate-400" />
      <div>
        <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{value}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      </div>
    </div>
  );
});

// ── Main page ───────────────────────────────────────────────────────────

export default function LogsPage() {
  const dp = useDataProvider();

  // Tab state
  const [activeTab, setActiveTab] = useState("access");

  // Log data
  const [accessLogs, setAccessLogs] = useState<AccessLogEntry[]>([]);
  const [errorLogs, setErrorLogs] = useState<ErrorLogEntry[]>([]);
  const [accessTotal, setAccessTotal] = useState(0);
  const [errorTotal, setErrorTotal] = useState(0);
  const [accessLoading, setAccessLoading] = useState(true);
  const [errorLoading, setErrorLoading] = useState(true);

  // Filters
  const [accessFilters, setAccessFilters] = useState<LogFilters>({ limit: 200 });
  const [errorFilters, setErrorFilters] = useState<LogFilters>({ limit: 200 });

  // UI state
  const [selectedLogs, setSelectedLogs] = useState<(AccessLogEntry | ErrorLogEntry)[]>([]);
  const [inspectedLog, setInspectedLog] = useState<AccessLogEntry | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  // Quick stats
  const [quickStats, setQuickStats] = useState<{
    totalRequests: number;
    errorCount: number;
    avgLatency: number;
    p95Latency: number;
  } | null>(null);

  // ── Fetch access logs ─────────────────────────────────────────────
  const fetchAccessLogs = useCallback(async () => {
    setAccessLoading(true);
    try {
      const result = await dp.getAccessLogs(accessFilters);
      setAccessLogs(result.data || []);
      setAccessTotal(result.total || 0);
    } catch {
      // Fall back to existing error logs API
      try {
        const result = await dp.getLogs();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (result as any)?.data;
        if (data?.access_log) {
          // Parse raw log text into entries
          const lines = (data.access_log as string).split("\n").filter(Boolean);
          const parsed: AccessLogEntry[] = lines.map((line, i) => {
            // Try JSON parse first
            try {
              const j = JSON.parse(line);
              return { id: `access-${i}`, ...j };
            } catch {
              // Parse common log format
              const match = line.match(
                /^(\S+)\s+-\s+\S+\s+\[([^\]]+)\]\s+"(\S+)\s+(\S+)\s+\S+"\s+(\d+)\s+(\d+)\s+"([^"]*)"\s+"([^"]*)"/
              );
              if (match) {
                return {
                  id: `access-${i}`,
                  timestamp: match[2],
                  remote_addr: match[1],
                  method: match[3],
                  uri: match[4],
                  status: parseInt(match[5]),
                  body_bytes_sent: parseInt(match[6]),
                  http_referer: match[7],
                  http_user_agent: match[8],
                  request_time: 0,
                };
              }
              return {
                id: `access-${i}`,
                timestamp: new Date().toISOString(),
                remote_addr: "",
                method: "GET",
                uri: line.slice(0, 200),
                status: 0,
                body_bytes_sent: 0,
                request_time: 0,
              };
            }
          });
          setAccessLogs(parsed);
          setAccessTotal(parsed.length);
        }
      } catch {
        setAccessLogs([]);
        setAccessTotal(0);
      }
    } finally {
      setAccessLoading(false);
    }
  }, [dp, accessFilters]);

  // ── Fetch error logs ──────────────────────────────────────────────
  const fetchErrorLogs = useCallback(async () => {
    setErrorLoading(true);
    try {
      const result = await dp.getErrorLogs(errorFilters);
      setErrorLogs(result.data || []);
      setErrorTotal(result.total || 0);
    } catch {
      // Fall back to existing logs API
      try {
        const result = await dp.getLogs();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const data = (result as any)?.data;
        if (data?.error_log) {
          const lines = (data.error_log as string).split("\n").filter(Boolean);
          const parsed: ErrorLogEntry[] = lines.map((line, i) => {
            try {
              const j = JSON.parse(line);
              return { id: `error-${i}`, ...j };
            } catch {
              const match = line.match(
                /^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+\d+#\d+:\s*(.*)/
              );
              if (match) {
                return {
                  id: `error-${i}`,
                  timestamp: match[1],
                  level: match[2] as ErrorLogEntry["level"],
                  message: match[3],
                };
              }
              return {
                id: `error-${i}`,
                timestamp: new Date().toISOString(),
                level: "error" as const,
                message: line,
              };
            }
          });
          setErrorLogs(parsed);
          setErrorTotal(parsed.length);
        }
      } catch {
        setErrorLogs([]);
        setErrorTotal(0);
      }
    } finally {
      setErrorLoading(false);
    }
  }, [dp, errorFilters]);

  // ── Fetch quick stats ─────────────────────────────────────────────
  const fetchQuickStats = useCallback(async () => {
    try {
      const result = await dp.getTrafficStats();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const s = (result?.data as any)?.summary;
      if (s) {
        setQuickStats({
          totalRequests: s.total_requests_24h ?? 0,
          errorCount: s.total_errors_24h ?? 0,
          avgLatency: s.avg_latency_ms ?? 0,
          p95Latency: s.p95_latency_ms ?? 0,
        });
      }
    } catch {
      // Stats not critical
    }
  }, [dp]);

  // Initial fetch
  useEffect(() => {
    fetchAccessLogs();
    fetchErrorLogs();
    fetchQuickStats();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refetch on filter change
  useEffect(() => {
    fetchAccessLogs();
  }, [fetchAccessLogs]);

  useEffect(() => {
    fetchErrorLogs();
  }, [fetchErrorLogs]);

  // Error log count for badge
  const errorBadge = useMemo(() => {
    const critCount = errorLogs.filter((l) => ["emerg", "alert", "crit", "error"].includes(l.level)).length;
    return critCount > 0 ? critCount : undefined;
  }, [errorLogs]);

  // Tab definitions
  const tabs = useMemo<Tab[]>(() => [
    { id: "access", label: "Access Logs", icon: ScrollText },
    { id: "errors", label: "Error Logs", icon: AlertTriangle, badge: errorBadge ? String(errorBadge) : undefined },
    { id: "backends", label: "Backend Monitor", icon: Server },
    { id: "ai", label: "AI Troubleshoot", icon: Sparkles },
  ], [errorBadge]);

  // Handlers
  const handleSelectLogs = useCallback((logs: (AccessLogEntry | ErrorLogEntry)[]) => {
    setSelectedLogs(logs);
  }, []);

  const handleAnalyze = useCallback((logs: (AccessLogEntry | ErrorLogEntry)[]) => {
    setSelectedLogs(logs);
    setAiPanelOpen(true);
    setActiveTab("ai");
  }, []);

  const handleBackendAnalyze = useCallback((context: string) => {
    // Create a synthetic error log for AI analysis context
    setSelectedLogs([{
      id: "backend-analysis",
      timestamp: new Date().toISOString(),
      level: "info" as const,
      message: context,
    } as ErrorLogEntry]);
    setAiPanelOpen(true);
    setActiveTab("ai");
  }, []);

  const handleInspect = useCallback((log: AccessLogEntry) => {
    setInspectedLog(log);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        icon={<ScrollText className="h-6 w-6" />}
        title="Logs & Troubleshooting"
        subtitle="Monitor ingress traffic, analyze errors, and troubleshoot issues with AI"
      />

      {/* Quick stats */}
      {quickStats && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <QuickStat icon={Activity} label="Requests (24h)" value={quickStats.totalRequests.toLocaleString()} color="border-l-blue-500" />
          <QuickStat icon={AlertCircle} label="Errors (24h)" value={quickStats.errorCount.toLocaleString()} color="border-l-red-500" />
          <QuickStat icon={Clock} label="Avg Latency" value={quickStats.avgLatency > 0 ? `${quickStats.avgLatency.toFixed(1)}ms` : "—"} color="border-l-amber-500" />
          <QuickStat icon={TrendingUp} label="P95 Latency" value={quickStats.p95Latency > 0 ? `${quickStats.p95Latency.toFixed(1)}ms` : "—"} color="border-l-purple-500" />
        </div>
      )}

      {/* Tab navigation */}
      <div className="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors",
                isActive
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300",
              )}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
              {tab.badge && (
                <span className="ml-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <div>
        {activeTab === "access" && (
          <LogViewer
            logType="access"
            accessLogs={accessLogs}
            errorLogs={[]}
            loading={accessLoading}
            total={accessTotal}
            filters={accessFilters}
            onFiltersChange={setAccessFilters}
            onRefresh={fetchAccessLogs}
            onSelectLogs={handleSelectLogs}
            onAnalyze={handleAnalyze}
            onInspect={handleInspect}
          />
        )}

        {activeTab === "errors" && (
          <LogViewer
            logType="error"
            accessLogs={[]}
            errorLogs={errorLogs}
            loading={errorLoading}
            total={errorTotal}
            filters={errorFilters}
            onFiltersChange={setErrorFilters}
            onRefresh={fetchErrorLogs}
            onSelectLogs={handleSelectLogs}
            onAnalyze={handleAnalyze}
            onInspect={handleInspect}
          />
        )}

        {activeTab === "backends" && (
          <BackendMonitor onAnalyze={handleBackendAnalyze} />
        )}

        {activeTab === "ai" && (
          <AIAnalysisPanel
            selectedLogs={selectedLogs}
            visible={true}
            onClose={() => setActiveTab("access")}
          />
        )}
      </div>

      {/* Request inspector slide-over */}
      {inspectedLog && (
        <>
          <div
            className="fixed inset-0 z-30 bg-black/20 backdrop-blur-sm"
            onClick={() => setInspectedLog(null)}
          />
          <RequestInspector
            log={inspectedLog}
            onClose={() => setInspectedLog(null)}
            onAnalyze={handleAnalyze}
          />
        </>
      )}
    </div>
  );
}
