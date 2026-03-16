'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { config } from '@/lib/config/env';
import { getHeaders } from '@/lib/api/client';

interface AppSettings {
  [key: string]: unknown;
}

interface SettingsContextType {
  settings: AppSettings | null;
  environment: string;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  setEnvironment: (profile: string) => void;
  setIsLoading: (loading: boolean) => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

function getStoredEnvironment(): string {
  if (typeof window === 'undefined') return 'prod';
  return localStorage.getItem('environment') ?? 'prod';
}

export function SettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [environment, setEnvironmentState] = useState<string>(getStoredEnvironment);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const loadSettings = useCallback(async (): Promise<void> => {
    try {
      const response = await fetch(`${config.apiUrl}/settings?_format=json`, {
        method: 'GET',
        headers: getHeaders(),
      });

      if (!response.ok) return;

      const json = await response.json();
      setSettings(json?.data ?? json);
    } catch {
      // Settings load is non-fatal
    }
  }, []);

  const setEnvironment = useCallback((profile: string) => {
    localStorage.setItem('environment', profile);
    setEnvironmentState(profile);
  }, []);

  return (
    <SettingsContext.Provider
      value={{ settings, environment, isLoading, loadSettings, setEnvironment, setIsLoading }}
    >
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextType {
  const context = useContext(SettingsContext);
  if (context === undefined) {
    throw new Error('useSettings must be used within a SettingsProvider');
  }
  return context;
}
