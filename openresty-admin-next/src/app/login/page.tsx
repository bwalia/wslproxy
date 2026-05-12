"use client";

import { useActionState, useCallback, useState } from "react";
import { useFormStatus } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useAuth } from "@/contexts/AuthContext";
import { useTheme } from "@/contexts/ThemeContext";
import {
  Eye,
  EyeOff,
  Globe2,
  Sun,
  Moon,
  ShieldCheck,
} from "lucide-react";
import ApiHealthBanner from "@/components/auth/ApiHealthBanner";
import Footer from "@/components/layout/Footer";
import Logo from "@/components/Logo";

/* ──────────────────────────────────────────────────────────────────────────
   Login page.

   Design ported from openresty-admin/src/Login.jsx so the migrated
   dashboard keeps the same visual identity its operators are used to:
     - Brand logo (port of <Logo>) at the top of the card.
     - API health strip above everything — distinguishes "wrong
       credentials" from "backend outage" before the user even types.
     - Theme toggle in the top-right corner.
     - Soft radial-blur background to give depth without distracting.
     - Password show/hide toggle for typing safely on shared screens.
     - Same footer component as the dashboard so version / build /
       deployment time are visible pre-auth (useful for incident
       reports).
     - Discoverable pointer to the public /links page for users who
       don't actually need an admin session.

   Auth flow is unchanged — React 19 `useActionState` + `useFormStatus`
   for pending state, sanitised `returnTo` redirect after success.
   ────────────────────────────────────────────────────────────────────────── */

// Only allow in-app redirects — never trust an external URL.
function sanitizeReturnTo(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) return "/";
  return raw;
}

type LoginState =
  | null
  | { status: "error"; error: string }
  | { status: "success" };

/**
 * Submit button — reads parent form pending state via `useFormStatus`,
 * no prop drilling.  Must live inside a `<form action={...}>`.
 */
function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      aria-disabled={pending}
      className="group relative flex w-full items-center justify-center gap-2 rounded-lg bg-linear-to-br from-primary-600 to-violet-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-primary-500/30 transition-all hover:from-primary-500 hover:to-violet-500 hover:shadow-primary-500/40 focus-visible:ring-2 focus-visible:ring-primary-500/50 focus-visible:ring-offset-2 focus:outline-none disabled:cursor-not-allowed disabled:from-slate-400 disabled:to-slate-400 disabled:opacity-70 disabled:shadow-none dark:focus-visible:ring-offset-slate-900"
    >
      {pending ? (
        <>
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Signing in&hellip;</span>
        </>
      ) : (
        <span>Sign in</span>
      )}
    </button>
  );
}

