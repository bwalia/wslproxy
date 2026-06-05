"use client";

import { useCallback, useEffect, useState } from "react";
import { Bookmark, ExternalLink } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Textarea from "@/components/ui/Textarea";
import { useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import type { Bookmark as BookmarkType } from "@/types";

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

  // Default URL: HTTPS scheme assumed.  If the server is HTTP-only
  // (unusual), the user can edit the URL field before submit.  We
  // don't try to detect the scheme from `server.listens` here because
  // a server with both :80 and :443 still bookmarks naturally to the
  // https URL — that's the externally-facing one users want.
  const initialTitle = serverName;
  const initialUrl = serverName ? `https://${serverName}` : "";

  const [form, setForm] = useState({
    title: initialTitle,
    url: initialUrl,
    category: "",
    description: "",
    tags: "",
    isPublic: false,
  });
  const [saving, setSaving] = useState(false);
  // `existing` is the bookmark id that already covers this host.
  // Populated by the duplicate-check fetch each time the modal opens.
  // null = no duplicate found; undefined = check hasn't completed yet.
  const [existing, setExisting] = useState<string | null | undefined>(
    undefined,
  );

  // Reset form + re-run dedup check every time the modal opens with a
  // different server.  Without this, the user could close, change the
  // server_name field, re-open, and see stale prefills.
  useEffect(() => {
    if (!open) return;
    setForm({
      title: serverName,
      url: serverName ? `https://${serverName}` : "",
      category: "",
      description: "",
      tags: "",
      isPublic: false,
    });
    setExisting(undefined);
    if (!serverName) {
      setExisting(null);
      return;
    }
    // Fetch ALL bookmarks (small set in practice) and look for an
    // exact host match.  We don't pass a `filter: { host }` because
    // the Lua backend's list endpoint doesn't filter on this field —
    // it'd silently return everything anyway, masking the intent.
    //
    // CRITICAL: only USER bookmarks count as duplicates.  The
    // /api/bookmarks endpoint (api/bookmarks.lua: get_merged_bookmarks)
    // synthesises a "lean" virtual bookmark for every saved server —
    // those entries come back with `auto_generated: true` and exist
    // only because the server does.  If we treated them as duplicates,
    // the modal would refuse to ever create a real bookmark (the lean
    // entry for the very server we're trying to bookmark is always
    // present!).  We only dedup against `auto_generated === false`
    // entries — i.e. ones a human explicitly saved before.
    let cancelled = false;
    dp.getList<BookmarkType>("bookmarks", { pagination: { page: 1, perPage: 500 } })
      .then((res) => {
        if (cancelled) return;
        const hit = (res.data ?? []).find(
          (b) =>
            b.auto_generated === false &&
            ((b.host ?? "").toLowerCase() === serverName.toLowerCase() ||
              // Also catch the case where a previous quick-create
              // stored the full URL as the host (older shape).
              // Compare hosts out of both fields, defensively.
              normaliseHost(b.url) === serverName.toLowerCase()),
        );
        setExisting(hit?.id ?? null);
      })
      .catch(() => {
        // Bookmarks list failed — don't block the user; just skip the
        // dedup check.  Worst case is one duplicate row.
        if (!cancelled) setExisting(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, serverName, dp]);

  const handleChange = useCallback(
    (field: keyof typeof form, value: string | boolean) => {
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
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
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
    }
  }, [existing, form, serverName, profileId, dp, notify, onClose]);

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
          <Input
            label="Category (optional)"
            value={form.category}
            onChange={(e) => handleChange("category", e.target.value)}
            disabled={!!existing}
            placeholder="e.g. internal, customer, demo"
          />
          <Input
            label="Tags (optional)"
            value={form.tags}
            onChange={(e) => handleChange("tags", e.target.value)}
            disabled={!!existing}
            placeholder="comma, separated"
            hint="Comma-separated. Used for filtering on the bookmarks page."
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
