'use client';

import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { config } from '@/lib/config/env';

interface AuthToken {
  accessToken: string;
  expiryDate: string;
}

interface InstanceInfo {
  [key: string]: unknown;
}

interface AuthContextType {
  token: AuthToken | null;
  instance: InstanceInfo | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<AuthToken | null>(null);
  const [instance, setInstance] = useState<InstanceInfo | null>(null);

  useEffect(() => {
    const storedToken = localStorage.getItem('token');
    const storedInstance = localStorage.getItem('instance');

    if (storedToken) {
      try {
        const parsed: AuthToken = JSON.parse(storedToken);
        if (new Date(parsed.expiryDate) > new Date()) {
          setToken(parsed);
        } else {
          localStorage.removeItem('token');
        }
      } catch {
        localStorage.removeItem('token');
      }
    }

    if (storedInstance) {
      try {
        setInstance(JSON.parse(storedInstance));
      } catch {
        localStorage.removeItem('instance');
      }
    }
  }, []);

  const checkAuth = useCallback((): boolean => {
    if (!token) return false;
    return new Date(token.expiryDate) > new Date();
  }, [token]);

  const isAuthenticated = checkAuth();

  const login = useCallback(async (email: string, password: string): Promise<void> => {
    const response = await fetch(`${config.apiUrl}/user/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Login failed' }));
      throw new Error(error.message || 'Login failed');
    }

    const data = await response.json();
    const expiryDate = new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const authToken: AuthToken = {
      accessToken: data.accessToken ?? data.token,
      expiryDate,
    };

    localStorage.setItem('token', JSON.stringify(authToken));
    setToken(authToken);

    if (data.instance) {
      localStorage.setItem('instance', JSON.stringify(data.instance));
      setInstance(data.instance);
    }
  }, []);

  const logout = useCallback(() => {
    localStorage.removeItem('token');
    localStorage.removeItem('instance');
    setToken(null);
    setInstance(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, instance, isAuthenticated, login, logout, checkAuth }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextType {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
