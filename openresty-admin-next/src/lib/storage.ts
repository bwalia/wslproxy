/* ──────────────────────────────────────────────────────────────────────────
   Typed, namespaced localStorage access.

   Single source of truth for which keys the app reads/writes on the
   browser.  Every other module imports from here — no direct
   `localStorage.getItem(...)` / `setItem(...)` calls elsewhere.  This
   gives us:

   - Centralized key registry (no typos or drifting names)
   - SSR-safe (all APIs no-op on the server)
   - Typed get/set (compile-time errors for wrong shape)
   - Schema versioning hook if we ever need to migrate
   - A single place to instrument / debug storage access
   - Event-based cross-tab sync for keys that need it
   ────────────────────────────────────────────────────────────────────────── */

/**
 * Registered storage keys.  Adding a key here is the only way to read or
 * write to localStorage anywhere else in the app.
 */
export const STORAGE_KEYS = {
  /** Active environment profile — drives list filters + mutation defaults. */
  environment: "wslproxy.environment",
  /** Cached non-sensitive user metadata for instant UI hydration. */
  user: "wslproxy.user",
  /** Cached non-sensitive instance metadata (instance_id, instance_name, etc). */
  instance: "wslproxy.instance",
  /** UI theme preference: "light" | "dark" | "system". */
  theme: "wslproxy.theme",
  /** Sidebar collapsed state. */
  sidebarCollapsed: "wslproxy.sidebarCollapsed",
  /** Optional per-deployment FRONT_URL for /frontdoor/opsapi/sync calls. */
  frontUrl: "wslproxy.frontUrl",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/**
 * Shape contract for each key.  Missing entries = any JSON value allowed.
 * Used by getTyped / setTyped for compile-time safety.
 */
export interface StorageSchema {
  [STORAGE_KEYS.environment]: string;
  [STORAGE_KEYS.user]: { email?: string; [k: string]: unknown };
  [STORAGE_KEYS.instance]: { instance_id?: string; instance_name?: string; [k: string]: unknown };
  [STORAGE_KEYS.theme]: "light" | "dark" | "system";
  [STORAGE_KEYS.sidebarCollapsed]: boolean;
  [STORAGE_KEYS.frontUrl]: string;
}

// ─── Core primitives (SSR-safe, JSON-encoded) ─────────────────────────

function hasStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

function getRaw(key: string): string | null {
  if (!hasStorage()) return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setRaw(key: string, value: string): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch {
    // Quota exceeded, private browsing, etc — non-fatal.
    return false;
  }
}

function removeRaw(key: string): boolean {
  if (!hasStorage()) return false;
  try {
    window.localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// ─── Typed JSON accessors ─────────────────────────────────────────────

/**
 * Read a JSON-encoded value.  Returns `null` when:
 *   - running on the server (SSR), or
 *   - the key is absent, or
 *   - the stored value is corrupt JSON.
 *
 * Does NOT apply any schema validation.  For that, pipe the result
 * through a Zod schema at the callsite.
 */
export function get<K extends StorageKey>(key: K): StorageSchema[K] | null {
  const raw = getRaw(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as StorageSchema[K];
  } catch {
    // Corrupt payload — remove so we don't keep hitting the same error.
    removeRaw(key);
    return null;
  }
}

/**
 * Read with a default value when absent / corrupt.
 */
export function getWithDefault<K extends StorageKey>(
  key: K,
  fallback: StorageSchema[K],
): StorageSchema[K] {
  const v = get(key);
  return v === null ? fallback : v;
}

/**
 * Write a JSON-encoded value.  Returns `true` on success, `false` when
 * storage is unavailable or the browser rejected the write (quota).
 * Never throws.
 */
export function set<K extends StorageKey>(key: K, value: StorageSchema[K]): boolean {
  try {
    return setRaw(key, JSON.stringify(value));
  } catch {
    return false;
  }
}

/**
 * Remove a key.  Idempotent.
 */
export function remove<K extends StorageKey>(key: K): boolean {
  return removeRaw(key);
}

/**
 * Clear all wslproxy-namespaced keys.  Used by logout.  Leaves keys from
 * other apps on the same origin intact.
 */
export function clearAll(): void {
  if (!hasStorage()) return;
  try {
    for (const key of Object.values(STORAGE_KEYS)) {
      window.localStorage.removeItem(key);
    }
  } catch {
    /* non-fatal */
  }
}

// ─── Cross-tab synchronization ────────────────────────────────────────

type StorageListener<K extends StorageKey> = (value: StorageSchema[K] | null) => void;

/**
 * Subscribe to changes made to `key` from OTHER tabs (the `storage`
 * event fires only cross-tab, not for writes in the same tab).  Returns
 * an unsubscribe function.
 *
 * Useful for keys that should stay in sync across open windows, e.g.
 * the active environment profile — if the user switches profiles in
 * tab A, tab B should observe it too.
 */
export function subscribe<K extends StorageKey>(
  key: K,
  listener: StorageListener<K>,
): () => void {
  if (!hasStorage()) return () => {};

  const handler = (e: StorageEvent) => {
    if (e.key !== key) return;
    if (e.newValue == null) {
      listener(null);
      return;
    }
    try {
      listener(JSON.parse(e.newValue) as StorageSchema[K]);
    } catch {
      listener(null);
    }
  };

  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
