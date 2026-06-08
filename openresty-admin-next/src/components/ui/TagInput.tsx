"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/* Multi-value tag input: type-to-search existing tags AND
 * type-to-create new ones.
 *
 * Visual model: a Chips-with-input field — selected tags render as
 * removable chips inline with a text input.  Click anywhere in the
 * box or focus the input → dropdown of existing tags opens below.
 * Typing filters.  Enter or click commits a tag (existing or new).
 * Backspace on empty input removes the last chip.
 *
 * Why a custom component instead of the native datalist + chip-row
 * we had before:
 *   - Native datalist matches the WHOLE input value, so once the
 *     field contained "dev, prod" the browser stopped suggesting
 *     anything for the third tag.  Users couldn't browse existing
 *     tags after the first.
 *   - The previous chip-row palette only rendered tags NOT yet in
 *     the value; with zero existing tags it rendered nothing, which
 *     looked broken even though it was technically correct.
 *   - There was no visible "click to open" affordance — users were
 *     supposed to discover the chip palette by accident.
 *
 * Keyboard contract mirrors CreatableCombobox where possible: ↑/↓
 * to navigate, Enter to commit, Esc to close, Backspace on an empty
 * input to remove the last chip.
 */

export interface TagInputProps {
  /** Currently selected tags.  An empty array is fine and renders
   *  the input alone. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Existing tags to suggest in the dropdown.  Selected tags are
   *  hidden from the list automatically. */
  options: string[];
  label?: string;
  placeholder?: string;
  hint?: string;
  error?: string;
  disabled?: boolean;
  /** If false, only existing options can be added.  Default true. */
  allowCreate?: boolean;
  /** Optional cap on the number of tags. */
  maxTags?: number;
}

