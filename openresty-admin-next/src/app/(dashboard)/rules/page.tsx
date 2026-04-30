"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { GitBranch } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { Rule } from "@/types";

export default function RulesListPage() {
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

  const { data, total, isLoading, error, mutate } = useList<Rule>(
    "rules",
    params,
  );

  const columns = useMemo<Column<Rule>[]>(
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
        field: "priority",
        label: "Priority",
        sortable: true,
        render: (r) => (
          <Badge variant="primary" size="sm">
            {r.priority ?? 0}
          </Badge>
        ),
      },
      {
        field: "match.rules.path",
        label: "Path",
        render: (r) => (
          <span className="font-mono text-xs">
            {r.match?.rules?.path ?? "-"}
          </span>
        ),
      },
      {
        field: "match.response.code",
        label: "Response Code",
        render: (r) => {
          const code = r.match?.response?.code;
          return code ? (
            <Badge variant="info" size="sm">
              {code}
            </Badge>
          ) : (
            <span>-</span>
          );
        },
      },
      {
        field: "profile_id",
        label: "Profile",
      },
      {
        field: "rules_tags",
        label: "Tags",
        render: (r) => (
          <div className="flex flex-wrap gap-1">
            {(Array.isArray(r.rules_tags) ? r.rules_tags : []).map((tag, i) => (
              <Badge key={i} size="sm">
                {tag}
              </Badge>
            ))}
          </div>
        ),
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (record: Rule) => {
      router.push(`/rules/${record.id}`);
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
        title="Rules"
        icon={GitBranch}
        actions={
          <Button onClick={() => router.push("/rules/create")}>
            Create Rule
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
