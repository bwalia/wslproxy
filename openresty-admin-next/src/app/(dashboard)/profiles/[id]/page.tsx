"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { FormProvider } from "react-hook-form";
import { ArrowLeft, Save, Trash2, Layers } from "lucide-react";
import { useOne, useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import Skeleton from "@/components/ui/Skeleton";
import FetchErrorState from "@/components/ui/FetchErrorState";
import {
  useZodForm,
  FormInput,
  FormTextarea,
  surfaceServerErrors,
} from "@/lib/forms";
import {
  profileInputSchema,
  type ProfileInput,
} from "@/lib/validation/input-schemas";
import type { Profile } from "@/types";

/**
 * Profile detail / create.  First form migrated to react-hook-form +
 * Zod pipeline.  Template for the other simple CRUD forms.
 *
 * Pattern:
 *  1. Zod schema in `input-schemas.ts` is the source of truth for
 *     shape + validation messages.
 *  2. `useZodForm({ schema, defaultValues })` wires react-hook-form
 *     with the Zod resolver.
 *  3. `<FormProvider>` makes the form instance available to
 *     `<FormInput>` / `<FormTextarea>` children without prop drilling.
 *  4. `form.handleSubmit(onValid)` only fires when validation passes,
 *     so the caller's async submit never runs against invalid data.
 *  5. `form.reset(...)` is used to rehydrate the form when server data
 *     arrives (no more ad-hoc `useEffect(() => setForm(data))`).
 */

const DEFAULT_FORM: ProfileInput = { name: "", description: "" };

export default function ProfileDetailPage() {
  const params = useParams();
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const id = params.id as string;
  const isCreate = id === "create";

  const { data, isLoading, error, mutate } = useOne<Profile>(
    isCreate ? null : "profiles",
    isCreate ? null : id,
  );

  const form = useZodForm({
    schema: profileInputSchema,
    defaultValues: DEFAULT_FORM,
  });
  const { reset, handleSubmit, formState, setError } = form;

  // Hydrate the form when server data arrives.  `reset` replaces the
  // form state atomically and clears any stale validation errors.
  useEffect(() => {
    if (data) {
      reset({
        id: data.id,
        name: data.name ?? "",
        description: data.description ?? "",
      });
    }
  }, [data, reset]);

  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);

  const onSubmit = useCallback(
    async (values: ProfileInput) => {
      try {
        if (isCreate) {
          await dataProvider.create("profiles", values);
          notify("Profile created successfully", { type: "success" });
        } else {
          await dataProvider.update("profiles", id, values);
          notify("Profile updated successfully", { type: "success" });
        }
        router.push("/profiles");
      } catch (err) {
        // Map any structured backend validation errors onto form
        // fields so the user sees them inline.  Backend's "Profile
        // name already exists" and similar 4xx messages are most
        // relevant to the `name` field.
        const handled = surfaceServerErrors(setError, err, "name");
        // Always notify too — gives the user a clear top-level
        // signal (especially for non-field issues like 5xx).
        notify(
          (err as Error).message || "Failed to save profile",
          { type: "error" },
        );
        // `handled` is documented for future callers that may want
        // to skip the toast when every error is already inline.
        void handled;
      }
    },
    [isCreate, id, dataProvider, notify, router, setError],
  );

  const handleDelete = useCallback(async () => {
    setDeleting(true);
    try {
      await dataProvider.remove("profiles", id);
      notify("Profile deleted successfully", { type: "success" });
      router.push("/profiles");
    } catch (err) {
      notify((err as Error).message || "Failed to delete profile", {
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
        title={isCreate ? "Create Profile" : `Profile: ${data?.name ?? id}`}
        icon={Layers}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.push("/profiles")}
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
                Profile Details
              </h2>
            </Card.Header>
            <Card.Body>
              <div className="grid grid-cols-1 gap-4">
                <FormInput<ProfileInput>
                  name="name"
                  label="Name"
                  autoComplete="off"
                  placeholder="prod"
                  hint="Letters, numbers, dashes, and underscores only."
                />
                <FormTextarea<ProfileInput>
                  name="description"
                  label="Description"
                  rows={3}
                  placeholder="Production environment profile"
                />
              </div>
            </Card.Body>
          </Card>

          <div className="sticky bottom-0 z-20 -mx-6 -mb-6 mt-6 flex items-center justify-between border-t border-slate-200 bg-white/95 px-6 py-4 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/95">
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
        title="Delete Profile"
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
