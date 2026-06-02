"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import type { LucideIcon } from "lucide-react";

/**
 * `icon` accepts two shapes:
 *
 * 1. A component reference — `icon={Settings}` — convenient for client-
 *    component callers.
 * 2. A rendered element — `icon={<Settings />}` — REQUIRED when the
 *    caller is a server component, because component references are not
 *    serializable across the server/client boundary (they are
 *    ForwardRefExoticComponent objects with `$$typeof` / `render` that
 *    cannot cross into a client component's props).
 *
 * Both render identically — if a component reference is passed the
 * default sizing/color classes are applied automatically; if a rendered
 * element is passed, the caller controls its styling.
 */
export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  icon?: LucideIcon | React.ReactElement;
  actions?: React.ReactNode;
  className?: string;
}

const DEFAULT_ICON_CLASS =
  "h-5 w-5 text-primary-600 dark:text-primary-400";

const PageHeader: React.FC<PageHeaderProps> = ({
  title,
  subtitle,
  icon,
  actions,
  className,
}) => {
  // Discriminate: rendered elements already satisfy `isValidElement`,
  // component references do not.
  const iconNode = icon
    ? React.isValidElement(icon)
      ? icon
      : React.createElement(icon as LucideIcon, {
          className: DEFAULT_ICON_CLASS,
          "aria-hidden": "true",
        })
    : null;

  return (
    <div
      className={cn(
        "mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex items-center gap-3">
        {iconNode && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30"
            aria-hidden="true"
          >
            {iconNode}
          </div>
        )}
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
};

PageHeader.displayName = "PageHeader";

export default PageHeader;
