"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, ShieldCheck } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import type { WafPolicy } from "@/types";

export default function WafPolicyDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading } = useOne<WafPolicy>(
    isCreate ? null : "waf_policies",
    isCreate ? null : id,
  );

  const [form, setForm] = useState({
    name: "",
    mode: "monitor",
    enabled: true,
    anomaly_threshold: 10,
    paranoia_level: 1,
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        mode: data.mode ?? "monitor",
        enabled: data.enabled ?? true,
        anomaly_threshold: data.anomaly_threshold ?? 10,
        paranoia_level: data.paranoia_level ?? 1,
        description: data.description ?? "",
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
        await dataProvider.create("waf_policies", form);
        notify("WAF Policy created successfully", { type: "success" });
      } else {
        await dataProvider.update("waf_policies", id, form);
        notify("WAF Policy updated successfully", { type: "success" });
      }
      router.push("/waf-policies");
    } catch (err) {
      notify((err as Error).message || "Failed to save WAF policy", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, form, id, dataProvider, notify, router]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("waf_policies", id);
      notify("WAF Policy deleted successfully", { type: "success" });
      router.push("/waf-policies");
    } catch (err) {
      notify((err as Error).message || "Failed to delete WAF policy", {
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
          isCreate ? "Create WAF Policy" : `WAF Policy: ${data?.name ?? id}`
        }
        icon={ShieldCheck}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/waf-policies")}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        }
      />

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Policy Details
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
              label="Mode"
              value={form.mode}
              onChange={(e) => handleChange("mode", e.target.value)}
              options={[
                { value: "block", label: "Block" },
                { value: "monitor", label: "Monitor" },
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
              label="Anomaly Threshold"
              type="number"
              value={String(form.anomaly_threshold)}
              onChange={(e) =>
                handleChange("anomaly_threshold", Number(e.target.value))
              }
            />
            <Input
              label="Paranoia Level"
              type="number"
              value={String(form.paranoia_level)}
              onChange={(e) =>
                handleChange("paranoia_level", Number(e.target.value))
              }
            />
            <Input
              label="Description"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
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
        title="Delete WAF Policy"
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
