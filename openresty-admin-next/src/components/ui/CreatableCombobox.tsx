"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/* Single-value combobox with type-to-search AND type-to-create.
 *
 * The native <datalist>-backed AutocompleteInput this replaces had
 * three problems:
 *   - Safari only shows suggestions after the user starts typing.
 *     There's no visible "click to open" affordance, so users don't
 *     realise the dropdown exists.
 *   - Styling can't be themed (the popup is browser chrome).
 *   - It doesn't visually distinguish "pick existing" from "create
 *     new" — users couldn't tell whether typing a fresh value
 *     would succeed or get lost.
 *
 * This component owns its dropdown so all three are addressed:
 *   - Clear chevron + click anywhere on the trigger to open.
 *   - Searchable list of existing values.
 *   - "Create '<query>'" row at the top of the list when the query
 *     doesn't exactly match any option, so the affordance is
 *     unmistakable.
 *
 * Keyboard: ↓ to open, ↑/↓ to navigate, Enter to select, Esc to
 * close.  Mouse: click trigger to open, click option to select,
 * click outside or × to clear.
 */

export interface CreatableComboboxProps {
  /** Distinct existing values to offer.  Pre-sorted by the caller. */
  options: string[];
  /** Current value — empty string for "nothing selected". */
  value: string;
  onChange: (next: string) => void;
  label?: string;
  placeholder?: string;
  searchPlaceholder?: string;
  error?: string;
  hint?: string;
  disabled?: boolean;
  /** If false, only existing options can be selected.  Default true. */
  allowCreate?: boolean;
  /** Format the "Create new" row.  Default: `Create "{q}"`. */
  formatCreateLabel?: (query: string) => string;
  className?: string;
}

export default function CreatableCombobox({
  options,
  value,
  onChange,
  label,
  placeholder = "Select or type to create…",
  searchPlaceholder = "Search or type new…",
  error,
  hint,
  disabled,
  allowCreate = true,
  formatCreateLabel = (q) => `Create "${q}"`,
  className,
}: CreatableComboboxProps) {
  const id = React.useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;
  const listboxId = `${id}-listbox`;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  // Filtered + the synthetic "create" row decide what's in the list.
  // The create row exists only when:
  //   - allowCreate is true
  //   - query is non-empty (we don't suggest creating "" )
  //   - no existing option exactly matches the query (case-insensitive)
  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, trimmedQuery]);

  const exactMatch = useMemo(
    () =>
      filtered.some((o) => o.toLowerCase() === trimmedQuery.toLowerCase()),
    [filtered, trimmedQuery],
  );

  const showCreateRow = allowCreate && trimmedQuery.length > 0 && !exactMatch;

  // Total rows = filtered + (create row if shown).  activeIndex 0
  // points at the create row when shown, otherwise at filtered[0].
  const totalRows = filtered.length + (showCreateRow ? 1 : 0);

  // When opening, reset search + active row + focus the search field.
  // When closing, focus returns to the trigger so keyboard users
  // don't lose their place.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      const raf = requestAnimationFrame(() => searchRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  // Clamp active row if the filter shrinks the list.
  useEffect(() => {
    if (activeIndex >= totalRows) {
      setActiveIndex(Math.max(0, totalRows - 1));
    }
  }, [totalRows, activeIndex]);

  // Click outside the wrapper closes the dropdown.  We listen to
  // mousedown rather than click so a click on an option fires its
  // onClick before this listener pre-empts it.
  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const commit = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i < totalRows - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : totalRows - 1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (showCreateRow && activeIndex === 0) {
          commit(trimmedQuery);
          return;
        }
        const optionIndex = showCreateRow ? activeIndex - 1 : activeIndex;
        if (filtered[optionIndex] !== undefined) {
          commit(filtered[optionIndex]);
        }
        return;
      }
    },
    [
      activeIndex,
      commit,
      filtered,
      showCreateRow,
      totalRows,
      trimmedQuery,
    ],
  );

  return (
    <div className="space-y-1.5" ref={wrapRef}>
      {label && (
        <label
          htmlFor={id}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
      )}
      <div className="relative">
        <button
          ref={triggerRef}
          id={id}
          type="button"
          disabled={disabled}
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [errorId, hintId].filter(Boolean).join(" ") || undefined
          }
          className={cn(
            "flex w-full items-center justify-between gap-2 rounded-lg border px-3 py-2 text-left text-sm",
            "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
            "transition-colors",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
            error
              ? "border-danger-500 focus:ring-danger-500/20 focus:border-danger-500"
              : "border-slate-300 dark:border-slate-600",
            "disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
        >
          <span className={cn(!value && "text-slate-400 dark:text-slate-500")}>
            {value || placeholder}
          </span>
          <span className="flex shrink-0 items-center gap-1">
            {value && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                aria-label="Clear selection"
                onClick={(e) => {
                  // stopPropagation so the trigger's onClick doesn't
                  // immediately re-toggle the dropdown after clear.
                  e.stopPropagation();
                  onChange("");
                }}
                className="rounded-md p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </span>
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform",
                open && "rotate-180",
              )}
            />
          </span>
        </button>

        {open && (
          <div
            className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
            role="dialog"
          >
            <div className="border-b border-slate-200 p-2 dark:border-slate-700">
              <input
                ref={searchRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKey}
                placeholder={searchPlaceholder}
                className="block w-full rounded-md border-0 bg-slate-50 px-2 py-1.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-primary-500 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <ul
              id={listboxId}
              role="listbox"
              className="max-h-56 overflow-auto py-1"
            >
              {showCreateRow && (
                <li
                  role="option"
                  aria-selected={activeIndex === 0}
                  onMouseEnter={() => setActiveIndex(0)}
                  onClick={() => commit(trimmedQuery)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                    activeIndex === 0
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                      : "text-slate-700 dark:text-slate-300",
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  {formatCreateLabel(trimmedQuery)}
                </li>
              )}
              {filtered.length === 0 && !showCreateRow && (
                <li className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
                  No matches.
                </li>
              )}
              {filtered.map((opt, idx) => {
                const rowIdx = showCreateRow ? idx + 1 : idx;
                const isActive = rowIdx === activeIndex;
                const isSelected = opt === value;
                return (
                  <li
                    key={opt}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setActiveIndex(rowIdx)}
                    onClick={() => commit(opt)}
                    className={cn(
                      "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
                      isActive
                        ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                        : "text-slate-700 dark:text-slate-300",
                    )}
                  >
                    <span className="truncate">{opt}</span>
                    {isSelected && (
                      <Check className="h-3.5 w-3.5 shrink-0 text-primary-600 dark:text-primary-400" />
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
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
}
