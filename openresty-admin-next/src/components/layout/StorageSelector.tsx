"use client";

import { useCallback, useState } from "react";
import { HardDrive, Database, Check } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import { useSettings } from "@/contexts/SettingsContext";
import { useNotification } from "@/contexts/NotificationContext";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils/cn";

/**
 * AppBar storage-type selector.  Mirrors the legacy
 * openresty-admin/src/Dashboard/StorageModal — lets an operator
 * switch the backend storage between Redis (fast, cluster-friendly)
 * and plain disk JSON (simple, single-node).
 *
 * Changing storage type is disruptive — the backend needs to re-read
 * its settings and every list page needs to refetch against the new
 * source of truth.  Matches the legacy behaviour of reloading the
 * page on success.
 */

type StorageType = "redis" | "disk";

const OPTIONS: {
  value: StorageType;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}[] = [
  {
    value: "redis",
    label: "Redis",
    description: "Centralized, low-latency store — best for clusters",
    icon: Database,
  },
  {
    value: "disk",
    label: "Disk",
    description: "Plain JSON files on the host — simpler, single-node",
    icon: HardDrive,
  },
];

export default function StorageSelector() {
  const dataProvider = useDataProvider();
  const { storageType, loadSettings } = useSettings();
  const { notify } = useNotification();

  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const current = (storageType as StorageType | undefined) ?? "disk";

  const handleSelect = useCallback(
    async (next: StorageType) => {
      if (next === current) {
        setOpen(false);
        return;
      }
      setSaving(true);
      try {
        await dataProvider.saveStorageFlag("storage/management", {
          storage: next,
        });
        notify(`Storage switched to ${next}`, { type: "success" });
        // Refresh the settings cache so any consumer that keys off
        // `storage_type` re-renders with the new value, then reload
        // the window to force all SWR caches + lazy routes to pick
        // up the new backend.  Legacy did a straight `window.location.reload()`
        // — we keep that as a safety net.
        await loadSettings();
        setOpen(false);
        window.location.reload();
      } catch (err) {
        notify(
          "Failed to switch storage: " +
            ((err as Error).message || String(err)),
          { type: "error" },
        );
      } finally {
        setSaving(false);
      }
    },
    [current, dataProvider, loadSettings, notify],
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`Storage: ${current}. Click to change.`}
        title={`Storage: ${current}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
      >
        {current === "redis" ? (
          <Database className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        ) : (
          <HardDrive className="h-3.5 w-3.5 text-slate-400" aria-hidden="true" />
        )}
        <span className="font-mono uppercase tracking-wide">{current}</span>
      </button>

      <Dialog
        open={open}
        onClose={() => !saving && setOpen(false)}
        title="Select Storage Type"
        footer={
          <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
        }
      >
        <div className="space-y-2">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose how the API persists servers, rules, and other resources.
            The page will reload after switching.
          </p>
          <div className="grid grid-cols-1 gap-2">
            {OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = opt.value === current;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleSelect(opt.value)}
                  disabled={saving}
                  aria-pressed={selected}
                  className={cn(
                    "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                    "disabled:cursor-wait disabled:opacity-60",
                    selected
                      ? "border-primary-500 bg-primary-50/40 dark:border-primary-400 dark:bg-primary-900/20"
                      : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800",
                  )}
                >
                  <Icon
                    className={cn(
                      "h-5 w-5 shrink-0",
                      selected
                        ? "text-primary-600 dark:text-primary-400"
                        : "text-slate-400",
                    )}
                    aria-hidden="true"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                        {opt.label}
                      </span>
                      {selected && (
                        <Check
                          className="h-4 w-4 text-primary-600 dark:text-primary-400"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                      {opt.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </Dialog>
    </>
  );
}
