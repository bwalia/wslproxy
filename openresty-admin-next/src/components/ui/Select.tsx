"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";
import { ChevronDown } from "lucide-react";

export interface SelectOption {
  value: string;
  label: string;
}

export interface SelectProps
  extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, "children"> {
  label?: string;
  error?: string;
  // Helper text rendered below the field — mirrors `Input`'s `hint`
  // for visual consistency.  Suppressed when an error is shown so
  // the same vertical slot doesn't render twice.
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, hint, options, placeholder, id, className, ...rest }, ref) => {
    const selectId = id || React.useId();
    const errorId = error ? `${selectId}-error` : undefined;
    const hintId = hint ? `${selectId}-hint` : undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={selectId}
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            className={cn(
              "block w-full appearance-none rounded-lg border px-3 py-2.5 pr-10 text-sm leading-normal",
              "bg-white text-slate-900 dark:bg-slate-800 dark:text-slate-100",
              "transition-colors",
              "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
              error
                ? "border-danger-500 focus:ring-danger-500/20 focus:border-danger-500"
                : "border-slate-300 dark:border-slate-600",
              "disabled:cursor-not-allowed disabled:opacity-60",
              className
            )}
            aria-invalid={error ? true : undefined}
            aria-describedby={
              [errorId, hintId].filter(Boolean).join(" ") || undefined
            }
            {...rest}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
          <ChevronDown
            className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
        </div>
        {error && (
          <p id={errorId} className="text-sm text-danger-500" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-sm leading-relaxed text-slate-600 dark:text-slate-300">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = "Select";

export default Select;
