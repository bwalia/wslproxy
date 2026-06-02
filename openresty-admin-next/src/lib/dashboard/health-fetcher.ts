import "server-only";
import { CACHE_TAGS, serverFetch } from "@/lib/api/server-client";
import { env } from "@/lib/config/env";
import type {
  HealthBundle,
  HealthData,
  InstanceInfo,
  SingleResult,
} from "@/types";

/* ──────────────────────────────────────────────────────────────────────────
   Server-side Health page data fetcher.

   Fans out to three endpoints in parallel so the detail panels
   (`/system/detailed-health` is the main one; `instance/info` and
   `cache/stats` supplement it with OS / disk + cache stats).  Captures
   the round-trip latency + HTTP status so the API Health panel can
   render them without a separate client-side call.

   Note on the detailed-health endpoint: this page used to hit
   `/api/ping?detailed=true`, but the api.lua dispatcher has no
   `path == "ping"` handler — that path falls through and returns an
   empty body, which the page reads as `data: undefined` and surfaces
   as a permanent "System Status: unreachable" even though the API is
   responding fine.  `/api/system/detailed-health` is the real
   endpoint: it runs ping.lua internally via `ngx.location.capture`
   and wraps the result in the `{data: …}` envelope this fetcher
   expects (see api/api.lua around the `system/detailed-health`
   handler).

   Runs behind the httpOnly auth cookie via `serverFetch`, so the
   rendered HTML already contains the authenticated view on first
   paint.  Everything is cached under the `CACHE_TAGS.health` tag —
   mutations elsewhere can call `revalidateTag(CACHE_TAGS.health)` to
   nudge the next paint to refetch.
   ────────────────────────────────────────────────────────────────────────── */

const REVALIDATE_SECONDS = 10;

// Empty fallbacks kept at module scope so `fetchHealthBundle` never
// hands back fresh objects on cache hits — stable references help
// React's Server Components machinery dedupe.
const EMPTY_HEALTH: HealthData = { status: "unreachable" };
const EMPTY_INSTANCE: InstanceInfo = {};
const EMPTY_CACHE: HealthBundle["cache"] = { available: false };

export async function fetchHealthBundle(): Promise<HealthBundle> {
  const pingStart = Date.now();
  let pingStatus = 0;
  let pingError: string | undefined;

  // Fire all three fetches in parallel.  `Promise.allSettled` so one
  // failing endpoint (e.g. Redis down → cache/stats 500) doesn't
  // blank out the rest of the page.
  const [pingRes, instanceRes, cacheRes] = await Promise.allSettled([
    serverFetch<SingleResult<HealthData>>("/system/detailed-health", {
      next: { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.health] },
    }),
    serverFetch<SingleResult<InstanceInfo>>("/instance/info", {
      next: { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.health] },
    }),
    serverFetch<SingleResult<HealthBundle["cache"]>>("/cache/stats", {
      next: { revalidate: REVALIDATE_SECONDS, tags: [CACHE_TAGS.health] },
    }),
  ]);

  const latencyMs = Date.now() - pingStart;

  let health: HealthData;
  if (pingRes.status === "fulfilled") {
    health = pingRes.value?.data ?? EMPTY_HEALTH;
    // Successful JSON response → the HTTP layer returned 2xx or the
    // response body would have thrown.  We don't have the real
    // response.status here (serverFetch abstracts it), so we assume
    // 200 on success.  On failure we stamp 0 + the error string.
    pingStatus = 200;
  } else {
    health = { ...EMPTY_HEALTH };
    pingStatus = 0;
    pingError =
      pingRes.reason instanceof Error
        ? pingRes.reason.message
        : String(pingRes.reason);
  }

  const instance: InstanceInfo =
    instanceRes.status === "fulfilled"
      ? (instanceRes.value?.data ?? EMPTY_INSTANCE)
      : EMPTY_INSTANCE;

  const cache: HealthBundle["cache"] =
    cacheRes.status === "fulfilled"
      ? (cacheRes.value?.data ?? EMPTY_CACHE)
      : EMPTY_CACHE;

  return {
    health,
    instance,
    cache,
    meta: {
      // The browser talks to the same origin it was served from; the
      // upstream URL is what the server component sees.  Expose the
      // configured Lua endpoint so operators can verify the wiring.
      api_url: env.apiUrl ?? "(same-origin)",
      http_status: pingStatus,
      latency_ms: latencyMs,
      authenticated: pingStatus === 200,
      error: pingError,
    },
  };
}