export default function TagInput({
  value,
  onChange,
  options,
  label,
  placeholder = "Add a tag…",
  hint,
  error,
  disabled,
  allowCreate = true,
  maxTags,
}: TagInputProps) {
  const id = React.useId();
  const errorId = error ? `${id}-error` : undefined;
  const hintId = hint ? `${id}-hint` : undefined;

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Defensive: filter out any non-string members in `value` before
  // we ever touch them with .toLowerCase() or render them.  The
  // backend SHOULD always send a clean string[] (api/bookmarks.lua's
  // ensure_tags_array() normalises shape), but bookmarks.json can
  // be hand-edited and cjson can emit ngx.null for JSON null — the
  // form should not become un-editable just because one entry got
  // corrupted.  See useBookmarkSuggestions.ts:62 for the matching
  // pattern.
  const cleanValue = useMemo(
    () => value.filter((t): t is string => typeof t === "string"),
    [value],
  );

  // Compare tags case-insensitively for "already in value" — admins
  // shouldn't be able to accidentally add "Prod" and "prod" as
  // separate tags via this component.  The original-case copy in
  // `value` is preserved on display.
  const valueLowerSet = useMemo(
    () => new Set(cleanValue.map((t) => t.toLowerCase())),
    [cleanValue],
  );

  // Available options = source options minus already-selected ones,
  // case-insensitive.  Filter further by the typed query.
  const trimmedQuery = query.trim();
  const filtered = useMemo(() => {
    const q = trimmedQuery.toLowerCase();
    const available = options.filter(
      (o) => !valueLowerSet.has(o.toLowerCase()),
    );
    if (!q) return available;
    return available.filter((o) => o.toLowerCase().includes(q));
  }, [options, trimmedQuery, valueLowerSet]);

  // Create row only when:
  //   - allowed
  //   - query non-empty
  //   - query doesn't already match an existing option exactly (no
  //     point offering "Create 'prod'" when 'prod' is in the list)
  //   - query isn't already in `value` (no duplicates)
  const exactInOptions = useMemo(
    () =>
      filtered.some((o) => o.toLowerCase() === trimmedQuery.toLowerCase()),
    [filtered, trimmedQuery],
  );
  const alreadySelected = valueLowerSet.has(trimmedQuery.toLowerCase());
  const showCreateRow =
    allowCreate &&
    trimmedQuery.length > 0 &&
    !exactInOptions &&
    !alreadySelected;

  // Use cleanValue (string-only) for limit + rendering so non-string
  // junk doesn't count against maxTags and doesn't crash the map().
  const atMax = typeof maxTags === "number" && cleanValue.length >= maxTags;
  const totalRows = filtered.length + (showCreateRow ? 1 : 0);

  // Click outside closes the dropdown.
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

  // Reset the highlighted row each time the dropdown re-opens.
  // Without this, activeIndex carries over from the previous open
  // session — user closes after navigating to row 3, re-opens, and
  // the highlight is still at row 3 (which may no longer exist if
  // the available-options list changed in between).  Mirrors the
  // open-side-effect in CreatableCombobox for consistency.
  useEffect(() => {
    if (open) setActiveIndex(0);
  }, [open]);

  // Clamp active row when the filter shrinks the list.
  useEffect(() => {
    if (activeIndex >= totalRows) {
      setActiveIndex(Math.max(0, totalRows - 1));
    }
  }, [totalRows, activeIndex]);

  const addTag = useCallback(
    (tag: string) => {
      const clean = tag.trim();
      if (!clean) return;
      if (valueLowerSet.has(clean.toLowerCase())) return;
      if (atMax) return;
      // Append to the cleaned array, not the raw `value` — this also
      // silently drops any pre-existing non-string members on the
      // first user edit, so a corrupted record gradually heals on
      // its first save instead of preserving the corruption.
      onChange([...cleanValue, clean]);
      setQuery("");
      setActiveIndex(0);
      inputRef.current?.focus();
    },
    [atMax, cleanValue, onChange, valueLowerSet],
  );

  const removeTag = useCallback(
    (tag: string) => {
      onChange(cleanValue.filter((t) => t !== tag));
    },
    [onChange, cleanValue],
  );

  const handleKey = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      // Backspace on an empty query removes the last chip.  Read
      // from `cleanValue` so a corrupted leading non-string entry
      // doesn't get "removed" via the original `value` index.
      if (e.key === "Backspace" && query.length === 0 && cleanValue.length > 0) {
        e.preventDefault();
        removeTag(cleanValue[cleanValue.length - 1]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        if (!open) setOpen(true);
        setActiveIndex((i) => (i < totalRows - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : totalRows - 1));
        return;
      }
      // Enter OR comma commits the highlighted row (or creates if
      // the create row is highlighted, or commits the raw query if
      // nothing is highlighted but allowCreate is on).
      if (e.key === "Enter" || e.key === ",") {
        e.preventDefault();
        if (showCreateRow && activeIndex === 0) {
          addTag(trimmedQuery);
          return;
        }
        const optionIndex = showCreateRow ? activeIndex - 1 : activeIndex;
        if (filtered[optionIndex] !== undefined) {
          addTag(filtered[optionIndex]);
          return;
        }
        // Nothing highlighted to commit — fall back to creating the
        // raw query if that's allowed.
        if (allowCreate && trimmedQuery) {
          addTag(trimmedQuery);
        }
      }
    },
    [
      activeIndex,
      addTag,
      allowCreate,
      cleanValue,
      filtered,
      open,
      query,
      removeTag,
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
        <div
          onClick={() => {
            if (disabled) return;
            inputRef.current?.focus();
            setOpen(true);
          }}
          className={cn(
            "flex min-h-[42px] w-full flex-wrap items-center gap-1.5 rounded-lg border bg-white px-2 py-1.5 text-sm transition-colors dark:bg-slate-800",
            "focus-within:ring-2 focus-within:ring-primary-500/20 focus-within:border-primary-500",
            error
              ? "border-danger-500 focus-within:ring-danger-500/20 focus-within:border-danger-500"
              : "border-slate-300 dark:border-slate-600",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {cleanValue.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-md bg-primary-50 px-2 py-0.5 text-xs font-medium text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
            >
              {tag}
              {!disabled && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    removeTag(tag);
                  }}
                  aria-label={`Remove ${tag}`}
                  className="rounded-full p-0.5 hover:bg-primary-100 dark:hover:bg-primary-800"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </span>
          ))}
          <input
            ref={inputRef}
            id={id}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActiveIndex(0);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={handleKey}
            disabled={disabled || atMax}
            placeholder={
              atMax
                ? `Limit of ${maxTags} reached`
                : cleanValue.length === 0
                  ? placeholder
                  : ""
            }
            aria-invalid={error ? true : undefined}
            aria-describedby={
              [errorId, hintId].filter(Boolean).join(" ") || undefined
            }
            className="flex-1 min-w-[120px] bg-transparent text-slate-900 placeholder:text-slate-400 focus:outline-none dark:text-slate-100"
          />
        </div>

        {open && !disabled && totalRows > 0 && (
          <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <ul role="listbox" className="max-h-56 overflow-auto py-1">
              {showCreateRow && (
                <li
                  role="option"
                  aria-selected={activeIndex === 0}
                  onMouseEnter={() => setActiveIndex(0)}
                  onClick={() => addTag(trimmedQuery)}
                  className={cn(
                    "flex cursor-pointer items-center gap-2 px-3 py-1.5 text-sm",
                    activeIndex === 0
                      ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                      : "text-slate-700 dark:text-slate-300",
                  )}
                >
                  <Plus className="h-3.5 w-3.5 shrink-0" />
                  Create &quot;{trimmedQuery}&quot;
                </li>
              )}
              {filtered.map((opt, idx) => {
                const rowIdx = showCreateRow ? idx + 1 : idx;
                const isActive = rowIdx === activeIndex;
                return (
                  <li
                    key={opt}
                    role="option"
                    aria-selected={false}
                    onMouseEnter={() => setActiveIndex(rowIdx)}
                    onClick={() => addTag(opt)}
                    className={cn(
                      "cursor-pointer truncate px-3 py-1.5 text-sm",
                      isActive
                        ? "bg-primary-50 text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                        : "text-slate-700 dark:text-slate-300",
                    )}
                  >
                    {opt}
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
