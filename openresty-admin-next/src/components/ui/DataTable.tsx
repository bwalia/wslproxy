"use client";

import React, {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { cn } from "@/lib/utils/cn";
import {
  Search,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Skeleton from "./Skeleton";
import EmptyState from "./EmptyState";

/* -------------------------------------------------------------------------- */
/*  Types                                                                     */
/* -------------------------------------------------------------------------- */

export interface Column<T> {
  field: string;
  label: string;
  sortable?: boolean;
  render?: (record: T) => React.ReactNode;
  width?: string;
  className?: string;
}

export interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  total?: number;
  loading?: boolean;
  page?: number;
  perPage?: number;
  sort?: { field: string; order: "ASC" | "DESC" };
  onSort?: (field: string) => void;
  onPageChange?: (page: number) => void;
  onPerPageChange?: (perPage: number) => void;
  onRowClick?: (record: T) => void;
  onSearch?: (query: string) => void;
  searchPlaceholder?: string;
  selectable?: boolean;
  selectedIds?: string[];
  onSelectionChange?: (ids: string[]) => void;
  toolbar?: React.ReactNode;
  emptyMessage?: string;
  getId?: (record: T) => string;
}

/* -------------------------------------------------------------------------- */
/*  Helpers                                                                   */
/* -------------------------------------------------------------------------- */

function getNestedValue(obj: unknown, path: string): unknown {
  return path.split(".").reduce((acc: unknown, key) => {
    if (acc && typeof acc === "object") return (acc as Record<string, unknown>)[key];
    return undefined;
  }, obj);
}

function buildPageNumbers(current: number, total: number): (number | "...")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);

  const pages: (number | "...")[] = [];
  const addPage = (p: number) => {
    if (!pages.includes(p)) pages.push(p);
  };

  addPage(1);

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  if (start > 2) pages.push("...");
  for (let i = start; i <= end; i++) addPage(i);
  if (end < total - 1) pages.push("...");

  addPage(total);
  return pages;
}

/* -------------------------------------------------------------------------- */
/*  Memoised table row                                                        */
/* -------------------------------------------------------------------------- */

interface TableRowProps<T> {
  record: T;
  columns: Column<T>[];
  onClick?: (record: T) => void;
  selectable: boolean;
  selected: boolean;
  onSelect: (id: string, checked: boolean) => void;
  getId: (record: T) => string;
  isEven: boolean;
}

const TableRowInner = <T,>({
  record,
  columns,
  onClick,
  selectable,
  selected,
  onSelect,
  getId,
  isEven,
}: TableRowProps<T>) => {
  const id = getId(record);

  return (
    <tr
      className={cn(
        "border-b border-slate-100 dark:border-slate-800 transition-colors",
        isEven && "bg-slate-50/50 dark:bg-slate-800/20",
        "hover:bg-slate-50 dark:hover:bg-slate-800/50",
        onClick && "cursor-pointer"
      )}
      onClick={onClick ? () => onClick(record) : undefined}
    >
      {selectable && (
        <td className="w-12 px-4 py-3">
          <input
            type="checkbox"
            checked={selected}
            onChange={(e) => {
              e.stopPropagation();
              onSelect(id, e.target.checked);
            }}
            onClick={(e) => e.stopPropagation()}
            className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800"
            aria-label={`Select row ${id}`}
          />
        </td>
      )}
      {columns.map((col) => (
        <td
          key={col.field}
          className={cn(
            "px-4 py-3 text-sm text-slate-700 dark:text-slate-300",
            col.className
          )}
          style={col.width ? { width: col.width } : undefined}
        >
          {col.render
            ? col.render(record)
            : (getNestedValue(record, col.field) as React.ReactNode) ?? "-"}
        </td>
      ))}
    </tr>
  );
};

const TableRow = React.memo(TableRowInner) as typeof TableRowInner;

/* -------------------------------------------------------------------------- */
/*  DataTable                                                                 */
/* -------------------------------------------------------------------------- */

