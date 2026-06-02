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
        // `min-w-0` is required on a flex child whose content can be
        // wider than the parent — without it, the default `min-width:
        // auto` forces the column to grow to fit its widest descendant
        // (e.g. the base64-encoded `<pre>` config preview on
        // /servers/[id]), pushing the action bar and Save button far
        // off-screen to the right.
        className={`flex min-w-0 flex-1 flex-col transition-all duration-300 ${
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
          // `flex flex-col` so full-viewport pages (topology,
          // api-docs, logs/tail) can declare `flex-1` on their
          // wrapper instead of doing brittle viewport-height
          // arithmetic like `h-[calc(100vh-4rem)]` — that pattern
          // ignored the AppBar/Footer chrome and pushed the footer
          // mid-page on long content.
          //
          // No `overflow-y-auto` — the dashboard root uses
          // `min-h-screen` and the document body scrolls.  Making
          // <main> a scroll container (a) duplicates scrollbars on
          // pages taller than the viewport and (b) breaks CSS
          // `position: sticky` for elements inside pages: sticky
          // anchors to the nearest scrolling ancestor, and an
          // `overflow-y-auto` <main> qualifies even when it doesn't
          // actually scroll — so a sticky child anchors to <main>'s
          // top (which itself moves with the page scroll) instead
          // of the viewport.  Without this fix, the sticky page
          // header on /servers/[id] never sticks, the very tall
          // Nginx Server tab pushes the bottom Save button far
          // below the fold, and users conclude the button is gone.
          className="flex flex-1 flex-col p-6 focus:outline-none"
        >
          <Suspense fallback={<DashboardLoading />}>{children}</Suspense>
        </main>

        <Footer />
      </div>
    </div>
  );
}
