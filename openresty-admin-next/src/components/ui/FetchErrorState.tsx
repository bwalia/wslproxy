"use client";

import React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import Button from "./Button";
import { cn } from "@/lib/utils/cn";

/**
 * Surfaces an SWR fetch failure inside a page that is otherwise gated
 * on `isLoading`.  Without it, a failed `useOne`/`useList` shows an
 * empty form and the user wastes time wondering why nothing's there.
 *
 * Standard usage on detail pages:
 *
 *   const { data, isLoading, error, mutate } = useOne<X>("x", id);
 *   if (fetchKey && isLoading) return <Skeleton ... />;
 *   if (fetchKey && error) return <FetchErrorState onRetry={mutate} error={error} />;
 *
 * Renders inline at the page-content level — the layout chrome
 * (AppBar / Sidebar) is unaffected so the user can still navigate
 * away.  For deeper-nested error boundaries, use
 * `src/components/ui/ErrorBoundary.tsx` instead.
 */
export interface FetchErrorStateProps {
  /** The error from SWR / fetch. Either an Error or an arbitrary value. */
  error?: unknown;
  /** Headline shown in the banner. */
  title?: string;
  /** Optional secondary line shown under the title. */
  description?: string;
  /** Called when the user clicks Retry — usually `mutate` from SWR. */
  onRetry?: () => void;
  className?: string;
}

function formatError(error: unknown): string {
  if (!error) return "Unknown error";
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

const FetchErrorState: React.FC<FetchErrorStateProps> = ({
  error,
  title = "Couldn’t load this record",
  description,
  onRetry,
  className,
}) => (
  <div
    role="alert"
    aria-live="polite"
    className={cn(
      "rounded-lg border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-900/20",
      className,
    )}
  >
    <div className="flex items-start gap-3">
      <div
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/40"
        aria-hidden="true"
      >
        <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
      </div>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-red-900 dark:text-red-200">
          {title}
        </h3>
        <p className="mt-1 text-sm text-red-700 dark:text-red-300">
          {description ?? "The request to the admin API failed. The record may have been deleted, or the backend may be unreachable."}
        </p>
        <p className="mt-2 font-mono text-xs text-red-700/80 break-all dark:text-red-300/80">
          {formatError(error)}
        </p>
        {onRetry && (
          <div className="mt-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={onRetry}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Retry
            </Button>
          </div>
        )}
      </div>
    </div>
  </div>
);

FetchErrorState.displayName = "FetchErrorState";

export default FetchErrorState;
