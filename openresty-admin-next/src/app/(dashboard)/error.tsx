"use client";

import { useCallback, useEffect } from "react";
import { AlertTriangle } from "lucide-react";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("Dashboard error:", error);
    }
  }, [error]);

  const handleRetry = useCallback(() => {
    reset();
  }, [reset]);

  return (
    <div className="flex min-h-[50vh] items-center justify-center px-4">
      <div className="max-w-md text-center">
        <div
          className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30"
          aria-hidden="true"
        >
          <AlertTriangle className="h-7 w-7 text-red-600 dark:text-red-400" />
        </div>
        <h2 className="mb-2 text-lg font-semibold text-slate-900 dark:text-white">
          Something went wrong
        </h2>
        <p className="mb-1 text-sm text-slate-500 dark:text-slate-400">
          {error.message || "An unexpected error occurred. Please try again."}
        </p>
        {error.digest ? (
          <p className="mb-6 font-mono text-xs text-slate-400 dark:text-slate-500">
            ref: {error.digest}
          </p>
        ) : (
          <div className="mb-6" />
        )}
        <button
          type="button"
          onClick={handleRetry}
          className="rounded-lg bg-primary-600 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-primary-700 focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-2 focus:outline-none dark:focus:ring-offset-slate-900"
        >
          Try again
        </button>
      </div>
    </div>
  );
}
