"use client";

import React, { useMemo, useState } from "react";
import {
  X,
  Clock,
  Globe,
  Server,
  Shield,
  Sparkles,
  Copy,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Check,
  Code,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { AccessLogEntry } from "@/types";

// ── Types ────────────────────────────────────────────────────────────────

interface RequestInspectorProps {
  log: AccessLogEntry | null;
  onClose: () => void;
  onAnalyze: (logs: AccessLogEntry[]) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function statusColor(code: number): string {
  if (code >= 500) return "text-red-600 dark:text-red-400";
  if (code >= 400) return "text-amber-600 dark:text-amber-400";
  if (code >= 300) return "text-blue-600 dark:text-blue-400";
  return "text-green-600 dark:text-green-400";
}

function statusBg(code: number): string {
  if (code >= 500) return "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300";
  if (code >= 400) return "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300";
  if (code >= 300) return "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300";
  return "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300";
}

function formatBytes(bytes: number): string {
  if (bytes >= 1_048_576) return `${(bytes / 1_048_576).toFixed(1)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${bytes} B`;
}

function formatDuration(seconds: number): string {
  if (seconds < 0.001) return `${(seconds * 1_000_000).toFixed(0)}µs`;
  if (seconds < 1) return `${(seconds * 1000).toFixed(1)}ms`;
  return `${seconds.toFixed(3)}s`;
}

// ── Detail row ──────────────────────────────────────────────────────────

function DetailRow({ label, value, mono, className }: {
  label: string;
  value: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("flex items-start py-2 border-b border-slate-100 dark:border-slate-800 last:border-0", className)}>
      <span className="w-40 shrink-0 text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
        {label}
      </span>
      <span className={cn("text-sm text-slate-800 dark:text-slate-200 break-all", mono && "font-mono text-xs")}>
        {value || "—"}
      </span>
    </div>
  );
}

// ── Latency visualization ───────────────────────────────────────────────

function LatencyBar({ label, value, max }: { label: string; value: number; max: number }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  const color = value > 1 ? "bg-red-500" : value > 0.5 ? "bg-amber-500" : value > 0.1 ? "bg-blue-500" : "bg-green-500";

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="w-28 shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</span>
      <div className="flex-1 h-3 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={cn("h-full rounded-full transition-all duration-700", color)}
          style={{ width: `${Math.max(pct, 2)}%` }}
        />
      </div>
      <span className="w-16 text-right text-xs font-mono font-medium text-slate-700 dark:text-slate-300">
        {formatDuration(value)}
      </span>
    </div>
  );
}

// ── Main component ──────────────────────────────────────────────────────

// Fields rendered explicitly elsewhere — excluded from the "Raw" panel
// so the raw block only shows what the regular sections don't cover.
const RENDERED_FIELDS = new Set<string>([
  "id",
  "request_id",
  "status",
  "method",
  "uri",
  "remote_addr",
  "server_name",
  "http_user_agent",
  "http_referer",
  "country_code",
  "body_bytes_sent",
  "upstream_addr",
  "upstream_status",
  "upstream_response_time",
  "rule_id",
  "cache_status",
  "waf_blocked",
  "request_time",
  "time_local",
  "timestamp",
]);

