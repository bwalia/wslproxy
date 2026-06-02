/**
 * Runtime environment configuration — validated at import time via Zod.
 *
 * Throws at module load if any required env var is missing or malformed,
 * so the app fails fast during build / boot rather than at some random
 * render time.  Import the `env` export and use `env.appVersion` etc.
 *
 * Two schemas:
 *   - clientEnvSchema: NEXT_PUBLIC_* vars, safe to inline in bundle
 *   - serverEnvSchema: vars only available in Node runtime
 */

import { z } from "zod";

// ─── Client-side (bundled) ──────────────────────────────────────────────

const clientEnvSchema = z.object({
  NEXT_PUBLIC_APP_NAME: z.string().min(1).default("wslproxy"),
  NEXT_PUBLIC_APP_DISPLAY_NAME: z.string().min(1).default("WSL Proxy"),
  NEXT_PUBLIC_APP_VERSION: z.string().default("dev"),
  NEXT_PUBLIC_APP_BUILD_NUMBER: z.string().default("local"),
  NEXT_PUBLIC_DEPLOYMENT_TIME: z.string().default(""),
  // Which environment this build is running in.  Drives the colour
  // badge in the footer so a single glance tells you whether you're
  // looking at prod or a staging tier.  `local` covers laptop /
  // docker compose; the rest map 1:1 to the deploy pipeline tiers.
  NEXT_PUBLIC_ENV_NAME: z
    .enum(["local", "int", "test", "prod"])
    .default("local"),
  // Full git SHA of the deployed commit — empty in dev.  The footer
  // renders the first 7 chars and links to the GitHub commit page.
  NEXT_PUBLIC_GIT_SHA: z.string().default(""),
  // `owner/repo` — used to build the commit / actions-run URLs.
  // Centralised here (not hard-coded in Footer.tsx) so an internal
  // mirror or fork can override it without code changes.
  NEXT_PUBLIC_GIT_REPO: z.string().default("bwalia/wslproxy"),
  // Accept the four deploy targets we actually ship to.  `BARE_METAL`
  // is the value the Ansible systemd template sets on int / test /
  // acc / prod (see infra/ansible/roles/wslproxy/templates/
  // wslproxy-nextjs-dashboard.service.j2:28); without it here, env
  // validation throws on import and every page that pulls in this
  // module 500s.  `NATIVE` is kept as an alias for older deployments.
  NEXT_PUBLIC_TARGET_PLATFORM: z
    .enum(["DOCKER", "KUBERNETES", "NATIVE", "BARE_METAL"])
    .default("DOCKER"),
  NEXT_PUBLIC_THEME_PRIMARY_COLOR: z
    .string()
    .regex(/^[0-9A-Fa-f]{6}$/, "must be a 6-char hex color without #")
    .default("6366f1"),
  NEXT_PUBLIC_THEME_SECONDARY_COLOR: z
    .string()
    .regex(/^[0-9A-Fa-f]{6}$/, "must be a 6-char hex color without #")
    .default("10b981"),
});

// ─── Server-side only ───────────────────────────────────────────────────

const serverEnvSchema = z.object({
  WSLPROXY_API_URL: z
    .string()
    .url()
    .default("http://wslproxy-local:8080"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

// ─── Parse + expose ─────────────────────────────────────────────────────

function formatZodError(
  kind: "client" | "server",
  error: z.ZodError,
): string {
  const issues = error.issues
    .map((i) => `  - ${i.path.join(".") || "<root>"}: ${i.message}`)
    .join("\n");
  return `Invalid ${kind} environment variables:\n${issues}`;
}

const clientResult = clientEnvSchema.safeParse(process.env);
if (!clientResult.success) {
  throw new Error(formatZodError("client", clientResult.error));
}

// Only parse server schema in a Node runtime — skip on client bundles.
const isServer = typeof window === "undefined";
const serverResult = isServer
  ? serverEnvSchema.safeParse(process.env)
  : { success: true as const, data: serverEnvSchema.parse({}) };

if (isServer && !serverResult.success) {
  throw new Error(formatZodError("server", serverResult.error));
}

const client = clientResult.data;
const server = serverResult.success ? serverResult.data : serverEnvSchema.parse({});

/**
 * Validated env.  Field names intentionally drop the `NEXT_PUBLIC_` prefix
 * so callers use `env.appName` rather than the raw variable name.
 */
export const env = {
  appName: client.NEXT_PUBLIC_APP_NAME,
  appDisplayName: client.NEXT_PUBLIC_APP_DISPLAY_NAME,
  appVersion: client.NEXT_PUBLIC_APP_VERSION,
  buildNumber: client.NEXT_PUBLIC_APP_BUILD_NUMBER,
  deploymentTime: client.NEXT_PUBLIC_DEPLOYMENT_TIME,
  envName: client.NEXT_PUBLIC_ENV_NAME,
  gitSha: client.NEXT_PUBLIC_GIT_SHA,
  gitRepo: client.NEXT_PUBLIC_GIT_REPO,
  targetPlatform: client.NEXT_PUBLIC_TARGET_PLATFORM,
  primaryColor: client.NEXT_PUBLIC_THEME_PRIMARY_COLOR,
  secondaryColor: client.NEXT_PUBLIC_THEME_SECONDARY_COLOR,
  /** Server-only: undefined on the client (not bundled). */
  apiUrl: isServer ? server.WSLPROXY_API_URL : undefined,
  /** Server-only: undefined on the client (not bundled). */
  nodeEnv: isServer ? server.NODE_ENV : undefined,
} as const;
