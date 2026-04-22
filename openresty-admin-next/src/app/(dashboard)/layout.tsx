"use client";

import { Suspense, useCallback, useEffect, useState, type ReactNode } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import Sidebar from "@/components/layout/Sidebar";
import AppBar from "@/components/layout/AppBar";
import Footer from "@/components/layout/Footer";
import RouteFocusReset from "@/components/layout/RouteFocusReset";
import DashboardLoading from "./loading";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  // Auth gating is enforced by src/middleware.ts before this layout renders.
  // When reached here the user has a valid auth cookie; `useAuth` is used
  // only to fetch user/instance info and coordinate logout.
  const { isAuthenticated } = useAuth();
  const { loadSettings } = useSettings();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Load settings once the session is confirmed by /api/user/me.
  useEffect(() => {
    if (isAuthenticated) {
      loadSettings();
    }
  }, [isAuthenticated, loadSettings]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <RouteFocusReset />
      <Sidebar collapsed={sidebarCollapsed} onToggle={toggleSidebar} />

      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          sidebarCollapsed ? "ml-18" : "ml-64"
        }`}
      >
        <AppBar
          onMenuToggle={toggleSidebar}
          sidebarCollapsed={sidebarCollapsed}
        />

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 overflow-y-auto p-6 focus:outline-none"
        >
          <Suspense fallback={<DashboardLoading />}>{children}</Suspense>
        </main>

        <Footer />
      </div>
    </div>
  );
}
