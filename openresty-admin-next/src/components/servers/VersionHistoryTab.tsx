"use client";

import React, { useMemo } from "react";
import { History, Clock } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { useList } from "@/hooks/useResource";
import type { ChangeRequest } from "@/types";
import { cn } from "@/lib/utils/cn";
import StoredVersionsList from "./StoredVersionsList";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface VersionHistoryTabProps {
  serverName: string;
  serverId: string;
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

function stateVariant(
  state: string,
): "success" | "warning" | "danger" | "info" | "default" {
  switch (state) {
    case "approved":
    case "applied":
      return "success";
    case "pending":
      return "warning";
    case "rejected":
      return "danger";
    case "draft":
      return "info";
    default:
      return "default";
  }
}

function formatTimestamp(ts?: number): string {
  if (!ts) return "N/A";
  return new Date(ts * 1000).toLocaleString();
}

/* ── Component ─────────────────────────────────────────────────────────── */

const VersionHistoryTab: React.FC<VersionHistoryTabProps> = ({
  serverName,
  serverId,
}) => {
  const { data: changeRequests, isLoading } = useList<ChangeRequest>(
    "change-requests",
    {
      filter: {
        resource_type: "servers",
        resource_name: serverName,
      },
      sort: { field: "created_at", order: "DESC" },
    },
  );

  const sorted = useMemo(
    () =>
      [...(changeRequests ?? [])].sort(
        (a, b) => (b.created_at ?? 0) - (a.created_at ?? 0),
      ),
    [changeRequests],
  );

  // Stored versions (with rollback) always renders — shows nothing when
  // there are no stored versions, and collapses cleanly when empty.
  const storedVersions = (
    <StoredVersionsList resourceType="servers" resourceName={serverName} />
  );

  if (isLoading) {
    return (
      <div className="space-y-6">
        {storedVersions}
        <Card>
          <Card.Body>
            <div className="space-y-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="space-y-2">
                  <Skeleton className="h-5 w-40" />
                  <Skeleton variant="rectangular" className="h-16" />
                </div>
              ))}
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  if (sorted.length === 0) {
    return (
      <div className="space-y-6">
        {storedVersions}
        <Card>
          <Card.Body>
            <div className="flex flex-col items-center gap-4 py-12 text-center">
              <div className="rounded-full bg-slate-100 p-4 dark:bg-slate-800">
                <History className="h-8 w-8 text-slate-400" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                  No change requests
                </h3>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Edits that go through the 4-eyes approval flow will show up here.
                </p>
              </div>
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {storedVersions}
      <Card>
      <Card.Header>
        <div className="flex items-center gap-2">
          <History className="h-5 w-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Version History
          </h2>
        </div>
        <Badge variant="info" size="sm">
          {sorted.length} {sorted.length === 1 ? "change" : "changes"}
        </Badge>
      </Card.Header>
      <Card.Body>
        <div className="relative space-y-0">
          {/* Timeline line */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-slate-200 dark:bg-slate-700" />

          {sorted.map((cr, idx) => (
            <div key={cr.id} className="relative pl-10 pb-6 last:pb-0">
              {/* Timeline dot */}
              <div
                className={cn(
                  "absolute left-2.5 top-1.5 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900",
                  cr.state === "approved" || cr.state === "applied"
                    ? "bg-green-500"
                    : cr.state === "rejected"
                      ? "bg-red-500"
                      : cr.state === "pending"
                        ? "bg-amber-500"
                        : "bg-slate-400",
                )}
              />

              <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/50 p-4 space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={stateVariant(cr.state)} size="sm">
                      {cr.state}
                    </Badge>
                    {cr.change_type && (
                      <Badge variant="default" size="sm">
                        {cr.change_type}
                      </Badge>
                    )}
                    {cr.version !== undefined && (
                      <span className="text-xs text-slate-500 dark:text-slate-400">
                        v{cr.version}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                    <Clock className="h-3 w-3" />
                    {formatTimestamp(cr.created_at)}
                  </div>
                </div>

                {cr.description && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {cr.description}
                  </p>
                )}

                {cr.created_by && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    By: {cr.created_by}
                  </p>
                )}

                {/* Approvals / Rejections */}
                {(cr.approvals?.length || cr.rejections?.length) ? (
                  <div className="flex flex-wrap gap-3 pt-1">
                    {cr.approvals?.map((a, ai) => (
                      <span key={`a-${ai}`} className="text-xs text-green-600 dark:text-green-400">
                        Approved by {a.user}
                      </span>
                    ))}
                    {cr.rejections?.map((r, ri) => (
                      <span key={`r-${ri}`} className="text-xs text-red-600 dark:text-red-400">
                        Rejected by {r.user}{r.reason ? `: ${r.reason}` : ""}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      </Card.Body>
    </Card>
    </div>
  );
};

VersionHistoryTab.displayName = "VersionHistoryTab";

export default React.memo(VersionHistoryTab);
