"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

export interface StatusBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement> {
  status: string;
  size?: "sm" | "md";
}

type StatusVariant = "success" | "danger" | "warning" | "info" | "default";

const statusMap: Record<string, StatusVariant> = {
  active: "success",
  enabled: "success",
  healthy: "success",
  approved: "success",
  inactive: "danger",
  disabled: "danger",
  down: "danger",
  rejected: "danger",
  error: "danger",
  block: "danger",
  pending: "warning",
  pending_approval: "warning",
  monitor: "info",
  degraded: "info",
};

const variantStyles: Record<StatusVariant, { badge: string; dot: string }> = {
  success: {
    badge:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    dot: "bg-green-500",
  },
  danger: {
    badge: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    dot: "bg-red-500",
  },
  warning: {
    badge:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    dot: "bg-amber-500",
  },
  info: {
    badge: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  default: {
    badge:
      "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
    dot: "bg-slate-400",
  },
};

const sizeStyles: Record<NonNullable<StatusBadgeProps["size"]>, { badge: string; dot: string }> = {
  sm: { badge: "px-2 py-0.5 text-xs gap-1.5", dot: "h-1.5 w-1.5" },
  md: { badge: "px-2.5 py-0.5 text-sm gap-1.5", dot: "h-2 w-2" },
};

function formatStatus(status: string): string {
  return status
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

const StatusBadge = React.memo(
  React.forwardRef<HTMLSpanElement, StatusBadgeProps>(
    ({ status, size = "sm", className, ...rest }, ref) => {
      const variant: StatusVariant =
        statusMap[status.toLowerCase()] || "default";
      const styles = variantStyles[variant];
      const sizes = sizeStyles[size];

      return (
        <span
          ref={ref}
          className={cn(
            "inline-flex items-center rounded-full font-medium",
            styles.badge,
            sizes.badge,
            className
          )}
          {...rest}
        >
          <span
            className={cn("shrink-0 rounded-full", styles.dot, sizes.dot)}
            aria-hidden="true"
          />
          {formatStatus(status)}
        </span>
      );
    }
  )
);

StatusBadge.displayName = "StatusBadge";

export default StatusBadge;
