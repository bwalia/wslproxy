"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  AlertCircle,
  ArrowDownAZ,
  ArrowUpAZ,
  Bookmark,
  CalendarArrowDown,
  CalendarArrowUp,
  ExternalLink,
  Globe2,
  Inbox,
  Lock,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from "lucide-react";
import { useDataProvider, useList } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import type { Bookmark as BookmarkType } from "@/types";

/* ──────────────────────────────────────────────────────────────────────────
   Bookmarks — card grid admin view.

   Why cards over a table:
     A bookmark is a piece of content with a destination URL; visually
     scanning a long URL column in a table is hard.  Cards put title and
     host front-and-centre, give the URL a clear "go" affordance, and
     scale gracefully on small screens (table columns reflow poorly).

   Click behaviour:
     The whole card is a real `<a target="_blank">` anchor — clicking
     opens the bookmarked URL in a new tab.  Browsers handle the
     middle-click / right-click / ⌘-click context menus the way the user
     expects.  Edit and Delete sit as plain `<button>`s with explicit
     `preventDefault` + `stopPropagation` so they don't trigger the
     outer anchor.  Nested anchors aren't allowed in HTML, so the entire
     interactive surface is exactly one `<a>` plus a few `<button>`s.

   Responsive grid:
     1 col on mobile, 2 on small tablets, 3 at desktop, 4 on wide.
     Card content uses line-clamp on description so cards stay the same
     height regardless of how chatty an admin got.

   Day / night:
     All colour tokens use Tailwind `dark:` variants, driven by the
     `<html class="dark">` toggle managed by ThemeContext.  No custom
     theme provider needed here.
   ────────────────────────────────────────────────────────────────────────── */

type VisibilityFilter = "all" | "public" | "private";
type SortKey = "created_desc" | "created_asc" | "title_asc" | "title_desc";

/* Page size — backed by server-side pagination so the client only ever
   holds one page in memory.  Default lowered from 24 → 12 so the
   pagination controls surface for typical bookmark counts; admins who
   want denser views can bump it up via the picker. */
const PER_PAGE_OPTIONS = [12, 24, 48, 96] as const;
type PerPageValue = (typeof PER_PAGE_OPTIONS)[number];
const DEFAULT_PER_PAGE: PerPageValue = 12;
const PER_PAGE_STORAGE_KEY = "wslproxy:bookmarks:perPage";

