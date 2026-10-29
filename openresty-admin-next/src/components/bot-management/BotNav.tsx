"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";

/* Sub-navigation shared by the Bot Management pages (the sidebar has the
   same entries; this keeps them one click apart inside the section). */

const TABS: { label: string; href: string }[] = [
  { label: "Overview", href: "/bot-management" },
  { label: "Events", href: "/bot-management/events" },
  { label: "Settings & signals", href: "/bot-management/settings" },
  { label: "Simulator", href: "/bot-management/simulator" },
];

export default function BotNav() {
  const pathname = usePathname();
  return (
    <nav aria-label="Bot Management" className="mb-6 flex flex-wrap gap-1 border-b border-slate-200 dark:border-slate-700">
      {TABS.map((t) => {
        const active = pathname === t.href;
        return (
          <Link
            key={t.href}
            href={t.href as Route}
            aria-current={active ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "border-primary-500 text-primary-600 dark:text-primary-400"
                : "border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-200",
            )}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
