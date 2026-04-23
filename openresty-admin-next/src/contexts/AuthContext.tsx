"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { STORAGE_KEYS, get, set, remove } from "@/lib/storage";

/**
 * Auth is managed via an httpOnly `wslproxy_token` cookie set by the Lua
 * backend on successful login.  The cookie is NOT readable from JavaScript
 * (httpOnly) and is sent automatically with every same-origin request.
 *
 * Route gating is enforced by `src/middleware.ts` before pages render.
 * This context exists for:
 *   • Triggering the login POST from the login form
 *   • Exposing cached user/instance info to client components
 *   • Coordinating logout (clears cookie on the server + routes to /login)
 */

interface SessionUser {
  email?: string | null;
  [key: string]: unknown;
}

interface SessionInstance {
  instance_id?: string;
  instance_name?: string;
  instance_hash?: string;
  serial_number?: string;
  [key: string]: unknown;
}

interface AuthContextValue {
  user: SessionUser | null;
  instance: SessionInstance | null;
  isAuthenticated: boolean;
  hydrating: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

// Non-sensitive cache of user/instance for quick UI hydration lives in
// localStorage via the typed storage layer.  The JWT itself is NEVER
// stored here — it lives only in the httpOnly cookie set by the backend.

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [instance, setInstance] = useState<SessionInstance | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [hydrating, setHydrating] = useState(true);

  // Hydrate from /api/user/me — this tells us whether the cookie is valid
  // (200) or missing/expired (401).  The cookie itself is invisible to JS.
  useEffect(() => {
    let cancelled = false;

    // Fast path: use cached non-sensitive info for instant paint.
    const cachedInstance = get(STORAGE_KEYS.instance);
    if (cachedInstance) setInstance(cachedInstance);
    const cachedUser = get(STORAGE_KEYS.user);
    if (cachedUser) setUser(cachedUser);

    (async () => {
      try {
        const res = await fetch("/api/user/me", {
          credentials: "same-origin",
          cache: "no-store",
        });
        if (cancelled) return;

        if (res.ok) {
          const json = await res.json().catch(() => null);
          const data = json?.data ?? json;
          if (data?.user) {
            setUser(data.user);
            set(STORAGE_KEYS.user, data.user);
          }
          if (data?.instance) {
            setInstance(data.instance);
            set(STORAGE_KEYS.instance, data.instance);
          }
          setIsAuthenticated(true);
        } else {
          // 401 or other — session is invalid.  Middleware will redirect
          // the next protected navigation; just clear cached state here.
          setIsAuthenticated(false);
          setUser(null);
          setInstance(null);
          remove(STORAGE_KEYS.user);
          remove(STORAGE_KEYS.instance);
        }
      } catch {
        if (!cancelled) setIsAuthenticated(false);
      } finally {
        if (!cancelled) setHydrating(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/user/login", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Login failed");
      }

      const json = await res.json();
      const data = json?.data ?? json;

      // The cookie was set by the backend via Set-Cookie.  We just need
      // to hydrate the UI with user/instance info.
      if (data?.user) {
        setUser(data.user);
        set(STORAGE_KEYS.user, data.user);
      }
      if (data?.instance) {
        setInstance(data.instance);
        set(STORAGE_KEYS.instance, data.instance);
      }
      setIsAuthenticated(true);

      router.push("/");
    },
    [router],
  );

  const logout = useCallback(async () => {
    // Best-effort — even if the network fails, clear local state + navigate.
    try {
      await fetch("/api/user/logout", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
      });
    } catch {
      /* non-fatal */
    }

    setUser(null);
    setInstance(null);
    setIsAuthenticated(false);
    remove(STORAGE_KEYS.user);
    remove(STORAGE_KEYS.instance);
    router.push("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, instance, isAuthenticated, hydrating, login, logout }),
    [user, instance, isAuthenticated, hydrating, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
