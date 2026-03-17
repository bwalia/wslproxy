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
import type { AuthToken } from "@/types";

interface AuthContextValue {
  token: AuthToken | null;
  instance: Record<string, unknown> | null;
  isAuthenticated: boolean;
  hydrating: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const TOKEN_KEY = "token";
const INSTANCE_KEY = "instance";
const UUID_KEY = "uuid_business_id";
const TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [token, setToken] = useState<AuthToken | null>(null);
  const [instance, setInstance] = useState<Record<string, unknown> | null>(null);
  const [mounted, setMounted] = useState(false);

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(TOKEN_KEY);
      if (raw) {
        const parsed: AuthToken = JSON.parse(raw);
        if (parsed.expiryDate && parsed.expiryDate > Date.now()) {
          setToken(parsed);
        } else {
          localStorage.removeItem(TOKEN_KEY);
        }
      }
      const instRaw = localStorage.getItem(INSTANCE_KEY);
      if (instRaw) {
        setInstance(JSON.parse(instRaw));
      }
    } catch {
      /* corrupt data — ignore */
    }
    setMounted(true);
  }, []);

  const checkAuth = useCallback((): boolean => {
    if (!token) return false;
    if (token.expiryDate && token.expiryDate < Date.now()) {
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
      return false;
    }
    return true;
  }, [token]);

  const login = useCallback(
    async (email: string, password: string) => {
      const res = await fetch("/api/user/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(text || "Login failed");
      }

      const json = await res.json();
      const data = json?.data ?? json;

      const accessToken = data.accessToken ?? data.token;
      if (!accessToken) {
        throw new Error("No access token returned");
      }

      const authToken: AuthToken = {
        accessToken,
        expiryDate: Date.now() + TOKEN_TTL_MS,
      };

      localStorage.setItem(TOKEN_KEY, JSON.stringify(authToken));
      setToken(authToken);

      if (data.instance) {
        localStorage.setItem(INSTANCE_KEY, JSON.stringify(data.instance));
        setInstance(data.instance);
      }

      router.push("/");
    },
    [router],
  );

  const logout = useCallback(() => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(INSTANCE_KEY);
    localStorage.removeItem(UUID_KEY);
    setToken(null);
    setInstance(null);
    router.push("/login");
  }, [router]);

  const isAuthenticated = useMemo(() => {
    if (!mounted) return false;
    if (!token) return false;
    return token.expiryDate > Date.now();
  }, [token, mounted]);

  const hydrating = !mounted;

  const value = useMemo<AuthContextValue>(
    () => ({ token, instance, isAuthenticated, hydrating, login, logout, checkAuth }),
    [token, instance, isAuthenticated, hydrating, login, logout, checkAuth],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
