"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import CreatableCombobox from "@/components/ui/CreatableCombobox";
import TagInput from "@/components/ui/TagInput";
import Textarea from "@/components/ui/Textarea";
import { useSWRConfig } from "swr";
import { useDataProvider } from "@/hooks/useResource";
import { useBookmarkSuggestions } from "@/hooks/useBookmarkSuggestions";
import { useNotification } from "@/contexts/NotificationContext";

interface BookmarkFromServerDialogProps {
  open: boolean;
  onClose: () => void;
  /* The server's domain — used as the host AND the basis of the URL.
   * Coming straight from the server form's `server_name` so the user
   * doesn't have to retype it. */
  serverName: string;
  /* Profile to attach the bookmark to — falls back to the global
   * profile context when omitted by the caller.  Both the server and
   * its bookmark should live in the same env profile. */
  profileId?: string;
}

/* Quick-create dialog launched from the server form.  Three jobs:
 *
 *   1. Pre-fill host + URL from the server's domain (the whole reason
 *      this exists — bookmarking a server you just configured is a
 *      common follow-up and retyping the domain is friction).
 *
 *   2. Refuse to create a duplicate.  The Lua backend doesn't enforce
 *      uniqueness on bookmark host, so without a client-side check
 *      every "Create Bookmark" click would silently add another row.
 *      We do an exact-host match against the user's existing
 *      bookmarks before submit.
 *
 *   3. Be a one-click action in the common case.  Title + URL are
 *      pre-filled; the only field the user is forced to think about
 *      is the public toggle (and it defaults to off — never publish
 *      without the user explicitly asking).
 */
