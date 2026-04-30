"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Globe2, Lock } from "lucide-react";
import { useList } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { Bookmark as BookmarkType } from "@/types";

export default function BookmarksListPage() {
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

  const { data, total, isLoading, error, mutate } = useList<BookmarkType>(
    "bookmarks",
    params,
  );

  const columns = useMemo<Column<BookmarkType>[]>(
    () => [
      {
        field: "title",
        label: "Title",
        sortable: true,
        render: (r) => (
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {r.title}
          </span>
        ),
      },
      {
        field: "host",
        label: "Host",
      },
      {
        field: "url",
        label: "URL",
        render: (r) =>
          r.url ? (
            <a
              href={r.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-primary-600 hover:underline dark:text-primary-400"
            >
              {r.url}
            </a>
          ) : (
            "-"
          ),
      },
      {
        field: "category",
        label: "Category",
        render: (r) =>
          r.category ? (
            <Badge variant="info" size="sm">
              {r.category}
            </Badge>
          ) : (
            <span>-</span>
          ),
      },
      {
        field: "public",
        label: "Visibility",
        // Two-state badge — public records are loud (green + globe) so
        // admins can spot exposed entries at a glance during audits.
        render: (r) =>
          r.public ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
              <Globe2 className="h-3 w-3" aria-hidden="true" /> Public
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
              <Lock className="h-3 w-3" aria-hidden="true" /> Private
            </span>
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
    (record: BookmarkType) => {
      router.push(`/bookmarks/${record.id}`);
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
        title="Bookmarks"
        icon={Bookmark}
        actions={
          <div className="flex items-center gap-2">
            {/* Convenience link to the public surface so admins can
                preview what anonymous visitors see.  `target="_blank"`
                avoids losing in-progress edits if the user is mid-flow
                somewhere else. */}
            <a
              href="/links"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Globe2 className="h-4 w-4" aria-hidden="true" />
              View public page
            </a>
            <Button onClick={() => router.push("/bookmarks/create")}>
              Create Bookmark
            </Button>
          </div>
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
