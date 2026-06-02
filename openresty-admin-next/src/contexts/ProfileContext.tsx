"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import { useSWRConfig } from "swr";
import { STORAGE_KEYS, get, set, subscribe } from "@/lib/storage";

/**
 * Active environment profile (dev / int / acc / prod).
 *
 * Single place in the app that owns the "which profile am I looking at"
 * question.  Replaces ad-hoc `localStorage.getItem("environment")`
 * reads throughout the codebase.
 *
 * Behaviour:
 *  - Reads initial value from localStorage on mount (SSR-safe; renders
 *    a sensible default "prod" server-side until hydration).
 *  - Persists changes back to localStorage.
 *  - Subscribes to cross-tab `storage` events so two browser tabs stay
 *    in sync when the user switches profiles in one.
 *  - Exposes `setProfile(p)` and an `isSwitching` flag (via
 *    `useTransition`) so UI can show a pending indicator while SWR
 *    refetches list data for the new profile.
 *  - Calls `router.refresh()` after a switch so server components
 *    (e.g. the Settings/Health pages) re-fetch with the new cookie
 *    and fresh data.
 *  - Invalidates the SWR cache on switch so client components re-fetch
 *    with the new `profile_id` scope.  The dataProvider already reads
 *    the profile fresh from localStorage on each request, but SWR's
 *    cache key `[resource, params]` doesn't include the profile — so
 *    without an explicit invalidation the user would see stale data
 *    from the previous environment.
 */

const DEFAULT_PROFILE = "prod";

interface ProfileContextValue {
  profile: string;
  setProfile: (next: string) => void;
  isSwitching: boolean;
  hydrated: boolean;
}

const ProfileContext = createContext<ProfileContextValue | undefined>(undefined);

export function ProfileProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { mutate: swrMutate } = useSWRConfig();
  const [profile, setProfileState] = useState<string>(DEFAULT_PROFILE);
  const [hydrated, setHydrated] = useState(false);
  const [isSwitching, startTransition] = useTransition();

  // Hydrate from localStorage on mount.  Setting state here is safe
  // after the initial server-rendered pass — React reconciles.
  useEffect(() => {
    // One-shot migration: older code used the bare `environment` key.
    // If we find one there and nothing at the namespaced key, migrate
    // the value and delete the legacy copy so we have a single source.
    let stored = get(STORAGE_KEYS.environment);
    if (!stored && typeof window !== "undefined") {
      try {
        const legacy = window.localStorage.getItem("environment");
        if (legacy && legacy.trim()) {
          // legacy values were stored unquoted; our new storage layer
          // JSON-encodes, so pass the string through `set`.
          stored = legacy.replace(/^"|"$/g, "");
          set(STORAGE_KEYS.environment, stored);
          window.localStorage.removeItem("environment");
        }
      } catch {
        /* non-fatal */
      }
    }
    if (stored && stored !== profile) {
      setProfileState(stored);
    }
    setHydrated(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-tab sync — when another tab changes the profile, reflect it
  // here AND invalidate the SWR cache so list views refresh.
  useEffect(() => {
    return subscribe(STORAGE_KEYS.environment, (next) => {
      if (next && next !== profile) {
        setProfileState(next);
        swrMutate(() => true, undefined, { revalidate: true });
        router.refresh();
      }
    });
  }, [profile, router, swrMutate]);

  const setProfile = useCallback(
    (next: string) => {
      if (!next || next === profile) return;
      set(STORAGE_KEYS.environment, next);
      setProfileState(next);
      // Put the profile change inside a transition so SWR refetches +
      // any downstream re-renders are treated as non-urgent.
      startTransition(() => {
        // Invalidate every cached SWR fetch so client components
        // re-run their fetcher against the new profile.  `() => true`
        // matches all keys; the fetcher will re-read localStorage and
        // receive data scoped to the new profile.
        swrMutate(() => true, undefined, { revalidate: true });
        // Re-run server components too — the Settings / Health pages
        // fetch server-side and need the new profile cookie / header.
        router.refresh();
      });
    },
    [profile, router, swrMutate],
  );

  const value = useMemo<ProfileContextValue>(
    () => ({ profile, setProfile, isSwitching, hydrated }),
    [profile, setProfile, isSwitching, hydrated],
  );

  return (
    <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>
  );
}

export function useProfile(): ProfileContextValue {
  const ctx = useContext(ProfileContext);
  if (!ctx) throw new Error("useProfile must be used within ProfileProvider");
  return ctx;
}
