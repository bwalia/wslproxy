"use server";

/* ──────────────────────────────────────────────────────────────────────────
   Server Actions used by the dashboard UI to invalidate specific
   server-side caches.

   Each action maps to exactly one cache tag so a refresh button can
   force a re-fetch of just its own section without flushing the
   whole dashboard.  Called from client components — `useFormStatus`
   or plain `startTransition(() => refreshXxx())` both work.

   Next.js 16's `revalidateTag(tag, "max")` purges every cache entry
   for that tag immediately (vs the default which only marks them
   stale).  We want immediate because the user explicitly clicked
   refresh — they expect fresh data, not "soon".
   ────────────────────────────────────────────────────────────────────────── */

import { revalidateTag } from "next/cache";
import { CACHE_TAGS } from "@/lib/api/server-client";

export async function refreshTraffic(): Promise<void> {
  revalidateTag(CACHE_TAGS.dashboardTraffic, "max");
}

export async function refreshInstanceInfo(): Promise<void> {
  revalidateTag(CACHE_TAGS.dashboardInstance, "max");
}

export async function refreshBackendHealth(): Promise<void> {
  revalidateTag(CACHE_TAGS.dashboardBackend, "max");
}

export async function refreshCacheStats(): Promise<void> {
  revalidateTag(CACHE_TAGS.dashboardCache, "max");
}

export async function refreshWafStats(): Promise<void> {
  revalidateTag(CACHE_TAGS.dashboardWaf, "max");
}

export async function refreshSslMetrics(): Promise<void> {
  revalidateTag(CACHE_TAGS.dashboardSsl, "max");
}

export async function refreshEntities(): Promise<void> {
  revalidateTag(CACHE_TAGS.dashboardEntities, "max");
}

/**
 * Nuke everything dashboard-tagged.  Intended for an "auto-refresh
 * tick" timer + a top-level "Refresh All" button.  Cheaper than
 * calling every action one by one because revalidateTag is batched
 * on the server for the same request.
 */
export async function refreshAllDashboard(): Promise<void> {
  revalidateTag(CACHE_TAGS.dashboardTraffic, "max");
  revalidateTag(CACHE_TAGS.dashboardInstance, "max");
  revalidateTag(CACHE_TAGS.dashboardBackend, "max");
  revalidateTag(CACHE_TAGS.dashboardCache, "max");
  revalidateTag(CACHE_TAGS.dashboardWaf, "max");
  revalidateTag(CACHE_TAGS.dashboardSsl, "max");
  revalidateTag(CACHE_TAGS.dashboardEntities, "max");
}
