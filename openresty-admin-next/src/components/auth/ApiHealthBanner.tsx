"use client";

import React from "react";
import { useApiHealth, type ApiHealthStatus } from "@/hooks/useApiHealth";

/* ──────────────────────────────────────────────────────────────────────────
   Full-width health strip shown above the login card.

   Anonymous mode — distinguishes:
     - "API Reachable"                   any 2xx
     - "API Reachable (auth required)"   401/403  ← normal pre-login state
     - "API Unreachable"                 network failure / timeout

   The visual is louder than the AppBar pill (full-width, larger dot)
   because on the login page this is often the only signal a user has
   that the backend exists at all.
   ────────────────────────────────────────────────────────────────────────── */

interface PresentationConfig {
  /** Text + dot color */
  fg: string;
  /** Soft background tint + bottom border accent */
  surface: string;
  label: string;
}

const STATUS: Record<ApiHealthStatus, PresentationConfig> = {
  checking: {
    fg: "text-amber-700 dark:text-amber-300",
    surface: "bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-900",
    label: "Checking API…",
  },
  reachable: {
    fg: "text-emerald-700 dark:text-emerald-300",
    surface: "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900",
    label: "API Reachable",
  },
  auth_required: {
    fg: "text-cyan-700 dark:text-cyan-300",
    surface: "bg-cyan-50 border-cyan-300 dark:bg-cyan-950/40 dark:border-cyan-900",
    label: "API Reachable · sign-in required",
  },
  down: {
    fg: "text-red-700 dark:text-red-300",
    surface: "bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-900",
    label: "API Unreachable",
  },
  // The "authenticated" statuses below aren't expected on the login
  // page — keeping them in the map for type exhaustiveness so a future
  // wiring mistake produces a labelled fallback instead of a crash.
  healthy: {
    fg: "text-emerald-700 dark:text-emerald-300",
    surface: "bg-emerald-50 border-emerald-300 dark:bg-emerald-950/40 dark:border-emerald-900",
    label: "API Online",
  },
  degraded: {
    fg: "text-amber-700 dark:text-amber-300",
    surface: "bg-amber-50 border-amber-300 dark:bg-amber-950/40 dark:border-amber-900",
    label: "API Slow",
  },
  error: {
    fg: "text-red-700 dark:text-red-300",
    surface: "bg-red-50 border-red-300 dark:bg-red-950/40 dark:border-red-900",
    label: "API Error",
  },
};

export default function ApiHealthBanner() {
  const { status, latencyMs } = useApiHealth("anonymous");
  const config = STATUS[status];

  return (
    <div
      role="status"
      aria-live="polite"
      className={`flex w-full items-center justify-center gap-2 border-b px-4 py-1.5 text-xs font-medium ${config.surface} ${config.fg}`}
    >
      <span
        className={`inline-block h-2.5 w-2.5 rounded-full ${
          status === "checking" ? "animate-pulse" : ""
        }`}
        style={{ backgroundColor: "currentColor" }}
        aria-hidden="true"
      />
      <span>{config.label}</span>
      {latencyMs !== null && status !== "checking" && (
        <span className="opacity-70">({latencyMs}ms)</span>
      )}
    </div>
  );
}
