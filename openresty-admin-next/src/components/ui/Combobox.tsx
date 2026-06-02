"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Check, ChevronDown, X, Search } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Searchable single-select combobox.
 *
 * Why this exists:
 *  - Native `<select>` doesn't support search / filter — becomes unusable
 *    past ~30 options (we routinely have 100+ rules).
 *  - Keeps the same keyboard / ARIA contract as the rest of the UI
 *    (see ProfileSwitcher for the pattern) so power users don't need
 *    a mouse.
 *
 * Design:
 *  - Click the trigger → listbox opens with a search field at the top.
 *  - Typing filters options by substring on `label` (case-insensitive).
 *  - Arrow up/down moves the visual highlight; Enter selects; Esc closes.
 *  - Outside click closes; focus returns to the trigger.
 */

export interface ComboboxOption {
  value: string;
  label: string;
}

export interface ComboboxProps {
  /** Available options — filtered in place as the user types. */
  options: ComboboxOption[];
  /** Currently selected option value, or empty string for "nothing selected". */
  value: string;
  onChange: (next: string) => void;
  /** Field label rendered above the trigger. */
  label?: string;
  /** Placeholder shown inside the trigger when `value` is empty. */
  placeholder?: string;
  /** Placeholder for the search input inside the dropdown. */
  searchPlaceholder?: string;
  /** Optional error string — styled red, announced via aria-describedby. */
  error?: string;
  /** Optional hint text below the trigger. */
  hint?: string;
  /** Disable the whole control. */
  disabled?: boolean;
  /** Show a "Clear" (×) button inside the trigger when a value is selected. */
  clearable?: boolean;
  /** Message shown inside the listbox when search yields zero hits. */
  emptyMessage?: string;
  /** Stable id — auto-generated if omitted. */
  id?: string;
  /** Additional class names for the trigger. */
  className?: string;
  /** Max height of the listbox — default keeps it fitting most laptops. */
  listboxMaxHeight?: string;
}

export default function Combobox({
  options,
  value,
  onChange,
  label,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  error,
  hint,
  disabled,
  clearable = true,
  emptyMessage = "No matches",
  id,
  className,
  listboxMaxHeight = "max-h-64",
}: ComboboxProps) {
  const comboId = React.useId();
  const triggerId = id ?? comboId;
  const listboxId = `${triggerId}-listbox`;
  const errorId = error ? `${triggerId}-error` : undefined;
  const hintId = hint ? `${triggerId}-hint` : undefined;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Filtered options — case-insensitive substring match on label.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const selected = useMemo(
    () => options.find((o) => o.value === value),
    [options, value],
  );

  // When opening, reset the search and focus the search field.  When
  // closing, restore focus to the trigger so keyboard users don't lose
  // their place.
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      const raf = requestAnimationFrame(() => searchInputRef.current?.focus());
      return () => cancelAnimationFrame(raf);
    }
  }, [open]);

  // Clamp active index when the filter shrinks the list.
  useEffect(() => {
    if (activeIndex >= filtered.length) {
      setActiveIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, activeIndex]);

  // Keep the highlighted option in view when arrow-navigating.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>(
      `[data-combobox-option-index="${activeIndex}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open, filtered.length]);

  const handleSelect = useCallback(
    (next: string) => {
      onChange(next);
      setOpen(false);
      triggerRef.current?.focus();
    },
    [onChange],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement | HTMLUListElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i < filtered.length - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : filtered.length - 1));
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setActiveIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setActiveIndex(filtered.length - 1);
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        const pick = filtered[activeIndex];
        if (pick) handleSelect(pick.value);
      }
    },
    [filtered, activeIndex, handleSelect],
  );

  const handleClear = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation();
      onChange("");
      triggerRef.current?.focus();
    },
    [onChange],
  );

  return (
    <div className="space-y-1.5">
      {label && (
        <label
          htmlFor={triggerId}
          className="block text-sm font-medium text-slate-700 dark:text-slate-300"
        >
          {label}
        </label>
      )}

      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          id={triggerId}
          onClick={() => !disabled && setOpen((o) => !o)}
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-controls={open ? listboxId : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            [errorId, hintId].filter(Boolean).join(" ") || undefined
          }
          className={cn(
            "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left text-sm transition-colors",
            "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
            "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
            error
              ? "border-danger-500 focus:ring-danger-500/20 focus:border-danger-500"
              : "border-slate-300 dark:border-slate-600",
            "disabled:cursor-not-allowed disabled:opacity-60",
            className,
          )}
        >
          <span
            className={cn(
              "truncate",
              !selected && "text-slate-400 dark:text-slate-500",
            )}
          >
            {selected ? selected.label : placeholder}
          </span>
          <span className="ml-2 flex shrink-0 items-center gap-1">
            {clearable && selected && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                onClick={handleClear}
                aria-label="Clear selection"
                className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            )}
            <ChevronDown
              className={cn(
                "h-4 w-4 text-slate-400 transition-transform",
                open && "rotate-180",
              )}
              aria-hidden="true"
            />
          </span>
        </button>

        {open && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setOpen(false)}
              aria-hidden="true"
            />
            <div
              className={cn(
                "absolute left-0 right-0 z-50 mt-1 overflow-hidden rounded-lg border bg-white shadow-lg",
                "border-slate-200 dark:border-slate-700 dark:bg-slate-900",
              )}
            >
              <div className="border-b border-slate-200 p-2 dark:border-slate-700">
                <div className="relative">
                  <Search
                    className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400"
                    aria-hidden="true"
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setActiveIndex(0);
                    }}
                    onKeyDown={handleKeyDown}
                    placeholder={searchPlaceholder}
                    aria-label="Filter options"
                    aria-controls={listboxId}
                    aria-activedescendant={
                      filtered[activeIndex]
                        ? `${listboxId}-option-${activeIndex}`
                        : undefined
                    }
                    className="w-full rounded border border-slate-200 bg-white py-1 pl-7 pr-2 text-sm text-slate-900 outline-none focus:border-primary-500 focus:ring-1 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  />
                </div>
              </div>
              <ul
                ref={listRef}
                id={listboxId}
                role="listbox"
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                className={cn("overflow-y-auto py-1", listboxMaxHeight)}
              >
                {filtered.length === 0 ? (
                  <li className="px-3 py-2 text-sm italic text-slate-400 dark:text-slate-500">
                    {emptyMessage}
                  </li>
                ) : (
                  filtered.map((opt, idx) => {
                    const isActive = idx === activeIndex;
                    const isSelected = opt.value === value;
                    return (
                      <li
                        key={opt.value}
                        id={`${listboxId}-option-${idx}`}
                        role="option"
                        aria-selected={isSelected}
                        data-combobox-option-index={idx}
                        onClick={() => handleSelect(opt.value)}
                        onMouseEnter={() => setActiveIndex(idx)}
                        className={cn(
                          "flex cursor-pointer items-center justify-between gap-2 px-3 py-1.5 text-sm",
                          isActive
                            ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                            : "text-slate-700 dark:text-slate-200",
                          isSelected && "font-semibold",
                        )}
                      >
                        <span className="truncate">{opt.label}</span>
                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-primary-600 dark:text-primary-400" aria-hidden="true" />
                        )}
                      </li>
                    );
                  })
                )}
              </ul>
            </div>
          </>
        )}
      </div>

      {hint && !error && (
        <p id={hintId} className="text-xs text-slate-500 dark:text-slate-400">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-sm text-danger-500" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
