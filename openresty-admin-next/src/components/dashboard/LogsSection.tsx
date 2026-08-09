"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import Link from "next/link";
import type { Route } from "next";
import {
  AlertOctagon,
  FileText,
  Maximize2,
  RefreshCw,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";

/* ──────────────────────────────────────────────────────────────────────────
   Recent log tails rendered side-by-side on the dashboard.

   The Lua backend exposes two raw-text endpoints
   (`/openresty/error_logs` + `/openresty/access_logs`) that return the
   last ~10 KB of the corresponding log file.  The legacy dashboard
   polled both independently; we fetch them in parallel on mount and
   expose a refresh action that re-runs the parallel pull.

   A small registry of the raw text strings is exported via the
   `LogsContext` so the AI Insights widget can analyse whichever log
   is currently shown without duplicating the fetch.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * The Lua backend endpoints (`/openresty/error_logs` +
 * `/openresty/access_logs`) both return the same shape — the log
 * text lives under `data.logs` regardless of which file was read.
 * The caller distinguishes the kind of log via the URL it hit, not
 * via a key in the response.  Older API versions returned the raw
 * text at `data.error_log` / `data.access_log`; we still accept
 * those for backwards compat.
 */
interface LogsResponseShape {
  logs?: string;
  error_log?: string;
  access_log?: string;
  [key: string]: unknown;
}

interface FetchedLogs {
  error: string;
  access: string;
}

const EMPTY_LOGS: FetchedLogs = { error: "", access: "" };

// ── Log card ─────────────────────────────────────────────────────────────

interface LogCardProps {
  title: string;
  icon: LucideIcon;
  iconTone: string;
  content: string;
  loading: boolean;
  emptyLabel: string;
  /**
   * Link target for the expand button.  Points at the full-screen
   * `/logs/tail?kind=...` viewer so the operator can search + filter
   * server-side.
   */
  expandHref: Route;
}

const LogCard = React.memo(function LogCard({
  title,
  icon: Icon,
  iconTone,
  content,
  loading,
  emptyLabel,
  expandHref,
}: LogCardProps) {
  const hasContent = content.trim().length > 0;
  return (
    <Card className="flex flex-col overflow-hidden">
      <Card.Header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <div
            className={cn(
              "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
              iconTone,
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
          </div>
          <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h3>
        </div>
        <Link
          href={expandHref}
          className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:text-slate-100"
          aria-label={`Expand ${title} in full-screen viewer`}
          title="Expand + search (server-side grep)"
        >
          <Maximize2 className="h-3 w-3" aria-hidden="true" />
          Expand
        </Link>
      </Card.Header>
      <Card.Body className="p-0">
        {loading ? (
          <div className="p-4">
            <Skeleton variant="rectangular" className="h-48 w-full" />
          </div>
        ) : hasContent ? (
          <pre className="max-h-96 overflow-auto bg-slate-950 p-4 font-mono text-xs leading-relaxed text-slate-200">
            {content}
          </pre>
        ) : (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-400 dark:text-slate-500">
            <FileText className="h-4 w-4" aria-hidden="true" />
            {emptyLabel}
          </div>
        )}
      </Card.Body>
    </Card>
  );
});

// ── Main component ───────────────────────────────────────────────────────

export interface LogsSectionHandle {
  logs: FetchedLogs;
  refresh: () => Promise<void>;
  loading: boolean;
}

/**
 * Extracts raw log text from the `SingleResult` envelope.  The
 * backend currently parks it at `data.logs`; older deployments used
 * `data.error_log` / `data.access_log` or returned a bare string.
 * Accept all three shapes so the dashboard survives drift.
 */
function extractLogText(
  resp: { data?: LogsResponseShape | string } | null | undefined,
  kind: "error" | "access",
): string {
  if (!resp) return "";
  const payload = resp.data;
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    // Current shape — both endpoints use `logs`.
    if (typeof payload.logs === "string") return payload.logs;
    // Legacy shape — distinct per-kind field.
    const legacyField = kind === "error" ? "error_log" : "access_log";
    const legacyValue = payload[legacyField];
    if (typeof legacyValue === "string") return legacyValue;
  }
  return "";
}

export default function LogsSection() {
  const dp = useDataProvider();
  const [logs, setLogs] = useState<FetchedLogs>(EMPTY_LOGS);
  const [loading, setLoading] = useState(true);
  const [refreshing, startRefresh] = useTransition();

  const fetchBoth = useCallback(async () => {
    setLoading(true);
    try {
      // Legacy dashboard hit these two resources separately — the
      // backend keeps them as distinct files so there's no single
      // endpoint that returns both.
      const [errRes, accRes] = await Promise.all([
        dp.getLogs("openresty/error_logs"),
        dp.getLogs("openresty/access_logs"),
      ]);
      setLogs({
        error: extractLogText(errRes as { data?: LogsResponseShape | string }, "error"),
        access: extractLogText(accRes as { data?: LogsResponseShape | string }, "access"),
      });
    } catch {
      setLogs(EMPTY_LOGS);
    } finally {
      setLoading(false);
    }
  }, [dp]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await fetchBoth();
    })();
    return () => {
      cancelled = true;
    };
  }, [fetchBoth]);

  const handleRefresh = useCallback(() => {
    startRefresh(async () => {
      await fetchBoth();
    });
  }, [fetchBoth]);

  // Make the fetched text addressable for the AI widget via a global
  // window reference — avoids prop drilling through the parent RSC
  // boundary that can't pass functions to client children.
  useEffect(() => {
    const globalRef = window as unknown as { __wslproxyLogs?: FetchedLogs };
    globalRef.__wslproxyLogs = logs;
    return () => {
      if (globalRef.__wslproxyLogs === logs) {
        globalRef.__wslproxyLogs = EMPTY_LOGS;
      }
    };
  }, [logs]);

  const hasAnyContent = useMemo(
    () => logs.error.trim().length > 0 || logs.access.trim().length > 0,
    [logs],
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Recent Logs
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Last ~10 KB of the error and access log files.{" "}
            {hasAnyContent && (
              <span className="inline-flex items-center gap-1 text-primary-600 dark:text-primary-400">
                <Sparkles className="h-3 w-3" aria-hidden="true" />
                Feed these into the AI Insights widget above to summarize
                issues.
              </span>
            )}
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing || loading}
          aria-label="Refresh log tails"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
        >
          <RefreshCw
            className={cn(
              "h-3.5 w-3.5",
              (refreshing || loading) && "animate-spin",
            )}
            aria-hidden="true"
          />
          {refreshing || loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <LogCard
          title="Error Logs"
          icon={AlertOctagon}
          iconTone="bg-red-50 text-red-600 dark:bg-red-900/30 dark:text-red-400"
          content={logs.error}
          loading={loading}
          emptyLabel="No recent errors logged"
          // Cast: typedRoutes union is generated at build — this path
          // is new in the current diff.
          expandHref={"/logs/tail?kind=error" as Route}
        />
        <LogCard
          title="Access Logs"
          icon={FileText}
          iconTone="bg-blue-50 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
          content={logs.access}
          loading={loading}
          emptyLabel="No recent access entries"
          expandHref={"/logs/tail?kind=access" as Route}
        />
      </div>
    </div>
  );
}
