"use client";

import type { ReactNode } from "react";
import { SWRConfig } from "swr";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { SettingsProvider } from "@/contexts/SettingsContext";
import { NotificationProvider } from "@/contexts/NotificationContext";

export default function Providers({ children }: { children: ReactNode }) {
  return (
    <SWRConfig
      value={{
        revalidateOnFocus: false,
        dedupingInterval: 5000,
        errorRetryCount: 3,
      }}
    >
      <ThemeProvider>
        <AuthProvider>
          <SettingsProvider>
            <NotificationProvider>{children}</NotificationProvider>
          </SettingsProvider>
        </AuthProvider>
      </ThemeProvider>
    </SWRConfig>
  );
}
