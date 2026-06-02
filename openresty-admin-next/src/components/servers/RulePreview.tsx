"use client";

import React, { useMemo, useState } from "react";
import {
  ArrowRight,
  ExternalLink,
  Eye,
  Globe,
  ShieldAlert,
  Code2,
  Info,
} from "lucide-react";
import { useOne } from "@/hooks/useResource";
import Badge from "@/components/ui/Badge";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import type { Rule, Backend } from "@/types";

/* ──────────────────────────────────────────────────────────────────────────
   RulePreview — inline summary strip + "View details" modal for a rule
   selected in the Server → Rules tab.

   Why this shape:
     The user is configuring a server and picks one or more rule IDs.  An
     ID is opaque ("rule_id_str"), so the form needs to surface the
     answer to "what does this rule actually do?" without forcing the
     operator to navigate away (and lose unsaved server-form changes).

     Solution: render a one-line summary directly under the picker — code
     badge + path-match + target — answering 80% of "what is this?" at a
     glance.  A "View details" button opens a modal with the full rule,
     and "Open in new tab" lets users actually edit it in a separate tab
     so the parent server form state stays intact.
   ────────────────────────────────────────────────────────────────────────── */

/* ── Code → semantics ─────────────────────────────────────────────────── */

interface CodeMeta {
  label: string;
  variant: "default" | "primary" | "success" | "warning" | "danger" | "info";
  description: string;
}

const CODE_META: Record<number, CodeMeta> = {
  200: { label: "200 CUSTOM", variant: "success", description: "Custom HTML response" },
  301: { label: "301 REDIRECT", variant: "info", description: "Permanent redirect" },
  302: { label: "302 REDIRECT", variant: "info", description: "Temporary redirect" },
  305: { label: "305 PROXY", variant: "primary", description: "Proxy pass to backend" },
  306: { label: "306 CAPTCHA", variant: "warning", description: "CAPTCHA challenge" },
  403: { label: "403 FORBIDDEN", variant: "danger", description: "Block request" },
};

const PATH_KEY_LABEL: Record<string, string> = {
  starts_with: "starts with",
  ends_with: "ends with",
  equals: "equals",
};

function metaFor(code: number | undefined): CodeMeta {
  if (code !== undefined && CODE_META[code]) return CODE_META[code];
  return {
    label: code !== undefined ? String(code) : "—",
    variant: "default",
    description: "Unknown response code",
  };
}

/* ── Inline summary — derived bits ────────────────────────────────────── */

interface SummaryBits {
  meta: CodeMeta;
  pathLine: string | null;
  targetLine: string | null;
  conditionsLine: string | null;
}

function summarize(rule: Rule | null): SummaryBits | null {
  if (!rule) return null;
  const m = rule.match?.rules ?? {};
  const r = rule.match?.response ?? {};
  const meta = metaFor(r.code);

  const pathLine = m.path
    ? `${PATH_KEY_LABEL[m.path_key ?? "starts_with"] ?? m.path_key ?? "matches"} ${m.path}`
    : null;

  // Pick the most informative single-line target description.
  let targetLine: string | null = null;
  const backends: Backend[] | undefined =
    r.backends ?? r.routing?.backends;
  if (r.code === 305) {
    if (backends && backends.length > 1) {
      targetLine = `${backends.length} backends · ${r.routing?.mode ?? "weighted"}`;
    } else if (backends && backends.length === 1) {
      targetLine = backends[0].address;
    } else if (r.redirect_uri) {
      targetLine = r.redirect_uri;
    }
  } else if (r.code === 301 || r.code === 302) {
    targetLine = r.redirect_uri ?? null;
  } else if (r.code === 200 || r.code === 403) {
    targetLine = r.message ? "Custom HTML body" : "Empty response";
  }

  // Extra match conditions, condensed into a short list.
  const extras: string[] = [];
  if (m.country) extras.push(`country ${m.country_key ?? "equals"} ${m.country}`);
  if (m.client_ip)
    extras.push(`IP ${m.client_ip_key ?? "equals"} ${m.client_ip}`);
  if (m.jwt_token_validation && m.jwt_token_validation !== "equals") {
    extras.push(m.jwt_token_validation.replace(/_/g, " "));
  }
  const conditionsLine = extras.length ? extras.join(" · ") : null;

  return { meta, pathLine, targetLine, conditionsLine };
}

