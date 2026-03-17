"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "text" | "rectangular" | "circular";
}

const variantStyles: Record<NonNullable<SkeletonProps["variant"]>, string> = {
  text: "h-4 w-full rounded",
  rectangular: "h-20 w-full rounded-lg",
  circular: "rounded-full",
};

const Skeleton: React.FC<SkeletonProps> = ({
  variant = "text",
  className,
  ...rest
}) => (
  <div
    className={cn(
      "bg-slate-200 dark:bg-slate-700 animate-pulse",
      variantStyles[variant],
      className
    )}
    aria-hidden="true"
    {...rest}
  />
);

Skeleton.displayName = "Skeleton";

export default Skeleton;
