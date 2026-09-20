"use client";

import { useEffect, useState } from "react";
import { ArrowRight, FileJson, GitCommit } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { useDataProvider } from "@/hooks/useResource";
import { cn } from "@/lib/utils/cn";

/**
 * Diff modal for the History tab.  Given a target version, fetches
 * either the version itself (v1 — nothing to diff) or a structured
 * diff of that version against the current live one, and renders it
 * as a field-by-field before/after list.
 */

interface Change {
  field: string;
  old_value: unknown;
  new_value: unknown;
  change_type?: "added" | "removed" | "modified" | string;
}

interface DiffPayload {
  v1: { version: number; state?: string; created_by?: string; created_at?: number };
  v2: { version: number; state?: string; created_by?: string; created_at?: number };
  changes: Change[];
  total_changes: number;
}

interface VersionDiffModalProps {
  open: boolean;
  onClose: () => void;
  resourceType: string;
  resourceName: string;
  profile: string;
  /** Version to inspect. */
  targetVersion: number;
  /** The version to compare against (usually the current live).  Omit to
   *  render only the target's config (no diff — used for v1). */
  compareVersion?: number;
}

/** Base64-decoded rendering for known-binary fields (server `config`,
 *  varnish `vcl`), so a "changed: config" row shows readable nginx text
 *  instead of a wall of base64.  Falls back to the raw string on decode
 *  failure — never blocks rendering. */
const BASE64_FIELDS = new Set([
  "config",
  "varnish_vcl_config",
  "jwt_token_validation_key",
]);

function isBase64ish(s: string): boolean {
  return /^[A-Za-z0-9+/=\s]+$/.test(s) && s.length > 8 && s.length % 4 <= 3;
}

/** Ignore fields that change on every save or aren't operator-facing. */
const HIDDEN_FIELDS = new Set([
  "_schema_version",
  "_version_control",
  "version",
  "updated_at",
  "created_at",
]);

/** Plain-English labels for known dotted field paths.  Prefix-matched:
 *  a match on the exact path wins, otherwise the closest ancestor with
 *  a suffix label prints "X (child)".  Anything unlisted falls back to
 *  a humanised path. */
const FIELD_LABELS: Record<string, string> = {
  // Rules
  name: "Rule name",
  priority: "Priority",
  servers: "Attached servers",
  "match.rules.path": "URL path",
  "match.rules.path_key": "Path match type",
  "match.rules.country": "Country",
  "match.rules.country_key": "Country match type",
  "match.rules.client_ip": "Client IP",
  "match.rules.client_ip_key": "Client IP match type",
  "match.rules.jwt_token_validation": "JWT validation",
  "match.rules.jwt_token_validation_key": "JWT validation key",
  "match.rules.jwt_token_validation_value": "JWT validation value",
  "match.rules.amazon_s3_access_key": "AWS access key",
  "match.rules.amazon_s3_secret_key": "AWS secret key",
  "match.response.code": "Response type",
  "match.response.allow": "Allow request",
  "match.response.redirect_uri": "Backend / redirect URL",
  "match.response.message": "Response HTML",
  "match.response.strip_path": "Strip path prefix",
  "match.response.auto_redirect_https": "Auto-redirect to HTTPS",
  "match.response.routing.mode": "Load-balancing mode",
  "match.response.backends": "Backends",
  "match.response.is_consul": "Consul lookup",
  // Servers — top-level knobs
  server_name: "Server hostname",
  proxy_server_name: "Proxy hostname",
  profile_id: "Environment",
  config: "Nginx config",
  config_status: "Config active",
  listens: "Listen ports",
  rules: "Attached rules",
  match_cases: "Match cases",
  ssl_enabled: "SSL",
  ssl_force_https: "Force HTTPS",
  ssl_auto_renew: "SSL auto-renew",
  ssl_staging: "SSL staging mode",
  ssl_email: "SSL contact email",
  cache_enabled: "Cache",
  cache_ttl: "Cache TTL (seconds)",
  cache_bypass_cookie: "Cache bypass cookie",
  cache_bypass_auth: "Bypass cache when authenticated",
  varnish_enabled: "Varnish",
  varnish_vcl_config: "Varnish VCL",
  waf_enabled: "WAF",
  waf_policy_id: "WAF policy",
  waf_mode_override: "WAF mode",
  rate_limit_enabled: "Rate limiting",
  "rate_limit.requests_per_second": "Rate limit — req/sec",
  "rate_limit.burst": "Rate limit — burst",
  "proxy_timeouts.connect_timeout": "Proxy connect timeout",
  "proxy_timeouts.send_timeout": "Proxy send timeout",
  "proxy_timeouts.read_timeout": "Proxy read timeout",
  custom_headers: "Upstream headers",
  custom_response_headers: "Response headers",
  proxy_pass: "Upstream target",
  root: "Document root",
  index: "Index file",
  access_log: "Access log",
  error_log: "Error log",
  access_profile: "Access profile",
};