/* ══════════════════════════════════════════════════════════════════════════
   <RulePreview ruleId="..." />
   Renders the inline summary strip and owns the modal toggle state.
   ══════════════════════════════════════════════════════════════════════════ */

export interface RulePreviewProps {
  ruleId: string;
  /** Optional className passed through to the outer wrapper. */
  className?: string;
}

const RulePreview: React.FC<RulePreviewProps> = ({ ruleId, className }) => {
  const [open, setOpen] = useState(false);
  const { data: rule, isLoading, error } = useOne<Rule>("rules", ruleId);

  const summary = useMemo(() => summarize(rule), [rule]);

  if (!ruleId) return null;

  // ── Loading skeleton ─────────────────────────────────────────────────
  if (isLoading && !rule) {
    return (
      <div
        className={`mt-2 flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-800/50 ${className ?? ""}`}
      >
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-48" />
      </div>
    );
  }

  // ── Error state ──────────────────────────────────────────────────────
  if (error || !summary) {
    return (
      <div
        className={`mt-2 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200 ${className ?? ""}`}
        role="alert"
      >
        <ShieldAlert className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Could not load rule details (id <code className="font-mono">{ruleId}</code>).
          The rule may have been deleted.
        </span>
      </div>
    );
  }

  return (
    <>
      <div
        className={`mt-2 flex items-start gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm dark:border-slate-700 dark:bg-slate-800/50 ${className ?? ""}`}
      >
        {/* Code badge */}
        <Badge variant={summary.meta.variant} size="sm" className="mt-0.5 shrink-0">
          {summary.meta.label}
        </Badge>

        {/* Middle: path → target.  Truncates instead of wrapping so the
            row stays one line tall on typical screens; full text is in
            the modal. */}
        <div className="min-w-0 flex-1 space-y-0.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-slate-700 dark:text-slate-300">
            {summary.pathLine && (
              <span className="truncate font-mono text-xs">
                {summary.pathLine}
              </span>
            )}
            {summary.pathLine && summary.targetLine && (
              <ArrowRight
                className="h-3.5 w-3.5 shrink-0 text-slate-400"
                aria-hidden="true"
              />
            )}
            {summary.targetLine && (
              <span className="truncate font-mono text-xs text-slate-600 dark:text-slate-400">
                {summary.targetLine}
              </span>
            )}
            {!summary.pathLine && !summary.targetLine && (
              <span className="text-xs italic text-slate-400">
                {summary.meta.description}
              </span>
            )}
          </div>
          {summary.conditionsLine && (
            <div className="truncate text-xs text-slate-500 dark:text-slate-400">
              {summary.conditionsLine}
            </div>
          )}
        </div>

        {/* View details trigger */}
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary-600 hover:bg-primary-50 hover:text-primary-700 dark:text-primary-400 dark:hover:bg-primary-900/20 dark:hover:text-primary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
          aria-label={`View details for rule ${rule?.name ?? ruleId}`}
        >
          <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          View
        </button>
      </div>

      {/* Modal — only mounted when open so the heavy detail render is
          skipped for collapsed rules. */}
      {rule && (
        <RuleDetailDialog
          rule={rule}
          open={open}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
};

RulePreview.displayName = "RulePreview";

export default RulePreview;

/* ══════════════════════════════════════════════════════════════════════════
   RuleDetailDialog — read-only full view
   ══════════════════════════════════════════════════════════════════════════ */

interface RuleDetailDialogProps {
  rule: Rule;
  open: boolean;
  onClose: () => void;
}

function RuleDetailDialog({ rule, open, onClose }: RuleDetailDialogProps) {
  const m = rule.match?.rules ?? {};
  const r = rule.match?.response ?? {};
  const meta = metaFor(r.code);
  const backends: Backend[] = r.backends ?? r.routing?.backends ?? [];

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={rule.name || "Rule details"}
      className="max-w-2xl"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {/* `target="_blank"` keeps the user's unsaved server-form
              state intact — they only navigate away if they
              explicitly want to edit. */}
          <a
            href={`/rules/${rule.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary-600 px-3 py-2 text-sm font-medium text-white hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
          >
            Edit rule
            <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
          </a>
        </>
      }
    >
      <div className="space-y-5">
        {/* ── Headline strip ─────────────────────────────────────────── */}
        <div className="flex items-center gap-3 rounded-lg bg-slate-50 px-3 py-2 dark:bg-slate-800/50">
          <Badge variant={meta.variant}>{meta.label}</Badge>
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {meta.description}
          </span>
          {rule.priority !== undefined && (
            <span className="ml-auto text-xs text-slate-500 dark:text-slate-400">
              Priority {rule.priority}
            </span>
          )}
        </div>

        {/* ── Match conditions ────────────────────────────────────────── */}
        <Section icon={Globe} title="Match conditions">
          <DetailRow
            label="Path"
            value={
              m.path
                ? `${m.path}  (${PATH_KEY_LABEL[m.path_key ?? "starts_with"] ?? m.path_key})`
                : null
            }
          />
          <DetailRow
            label="Country"
            value={m.country ? `${m.country}  (${m.country_key ?? "equals"})` : null}
          />
          <DetailRow
            label="Client IP"
            value={
              m.client_ip
                ? `${m.client_ip}  (${m.client_ip_key ?? "equals"})`
                : null
            }
          />
          <DetailRow
            label="Token validation"
            value={
              m.jwt_token_validation && m.jwt_token_validation !== "equals"
                ? m.jwt_token_validation.replace(/_/g, " ")
                : null
            }
          />
          {m.amazon_s3_region && (
            <DetailRow label="S3 region" value={m.amazon_s3_region} />
          )}
        </Section>

        {/* ── Response ─────────────────────────────────────────────────── */}
        <Section icon={Code2} title="Response">
          {(r.code === 301 || r.code === 302 || r.code === 305) && (
            <DetailRow label="Target" value={r.redirect_uri || null} mono />
          )}
          {r.code === 305 && (
            <>
              <DetailRow
                label="Routing mode"
                value={r.routing?.mode ?? "weighted"}
              />
              {r.strip_path !== undefined && (
                <DetailRow
                  label="Strip path"
                  value={r.strip_path ? "Yes" : "No"}
                />
              )}
              {r.auto_redirect_https && (
                <DetailRow label="Auto HTTPS" value="Yes" />
              )}
            </>
          )}
          {(r.code === 200 || r.code === 403) && (
            <DetailRow
              label="Body"
              value={r.message ? "Custom HTML (base64)" : "Empty"}
            />
          )}
        </Section>

        {/* ── Backends (305 only, when present) ────────────────────────── */}
        {backends.length > 0 && (
          <Section icon={Globe} title={`Backends (${backends.length})`}>
            <div className="space-y-1.5">
              {backends.map((b, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-2 rounded-md border border-slate-200 px-2 py-1.5 text-xs dark:border-slate-700"
                >
                  <code className="flex-1 truncate font-mono text-slate-700 dark:text-slate-300">
                    {b.address || <em className="text-slate-400">(empty)</em>}
                  </code>
                  {typeof b.weight === "number" && (
                    <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                      weight {b.weight}
                    </span>
                  )}
                  {b.label && (
                    <Badge variant="default" size="sm">
                      {b.label}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* ── Tags ────────────────────────────────────────────────────── */}
        {Array.isArray(rule.rules_tags) && rule.rules_tags.length > 0 && (
          <Section icon={Info} title="Tags">
            <div className="flex flex-wrap gap-1.5">
              {rule.rules_tags.map((t) => (
                <Badge key={t} variant="default" size="sm">
                  {t}
                </Badge>
              ))}
            </div>
          </Section>
        )}
      </div>
    </Dialog>
  );
}

/* ── Tiny presentational helpers — local to this file ───────────────── */

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ElementType;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  if (!value) return null;
  return (
    <div className="grid grid-cols-[120px_1fr] items-baseline gap-3 text-sm">
      <dt className="text-xs text-slate-500 dark:text-slate-400">{label}</dt>
      <dd
        className={`truncate text-slate-800 dark:text-slate-200 ${
          mono ? "font-mono text-xs" : ""
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