function serializeValue(v: unknown): string {
  if (v === null || v === undefined) return "-";
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

const RequestInspector: React.FC<RequestInspectorProps> = ({
  log,
  onClose,
  onAnalyze,
}) => {
  const [rawOpen, setRawOpen] = useState(false);
  const [justCopied, setJustCopied] = useState<"json" | "curl" | "id" | null>(null);

  const maxTime = useMemo(() => {
    if (!log) return 1;
    return Math.max(log.request_time, log.upstream_response_time || 0, 0.001);
  }, [log]);

  // Fields on this entry that we don't render in named sections.
  // Sorted for stable display.  The log is JSON, so any backend-added
  // field surfaces here without a frontend change.
  const extraFields = useMemo(() => {
    if (!log) return [] as Array<[string, unknown]>;
    return Object.entries(log)
      .filter(([k, v]) => !RENDERED_FIELDS.has(k) && v !== "" && v !== null && v !== undefined)
      .sort(([a], [b]) => a.localeCompare(b));
  }, [log]);

  if (!log) return null;

  const flash = (key: "json" | "curl" | "id") => {
    setJustCopied(key);
    window.setTimeout(() => setJustCopied((c) => (c === key ? null : c)), 1200);
  };

  const copyAsJson = () => {
    navigator.clipboard.writeText(JSON.stringify(log, null, 2)).then(() => flash("json"));
  };

  const copyCurl = () => {
    const curl = `curl -X ${log.method} '${log.uri}' -H 'Host: ${log.server_name || "example.com"}'`;
    navigator.clipboard.writeText(curl).then(() => flash("curl"));
  };

  const copyRequestId = () => {
    const rid = log.request_id || log.id;
    if (!rid) return;
    navigator.clipboard.writeText(String(rid)).then(() => flash("id"));
  };

  return (
    <div className="fixed inset-y-0 right-0 z-40 flex w-full max-w-lg flex-col border-l border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4 dark:border-slate-700">
        <div className="flex items-center gap-3">
          <div className={cn("flex h-10 w-10 items-center justify-center rounded-lg text-lg font-bold", statusBg(log.status))}>
            {log.status}
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-slate-100">Request Inspector</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">{log.request_id || log.id}</p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyRequestId}
            title="Copy request ID"
            disabled={!log.request_id && !log.id}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent dark:hover:bg-slate-800"
          >
            {justCopied === "id" ? (
              <Check className="h-4 w-4 text-emerald-500" aria-label="Copied" />
            ) : (
              <span className="flex h-4 items-center gap-0.5 font-mono text-xs font-bold">
                ID
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={copyAsJson}
            title="Copy as JSON"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            {justCopied === "json" ? (
              <Check className="h-4 w-4 text-emerald-500" aria-label="Copied" />
            ) : (
              <Copy className="h-4 w-4" />
            )}
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
        {/* Overview */}
        <section>
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800">
            <span className="rounded bg-slate-200 px-2 py-0.5 text-xs font-bold text-slate-700 dark:bg-slate-700 dark:text-slate-300">
              {log.method}
            </span>
            <span className="flex-1 truncate text-xs font-mono text-slate-700 dark:text-slate-300" title={log.uri}>
              {log.uri}
            </span>
            <span className={cn("text-sm font-bold", statusColor(log.status))}>
              {log.status}
            </span>
          </div>
        </section>

        {/* Timing waterfall */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5" /> Timing
          </h4>
          <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-700">
            <LatencyBar label="Total" value={log.request_time} max={maxTime} />
            {log.upstream_response_time != null && (
              <LatencyBar label="Upstream" value={log.upstream_response_time} max={maxTime} />
            )}
            {log.upstream_response_time != null && (
              <LatencyBar
                label="Proxy overhead"
                value={Math.max(0, log.request_time - log.upstream_response_time)}
                max={maxTime}
              />
            )}
          </div>
        </section>

        {/* Request details */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Globe className="h-3.5 w-3.5" /> Request
          </h4>
          <div className="rounded-lg border border-slate-200 px-3 dark:border-slate-700">
            <DetailRow label="Client IP" value={log.remote_addr} mono />
            <DetailRow label="Server Name" value={log.server_name} mono />
            <DetailRow label="User Agent" value={log.http_user_agent} />
            <DetailRow label="Referer" value={log.http_referer} mono />
            <DetailRow label="Country" value={log.country_code} />
            <DetailRow label="Response Size" value={formatBytes(log.body_bytes_sent)} />
          </div>
        </section>

        {/* Upstream */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Server className="h-3.5 w-3.5" /> Upstream
          </h4>
          <div className="rounded-lg border border-slate-200 px-3 dark:border-slate-700">
            <DetailRow label="Address" value={log.upstream_addr} mono />
            <DetailRow label="Status" value={
              log.upstream_status ? (
                <span className={statusColor(log.upstream_status)}>{log.upstream_status}</span>
              ) : "—"
            } />
            <DetailRow label="Response Time" value={
              log.upstream_response_time != null ? formatDuration(log.upstream_response_time) : "—"
            } />
            <DetailRow label="Rule" value={log.rule_id} mono />
          </div>
        </section>

        {/* Tags */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Shield className="h-3.5 w-3.5" /> Attributes
          </h4>
          <div className="flex flex-wrap gap-2">
            {log.cache_status && (
              <Badge variant={log.cache_status === "HIT" ? "success" : "default"} size="sm">
                Cache: {log.cache_status}
              </Badge>
            )}
            {log.waf_blocked && <Badge variant="danger" size="sm">WAF Blocked</Badge>}
            {log.status >= 500 && <Badge variant="danger" size="sm">Server Error</Badge>}
            {log.status >= 400 && log.status < 500 && <Badge variant="warning" size="sm">Client Error</Badge>}
            {log.request_time > 1 && <Badge variant="warning" size="sm">Slow Request</Badge>}
          </div>
        </section>

        {/* Extra fields — any JSON keys the backend sends that aren't
            broken out above (e.g. x-request-id, custom http_*, etc.). */}
        {extraFields.length > 0 && (
          <section>
            <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              <Code className="h-3.5 w-3.5" aria-hidden="true" /> Additional fields
            </h4>
            <div className="rounded-lg border border-slate-200 px-3 dark:border-slate-700">
              {extraFields.map(([k, v]) => (
                <DetailRow key={k} label={k} value={serializeValue(v)} mono />
              ))}
            </div>
          </section>
        )}

        {/* Raw JSON — collapsible.  Gives power users access to the full
            log entry including anything not rendered above. */}
        <section>
          <button
            type="button"
            onClick={() => setRawOpen((o) => !o)}
            className="flex w-full items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700"
            aria-expanded={rawOpen}
          >
            <span className="flex items-center gap-1.5">
              <Code className="h-3.5 w-3.5" aria-hidden="true" /> Raw JSON
            </span>
            {rawOpen ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
          {rawOpen && (
            <pre className="mt-2 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 dark:border-slate-700 dark:bg-slate-800/50 dark:text-slate-300">
              {JSON.stringify(log, null, 2)}
            </pre>
          )}
        </section>
      </div>

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-slate-200 px-5 py-3 dark:border-slate-700">
        <Button
          variant="ghost"
          size="sm"
          icon={
            justCopied === "curl" ? (
              <Check className="h-4 w-4 text-emerald-500" />
            ) : (
              <ExternalLink className="h-4 w-4" />
            )
          }
          onClick={copyCurl}
        >
          {justCopied === "curl" ? "Copied!" : "Copy cURL"}
        </Button>
        <Button
          variant="primary"
          size="sm"
          icon={<Sparkles className="h-4 w-4" />}
          onClick={() => onAnalyze([log])}
          className="bg-gradient-to-r from-violet-600 to-purple-600"
        >
          AI Analyze
        </Button>
      </div>
    </div>
  );
};

export default React.memo(RequestInspector);
