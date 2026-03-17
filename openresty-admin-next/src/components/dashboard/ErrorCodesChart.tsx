"use client";

import React, { useMemo, useCallback } from "react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";

// ── Types ────────────────────────────────────────────────────────────────

interface ErrorCodeEntry {
  code: number;
  count: number;
}

interface ErrorCodesChartProps {
  errorCodes: ErrorCodeEntry[] | null;
  loading: boolean;
  onCodeClick?: (code: number) => void;
}

// ── Helpers ──────────────────────────────────────────────────────────────

function badgeVariant(code: number): "warning" | "danger" {
  return code >= 500 ? "danger" : "warning";
}

// ── Row component ────────────────────────────────────────────────────────

interface ErrorRowProps {
  entry: ErrorCodeEntry;
  maxCount: number;
  clickable: boolean;
  onClick: (code: number) => void;
}

const ErrorRow = React.memo(function ErrorRow({
  entry,
  maxCount,
  clickable,
  onClick,
}: ErrorRowProps) {
  const pct = maxCount > 0 ? (entry.count / maxCount) * 100 : 0;

  const handleClick = useCallback(() => {
    onClick(entry.code);
  }, [onClick, entry.code]);

  return (
    <button
      type="button"
      disabled={!clickable}
      onClick={handleClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
        clickable
          ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800"
          : "cursor-default",
      )}
    >
      <Badge variant={badgeVariant(entry.code)} size="sm" className="shrink-0">
        {entry.code}
      </Badge>

      <div className="flex flex-1 items-center gap-3">
        <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all",
              entry.code >= 500 ? "bg-red-500" : "bg-amber-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="w-14 shrink-0 text-right text-sm font-medium text-slate-700 dark:text-slate-300">
          {entry.count.toLocaleString()}
        </span>
      </div>
    </button>
  );
});

// ── Main component ───────────────────────────────────────────────────────

const ErrorCodesChart: React.FC<ErrorCodesChartProps> = ({
  errorCodes,
  loading,
  onCodeClick,
}) => {
  const maxCount = useMemo(() => {
    const arr = Array.isArray(errorCodes) ? errorCodes : [];
    if (arr.length === 0) return 0;
    return Math.max(...arr.map((e) => e.count));
  }, [errorCodes]);

  const noop = useCallback(() => {}, []);

  if (loading) {
    return (
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Error Codes
          </h2>
        </Card.Header>
        <Card.Body className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full" />
          ))}
        </Card.Body>
      </Card>
    );
  }

  const codes = Array.isArray(errorCodes) ? errorCodes : [];

  return (
    <Card>
      <Card.Header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Error Codes
        </h2>
      </Card.Header>
      <Card.Body>
        {codes.length === 0 ? (
          <p className="py-4 text-center text-sm text-slate-400 dark:text-slate-500">
            No errors recorded
          </p>
        ) : (
          <div className="space-y-1">
            {codes.map((entry) => (
              <ErrorRow
                key={entry.code}
                entry={entry}
                maxCount={maxCount}
                clickable={!!onCodeClick}
                onClick={onCodeClick ?? noop}
              />
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  );
};

export default React.memo(ErrorCodesChart);
