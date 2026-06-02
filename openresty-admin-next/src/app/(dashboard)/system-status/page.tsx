import { Suspense } from "react";
import { HeartPulse } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import HealthPanels from "./HealthPanels";
import HealthPanelsSkeleton from "./HealthPanelsSkeleton";
import HealthRefreshButton from "./HealthRefreshButton";

/**
 * Async Server Component.  The page shell (header + refresh button)
 * renders immediately; the data panels stream in via `<Suspense>` once
 * the Lua backend responds.  Zero client JS for the panel subtree.
 *
 * Auth cookie flows automatically via `serverFetch` (reads
 * `wslproxy_token` from `cookies()` and forwards to the Lua backend).
 *
 * `export const dynamic = "force-dynamic"` opts out of build-time
 * rendering — every request gets fresh data (though we still cache for
 * 10 s via the `revalidate` tag on the fetch).
 */
export const dynamic = "force-dynamic";

export default function HealthPage() {
  return (
    <div>
      <PageHeader
        title="Health"
        // Pre-rendered element: required when a server component passes
        // the icon to the client PageHeader — component references don't
        // cross the server/client boundary.
        icon={<HeartPulse className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-hidden="true" />}
        subtitle="System health diagnostics"
        actions={<HealthRefreshButton />}
      />

      <Suspense fallback={<HealthPanelsSkeleton />}>
        <HealthPanels />
      </Suspense>
    </div>
  );
}
