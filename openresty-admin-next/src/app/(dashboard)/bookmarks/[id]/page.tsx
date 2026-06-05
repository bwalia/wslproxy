"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, Bookmark, Globe2 } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import AutocompleteInput from "@/components/ui/AutocompleteInput";
import { useBookmarkSuggestions } from "@/hooks/useBookmarkSuggestions";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import FetchErrorState from "@/components/ui/FetchErrorState";
import type { Bookmark as BookmarkType } from "@/types";

export default function BookmarkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  // Distinct categories + tags from existing bookmarks, used to
  // power the autocomplete dropdowns on the form below.  Stops the
  // form from generating typo-twins ("demo" / "Demo" / "demos") on
  // every save.
  const { categories: catSuggestions, tags: tagSuggestions } =
    useBookmarkSuggestions();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading, error, mutate } = useOne<BookmarkType>(
    isCreate ? null : "bookmarks",
    isCreate ? null : id,
  );

  const [form, setForm] = useState({
    title: "",
    host: "",
    url: "",
    category: "",
    description: "",
    tags: "",
    isPublic: false,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        title: data.title ?? "",
        host: data.host ?? "",
        url: data.url ?? "",
        category: data.category ?? "",
        description: data.description ?? "",
        // Lua's cjson serialises empty arrays as `{}` rather than
        // `[]`, so `data.tags ?? []` isn't enough — `{}.join` throws
        // `tags.join is not a function`.
        tags: (Array.isArray(data.tags) ? data.tags : []).join(", "),
        isPublic: data.public === true,
      });
    }
  }, [data]);

  const handleChange = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleTogglePublic = useCallback(() => {
    setForm((prev) => ({ ...prev, isPublic: !prev.isPublic }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      // Re-shape the controlled form to the wire format.  `isPublic`
      // is the local UI-friendly name; the Lua backend stores it as
      // `public`, so we translate at the boundary.
      const { isPublic, ...rest } = form;
      const payload = {
        ...rest,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
        public: isPublic,
      };
      if (isCreate) {
        await dataProvider.create("bookmarks", payload);
        notify("Bookmark created successfully", { type: "success" });
      } else {
        await dataProvider.update("bookmarks", id, payload);
        notify("Bookmark updated successfully", { type: "success" });
      }
      router.push("/bookmarks");
    } catch (err) {
      notify((err as Error).message || "Failed to save bookmark", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, form, id, dataProvider, notify, router]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("bookmarks", id);
      notify("Bookmark deleted successfully", { type: "success" });
      router.push("/bookmarks");
    } catch (err) {
      notify((err as Error).message || "Failed to delete bookmark", {
        type: "error",
      });
    } finally {
      setDeleting(false);
      setShowDelete(false);
    }
  }, [id, dataProvider, notify, router]);

  if (!isCreate && isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton variant="rectangular" />
      </div>
    );
  }

  if (!isCreate && error) {
    return <FetchErrorState error={error} onRetry={() => mutate()} />;
  }

  return (
    <div>
      <PageHeader
        title={isCreate ? "Create Bookmark" : `Bookmark: ${data?.title ?? id}`}
        icon={Bookmark}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/bookmarks")}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        }
      />

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Bookmark Details
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Title"
              value={form.title}
              onChange={(e) => handleChange("title", e.target.value)}
            />
            <Input
              label="Host"
              value={form.host}
              onChange={(e) => handleChange("host", e.target.value)}
            />
            <Input
              label="URL"
              value={form.url}
              onChange={(e) => handleChange("url", e.target.value)}
            />
            <AutocompleteInput
              label="Category"
              value={form.category}
              onChange={(e) => handleChange("category", e.target.value)}
              suggestions={catSuggestions}
              hint={
                catSuggestions.length > 0
                  ? "Pick from existing or type a new one."
                  : undefined
              }
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
            <div>
              <Input
                label="Tags (comma-separated)"
                value={form.tags}
                onChange={(e) => handleChange("tags", e.target.value)}
              />
              {/* Click-to-append palette for the existing tags.
                  Native datalist can't help once the input contains
                  a comma — it matches the whole string — so the
                  chip row picks up where the autocomplete leaves
                  off.  Chip disappears once added so the palette
                  shrinks as the user fills the field. */}
              {tagSuggestions.length > 0 && (
                <div className="mt-2 flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    Suggested:
                  </span>
                  {tagSuggestions
                    .filter((t) => {
                      const present = new Set(
                        form.tags
                          .split(",")
                          .map((x) => x.trim().toLowerCase())
                          .filter(Boolean),
                      );
                      return !present.has(t.toLowerCase());
                    })
                    .slice(0, 10)
                    .map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => {
                          const cleaned = form.tags.replace(/[\s,]+$/, "");
                          handleChange(
                            "tags",
                            cleaned ? `${cleaned}, ${t}` : t,
                          );
                        }}
                        className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-700 hover:bg-primary-50 hover:text-primary-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-primary-900/30 dark:hover:text-primary-300"
                      >
                        + {t}
                      </button>
                    ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Public visibility ────────────────────────────────────────
              The toggle below is the only way for a record to appear at
              the unauthenticated `/links` page.  Default is OFF so
              new bookmarks stay private until an admin explicitly opts
              in.  We keep the affordance loud so an admin doesn't flip
              it by accident — full-width strip with explicit "Public" /
              "Private" labels and a description of what it changes. */}
          <div className="mt-6 flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-4 dark:border-slate-700 dark:bg-slate-800/50">
            <div className="mt-0.5 shrink-0">
              <button
                type="button"
                role="switch"
                aria-checked={form.isPublic}
                onClick={handleTogglePublic}
                className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
                  form.isPublic
                    ? "bg-primary-600"
                    : "bg-slate-300 dark:bg-slate-600"
                } focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30`}
              >
                <span
                  className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    form.isPublic ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  Public visibility
                </span>
                {form.isPublic ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                    <Globe2 className="h-3 w-3" aria-hidden="true" /> Public
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-700 dark:bg-slate-700 dark:text-slate-300">
                    Private
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {form.isPublic
                  ? "Anyone with the link can see this bookmark on the public /links page — no login required."
                  : "Only signed-in admins can see this bookmark. Toggle on to publish."}
              </p>
            </div>
          </div>
        </Card.Body>
      </Card>

      <div className="sticky bottom-0 z-20 -mx-6 -mb-6 mt-6 flex items-center justify-between border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
        <div>
          {!isCreate && (
            <Button
              variant="danger"
              onClick={() => setShowDelete(true)}
              icon={<Trash2 className="h-4 w-4" />}
            >
              Delete
            </Button>
          )}
        </div>
        <Button
          onClick={handleSubmit}
          loading={saving}
          icon={<Save className="h-4 w-4" />}
        >
          {isCreate ? "Create" : "Save Changes"}
        </Button>
      </div>

      <ConfirmDialog
        open={showDelete}
        title="Delete Bookmark"
        message={`Are you sure you want to delete "${data?.title}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
