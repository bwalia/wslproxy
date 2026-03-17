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
import type { AppSettings } from "@/types";
import { dataProvider } from "@/lib/api/data-provider";

interface SettingsContextValue {
  settings: AppSettings | null;
  environment: string;
  storageType: string | undefined;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
  setEnvironment: (env: string) => void;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

const ENV_KEY = "environment";

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [environment, setEnvironmentState] = useState<string>("prod");
  const [isLoading, setIsLoading] = useState(false);

  // Hydrate environment from localStorage
  useEffect(() => {
    const stored = localStorage.getItem(ENV_KEY);
    if (stored) setEnvironmentState(stored);
  }, []);

  const storageType = useMemo(
    () => settings?.storage_type,
    [settings],
  );

  const loadSettings = useCallback(async () => {
    setIsLoading(true);
    try {
      const result = await dataProvider.loadSettings();
      setSettings(result);
    } catch {
      /* settings load failed — keep null */
    } finally {
      setIsLoading(false);
    }
  }, []);

  const setEnvironment = useCallback((env: string) => {
    localStorage.setItem(ENV_KEY, env);
    setEnvironmentState(env);
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      environment,
      storageType,
      isLoading,
      loadSettings,
      setEnvironment,
    }),
    [settings, environment, storageType, isLoading, loadSettings, setEnvironment],
  );

  return (
    <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
  );
}

export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
