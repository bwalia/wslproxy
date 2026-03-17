"use client";

import React, { useMemo } from "react";
import {
  Lock,
  Unlock,
  ExternalLink,
  Bookmark as BookmarkIcon,
} from "lucide-react";
import { useList } from "@/hooks/useResource";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import type { Bookmark } from "@/types";

// ── Row component ────────────────────────────────────────────────────────

interface BookmarkRowProps {
  bookmark: Bookmark;
}

const BookmarkRow = React.memo(function BookmarkRow({
  bookmark,
}: BookmarkRowProps) {
  const SslIcon = bookmark.ssl_enabled ? Lock : Unlock;

  return (
    <div className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800">
      <SslIcon
        className={`h-4 w-4 shrink-0 ${
          bookmark.ssl_enabled
            ? "text-green-500"
            : "text-slate-400 dark:text-slate-500"
        }`}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
          {bookmark.title}
        </p>
        {bookmark.host && (
          <p className="truncate text-xs text-slate-400 dark:text-slate-500">
            {bookmark.host}
          </p>
        )}
      </div>
      {bookmark.category && (
        <Badge variant="default" size="sm" className="shrink-0">
          {bookmark.category}
        </Badge>
      )}
      {bookmark.url && (
        <a
          href={bookmark.url}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-700 dark:hover:text-slate-300"
          aria-label={`Open ${bookmark.title}`}
        >
          <ExternalLink className="h-4 w-4" />
        </a>
      )}
    </div>
  );
});

// ── Main component ───────────────────────────────────────────────────────

export default function RecentBookmarks() {
  const { data, isLoading } = useList<Bookmark>("bookmarks", {
    pagination: { page: 1, perPage: 5 },
  });

  const bookmarks = useMemo(() => (Array.isArray(data) ? data : []), [data]);

  if (isLoading) {
    return (
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Recent Bookmarks
          </h2>
        </Card.Header>
        <Card.Body className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          Recent Bookmarks
        </h2>
      </Card.Header>
      <Card.Body>
        {bookmarks.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-slate-400 dark:text-slate-500">
            <BookmarkIcon className="mb-2 h-8 w-8" />
            <p className="text-sm">No bookmarks yet</p>
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
