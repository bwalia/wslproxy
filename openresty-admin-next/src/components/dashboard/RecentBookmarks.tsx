"use client";

import React, { useMemo } from "react";
import Link from "next/link";
import {
  Lock,
  Unlock,
  ExternalLink,
  Bookmark as BookmarkIcon,
  ArrowRight,
} from "lucide-react";
import { useList } from "@/hooks/useResource";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";
import type { Bookmark } from "@/types";

/* ──────────────────────────────────────────────────────────────────────────
   "Recent Bookmarks" dashboard widget.

   Shows the N most-recently-created bookmarks with:
    - Accent color per row derived from the category (hashed so the
      same label always gets the same tint — stable without a
      predefined colour palette).
    - SSL indicator on the left as a coloured dot (green/muted).
    - Category pill on the right matching the accent color.
    - Hover elevation + link to open the bookmark URL.
    - "View all" footer that links into /bookmarks.

   Empty state is a single centered column with the icon + subhead —
   not a skeleton, because the content-free case should look
   deliberate, not loading.
   ────────────────────────────────────────────────────────────────────────── */

// ── Category → accent palette ────────────────────────────────────────────
//
// Stable hash maps a string to one of six accent colours.  The legacy
// dashboard used grey chips for every category, which made the list
// visually flat — this brings the admin in line with the rest of the
// theme.

const ACCENT_PALETTE = [
  {
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
    pill:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300",
  },
  {
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    pill:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300",
  },
  {
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
    pill:
      "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300",
  },
  {
    iconBg: "bg-violet-50 dark:bg-violet-900/30",
    iconColor: "text-violet-600 dark:text-violet-400",
    pill:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-300",
  },
  {
    iconBg: "bg-rose-50 dark:bg-rose-900/30",
    iconColor: "text-rose-600 dark:text-rose-400",
    pill: "bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300",
  },
  {
    iconBg: "bg-cyan-50 dark:bg-cyan-900/30",
    iconColor: "text-cyan-600 dark:text-cyan-400",
    pill: "bg-cyan-100 text-cyan-700 dark:bg-cyan-900/40 dark:text-cyan-300",
  },
] as const;

function accentFor(key: string): (typeof ACCENT_PALETTE)[number] {
  if (!key) return ACCENT_PALETTE[0];
  let hash = 0;
  for (let i = 0; i < key.length; i++) {
    hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  }
  return ACCENT_PALETTE[hash % ACCENT_PALETTE.length];
}

// ── Row component ────────────────────────────────────────────────────────

const BookmarkRow = React.memo(function BookmarkRow({
  bookmark,
}: {
  bookmark: Bookmark;
}) {
  const accent = accentFor(bookmark.category ?? bookmark.host ?? bookmark.title);
  const hasUrl = typeof bookmark.url === "string" && bookmark.url.length > 0;

  const body = (
    <div className="group flex items-center gap-3 rounded-lg border border-transparent px-3 py-2.5 transition-all hover:border-slate-200 hover:bg-slate-50 hover:shadow-sm dark:hover:border-slate-700 dark:hover:bg-slate-800/60">
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          accent.iconBg,
          accent.iconColor,
        )}
      >
        <BookmarkIcon className="h-4 w-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          {bookmark.ssl_enabled ? (
            <Lock
              className="h-3 w-3 shrink-0 text-emerald-500"
              aria-label="SSL enabled"
            />
          ) : (
            <Unlock
              className="h-3 w-3 shrink-0 text-slate-400 dark:text-slate-500"
              aria-label="SSL disabled"
            />
          )}
          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
            {bookmark.title}
          </p>
        </div>
        {bookmark.host && (
          <p className="truncate font-mono text-xs text-slate-600 dark:text-slate-300">
            {bookmark.host}
          </p>
        )}
      </div>
      {bookmark.category && (
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold",
            accent.pill,
          )}
        >
          {bookmark.category}
        </span>
      )}
      {hasUrl && (
        <ExternalLink
          className="h-3.5 w-3.5 shrink-0 text-slate-300 transition-colors group-hover:text-slate-600 dark:text-slate-600 dark:group-hover:text-slate-300"
          aria-hidden="true"
        />
      )}
    </div>
  );

  return hasUrl ? (
    <a
      href={bookmark.url}
      target="_blank"
      rel="noopener noreferrer"
      className="block focus-visible:rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
      aria-label={`Open ${bookmark.title}`}
    >
      {body}
    </a>
  ) : (
    body
  );
});

// ── Main component ───────────────────────────────────────────────────────

export default function RecentBookmarks() {
  const { data, isLoading } = useList<Bookmark>("bookmarks", {
    pagination: { page: 1, perPage: 5 },
  });

  const bookmarks = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  return (
    <Card>
      <Card.Header>
        <div className="flex min-w-0 items-center gap-2">
          <BookmarkIcon
            className="h-4 w-4 shrink-0 text-slate-400"
            aria-hidden="true"
          />
          <h2 className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            Recent Bookmarks
          </h2>
        </div>
        {bookmarks.length > 0 && (
          <Link
            href="/bookmarks"
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 dark:text-primary-400 dark:hover:text-primary-300"
          >
            View all
            <ArrowRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        )}
      </Card.Header>
      <Card.Body>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
              <BookmarkIcon className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
              No bookmarks yet
            </p>
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Save a server link to see it here
            </p>
            <Link
              href="/bookmarks"
              className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
            >
              Manage bookmarks
              <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </Link>
          </div>
        ) : (
          <div className="space-y-0.5">
            {bookmarks.map((bm) => (
              <BookmarkRow key={bm.id} bookmark={bm} />
            ))}
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
