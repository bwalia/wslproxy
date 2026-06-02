"use client";

import React, { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";
import { env } from "@/lib/config/env";
import { cn } from "@/lib/utils/cn";

/* ──────────────────────────────────────────────────────────────────────────
   Sticky bottom strip with build provenance.

   The whole point is that an operator on prod can tell — at a glance —
   *which* build they're looking at and when it landed.  Before this:
   prod and dev both showed "vdev · Build local" because NEXT_PUBLIC_*
   vars are inlined at build time and the Ansible task wasn't passing
   any of them to `npm run build`.  That's fixed in
   infra/ansible/roles/wslproxy/tasks/deploy_nextjs_admin_ui.yml and
   .github/workflows/deploy-environment.yml.

   Order of identity bits, left → right:
     - Env badge      (colour-coded so prod / acc / int are obvious)
     - Version        (npm-version or git tag, set at build time)
     - Build          (CI run id, linked to the GitHub Actions run)
     - Deployed       (relative time + ISO on hover; hidden < sm)
     - Commit         (first 7 of git SHA, linked to GitHub commit page)
     - API docs       (right side; opens in new tab so edits aren't lost)
   ────────────────────────────────────────────────────────────────────────── */

// Visual treatment per environment.  The dot colour is the load-
// bearing signal — text intentionally stays muted so the badge
// reads as "context" rather than "alert".
const ENV_PALETTE: Record<
  typeof env.envName,
  { dotClass: string; label: string }
> = {
  prod: { dotClass: "bg-red-500", label: "PROD" },
  test: { dotClass: "bg-blue-500", label: "TEST" },
  int: { dotClass: "bg-sky-400", label: "INT" },
  local: { dotClass: "bg-slate-400", label: "LOCAL" },
};

/**
 * Tiny, dependency-free relative-time formatter.  We avoid date-fns /
 * Intl.RelativeTimeFormat to keep the bundle slim — this is only ever
 * used in the footer and doesn't need locale negotiation.
 */
function formatRelative(iso: string, now: number): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return iso; // fall back to whatever was passed in
  const sec = Math.floor((now - t) / 1000);
  if (sec < 0) return "just now"; // clock skew
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)} min ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)} h ago`;
  if (sec < 86400 * 30) return `${Math.floor(sec / 86400)} d ago`;
  if (sec < 86400 * 365) return `${Math.floor(sec / (86400 * 30))} mo ago`;
  return `${Math.floor(sec / (86400 * 365))} y ago`;
}

export default function Footer() {
  // Re-render the relative-time string every 30s so "2 min ago" doesn't
  // get stuck on the first paint.  Hydration-safe: we compute it from a
  // state initialised to 0 (matches SSR output of "just now") and then
  // bump it after mount.  Without that, SSR/CSR would mismatch on the
  // relative-time text.
  const [now, setNow] = useState<number>(0);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const palette = ENV_PALETTE[env.envName];
  const hasDeploymentTime = env.deploymentTime.length > 0;
  const hasGitSha = env.gitSha.length >= 7;
  // Tolerate either a real numeric CI run id or the literal "local" /
  // "unknown".  Linking those nowhere is better than building a 404 URL.
  const buildIsNumericRunId = /^\d{6,}$/.test(env.buildNumber);

  // Vertical divider between identity bits — keeps the strip
  // scannable on wide viewports without leaning on bullet glyphs.
  const Divider = () => (
    <span
      className="hidden h-4 w-px bg-slate-300 dark:bg-slate-700 sm:block"
      aria-hidden="true"
    />
  );

  return (
    <footer className="flex flex-wrap items-center justify-between gap-x-5 gap-y-2.5 border-t border-slate-200 bg-slate-50/95 px-6 py-3 text-sm text-slate-600 backdrop-blur-sm dark:border-slate-800 dark:bg-slate-900/95 dark:text-slate-400">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {/* Env badge — the load-bearing signal in this strip.  Sized
            big enough to read at a glance from across the office; the
            outline ring sets it apart from the muted body text. */}
        <span
          className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1 text-xs font-semibold uppercase tracking-wider text-slate-700 ring-1 ring-inset ring-slate-300 dark:bg-slate-800 dark:text-slate-200 dark:ring-slate-700"
          title={`Environment: ${env.envName}`}
        >
          <span
            className={cn("h-2 w-2 rounded-full", palette.dotClass)}
            aria-hidden="true"
          />
          {palette.label}
        </span>

        <Divider />

        <span className="inline-flex items-baseline gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Version
          </span>
          <strong className="font-semibold text-slate-800 dark:text-slate-200">
            {env.appVersion}
          </strong>
        </span>

        <Divider />

        <span className="inline-flex items-baseline gap-1">
          <span className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
            Build
          </span>
          {buildIsNumericRunId ? (
            <a
              href={`https://github.com/${env.gitRepo}/actions/runs/${env.buildNumber}`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-primary-600 hover:underline dark:text-primary-400"
              title="Open the Actions run that produced this build"
            >
              {env.buildNumber}
            </a>
          ) : (
            <strong className="font-semibold text-slate-800 dark:text-slate-200">
              {env.buildNumber}
            </strong>
          )}
        </span>

        {hasDeploymentTime && (
          <>
            <Divider />
            <span
              className="hidden items-baseline gap-1 sm:inline-flex"
              title={env.deploymentTime}
            >
              <span className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Deployed
              </span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {now === 0 ? "just now" : formatRelative(env.deploymentTime, now)}
              </span>
            </span>
          </>
        )}

        {hasGitSha && (
          <>
            <Divider />
            <span className="hidden items-baseline gap-1 md:inline-flex">
              <span className="text-xs uppercase tracking-wider text-slate-400 dark:text-slate-500">
                Commit
              </span>
              <a
                href={`https://github.com/${env.gitRepo}/commit/${env.gitSha}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                title={`Commit ${env.gitSha}`}
              >
                {env.gitSha.slice(0, 7)}
              </a>
            </span>
          </>
        )}
      </div>

      {/* Swagger / OpenAPI is served by OpenResty at /swagger/.  Same-
          origin in production (nginx fronts everything) and via the
          Next.js rewrite in standalone dev.  Open in a new tab so the
          operator's in-progress form edits aren't lost. */}
      <a
        href="/swagger/"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 font-medium text-primary-600 hover:underline dark:text-primary-400"
      >
        API Documentation
        <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
      </a>
    </footer>
  );
}
