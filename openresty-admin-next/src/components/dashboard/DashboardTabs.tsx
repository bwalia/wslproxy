"use client";

import React, { useCallback } from "react";
import {
  LayoutDashboard,
  HeartPulse,
  Lock,
  Database,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ── Types ───────────────────────────────────────────────────────────────

interface DashboardTabsProps {
  activeTab: number;
  onTabChange: (tab: number) => void;
}

interface TabItem {
  label: string;
  icon: React.ElementType;
}

// ── Constants ───────────────────────────────────────────────────────────

const tabs: TabItem[] = [
  { label: "Overview", icon: LayoutDashboard },
  { label: "Backend Health", icon: HeartPulse },
  { label: "SSL/TLS", icon: Lock },
  { label: "Cache", icon: Database },
  { label: "WAF", icon: ShieldCheck },
];

// ── Component ───────────────────────────────────────────────────────────

const DashboardTabs: React.FC<DashboardTabsProps> = ({
  activeTab,
  onTabChange,
}) => {
  const handleTabClick = useCallback(
    (index: number) => {
      onTabChange(index);
    },
    [onTabChange]
  );

  return (
    <div className="border-b border-slate-200 dark:border-slate-700">
      <nav
        className="flex overflow-x-auto scrollbar-none -mb-px"
        role="tablist"
        aria-label="Dashboard sections"
      >
        {tabs.map((tab, index) => {
          const Icon = tab.icon;
          const isActive = activeTab === index;

          return (
            <button
              key={tab.label}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={`tabpanel-${index}`}
              className={cn(
                "flex items-center gap-2 px-4 py-3 text-sm font-medium whitespace-nowrap transition-colors border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 focus-visible:ring-offset-2",
                isActive
                  ? "border-primary-500 text-primary-600 dark:text-primary-400"
                  : "border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600"
              )}
              onClick={() => handleTabClick(index)}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </nav>
    </div>
  );
};

DashboardTabs.displayName = "DashboardTabs";

export default React.memo(DashboardTabs);
