"use client";

import { useCallback, useMemo, useState } from "react";
import { ShieldAlert, RotateCw } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import type { WafEvent } from "@/types";

/**
 * WAF events — real-time feed of firewall rule matches.
 *
 * Backend stores events in a shared dict (`ngx.shared.waf_events`), so
 * the feed is volatile: on nginx reload the dict clears.  The API
 * supports `filter[host]` and `filter[type]` query params.
 */

const ACTION_COLORS: Record<string, "danger" | "warning" | "info" | "default"> = {
  block: "danger",
  deny: "danger",
  monitor: "warning",
  log: "info",
};

const SEVERITY_COLORS: Record<string, "danger" | "warning" | "info" | "default"> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
};

const ACTIONS = [
  { value: "", label: "Any action" },
  { value: "block", label: "Block" },
  { value: "monitor", label: "Monitor" },
];

function epochToLocal(ts: unknown): string {
  if (typeof ts !== "number") return "-";
  return new Date(ts * 1000).toLocaleString();
}

export default function WafEventsPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [host, setHost] = useState("");
  const [action, setAction] = useState("");

  const backendFilter = useMemo(() => {
    const f: Record<string, string | number | undefined> = {};
    if (host) f.host = host;
    if (action) f.type = action; // backend uses `type` for action filter
    return f;
  }, [host, action]);

  const { data, total, isLoading, isValidating, error, mutate } = useList<WafEvent>(
    "waf_events",
    { filter: backendFilter, pagination: { page, perPage } },
  );

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const columns = useMemo<Column<WafEvent>[]>(
    () => [
      {
        field: "timestamp",
        label: "When",
        width: "11rem",
        render: (r) => (
          <span className="whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
            {epochToLocal(r.timestamp)}
          </span>
        ),
      },
      {
        field: "severity",
        label: "Severity",
        width: "6rem",
        render: (r) => {
          const s = (r.severity ?? "").toLowerCase();
          const variant = SEVERITY_COLORS[s] ?? "default";
          return (
            <Badge variant={variant} size="sm">
              {r.severity ?? "-"}
            </Badge>
          );
        },
      },
      {
        field: "action",
        label: "Action",
        width: "6rem",
        render: (r) => {
          const a = (r.action ?? "").toLowerCase();
          const variant = ACTION_COLORS[a] ?? "default";
          return (
            <Badge variant={variant} size="sm">
              {r.action ?? "-"}
            </Badge>
          );
        },
      },
      {
        field: "host",
        label: "Host",
        render: (r) => (
          <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
            {r.host ?? "-"}
          </span>
        ),
      },
      {
        field: "client_ip",
        label: "Client IP",
        render: (r) => (
          <span className="font-mono text-xs text-slate-600 dark:text-slate-400">
            {r.client_ip ?? "-"}
          </span>
        ),
      },
      {
        field: "method",
        label: "Method",
        width: "5rem",
        render: (r) =>
          r.method ? (
            <Badge variant="info" size="sm">
              {r.method}
            </Badge>
          ) : (
            <span className="text-sm text-slate-400">-</span>
          ),
      },
      {
        field: "uri",
        label: "Request",
        render: (r) => (
          <span
            className="block max-w-xs truncate font-mono text-xs text-slate-700 dark:text-slate-300"
            title={r.uri}
          >
            {r.uri ?? "-"}
          </span>
        ),
      },
      {
        field: "rule_name",
        label: "Rule",
        render: (r) => (
          <span className="text-sm text-slate-700 dark:text-slate-300">
            {r.rule_name ?? r.rule_id ?? "-"}
          </span>
        ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="WAF events"
        icon={ShieldAlert}
        subtitle="Web application firewall rule matches"
        actions={
          <Button
            variant="ghost"
            onClick={handleRefresh}
            loading={isValidating}
            aria-label="Refresh events"
          >
            <RotateCw className="h-4 w-4" aria-hidden="true" />
            <span className="ml-1.5">Refresh</span>
          </Button>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3">
        <Input
          label="Filter by host"
          placeholder="example.com"
          value={host}
          onChange={(e) => {
            setHost(e.target.value);
            setPage(1);
          }}
        />
        <Select
          label="Filter by action"
          value={action}
          onChange={(e) => {
            setAction(e.target.value);
            setPage(1);
          }}
          options={ACTIONS}
        />
      </div>

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          Failed to load WAF events: {(error as Error).message}
        </div>
      )}

      <DataTable
        columns={columns}
        data={data}
        total={total}
        loading={isLoading}
        error={error}
        onRetry={() => mutate()}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
        emptyMessage={
          host || action
            ? "No events match the current filters."
            : "No WAF events recorded yet — activity will appear here as rules match."
        }
        getId={(r) =>
          r.id ??
          `${r.timestamp ?? ""}-${r.rule_id ?? ""}-${r.client_ip ?? ""}-${r.uri ?? ""}`
        }
      />
    </div>
  );
}
