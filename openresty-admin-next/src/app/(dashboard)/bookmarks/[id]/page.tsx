"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, Bookmark } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import type { Bookmark as BookmarkType } from "@/types";

export default function BookmarkDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading } = useOne<BookmarkType>(
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
        tags: (data.tags ?? []).join(", "),
      });
    }
  }, [data]);

  const handleChange = useCallback((field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        tags: form.tags
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
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
            <Input
              label="Category"
              value={form.category}
              onChange={(e) => handleChange("category", e.target.value)}
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
            <Input
              label="Tags (comma-separated)"
              value={form.tags}
              onChange={(e) => handleChange("tags", e.target.value)}
            />
          </div>
        </Card.Body>
      </Card>

      <div className="mt-6 flex items-center justify-between">
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
