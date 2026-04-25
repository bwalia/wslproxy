"use client";

import { useCallback, useState } from "react";
import { CloudUpload, Loader2 } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";

/**
 * AppBar "Sync API Storage" button — triggers an outbound sync to the
 * upstream frontdoor endpoint so a cluster of wslproxy nodes can pull
 * fresh settings / instance metadata.  Mirrors the legacy
 * openresty-admin AppBar.jsx ApiSync component.
 *
 * No-ops silently when frontUrl / instance aren't configured (the
 * dataProvider's `syncAPI` handles that guard) — the button stays
 * visible so ops can use it once they've set up the instance, but
 * won't throw if it's misconfigured.
 */
export default function SyncButton() {
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const [loading, setLoading] = useState(false);

  const handleSync = useCallback(async () => {
    setLoading(true);
    try {
      await dataProvider.syncAPI();
      notify("Sync request sent", { type: "success" });
    } catch (err) {
      notify(
        "Sync failed: " + ((err as Error).message || String(err)),
        { type: "error" },
      );
    } finally {
      setLoading(false);
    }
  }, [dataProvider, notify]);

  return (
    <button
      type="button"
      onClick={handleSync}
      disabled={loading}
      aria-label="Sync API storage"
      title="Sync API storage"
      className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:cursor-wait disabled:opacity-60 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200"
    >
      {loading ? (
        <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
      ) : (
        <CloudUpload className="h-5 w-5" aria-hidden="true" />
      )}
    </button>
  );
}
