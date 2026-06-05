/* ──────────────────────────────────────────────────────────────────────────
   Low-level fetch wrapper.

   Auth is handled by the httpOnly `wslproxy_token` cookie set by the Lua
   backend on login.  The cookie is sent automatically with every
   same-origin request — there is no manual token handling in JS.
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Default request timeout in milliseconds.  Without this, browser
 * fetch hangs indefinitely on a stalled backend — buttons spin
 * forever, users get no feedback.  30s gives slow-but-alive backends
 * room to respond on big writes (e.g. server config + nginx -t)
 * while still surfacing real outages quickly.
 */
const DEFAULT_TIMEOUT_MS = 30_000;

/** Encode chars that OpenResty's Lua JSON parser chokes on. */
export function encodePayload(data: unknown): string {
  return JSON.stringify(data)
    .replace(/&/g, "\\u0026")
    .replace(/\+/g, "\\u002B")
    .replace(/=/g, "\\u003D");
}

/**
 * Shape of the Lua backend's structured error envelope (see
 * `api/errors.lua:Errors.throwError`).  `details` is opaque — callers
 * that know the resource map specific keys (e.g. `field`) to form
 * inputs.
 */
interface BackendErrorEnvelope {
  error?: {
    message?: string;
    status?: number;
    code?: string;
    details?: unknown;
  };
}

export class ApiError extends Error {
  /**
   * Semantic code from the backend (e.g. "CONFLICT", "BAD_REQUEST").
   * Useful for branching without parsing the message string.
   */
  public code?: string;
  /**
   * Optional structured payload (validation field map etc.) — same
   * shape the backend put in `error.details`.
   */
  public details?: unknown;

  constructor(
    message: string,
    public status: number,
    extra?: { code?: string; details?: unknown },
  ) {
    super(message);
    this.name = "ApiError";
    if (extra?.code !== undefined) this.code = extra.code;
    if (extra?.details !== undefined) this.details = extra.details;
  }
}

/**
 * Try to extract the human message + code + details from a Lua
 * backend error response body.  Backend always emits
 * `{ error: { message, status, code, details? } }` for thrown errors
 * (see `api/errors.lua`), so this is a best-effort JSON.parse with
 * graceful fallback to the raw text when the body isn't structured.
 */
function parseBackendError(
  text: string,
  fallbackStatus: number,
): { message: string; code?: string; details?: unknown } {
  if (!text) return { message: "" };
  try {
    const parsed = JSON.parse(text) as BackendErrorEnvelope;
    if (parsed?.error?.message) {
      return {
        message: parsed.error.message,
        code: parsed.error.code,
        details: parsed.error.details,
      };
    }
  } catch {
    /* not JSON — fall through to raw text */
  }
  return { message: text || `HTTP ${fallbackStatus}` };
}

/**
 * Compose an outer `AbortController` that aborts after `timeoutMs`
 * with the caller's optional signal.  Returns the merged signal +
 * a cleanup function the caller calls in `finally` to release the
 * timer (so the timer doesn't leak when the request finishes early).
 */
function withTimeout(
  external: AbortSignal | undefined,
  timeoutMs: number,
): { signal: AbortSignal; cleanup: () => void } {
  const ctrl = new AbortController();
  const timer = setTimeout(() => {
    ctrl.abort(new DOMException("Request timed out", "TimeoutError"));
  }, timeoutMs);

  // If the caller passed their own signal (e.g. SWR's per-request
  // abort), forward its abort to the inner controller so we honor
  // both timeout AND user-cancel.
  let externalListener: (() => void) | null = null;
  if (external) {
    if (external.aborted) {
      ctrl.abort(external.reason);
    } else {
      externalListener = () => ctrl.abort(external.reason);
      external.addEventListener("abort", externalListener, { once: true });
    }
  }

  return {
    signal: ctrl.signal,
    cleanup: () => {
      clearTimeout(timer);
      if (external && externalListener) {
        external.removeEventListener("abort", externalListener);
      }
    },
  };
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

  const { signal: timedSignal, cleanup } = withTimeout(
    signal,
    DEFAULT_TIMEOUT_MS,
  );

  let res: Response;
  try {
    res = await fetch(url, {
      credentials: "same-origin",
      cache: "no-store",
      ...options,
      signal: timedSignal,
      headers,
    });
  } catch (err) {
    cleanup();
    // Distinguish timeout from user-abort from network error so the
    // UI can show a sensible message (and so SWR's retry policy can
    // decide whether to bother retrying).
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new ApiError("Request timed out", 408);
    }
    if (err instanceof DOMException && err.name === "AbortError") {
      throw err; // caller cancelled — propagate as-is
    }
    if (err instanceof TypeError) {
      // Network-level failures (DNS, offline, CORS) surface as
      // TypeError("Failed to fetch") in browsers.  Map to a
      // displayable ApiError with a status code that signals
      // "network unreachable" to consumers.
      throw new ApiError(`Network error: ${err.message}`, 0);
    }
    throw err;
  }

  try {
    if (res.status === 401) {
      // Use `location.replace` instead of `.href` so the redirected
      // /login doesn't end up in the browser's back-stack (the user
      // never asked to navigate to /login; we forced it).  Carry the
      // current path as `?returnTo=` so the LoginPage can send them
      // back where they were.  The middleware does the same on a
      // fresh page load — this is the equivalent for an in-flight
      // fetch that 401s mid-session.
      //
      // We deliberately avoid `router.push` from here: this function
      // is called outside React's render tree (inside fetchers,
      // event handlers, anywhere), so we can't reach the Next.js
      // router instance.  A full-document navigation is the cleanest
      // boundary — it also forces every SWR cache, every running
      // setInterval, every Suspense boundary to be torn down with
      // the page, so the post-login dashboard starts from a clean
      // slate.  The AuthContext.login then nukes SWR cache anyway
      // (defence in depth).
      if (
        typeof window !== "undefined" &&
        window.location.pathname !== "/login"
      ) {
        const here = window.location.pathname + window.location.search;
        const target = `/login?returnTo=${encodeURIComponent(here)}`;
        window.location.replace(target);
      }
      throw new ApiError("Unauthorized", 401);
    }

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      const parsed = parseBackendError(text, res.status);
      throw new ApiError(
        parsed.message || res.statusText,
        res.status,
        { code: parsed.code, details: parsed.details },
      );
    }

    const text = await res.text();
    if (!text || !text.trim()) return null as T;

    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ApiError(`Invalid JSON: ${text.slice(0, 120)}`, 500);
    }
  } finally {
    cleanup();
  }
}
