"use client";

import { useCallback, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Server, Copy, ExternalLink } from "lucide-react";
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

  const { data, total, isLoading, error, mutate } = useList<ServerType>(
    "servers",
    params,
  );

  // Navigate to the create form with the source id in the query string;
  // the create page detects `?source=<id>` and pre-fills every field
  // from that record (suffixing server_name with `-clone` so an
  // accidental Save doesn't overwrite the original).  Defined as a
  // stable callback so the columns useMemo can depend on it without
  // re-running on every render.
  const handleClone = useCallback(
    (sourceId: string) => {
      router.push(
        `/servers/create?source=${encodeURIComponent(sourceId)}` as Route,
      );
    },
    [router],
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
          // `flex` + `stopPropagation` on the external-link button so
          // clicking the icon opens the live domain in a new tab
          // without ALSO triggering the row click that opens the edit
          // page.  The bare name keeps its row-click behaviour intact.
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-900 dark:text-slate-100">
              {r.server_name}
            </span>
            {r.server_name && (
              <a
                href={`https://${r.server_name}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                title={`Open https://${r.server_name} in a new tab`}
                aria-label={`Open https://${r.server_name} in a new tab`}
                className="inline-flex items-center justify-center rounded p-1 text-slate-400 transition-colors hover:bg-primary-50 hover:text-primary-600 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
        ),
      },
      {
        field: "profile_id",
        label: "Profile",
        sortable: true,
      },
      {
        // Synthetic column — pop_ids has no native sort/filter
        // semantics from the backend, so we just render chips.
        // Truncate at 3 visible chips so the column doesn't blow
        // out when a server is multi-region; show "+N" for the rest.
        field: "_pop_ids",
        label: "POPs",
        render: (r) => {
          const ids = Array.isArray(r.pop_ids) ? r.pop_ids : [];
          if (ids.length === 0) {
            return (
              <span className="text-xs text-slate-400">profile default</span>
            );
          }
          const visible = ids.slice(0, 3);
          const overflow = ids.length - visible.length;
          return (
            <div className="flex flex-wrap items-center gap-1">
              {visible.map((id) => (
                <Badge key={id} variant="info" size="sm">
                  {id}
                </Badge>
              ))}
              {overflow > 0 && (
                <Badge variant="default" size="sm">
                  +{overflow}
                </Badge>
              )}
            </div>
          );
        },
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
      {
        // Synthetic "field" — render only, no sort.  Rightmost column so
        // it sits where row actions normally live.  `stopPropagation`
        // prevents the parent row's navigation-to-edit.
        field: "_actions",
        label: "",
        render: (r) => (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleClone(r.id);
              }}
              title="Clone this server"
              aria-label={`Clone ${r.server_name}`}
              className="inline-flex items-center gap-1 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
            >
              <Copy className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ),
      },
    ],
    [handleClone],
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
