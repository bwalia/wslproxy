"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider } from "react-hook-form";
import { ArrowLeft, KeyRound, Save } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import { useZodForm, FormInput } from "@/lib/forms";
import {
  passwordResetInputSchema,
  type PasswordResetInput,
} from "@/lib/validation/input-schemas";

/**
 * Change password — authenticated users only.
 *
 * Mirrors the legacy `/password/reset` route
 * (openresty-admin/src/component/ResetForm.jsx).  Hashes old/new via
 * the backend (api/api.lua:resetPassword), which updates
 * `settings.super_user.password` atomically.
 */

const DEFAULT_FORM: PasswordResetInput = {
  oldPassword: "",
  newPassword: "",
  confirmPassword: "",
};

export default function ChangePasswordPage() {
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const form = useZodForm({
    schema: passwordResetInputSchema,
    defaultValues: DEFAULT_FORM,
  });
  const { handleSubmit, formState, reset } = form;

  const onSubmit = useCallback(
    async (values: PasswordResetInput) => {
      setSuccessMsg(null);
      try {
        const res = (await dataProvider.resetPassword({
          oldPassword: values.oldPassword,
          newPassword: values.newPassword,
          confirmPassword: values.confirmPassword,
        })) as { message?: string; error?: string } | undefined;
        // The Lua handler replies with either `{ message }` or throws —
        // the thrown case is an HTTP error and lands in `catch` below.
        const msg = res?.message ?? "Password changed successfully";
        setSuccessMsg(msg);
        notify(msg, { type: "success" });
        reset(DEFAULT_FORM);
      } catch (err) {
        notify((err as Error).message || "Failed to change password", {
          type: "error",
        });
      }
    },
    [dataProvider, notify, reset],
  );

  return (
    <div>
      <PageHeader
        title="Change Password"
        icon={KeyRound}
        actions={
          <Button
            variant="ghost"
            onClick={() => router.back()}
            icon={<ArrowLeft className="h-4 w-4" />}
          >
            Back
          </Button>
        }
      />

      <div className="max-w-xl">
        <FormProvider {...form}>
          <form onSubmit={handleSubmit(onSubmit)} noValidate>
            <Card>
              <Card.Header>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                    Update your password
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                    Enter your current password, then choose a new one. You&rsquo;ll
                    stay signed in after the change.
                  </p>
                </div>
              </Card.Header>
              <Card.Body>
                {successMsg && (
                  <div
                    role="status"
                    className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300"
                  >
                    {successMsg}
                  </div>
                )}
                <div className="space-y-4">
                  <FormInput<PasswordResetInput>
                    name="oldPassword"
                    label="Current Password"
                    type="password"
                    autoComplete="current-password"
                  />
                  <FormInput<PasswordResetInput>
                    name="newPassword"
                    label="New Password"
                    type="password"
                    autoComplete="new-password"
                    hint="At least 8 characters."
                  />
                  <FormInput<PasswordResetInput>
                    name="confirmPassword"
                    label="Confirm New Password"
                    type="password"
                    autoComplete="new-password"
                  />
                </div>
              </Card.Body>
            </Card>

            <div className="mt-4 flex items-center justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => reset(DEFAULT_FORM)}
                disabled={!formState.isDirty || formState.isSubmitting}
              >
                Clear
              </Button>
              <Button
                type="submit"
                loading={formState.isSubmitting}
                icon={<Save className="h-4 w-4" />}
              >
                Change Password
              </Button>
            </div>
          </form>
        </FormProvider>
      </div>
    </div>
  );
}
