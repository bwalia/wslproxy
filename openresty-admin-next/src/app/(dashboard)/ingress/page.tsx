"use client";

import { useCallback, useMemo, useState } from "react";
import useSWR from "swr";
import {
  ArrowUpCircle,
  CheckCircle2,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { dataProvider } from "@/lib/api/data-provider";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils/cn";

/**
 * Ingress Overview — traffic-split management.
 *
 * Mirrors the legacy openresty-admin/src/IngressOverview route.  For
 * each rule with >1 backend:
 *  - shows per-backend health (healthy / down), current weight, live
 *    request / error counts;
 *  - lets operators adjust weights with sliders ("Apply" commits);
 *  - offers one-click Promote (send 100% to one backend) and Rollback
 *    (single-backend fallback) — both gated by a confirm dialog since
 *    they're traffic-shifting operations.
 */

interface BackendRow {
  label?: string;
  address?: string;
  weight?: number;
  healthy?: boolean;
  stats?: {
    requests?: number;
    errors?: number;
    avg_latency_ms?: number;
    error_rate?: number;
  };
}

interface RuleRow {
  rule_id: string;
  rule_name?: string;
  server_name?: string;
  path?: string;
  routing?: { mode?: string };
  backends?: BackendRow[];
  backend_stats?: Record<string, BackendRow["stats"]>;
}

interface TopologyPayload {
  rules_with_backends?: RuleRow[];
}

interface HealthRule {
  rule_id: string;
  backends?: { label?: string; address?: string; healthy?: boolean }[];
}

const nf = new Intl.NumberFormat();

export default function IngressOverviewPage() {
  const { notify } = useNotification();
  const [confirm, setConfirm] = useState<{
    open: boolean;
    title: string;
    message: string;
    action: (() => Promise<void>) | null;
  }>({
    open: false,
    title: "",
    message: "",
    action: null,
  });

  const {
    data: topoResp,
    isLoading: topoLoading,
    mutate: refetchTopo,
  } = useSWR("traffic-topology", () => dataProvider.getTrafficTopology(), {
    revalidateOnFocus: false,
    refreshInterval: 15_000,
  });

  const {
    data: healthResp,
    isLoading: healthLoading,
    mutate: refetchHealth,
  } = useSWR("traffic-health", () => dataProvider.getTrafficHealth(), {
    revalidateOnFocus: false,
    refreshInterval: 15_000,
  });

  const refresh = useCallback(async () => {
    await Promise.all([refetchTopo(), refetchHealth()]);
  }, [refetchTopo, refetchHealth]);

  // Merge health into topology by rule_id + backend label so each row
  // has a single source of truth.
  const rules = useMemo<RuleRow[]>(() => {
    const topo = (topoResp?.data as TopologyPayload | undefined)
      ?.rules_with_backends;
    if (!topo) return [];
    const health = (healthResp?.data as HealthRule[] | undefined) ?? [];
    const healthByRule = new Map<string, HealthRule>();
    for (const h of health) healthByRule.set(h.rule_id, h);

    return topo
      .filter((r) => Array.isArray(r.backends) && r.backends.length > 0)
      .map((rule) => {
        const healthRule = healthByRule.get(rule.rule_id);
        const healthByBackend = new Map<string, boolean>();
        (healthRule?.backends ?? []).forEach((b) => {
          const k = b.label || b.address || "";
          if (k) healthByBackend.set(k, b.healthy !== false);
        });
        return {
          ...rule,
          backends: (rule.backends ?? []).map((b) => {
            const k = b.label || b.address || "";
            const stats = rule.backend_stats?.[k] ?? {};
            return {
              ...b,
              healthy: healthByBackend.get(k) ?? true,
              stats: {
                requests: stats.requests ?? 0,
                errors: stats.errors ?? 0,
                avg_latency_ms: stats.avg_latency_ms ?? 0,
                error_rate: stats.error_rate ?? 0,
              },
            };
          }),
        };
      });
  }, [topoResp, healthResp]);

  // Summary counters across all rules with multi-backend routing.
  const summary = useMemo(() => {
    const totalRules = rules.length;
    const totalBackends = rules.reduce(
      (s, r) => s + (r.backends?.length ?? 0),
      0,
    );
    const healthy = rules.reduce(
      (s, r) => s + (r.backends?.filter((b) => b.healthy).length ?? 0),
      0,
    );
    const totalReq = rules.reduce(
      (s, r) =>
        s + (r.backends?.reduce((a, b) => a + (b.stats?.requests ?? 0), 0) ?? 0),
      0,
    );
    const totalErr = rules.reduce(
      (s, r) =>
        s + (r.backends?.reduce((a, b) => a + (b.stats?.errors ?? 0), 0) ?? 0),
      0,
    );
    const errRate = totalReq > 0 ? (totalErr / totalReq) * 100 : 0;
    return { totalRules, totalBackends, healthy, totalReq, totalErr, errRate };
  }, [rules]);

  const handleApplyWeights = useCallback(
    async (ruleId: string, backends: { label: string; weight: number }[]) => {
      try {
        await dataProvider.updateTrafficWeights({
          rule_id: ruleId,
          backends,
        });
        notify("Traffic weights updated", { type: "success" });
        refresh();
      } catch (err) {
        notify(
          "Failed to update weights: " + ((err as Error).message || String(err)),
          { type: "error" },
        );
      }
    },
    [notify, refresh],
  );

  const openPromote = useCallback(
    (ruleId: string, label: string) => {
      setConfirm({
        open: true,
        title: `Promote "${label}" to 100% traffic?`,
        message: `All traffic on this rule will route to "${label}". Other backends will receive 0%.`,
        action: async () => {
          try {
            await dataProvider.promoteBackend({
              rule_id: ruleId,
              promote_label: label,
            });
            notify(`Backend "${label}" promoted to 100%`, { type: "success" });
            refresh();
          } catch (err) {
            notify(
              "Promote failed: " + ((err as Error).message || String(err)),
              { type: "error" },
            );
          }
        },
      });
    },
    [notify, refresh],
  );

  const openRollback = useCallback(
    (ruleId: string) => {
      setConfirm({
        open: true,
        title: "Rollback to single-backend routing?",
        message:
          "Restores this rule to routing all traffic to the first healthy backend, disabling the split.",
        action: async () => {
          try {
            await dataProvider.rollbackBackend({ rule_id: ruleId });
            notify("Rolled back to single backend", { type: "success" });
            refresh();
          } catch (err) {
            notify(
              "Rollback failed: " + ((err as Error).message || String(err)),
              { type: "error" },
            );
          }
        },
      });
    },
    [notify, refresh],
  );

  const loading = topoLoading || healthLoading;

  return (
    <div>
      <PageHeader
        title="Ingress Overview"
        subtitle="Live view + controls for multi-backend rule traffic splits"
        icon={Share2}
        actions={
          <Button
            variant="ghost"
            onClick={refresh}
            icon={<RefreshCw className="h-4 w-4" />}
          >
            Refresh
          </Button>
        }
      />

      {/* ── Summary stats ────────────────────────────────────────────── */}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatPill label="Rules with splits" value={summary.totalRules} />
        <StatPill label="Total backends" value={summary.totalBackends} />
        <StatPill
          label="Healthy"
          value={`${summary.healthy}/${summary.totalBackends}`}
          tone={
            summary.totalBackends === 0
              ? "neutral"
              : summary.healthy === summary.totalBackends
                ? "ok"
                : "warn"
          }
        />
        <StatPill
          label="Error rate"
          value={`${summary.errRate.toFixed(2)}%`}
          tone={
            summary.errRate > 5 ? "bad" : summary.errRate > 1 ? "warn" : "ok"
          }
        />
      </div>

      {loading && rules.length === 0 ? (
        <div className="space-y-4">
          <Skeleton variant="rectangular" className="h-40 w-full" />
          <Skeleton variant="rectangular" className="h-40 w-full" />
        </div>
      ) : rules.length === 0 ? (
        <Card>
          <Card.Body>
            <div className="flex items-center gap-3 py-8">
              <ShieldCheck className="h-6 w-6 text-slate-300 dark:text-slate-600" />
              <div>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-200">
                  No multi-backend rules configured.
                </p>
                <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                  Add backends to a rule&rsquo;s routing settings to see
                  traffic splits here.
                </p>
              </div>
            </div>
          </Card.Body>
        </Card>
      ) : (
        <div className="space-y-4">
          {rules.map((r) => (
            <RuleTrafficCard
              key={r.rule_id}
              rule={r}
              onApply={handleApplyWeights}
              onPromote={openPromote}
              onRollback={openRollback}
            />
          ))}
        </div>
      )}

      <ConfirmDialog
        open={confirm.open}
        title={confirm.title}
        message={confirm.message}
        confirmLabel="Confirm"
        onConfirm={async () => {
          if (confirm.action) await confirm.action();
          setConfirm((c) => ({ ...c, open: false, action: null }));
        }}
        onCancel={() =>
          setConfirm((c) => ({ ...c, open: false, action: null }))
        }
      />
    </div>
  );
}

// ─── Small helpers ──────────────────────────────────────────────────────

function StatPill({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  tone?: "neutral" | "ok" | "warn" | "bad";
}) {
  const toneClass =
    tone === "ok"
      ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200"
      : tone === "warn"
        ? "border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
        : tone === "bad"
          ? "border-red-200 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "border-slate-200 bg-white text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200";

  return (
    <div className={cn("rounded-lg border px-3 py-2", toneClass)}>
      <div className="text-xs font-medium opacity-70">{label}</div>
      <div className="mt-0.5 text-lg font-semibold">{value}</div>
    </div>
  );
}

// ─── Per-rule card with weight sliders + action buttons ─────────────────

function RuleTrafficCard({
  rule,
  onApply,
  onPromote,
  onRollback,
}: {
  rule: RuleRow;
  onApply: (
    ruleId: string,
    backends: { label: string; weight: number }[],
  ) => void;
  onPromote: (ruleId: string, label: string) => void;
  onRollback: (ruleId: string) => void;
}) {
  const backends = rule.backends ?? [];

  // Local weight state keyed by label (falls back to address).  We
  // rebuild from props whenever the rule data changes so external
  // updates (another tab, SWR refresh) don't get stomped by stale
  // sliders.
  const initialWeights = useMemo(() => {
    const w: Record<string, number> = {};
    backends.forEach((b) => {
      const k = b.label || b.address || "";
      if (k) w[k] = b.weight ?? 0;
    });
    return w;
  }, [backends]);

  const [weights, setWeights] = useState<Record<string, number>>(initialWeights);
  const [dirty, setDirty] = useState(false);

  // Reset local state when server data changes and we're not in the
  // middle of an edit — avoids overwriting user input mid-drag.
  const weightSig = Object.entries(initialWeights)
    .map(([k, v]) => `${k}:${v}`)
    .sort()
    .join(",");
  useMemo(() => {
    setWeights(initialWeights);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightSig]);

  const labels = Object.keys(weights);

  const handleSlide = (label: string, next: number) => {
    if (labels.length === 2) {
      // For exactly two backends, auto-balance so the pair always sums
      // to 100 — matches the legacy UX.
      const other = labels.find((l) => l !== label);
      if (!other) return;
      setWeights({ [label]: next, [other]: 100 - next });
    } else {
      setWeights((prev) => ({ ...prev, [label]: next }));
    }
    setDirty(true);
  };

  const weightSum = Object.values(weights).reduce((s, v) => s + v, 0);

  const handleApply = () => {
    const payload = Object.entries(weights).map(([label, weight]) => ({
      label,
      weight,
    }));
    onApply(rule.rule_id, payload);
  };

  return (
    <Card>
      <Card.Header>
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {rule.rule_name || rule.rule_id}
          </h3>
          <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            {rule.server_name && <span>{rule.server_name}</span>}
            {rule.path && rule.path !== "/" && (
              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono dark:bg-slate-800">
                {rule.path}
              </span>
            )}
            <Badge variant="info" size="sm">
              {rule.routing?.mode || "weighted"}
            </Badge>
          </div>
        </div>
        {backends.length >= 2 && (
          <div className="flex flex-wrap gap-2">
            {backends.map((b) => {
              const label = b.label || b.address || "";
              if (!label) return null;
              return (
                <Button
                  key={label}
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => onPromote(rule.rule_id, label)}
                  icon={<ArrowUpCircle className="h-3.5 w-3.5" />}
                >
                  Promote {label}
                </Button>
              );
            })}
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onRollback(rule.rule_id)}
              icon={<RotateCcw className="h-3.5 w-3.5" />}
            >
              Rollback
            </Button>
          </div>
        )}
      </Card.Header>
      <Card.Body>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* ── Weight sliders ──────────────────────────────────────── */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Traffic Weights
            </h4>
            <div className="space-y-3">
              {labels.map((label) => (
                <div key={label}>
                  <div className="mb-1 flex items-center justify-between text-xs">
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {label}
                    </span>
                    <span className="font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {weights[label]}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={weights[label]}
                    onChange={(e) =>
                      handleSlide(label, Number(e.target.value))
                    }
                    className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-slate-200 accent-primary-600 dark:bg-slate-700"
                    aria-label={`${label} weight`}
                  />
                </div>
              ))}
            </div>
            {dirty && (
              <div className="mt-3 flex items-center justify-between gap-3">
                <span
                  className={cn(
                    "text-xs",
                    weightSum === 100
                      ? "text-slate-500 dark:text-slate-400"
                      : "text-amber-600 dark:text-amber-400",
                  )}
                >
                  Sum: {weightSum}%{weightSum !== 100 && " (should be 100)"}
                </span>
                <Button type="button" size="sm" onClick={handleApply}>
                  Apply Weights
                </Button>
              </div>
            )}
          </div>

          {/* ── Backend table ────────────────────────────────────────── */}
          <div>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
              Backend Health
            </h4>
            <div className="space-y-1.5">
              {backends.map((b) => {
                const label = b.label || b.address || "-";
                const stats = b.stats ?? {};
                return (
                  <div
                    key={label}
                    className="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-xs dark:border-slate-700"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      {b.healthy ? (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                      ) : (
                        <XCircle className="h-4 w-4 shrink-0 text-red-500" />
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-medium text-slate-900 dark:text-slate-100">
                          {label}
                        </div>
                        {b.address && b.address !== label && (
                          <div className="truncate font-mono text-[11px] text-slate-500 dark:text-slate-400">
                            {b.address}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-3 text-right">
                      <span className="font-mono text-slate-700 dark:text-slate-300">
                        {nf.format(stats.requests ?? 0)} req
                      </span>
                      <span
                        className={cn(
                          "font-mono",
                          (stats.errors ?? 0) > 0
                            ? "text-red-600 dark:text-red-400"
                            : "text-slate-500 dark:text-slate-400",
                        )}
                      >
                        {nf.format(stats.errors ?? 0)} err
                      </span>
                      <span className="w-12 font-mono text-slate-500 dark:text-slate-400">
                        {(stats.avg_latency_ms ?? 0).toFixed(0)}ms
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Card.Body>
    </Card>
  );
}
