"use client";

import React, { useCallback, useState } from "react";
import { Trash2, X } from "lucide-react";
import Button from "./Button";
import ConfirmDialog from "./ConfirmDialog";
import { dataProvider } from "@/lib/api/data-provider";
import { useNotification } from "@/contexts/NotificationContext";

export interface BulkItem {
  id: string;
  label: string;
}

/** Shape returned by the Lua DELETE handlers (api/api.lua runDelete). */
export interface BulkDeleteResult {
  deleted: string[];
  failed: { id: string; error: string }[];
}

/** Longest list of names shown in a confirmation before "and N more". */
const MAX_LISTED = 10;

export function ItemList({ items }: { items: BulkItem[] }) {
  const shown = items.slice(0, MAX_LISTED);
  const rest = items.length - shown.length;
  return (
    <ul className="mt-2 max-h-48 list-disc space-y-0.5 overflow-y-auto pl-5 font-mono text-xs text-slate-700 dark:text-slate-300">
      {shown.map((it) => (
        <li key={it.id}>{it.label}</li>
      ))}
      {rest > 0 && <li className="list-none text-slate-500">…and {rest} more</li>}
    </ul>
  );
}

/**
 * Bar shown above a table while rows are selected: the count, a Clear
 * button and the page's bulk actions.
 */
export function SelectionBar({
  count,
  onClear,
  children,
}: {
  count: number;
  onClear: () => void;
  children?: React.ReactNode;
}) {
  if (count === 0) return null;
  return (
    <div
      role="region"
      aria-label="Bulk actions"
      className="mb-3 flex flex-wrap items-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-3 py-2 dark:border-primary-900 dark:bg-primary-950/40"
    >
      <span className="text-sm font-medium text-primary-900 dark:text-primary-100">
        {count} selected
      </span>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-primary-700 hover:bg-primary-100 dark:text-primary-300 dark:hover:bg-primary-900/40"
      >
        <X className="h-3 w-3" aria-hidden="true" />
        Clear
      </button>
      <div className="ml-auto flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

/**
 * Delete every selected record in one request (DELETE /api/<resource> with
 * {ids: {ids, envProfile}}) and report exactly what the backend deleted.
 */
export function BulkDeleteButton({
  resource,
  noun,
  items,
  onDone,
  warning,
}: {
  resource: string;
  /** Plural noun for messages, e.g. "servers". */
  noun: string;
  items: BulkItem[];
  onDone: (result: BulkDeleteResult) => void;
  /** Extra consequence to spell out in the dialog. */
  warning?: React.ReactNode;
}) {
  const { notify } = useNotification();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const confirm = useCallback(async () => {
    setBusy(true);
    try {
      const res = (await dataProvider.removeMany(
        resource,
        items.map((i) => i.id),
      )) as { data?: Partial<BulkDeleteResult> } | null;
      const result: BulkDeleteResult = {
        deleted: res?.data?.deleted ?? [],
        failed: res?.data?.failed ?? [],
      };
      if (result.failed.length === 0) {
        notify(`Deleted ${result.deleted.length} ${noun}`, { type: "success" });
      } else {
        const first = result.failed[0];
        notify(
          `Deleted ${result.deleted.length} of ${items.length} ${noun}; ` +
            `${result.failed.length} failed (${first.id}: ${first.error})`,
          { type: "warning" },
        );
      }
      setOpen(false);
      onDone(result);
    } catch (e) {
      notify(
        `Bulk delete failed: ${e instanceof Error ? e.message : String(e)}`,
        { type: "error" },
      );
    } finally {
      setBusy(false);
    }
  }, [resource, items, noun, notify, onDone]);

  return (
    <>
      <Button
        variant="danger"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={items.length === 0}
        icon={<Trash2 className="h-4 w-4" aria-hidden="true" />}
      >
        Delete {items.length}
      </Button>
      <ConfirmDialog
        open={open}
        onCancel={() => !busy && setOpen(false)}
        onConfirm={confirm}
        loading={busy}
        title={`Delete ${items.length} ${noun}?`}
        confirmLabel={`Delete ${items.length}`}
        message={
          <>
            <p>This can&apos;t be undone.</p>
            {warning ? <p className="mt-2">{warning}</p> : null}
            <ItemList items={items} />
          </>
        }
      />
    </>
  );
}
