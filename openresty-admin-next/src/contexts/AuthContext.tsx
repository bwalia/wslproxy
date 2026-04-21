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

// Non-sensitive cache of user/instance for quick UI hydration.  The JWT
// itself is NEVER stored here — it lives only in the httpOnly cookie.
const INSTANCE_KEY = "wslproxy.instance";
const USER_KEY = "wslproxy.user";

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
    try {
      const cachedInstance = localStorage.getItem(INSTANCE_KEY);
      if (cachedInstance) setInstance(JSON.parse(cachedInstance));
      const cachedUser = localStorage.getItem(USER_KEY);
      if (cachedUser) setUser(JSON.parse(cachedUser));
    } catch {
      /* corrupt data — ignore */
    }

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
            try {
              localStorage.setItem(USER_KEY, JSON.stringify(data.user));
            } catch {
              /* quota / privacy mode — non-fatal */
            }
          }
          if (data?.instance) {
            setInstance(data.instance);
            try {
              localStorage.setItem(INSTANCE_KEY, JSON.stringify(data.instance));
            } catch {
              /* non-fatal */
            }
          }
          setIsAuthenticated(true);
        } else {
          // 401 or other — session is invalid.  Middleware will redirect
          // the next protected navigation; just clear cached state here.
          setIsAuthenticated(false);
          setUser(null);
          setInstance(null);
          try {
            localStorage.removeItem(USER_KEY);
            localStorage.removeItem(INSTANCE_KEY);
          } catch {
            /* non-fatal */
          }
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
        try {
          localStorage.setItem(USER_KEY, JSON.stringify(data.user));
        } catch {
          /* non-fatal */
        }
      }
      if (data?.instance) {
        setInstance(data.instance);
        try {
          localStorage.setItem(INSTANCE_KEY, JSON.stringify(data.instance));
        } catch {
          /* non-fatal */
        }
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
    try {
      localStorage.removeItem(USER_KEY);
      localStorage.removeItem(INSTANCE_KEY);
    } catch {
      /* non-fatal */
    }
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
