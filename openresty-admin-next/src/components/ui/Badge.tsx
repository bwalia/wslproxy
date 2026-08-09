"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default:
    "bg-slate-100 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  primary:
    "bg-primary-100 text-primary-800 dark:bg-primary-900/40 dark:text-primary-200",
  success:
    "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200",
  warning:
    "bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200",
  danger: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200",
};

const sizeStyles: Record<NonNullable<BadgeProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-xs leading-snug",
  md: "px-2.5 py-1 text-sm leading-snug",
};

const Badge = React.memo(
  React.forwardRef<HTMLSpanElement, BadgeProps>(
    ({ variant = "default", size = "md", className, children, ...rest }, ref) => (
      <span
        ref={ref}
        className={cn(
          "inline-flex items-center rounded-full font-medium",
          variantStyles[variant],
          sizeStyles[size],
          className
        )}
        {...rest}
      >
        {children}
      </span>
    )
  )
);

Badge.displayName = "Badge";

export default Badge;
