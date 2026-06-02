"use client";

import React from "react";
import { ExternalLink } from "lucide-react";
import { env } from "@/lib/config/env";

/* ──────────────────────────────────────────────────────────────────────────
   Sticky bottom strip with build provenance — mirrors the legacy
   VersionFooter in openresty-admin/src/App.jsx so operators always
   know which build is in front of them when reporting issues.

   Three identity bits + one outbound link:
     - Version       (env.appVersion — semver-ish, set at build time)
     - Build         (env.buildNumber — CI run id or `local`)
     - Deployed at   (env.deploymentTime — wall-clock when the artifact
                      was published; hidden on small screens to save
                      horizontal space)
     - API docs      (link to /swagger/, opened in a new tab so the
                      operator's edit / browsing state isn't lost)
   ────────────────────────────────────────────────────────────────────────── */

export default function Footer() {
  // Empty-string default in env.ts means "no deployment time recorded";
  // hide the segment entirely in that case so we don't render "Deployed:".
  const hasDeploymentTime =
    typeof env.deploymentTime === "string" && env.deploymentTime.length > 0;

  return (
    <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-400">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span>
          Version{" "}
          <strong className="font-semibold text-slate-700 dark:text-slate-300">
            {env.appVersion}
          </strong>
        </span>
        <span>
          Build{" "}
          <strong className="font-semibold text-slate-700 dark:text-slate-300">
            {env.buildNumber}
          </strong>
        </span>
        {hasDeploymentTime && (
          <span className="hidden sm:inline">
            Deployed{" "}
            <span className="text-slate-600 dark:text-slate-400">
              {env.deploymentTime}
            </span>
          </span>
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
        className="inline-flex items-center gap-1 font-medium text-primary-600 hover:underline dark:text-primary-400"
      >
        API Documentation
        <ExternalLink className="h-3 w-3" aria-hidden="true" />
      </a>
    </footer>
  );
}
