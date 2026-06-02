"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, Network } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import FetchErrorState from "@/components/ui/FetchErrorState";
import type { Upstream } from "@/types";

export default function UpstreamDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading, error, mutate } = useOne<Upstream>(
    isCreate ? null : "upstreams",
    isCreate ? null : id,
  );

  const [form, setForm] = useState({
    name: "",
    load_balancing_method: "round-robin",
    enabled: true,
    keepalive: 64,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        load_balancing_method: data.load_balancing_method ?? "round-robin",
        enabled: data.enabled ?? true,
        keepalive: data.keepalive ?? 64,
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
        await dataProvider.create("upstreams", form);
        notify("Upstream created successfully", { type: "success" });
      } else {
        await dataProvider.update("upstreams", id, form);
        notify("Upstream updated successfully", { type: "success" });
      }
      router.push("/upstreams");
    } catch (err) {
      notify((err as Error).message || "Failed to save upstream", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, form, id, dataProvider, notify, router]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("upstreams", id);
      notify("Upstream deleted successfully", { type: "success" });
      router.push("/upstreams");
    } catch (err) {
      notify((err as Error).message || "Failed to delete upstream", {
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
        title={isCreate ? "Create Upstream" : `Upstream: ${data?.name ?? id}`}
        icon={Network}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/upstreams")}
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
              label="Name"
              value={form.name}
              onChange={(e) => handleChange("name", e.target.value)}
            />
            <Select
              label="Load Balancing Method"
              value={form.load_balancing_method}
              onChange={(e) =>
                handleChange("load_balancing_method", e.target.value)
              }
              options={[
                { value: "round-robin", label: "Round Robin" },
                { value: "least_conn", label: "Least Connections" },
                { value: "ip_hash", label: "IP Hash" },
                { value: "hash", label: "Hash" },
              ]}
            />
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.enabled}
                onChange={(e) => handleChange("enabled", e.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Enabled
            </label>
            <Input
              label="Keepalive"
              type="number"
              value={String(form.keepalive)}
              onChange={(e) =>
                handleChange("keepalive", Number(e.target.value))
              }
            />
          </div>
        </Card.Body>
      </Card>

      {/* Servers display */}
      {data?.servers && data.servers.length > 0 && (
        <Card className="mt-4">
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Servers ({data.servers.length})
            </h2>
          </Card.Header>
          <Card.Body>
            <div className="space-y-2">
              {data.servers.map((srv, i) => (
                <div
                  key={i}
                  className="flex items-center gap-4 rounded-lg border border-slate-200 p-3 dark:border-slate-700"
                >
                  <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {srv.address}:{srv.port ?? 80}
                  </span>
                  <span className="text-xs text-slate-500">
                    Weight: {srv.weight ?? 1}
                  </span>
                  <span className="text-xs text-slate-500">
                    State: {srv.state ?? "active"}
                  </span>
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      )}

      {/* Sticky action bar — keeps Save visible regardless of form
          height.  Negative `-mx-6 -mb-6` cancels the dashboard
          layout's `p-6` on <main> so the bar spans full width and
          flush against the bottom edge. */}
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
        title="Delete Upstream"
        message={`Are you sure you want to delete "${data?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
