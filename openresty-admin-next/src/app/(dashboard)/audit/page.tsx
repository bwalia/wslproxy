"use client";

import { useCallback, useMemo, useState } from "react";
import { FileText, Filter, Download } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import Badge from "@/components/ui/Badge";
import Button from "@/components/ui/Button";
import Card, { CardBody } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";
import type { AuditEntry } from "@/types";

/**
 * Audit log viewer — read-only table of configuration-change events.
 *
 * Backend filters supported (see `api/audit_logger.lua:list`):
 *   - `date_from` / `date_to` (unix-epoch seconds; default last 30 days)
 *   - `user`
 *   - `action`        — "create" | "update" | "delete" | custom
 *   - `resource_type` — "servers" | "rules" | "upstreams" | …
 *   - `resource_name`
 *   - `limit` / `offset`
 */

// ── Small helpers ─────────────────────────────────────────────────────

const ACTION_VARIANTS: Record<string, "success" | "warning" | "danger" | "info" | "default"> = {
  create: "success",
  update: "warning",
  delete: "danger",
  approve: "success",
  reject: "danger",
  login: "info",
  logout: "default",
};

const RESOURCE_TYPES = [
  { value: "", label: "All types" },
  { value: "servers", label: "Servers" },
  { value: "rules", label: "Rules" },
  { value: "upstreams", label: "Upstreams" },
  { value: "profiles", label: "Profiles" },
  { value: "secrets", label: "Secrets" },
  { value: "waf_policies", label: "WAF policies" },
  { value: "waf_rules", label: "WAF rules" },
  { value: "change_requests", label: "Change requests" },
];

const ACTIONS = [
  { value: "", label: "Any action" },
  { value: "create", label: "Create" },
  { value: "update", label: "Update" },
  { value: "delete", label: "Delete" },
  { value: "approve", label: "Approve" },
  { value: "reject", label: "Reject" },
];

// Convert "YYYY-MM-DD" to unix epoch seconds (start-of-day UTC).
function dateInputToEpoch(value: string): number | undefined {
  if (!value) return undefined;
  const d = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? Math.floor(d.getTime() / 1000) : undefined;
}

function epochToLocal(ts: unknown): string {
  if (typeof ts !== "number") return "-";
  return new Date(ts * 1000).toLocaleString();
}

