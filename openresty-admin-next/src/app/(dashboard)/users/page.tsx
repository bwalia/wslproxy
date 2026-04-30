"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { User } from "@/types";

export default function UsersListPage() {
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

  const { data, total, isLoading, error, mutate } = useList<User>(
    "users",
    params,
  );

  const columns = useMemo<Column<User>[]>(
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
        field: "email",
        label: "Email",
        sortable: true,
      },
      {
        field: "user_role",
        label: "Role",
        render: (r) => (
          <Badge
            variant={r.user_role === "admin" ? "primary" : "default"}
            size="sm"
          >
            {r.user_role ?? "user"}
          </Badge>
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
    (record: User) => {
      router.push(`/users/${record.id}`);
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
        title="Users"
        icon={Users}
        actions={
          <Button onClick={() => router.push("/users/create")}>
            Create User
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
