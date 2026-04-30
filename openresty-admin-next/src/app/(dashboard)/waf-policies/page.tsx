"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import StatusBadge from "@/components/ui/StatusBadge";
import type { WafPolicy } from "@/types";

export default function WafPoliciesListPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<{ field: string; order: "ASC" | "DESC" }>({
    field: "id",
    order: "ASC",
  });

  const params = useMemo(
    () => ({
      pagination: { page, perPage },
      sort,
      filter: search ? { q: search } : {},
    }),
    [page, perPage, sort, search],
  );

  const { data, total, isLoading, error, mutate } = useList<WafPolicy>(
    "waf_policies",
    params,
  );

  const columns = useMemo<Column<WafPolicy>[]>(
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
        field: "mode",
        label: "Mode",
        render: (r) => (
          <Badge variant={r.mode === "block" ? "danger" : "warning"} size="sm">
            {r.mode ?? "monitor"}
          </Badge>
        ),
      },
      {
        field: "enabled",
        label: "Enabled",
        render: (r) => (
          <StatusBadge status={r.enabled ? "enabled" : "disabled"} />
        ),
      },
      {
        field: "anomaly_threshold",
        label: "Anomaly Threshold",
      },
      {
        field: "paranoia_level",
        label: "Paranoia Level",
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (record: WafPolicy) => {
      router.push(`/waf-policies/${record.id}`);
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
        title="WAF Policies"
        icon={ShieldCheck}
        actions={
          <Button onClick={() => router.push("/waf-policies/create")}>
            Create Policy
          </Button>
        }
      />
      <DataTable
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
