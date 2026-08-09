"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import { Inbox } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface EmptyStateProps {
  icon?: LucideIcon;
  title?: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon: Icon = Inbox,
  title = "No data found",
  description,
  action,
  className,
}) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center py-16 text-center",
      className
    )}
  >
    <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
      <Icon
        className="h-8 w-8 text-slate-600 dark:text-slate-300"
        aria-hidden="true"
      />
    </div>
    <h3 className="font-display text-lg font-semibold text-slate-900 dark:text-slate-50">
      {title}
    </h3>
    {description && (
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-300">
        {description}
      </p>
    )}
    {action && <div className="mt-4">{action}</div>}
  </div>
);

EmptyState.displayName = "EmptyState";

export default EmptyState;
