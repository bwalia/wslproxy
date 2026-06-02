"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Layers, Check, ChevronDown } from "lucide-react";
import { useProfile } from "@/contexts/ProfileContext";
import { useDataProvider } from "@/hooks/useResource";
import { cn } from "@/lib/utils/cn";
import type { Profile } from "@/types";

/**
 * Environment profile selector for the AppBar.
 *
 * Design notes:
 *  - Lazy-loads the profile list on first open to avoid hitting the API
 *    on every page load (it's called once per session and cached).
 *  - Fully keyboard-navigable (Tab, Enter, Escape, ArrowUp/Down).
 *  - Announces switches via `role="listbox"` + `aria-activedescendant`
 *    so screen readers track the selection.
 *  - Uses `useTransition` inside the ProfileContext so the app stays
 *    responsive while SWR refetches + server components re-render.
 */

// `acc` removed — the underlying host (187.77.179.206) was
// decommissioned, so the profile would just route to a dead env.
// The list of profiles available at runtime is still driven by
// /api/profiles; this is only used as a fallback when that fetch
// hasn't returned yet.
const FALLBACK_PROFILES = ["dev", "int", "prod"];

export default function ProfileSwitcher() {
  const { profile, setProfile, isSwitching, hydrated } = useProfile();
  const dataProvider = useDataProvider();

  const [open, setOpen] = useState(false);
  const [profiles, setProfiles] = useState<string[]>(FALLBACK_PROFILES);
  const [fetchedOnce, setFetchedOnce] = useState(false);
  const [focusIndex, setFocusIndex] = useState<number>(-1);

  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Lazy fetch on first interaction — don't pay for it on every mount.
  useEffect(() => {
    if (!open || fetchedOnce) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await dataProvider.getList<Profile>("profiles", {
          pagination: { page: 1, perPage: 100 },
        });
        if (cancelled) return;
        // If the backend returns a list of profile objects, extract `name`;
        // otherwise keep the hardcoded fallback so the switcher always works.
        const names = (result?.data ?? [])
          .map((p) => (typeof p === "string" ? p : p?.name))
          .filter((n): n is string => typeof n === "string" && n.length > 0);
        setProfiles(names.length > 0 ? names : FALLBACK_PROFILES);
      } catch {
        setProfiles(FALLBACK_PROFILES);
      } finally {
        if (!cancelled) setFetchedOnce(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fetchedOnce, dataProvider]);

  const activeIndex = useMemo(
    () => profiles.findIndex((p) => p === profile),
    [profiles, profile],
  );

  const handleSelect = useCallback(
    (next: string) => {
      setOpen(false);
      if (next !== profile) {
        setProfile(next);
      }
      // Restore focus to the trigger for keyboard users.
      buttonRef.current?.focus();
    },
    [profile, setProfile],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLUListElement>) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        buttonRef.current?.focus();
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setFocusIndex((i) => (i < profiles.length - 1 ? i + 1 : 0));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setFocusIndex((i) => (i > 0 ? i - 1 : profiles.length - 1));
        return;
      }
      if (e.key === "Home") {
        e.preventDefault();
        setFocusIndex(0);
        return;
      }
      if (e.key === "End") {
        e.preventDefault();
        setFocusIndex(profiles.length - 1);
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (focusIndex >= 0 && focusIndex < profiles.length) {
          handleSelect(profiles[focusIndex]);
        }
      }
    },
    [profiles, focusIndex, handleSelect],
  );

  // When the menu opens: highlight the current profile and move keyboard
  // focus to the list so ArrowUp/Down/Enter/Escape work immediately.
  useEffect(() => {
    if (open) {
      setFocusIndex(activeIndex >= 0 ? activeIndex : 0);
      // Defer focus until the element is in the DOM.
      requestAnimationFrame(() => listRef.current?.focus());
    } else {
      setFocusIndex(-1);
    }
  }, [open, activeIndex]);

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={!hydrated}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Environment profile: ${profile}. Click to switch.`}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors",
          "hover:border-slate-300 hover:bg-slate-50",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2",
          "dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700 dark:focus-visible:ring-offset-slate-900",
          isSwitching && "cursor-progress opacity-70",
        )}
      >
        <Layers className="h-4 w-4 text-slate-400" aria-hidden="true" />
        <span className="font-mono text-xs uppercase tracking-wide">{profile}</span>
        <ChevronDown
          className={cn(
            "h-3.5 w-3.5 text-slate-400 transition-transform",
            open && "rotate-180",
          )}
          aria-hidden="true"
        />
      </button>

      {open && (
        <>
          {/* Click-outside catch — clicks outside the menu close it. */}
          <div
            className="fixed inset-0 z-40"
            onClick={() => setOpen(false)}
            aria-hidden="true"
          />
          <ul
            ref={listRef}
            role="listbox"
            tabIndex={-1}
            aria-label="Select environment profile"
            aria-activedescendant={
              focusIndex >= 0 ? `profile-option-${profiles[focusIndex]}` : undefined
            }
            onKeyDown={handleKeyDown}
            className="absolute right-0 z-50 mt-1 min-w-40 overflow-hidden rounded-lg border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          >
            {profiles.map((p, idx) => {
              const isActive = p === profile;
              const isFocused = idx === focusIndex;
              return (
                <li
                  key={p}
                  id={`profile-option-${p}`}
                  role="option"
                  aria-selected={isActive}
                  onClick={() => handleSelect(p)}
                  onMouseEnter={() => setFocusIndex(idx)}
                  className={cn(
                    "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm",
                    isFocused
                      ? "bg-slate-100 dark:bg-slate-800"
                      : "hover:bg-slate-50 dark:hover:bg-slate-800/70",
                    isActive
                      ? "font-semibold text-primary-600 dark:text-primary-400"
                      : "text-slate-700 dark:text-slate-200",
                  )}
                >
                  <span className="font-mono text-xs uppercase tracking-wide">
                    {p}
                  </span>
                  {isActive && <Check className="h-4 w-4" aria-hidden="true" />}
                </li>
              );
            })}
          </ul>
        </>
      )}
    </div>
  );
}
