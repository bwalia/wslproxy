"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useSettings } from "@/contexts/SettingsContext";
import { env } from "@/lib/config/env";
import {
  LayoutDashboard,
  Users,
  Activity,
  HeartPulse,
  Bookmark,
  Server,
  GitBranch,
  Layers,
  KeyRound,
  Box,
  Network,
  GitPullRequest,
  FileText,
  ShieldAlert,
  ShieldCheck,
  Siren,
  ChevronLeft,
  ChevronRight,
  ScrollText,
  BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  label: string;
  // Typed route: next.config.ts `typedRoutes: true` enforces that `href`
  // resolves to a real page in the app router at build time.
  href: Route;
  icon: LucideIcon;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
}

export default function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();
  const { settings } = useSettings();

  const sections = useMemo<NavSection[]>(() => {
    const nav: NavSection[] = [
      {
        title: "Navigation",
        items: [
          { label: "Dashboard", href: "/", icon: LayoutDashboard },
          { label: "Users", href: "/users", icon: Users },
          ...(settings?.storage_type === "redis"
            ? ([
                { label: "Sessions", href: "/sessions", icon: Activity },
              ] satisfies NavItem[])
            : []),
          { label: "Logs & Troubleshoot", href: "/logs", icon: ScrollText },
          { label: "Health", href: "/health", icon: HeartPulse },
          { label: "Bookmarks", href: "/bookmarks", icon: Bookmark },
        ],
      },
      {
        title: "Configuration",
        items: [
          { label: "Topology", href: "/topology", icon: Network },
          { label: "Servers", href: "/servers", icon: Server },
          { label: "Rules", href: "/rules", icon: GitBranch },
          { label: "Profiles", href: "/profiles", icon: Layers },
          { label: "Secrets", href: "/secrets", icon: KeyRound },
          { label: "Instances", href: "/instances", icon: Box },
        ],
      },
      {
        title: "Change Management",
        items: [
          {
            label: "Change Requests",
            href: "/change-requests",
            icon: GitPullRequest,
          },
          { label: "Audit", href: "/audit", icon: FileText },
        ],
      },
      {
        title: "Security",
        items: [
          { label: "WAF Rules", href: "/waf-rules", icon: ShieldAlert },
          { label: "WAF Policies", href: "/waf-policies", icon: ShieldCheck },
          { label: "WAF Events", href: "/waf-events", icon: Siren },
        ],
      },
      {
        title: "Reference",
        items: [
          { label: "API Docs", href: "/api-docs", icon: BookOpen },
        ],
      },
    ];
    return nav;
  }, [settings?.storage_type]);

  const isActive = (href: Route) => {
    const hrefStr = href as string;
    if (hrefStr === "/") return pathname === "/";
    return pathname.startsWith(hrefStr);
  };

  return (
    <aside
      className={cn(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-slate-200 bg-white transition-all duration-300 dark:border-slate-800 dark:bg-slate-900",
        collapsed ? "w-[72px]" : "w-64",
      )}
    >
      {/* Logo area */}
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4 dark:border-slate-800">
        {collapsed ? (
          <span className="mx-auto text-xl font-bold text-primary-600 dark:text-primary-400">
            W
          </span>
        ) : (
          <span className="text-lg font-bold text-slate-900 dark:text-slate-100">
            WSL Proxy
          </span>
        )}
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300",
            collapsed && "mx-auto",
          )}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4">
        {sections.map((section, sIdx) => (
          <div key={section.title} className="mb-2">
            {!collapsed && (
              <p
                className={cn(
                  "mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-slate-400",
                  sIdx > 0 ? "mt-6" : "mt-0",
                )}
              >
                {section.title}
              </p>
            )}
            {collapsed && sIdx > 0 && (
              <div className="my-3 border-t border-slate-200 dark:border-slate-800" />
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const active = isActive(item.href);
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      title={collapsed ? item.label : undefined}
                      className={cn(
                        "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                        active
                          ? "border-l-2 border-primary-500 bg-primary-50 text-primary-700 dark:bg-primary-900/20 dark:text-primary-300"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                        collapsed && "justify-center px-0",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-5 w-5 shrink-0",
                          active && "text-primary-600 dark:text-primary-400",
                        )}
                      />
                      {!collapsed && <span>{item.label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Version footer */}
      {!collapsed && (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <p className="text-xs text-slate-400">
            v{env.appVersion} &middot; Build {env.buildNumber}
          </p>
        </div>
      )}
    </aside>
  );
}
