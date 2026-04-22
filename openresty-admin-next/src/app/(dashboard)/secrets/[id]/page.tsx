"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FormProvider, useFieldArray } from "react-hook-form";
import { ArrowLeft, Save, Trash2, Plus, X, KeyRound } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import { useZodForm, FormInput } from "@/lib/forms";
import {
  secretInputSchema,
  type SecretInput,
} from "@/lib/validation/input-schemas";
import type { Secret } from "@/types";

/**
 * Secret detail / create.  Demonstrates the `useFieldArray` pattern for
 * nested array fields — the `secrets` list of key/value pairs.  The
 * array-level `.refine()` on `secretInputSchema` surfaces a single
 * "Keys must be unique within a secret" error; per-row errors come from
 * the inner `secretKVSchema`.
 */

const DEFAULT_FORM: SecretInput = {
  secret_name: "",
  description: "",
  profile_id: "",
  secrets: [],
};

export default function SecretDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading } = useOne<Secret>(
    isCreate ? null : "secrets",
    isCreate ? null : id,
  );

  const form = useZodForm({
    schema: secretInputSchema,
    defaultValues: DEFAULT_FORM,
  });
  const { reset, handleSubmit, formState, control } = form;

  const { fields, append, remove } = useFieldArray({
    control,
    name: "secrets",
  });

  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        secret_name: data.secret_name ?? "",
        description: data.description ?? "",
        profile_id: data.profile_id ?? "",
        secrets: data.secrets ?? [],
      });
    }
  }, [data, reset]);

  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const onSubmit = useCallback(
    async (values: SecretInput) => {
      try {
        if (isCreate) {
          await dataProvider.create("secrets", values);
          notify("Secret created successfully", { type: "success" });
        } else {
          await dataProvider.update("secrets", id, values);
          notify("Secret updated successfully", { type: "success" });
        }
        router.push("/secrets");
      } catch (err) {
        notify((err as Error).message || "Failed to save secret", {
          type: "error",
        });
      }
    },
    [isCreate, id, dataProvider, notify, router],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("secrets", id);
      notify("Secret deleted successfully", { type: "success" });
      router.push("/secrets");
    } catch (err) {
      notify((err as Error).message || "Failed to delete secret", {
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

  const secretsArrayError = formState.errors.secrets?.root?.message
    ?? formState.errors.secrets?.message;

  return (
    <div>
      <PageHeader
        title={
          isCreate ? "Create Secret" : `Secret: ${data?.secret_name ?? id}`
        }
        icon={KeyRound}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/secrets")}
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
                Secret Details
              </h2>
            </Card.Header>
            <Card.Body>
              <div className="grid grid-cols-1 gap-4">
                <FormInput<SecretInput>
                  name="secret_name"
                  label="Secret Name"
                  autoComplete="off"
                  placeholder="my-api-keys"
                />
                <FormInput<SecretInput>
                  name="description"
                  label="Description"
                  placeholder="Short summary of what this secret stores"
                />
              </div>
            </Card.Body>
          </Card>

          <Card className="mt-4">
            <Card.Header>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Key-Value Pairs
              </h2>
              <Button
                type="button"
                size="sm"
                onClick={() => append({ key: "", value: "" })}
                icon={<Plus className="h-4 w-4" />}
              >
                Add
              </Button>
            </Card.Header>
            <Card.Body>
              {fields.length === 0 ? (
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  No key-value pairs. Click &quot;Add&quot; to create one.
                </p>
              ) : (
                <div className="space-y-3">
                  {fields.map((pair, idx) => (
                    <div key={pair.id} className="flex items-start gap-3">
                      <div className="flex-1">
                        <FormInput<SecretInput>
                          name={`secrets.${idx}.key` as const}
                          label={idx === 0 ? "Key" : undefined}
                          placeholder="Key"
                          autoComplete="off"
                        />
                      </div>
                      <div className="flex-1">
                        <FormInput<SecretInput>
                          name={`secrets.${idx}.value` as const}
                          label={idx === 0 ? "Value" : undefined}
                          placeholder="Value"
                          type="password"
                          autoComplete="off"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(idx)}
                        aria-label={`Remove pair ${idx + 1}`}
                        className={`rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:hover:bg-red-900/20 ${
                          idx === 0 ? "mt-7" : "mt-1"
                        }`}
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              {secretsArrayError && (
                <p className="mt-3 text-sm text-red-600 dark:text-red-400">
                  {secretsArrayError}
                </p>
              )}
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
        title="Delete Secret"
        message={`Are you sure you want to delete "${data?.secret_name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleDelete}
        onCancel={() => setShowDelete(false)}
      />
    </div>
  );
}
