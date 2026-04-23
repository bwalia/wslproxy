/* ──────────────────────────────────────────────────────────────────────────
   Low-level fetch wrapper.

   Auth is handled by the httpOnly `wslproxy_token` cookie set by the Lua
   backend on login.  The cookie is sent automatically with every
   same-origin request — there is no manual token handling in JS.
   ────────────────────────────────────────────────────────────────────────── */

/** Encode chars that OpenResty's Lua JSON parser chokes on. */
export function encodePayload(data: unknown): string {
  return JSON.stringify(data)
    .replace(/&/g, "\\u0026")
    .replace(/\+/g, "\\u002B")
    .replace(/=/g, "\\u003D");
}

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/**
 * Core fetch helper.  All API calls go through here.
 *
 * - Paths are relative to `/api` (Next.js rewrites proxy to the Lua backend,
 *   keeping requests same-origin so the auth cookie is sent automatically).
 * - `credentials: "same-origin"` makes the cookie requirement explicit.
 * - `cache: "no-store"` keeps the browser cache from serving user-specific
 *   responses; we rely on SWR for client-side deduplication.
 * - 401 responses send the user to /login (middleware will also gate the
 *   next navigation, but this covers in-flight requests).
 * - Empty response bodies safely return `null`.
 */
export async function apiFetch<T = unknown>(
  path: string,
  options: RequestInit = {},
  signal?: AbortSignal,
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `/api${path.startsWith("/") ? path : `/${path}`}`;

  const headers: Record<string, string> = {
    "x-platform": "openresty-admin-next",
    ...((options.headers as Record<string, string>) ?? {}),
  };

  const res = await fetch(url, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    signal,
    headers,
  });

  if (res.status === 401) {
    if (typeof window !== "undefined" && window.location.pathname !== "/login") {
      window.location.href = "/login";
    }
    throw new ApiError("Unauthorized", 401);
  }

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
