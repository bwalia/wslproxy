"use client";

import React from "react";
import {
  useOllamaHealth,
  type OllamaHealthStatus,
} from "@/hooks/useOllamaHealth";

/* ──────────────────────────────────────────────────────────────────────────
   Compact Ollama health pill rendered next to the API health pill in the
   AppBar.  Operators see at a glance whether the AI backend (settings
   ai_endpoint / Mac Studio NodePort) is reachable for log analysis.
   ────────────────────────────────────────────────────────────────────────── */

interface PresentationConfig {
  fg: string;
  bg: string;
  label: string;
}

const STATUS: Record<OllamaHealthStatus, PresentationConfig> = {
  checking: {
    fg: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    label: "Checking Ollama…",
  },
  healthy: {
    fg: "text-emerald-600 dark:text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/30",
    label: "Ollama Online",
  },
  degraded: {
    fg: "text-amber-600 dark:text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/30",
    label: "Ollama Slow",
  },
  down: {
    fg: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    label: "Ollama Offline",
  },
  error: {
    fg: "text-red-600 dark:text-red-400",
    bg: "bg-red-500/10 border-red-500/30",
    label: "Ollama Error",
  },
};

export default function OllamaHealthIndicator() {
  const { status, latencyMs, modelCount, endpoint, error, refresh } =
    useOllamaHealth();
  const config = STATUS[status];

  const detailParts: string[] = [];
  if (endpoint) detailParts.push(endpoint);
  if (modelCount !== null && status !== "checking") {
    detailParts.push(
      modelCount === 1 ? "1 model" : `${modelCount} models`,
    );
  }
  if (latencyMs !== null && status !== "checking") {
    detailParts.push(`${latencyMs}ms`);
  }
  if (error && (status === "down" || status === "error")) {
    detailParts.push(error);
  }
  detailParts.push("click to re-check");

  const tooltip = detailParts.join(" · ");

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
        {modelCount !== null &&
        status !== "checking" &&
        (status === "healthy" || status === "degraded")
          ? ` (${modelCount})`
          : ""}
      </span>
      {latencyMs !== null && status !== "checking" && (
        <span className="opacity-70">{latencyMs}ms</span>
      )}
    </button>
  );
}
