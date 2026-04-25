"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RotateCw } from "lucide-react";
import Button from "@/components/ui/Button";

/**
 * Triggers `router.refresh()` to re-run the parent server component and
 * fetch fresh health data.  `useTransition` keeps the UI responsive and
 * exposes a pending state for the spinner.
 */
export default function HealthRefreshButton() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const handleRefresh = useCallback(() => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  return (
    <Button
      variant="ghost"
      onClick={handleRefresh}
      disabled={isPending}
      loading={isPending}
      aria-label="Refresh health status"
    >
      <RotateCw className="h-4 w-4" aria-hidden="true" />
      <span className="ml-2">Refresh</span>
    </Button>
  );
}
