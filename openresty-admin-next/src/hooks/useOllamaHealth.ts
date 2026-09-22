"use client";

import { useCallback, useEffect, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   `useOllamaHealth()` — periodically probes `/api/ai/models` and reports
   whether the configured Ollama endpoint is reachable.

   The Lua handler always returns HTTP 200 (so a down Ollama does not look
   like an API outage); health is carried in `data.healthy`.  Cadence matches
   `useApiHealth` so both AppBar pills refresh together.
   ────────────────────────────────────────────────────────────────────────── */

const POLL_INTERVAL_MS = 30_000;
const SLOW_THRESHOLD_MS = 3_000;
const PROBE_TIMEOUT_MS = 8_000;

export type OllamaHealthStatus =
  | "checking"
  | "healthy"
  | "degraded"
  | "down"
  | "error";

export interface OllamaHealthState {
  status: OllamaHealthStatus;
  latencyMs: number | null;
  modelCount: number | null;
  endpoint: string | null;
  error: string | null;
  refresh: () => void;
}

interface AiModelsPayload {
  data?: {
    models?: string[];
    default?: string;
    healthy?: boolean;
    endpoint?: string;
    latency_ms?: number;
    error?: string;
  };
}

export function useOllamaHealth(): OllamaHealthState {
  const [status, setStatus] = useState<OllamaHealthStatus>("checking");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [modelCount, setModelCount] = useState<number | null>(null);
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const probe = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      PROBE_TIMEOUT_MS,
    );
    const start = performance.now();

    try {
      const res = await fetch(`/api/ai/models?t=${Date.now()}`, {
        method: "GET",
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
        headers: { "x-platform": "openresty-admin-next" },
      });
      const roundTripMs = Math.round(performance.now() - start);

      if (!res.ok) {
        setLatencyMs(roundTripMs);
        setModelCount(null);
        setEndpoint(null);
        setError(`HTTP ${res.status}`);
        setStatus("error");
        return;
      }

      const body = (await res.json()) as AiModelsPayload;
      const data = body?.data ?? {};
      const models = Array.isArray(data.models) ? data.models : [];
      const probeMs =
        typeof data.latency_ms === "number" ? data.latency_ms : roundTripMs;

      setLatencyMs(probeMs);
      setModelCount(models.length);
      setEndpoint(typeof data.endpoint === "string" ? data.endpoint : null);
      setError(typeof data.error === "string" ? data.error : null);

      if (data.healthy === true) {
        setStatus(probeMs > SLOW_THRESHOLD_MS ? "degraded" : "healthy");
      } else if (data.healthy === false) {
        setStatus("down");
      } else {
        // Older backends without the healthy flag: treat non-empty
        // models as up, empty as unknown/down.
        setStatus(models.length > 0 ? "healthy" : "down");
      }
    } catch {
      setLatencyMs(null);
      setModelCount(null);
      setEndpoint(null);
      setError(null);
      setStatus("down");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      if (!cancelled) await probe();
    };
    run();
    const id = window.setInterval(run, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [probe]);

  return {
    status,
    latencyMs,
    modelCount,
    endpoint,
    error,
    refresh: probe,
  };
}
