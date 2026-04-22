"use server";

/* ──────────────────────────────────────────────────────────────────────────
   Server Actions for invalidating the Next.js server cache.

   Pattern: client components call these after a mutation to force
   server-rendered pages (Health, Settings, any list page that gets moved
   to server components) to refetch on next navigation.

   Example:
     import { revalidateResource } from "@/lib/api/revalidate";
     // after POST /api/servers/...
     await revalidateResource("servers");
   ────────────────────────────────────────────────────────────────────────── */

import { revalidatePath, revalidateTag } from "next/cache";
import { CACHE_TAGS, type CacheTag } from "./server-client";

/**
 * Invalidate all server-fetched data tagged with `tag`.  Matches the
 * `next.tags` argument passed to `serverFetch` in server components.
 *
 * The second `"max"` argument is Next.js 16's new invalidation profile —
 * it purges every cache entry for this tag immediately (vs softer
 * profiles that only mark entries stale).
 */
export async function revalidateByTag(tag: CacheTag): Promise<void> {
  revalidateTag(tag, "max");
}

/**
 * Invalidate a specific route.  Useful when a mutation affects a page's
 * content but not necessarily any tagged fetch (e.g. route-level caches).
 */
export async function revalidateByPath(path: string): Promise<void> {
  revalidatePath(path);
}

/**
 * Convenience wrapper for resource-style tags.  Accepts the same names
 * used in the Lua API ("servers", "rules", etc.).
 */
export async function revalidateResource(
  resource: keyof typeof CACHE_TAGS,
): Promise<void> {
  revalidateTag(CACHE_TAGS[resource], "max");
}
