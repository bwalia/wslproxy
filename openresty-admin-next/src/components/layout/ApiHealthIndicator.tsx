"use client";

import React from "react";
import { useApiHealth, type ApiHealthStatus } from "@/hooks/useApiHealth";

/* ──────────────────────────────────────────────────────────────────────────
   Compact API health pill rendered in the AppBar.

   At a glance an operator sees:
     - colored dot  (green/amber/red/cyan)
     - label        ("API Online (200)", "API Slow", "API Unreachable")
     - latency      ("123ms")

   Hovering the pill reveals a tooltip with the full HTTP status code so
   on-call can copy/paste it into the channel when troubleshooting.
   ────────────────────────────────────────────────────────────────────────── */

interface PresentationConfig {
  /** Tailwind text + dot color */
  fg: string;
  /** Tailwind background + border color */
  bg: string;
  label: string;
}

const STATUS: Record<ApiHealthStatus, PresentationConfig> = {
  checking: {
    fg: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    label: "Checking API…",
  },
  healthy: {
    fg: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    label: "API Online",
  },
  degraded: {
    fg: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    label: "API Slow",
  },
  down: {
    fg: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    label: "API Unreachable",
  },
  error: {
    fg: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    label: "API Error",
  },
  // The "anonymous" statuses below shouldn't occur here (this pill is
  // only mounted inside the authenticated dashboard layout), but we
  // still spell them out so the type stays exhaustive and a future
  // mis-wiring is visible instead of crashing.
  reachable: {
    fg: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    label: "API Reachable",
  },
  auth_required: {
    fg: "text-cyan-600 dark:text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/30",
    label: "API Reachable",
  },
};

export default function ApiHealthIndicator() {
  const { status, latencyMs, httpStatus, refresh } = useApiHealth("authenticated");
  const config = STATUS[status];

  const tooltip =
    latencyMs !== null && httpStatus !== null
      ? `HTTP ${httpStatus} · ${latencyMs}ms (click to re-check)`
      : `${config.label} (click to re-check)`;

  return (
    <button
      type="button"
      onClick={refresh}
      title={tooltip}
      aria-label={tooltip}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors hover:brightness-105 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 ${config.bg} ${config.fg}`}
    >
      <span
        className={`inline-block h-2 w-2 rounded-full ${
          status === "checking" ? "animate-pulse" : ""
        }`}
        style={{ backgroundColor: "currentColor" }}
        aria-hidden="true"
      />
      <span className="whitespace-nowrap">
        {config.label}
        {httpStatus !== null && status !== "checking" ? ` (${httpStatus})` : ""}
      </span>
      {latencyMs !== null && status !== "checking" && (
        <span className="opacity-70">{latencyMs}ms</span>
      )}
    </button>
  );
}
