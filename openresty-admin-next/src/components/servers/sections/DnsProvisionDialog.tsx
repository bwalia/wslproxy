"use client";

import { useCallback, useEffect, useState } from "react";
import {
  Loader2,
  Plus,
  Pencil,
  Trash2,
  Check,
  AlertCircle,
  AlertTriangle,
} from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import { useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";

/**
 * Two-step DNS provisioning dialog.
 *
 * Phase 1 — PREVIEW (dry_run=true):
 *   On open, calls `dataProvider.provisionDns({dry_run: true})` to
 *   build the action plan.  Shows each (POP → IP, action) row so the
 *   operator can review *before* anything writes.  This is the
 *   "what will happen?" surface.
 *
 * Phase 2 — APPLY (dry_run=false):
 *   Clicking "Apply N changes" calls the same endpoint without
 *   dry_run.  Renders the executed results inline, including any
 *   per-action errors (Cloudflare can succeed on some records and
 *   fail on others; the orchestrator reports each independently).
 *
 * Why a single dialog rather than two: the user is making one
 * decision — "is this plan correct?" — and the moment of confirmation
 * shouldn't navigate them somewhere else.  The same dialog rerenders
 * results in-place after apply, with a clear "Close" once done.
 */

type ActionKind =
  | "created"
  | "updated"
  | "unchanged"
  | "deleted"
  | "deleted_legacy"
  | "create"
  | "update"
  | "delete"
  | "delete_legacy"
  | "error";

interface PlanAction {
  action: ActionKind;
  pop_id?: string;
  /** Record type the action targets — present when BOTH mode produces
   *  a mixed list (A + AAAA), and on every action emitted by the
   *  refactored planner.  Older plans omit it (treated as "A"). */
  record_type?: "A" | "AAAA" | "CNAME";
  content?: string;
  from_content?: string;
  record_id?: string;
  error?: string;
}

interface Plan {
  domain: string;
  zone_id: string;
  zone_name: string;
  dry_run?: boolean;
  actions: PlanAction[];
  skipped: Array<{ pop_id: string; reason: string }>;
}

// Matches the ApiError thrown by apiFetch — flat fields on the error
// instance.  parseBackendError reads from the backend's nested
// `{ error: { message, code, details } }` envelope and exposes the
// extracted values directly on the ApiError.
interface ApiError {
  message?: string;
  code?: string;
  status?: number;
  details?: unknown;
}

interface DnsProvisionDialogProps {
  open: boolean;
  serverId: string;
  profileId: string;
  serverName: string;
  onClose: () => void;
  /** Called after a successful apply so the parent can refresh its
   *  DNS state panel. */
  onApplied?: () => void;
}

/** Action → visual treatment.  Kept in one place so plan rows and
 *  result rows render identically.  Mutating actions (create / update
 *  / delete) get distinct icons + colours; unchanged is muted; error
 *  is loud. */
const ACTION_META: Record<
  ActionKind,
  {
    label: string;
    badge: "success" | "warning" | "danger" | "info" | "default";
    icon: typeof Plus;
  }
> = {
  create: { label: "Create", badge: "success", icon: Plus },
  created: { label: "Created", badge: "success", icon: Check },
  update: { label: "Update", badge: "warning", icon: Pencil },
  updated: { label: "Updated", badge: "warning", icon: Check },
  delete: { label: "Delete", badge: "danger", icon: Trash2 },
  deleted: { label: "Deleted", badge: "danger", icon: Check },
  delete_legacy: { label: "Delete (legacy)", badge: "danger", icon: Trash2 },
  deleted_legacy: { label: "Deleted (legacy)", badge: "danger", icon: Check },
  unchanged: { label: "Unchanged", badge: "default", icon: Check },
  error: { label: "Error", badge: "danger", icon: AlertCircle },
};

/** Skip reason → human-readable explanation.  POPs get filtered out
 *  of the desired set for one of a few reasons; surface them so the
 *  operator can see *why* a POP they assigned isn't in the plan. */
const SKIP_REASONS: Record<string, string> = {
  not_found: "POP id doesn't exist in data/pops/",
  no_public_ipv4: "POP has no public_ipv4 set",
  status_down: "POP status is 'down' — excluded by default",
  status_maintenance: "POP status is 'maintenance' — excluded by default",
};

export default function DnsProvisionDialog({
  open,
  serverId,
  profileId,
  serverName,
  onClose,
  onApplied,
}: DnsProvisionDialogProps) {
  const dataProvider = useDataProvider();
  const { notify } = useNotification();

  const [plan, setPlan] = useState<Plan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [applyLoading, setApplyLoading] = useState(false);
  const [appliedResult, setAppliedResult] = useState<Plan | null>(null);

  const fetchPlan = useCallback(async () => {
    setPlanLoading(true);
    setPlanError(null);
    setAppliedResult(null);
    try {
      const res = await dataProvider.provisionDns({
        server_id: serverId,
        profile_id: profileId,
        dry_run: true,
      });
      const planData = (res?.data ?? null) as Plan | null;
      if (planData) {
        // Empty actions/skipped may arrive as `{}` (JSON object) from the
        // Lua backend; coerce so renderActions/renderSkipped `.map` is safe.
        if (!Array.isArray(planData.actions)) planData.actions = [];
        if (!Array.isArray(planData.skipped)) planData.skipped = [];
      }
      setPlan(planData);
    } catch (err) {
      // Surface the structured error message from the Lua module
      // verbatim — it's already designed to be operator-facing.
      const errObj = err as ApiError;
      setPlanError(errObj?.message || "Failed to build plan");
    } finally {
      setPlanLoading(false);
    }
  }, [dataProvider, serverId, profileId]);

  // Re-fetch the plan every time the dialog opens (or when the
  // server identity changes).  Closing the dialog leaves the plan
  // in state, but the next open() resets to a fresh fetch — we
  // don't want a stale plan from 10 minutes ago when something has
  // changed in the meantime.
  useEffect(() => {
    if (open) {
      void fetchPlan();
    }
  }, [open, fetchPlan]);

  const handleApply = useCallback(async () => {
    setApplyLoading(true);
    try {
      const res = await dataProvider.provisionDns({
        server_id: serverId,
        profile_id: profileId,
        dry_run: false,
      });
      const result = (res?.data ?? null) as Plan | null;
      if (result) {
        if (!Array.isArray(result.actions)) result.actions = [];
        if (!Array.isArray(result.skipped)) result.skipped = [];
      }
      setAppliedResult(result);
      const errorCount = (result?.actions ?? []).filter(
        (a) => a.action === "error",
      ).length;
      if (errorCount > 0) {
        notify(`Applied with ${errorCount} error(s) — review below`, {
          type: "warning",
        });
      } else {
        notify("DNS provisioning applied", { type: "success" });
        onApplied?.();
      }
    } catch (err) {
      const errObj = err as ApiError;
      notify(errObj?.message || "Failed to apply", { type: "error" });
    } finally {
      setApplyLoading(false);
    }
  }, [dataProvider, serverId, profileId, notify, onApplied]);

  // The body we show depends on what stage we're at: loading the
  // plan, failed to build the plan, plan visible (preview), applying,
  // applied.  Each branch returns its own JSX so the rendering logic
  // stays linear and easy to reason about.
  const renderActions = (actions: PlanAction[]) => {
    if (actions.length === 0) {
      return (
        <div className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-200">
          ✓ Cloudflare already matches the desired state — nothing to do.
        </div>
      );
    }
    return (
      <div className="space-y-2">
        {actions.map((a, idx) => {
          const meta = ACTION_META[a.action];
          const Icon = meta.icon;
          return (
            <div
              key={`${a.action}-${a.pop_id ?? a.record_id ?? idx}`}
              className="flex items-start gap-3 rounded-md border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-800/50"
            >
              <Icon className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={meta.badge} size="sm">
                    {meta.label}
                  </Badge>
                  {a.pop_id && (
                    <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
                      {a.pop_id}
                    </span>
                  )}
                  <span className="text-xs text-slate-500">
                    {a.record_type || "A"} record
                  </span>
                </div>
                <div className="mt-1 font-mono text-xs text-slate-700 dark:text-slate-300">
                  {a.from_content && a.content && a.from_content !== a.content ? (
                    <>
                      <span className="text-slate-400">{a.from_content}</span>
                      <span className="mx-1 text-slate-400">→</span>
                      <span>{a.content}</span>
                    </>
                  ) : (
                    a.content || a.from_content || ""
                  )}
                </div>
                {a.error && (
                  <div className="mt-1 text-xs text-rose-600 dark:text-rose-400">
                    {a.error}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  const renderSkipped = (
    skipped: Array<{ pop_id: string; reason: string }>,
  ) => {
    if (skipped.length === 0) return null;
    return (
      <div className="mt-4 rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-900/20">
        <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          Skipped POPs ({skipped.length})
        </div>
        <ul className="space-y-1 text-xs text-amber-700 dark:text-amber-300">
          {skipped.map((s) => (
            <li key={s.pop_id}>
              <span className="font-mono">{s.pop_id}</span> —{" "}
              {SKIP_REASONS[s.reason] || s.reason}
            </li>
          ))}
        </ul>
      </div>
    );
  };

  // Build the visible plan based on which state we're in.  After an
  // apply, the appliedResult takes precedence (operator wants to see
  // what actually happened, not what was planned).
  const visiblePlan = appliedResult ?? plan;
  const hasApplied = appliedResult !== null;
  const mutatingActionsCount = (plan?.actions ?? []).filter(
    (a) => a.action !== "unchanged",
  ).length;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`DNS Provisioning — ${serverName}`}
      className="max-w-2xl"
      footer={
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={applyLoading}>
            {hasApplied ? "Close" : "Cancel"}
          </Button>
          {!hasApplied && plan && !planError && (
            <Button
              variant="primary"
              onClick={handleApply}
              loading={applyLoading}
              disabled={mutatingActionsCount === 0}
            >
              {mutatingActionsCount === 0
                ? "Nothing to apply"
                : `Apply ${mutatingActionsCount} change${mutatingActionsCount === 1 ? "" : "s"}`}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-3">
        {/* ── Zone summary line — always visible once we have data ── */}
        {visiblePlan && (
          <div className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-600 dark:bg-slate-800/50 dark:text-slate-400">
            Zone:{" "}
            <span className="font-mono text-slate-700 dark:text-slate-300">
              {visiblePlan.zone_name}
            </span>{" "}
            ·{" "}
            <span className="font-mono text-slate-500">
              {visiblePlan.zone_id}
            </span>
          </div>
        )}

        {/* ── Loading state ────────────────────────────────────────── */}
        {planLoading && (
          <div className="flex items-center gap-2 rounded-md bg-slate-50 px-3 py-4 text-sm text-slate-600 dark:bg-slate-800/50 dark:text-slate-300">
            <Loader2 className="h-4 w-4 animate-spin" />
            Building plan…
          </div>
        )}

        {/* ── Plan error ────────────────────────────────────────────── */}
        {planError && !planLoading && (
          <div className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800 dark:border-rose-800 dark:bg-rose-900/20 dark:text-rose-200">
            <div className="flex items-start gap-2">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Could not build plan</div>
                <div className="mt-1 text-xs">{planError}</div>
              </div>
            </div>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={fetchPlan}
            >
              Retry
            </Button>
          </div>
        )}

        {/* ── Plan visible (preview) ───────────────────────────────── */}
        {visiblePlan && !planLoading && (
          <>
            <div className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
              {hasApplied
                ? "Executed actions"
                : `Planned actions (${mutatingActionsCount} mutating)`}
            </div>
            {renderActions(visiblePlan.actions)}
            {renderSkipped(visiblePlan.skipped)}
          </>
        )}
      </div>
    </Dialog>
  );
}
