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
/**
 * Default timeout for server-side fetches.  RSC paths block the
 * Suspense fallback while in flight, so a hung backend would freeze
 * the page render.  30s matches the browser-side default in
 * `client.ts`.
 */
const DEFAULT_SERVER_TIMEOUT_MS = 30_000;

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

  // Wrap with AbortController so a hung backend can't block the
  // RSC render forever — typed as ApiError(408) so consumers can
  // branch on it the same way they do for client-side fetches.
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort(new DOMException("Request timed out", "TimeoutError"));
  }, DEFAULT_SERVER_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(url, {
      // Default: never cache per-user data server-side either.  Page
      // authors can override with `{ next: { revalidate: 60 } }`.
      cache: options.cache ?? "no-store",
      ...options,
      signal: ctrl.signal,
      headers: {
        "x-platform": "openresty-admin-next-ssr",
        ...(cookieHeader ? { cookie: cookieHeader } : {}),
        ...((options.headers as Record<string, string>) ?? {}),
      },
    });
  } catch (err) {
    clearTimeout(timer);
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError("Request timed out", 408);
    }
    // Network errors land as TypeError("fetch failed") in Node.
    if (err instanceof TypeError) {
      throw new ApiError(`Network error: ${err.message}`, 0);
    }
    throw err;
  }

  try {
    if (!res.ok) {
      // Parse the Lua structured error envelope so callers see the
      // human message + code + details, not a raw JSON string.
      // Mirrors the same logic in `client.ts` for client fetches.
      const text = await res.text().catch(() => "");
      let message = text || res.statusText;
      let code: string | undefined;
      let details: unknown;
      if (text) {
        try {
          const parsed = JSON.parse(text) as {
            error?: { message?: string; code?: string; details?: unknown };
          };
          if (parsed?.error?.message) {
            message = parsed.error.message;
            code = parsed.error.code;
            details = parsed.error.details;
          }
        } catch {
          /* not JSON, keep raw text */
        }
      }
      throw new ApiError(message, res.status, { code, details });
    }

    const text = await res.text();
    if (!text || !text.trim()) return null as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(`Invalid JSON: ${text.slice(0, 120)}`, 500);
    }
  } finally {
    clearTimeout(timer);
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
