"use client";

import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Reusable component-level error boundary.
 *
 * Use-case: wrap any subtree that has its own data source or heavy
 * rendering (charts, tables, topology canvas) so a single broken child
 * doesn't blow up the whole page.
 *
 * Two supported fallback modes:
 *
 *   1. Static node:
 *        <ErrorBoundary fallback={<p>Chart unavailable</p>}>...</ErrorBoundary>
 *
 *   2. Render-prop for retry-capable UIs:
 *        <ErrorBoundary fallback={({ error, reset }) => (
 *          <MyError message={error.message} onRetry={reset} />
 *        )}>...</ErrorBoundary>
 *
 * Error boundaries MUST be class components — there is no hook
 * equivalent as of React 19.  This is the only place in the app
 * that uses a class component, and that's fine.
 */

export interface ErrorBoundaryRenderProps {
  error: Error;
  reset: () => void;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Static fallback node or function receiving `{ error, reset }`. */
  fallback?: ReactNode | ((props: ErrorBoundaryRenderProps) => ReactNode);
  /** Optional label shown in the default fallback and dev logs. */
  label?: string;
  /** Called once when an error is caught — wire logging / telemetry here. */
  onError?: (error: Error, info: ErrorInfo) => void;
  /** Class name for the default fallback container. */
  className?: string;
  /** Pixel-style height for the default fallback (Tailwind class, e.g. "h-64"). */
  minHeightClass?: string;
}

interface ErrorBoundaryState {
  error: Error | null;
}

export default class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.error(
        `[ErrorBoundary${this.props.label ? ` ${this.props.label}` : ""}]`,
        error,
        info,
      );
    }
    this.props.onError?.(error, info);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const { fallback, label, className, minHeightClass } = this.props;

    if (typeof fallback === "function") {
      return fallback({ error, reset: this.reset });
    }
    if (fallback !== undefined) {
      return <>{fallback}</>;
    }

    // Default fallback — a card-style message with a retry button.
    return (
      <div
        role="alert"
        aria-live="polite"
        className={cn(
          "flex flex-col items-center justify-center gap-3 rounded-lg border border-red-200 bg-red-50 p-6 text-center dark:border-red-900/50 dark:bg-red-950/30",
          minHeightClass ?? "min-h-[12rem]",
          className,
        )}
      >
        <div
          className="flex h-10 w-10 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/50"
          aria-hidden="true"
        >
          <AlertTriangle className="h-5 w-5 text-red-600 dark:text-red-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-red-700 dark:text-red-300">
            {label ? `${label} failed to load` : "Something went wrong here"}
          </p>
          <p className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">
            {error.message || "An unexpected error occurred."}
          </p>
        </div>
        <button
          type="button"
          onClick={this.reset}
          className="inline-flex items-center gap-1.5 rounded-md bg-red-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-red-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-slate-900"
        >
          <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
          Try again
        </button>
      </div>
    );
  }
}
