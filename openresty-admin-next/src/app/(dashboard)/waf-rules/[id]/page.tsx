"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Save, Trash2, ShieldAlert } from "lucide-react";
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
import type { WafRule } from "@/types";

export default function WafRuleDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading, error, mutate } = useOne<WafRule>(
    isCreate ? null : "waf_rules",
    isCreate ? null : id,
  );

  const [form, setForm] = useState({
    name: "",
    category: "sqli",
    severity: "medium",
    pattern: "",
    pattern_type: "regex",
    target: "args",
    action: "block",
    score: 5,
    enabled: true,
    description: "",
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  useEffect(() => {
    if (data) {
      setForm({
        name: data.name ?? "",
        category: data.category ?? "sqli",
        severity: data.severity ?? "medium",
        pattern: data.pattern ?? "",
        pattern_type: data.pattern_type ?? "regex",
        target: data.target ?? "args",
        action: data.action ?? "block",
        score: data.score ?? 5,
        enabled: data.enabled ?? true,
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
        await dataProvider.create("waf_rules", form);
        notify("WAF Rule created successfully", { type: "success" });
      } else {
        await dataProvider.update("waf_rules", id, form);
        notify("WAF Rule updated successfully", { type: "success" });
      }
      router.push("/waf-rules");
    } catch (err) {
      notify((err as Error).message || "Failed to save WAF rule", {
        type: "error",
      });
    } finally {
      setSaving(false);
    }
  }, [isCreate, form, id, dataProvider, notify, router]);

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("waf_rules", id);
      notify("WAF Rule deleted successfully", { type: "success" });
      router.push("/waf-rules");
    } catch (err) {
      notify((err as Error).message || "Failed to delete WAF rule", {
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

  // Surface fetch failures explicitly — otherwise an empty form
  // renders and the user wastes time wondering what went wrong.
  if (!isCreate && error) {
    return <FetchErrorState error={error} onRetry={() => mutate()} />;
  }

  return (
    <div>
      <PageHeader
        title={isCreate ? "Create WAF Rule" : `WAF Rule: ${data?.name ?? id}`}
        icon={ShieldAlert}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/waf-rules")}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        }
      />

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Rule Details
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
              label="Category"
              value={form.category}
              onChange={(e) => handleChange("category", e.target.value)}
              options={[
                { value: "sqli", label: "SQL Injection" },
                { value: "xss", label: "Cross-Site Scripting" },
                { value: "rce", label: "Remote Code Execution" },
                { value: "lfi", label: "Local File Inclusion" },
                { value: "rfi", label: "Remote File Inclusion" },
                { value: "scanner", label: "Scanner Detection" },
                { value: "protocol", label: "Protocol Violation" },
                { value: "custom", label: "Custom" },
              ]}
            />
            <Select
              label="Severity"
              value={form.severity}
              onChange={(e) => handleChange("severity", e.target.value)}
              options={[
                { value: "critical", label: "Critical" },
                { value: "high", label: "High" },
                { value: "medium", label: "Medium" },
                { value: "low", label: "Low" },
              ]}
            />
            <Input
              label="Pattern"
              value={form.pattern}
              onChange={(e) => handleChange("pattern", e.target.value)}
            />
            <Select
              label="Pattern Type"
              value={form.pattern_type}
              onChange={(e) => handleChange("pattern_type", e.target.value)}
              options={[
                { value: "regex", label: "Regex" },
                { value: "exact", label: "Exact" },
                { value: "contains", label: "Contains" },
              ]}
            />
            <Select
              label="Target"
              value={form.target}
              onChange={(e) => handleChange("target", e.target.value)}
              options={[
                { value: "args", label: "Args" },
                { value: "body", label: "Body" },
                { value: "headers", label: "Headers" },
                { value: "uri", label: "URI" },
                { value: "cookies", label: "Cookies" },
              ]}
            />
            <Select
              label="Action"
              value={form.action}
              onChange={(e) => handleChange("action", e.target.value)}
              options={[
                { value: "block", label: "Block" },
                { value: "log", label: "Log" },
                { value: "score", label: "Score" },
                { value: "allow", label: "Allow" },
              ]}
            />
            <Input
              label="Score"
              type="number"
              value={String(form.score)}
              onChange={(e) => handleChange("score", Number(e.target.value))}
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
              label="Description"
              value={form.description}
              onChange={(e) => handleChange("description", e.target.value)}
            />
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
        title="Delete WAF Rule"
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
