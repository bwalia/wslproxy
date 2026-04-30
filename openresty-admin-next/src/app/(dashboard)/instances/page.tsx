"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Box } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Instance } from "@/types";

export default function InstancesListPage() {
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

  const { data, total, isLoading, error, mutate } = useList<Instance>(
    "instances",
    params,
  );

  const columns = useMemo<Column<Instance>[]>(
    () => [
      {
        field: "instance_name",
        label: "Name",
        sortable: true,
        render: (r) => (
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {r.instance_name}
          </span>
        ),
      },
      {
        field: "host_ip",
        label: "Host IP",
      },
      {
        field: "host_port",
        label: "Host Port",
      },
      {
        field: "instance_status",
        label: "Status",
        render: (r) => (
          <StatusBadge status={r.instance_status ? "active" : "inactive"} />
        ),
      },
      {
        field: "created_at",
        label: "Created",
        render: (r) =>
          r.created_at
            ? new Date(r.created_at * 1000).toLocaleDateString()
            : "-",
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (record: Instance) => {
      router.push(`/instances/${record.id}`);
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
        title="Instances"
        icon={Box}
        actions={
          <Button onClick={() => router.push("/instances/create")}>
            Create Instance
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