function DataTableInner<T>({
  columns,
  data,
  total: totalProp,
  loading = false,
  page = 1,
  perPage = 10,
  sort,
  onSort,
  onPageChange,
  onPerPageChange,
  onRowClick,
  onSearch,
  searchPlaceholder = "Search...",
  selectable = false,
  selectedIds = [],
  onSelectionChange,
  toolbar,
  emptyMessage = "No records found",
  getId = (record: T) => (record as Record<string, unknown>).id as string,
}: DataTableProps<T>) {
  /* -- search: React 19 deferred + transition ---------------------------- */
  // `searchValue` follows every keystroke (urgent update → input echoes instantly).
  // `deferredSearch` lags under load, feeding the debounced network call.
  // `isSearchPending` is true while a transition is in-flight so we can
  // surface a subtle activity indicator to the user.
  const [searchValue, setSearchValue] = useState("");
  const deferredSearch = useDeferredValue(searchValue);
  const [isSearchPending, startSearchTransition] = useTransition();

  useEffect(() => {
    if (!onSearch) return;
    // Still debounced with a short timeout — protects the backend from
    // firing on every deferred frame while the user is actively typing.
    const handle = setTimeout(() => {
      startSearchTransition(() => onSearch(deferredSearch));
    }, 300);
    return () => clearTimeout(handle);
  }, [deferredSearch, onSearch]);

  const handleSearch = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setSearchValue(e.target.value);
    },
    [],
  );

  // "Stale" = user has typed but deferred value hasn't caught up yet, OR a
  // transition is in-flight.  Used to dim the input slightly as feedback.
  const isSearchStale = searchValue !== deferredSearch || isSearchPending;

  /* -- computed ----------------------------------------------------------- */
  const total = totalProp ?? data.length;
  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(total / perPage)),
    [total, perPage]
  );
  const pageNumbers = useMemo(
    () => buildPageNumbers(page, totalPages),
    [page, totalPages]
  );
  const rangeStart = (page - 1) * perPage + 1;
  const rangeEnd = Math.min(page * perPage, total);

  /* -- selection ---------------------------------------------------------- */
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);

  const allOnPageSelected = useMemo(() => {
    if (!selectable || data.length === 0) return false;
    return data.every((r) => selectedSet.has(getId(r)));
  }, [selectable, data, selectedSet, getId]);

  const handleSelectAll = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!onSelectionChange) return;
      const pageIds = data.map((r) => getId(r));
      if (e.target.checked) {
        const merged = new Set([...selectedIds, ...pageIds]);
        onSelectionChange(Array.from(merged));
      } else {
        onSelectionChange(selectedIds.filter((id) => !pageIds.includes(id)));
      }
    },
    [data, selectedIds, onSelectionChange, getId]
  );

  const handleSelectRow = useCallback(
    (id: string, checked: boolean) => {
      if (!onSelectionChange) return;
      if (checked) {
        onSelectionChange([...selectedIds, id]);
      } else {
        onSelectionChange(selectedIds.filter((sid) => sid !== id));
      }
    },
    [selectedIds, onSelectionChange]
  );

  /* -- sort icon ---------------------------------------------------------- */
  const renderSortIcon = useCallback(
    (field: string) => {
      if (!sort || sort.field !== field) {
        return <ArrowUpDown className="h-4 w-4 text-slate-400" />;
      }
      return sort.order === "ASC" ? (
        <ArrowUp className="h-4 w-4 text-primary-600 dark:text-primary-400" />
      ) : (
        <ArrowDown className="h-4 w-4 text-primary-600 dark:text-primary-400" />
      );
    },
    [sort]
  );

  /* -- render ------------------------------------------------------------- */
  return (
    <div className="w-full">
      {/* Toolbar */}
      {(onSearch || toolbar) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
          {onSearch && (
            <div className="relative max-w-sm w-full">
              <Search
                className={cn(
                  "absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 transition-opacity",
                  isSearchStale && "animate-pulse",
                )}
                aria-hidden="true"
              />
              <input
                type="text"
                value={searchValue}
                onChange={handleSearch}
                placeholder={searchPlaceholder}
                className={cn(
                  "block w-full rounded-lg border border-slate-300 dark:border-slate-600 pl-10 pr-3 py-2 text-sm",
                  "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
                  "placeholder:text-slate-400 dark:placeholder:text-slate-500",
                  "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
                  "transition-colors",
                  isSearchStale && "text-slate-500 dark:text-slate-400",
                )}
                aria-label={searchPlaceholder}
                aria-busy={isSearchStale}
              />
            </div>
          )}
          {toolbar && <div className="flex items-center gap-2">{toolbar}</div>}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full text-left" role="table">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              {selectable && (
                <th className="w-12 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={allOnPageSelected && data.length > 0}
                    onChange={handleSelectAll}
                    className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500/30 dark:border-slate-600 dark:bg-slate-800"
                    aria-label="Select all rows"
                  />
                </th>
              )}
              {columns.map((col) => (
                <th
                  key={col.field}
                  className={cn(
                    "px-4 py-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400",
                    col.sortable && onSort && "cursor-pointer select-none",
                    col.className
                  )}
                  style={col.width ? { width: col.width } : undefined}
                  onClick={
                    col.sortable && onSort
                      ? () => onSort(col.field)
                      : undefined
                  }
                  aria-sort={
                    sort?.field === col.field
                      ? sort.order === "ASC"
                        ? "ascending"
                        : "descending"
                      : undefined
                  }
                >
                  <span className="inline-flex items-center gap-1.5">
                    {col.label}
                    {col.sortable && onSort && renderSortIcon(col.field)}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Loading skeleton rows */}
            {loading &&
              Array.from({ length: 5 }).map((_, rowIdx) => (
                <tr
                  key={`skeleton-${rowIdx}`}
                  className="border-b border-slate-100 dark:border-slate-800"
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <Skeleton className="h-4 w-4" />
                    </td>
                  )}
                  {columns.map((col) => (
                    <td key={col.field} className="px-4 py-3">
                      <Skeleton variant="text" className="h-4 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}

            {/* Empty state */}
            {!loading && data.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 1 : 0)}
                  className="px-4"
                >
                  <EmptyState title={emptyMessage} />
                </td>
              </tr>
            )}

            {/* Data rows */}
            {!loading &&
              (Array.isArray(data) ? data : []).map((record, idx) => (
                <TableRow
                  key={getId(record)}
                  record={record}
                  columns={columns}
                  onClick={onRowClick}
                  selectable={selectable}
                  selected={selectedSet.has(getId(record))}
                  onSelect={handleSelectRow}
                  getId={getId}
                  isEven={idx % 2 === 1}
                />
              ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {!loading && data.length > 0 && (onPageChange || onPerPageChange) && (
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Showing{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {rangeStart}
            </span>
            {"-"}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {rangeEnd}
            </span>{" "}
            of{" "}
            <span className="font-medium text-slate-700 dark:text-slate-300">
              {total}
            </span>
          </p>

          <div className="flex items-center gap-2">
            {/* Per-page selector */}
            {onPerPageChange && (
              <select
                value={perPage}
                onChange={(e) => onPerPageChange(Number(e.target.value))}
                className={cn(
                  "rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800",
                  "px-2 py-1.5 text-sm text-slate-700 dark:text-slate-300",
                  "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
                )}
                aria-label="Rows per page"
              >
                {[10, 25, 50].map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            )}

            {/* Page buttons */}
            {onPageChange && totalPages > 1 && (
              <nav
                className="inline-flex items-center gap-1"
                aria-label="Pagination"
              >
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => onPageChange(page - 1)}
                  className={cn(
                    "inline-flex items-center justify-center rounded-lg p-1.5 text-sm transition-colors",
                    "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                  )}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {pageNumbers.map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-1 text-sm text-slate-400"
                      aria-hidden="true"
                    >
                      ...
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => onPageChange(p)}
                      className={cn(
                        "inline-flex h-8 w-8 items-center justify-center rounded-lg text-sm font-medium transition-colors",
                        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30",
                        p === page
                          ? "bg-primary-600 text-white"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                      )}
                      aria-current={p === page ? "page" : undefined}
                      aria-label={`Page ${p}`}
                    >
                      {p}
                    </button>
                  )
                )}

                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => onPageChange(page + 1)}
                  className={cn(
                    "inline-flex items-center justify-center rounded-lg p-1.5 text-sm transition-colors",
                    "text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800",
                    "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30"
                  )}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </nav>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const DataTable = React.memo(DataTableInner) as typeof DataTableInner;

export default DataTable;
