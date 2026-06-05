"use client";

import React from "react";
import { cn } from "@/lib/utils/cn";

/* Native-datalist-backed autocomplete input.
 *
 * Why this and not a custom popover?
 *  - The browser handles the suggestion list, keyboard nav, ARIA
 *    semantics, mobile keyboard hints, and the case where the page
 *    is zoomed.  We get all of that free for ~10 LOC.
 *  - The styling tradeoff (the datalist popup is browser-chrome, not
 *    CSS-themeable) is fine for a field-level suggestion — the user's
 *    eye is on the input, not the popup.
 *
 * Limitations (intentional, documented here):
 *  - Datalist matches the WHOLE input value.  Comma-separated tag
 *    inputs don't get suggestions for the second/third tag — the
 *    callsite handles that via a separate "Suggested:" chip row.
 *  - Suggestions are case-sensitive at the value level but the
 *    browser typically does case-insensitive prefix matching for
 *    display.  Pass canonical-case strings (e.g. all lowercase) for
 *    predictable output.
 */

export interface AutocompleteInputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  /** Distinct values to offer as autocomplete suggestions.  Empty
   *  array is fine — the field falls back to a plain Input.  De-dup
   *  and case-normalise at the source; this component renders them
   *  verbatim. */
  suggestions: string[];
}

const AutocompleteInput = React.forwardRef<HTMLInputElement, AutocompleteInputProps>(
  ({ label, error, hint, id, className, suggestions, ...rest }, ref) => {
    const inputId = id || React.useId();
    const listId = `${inputId}-suggestions`;
    const errorId = error ? `${inputId}-error` : undefined;
    const hintId = hint ? `${inputId}-hint` : undefined;

    return (
      <div className="space-y-1.5">
        {label && (
          <label
            htmlFor={inputId}
            className="block text-sm font-medium text-slate-700 dark:text-slate-300"
          >
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          // Only attach the list when there are suggestions to show;
          // an empty datalist renders nothing in Chromium but
          // Firefox briefly flashes the empty popup.
          list={suggestions.length > 0 ? listId : undefined}
          className={cn(
            "block w-full rounded-lg border px-3 py-2 text-sm",
            "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
            "placeholder:text-slate-400 dark:placeholder:text-slate-500",
            "transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
            error
              ? "border-danger-500 focus:ring-danger-500/20 focus:border-danger-500"
              : "border-slate-300 dark:border-slate-600",
            "disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [errorId, hintId].filter(Boolean).join(" ") || undefined
          }
          autoComplete="off"
          {...rest}
        />
        {suggestions.length > 0 && (
          <datalist id={listId}>
            {suggestions.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        )}
        {error && (
          <p id={errorId} className="text-sm text-danger-500" role="alert">
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={hintId} className="text-sm text-slate-500 dark:text-slate-400">
            {hint}
          </p>
        )}
      </div>
    );
  },
);

AutocompleteInput.displayName = "AutocompleteInput";

export default AutocompleteInput;