function readStoredPerPage(): PerPageValue {
  if (typeof window === "undefined") return DEFAULT_PER_PAGE;
  const raw = window.localStorage.getItem(PER_PAGE_STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  return (PER_PAGE_OPTIONS as readonly number[]).includes(n)
    ? (n as PerPageValue)
    : DEFAULT_PER_PAGE;
}

const SORT_OPTIONS: {
  key: SortKey;
  label: string;
  icon: React.ElementType;
  field: string;
  order: "ASC" | "DESC";
}[] = [
  { key: "created_desc", label: "Newest first", icon: CalendarArrowDown, field: "created_at", order: "DESC" },
  { key: "created_asc",  label: "Oldest first", icon: CalendarArrowUp,   field: "created_at", order: "ASC"  },
  { key: "title_asc",    label: "A → Z",        icon: ArrowDownAZ,       field: "title",      order: "ASC"  },
  { key: "title_desc",   label: "Z → A",        icon: ArrowUpAZ,         field: "title",      order: "DESC" },
];

export default function BookmarksListPage() {
  const router = useRouter();
  const dataProvider = useDataProvider();
  const { notify } = useNotification();

  // ── Controls ────────────────────────────────────────────────────────────
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [visibility, setVisibility] = useState<VisibilityFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("created_desc");
  // Hydrate page-size from localStorage so an operator's choice carries
  // across reloads.  Initial render uses the default to avoid SSR/CSR
  // hydration mismatch; the effect below restores any saved value.
  const [perPage, setPerPageState] = useState<PerPageValue>(DEFAULT_PER_PAGE);
  useEffect(() => {
    const stored = readStoredPerPage();
    if (stored !== perPage) setPerPageState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const setPerPage = useCallback((next: PerPageValue) => {
    setPerPageState(next);
    setPage(1); // reset to first page when page size changes
    try {
      window.localStorage.setItem(PER_PAGE_STORAGE_KEY, String(next));
    } catch {
      /* localStorage may be disabled (private mode); not critical */
    }
  }, []);

  const sortCfg = useMemo(
    () => SORT_OPTIONS.find((s) => s.key === sortKey) ?? SORT_OPTIONS[0],
    [sortKey],
  );

  const params = useMemo(
    () => ({
      pagination: { page, perPage },
      sort: { field: sortCfg.field, order: sortCfg.order },
      filter: search ? { q: search } : {},
    }),
    [page, perPage, sortCfg, search],
  );

  const { data, total, isLoading, error, mutate } = useList<BookmarkType>(
    "bookmarks",
    params,
  );

  // Visibility filter is applied client-side because the backend doesn't
  // accept a `public` filter param.  Total/pagination counts reflect the
  // server's view; the visible page may be smaller after this filter.
  const visibleBookmarks = useMemo(() => {
    if (visibility === "all") return data;
    const want = visibility === "public";
    return data.filter((bm) => Boolean(bm.public) === want);
  }, [data, visibility]);

  const totalPages = Math.max(1, Math.ceil(total / perPage));

  // ── Delete flow ─────────────────────────────────────────────────────────
  const [pendingDelete, setPendingDelete] = useState<BookmarkType | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      await dataProvider.remove("bookmarks", pendingDelete.id);
      notify(`"${pendingDelete.title}" deleted`, { type: "success" });
      setPendingDelete(null);
      mutate();
    } catch (err) {
      notify((err as Error).message || "Failed to delete bookmark", {
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, dataProvider, notify, mutate]);

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div>
      <PageHeader
        title="Bookmarks"
        icon={Bookmark}
        subtitle="Quick links to services and dashboards. Click a card to open."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <a
              href="/links"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              <Globe2 className="h-4 w-4" aria-hidden="true" />
              View public page
            </a>
            <Button
              onClick={() => router.push("/bookmarks/create" as Route)}
              icon={<Plus className="h-4 w-4" />}
            >
              Create Bookmark
            </Button>
          </div>
        }
      />

      {/* ── Controls bar ─────────────────────────────────────────────────── */}
      <div className="mb-6 mt-2 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        {/* Search */}
        <div className="relative w-full lg:max-w-md">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Search title, host, description…"
            aria-label="Search bookmarks"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
        </div>

        {/* Filter + sort */}
        <div className="flex flex-wrap items-center gap-2">
          <VisibilityChips value={visibility} onChange={setVisibility} />
          <SortSelect value={sortKey} onChange={setSortKey} />
        </div>
      </div>

      {/* ── Body ─────────────────────────────────────────────────────────── */}
      {error ? (
        <ErrorState onRetry={() => mutate()} message={(error as Error).message} />
      ) : isLoading && visibleBookmarks.length === 0 ? (
        <LoadingGrid />
      ) : visibleBookmarks.length === 0 ? (
        <EmptyState
          hasQuery={Boolean(search)}
          hasFilter={visibility !== "all"}
          onCreate={() => router.push("/bookmarks/create" as Route)}
        />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {visibleBookmarks.map((bm) => (
              <BookmarkCard
                key={bm.id}
                bookmark={bm}
                onEdit={() => router.push(`/bookmarks/${bm.id}` as Route)}
                onDelete={() => setPendingDelete(bm)}
              />
            ))}
          </div>

          {/* Pagination bar — always rendered so operators see the
              total count + page-size picker even on a single-page
              result.  That makes it obvious the client isn't loading
              the whole table at once, and gives an escape hatch if
              the default 12 feels too sparse. */}
          <div className="mt-8 flex flex-col gap-3 border-t border-slate-200 pt-4 text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
            {/* Left: count + per-page picker */}
            <div className="flex flex-wrap items-center gap-4">
              <span>
                Showing{" "}
                <strong className="text-slate-900 dark:text-slate-100">
                  {visibleBookmarks.length}
                </strong>{" "}
                of{" "}
                <strong className="text-slate-900 dark:text-slate-100">{total}</strong>{" "}
                bookmark{total === 1 ? "" : "s"}
                {visibility !== "all" && (
                  <span className="ml-1 text-slate-400">
                    ({visibility} on this page)
                  </span>
                )}
              </span>
              <label className="inline-flex items-center gap-2 text-xs">
                <span className="text-slate-500 dark:text-slate-400">Per page</span>
                <select
                  value={perPage}
                  onChange={(e) => setPerPage(Number(e.target.value) as PerPageValue)}
                  aria-label="Bookmarks per page"
                  className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
                >
                  {PER_PAGE_OPTIONS.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Right: prev / page indicator / next — only when paging exists */}
            {totalPages > 1 ? (
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  disabled={page === 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Previous
                </button>
                <span className="px-3 text-sm tabular-nums text-slate-600 dark:text-slate-400">
                  Page {page} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  Next
                </button>
              </div>
            ) : (
              <span className="text-xs text-slate-400 dark:text-slate-500">
                All on one page
              </span>
            )}
          </div>
        </>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete bookmark"
        message={
          pendingDelete
            ? `Are you sure you want to delete "${pendingDelete.title}"? This can't be undone.`
            : ""
        }
        confirmLabel="Delete"
        confirmVariant="danger"
        loading={deleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => (deleting ? null : setPendingDelete(null))}
      />
    </div>
  );
}

/* ─── Sub-components ────────────────────────────────────────────────────── */

interface BookmarkCardProps {
  bookmark: BookmarkType;
  onEdit: () => void;
  onDelete: () => void;
}

function BookmarkCard({ bookmark: bm, onEdit, onDelete }: BookmarkCardProps) {
  const href = bm.url || (bm.host ? `https://${bm.host}` : null);
  const displayTitle = bm.title || bm.host || "Untitled";
  const createdAt = bm.created_at
    ? new Date(bm.created_at * 1000).toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
      })
    : null;

  // Anchor when the URL is usable, plain div otherwise.  Either way the
  // hover / focus visuals stay consistent so the layout doesn't shift
  // between rows.
  const Wrapper = (href ? "a" : "div") as React.ElementType;
  const wrapperProps = href
    ? {
        href,
        target: "_blank",
        rel: "noopener noreferrer",
        "aria-label": `Open ${displayTitle} in a new tab`,
      }
    : {};

  return (
    <Wrapper
      {...wrapperProps}
      className={[
        "group relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all dark:border-slate-800 dark:bg-slate-900",
        href
          ? "hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 dark:hover:border-primary-700"
          : "cursor-default opacity-90",
      ].join(" ")}
    >
      {/* Top row: title + visibility */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="line-clamp-2 text-sm font-semibold text-slate-900 group-hover:text-primary-600 dark:text-slate-100 dark:group-hover:text-primary-400">
            {displayTitle}
          </h3>
          {bm.host && (
            <p className="mt-0.5 line-clamp-1 font-mono text-xs text-slate-500 dark:text-slate-400">
              {bm.host}
            </p>
          )}
        </div>
        <VisibilityPill isPublic={Boolean(bm.public)} />
      </div>

      {/* Description (clamped) */}
      {bm.description && (
        <p className="mt-3 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
          {bm.description}
        </p>
      )}

      {/* Tags */}
      {Array.isArray(bm.tags) && bm.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {bm.tags.slice(0, 4).map((t) => (
            <Badge key={t} variant="default" size="sm">
              {t}
            </Badge>
          ))}
          {bm.tags.length > 4 && (
            <span className="text-xs text-slate-400 dark:text-slate-500">
              +{bm.tags.length - 4}
            </span>
          )}
        </div>
      )}

      {/* Push the footer to the card's bottom edge so cards in the same
          row line up regardless of body length. */}
      <div className="mt-auto pt-4">
        {/* Meta row */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {bm.category && (
            <Badge variant="info" size="sm">
              {bm.category}
            </Badge>
          )}
          {createdAt && <span>· {createdAt}</span>}
          {href && (
            <span className="ml-auto inline-flex items-center gap-1 text-primary-600 opacity-0 transition-opacity group-hover:opacity-100 dark:text-primary-400">
              Open
              <ExternalLink className="h-3 w-3" aria-hidden="true" />
            </span>
          )}
        </div>

        {/* Admin actions — separate buttons that stop propagation so they
            don't trigger the parent anchor's navigation. */}
        <div className="mt-3 flex items-center gap-1 border-t border-slate-100 pt-3 dark:border-slate-800">
          <CardActionButton
            label="Edit"
            icon={<Pencil className="h-3.5 w-3.5" aria-hidden="true" />}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onEdit();
            }}
          />
          <CardActionButton
            label="Delete"
            icon={<Trash2 className="h-3.5 w-3.5" aria-hidden="true" />}
            tone="danger"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onDelete();
            }}
          />
        </div>
      </div>
    </Wrapper>
  );
}

