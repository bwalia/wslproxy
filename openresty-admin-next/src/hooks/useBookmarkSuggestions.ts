"use client";

import { useMemo } from "react";
import { useList } from "@/hooks/useResource";
import type { Bookmark } from "@/types";

interface BookmarkSuggestions {
  /** Distinct, non-empty category strings used by existing user
   *  bookmarks.  Sorted alphabetically (case-insensitive) so
   *  the dropdown is browseable. */
  categories: string[];
  /** Distinct, non-empty tag strings used by existing user bookmarks.
   *  Same sort. */
  tags: string[];
  /** Raw bookmark list backing the suggestions.  Exposed so callers
   *  that ALSO need to scan bookmarks (e.g. the dedup check in
   *  BookmarkFromServerDialog) can read from this single SWR cache
   *  instead of firing a parallel `dp.getList(...)` for the same
   *  data.  Falls back to an empty array on the first render
   *  before the fetch resolves. */
  bookmarks: Bookmark[];
  /** Pass-through loading state so the calling form can show a hint
   *  ("loading suggestions…") if it cares; usually it doesn't and
   *  just renders an empty datalist while we wait. */
  isLoading: boolean;
}

/* Pull distinct categories + tags from the existing bookmark list
 * for autocomplete suggestions.
 *
 * Why client-side aggregation rather than a dedicated backend
 * endpoint?
 *   - The bookmark list is small (~50 entries on a busy instance).
 *     Aggregating in JS is microseconds.
 *   - Avoids a second round-trip and a backend change for what's a
 *     pure-UX improvement.
 *   - SWR caches the list anyway — the page that opens the bookmark
 *     edit form is `/bookmarks`, which already populated the cache
 *     by the time the user clicks an item.
 *
 * We DELIBERATELY include lean (auto_generated) bookmarks in the
 * source set: the lean ones never carry categories/tags today
 * (api/bookmarks.lua:server_to_bookmark sets category = "" and
 * tags = empty_json_array()), so they contribute nothing — but if
 * a future change adds defaults there, the suggestion list will
 * pick them up automatically.
 */
export function useBookmarkSuggestions(): BookmarkSuggestions {
  // perPage 500 matches the dedup query in BookmarkFromServerDialog
  // — same cache key, single backend hit per dashboard session.
  const { data, isLoading } = useList<Bookmark>("bookmarks", {
    pagination: { page: 1, perPage: 500 },
  });

  return useMemo(() => {
    const cats = new Set<string>();
    const tagsSet = new Set<string>();
    for (const b of data ?? []) {
      const c = (b.category ?? "").trim();
      if (c) cats.add(c);
      // The Lua backend can return tags as either an array (normal)
      // or `{}` empty-object (the cjson empty-table ambiguity).
      // Array.isArray guards against both — non-array shapes get
      // silently skipped rather than throwing on .forEach.
      if (Array.isArray(b.tags)) {
        for (const t of b.tags) {
          if (typeof t === "string") {
            const trimmed = t.trim();
            if (trimmed) tagsSet.add(trimmed);
          }
        }
      }
    }
    const sortCI = (a: string, b: string) =>
      a.toLowerCase().localeCompare(b.toLowerCase());
    return {
      categories: Array.from(cats).sort(sortCI),
      tags: Array.from(tagsSet).sort(sortCI),
      // Expose the raw list so other callers (the dedup check) can
      // read from it without firing a second fetch for the exact
      // same SWR key.
      bookmarks: data ?? [],
      isLoading,
    };
  }, [data, isLoading]);
}