export default function LoginPage() {
  const { login } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = sanitizeReturnTo(searchParams?.get("returnTo") ?? null);

  // Show/hide toggle for the password field.  Pure UI state — the
  // input itself stays uncontrolled so the React 19 form action can
  // read the value out of FormData on submit.
  const [showPassword, setShowPassword] = useState(false);

  const loginAction = useCallback(
    async (_prev: LoginState, formData: FormData): Promise<LoginState> => {
      const email = String(formData.get("email") ?? "").trim();
      const password = String(formData.get("password") ?? "");
      if (!email || !password) {
        return { status: "error", error: "Email and password are required" };
      }
      try {
        await login(email, password);
        if (returnTo !== "/") router.replace(returnTo as Route);
        return { status: "success" };
      } catch (err) {
        return {
          status: "error",
          error:
            err instanceof Error ? err.message : "An unexpected error occurred",
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
  const currentYear = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50 dark:bg-slate-950">
      {/* ── API health strip ────────────────────────────────────────── */}
      <ApiHealthBanner />

      {/* ── Decorative background blobs ─────────────────────────────── */}
      {/* Two soft radial blurs to give the page depth without
          competing with the form.  `pointer-events-none` so they
          never intercept clicks; `fixed` so they don't scroll with
          the card on tiny viewports. */}
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
      >
        <div className="absolute -top-32 -right-32 h-120 w-120 rounded-full bg-primary-500/15 blur-3xl dark:bg-primary-500/10" />
        <div className="absolute -bottom-32 -left-32 h-105 w-105 rounded-full bg-emerald-500/10 blur-3xl dark:bg-emerald-500/10" />
      </div>

      {/* ── Theme toggle (top-right) ────────────────────────────────── */}
      <button
        type="button"
        onClick={toggleTheme}
        aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        className="absolute top-12 right-6 z-20 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-white/80 text-slate-600 shadow-sm backdrop-blur transition-colors hover:bg-white hover:text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-500/30 focus:outline-none dark:border-slate-700 dark:bg-slate-900/80 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-primary-400"
      >
        {theme === "dark" ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
      </button>

      {/* ── Main content (vertically centered card) ─────────────────── */}
      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="rounded-2xl border border-slate-200 bg-white/95 p-8 shadow-xl shadow-slate-900/5 backdrop-blur dark:border-slate-800 dark:bg-slate-900/95 dark:shadow-black/20 sm:p-10">
            {/* Logo + welcome */}
            <div className="mb-8 text-center">
              <div className="mb-6 flex justify-center">
                <Logo width={200} height={44} variant="full" theme={theme} />
              </div>
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                Welcome back
              </h1>
              <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
                Sign in to your admin dashboard
              </p>
            </div>

            {/* Error banner — only shown after a failed submit attempt */}
            {error && (
              <div
                role="alert"
                aria-live="polite"
                className="mb-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
              >
                <span aria-hidden="true" className="mt-0.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" />
                <span>{error}</span>
              </div>
            )}

            {/* Form */}
            <form action={formAction} className="space-y-4" noValidate>
              <div>
                <label
                  htmlFor="email"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
                >
                  Email address
                </label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  required
                  autoComplete="email"
                  autoFocus
                  defaultValue=""
                  className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                  placeholder="you@example.com"
                />
              </div>

              <div>
                <label
                  htmlFor="password"
                  className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400"
                >
                  Password
                </label>
                {/* Wrapper position relative so the show/hide button can
                    sit inside the input's right edge.  pr-11 on the
                    input keeps text from sliding under the eye icon. */}
                <div className="relative">
                  <input
                    id="password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    required
                    autoComplete="current-password"
                    defaultValue=""
                    className="block w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 pr-11 text-sm text-slate-900 transition-colors placeholder:text-slate-400 focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20 focus:outline-none dark:border-slate-700 dark:bg-slate-800/60 dark:text-slate-100 dark:placeholder:text-slate-500"
                    placeholder="Enter your password"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    tabIndex={-1}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute inset-y-0 right-0 flex items-center pr-3 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-slate-300"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <SubmitButton />
            </form>

            {/* Trust marker — small, never the focal point */}
            <div className="mt-6 flex items-center justify-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Protected by WSL Proxy Gateway</span>
            </div>
          </div>

          {/* Pointer to the unauthenticated /links page so visitors
              who don't have admin credentials can still find the
              public service directory.  Plain anchor because /links
              sits in a different route group with its own layout —
              a full-page navigation lands them in the right shell. */}
          <div className="mt-6 text-center">
            <a
              href="/links"
              className="inline-flex items-center gap-1.5 text-sm text-slate-500 transition-colors hover:text-primary-600 dark:text-slate-400 dark:hover:text-primary-400"
            >
              <Globe2 className="h-3.5 w-3.5" aria-hidden="true" />
              Browse public services
              <span className="text-slate-300 dark:text-slate-600">·</span>
              <span className="text-xs">no sign-in required</span>
            </a>
          </div>

          {/* © branding strip — purely textual, sits above the
              build-info footer so legal/copy info has its own line. */}
          <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-600">
            © {currentYear}{" "}
            <a
              href="https://wslproxy.com"
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-primary-600 dark:hover:text-primary-400"
            >
              WSL Proxy
            </a>
            . All rights reserved.
          </p>
        </div>
      </main>

      {/* ── Footer (shared with dashboard) ──────────────────────────── */}
      {/* Same component the authenticated layout uses, so version /
          build / deployment time are visible pre-auth too — useful
          when an operator asks "what build is this login from?" */}
      <Footer />
    </div>
  );
}