function VisibilityPill({ isPublic }: { isPublic: boolean }) {
  return isPublic ? (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
      <Globe2 className="h-3 w-3" aria-hidden="true" /> Public
    </span>
  ) : (
    <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-600 dark:bg-slate-800 dark:text-slate-400">
      <Lock className="h-3 w-3" aria-hidden="true" /> Private
    </span>
  );
}

function CardActionButton({
  label,
  icon,
  onClick,
  tone = "default",
}: {
  label: string;
  icon: React.ReactNode;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2",
        tone === "danger"
          ? "text-slate-500 hover:bg-red-50 hover:text-red-600 focus-visible:ring-red-500/30 dark:text-slate-400 dark:hover:bg-red-900/20 dark:hover:text-red-400"
          : "text-slate-500 hover:bg-slate-100 hover:text-slate-900 focus-visible:ring-primary-500/30 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100",
      ].join(" ")}
    >
      {icon}
      {label}
    </button>
  );
}

function VisibilityChips({
  value,
  onChange,
}: {
  value: VisibilityFilter;
  onChange: (v: VisibilityFilter) => void;
}) {
  const items: { key: VisibilityFilter; label: string; icon?: React.ElementType }[] = [
    { key: "all", label: "All" },
    { key: "public", label: "Public", icon: Globe2 },
    { key: "private", label: "Private", icon: Lock },
  ];
  return (
    <div
      role="tablist"
      aria-label="Filter by visibility"
      className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5 dark:border-slate-700 dark:bg-slate-900"
    >
      {items.map(({ key, label, icon: Icon }) => {
        const active = value === key;
        return (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(key)}
            className={[
              "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              active
                ? "bg-primary-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800",
            ].join(" ")}
          >
            {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}
            {label}
          </button>
        );
      })}
    </div>
  );
}

