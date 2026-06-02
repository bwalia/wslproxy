"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, Box } from "lucide-react";
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
import type { Instance } from "@/types";

export default function InstanceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading, error, mutate } = useOne<Instance>(
    isCreate ? null : "instances",
    isCreate ? null : id,
  );

  const [form, setForm] = useState({
    instance_name: "",
    host_ip: "",
    host_port: "",
    host_type: "docker",
    instance_status: true,
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        instance_name: data.instance_name ?? "",
        host_ip: data.host_ip ?? "",
        host_port: data.host_port ?? "",
        host_type: data.host_type ?? "docker",
        instance_status: data.instance_status ?? true,
      });
    }
  }, [data]);

  const handleChange = useCallback((field: string, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleSubmit = useCallback(async () => {
    setSaving(true);
    try {
      if (isCreate) {
        await dataProvider.create("instances", form);
        notify("Instance created successfully", { type: "success" });
      } else {
        await dataProvider.update("instances", id, form);
        notify("Instance updated successfully", { type: "success" });
      }
      router.push("/instances");
    } catch (err) {
      notify((err as Error).message || "Failed to save instance", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, form, id, dataProvider, notify, router]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("instances", id);
      notify("Instance deleted successfully", { type: "success" });
      router.push("/instances");
    } catch (err) {
      notify((err as Error).message || "Failed to delete instance", {
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
        title={
          isCreate
            ? "Create Instance"
            : `Instance: ${data?.instance_name ?? id}`
        }
        icon={Box}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/instances")}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        }
      />

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Instance Details
          </h2>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <Input
              label="Instance Name"
              value={form.instance_name}
              onChange={(e) => handleChange("instance_name", e.target.value)}
            />
            <Input
              label="Host IP"
              value={form.host_ip}
              onChange={(e) => handleChange("host_ip", e.target.value)}
            />
            <Input
              label="Host Port"
              value={form.host_port}
              onChange={(e) => handleChange("host_port", e.target.value)}
            />
            <Select
              label="Host Type"
              value={form.host_type}
              onChange={(e) => handleChange("host_type", e.target.value)}
              options={[
                { value: "docker", label: "Docker" },
                { value: "bare-metal", label: "Bare Metal" },
                { value: "vm", label: "Virtual Machine" },
                { value: "kubernetes", label: "Kubernetes" },
              ]}
            />
            <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
              <input
                type="checkbox"
                checked={form.instance_status}
                onChange={(e) =>
                  handleChange("instance_status", e.target.checked)
                }
                className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
              />
              Active
            </label>
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
        title="Delete Instance"
        message={`Are you sure you want to delete "${data?.instance_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
