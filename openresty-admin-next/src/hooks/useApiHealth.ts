"use client";

import { useCallback, useEffect, useState } from "react";

/* ──────────────────────────────────────────────────────────────────────────
   `useApiHealth(mode)` — periodically pings `/api/ping` and reports a
   coarse status + latency.

   Two modes:
     - "authenticated":  context where the user has a valid session
                         cookie.  Expects 200 from `/api/ping`; anything
                         else is treated as an API problem.
     - "anonymous":      context with no session (login page).  Any HTTP
                         response — even 401 — proves the API is
                         reachable; only a network failure means down.

   Cadence: one immediate probe on mount, then every POLL_INTERVAL_MS.
   Per-request timeout: 8s via AbortController; longer than that and the
   network is effectively offline as far as this UI is concerned.

   Mirrors openresty-admin/src/component/ApiHealthBanner.jsx so the
   migrated dashboard exposes the same operator signal it always had.
   ────────────────────────────────────────────────────────────────────────── */

const POLL_INTERVAL_MS = 30_000;
const SLOW_THRESHOLD_MS = 3_000;
const PROBE_TIMEOUT_MS = 8_000;

export type ApiHealthMode = "authenticated" | "anonymous";

export type ApiHealthStatus =
  | "checking"
  | "healthy"
  | "degraded"
  | "down"
  | "error"
  | "reachable"
  | "auth_required";

export interface ApiHealthState {
  status: ApiHealthStatus;
  latencyMs: number | null;
  httpStatus: number | null;
  /** Manual re-probe — useful when the user clicks a "retry" affordance. */
  refresh: () => void;
}

export function useApiHealth(mode: ApiHealthMode = "authenticated"): ApiHealthState {
  const [status, setStatus] = useState<ApiHealthStatus>("checking");
  const [latencyMs, setLatencyMs] = useState<number | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);

  const probe = useCallback(async () => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(
      () => controller.abort(),
      PROBE_TIMEOUT_MS,
    );
    const start = performance.now();

    try {
      // Cache-buster on the URL so a CDN or browser cache can't satisfy
      // the probe with a stale response — the whole point of polling
      // is to measure freshness.
      const res = await fetch(`/api/ping?t=${Date.now()}`, {
        method: "GET",
        // Authenticated mode needs the session cookie sent; anonymous
        // mode still includes it (browsers do by default for same-origin)
        // and the API will simply return 401 if there's nothing valid.
        credentials: "same-origin",
        cache: "no-store",
        signal: controller.signal,
      });
      const elapsed = Math.round(performance.now() - start);
      setLatencyMs(elapsed);
      setHttpStatus(res.status);

      if (mode === "authenticated") {
        if (res.ok) {
          setStatus(elapsed > SLOW_THRESHOLD_MS ? "degraded" : "healthy");
        } else {
          setStatus("error");
        }
      } else {
        // anonymous: any HTTP response = reachable
        if (res.status === 401 || res.status === 403) {
          setStatus("auth_required");
        } else {
          setStatus("reachable");
        }
      }
    } catch {
      // AbortError (timeout) or network failure both land here.
      setLatencyMs(null);
      setHttpStatus(null);
      setStatus("down");
    } finally {
      window.clearTimeout(timeoutId);
    }
  }, [mode]);

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

  return { status, latencyMs, httpStatus, refresh: probe };
}