function SortSelect({
  value,
  onChange,
}: {
  value: SortKey;
  onChange: (v: SortKey) => void;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <span className="hidden sm:inline">Sort</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value as SortKey)}
        aria-label="Sort bookmarks"
        className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200"
      >
        {SORT_OPTIONS.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="mt-2 h-3 w-1/2" />
          <Skeleton className="mt-3 h-3 w-full" />
          <Skeleton className="mt-1 h-3 w-5/6" />
          <div className="mt-3 flex gap-1">
            <Skeleton className="h-4 w-12 rounded-full" />
            <Skeleton className="h-4 w-12 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

function EmptyState({
  hasQuery,
  hasFilter,
  onCreate,
}: {
  hasQuery: boolean;
  hasFilter: boolean;
  onCreate: () => void;
}) {
  const isFiltered = hasQuery || hasFilter;
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <Inbox className="mx-auto h-10 w-10 text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
        {isFiltered ? "No matches" : "No bookmarks yet"}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {isFiltered
          ? "Try a different search term or visibility filter."
          : "Create your first bookmark to share quick links with your team."}
      </p>
      {!isFiltered && (
        <Button onClick={onCreate} className="mt-4" icon={<Plus className="h-4 w-4" />}>
          Create Bookmark
        </Button>
      )}
    </div>
  );
}

function ErrorState({
  onRetry,
  message,
}: {
  onRetry: () => void;
  message: string;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="flex-1">
        <p className="font-medium">Couldn&apos;t load bookmarks</p>
        <p className="mt-0.5 text-xs opacity-80">{message}</p>
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="inline-flex shrink-0 items-center gap-1 rounded-md border border-red-200 bg-white px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100 dark:border-red-900 dark:bg-red-950 dark:text-red-200 dark:hover:bg-red-900/40"
      >
        <RefreshCw className="h-3 w-3" aria-hidden="true" />
        Retry
      </button>
    </div>
  );
}
