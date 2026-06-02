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

/**
 * Global app settings (read-only cache of `GET /api/global/settings`).
 *
 * Environment profile is NO LONGER owned here — that's `ProfileContext`.
 * This context is purely for instance-wide settings the UI needs to
 * know about (e.g. `storage_type` decides whether `/sessions` is shown).
 */
interface SettingsContextValue {
  settings: AppSettings | null;
  storageType: string | undefined;
  isLoading: boolean;
  loadSettings: () => Promise<void>;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const storageType = useMemo(() => settings?.storage_type, [settings]);

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

  const value = useMemo<SettingsContextValue>(
    () => ({ settings, storageType, isLoading, loadSettings }),
    [settings, storageType, isLoading, loadSettings],
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
