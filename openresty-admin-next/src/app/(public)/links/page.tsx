"use client";

import { useEffect, useMemo, useState } from "react";
import useSWR from "swr";
import {
  Search,
  ExternalLink,
  Inbox,
  AlertCircle,
  RefreshCw,
} from "lucide-react";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";

/* ──────────────────────────────────────────────────────────────────────────
   /links — public, unauthenticated link directory.

   Reads from GET /api/public/bookmarks, which:
     - Skips JWT verification (nginx exemption is GET-only).
     - Returns only bookmarks flagged `public: true` by an admin.
     - Strips fields that don't belong on a public surface (profile_id,
       proxy_pass, ssl_enabled, timestamps, etc.).

   Visual shape: a curated link directory grouped by category.  This is
   what readers actually want — "show me what's available, organised" —
   not the admin DataTable view.  Cards feel scannable, support multi-
   line descriptions, and degrade well on mobile.
   ────────────────────────────────────────────────────────────────────────── */

interface PublicBookmark {
  id: string;
  title?: string;
  host?: string;
  url?: string;
  category?: string;
  description?: string;
  tags?: string[];
}

interface PublicListResponse {
  data: PublicBookmark[];
  total: number;
}

const UNCATEGORISED = "Other";

const fetcher = async (url: string): Promise<PublicListResponse> => {
  const res = await fetch(url, { credentials: "omit" });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `Failed to load public bookmarks (${res.status})${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json();
};

export default function PublicLinksPage() {
  // Plain SWR call here (rather than the admin `useList` hook) — admin
  // hooks inject auth headers via the dataProvider, which would defeat
  // the whole point of an anonymous endpoint and could be confusing if
  // a logged-in user views the page.
  const { data, error, isLoading, mutate } = useSWR<PublicListResponse>(
    "/api/public/bookmarks?pagination[perPage]=500",
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  // ── Derive grouped + filtered list ───────────────────────────────────
  const bookmarks = data?.data ?? [];

  const categories = useMemo(() => {
    const counts = new Map<string, number>();
    for (const bm of bookmarks) {
      const cat = bm.category?.trim() || UNCATEGORISED;
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [bookmarks]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return bookmarks.filter((bm) => {
      const cat = bm.category?.trim() || UNCATEGORISED;
      if (activeCategory && cat !== activeCategory) return false;
      if (!q) return true;
      return (
        bm.title?.toLowerCase().includes(q) ||
        bm.host?.toLowerCase().includes(q) ||
        bm.description?.toLowerCase().includes(q) ||
        cat.toLowerCase().includes(q) ||
        (bm.tags ?? []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }, [bookmarks, query, activeCategory]);

  // Group filtered list by category for the section render.
  const grouped = useMemo(() => {
    const map = new Map<string, PublicBookmark[]>();
    for (const bm of filtered) {
      const cat = bm.category?.trim() || UNCATEGORISED;
      const list = map.get(cat) ?? [];
      list.push(bm);
      map.set(cat, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Reset category filter if the user types a query that excludes it.
  useEffect(() => {
    if (activeCategory && !categories.some((c) => c.name === activeCategory)) {
      setActiveCategory(null);
    }
  }, [activeCategory, categories]);

  // ── Render branches ──────────────────────────────────────────────────

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      {/* Hero */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
          Available services
        </h1>
        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
          A curated directory of websites and services hosted behind this
          gateway.
        </p>
      </div>

      {/* Search + category filter */}
      <div className="mb-6 space-y-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by name, host, tag, or description…"
            className="block w-full rounded-lg border border-slate-300 bg-white py-2 pl-10 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
            aria-label="Search public links"
          />
        </div>
        {categories.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <CategoryChip
              label="All"
              count={bookmarks.length}
              active={activeCategory === null}
              onClick={() => setActiveCategory(null)}
            />
            {categories.map((c) => (
              <CategoryChip
                key={c.name}
                label={c.name}
                count={c.count}
                active={activeCategory === c.name}
                onClick={() =>
                  setActiveCategory(activeCategory === c.name ? null : c.name)
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Body */}
      {isLoading && !data ? (
        <LoadingGrid />
      ) : error ? (
        <ErrorState onRetry={() => mutate()} message={(error as Error).message} />
      ) : grouped.length === 0 ? (
        <EmptyState hasQuery={Boolean(query) || activeCategory !== null} />
      ) : (
        <div className="space-y-8">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {category}{" "}
                <span className="ml-1 font-normal text-slate-400 dark:text-slate-500">
                  · {items.length}
                </span>
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {items.map((bm) => (
                  <BookmarkCard key={bm.id} bookmark={bm} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─── Sub-components ─────────────────────────────────────────────────── */

function CategoryChip({
  label,
  count,
  active,
  onClick,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        active
          ? "rounded-full bg-primary-600 px-3 py-1 text-xs font-medium text-white shadow-sm"
          : "rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:bg-slate-800"
      }
      aria-pressed={active}
    >
      {label}
      <span
        className={
          active
            ? "ml-1.5 text-white/80"
            : "ml-1.5 text-slate-400 dark:text-slate-500"
        }
      >
        {count}
      </span>
    </button>
  );
}

function BookmarkCard({ bookmark: bm }: { bookmark: PublicBookmark }) {
  const href = bm.url || (bm.host ? `https://${bm.host}` : null);
  const display = bm.title || bm.host || "Untitled";

  // Render as a real anchor so users get the browser context menu
  // (open in new tab, copy link, etc.).  No JS click handler needed.
  return (
    <a
      href={href ?? "#"}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className={
        href
          ? "group relative flex flex-col rounded-xl border border-slate-200 bg-white p-4 transition hover:-translate-y-0.5 hover:border-primary-300 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/30 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-primary-700"
          : "pointer-events-none flex flex-col rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900/50"
      }
      aria-label={`Open ${display}`}
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-slate-900 group-hover:text-primary-600 dark:text-slate-100 dark:group-hover:text-primary-400">
          {display}
        </h3>
        {href && (
          <ExternalLink
            className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-primary-500 dark:text-slate-600"
            aria-hidden="true"
          />
        )}
      </div>
      {bm.host && (
        <p className="mt-1 line-clamp-1 font-mono text-xs text-slate-500 dark:text-slate-400">
          {bm.host}
        </p>
      )}
      {bm.description && (
        <p className="mt-2 line-clamp-2 text-xs text-slate-600 dark:text-slate-400">
          {bm.description}
        </p>
      )}
      {Array.isArray(bm.tags) && bm.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">
          {bm.tags.slice(0, 4).map((t) => (
            <Badge key={t} variant="default" size="sm">
              {t}
            </Badge>
          ))}
        </div>
      )}
    </a>
  );
}

function LoadingGrid() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900"
        >
          <Skeleton className="h-4 w-3/5" />
          <Skeleton className="mt-2 h-3 w-2/5" />
          <Skeleton className="mt-3 h-3 w-full" />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasQuery }: { hasQuery: boolean }) {
  return (
    <div className="rounded-xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-700 dark:bg-slate-900">
      <Inbox className="mx-auto h-8 w-8 text-slate-300 dark:text-slate-600" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-300">
        {hasQuery ? "No matches" : "No public links yet"}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {hasQuery
          ? "Try a different search term or category."
          : "Bookmarks marked as public will appear here."}
      </p>
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
        <p className="font-medium">Couldn't load public links</p>
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
