"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, Server } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import type { Server as ServerType } from "@/types";

export default function ServerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading } = useOne<ServerType>(
    isCreate ? null : "servers",
    isCreate ? null : id,
  );

  const [form, setForm] = useState({
    server_name: "",
    profile_id: "",
    proxy_pass: "",
    root: "",
    index: "",
    ssl_enabled: false,
    ssl_email: "",
    cache_enabled: false,
    cache_ttl: 3600,
    waf_enabled: false,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        server_name: data.server_name ?? "",
        profile_id: data.profile_id ?? "",
        proxy_pass: data.proxy_pass ?? "",
        root: data.root ?? "",
        index: data.index ?? "",
        ssl_enabled: data.ssl_enabled ?? false,
        ssl_email: data.ssl_email ?? "",
        cache_enabled: data.cache_enabled ?? false,
        cache_ttl: data.cache_ttl ?? 3600,
        waf_enabled: data.waf_enabled ?? false,
      });
    }
  }, [data]);

  const handleChange = useCallback(
    (field: string, value: string | boolean | number) => {
      setForm((prev) => ({ ...prev, [field]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      if (isCreate) {
        await dataProvider.create("servers", form);
        notify("Server created successfully", { type: "success" });
      } else {
        await dataProvider.update("servers", id, form);
        notify("Server updated successfully", { type: "success" });
      }
      router.push("/servers");
    } catch (err) {
      notify((err as Error).message || "Failed to save server", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, form, id, dataProvider, notify, router]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("servers", id);
      notify("Server deleted successfully", { type: "success" });
      router.push("/servers");
    } catch (err) {
      notify((err as Error).message || "Failed to delete server", {
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
        title={
          isCreate ? "Create Server" : `Server: ${data?.server_name ?? id}`
        }
        icon={Server}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/servers")}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        }
      />

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            General
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Server Name"
              value={form.server_name}
              onChange={(e) => handleChange("server_name", e.target.value)}
              disabled={!isCreate}
            />
            <Input
              label="Profile ID"
              value={form.profile_id}
              onChange={(e) => handleChange("profile_id", e.target.value)}
            />
            <Input
              label="Proxy Pass"
              value={form.proxy_pass}
              onChange={(e) => handleChange("proxy_pass", e.target.value)}
            />
            <Input
              label="Root"
              value={form.root}
              onChange={(e) => handleChange("root", e.target.value)}
            />
            <Input
              label="Index"
              value={form.index}
              onChange={(e) => handleChange("index", e.target.value)}
            />
          </div>
        </Card.Body>
      </Card>

      <Card className="mt-4">
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            SSL
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.ssl_enabled}
                onChange={(e) => handleChange("ssl_enabled", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              SSL Enabled
            </label>
            <Input
              label="SSL Email"
              value={form.ssl_email}
              onChange={(e) => handleChange("ssl_email", e.target.value)}
            />
          </div>
        </Card.Body>
      </Card>

      <Card className="mt-4">
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Cache
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.cache_enabled}
                onChange={(e) =>
                  handleChange("cache_enabled", e.target.checked)
                }
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Cache Enabled
            </label>
            <Input
              label="Cache TTL (seconds)"
              type="number"
              value={String(form.cache_ttl)}
              onChange={(e) =>
                handleChange("cache_ttl", Number(e.target.value))
              }
            />
          </div>
        </Card.Body>
      </Card>

      <Card className="mt-4">
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            WAF
          </h2>
        </Card.Header>
        <Card.Body>
          <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
            <input
              type="checkbox"
              checked={form.waf_enabled}
              onChange={(e) => handleChange("waf_enabled", e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
            />
            WAF Enabled
          </label>
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
        title="Delete Server"
        message={`Are you sure you want to delete "${data?.server_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
