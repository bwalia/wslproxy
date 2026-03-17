"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/utils/cn";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Dialog from "@/components/ui/Dialog";
import { useDataProvider } from "@/hooks/useResource";

// ── Types ───────────────────────────────────────────────────────────────

interface ErrorDetailsDialogProps {
  open: boolean;
  onClose: () => void;
  statusCode: number | null;
}

interface ErrorEntry {
  timestamp: string;
  method: string;
  host: string;
  url: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function methodVariant(
  method: string
): "primary" | "success" | "warning" | "danger" | "info" | "default" {
  switch (method.toUpperCase()) {
    case "GET":
      return "primary";
    case "POST":
      return "success";
    case "PUT":
      return "warning";
    case "PATCH":
      return "info";
    case "DELETE":
      return "danger";
    default:
      return "default";
  }
}

// ── Component ───────────────────────────────────────────────────────────

const ErrorDetailsDialog: React.FC<ErrorDetailsDialogProps> = ({
  open,
  onClose,
  statusCode,
}) => {
  const dp = useDataProvider();
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<ErrorEntry[]>([]);

  const fetchDetails = useCallback(async () => {
    if (!statusCode) return;
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await dp.getErrorDetails(String(statusCode))) as any;
      const data = res?.data;
      setEntries(
        Array.isArray(data)
          ? data
          : Array.isArray(data?.entries)
            ? data.entries
            : []
      );
    } catch {
      setEntries([]);
    } finally {
      setLoading(false);
    }
  }, [dp, statusCode]);

  useEffect(() => {
    if (open && statusCode) {
      fetchDetails();
    } else {
      setEntries([]);
    }
  }, [open, statusCode, fetchDetails]);

  const title = useMemo(
    () => (statusCode ? `Error Details - HTTP ${statusCode}` : "Error Details"),
    [statusCode]
  );

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      className="max-w-2xl"
    >
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-8" />
          ))}
        </div>
      ) : entries.length === 0 ? (
        <p className="text-center text-slate-500 dark:text-slate-400 py-6">
          No error details available for HTTP {statusCode}.
        </p>
      ) : (
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                <th className="py-2 px-4 font-medium text-slate-500 dark:text-slate-400">
                  Timestamp
                </th>
                <th className="py-2 px-4 font-medium text-slate-500 dark:text-slate-400">
                  Method
                </th>
                <th className="py-2 px-4 font-medium text-slate-500 dark:text-slate-400">
                  Host
                </th>
                <th className="py-2 px-4 font-medium text-slate-500 dark:text-slate-400">
                  URL
                </th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, idx) => (
                <tr
                  key={idx}
                  className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="py-2 px-4 text-slate-700 dark:text-slate-300 whitespace-nowrap text-xs">
                    {entry.timestamp}
                  </td>
                  <td className="py-2 px-4">
                    <Badge variant={methodVariant(entry.method)} size="sm">
                      {entry.method}
                    </Badge>
                  </td>
                  <td className="py-2 px-4 text-slate-700 dark:text-slate-300">
                    {entry.host}
                  </td>
                  <td className="py-2 px-4 font-mono text-xs text-slate-600 dark:text-slate-400 max-w-[200px] truncate">
                    {entry.url}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Dialog>
  );
};

ErrorDetailsDialog.displayName = "ErrorDetailsDialog";

export default React.memo(ErrorDetailsDialog);
