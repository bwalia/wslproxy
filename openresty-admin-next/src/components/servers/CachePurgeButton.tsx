"use client";

import { useCallback, useState, useTransition } from "react";
import { Eraser } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import { useNotification } from "@/contexts/NotificationContext";
import Button from "@/components/ui/Button";
import ConfirmDialog from "@/components/ui/ConfirmDialog";

/**
 * Purges the static/Varnish cache for a single server or globally.
 *
 * Always renders a confirmation dialog — cache purges are cheap but not
 * free (cold responses will re-hydrate), and accidental clicks should
 * be reversible only by "wait for the cache to warm up again".
 *
 * The mutation is wrapped in `useTransition` so the UI stays responsive
 * and the button's disabled state tracks the server round-trip.
 *
 * When `serverName` is omitted, the button is a "purge everything"
 * action — used on the dashboard CacheStats widget.
 */
interface CachePurgeButtonProps {
  /** Server to purge.  If omitted, purges all cache globally. */
  serverName?: string;
  /** Visual variant — `danger` for the global purge, `ghost` for per-server. */
  variant?: "ghost" | "danger";
  /** Override label (defaults derived from scope). */
  label?: string;
  /** Called after a successful purge; use to refresh local stats etc. */
  onPurged?: () => void;
  className?: string;
  /** Render just the icon without the label. */
  iconOnly?: boolean;
  /** Disable the button externally (e.g. no cache config yet). */
  disabled?: boolean;
}

export default function CachePurgeButton({
  serverName,
  variant = serverName ? "ghost" : "danger",
  label,
  onPurged,
  className,
  iconOnly = false,
  disabled = false,
}: CachePurgeButtonProps) {
  const dataProvider = useDataProvider();
  const { notify } = useNotification();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isPurging, startPurge] = useTransition();

  const scope = serverName ? `“${serverName}”` : "all servers";
  const resolvedLabel = label ?? (serverName ? "Purge cache" : "Purge all cache");

  const handleConfirm = useCallback(() => {
    setConfirmOpen(false);
    startPurge(async () => {
      try {
        if (serverName) {
          await dataProvider.purgeCache(serverName);
        } else {
          await dataProvider.purgeAllCache();
        }
        notify(`Cache purged for ${scope}`, { type: "success" });
        onPurged?.();
      } catch (err) {
        notify(
          (err as Error).message || `Failed to purge cache for ${scope}`,
          { type: "error" },
        );
      }
    });
  }, [dataProvider, notify, onPurged, scope, serverName]);

  return (
    <>
      <Button
        variant={variant}
        onClick={() => setConfirmOpen(true)}
        disabled={disabled || isPurging}
        loading={isPurging}
        className={className}
        aria-label={resolvedLabel}
      >
        <Eraser className="h-4 w-4" aria-hidden="true" />
        {!iconOnly && <span className="ml-1.5">{resolvedLabel}</span>}
      </Button>

      <ConfirmDialog
        open={confirmOpen}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
        loading={isPurging}
        title={serverName ? "Purge cache for this server?" : "Purge ALL cache?"}
        message={
          serverName
            ? `Remove every cached response for ${scope}. The next request will be served from the origin.`
            : "Remove every cached response across every server. All traffic will hit the origin until the cache warms up again."
        }
        confirmLabel={resolvedLabel}
        confirmVariant="danger"
      />
    </>
  );
}
