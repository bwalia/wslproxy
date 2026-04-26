/* ──────────────────────────────────────────────────────────────────────────
   Server-side API client.

   Consumed by async Server Components and Server Actions.  Forwards the
   httpOnly auth cookie from the incoming request to the Lua backend so
   server-rendered pages reflect the authenticated user's data.

   Pairs with `src/lib/api/client.ts` (the browser-side variant).
   ────────────────────────────────────────────────────────────────────────── */

import "server-only";
import { cookies } from "next/headers";
import { ApiError } from "./client";
import { env } from "@/lib/config/env";

/**
 * Resolve the backend base URL from validated env.  `WSLPROXY_API_URL`
 * is the in-cluster URL used by next.config rewrites; the same value is
 * safe to use directly from a server component because the call stays
 * inside the pod network.
 */
function getApiBase(): string {
  return env.apiUrl ?? "http://wslproxy-local:8080";
}

async function forwardAuthCookie(): Promise<string | null> {
  const store = await cookies();
  const token = store.get("wslproxy_token")?.value;
  return token ? `wslproxy_token=${token}` : null;
}

export interface ServerFetchOptions extends RequestInit {
  /**
   * Next.js fetch caching directive.  Defaults are tuned for per-user data:
   *   - `cache: "no-store"` means the response is never cached
   *   - `next.tags` lets mutations call `revalidateTag(tag)` to invalidate
   *     server-rendered pages that used this fetch
   */
  next?: {
    revalidate?: number | false;
    tags?: string[];
  };
}

/**
 * Server-side fetch.  Forwards the auth cookie and returns typed JSON.
 *
 * - 401/403 → throws ApiError; callers can render a "session expired"
 *   state or rely on middleware to have already redirected.
 * - Empty body → returns `null` (matches client-side `apiFetch`).
 */
export async function serverFetch<T = unknown>(
  path: string,
  options: ServerFetchOptions = {},
): Promise<T> {
  const base = getApiBase();
  const url = path.startsWith("http")
    ? path
    : `${base}${path.startsWith("/api") ? "" : "/api"}${
        path.startsWith("/") ? path : `/${path}`
      }`;

  const cookieHeader = await forwardAuthCookie();

  const res = await fetch(url, {
    // Default: never cache per-user data server-side either.  Page authors
    // can override with `{ next: { revalidate: 60 } }` for shared data.
    cache: options.cache ?? "no-store",
    ...options,
    headers: {
      "x-platform": "openresty-admin-next-ssr",
      ...(cookieHeader ? { cookie: cookieHeader } : {}),
      ...((options.headers as Record<string, string>) ?? {}),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new ApiError(text || res.statusText, res.status);
  }

  const text = await res.text();
  if (!text || !text.trim()) return null as T;

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(`Invalid JSON: ${text.slice(0, 120)}`, 500);
  }
}

/**
 * Cache tags used across server-rendered pages.  Mutations in client
 * components can trigger revalidation via `revalidateTag(tag)` (called
 * from a Server Action) or `revalidatePath(path)` for route-level refresh.
 *
 * Keep in sync with resource names in the Lua API and SWR keys.
 */
export const CACHE_TAGS = {
  servers: "servers",
  rules: "rules",
  upstreams: "upstreams",
  users: "users",
  profiles: "profiles",
  secrets: "secrets",
  instances: "instances",
  bookmarks: "bookmarks",
  wafRules: "waf-rules",
  wafPolicies: "waf-policies",
  wafEvents: "waf-events",
  changeRequests: "change-requests",
  traffic: "traffic",
  health: "health",
  topology: "topology",
  // ── Dashboard-specific tags ──────────────────────────────────────
  dashboardTraffic: "dashboard-traffic",
  dashboardInstance: "dashboard-instance",
  dashboardBackend: "dashboard-backend",
  dashboardCache: "dashboard-cache",
  dashboardWaf: "dashboard-waf",
  dashboardSsl: "dashboard-ssl",
  dashboardEntities: "dashboard-entities",
} as const;

export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
