"use client";

import React, { useCallback, useMemo, useTransition } from "react";
import {
  ShieldCheck,
  ShieldAlert,
  Activity,
  Ban,
  Info,
  RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import StatusBadge from "@/components/ui/StatusBadge";
import Skeleton from "@/components/ui/Skeleton";
import { useList } from "@/hooks/useResource";
import { refreshWafStats } from "@/lib/dashboard/actions";

// ── Types ───────────────────────────────────────────────────────────────

interface WafRule {
  id: string;
  [key: string]: unknown;
}

interface WafPolicy {
  id: string;
  [key: string]: unknown;
}

interface WafEvent {
  id: string;
  type: string;
  host?: string;
  server_name?: string;
  [key: string]: unknown;
}

interface ServerRecord {
  id: string;
  server_name: string;
  waf_enabled?: boolean;
  waf_policy_id?: string;
  waf_mode?: string;
  [key: string]: unknown;
}

interface ServerWafRow {
  server_name: string;
  waf_policy_id: string;
  waf_mode: string;
  inspected: number;
  blocked: number;
  monitored: number;
}

// ── Sub-components ──────────────────────────────────────────────────────

const StatCard = React.memo(function StatCard({
  icon: Icon,
  label,
  value,
  variant = "default",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  variant?: "default" | "success" | "danger" | "warning";
}) {
  const iconColors: Record<string, string> = {
    default: "text-slate-500 dark:text-slate-400",
    success: "text-green-500",
    danger: "text-red-500",
    warning: "text-amber-500",
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex items-center justify-center h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800",
            iconColors[variant]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {value}
          </p>
        </div>
      </div>
    </Card>
  );
});

// ── Main component ──────────────────────────────────────────────────────

const WafOverview: React.FC = () => {
  const {
    data: wafRules,
    isLoading: rulesLoading,
    mutate: mutateRules,
  } = useList<WafRule>("waf_rules");

  const {
    data: wafPolicies,
    isLoading: policiesLoading,
    mutate: mutatePolicies,
  } = useList<WafPolicy>("waf_policies");

  const {
    data: wafEvents,
    isLoading: eventsLoading,
    mutate: mutateEvents,
  } = useList<WafEvent>("waf_events");

  const {
    data: servers,
    isLoading: serversLoading,
    mutate: mutateServers,
  } = useList<ServerRecord>("servers");

  const [refreshing, startRefresh] = useTransition();

  const handleRefresh = useCallback(() => {
    startRefresh(async () => {
      // Invalidate the server-side tag first so the next page
      // navigation streams fresh data.  Then force the SWR hooks to
      // re-fetch now so the user sees the update without navigating.
      await refreshWafStats();
      await Promise.all([
        mutateRules(),
        mutatePolicies(),
        mutateEvents(),
        mutateServers(),
      ]);
    });
  }, [mutateRules, mutatePolicies, mutateEvents, mutateServers]);

  const isLoading = rulesLoading || policiesLoading || eventsLoading || serversLoading;

  const safeEvents = Array.isArray(wafEvents) ? wafEvents : [];
  const safeServers = Array.isArray(servers) ? servers : [];

  const blockedThreats = useMemo(
    () => safeEvents.filter((e) => e.type === "blocked").length,
    [safeEvents]
  );

  const serverWafRows = useMemo<ServerWafRow[]>(() => {
    const wafServers = safeServers.filter((s) => s.waf_enabled);
    if (wafServers.length === 0) return [];

    // Build event counts by host
    const eventsByHost = new Map<
      string,
      { inspected: number; blocked: number; monitored: number }
    >();

    for (const event of safeEvents) {
      const host = event.host ?? event.server_name ?? "unknown";
      const existing = eventsByHost.get(host) ?? {
        inspected: 0,
        blocked: 0,
        monitored: 0,
      };
      existing.inspected += 1;
      if (event.type === "blocked") existing.blocked += 1;
      if (event.type === "monitored") existing.monitored += 1;
      eventsByHost.set(host, existing);
    }

    return wafServers.map((server) => {
      const counts = eventsByHost.get(server.server_name) ?? {
        inspected: 0,
        blocked: 0,
        monitored: 0,
      };
      return {
        server_name: server.server_name,
        waf_policy_id: (server.waf_policy_id as string) ?? "—",
        waf_mode: (server.waf_mode as string) ?? "unknown",
        inspected: counts.inspected,
        blocked: counts.blocked,
        monitored: counts.monitored,
      };
    });
  }, [safeServers, safeEvents]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton variant="rectangular" className="h-16" />
            </Card>
          ))}
        </div>
        <Card>
          <Card.Header>
            <Skeleton className="h-5 w-48" />
          </Card.Header>
          <Card.Body>
            <Skeleton variant="rectangular" className="h-40" />
          </Card.Body>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row with refresh.  Invalidates the `dashboard-waf`
          cache tag + forces the SWR lists to re-fetch. */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            WAF Overview
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Rules, policies, events, and per-server activity.
          </p>
        </div>
        <button
          type="button"
          onClick={handleRefresh}
          disabled={refreshing}
          aria-label="Refresh WAF stats"
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
        >
          <RefreshCw
            className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
            aria-hidden="true"
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      {/* WAF Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={ShieldCheck}
          label="WAF Rules"
          value={Array.isArray(wafRules) ? wafRules.length : 0}
        />
        <StatCard
          icon={ShieldAlert}
          label="WAF Policies"
          value={Array.isArray(wafPolicies) ? wafPolicies.length : 0}
        />
        <StatCard
          icon={Activity}
          label="Total Events"
          value={safeEvents.length}
        />
        <StatCard
          icon={Ban}
          label="Blocked Threats"
          value={blockedThreats}
          variant={blockedThreats > 0 ? "danger" : "success"}
        />
      </div>

      {/* WAF Activity by Server */}
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              WAF Activity by Server
            </h3>
          </div>
        </Card.Header>
        <Card.Body className="p-0">
          {serverWafRows.length === 0 ? (
            <div className="flex items-center gap-3 py-8 justify-center text-slate-500 dark:text-slate-400 px-6">
              <Info className="h-5 w-5" />
              <p>No WAF activity data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400">
                      Server Name
                    </th>
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400">
                      Status
                    </th>
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400">
                      Policy ID
                    </th>
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400">
                      Mode
                    </th>
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400 text-right">
                      Inspected
                    </th>
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400 text-right">
                      Blocked
                    </th>
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400 text-right">
                      Monitored
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {serverWafRows.map((row) => (
                    <tr
                      key={row.server_name}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-2.5 px-6 font-medium text-slate-900 dark:text-slate-100">
                        {row.server_name}
                      </td>
                      <td className="py-2.5 px-6">
                        <StatusBadge status="active" />
                      </td>
                      <td className="py-2.5 px-6 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {row.waf_policy_id}
                      </td>
                      <td className="py-2.5 px-6">
                        <Badge
                          variant={
                            row.waf_mode.toLowerCase() === "block"
                              ? "danger"
                              : "warning"
                          }
                          size="sm"
                        >
                          {row.waf_mode.charAt(0).toUpperCase() +
                            row.waf_mode.slice(1)}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-6 text-right text-slate-700 dark:text-slate-300">
                        {row.inspected.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-6 text-right text-slate-700 dark:text-slate-300">
                        {row.blocked.toLocaleString()}
                      </td>
                      <td className="py-2.5 px-6 text-right text-slate-700 dark:text-slate-300">
                        {row.monitored.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card.Body>
      </Card>
    </div>
  );
};

WafOverview.displayName = "WafOverview";

export default React.memo(WafOverview);
