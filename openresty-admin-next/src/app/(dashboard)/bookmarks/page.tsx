"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Bookmark } from "lucide-react";
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

  const { data, total, isLoading } = useList<BookmarkType>("bookmarks", params);

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
          <Button onClick={() => router.push("/bookmarks/create")}>
            Create Bookmark
          </Button>
        }
      />
      <DataTable
        columns={columns}
        data={data}
        total={total}
        loading={isLoading}
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