export default function BookmarkFromServerDialog({
  open,
  onClose,
  serverName,
  profileId,
}: BookmarkFromServerDialogProps) {
  const dp = useDataProvider();
  const { notify } = useNotification();
  // Global SWR mutator — used after a successful POST to invalidate
  // every cached `useList("bookmarks", ...)` entry so the next form
  // open immediately sees the new category / tag in its autocomplete.
  // Without this, the suggestions hook's own SWR key (perPage: 500)
  // stays at last-seen state while the bookmark list page's key
  // (paginated, sorted, filtered) revalidates independently — leading
  // to "I just created category X and it's not in the dropdown" bugs.
  const { mutate: globalMutate } = useSWRConfig();
  // Distinct categories + tags from existing bookmarks, powering the
  // autocomplete dropdowns + the "suggested tag" chip row.  Solves
  // the "every save creates a new typo'd category" problem — admins
  // pick from what already exists instead of retyping.
  //
  // We ALSO consume the underlying `bookmarks` array here for the
  // dedup check below.  Both the dedup and suggestions need the same
  // /api/bookmarks?perPage=500 payload — pulling them through one
  // hook means one SWR cache key and one network fetch per modal
  // open instead of two.
  const {
    categories: catSuggestions,
    tags: tagSuggestions,
    bookmarks: allBookmarks,
    isLoading: suggestionsLoading,
  } = useBookmarkSuggestions();

  // Default URL: HTTPS scheme assumed.  If the server is HTTP-only
  // (unusual), the user can edit the URL field before submit.  We
  // don't try to detect the scheme from `server.listens` here because
  // a server with both :80 and :443 still bookmarks naturally to the
  // https URL — that's the externally-facing one users want.
  const initialTitle = serverName;
  const initialUrl = serverName ? `https://${serverName}` : "";

  const [form, setForm] = useState<{
    title: string;
    url: string;
    category: string;
    description: string;
    // Multi-value: `TagInput` owns chip rendering + dropdown.  The
    // string[] is the source of truth — no more comma-separated
    // string in-form state.  Conversion still happens at the
    // backend boundary on save.
    tags: string[];
    isPublic: boolean;
  }>({
    title: initialTitle,
    url: initialUrl,
    category: "",
    description: "",
    tags: [],
    isPublic: false,
  });
  const [saving, setSaving] = useState(false);

  // Reset form fields each time the modal opens with a different
  // server.  Without this, the user could close, change the
  // server_name field, re-open, and see stale prefills.  Pure
  // form-state work — the dedup result is derived separately
  // below from the shared bookmarks list.
  useEffect(() => {
    if (!open) return;
    setForm({
      title: serverName,
      url: serverName ? `https://${serverName}` : "",
      category: "",
      description: "",
      tags: [],
      isPublic: false,
    });
  }, [open, serverName]);

  // Duplicate-check derived synchronously from the shared bookmark
  // list (which `useBookmarkSuggestions` already fetches).  Returns:
  //   - undefined  → still loading; UI shows "Checking…"
  //   - null       → no duplicate, Create button enabled
  //   - string id  → existing user bookmark found, "Open existing"
  //
  // CRITICAL: only USER bookmarks count as duplicates.  The
  // /api/bookmarks endpoint (api/bookmarks.lua: get_merged_bookmarks)
  // synthesises a "lean" virtual bookmark for every saved server —
  // those entries come back with `auto_generated: true` and exist
  // only because the server does.  Matching against them would make
  // the modal refuse to ever create a real bookmark for the very
  // server it's bookmarking.  We only dedup against
  // `auto_generated === false` entries — humans who saved manually.
  const existing = useMemo<string | null | undefined>(() => {
    if (!serverName) return null;
    if (suggestionsLoading) return undefined;
    const target = serverName.toLowerCase();
    const hit = allBookmarks.find(
      (b) =>
        b.auto_generated === false &&
        ((b.host ?? "").toLowerCase() === target ||
          // Also catch the case where a previous quick-create
          // stored the full URL as the host (older shape).
          normaliseHost(b.url) === target),
    );
    return hit?.id ?? null;
  }, [serverName, suggestionsLoading, allBookmarks]);

  // Generic field setter typed by the form shape so TS catches
  // mismatches (e.g. passing a number where a string is expected).
  // tags + isPublic are non-string so we keep the value param wide.
  const handleChange = useCallback(
    <K extends keyof typeof form>(field: K, value: (typeof form)[K]) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    if (existing) {
      // Belt-and-suspender — UI normally hides the Save button when
      // `existing` is set, but the user could have already clicked
      // before the check resolved.
      notify("This server is already bookmarked.", { type: "info" });
      return;
    }
    if (!form.title.trim() || !form.url.trim()) {
      notify("Title and URL are required.", { type: "error" });
      return;
    }
    setSaving(true);
    try {
      await dp.create("bookmarks", {
        title: form.title.trim(),
        host: serverName,
        url: form.url.trim(),
        category: form.category.trim(),
        description: form.description.trim(),
        // Already a clean string[] from TagInput — no split needed.
        // Trim and filter defensively in case a future caller passes
        // a value containing whitespace.
        tags: form.tags.map((t) => t.trim()).filter(Boolean),
        public: form.isPublic,
        ...(profileId ? { profile_id: profileId } : {}),
        // Mark as quick-created from a server so future tooling
        // (analytics, cleanup scripts) can distinguish hand-curated
        // bookmarks from these auto-generated ones.
        auto_generated: true,
      });
      notify("Bookmark created.", { type: "success" });
      onClose();
    } catch (err) {
      notify((err as Error)?.message ?? "Failed to create bookmark.", {
        type: "error",
      });
    } finally {
      setSaving(false);
      // Drop every cached `useList("bookmarks", ...)` entry — covers
      // the dedup query, the suggestions hook, the admin list page,
      // the dashboard's RecentBookmarks widget.  SWR keys are
      // `[resource, JSON.stringify(params)]` arrays so we match on
      // the first element.  revalidate:true re-fetches active
      // subscribers immediately; inactive ones revalidate on next
      // mount.
      //
      // In `finally` so it ALSO runs on the error path: the user's
      // SWR cache might be stale before they save (someone else
      // edited a category from another session), they hit Save,
      // backend returns 4xx, the autocomplete on the next retry
      // would still show the stale list — defeating the whole
      // point of the cache fix.  Refetching after a failed write
      // is cheap (~50 entries) and removes the gotcha.
      globalMutate(
        (key) => Array.isArray(key) && key[0] === "bookmarks",
        undefined,
        { revalidate: true },
      );
    }
  }, [existing, form, serverName, profileId, dp, globalMutate, notify, onClose]);

  const checking = existing === undefined;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Create Bookmark"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          {existing ? (
            <Button
              variant="secondary"
              onClick={() => {
                window.open(`/bookmarks/${existing}`, "_blank", "noopener");
              }}
              icon={<ExternalLink className="h-4 w-4" />}
            >
              Open existing
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              loading={saving}
              disabled={checking || !form.title.trim() || !form.url.trim()}
              icon={<Bookmark className="h-4 w-4" />}
            >
              Create
            </Button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {existing && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-900/10 dark:text-amber-200">
            A bookmark for <span className="font-semibold">{serverName}</span>{" "}
            already exists. Open it instead — creating another would just
            duplicate the entry.
          </div>
        )}
        {checking && !existing && (
          <div className="text-xs text-slate-500 dark:text-slate-400">
            Checking for existing bookmark…
          </div>
        )}

        <Input
          label="Title"
          value={form.title}
          onChange={(e) => handleChange("title", e.target.value)}
          disabled={!!existing}
          hint="What this bookmark shows up as in the bookmarks list."
        />

        <Input
          label="URL"
          value={form.url}
          onChange={(e) => handleChange("url", e.target.value)}
          disabled={!!existing}
          hint="Where clicking the bookmark takes you. HTTPS is assumed by default."
        />

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <CreatableCombobox
            label="Category (optional)"
            value={form.category}
            onChange={(v) => handleChange("category", v)}
            disabled={!!existing}
            placeholder="Pick or type to create…"
            options={catSuggestions}
            hint={
              catSuggestions.length > 0
                ? "Click to pick from existing, or type to create a new one."
                : "Type to create the first category."
            }
          />
          <TagInput
            label="Tags (optional)"
            value={form.tags}
            onChange={(v) => handleChange("tags", v)}
            disabled={!!existing}
            options={tagSuggestions}
            placeholder="Click and pick or type…"
            hint={
              tagSuggestions.length > 0
                ? "Click to browse existing tags, or type to create a new one."
                : "Type a tag and press Enter to add it."
            }
          />
        </div>

        <Textarea
          label="Description (optional)"
          value={form.description}
          onChange={(e) => handleChange("description", e.target.value)}
          disabled={!!existing}
          rows={2}
          placeholder="What this server does. Shows on the bookmark card."
        />

        <label className="flex items-start gap-3 rounded-lg border border-slate-200 px-4 py-3 cursor-pointer hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/50">
          <input
            type="checkbox"
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            checked={form.isPublic}
            disabled={!!existing}
            onChange={(e) => handleChange("isPublic", e.target.checked)}
          />
          <div className="text-sm">
            <div className="font-medium text-slate-900 dark:text-slate-100">
              Make public
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Public bookmarks are listed at <code>/links</code> without
              authentication. Leave off for internal-only links.
            </p>
          </div>
        </label>
      </div>
    </Dialog>
  );
}

/* Drop the scheme + path so we compare apples to apples against
 * `server_name`.  Returns "" for anything unparseable so the dedup
 * check just doesn't match (vs throwing or matching wrongly). */
function normaliseHost(raw: string | undefined): string {
  if (!raw) return "";
  try {
    // URL() expects a scheme — graft one on if missing so the parser
    // doesn't reject bare `example.com/foo`.
    const withScheme = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
    return new URL(withScheme).hostname.toLowerCase();
  } catch {
    return "";
  }
}
