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
    // Header layout shrinks gracefully:
    //   - up to lg: title + actions stack vertically (actions get
    //     their own row so wide button bars don't compete with the
    //     title for horizontal space).
    //   - lg+: side-by-side row; actions hug the right edge.
    //   - `min-w-0` on both halves is essential — without it flex
    //     children refuse to shrink below their intrinsic content
    //     width and the title pushes everything off-screen.
    //   - actions wrap (`flex-wrap`) when they still don't fit on
    //     the row, so a 4-button bar (Back / Purge / Delete / Save)
    //     drops cleanly onto a second line instead of overflowing.
    <div
      className={cn(
        "mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between",
        className,
      )}
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {iconNode && (
          <div
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 dark:bg-primary-900/30"
            aria-hidden="true"
          >
            {iconNode}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="font-display truncate text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-50 sm:text-[1.75rem]">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
              {subtitle}
            </p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2 lg:shrink-0 lg:justify-end">
          {actions}
        </div>
      )}
    </div>
  );
};

PageHeader.displayName = "PageHeader";

export default PageHeader;
