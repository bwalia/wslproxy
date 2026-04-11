"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Search,
  Filter,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  CheckSquare,
  Square,
  AlertCircle,
  Clock,
  ArrowUpDown,
  Download,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import type { AccessLogEntry, ErrorLogEntry, LogFilters as LogFiltersType } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────

type LogType = "access" | "error";

interface LogViewerProps {
  logType: LogType;
  accessLogs: AccessLogEntry[];
  errorLogs: ErrorLogEntry[];
  loading: boolean;
  total: number;
  filters: LogFiltersType;
  onFiltersChange: (filters: LogFiltersType) => void;
  onRefresh: () => void;
  onSelectLogs: (logs: (AccessLogEntry | ErrorLogEntry)[]) => void;
  onAnalyze: (logs: (AccessLogEntry | ErrorLogEntry)[]) => void;
  onInspect: (log: AccessLogEntry) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

const STATUS_CLASSES: Record<string, string> = {
  "2xx": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300",
  "3xx": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  "4xx": "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  "5xx": "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300",
};

const LEVEL_CLASSES: Record<string, string> = {
  emerg: "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-200",
  alert: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  crit: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300",
  error: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  warn: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  notice: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
  info: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  debug: "bg-slate-50 text-slate-500 dark:bg-slate-800/50 dark:text-slate-400",
};

function statusCategory(code: number): string {
  if (code >= 500) return "5xx";
  if (code >= 400) return "4xx";
  if (code >= 300) return "3xx";
  return "2xx";
}

function formatTimestamp(ts: string): string {
  try {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return ts;
  }
}

function formatLatency(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}us`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

const METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
const STATUS_CODES = ["2xx", "3xx", "4xx", "5xx", "200", "301", "302", "400", "401", "403", "404", "500", "502", "503"];
const TIME_RANGES = [
  { label: "Last 15m", value: "15m" },
  { label: "Last 1h", value: "1h" },
  { label: "Last 6h", value: "6h" },
  { label: "Last 24h", value: "24h" },
  { label: "Last 7d", value: "7d" },
];
const ERROR_LEVELS = ["emerg", "alert", "crit", "error", "warn", "notice", "info", "debug"];

// ── Filter bar ──────────────────────────────────────────────────────────

const FilterBar = React.memo(function FilterBar({
  logType,
  filters,
  onChange,
  onRefresh,
  loading,
}: {
  logType: LogType;
  filters: LogFiltersType;
  onChange: (f: LogFiltersType) => void;
  onRefresh: () => void;
  loading: boolean;
}) {
  const [showFilters, setShowFilters] = useState(true);

  return (
    <div className="space-y-3">
      {/* Search + toggle */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={logType === "access" ? "Search URI, IP, user agent..." : "Search error messages..."}
            value={filters.search || ""}
            onChange={(e) => onChange({ ...filters, search: e.target.value })}
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          icon={<Filter className="h-4 w-4" />}
          onClick={() => setShowFilters(!showFilters)}
        >
          Filters
          {showFilters ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />}
          onClick={onRefresh}
          loading={loading}
        >
          Refresh
        </Button>
      </div>

      {/* Filter pills */}
      {showFilters && (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50">
          {/* Time range */}
          <div className="flex items-center gap-1">
            <Clock className="h-3.5 w-3.5 text-slate-400" />
            {TIME_RANGES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => onChange({ ...filters, time_range: filters.time_range === t.value ? undefined : t.value })}
                className={cn(
                  "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                  filters.time_range === t.value
                    ? "bg-primary-100 text-primary-700 dark:bg-primary-900/40 dark:text-primary-300"
                    : "text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

          {logType === "access" ? (
            <>
              {/* Method */}
              <div className="flex items-center gap-1">
                {METHODS.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange({ ...filters, method: filters.method === m ? undefined : m })}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      filters.method === m
                        ? "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300"
                        : "text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700",
                    )}
                  >
                    {m}
                  </button>
                ))}
              </div>

              <div className="h-5 w-px bg-slate-200 dark:bg-slate-700" />

              {/* Status */}
              <div className="flex items-center gap-1">
                {STATUS_CODES.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => onChange({ ...filters, status_code: filters.status_code === s ? undefined : s })}
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-medium transition-colors",
                      filters.status_code === s
                        ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
                        : "text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700",
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </>
          ) : (
            /* Error level */
            <div className="flex items-center gap-1">
              {ERROR_LEVELS.map((l) => (
                <button
                  key={l}
                  type="button"
                  onClick={() => onChange({ ...filters, level: filters.level === l ? undefined : l })}
                  className={cn(
                    "rounded-md px-2 py-1 text-xs font-medium capitalize transition-colors",
                    filters.level === l
                      ? "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300"
                      : "text-slate-500 hover:bg-slate-200 dark:text-slate-400 dark:hover:bg-slate-700",
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
});

// ── Access log row ──────────────────────────────────────────────────────

const AccessLogRow = React.memo(function AccessLogRow({
  log,
  selected,
  onToggle,
  onInspect,
}: {
  log: AccessLogEntry;
  selected: boolean;
  onToggle: () => void;
  onInspect: () => void;
}) {
  const cat = statusCategory(log.status);

  return (
    <tr
      className={cn(
        "border-b border-slate-100 transition-colors dark:border-slate-800",
        selected
          ? "bg-primary-50/50 dark:bg-primary-900/10"
          : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
      )}
    >
      <td className="py-2 px-2">
        <button type="button" onClick={onToggle} className="p-0.5">
          {selected ? (
            <CheckSquare className="h-4 w-4 text-primary-500" />
          ) : (
            <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
          )}
        </button>
      </td>
      <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {formatTimestamp(log.timestamp)}
      </td>
      <td className="py-2 px-2">
        <span className={cn("inline-block rounded px-1.5 py-0.5 text-xs font-bold", STATUS_CLASSES[cat])}>
          {log.status}
        </span>
      </td>
      <td className="py-2 px-2">
        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs font-mono font-medium text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {log.method}
        </span>
      </td>
      <td className="py-2 px-2 max-w-[300px]">
        <button
          type="button"
          onClick={onInspect}
          className="truncate text-left text-xs font-mono text-slate-800 hover:text-primary-600 dark:text-slate-200 dark:hover:text-primary-400"
          title={log.uri}
        >
          {log.uri}
        </button>
      </td>
      <td className="py-2 px-2 text-xs font-mono text-slate-500 dark:text-slate-400">
        {log.remote_addr}
      </td>
      <td className={cn(
        "py-2 px-2 text-xs font-medium text-right whitespace-nowrap",
        log.request_time > 1 ? "text-red-600 dark:text-red-400" :
        log.request_time > 0.5 ? "text-amber-600 dark:text-amber-400" :
        "text-green-600 dark:text-green-400"
      )}>
        {formatLatency(log.request_time * 1000)}
      </td>
      <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
        {log.upstream_addr || "—"}
      </td>
      <td className="py-2 px-2">
        <div className="flex items-center gap-1">
          {log.cache_status && (
            <Badge size="sm" variant={log.cache_status === "HIT" ? "success" : "default"}>
              {log.cache_status}
            </Badge>
          )}
          {log.waf_blocked && (
            <Badge size="sm" variant="danger">WAF</Badge>
          )}
          {log.country_code && (
            <span className="text-xs text-slate-400">{log.country_code}</span>
          )}
        </div>
      </td>
    </tr>
  );
});

// ── Error log row ───────────────────────────────────────────────────────

const ErrorLogRow = React.memo(function ErrorLogRow({
  log,
  selected,
  onToggle,
}: {
  log: ErrorLogEntry;
  selected: boolean;
  onToggle: () => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <>
      <tr
        className={cn(
          "border-b border-slate-100 transition-colors dark:border-slate-800 cursor-pointer",
          selected
            ? "bg-primary-50/50 dark:bg-primary-900/10"
            : "hover:bg-slate-50 dark:hover:bg-slate-800/50",
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <td className="py-2 px-2">
          <button type="button" onClick={(e) => { e.stopPropagation(); onToggle(); }} className="p-0.5">
            {selected ? (
              <CheckSquare className="h-4 w-4 text-primary-500" />
            ) : (
              <Square className="h-4 w-4 text-slate-300 dark:text-slate-600" />
            )}
          </button>
        </td>
        <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {formatTimestamp(log.timestamp)}
        </td>
        <td className="py-2 px-2">
          <span className={cn("inline-block rounded px-1.5 py-0.5 text-xs font-bold uppercase", LEVEL_CLASSES[log.level] || LEVEL_CLASSES.info)}>
            {log.level}
          </span>
        </td>
        <td className="py-2 px-3 max-w-[600px]" colSpan={2}>
          <p className="truncate text-xs text-slate-800 dark:text-slate-200 font-mono">
            {log.message}
          </p>
        </td>
        <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {log.client || "—"}
        </td>
        <td className="py-2 px-2 text-xs text-slate-500 dark:text-slate-400 whitespace-nowrap">
          {log.server || "—"}
        </td>
        <td className="py-2 px-2">
          {expanded ? <ChevronUp className="h-3 w-3 text-slate-400" /> : <ChevronDown className="h-3 w-3 text-slate-400" />}
        </td>
      </tr>
      {expanded && (
        <tr className="bg-slate-50 dark:bg-slate-800/30">
          <td colSpan={8} className="px-4 py-3">
            <pre className="whitespace-pre-wrap text-xs font-mono text-slate-700 dark:text-slate-300 leading-relaxed">
              {log.message}
              {log.request && `\nRequest: ${log.request}`}
              {log.upstream && `\nUpstream: ${log.upstream}`}
              {log.host && `\nHost: ${log.host}`}
            </pre>
          </td>
        </tr>
      )}
    </>
  );
});

// ── Main component ──────────────────────────────────────────────────────

const LogViewer: React.FC<LogViewerProps> = ({
  logType,
  accessLogs,
  errorLogs,
  loading,
  total,
  filters,
  onFiltersChange,
  onRefresh,
  onSelectLogs,
  onAnalyze,
  onInspect,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [sortField, setSortField] = useState<string>("timestamp");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  // Reset selection when logs change
  useEffect(() => {
    setSelectedIds(new Set());
  }, [accessLogs, errorLogs]);

  const toggleSelect = useCallback((id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleAll = useCallback(() => {
    const logs = logType === "access" ? accessLogs : errorLogs;
    if (selectedIds.size === logs.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(logs.map((l) => l.id)));
    }
  }, [logType, accessLogs, errorLogs, selectedIds.size]);

  const selectedLogs = useMemo(() => {
    const logs = logType === "access" ? accessLogs : errorLogs;
    return logs.filter((l) => selectedIds.has(l.id));
  }, [logType, accessLogs, errorLogs, selectedIds]);

  // Propagate selection
  useEffect(() => {
    onSelectLogs(selectedLogs);
  }, [selectedLogs, onSelectLogs]);

  const handleSort = useCallback((field: string) => {
    setSortDir((prev) => (sortField === field ? (prev === "asc" ? "desc" : "asc") : "desc"));
    setSortField(field);
  }, [sortField]);

  const handleExport = useCallback(() => {
    const logs = logType === "access" ? accessLogs : errorLogs;
    const data = selectedIds.size > 0 ? logs.filter((l) => selectedIds.has(l.id)) : logs;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${logType}-logs-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [logType, accessLogs, errorLogs, selectedIds]);

  const logCount = logType === "access" ? accessLogs.length : errorLogs.length;

  return (
    <div className="space-y-4">
      <FilterBar
        logType={logType}
        filters={filters}
        onChange={onFiltersChange}
        onRefresh={onRefresh}
        loading={loading}
      />

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
          <span>{total.toLocaleString()} total entries</span>
          <span>&middot;</span>
          <span>{logCount} loaded</span>
          {selectedIds.size > 0 && (
            <>
              <span>&middot;</span>
              <span className="text-primary-600 dark:text-primary-400 font-medium">
                {selectedIds.size} selected
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              variant="primary"
              size="sm"
              icon={<Sparkles className="h-4 w-4" />}
              onClick={() => onAnalyze(selectedLogs)}
            >
              AI Analyze ({selectedIds.size})
            </Button>
          )}
          <Button variant="ghost" size="sm" icon={<Download className="h-4 w-4" />} onClick={handleExport}>
            Export
          </Button>
        </div>
      </div>

      {/* Log table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 text-left">
                <th className="py-2.5 px-2 w-8">
                  <button type="button" onClick={toggleAll} className="p-0.5">
                    {selectedIds.size > 0 && selectedIds.size === logCount ? (
                      <CheckSquare className="h-4 w-4 text-primary-500" />
                    ) : (
                      <Square className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                </th>
                {logType === "access" ? (
                  <>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none" onClick={() => handleSort("timestamp")}>
                      <span className="inline-flex items-center gap-1">Time <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none" onClick={() => handleSort("status")}>
                      <span className="inline-flex items-center gap-1">Status <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Method</th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">URI</th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Client IP</th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 text-right cursor-pointer select-none" onClick={() => handleSort("request_time")}>
                      <span className="inline-flex items-center gap-1">Latency <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Upstream</th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Tags</th>
                  </>
                ) : (
                  <>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400 cursor-pointer select-none" onClick={() => handleSort("timestamp")}>
                      <span className="inline-flex items-center gap-1">Time <ArrowUpDown className="h-3 w-3" /></span>
                    </th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Level</th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400" colSpan={2}>Message</th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Client</th>
                    <th className="py-2.5 px-2 text-xs font-semibold text-slate-500 dark:text-slate-400">Server</th>
                    <th className="py-2.5 px-2 w-8" />
                  </>
                )}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 10 }).map((_, i) => (
                  <tr key={i} className="border-b border-slate-100 dark:border-slate-800">
                    <td colSpan={logType === "access" ? 9 : 8} className="py-2.5 px-3">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  </tr>
                ))
              ) : logType === "access" ? (
                accessLogs.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="py-12 text-center">
                      <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">No access logs found matching filters</p>
                    </td>
                  </tr>
                ) : (
                  accessLogs.map((log) => (
                    <AccessLogRow
                      key={log.id}
                      log={log}
                      selected={selectedIds.has(log.id)}
                      onToggle={() => toggleSelect(log.id)}
                      onInspect={() => onInspect(log)}
                    />
                  ))
                )
              ) : (
                errorLogs.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-12 text-center">
                      <AlertCircle className="mx-auto mb-2 h-8 w-8 text-slate-300 dark:text-slate-600" />
                      <p className="text-sm text-slate-500 dark:text-slate-400">No error logs found matching filters</p>
                    </td>
                  </tr>
                ) : (
                  errorLogs.map((log) => (
                    <ErrorLogRow
                      key={log.id}
                      log={log}
                      selected={selectedIds.has(log.id)}
                      onToggle={() => toggleSelect(log.id)}
                    />
                  ))
                )
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default React.memo(LogViewer);
