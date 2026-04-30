"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Controller, FormProvider } from "react-hook-form";
import { ArrowLeft, Save, Trash2, ShieldCheck } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import {
  useZodForm,
  FormInput,
  FormSelect,
  surfaceServerErrors,
} from "@/lib/forms";
import {
  wafPolicyInputSchema,
  type WafPolicyInput,
} from "@/lib/validation/input-schemas";
import type { WafPolicy } from "@/types";

/**
 * WAF policy detail / create.  Demonstrates `FormSelect`, boolean
 * checkboxes via `Controller`, and the `z.coerce.number()` pipeline
 * for number inputs — browsers return strings from `<input type=number>`,
 * and `coerce` does the conversion without a manual `Number(...)` wrapper.
 *
 * Preserves server-persisted fields (`body_inspection`, `max_body_size`,
 * `waf_rules`, `profile_id`) even when the UI doesn't expose them — they
 * stay in form state so `PUT` round-trips without clobbering.
 */

const DEFAULT_FORM: WafPolicyInput = {
  name: "",
  description: "",
  profile_id: "",
  mode: "block",
  enabled: true,
  anomaly_threshold: 5,
  paranoia_level: 1,
  body_inspection: true,
  max_body_size: 1048576,
  waf_rules: [],
};

const MODE_OPTIONS = [
  { value: "block", label: "Block" },
  { value: "monitor", label: "Monitor" },
];

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

  const form = useZodForm({
    schema: wafPolicyInputSchema,
    defaultValues: DEFAULT_FORM,
  });
  const { reset, handleSubmit, formState, control, setError } = form;

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        name: data.name ?? "",
        description: data.description ?? "",
        profile_id: "",
        mode: (data.mode === "monitor" ? "monitor" : "block"),
        enabled: data.enabled ?? true,
        anomaly_threshold: data.anomaly_threshold ?? 5,
        paranoia_level: data.paranoia_level ?? 1,
        body_inspection: data.body_inspection ?? true,
        max_body_size: data.max_body_size ?? 1048576,
        waf_rules: data.waf_rules ?? [],
      });
    }
  }, [data, reset]);

  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const onSubmit = useCallback(
    async (values: WafPolicyInput) => {
      try {
        if (isCreate) {
          await dataProvider.create("waf_policies", values);
          notify("WAF Policy created successfully", { type: "success" });
        } else {
          await dataProvider.update("waf_policies", id, values);
          notify("WAF Policy updated successfully", { type: "success" });
        }
        router.push("/waf-policies");
      } catch (err) {
        // Surface structured backend errors inline (e.g. duplicate
        // policy name, invalid threshold combo).  Most 4xx messages
        // for WAF policies refer to the `name` field.
        surfaceServerErrors(setError, err, "name");
        notify((err as Error).message || "Failed to save WAF policy", {
          type: "error",
        });
      }
    },
    [isCreate, id, dataProvider, notify, router, setError],
  );

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

      <FormProvider {...form}>
        <form onSubmit={handleSubmit(onSubmit)} noValidate>
          <Card>
            <Card.Header>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Policy Details
              </h2>
            </Card.Header>
            <Card.Body>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                <FormInput<WafPolicyInput>
                  name="name"
                  label="Name"
                  autoComplete="off"
                  placeholder="default-waf"
                />
                <FormSelect<WafPolicyInput>
                  name="mode"
                  label="Mode"
                  options={MODE_OPTIONS}
                />
                <Controller
                  control={control}
                  name="enabled"
                  render={({ field }) => (
                    <label className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                      <input
                        type="checkbox"
                        checked={Boolean(field.value)}
                        onChange={(e) => field.onChange(e.target.checked)}
                        onBlur={field.onBlur}
                        name={field.name}
                        ref={field.ref}
                        className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                      />
                      Enabled
                    </label>
                  )}
                />
                <FormInput<WafPolicyInput>
                  name="anomaly_threshold"
                  label="Anomaly Threshold"
                  type="number"
                  min={1}
                  max={100}
                  hint="Higher = fewer false positives."
                />
                <FormInput<WafPolicyInput>
                  name="paranoia_level"
                  label="Paranoia Level"
                  type="number"
                  min={1}
                  max={4}
                  hint="1 = relaxed, 4 = strict."
                />
                <FormInput<WafPolicyInput>
                  name="description"
                  label="Description"
                  placeholder="What this policy protects"
                />
              </div>
            </Card.Body>
          </Card>

          <div className="mt-6 flex items-center justify-between">
            <div>
              {!isCreate && (
                <Button
                  type="button"
                  variant="danger"
                  onClick={() => setShowDelete(true)}
                  icon={<Trash2 className="h-4 w-4" />}
                >
                  Delete
                </Button>
              )}
            </div>
            <Button
              type="submit"
              loading={formState.isSubmitting}
              disabled={!formState.isDirty && !isCreate}
              icon={<Save className="h-4 w-4" />}
            >
              {isCreate ? "Create" : "Save Changes"}
            </Button>
          </div>
        </form>
      </FormProvider>

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
