"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Globe2, Plus } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { Pop } from "@/types";

/**
 * POPs (Points of Presence) — list page.
 *
 * POPs are physical edge locations running wslproxy.  Each row links
 * to its detail page where the operator can edit fields, flip
 * status (drain / activate / maintenance), or delete.
 */

/** Status → badge colour.  Kept in one place so the list page and
 *  the detail page render the same chip for the same value. */
const STATUS_VARIANTS: Record<
  NonNullable<Pop["status"]>,
  "success" | "warning" | "danger" | "info"
> = {
  active: "success",
  draining: "warning",
  down: "danger",
  maintenance: "info",
};

const STATUS_LABELS: Record<NonNullable<Pop["status"]>, string> = {
  active: "Active",
  draining: "Draining",
  down: "Down",
  maintenance: "Maintenance",
};

export default function PopsListPage() {
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

  const { data, total, isLoading, error, mutate } = useList<Pop>("pops", params);

  const columns = useMemo<Column<Pop>[]>(
    () => [
      {
        field: "id",
        label: "ID",
        sortable: true,
        render: (r) => (
          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
            {r.id}
          </span>
        ),
      },
      {
        field: "display_name",
        label: "Display Name",
        sortable: true,
      },
      {
        field: "region",
        label: "Region / City",
        render: (r) => {
          // Compact "region · city" rendering — most useful when the
          // operator is scanning by geography rather than by id.
          // Either field can be absent; show the present one alone.
          const parts = [r.region, r.city].filter(Boolean) as string[];
          return parts.length > 0 ? (
            <span className="text-slate-600 dark:text-slate-400">
              {parts.join(" · ")}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          );
        },
      },
      {
        field: "public_ipv4",
        label: "Public IP",
        render: (r) => (
          <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
            {r.public_ipv4}
          </span>
        ),
      },
      {
        field: "status",
        label: "Status",
        sortable: true,
        render: (r) => {
          const s = (r.status || "active") as NonNullable<Pop["status"]>;
          return (
            <Badge variant={STATUS_VARIANTS[s]} size="sm">
              {STATUS_LABELS[s]}
            </Badge>
          );
        },
      },
      {
        field: "capacity_weight",
        label: "Weight",
        render: (r) => {
          // Render as a percentage for readability — 1.0 → "100%",
          // 0.5 → "50%".  Drained POPs (weight 0) get a muted dash so
          // the eye can scan past them quickly.
          const w = r.capacity_weight;
          if (w === undefined || w === null) {
            return <span className="text-slate-400">—</span>;
          }
          if (w === 0) {
            return <span className="text-slate-400">0%</span>;
          }
          return (
            <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
              {Math.round(w * 100)}%
            </span>
          );
        },
      },
      {
        field: "country_code",
        label: "Country",
        render: (r) =>
          r.country_code ? (
            <span className="font-mono text-xs uppercase text-slate-600 dark:text-slate-400">
              {r.country_code}
            </span>
          ) : (
            <span className="text-slate-400">—</span>
          ),
      },
    ],
    [],
  );

  const handleRowClick = useCallback(
    (record: Pop) => {
      // Route literal not statically known — cast to satisfy
      // typedRoutes, same pattern as servers/rules pages.
      router.push(`/pops/${encodeURIComponent(record.id)}` as Route);
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
        title="POPs"
        subtitle="Points of Presence — physical edge locations running wslproxy.  Servers reference these by id to control which POPs serve them."
        icon={Globe2}
        actions={
          <Button
            onClick={() => router.push("/pops/create" as Route)}
            icon={<Plus className="h-4 w-4" />}
          >
            Create POP
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
