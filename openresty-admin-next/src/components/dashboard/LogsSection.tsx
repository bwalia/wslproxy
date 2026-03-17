"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useDataProvider } from "@/hooks/useResource";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";

// ── Types ────────────────────────────────────────────────────────────────

interface LogsData {
  error_log?: string;
  access_log?: string;
}

// ── Log card ─────────────────────────────────────────────────────────────

interface LogCardProps {
  title: string;
  content: string | undefined;
  loading: boolean;
}

const LogCard = React.memo(function LogCard({
  title,
  content,
  loading,
}: LogCardProps) {
  return (
    <Card>
      <Card.Header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          {title}
        </h2>
      </Card.Header>
      <Card.Body className="p-0">
        {loading ? (
          <div className="p-4">
            <Skeleton variant="rectangular" className="h-40 w-full" />
          </div>
        ) : (
          <pre className="max-h-80 overflow-auto bg-slate-900 p-4 font-mono text-xs leading-relaxed text-slate-300 dark:bg-slate-950">
            {content || "No logs available"}
          </pre>
        )}
      </Card.Body>
    </Card>
  );
});

// ── Main component ───────────────────────────────────────────────────────

export default function LogsSection() {
  const dataProvider = useDataProvider();
  const [logs, setLogs] = useState<LogsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function fetchLogs() {
      setLoading(true);
      try {
        const result = await dataProvider.getLogs();
        if (!cancelled) {
          setLogs((result?.data as LogsData) ?? null);
        }
      } catch {
        // Silently handle — logs unavailable
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    fetchLogs();
    return () => {
      cancelled = true;
    };
  }, [dataProvider]);

  const errorLog = useMemo(() => logs?.error_log, [logs]);
  const accessLog = useMemo(() => logs?.access_log, [logs]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <LogCard title="Error Logs" content={errorLog} loading={loading} />
      <LogCard title="Access Logs" content={accessLog} loading={loading} />
    </div>
  );
}
