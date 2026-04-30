"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Server } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import StatusBadge from "@/components/ui/StatusBadge";
import type { Server as ServerType } from "@/types";

export default function ServersListPage() {
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

  const { data, total, isLoading, error, mutate } = useList<ServerType>(
    "servers",
    params,
  );

  const columns = useMemo<Column<ServerType>[]>(
    () => [
      {
        field: "listens",
        label: "Listen Port",
        render: (r) => (
          <div className="flex flex-wrap gap-1">
            {(r.listens ?? []).map((l, i) => (
              <Badge key={i} variant="info" size="sm">
                {String(l.listen)}
              </Badge>
            ))}
          </div>
        ),
      },
      {
        field: "server_name",
        label: "Server Name",
        sortable: true,
        render: (r) => (
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {r.server_name}
          </span>
        ),
      },
      {
        field: "profile_id",
        label: "Profile",
        sortable: true,
      },
      {
        field: "ssl_enabled",
        label: "SSL",
        render: (r) => (
          <StatusBadge status={r.ssl_enabled ? "enabled" : "disabled"} />
        ),
      },
      {
        field: "cache_enabled",
        label: "Cache",
        render: (r) => (
          <StatusBadge status={r.cache_enabled ? "enabled" : "disabled"} />
        ),
      },
      {
        field: "waf_enabled",
        label: "WAF",
        render: (r) => (
          <StatusBadge status={r.waf_enabled ? "enabled" : "disabled"} />
        ),
      },
      {
        field: "config_status",
        label: "Status",
        render: (r) => (
          <Badge variant={r.config_status ? "success" : "warning"}>
            {r.config_status ? "Active" : "Inactive"}
          </Badge>
        ),
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (record: ServerType) => {
      router.push(`/servers/${record.id}`);
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
        title="Servers"
        icon={Server}
        actions={
          <Button onClick={() => router.push("/servers/create")}>
            Create Server
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
