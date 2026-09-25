"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, ListPlus } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import StatusBadge from "@/components/ui/StatusBadge";
import { SelectionBar, BulkDeleteButton } from "@/components/ui/BulkActions";
import ApplyRulesToPolicyDialog from "@/components/waf/ApplyRulesToPolicyDialog";
import { useSelection } from "@/hooks/useSelection";
import type { WafRule } from "@/types";

const categoryVariant: Record<
  string,
  "primary" | "warning" | "danger" | "info" | "default"
> = {
  sqli: "danger",
  xss: "danger",
  rce: "danger",
  lfi: "warning",
  rfi: "warning",
  scanner: "info",
  protocol: "primary",
};

const severityVariant: Record<
  string,
  "danger" | "warning" | "info" | "default"
> = {
  critical: "danger",
  high: "danger",
  medium: "warning",
  low: "info",
};

export default function WafRulesListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ field: string; order: "ASC" | "DESC" }>({
    field: "created_at",
    order: "DESC",
  });

  const params = useMemo(
    () => ({
      pagination: { page, perPage },
      sort,
      filter: search ? { q: search } : {},
    }),
    [page, perPage, sort, search],
  );

  const { data, total, isLoading, error, mutate } = useList<WafRule>(
    "waf_rules",
    params,
  );

  const selection = useSelection<WafRule>(
    data,
    (r) => r.id,
    (r) => r.name || r.id,
  );
  const [applyOpen, setApplyOpen] = useState(false);

  const columns = useMemo<Column<WafRule>[]>(
    () => [
      {
        field: "name",
        label: "Name",
        sortable: true,
        render: (r) => (
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {r.name}
          </span>
        ),
      },
      {
        field: "category",
        label: "Category",
        render: (r) => (
          <Badge
            variant={categoryVariant[r.category ?? ""] ?? "default"}
            size="sm"
          >
            {r.category ?? "-"}
          </Badge>
        ),
      },
      {
        field: "severity",
        label: "Severity",
        render: (r) => (
          <Badge
            variant={severityVariant[r.severity ?? ""] ?? "default"}
            size="sm"
          >
            {r.severity ?? "-"}
          </Badge>
        ),
      },
      {
        field: "target",
        label: "Target",
      },
      {
        field: "action",
        label: "Action",
        render: (r) => <StatusBadge status={r.action ?? "unknown"} />,
      },
      {
        field: "enabled",
        label: "Enabled",
        render: (r) => (
          <StatusBadge status={r.enabled ? "enabled" : "disabled"} />
        ),
      },
      {
        field: "score",
        label: "Score",
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (record: WafRule) => {
      router.push(`/waf-rules/${record.id}`);
    },
    [router],
  );

  const handleSort = useCallback((field: string) => {
    setSort((prev) => ({
      field,
      order: prev.field === field && prev.order === "ASC" ? "DESC" : "ASC",
    }));
  }, []);

  const handleSearch = useCallback((q: string) => {
    setSearch(q);
    setPage(1);
  }, []);

  return (
    <div>
      <PageHeader
        title="WAF Rules"
        icon={ShieldAlert}
        actions={
          <Button onClick={() => router.push("/waf-rules/create")}>
            Create WAF Rule
          </Button>
        }
      />
      <SelectionBar count={selection.count} onClear={selection.clear}>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setApplyOpen(true)}
          icon={<ListPlus className="h-4 w-4" aria-hidden="true" />}
        >
          Apply to policy
        </Button>
        <BulkDeleteButton
          resource="waf_rules"
          noun="WAF rules"
          items={selection.selectedItems}
          warning="Each rule is also removed from every WAF policy that lists it."
          onDone={() => {
            selection.clear();
            mutate();
          }}
        />
      </SelectionBar>
      <ApplyRulesToPolicyDialog
        open={applyOpen}
        items={selection.selectedItems}
        onClose={() => setApplyOpen(false)}
        onApplied={() => setApplyOpen(false)}
      />
      <DataTable
        selectable
        selectedIds={selection.selectedIds}
        onSelectionChange={selection.setSelectedIds}
        columns={columns}
        data={data}
        total={total}
        loading={isLoading}
        error={error}
        onRetry={() => mutate()}
        page={page}
        perPage={perPage}
        sort={sort}
        onSort={handleSort}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
        onRowClick={handleRowClick}
        onSearch={handleSearch}
      />
    </div>
  );
}
