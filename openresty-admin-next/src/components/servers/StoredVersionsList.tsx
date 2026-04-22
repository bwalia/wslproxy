"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import { Archive, Clock, RotateCcw } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import { useProfile } from "@/contexts/ProfileContext";
import Card, { CardHeader, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";
import { cn } from "@/lib/utils/cn";
import type { StoredVersion } from "@/types";

/**
 * Shows stored versions for a given resource and exposes a rollback
 * action: click "Rollback" on an archived or pending version → backend
 * creates a new DRAFT version cloned from that revision.  The draft
 * then flows through the normal change-request / approval pipeline.
 *
 * This is a READ + MUTATE subcomponent — complements the change-
 * requests timeline elsewhere in `VersionHistoryTab`.
 */

interface StoredVersionsListProps {
  resourceType: string; // "servers" | "rules" | …
  resourceName: string;
  /** Override the environment profile (defaults to current active). */
  profile?: string;
}

function stateVariant(
  state?: string,
): "success" | "warning" | "danger" | "info" | "default" {
  switch ((state ?? "").toLowerCase()) {
    case "live":
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
  if (!ts) return "-";
  return new Date(ts * 1000).toLocaleString();
}

export default function StoredVersionsList({
  resourceType,
  resourceName,
  profile: profileOverride,
}: StoredVersionsListProps) {
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const { profile: activeProfile } = useProfile();
  const profile = profileOverride ?? activeProfile;

  const [versions, setVersions] = useState<StoredVersion[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rollbackTarget, setRollbackTarget] = useState<StoredVersion | null>(
    null,
  );
  const [isRollingBack, startRollback] = useTransition();

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await dataProvider.listVersions(
        resourceType,
        profile,
        resourceName,
      );
      const rows = (res.data ?? []) as StoredVersion[];
      // Sort newest-first.
      rows.sort((a, b) => (b.version ?? 0) - (a.version ?? 0));
      setVersions(rows);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load versions");
      setVersions([]);
    } finally {
      setIsLoading(false);
    }
  }, [dataProvider, resourceType, profile, resourceName]);

  useEffect(() => {
    if (resourceName) load();
  }, [load, resourceName]);

  const confirmRollback = useCallback(() => {
    if (!rollbackTarget) return;
    const target = rollbackTarget;
    setRollbackTarget(null);
    startRollback(async () => {
      try {
        await dataProvider.rollbackVersion(
          resourceType,
          profile,
          resourceName,
          target.version,
        );
        notify(
          `Rollback to v${target.version} created as a new draft.  Approve via Change Requests to apply.`,
          { type: "success", duration: 8000 },
        );
        await load();
      } catch (err) {
        notify(
          (err as Error).message || "Failed to create rollback version",
          { type: "error" },
        );
      }
    });
  }, [dataProvider, load, notify, profile, resourceName, resourceType, rollbackTarget]);

  // Don't render the card at all when the backend returned zero entries
  // — the change-requests timeline below takes care of the empty state.
  if (!isLoading && !error && versions.length === 0) return null;

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Archive className="h-5 w-5 text-primary-500" aria-hidden="true" />
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Stored versions
            </h2>
          </div>
          <Badge variant="info" size="sm">
            {versions.length}{" "}
            {versions.length === 1 ? "revision" : "revisions"}
          </Badge>
        </CardHeader>
        <CardBody>
          {error && (
            <div
              role="alert"
              className="mb-3 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300"
            >
              {error}
            </div>
          )}

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <ul className="divide-y divide-slate-100 dark:divide-slate-800">
              {versions.map((v) => {
                const isLive = (v.state ?? "").toLowerCase() === "live";
                return (
                  <li
                    key={v.version}
                    className="flex items-center justify-between gap-3 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                          v{v.version}
                        </span>
                        <Badge variant={stateVariant(v.state)} size="sm">
                          {v.state ?? "unknown"}
                        </Badge>
                        <span className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                          <Clock className="h-3 w-3" aria-hidden="true" />
                          {formatTimestamp(v.created_at)}
                        </span>
                        {v.created_by && (
                          <span className="text-xs text-slate-500 dark:text-slate-400">
                            by {v.created_by}
                          </span>
                        )}
                      </div>
                      {v.description && (
                        <p className="mt-1 truncate text-sm text-slate-600 dark:text-slate-400">
                          {v.description}
                        </p>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      onClick={() => setRollbackTarget(v)}
                      disabled={isLive || isRollingBack}
                      className={cn(isLive && "invisible")}
                      aria-label={`Rollback to version ${v.version}`}
                      title={
                        isLive
                          ? "Already live"
                          : `Create a new draft based on v${v.version}`
                      }
                    >
                      <RotateCcw className="h-4 w-4" aria-hidden="true" />
                      <span className="ml-1.5">Rollback</span>
                    </Button>
                  </li>
                );
              })}
            </ul>
          )}
        </CardBody>
      </Card>

      <ConfirmDialog
        open={!!rollbackTarget}
        onCancel={() => setRollbackTarget(null)}
        onConfirm={confirmRollback}
        loading={isRollingBack}
        title={`Rollback to v${rollbackTarget?.version}?`}
        message={
          `A new draft version will be created from v${rollbackTarget?.version}.  ` +
          `The live configuration won't change until the draft is approved via ` +
          `Change Requests.`
        }
        confirmLabel="Create rollback draft"
        confirmVariant="primary"
      />
    </>
  );
}
