"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { useSettings } from "@/contexts/SettingsContext";
import Sidebar from "@/components/layout/Sidebar";
import AppBar from "@/components/layout/AppBar";
import Footer from "@/components/layout/Footer";
import DashboardLoading from "./loading";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const { isAuthenticated, hydrating } = useAuth();
  const { loadSettings } = useSettings();
  const router = useRouter();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Protect route — only redirect after hydration is complete
  useEffect(() => {
    if (!hydrating && !isAuthenticated) {
      router.push("/login");
    }
  }, [hydrating, isAuthenticated, router]);

  // Load settings once authenticated
  useEffect(() => {
    if (isAuthenticated) {
      loadSettings();
    }
  }, [isAuthenticated, loadSettings]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => !prev);
  }, []);

  // Show spinner while hydrating auth state from localStorage
  if (hydrating) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-primary-600 dark:border-slate-700 dark:border-t-primary-400" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
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

        <main className="flex-1 overflow-y-auto p-6">
          <Suspense fallback={<DashboardLoading />}>{children}</Suspense>
        </main>

        <Footer />
      </div>
    </div>
  );
}
