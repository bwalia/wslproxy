"use client";

import { useMemo, useState } from "react";
import { Activity, Info } from "lucide-react";
import { useList } from "@/hooks/useResource";
import { useSettings } from "@/contexts/SettingsContext";
import PageHeader from "@/components/ui/PageHeader";
import DataTable, { type Column } from "@/components/ui/DataTable";
import Card, { CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import type { Session } from "@/types";

/**
 * Active admin sessions.
 *
 * This page is only meaningful when `storage_type === "redis"` — disk
 * storage doesn't persist sessions server-side.  We render a helpful
 * "not-applicable" state instead of a broken empty table when the
 * instance uses disk storage.
 *
 * Backend source: `listSessions` in `api.lua` — scans Redis for
 * `session:*` keys and returns redacted metadata (subject/timeout are
 * intentionally masked so session payloads aren't leaked).
 */

export default function SessionsPage() {
  const { storageType, isLoading: settingsLoading } = useSettings();
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(50);

  const isRedisBackend = storageType === "redis";

  const { data, total, isLoading, error, mutate } = useList<Session>(
    "sessions",
    {
      pagination: { page, perPage },
    },
  );

  const columns = useMemo<Column<Session>[]>(
    () => [
      {
        field: "session_id",
        label: "Session ID",
        render: (r) => (
          <span className="font-mono text-xs text-slate-700 dark:text-slate-300">
            {r.session_id ?? r.id}
          </span>
        ),
      },
      {
        field: "subject",
        label: "Subject",
        render: (r) => (
          <Badge variant="info" size="sm">
            {r.subject ?? "Redacted"}
          </Badge>
        ),
      },
      {
        field: "timeout",
        label: "Timeout",
        render: (r) => (
          <span className="text-sm text-slate-600 dark:text-slate-400">
            {r.timeout ?? "Redacted"}
          </span>
        ),
      },
    ],
    [],
  );

  if (!settingsLoading && !isRedisBackend) {
    return (
      <div>
        <PageHeader
          title="Sessions"
          icon={Activity}
          subtitle="Active admin sessions"
        />
        <Card>
          <CardBody>
            <div className="flex items-start gap-3">
              <div
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/30"
                aria-hidden="true"
              >
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Session tracking is not available
                </h2>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
                  Sessions are tracked only when <code className="font-mono text-xs">storage_type</code>{" "}
                  is set to <code className="font-mono text-xs">redis</code> in{" "}
                  <code className="font-mono text-xs">data/settings.json</code>.
                  The current instance uses{" "}
                  <code className="font-mono text-xs">
                    {storageType ?? "disk"}
                  </code>{" "}
                  storage, so there is nothing to display here.
                </p>
                <p className="mt-3 text-xs text-slate-500 dark:text-slate-500">
                  Changing the storage backend requires updating settings and
                  restarting OpenResty. See the CLAUDE.md §11 for details.
                </p>
              </div>
            </div>
          </CardBody>
        </Card>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Sessions"
        icon={Activity}
        subtitle="Active admin sessions (Redis-backed)"
      />

      {/* Error rendering moved into the DataTable error/onRetry props
          (Wave 11.1) — gives users a Retry button + consistent UX
          across every list page. */}

      <DataTable
        columns={columns}
        data={data}
        total={total}
        loading={isLoading || settingsLoading}
        error={error}
        onRetry={() => mutate()}
        page={page}
        perPage={perPage}
        onPageChange={setPage}
        onPerPageChange={setPerPage}
        emptyMessage="No active sessions."
      />
    </div>
  );
}