function jsonToCSV(rows: AuditEntry[]): string {
  const header = [
    "timestamp",
    "user",
    "action",
    "resource_type",
    "resource_name",
    "actor_ip",
    "profile_id",
  ];
  const escape = (s: unknown) => {
    const str = s == null ? "" : String(s);
    return /[",\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
  };
  const lines = rows.map((r) =>
    header
      .map((k) => escape(k === "timestamp" ? epochToLocal(r.timestamp) : r[k]))
      .join(","),
  );
  return [header.join(","), ...lines].join("\n");
}

// ── Page ──────────────────────────────────────────────────────────────

interface FilterState {
  dateFrom: string;
  dateTo: string;
  user: string;
  action: string;
  resourceType: string;
  resourceName: string;
}

const EMPTY_FILTERS: FilterState = {
  dateFrom: "",
  dateTo: "",
  user: "",
  action: "",
  resourceType: "",
  resourceName: "",
};

export default function AuditPage() {
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [filters, setFilters] = useState<FilterState>(EMPTY_FILTERS);
  const [panelOpen, setPanelOpen] = useState(false);

  // Translate UI filters into backend filter shape.
  const backendFilter = useMemo(() => {
    const f: Record<string, string | number | undefined> = {};
    const from = dateInputToEpoch(filters.dateFrom);
    const to = dateInputToEpoch(filters.dateTo);
    if (from !== undefined) f.date_from = from;
    if (to !== undefined) f.date_to = to + 86399; // end-of-day
    if (filters.user) f.user = filters.user;
    if (filters.action) f.action = filters.action;
    if (filters.resourceType) f.resource_type = filters.resourceType;
    if (filters.resourceName) f.resource_name = filters.resourceName;
    f.limit = perPage;
    f.offset = (page - 1) * perPage;
    return f;
  }, [filters, page, perPage]);

  const { data, total, isLoading, isValidating, error } = useList<AuditEntry>(
    "audit",
    { filter: backendFilter, pagination: { page, perPage } },
  );

  const updateFilter = useCallback(
    <K extends keyof FilterState>(key: K, value: FilterState[K]) => {
      setFilters((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    [],
  );

  const resetFilters = useCallback(() => {
    setFilters(EMPTY_FILTERS);
    setPage(1);
  }, []);

  const activeFilterCount = useMemo(
    () => Object.values(filters).filter((v) => v !== "").length,
    [filters],
  );

  const handleExport = useCallback(() => {
    if (!data || data.length === 0) return;
    const csv = jsonToCSV(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [data]);

  const columns = useMemo<Column<AuditEntry>[]>(
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
        field: "action",
        label: "Action",
        width: "6rem",
        render: (r) => {
          const a = (r.action ?? "").toLowerCase();
          const variant = ACTION_VARIANTS[a] ?? "default";
          return (
            <Badge variant={variant} size="sm">
              {r.action ?? "-"}
            </Badge>
          );
        },
      },
      {
        field: "resource_type",
        label: "Resource",
        render: (r) => (
          <span className="text-sm text-slate-700 dark:text-slate-300">
            <span className="font-mono text-xs uppercase tracking-wide text-slate-400 dark:text-slate-500">
              {r.resource_type ?? "-"}
            </span>
            {r.resource_name && (
              <span className="ml-2 font-medium">{r.resource_name}</span>
            )}
          </span>
        ),
      },
      {
        field: "user",
        label: "User",
        render: (r) =>
          r.user ? (
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
              {r.user}
            </span>
          ) : (
            <span className="text-sm text-slate-400">-</span>
          ),
      },
      {
        field: "actor_ip",
        label: "IP",
        render: (r) => (
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {(r.actor_ip as string) ?? "-"}
          </span>
        ),
      },
      {
        field: "profile_id",
        label: "Profile",
        width: "5rem",
        render: (r) =>
          r.profile_id ? (
            <Badge variant="info" size="sm">
              {String(r.profile_id)}
            </Badge>
          ) : (
            <span className="text-sm text-slate-400">-</span>
          ),
      },
    ],
    [],
  );

  return (
    <div>
      <PageHeader
        title="Audit log"
        icon={FileText}
        subtitle="Configuration change history"
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => setPanelOpen((o) => !o)}
              aria-expanded={panelOpen}
              aria-controls="audit-filter-panel"
            >
              <Filter className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1.5">
                Filters
                {activeFilterCount > 0 && (
                  <span className="ml-1.5 rounded-full bg-primary-600 px-1.5 py-0.5 text-xs font-semibold text-white">
                    {activeFilterCount}
                  </span>
                )}
              </span>
            </Button>
            <Button
              variant="ghost"
              onClick={handleExport}
              disabled={!data || data.length === 0}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              <span className="ml-1.5">Export CSV</span>
            </Button>
          </div>
        }
      />

      {panelOpen && (
        <Card className="mb-4" id="audit-filter-panel">
          <CardBody>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Input
                label="Date from"
                type="date"
                value={filters.dateFrom}
                onChange={(e) => updateFilter("dateFrom", e.target.value)}
              />
              <Input
                label="Date to"
                type="date"
                value={filters.dateTo}
                onChange={(e) => updateFilter("dateTo", e.target.value)}
              />
              <Input
                label="User"
                placeholder="admin@example.com"
                value={filters.user}
                onChange={(e) => updateFilter("user", e.target.value)}
              />
              <Select
                label="Action"
                value={filters.action}
                onChange={(e) => updateFilter("action", e.target.value)}
                options={ACTIONS}
              />
              <Select
                label="Resource type"
                value={filters.resourceType}
                onChange={(e) => updateFilter("resourceType", e.target.value)}
                options={RESOURCE_TYPES}
              />
              <Input
                label="Resource name"
                placeholder="host:example.com"
                value={filters.resourceName}
                onChange={(e) => updateFilter("resourceName", e.target.value)}
              />
            </div>
            <div className="mt-4 flex items-center justify-between">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Results refresh automatically as filters change.
              </p>
              <Button
                variant="ghost"
                onClick={resetFilters}
                disabled={activeFilterCount === 0}
              >
                Reset
              </Button>
            </div>
          </CardBody>
        </Card>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
        >
          Failed to load audit log: {(error as Error).message}
        </div>
      )}

      <div className={cn(isValidating && !isLoading && "opacity-70 transition-opacity")}>
        <DataTable
          columns={columns}
          data={data}
          total={total}
          loading={isLoading}
          page={page}
          perPage={perPage}
          onPageChange={setPage}
          onPerPageChange={setPerPage}
          emptyMessage={
            activeFilterCount > 0
              ? "No audit entries match these filters."
              : "No audit entries yet — changes will appear here as users save records."
          }
          getId={(r) =>
            `${r.timestamp}-${r.resource_type ?? ""}-${r.resource_name ?? ""}-${r.action ?? ""}`
          }
        />
      </div>
    </div>
  );
}