const RESPONSE_CODE_LABEL: Record<string, string> = {
  "200": "Custom HTML block (200)",
  "301": "Redirect · 301 Moved Permanently",
  "302": "Redirect · 302 Found",
  "305": "Proxy pass to backend",
  "306": "CAPTCHA challenge",
  "403": "Forbidden (403)",
};

const PATH_KEY_LABEL: Record<string, string> = {
  equals: "equals",
  starts_with: "starts with",
  ends_with: "ends with",
  not_equals: "does not equal",
};

function humanise(field: string): string {
  if (FIELD_LABELS[field]) return FIELD_LABELS[field];
  // Try suffix-of-parent: "match.rules.path.new_subfield" → parent label + child
  const parts = field.split(".");
  for (let i = parts.length - 1; i > 0; i--) {
    const prefix = parts.slice(0, i).join(".");
    if (FIELD_LABELS[prefix]) {
      return `${FIELD_LABELS[prefix]} · ${parts.slice(i).join(" · ")}`;
    }
  }
  return field
    .split(".")
    .map((seg) => seg.replace(/_/g, " "))
    .join(" · ")
    .replace(/^./, (c) => c.toUpperCase());
}

/** Render a value for display.  Field-aware: response codes, path-key
 *  types, and booleans become plain English; long JSON stays JSON. */
function renderValue(field: string, v: unknown): string {
  if (v === null || v === undefined) return "(not set)";
  if (v === "") return "(empty)";

  // Response code — the single most-changed field on rules
  if (
    (field === "match.response.code" || field === "code") &&
    (typeof v === "number" || typeof v === "string")
  ) {
    return RESPONSE_CODE_LABEL[String(v)] ?? `Code ${v}`;
  }
  if (
    (field.endsWith("_key") || field.endsWith("path_key")) &&
    typeof v === "string" &&
    PATH_KEY_LABEL[v]
  ) {
    return PATH_KEY_LABEL[v];
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";

  if (typeof v === "string") {
    if (BASE64_FIELDS.has(field) && isBase64ish(v)) {
      try {
        const decoded = atob(v);
        if (decoded && /^[\x09\x0a\x0d\x20-\x7e]*$/.test(decoded)) return decoded;
      } catch {
        /* fall through */
      }
    }
    return v;
  }
  if (typeof v === "number") return String(v);
  if (Array.isArray(v)) {
    if (v.length === 0) return "(empty list)";
    // Short arrays of scalars — inline; anything larger, JSON-pretty
    if (v.every((x) => typeof x === "string" || typeof x === "number")) {
      return v.join(", ");
    }
    return JSON.stringify(v, null, 2);
  }
  try {
    return JSON.stringify(v, null, 2);
  } catch {
    return String(v);
  }
}

function changeBadge(type?: string): "success" | "danger" | "info" | "default" {
  if (type === "added") return "success";
  if (type === "removed") return "danger";
  if (type === "modified") return "info";
  return "default";
}

function changeVerb(type?: string): string {
  if (type === "added") return "was added";
  if (type === "removed") return "was removed";
  return "was changed";
}

export default function VersionDiffModal({
  open,
  onClose,
  resourceType,
  resourceName,
  profile,
  targetVersion,
  compareVersion,
}: VersionDiffModalProps) {
  const dataProvider = useDataProvider();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [diff, setDiff] = useState<DiffPayload | null>(null);
  const [configJson, setConfigJson] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancel = false;
    setLoading(true);
    setError(null);
    setDiff(null);
    setConfigJson(null);

    async function run() {
      try {
        if (compareVersion !== undefined && compareVersion !== targetVersion) {
          // Convention: diff shows v1=older → v2=newer.
          const older = Math.min(targetVersion, compareVersion);
          const newer = Math.max(targetVersion, compareVersion);
          const res = await dataProvider.diffVersions(
            resourceType,
            profile,
            resourceName,
            older,
            newer,
          );
          if (cancel) return;
          setDiff(res.data as DiffPayload);
        } else {
          const res = await dataProvider.getVersion(
            resourceType,
            profile,
            resourceName,
            targetVersion,
          );
          if (cancel) return;
          const payload = (res.data as { config_payload?: unknown } | null)
            ?.config_payload;
          setConfigJson(
            payload ? JSON.stringify(payload, null, 2) : "(empty)",
          );
        }
      } catch (err) {
        if (!cancel) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancel) setLoading(false);
      }
    }
    void run();
    return () => {
      cancel = true;
    };
  }, [
    open,
    dataProvider,
    resourceType,
    resourceName,
    profile,
    targetVersion,
    compareVersion,
  ]);

  const title =
    compareVersion !== undefined && compareVersion !== targetVersion
      ? `Diff: v${Math.min(targetVersion, compareVersion)} → v${Math.max(
          targetVersion,
          compareVersion,
        )}`
      : `Version v${targetVersion}`;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      className="max-w-4xl"
      footer={
        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      }
    >
      {loading ? (
        <div className="space-y-2">
          <Skeleton variant="rectangular" className="h-8 w-full" />
          <Skeleton variant="rectangular" className="h-16 w-full" />
          <Skeleton variant="rectangular" className="h-16 w-full" />
        </div>
      ) : error ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          {error}
        </div>
      ) : diff ? (
        <DiffBody diff={diff} />
      ) : configJson ? (
        <div>
          <div className="mb-2 flex items-center gap-2 text-sm text-slate-500">
            <FileJson className="h-4 w-4" />
            No previous version to compare — showing full config for v
            {targetVersion}.
          </div>
          <pre className="max-h-[60vh] overflow-auto rounded-md border border-slate-200 bg-slate-50 p-3 font-mono text-xs text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
            {configJson}
          </pre>
        </div>
      ) : (
        <p className="text-sm text-slate-500">Nothing to show.</p>
      )}
    </Dialog>
  );
}

