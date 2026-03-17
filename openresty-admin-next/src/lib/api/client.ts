/* ──────────────────────────────────────────────────────────────────────────
   Low-level fetch wrapper — handles auth headers, 401 redirect, JSON
   parsing, and empty-body safety.  No React dependency.
   ────────────────────────────────────────────────────────────────────────── */

function getAuthHeaders(): Record<string, string> {
  const headers: Record<string, string> = { "x-platform": "react-admin" };
  if (typeof window === "undefined") return headers;

  try {
    const raw = localStorage.getItem("token");
    if (raw) {
      const parsed = JSON.parse(raw);
      const accessToken = parsed?.accessToken ?? parsed?.token;
      if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    }
  } catch {
    /* corrupt token — ignore */
  }
  return headers;
}

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
 * - Paths are relative to `/api` (the Next.js rewrite proxy strips CORS).
 * - 401 responses clear the token and redirect to /login.
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

  const res = await fetch(url, {
    ...options,
    signal,
    headers: { ...getAuthHeaders(), ...(options.headers as Record<string, string>) },
  });

  if (res.status === 401) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("uuid_business_id");
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
