"use client";

import React, { useCallback, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import { env } from "@/lib/config/env";
import { Sun, Moon, Settings, CircleUser, LogOut, KeyRound } from "lucide-react";
import ProfileSwitcher from "./ProfileSwitcher";
import SyncButton from "./SyncButton";
import StorageSelector from "./StorageSelector";

interface AppBarProps {
  sidebarCollapsed: boolean;
  onMenuToggle?: () => void;
}

export default function AppBar({ sidebarCollapsed }: AppBarProps) {
  const { logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const handleToggleMenu = useCallback(() => {
    setUserMenuOpen((prev) => !prev);
  }, []);

  const handleLogout = useCallback(() => {
    setUserMenuOpen(false);
    logout();
  }, [logout]);

  return (
    <header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
      {/* Left side - breadcrumb placeholder */}
      <div className="text-sm text-slate-500 dark:text-slate-400" />

      {/* Right side actions */}
      <div className="flex items-center gap-2">
        {/* Storage backend selector — shown for all deploys since the
            setting is global.  Matches legacy StorageButton. */}
        <StorageSelector />

        {/* Environment profile switcher — drives list filters + mutation defaults */}
        <ProfileSwitcher />

        {/* API sync button — hidden for Docker deploys (the sync
            endpoint targets a frontdoor control-plane that local
            Docker nodes don't have).  Matches legacy VITE_TARGET_PLATFORM
            gate in openresty-admin/src/AppBar.jsx:266. */}
        {env.targetPlatform !== "DOCKER" && <SyncButton />}

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggleTheme}
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </button>

        {/* Settings */}
        <Link
          href="/settings"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
          aria-label="Settings"
        >
          <Settings className="h-5 w-5" />
        </Link>

        {/* User menu */}
        <div className="relative">
          <button
            type="button"
            onClick={handleToggleMenu}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            aria-label="User menu"
          >
            <CircleUser className="h-5 w-5" />
          </button>
          {userMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setUserMenuOpen(false)}
              />
              <div className="absolute right-0 z-50 mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                <Link
                  href={"/account/password" as Route}
                  onClick={() => setUserMenuOpen(false)}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <KeyRound className="h-4 w-4" />
                  Change Password
                </Link>
                <div className="my-1 border-t border-slate-200 dark:border-slate-700" />
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                  Logout
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