function DiffBody({ diff }: { diff: DiffPayload }) {
  // Drop bookkeeping fields the operator doesn't care about
  const meaningful = (diff.changes ?? []).filter((c) => {
    const top = c.field.split(".")[0];
    return !HIDDEN_FIELDS.has(top) && !HIDDEN_FIELDS.has(c.field);
  });

  if (meaningful.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No meaningful differences between v{diff.v1.version} and v
        {diff.v2.version}.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
        <Badge variant="default" size="sm">
          <GitCommit className="mr-1 h-3 w-3" />v{diff.v1.version}
        </Badge>
        <ArrowRight className="h-3 w-3 text-slate-400" />
        <Badge variant="info" size="sm">
          <GitCommit className="mr-1 h-3 w-3" />v{diff.v2.version}
        </Badge>
        <span className="text-slate-500">
          {meaningful.length}{" "}
          {meaningful.length === 1 ? "change" : "changes"}
        </span>
      </div>
      <ul className="max-h-[65vh] space-y-3 overflow-auto pr-1">
        {meaningful.map((c, i) => {
          const label = humanise(c.field);
          const before = renderValue(c.field, c.old_value);
          const after = renderValue(c.field, c.new_value);
          const isShort =
            before.length < 60 && after.length < 60 &&
            !before.includes("\n") && !after.includes("\n");
          return (
            <li
              key={`${c.field}-${i}`}
              className="rounded-md border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-slate-100 px-3 py-2 dark:border-slate-800">
                <Badge variant={changeBadge(c.change_type)} size="sm">
                  {c.change_type ?? "modified"}
                </Badge>
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {label}
                </span>
                <code
                  className="text-[11px] font-mono text-slate-400 dark:text-slate-500"
                  title="Original field path"
                >
                  ({c.field})
                </code>
              </div>

              {isShort ? (
                <p className="px-3 py-3 text-sm text-slate-700 dark:text-slate-300">
                  <span className="text-slate-500">{label} </span>
                  {changeVerb(c.change_type)}{" "}
                  {c.change_type !== "added" && (
                    <>
                      from{" "}
                      <span className="rounded bg-red-50 px-1.5 py-0.5 font-mono text-xs text-red-800 dark:bg-red-950/40 dark:text-red-300">
                        {before}
                      </span>{" "}
                    </>
                  )}
                  {c.change_type !== "removed" && (
                    <>
                      to{" "}
                      <span className="rounded bg-green-50 px-1.5 py-0.5 font-mono text-xs text-green-800 dark:bg-green-950/40 dark:text-green-300">
                        {after}
                      </span>
                    </>
                  )}
                  .
                </p>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100 dark:divide-slate-800">
                  <ValueCell
                    label="Before"
                    field={c.field}
                    value={c.old_value}
                    tone="removed"
                  />
                  <ValueCell
                    label="After"
                    field={c.field}
                    value={c.new_value}
                    tone="added"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ValueCell({
  label,
  field,
  value,
  tone,
}: {
  label: string;
  field: string;
  value: unknown;
  tone: "added" | "removed";
}) {
  const rendered = renderValue(field, value);
  const isMissing = value === null || value === undefined;
  return (
    <div className="px-3 py-2">
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </div>
      <pre
        className={cn(
          "max-h-64 overflow-auto rounded-md p-2 font-mono text-xs whitespace-pre-wrap break-words",
          isMissing
            ? "bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500"
            : tone === "removed"
              ? "bg-red-50 text-red-800 dark:bg-red-950/30 dark:text-red-300"
              : "bg-green-50 text-green-800 dark:bg-green-950/30 dark:text-green-300",
        )}
      >
        {rendered}
      </pre>
    </div>
  );
}
