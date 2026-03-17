"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "primary" | "success" | "warning" | "danger" | "info";
  size?: "sm" | "md";
}

const variantStyles: Record<NonNullable<BadgeProps["variant"]>, string> = {
  default:
    "bg-slate-100 text-slate-700 dark:bg-slate-700 dark:text-slate-300",
  primary:
    "bg-primary-100 text-primary-700 dark:bg-primary-900/30 dark:text-primary-400",
  success:
    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
  warning:
    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  danger: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
  info: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
};

const sizeStyles: Record<NonNullable<BadgeProps["size"]>, string> = {
  sm: "px-2 py-0.5 text-xs",
  md: "px-2.5 py-0.5 text-sm",
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
