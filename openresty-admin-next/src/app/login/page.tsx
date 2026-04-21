"use client";

import { useActionState, useCallback } from "react";
import { useFormStatus } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import { useAuth } from "@/contexts/AuthContext";
import { Shield } from "lucide-react";

// Only allow in-app redirects — never trust an external URL.
function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

// Shape of state returned by the login action. `null` = initial state.
type LoginState =
  | null
  | { status: "error"; error: string }
  | { status: "success" };

/**
 * Submit button — uses React 19's `useFormStatus` to read the parent form's
 * pending state with zero prop drilling.  Must be rendered inside a `<form>`
 * that has `action={...}` (not `onSubmit`).
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="flex w-full items-center justify-center rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-primary-700 focus:ring-2 focus:ring-primary-500/50 focus:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60 dark:focus:ring-offset-slate-900"
    >
      {pending ? (
        <span className="flex items-center gap-2">
          <svg
            className="h-4 w-4 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Signing in&hellip;
        </span>
      ) : (
        "Sign in"
      )}
    </button>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams?.get("returnTo") ?? null);

  // React 19 client action.  Receives the previous state and the submitted
  // FormData.  Return value becomes the next state — no manual useState +
  // setLoading + setError plumbing needed.
  const loginAction = useCallback(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");

      if (!email || !password) {
        return { status: "error", error: "Email and password are required" };
      }

      try {
        await login(email, password);
        if (returnTo !== "/") {
          router.replace(returnTo);
        }
        return { status: "success" };
      } catch (err) {
        return {
          status: "error",
          error:
            err instanceof Error
              ? err.message
              : "An unexpected error occurred",
        };
      }
    },
    [login, returnTo, router],
  );

  const [state, formAction] = useActionState<LoginState, FormData>(
    loginAction,
    null,
  );

  const error = state?.status === "error" ? state.error : null;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 dark:bg-slate-950">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-lg dark:border-slate-800 dark:bg-slate-900">
          <div className="mb-8 text-center">
            <div
              className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-xl bg-primary-600 text-white"
              aria-hidden="true"
            >
              <Shield className="h-7 w-7" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
              WSL Proxy
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Sign in to your admin dashboard
            </p>
          </div>

          {error && (
            <div
              role="alert"
              aria-live="polite"
              className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400"
            >
              {error}
            </div>
          )}

          <form action={formAction} className="space-y-5" noValidate>
            <div>
              <label
                htmlFor="email"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                autoComplete="email"
                defaultValue=""
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                placeholder="you@example.com"
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300"
              >
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                autoComplete="current-password"
                defaultValue=""
                className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-white dark:placeholder:text-slate-500"
                placeholder="Enter your password"
              />
            </div>

            <SubmitButton />
          </form>
        </div>
      </div>
    </div>
  );
}
