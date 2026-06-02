"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import dynamic from "next/dynamic";
import { RefreshCw } from "lucide-react";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import LazySection from "@/components/ui/LazySection";
import TrafficStatsCards from "./TrafficStatsCards";
import DashboardTabs from "./DashboardTabs";
import ErrorDetailsDialog from "./ErrorDetailsDialog";
import { refreshTraffic } from "@/lib/dashboard/actions";
import type { TrafficData } from "@/lib/dashboard/fetchers";

/* ──────────────────────────────────────────────────────────────────────────
   Client shell for the dashboard.

   Why this is a client component even though data is server-fetched:
    - Tab state (activeTab) is an interactive UI concern, not data.
    - Charts from Recharts are client-only by nature (DOM
      measurements, tooltips, event handlers).
    - Refresh buttons trigger Server Actions (revalidateTag) then
      `router.refresh()` via useTransition — the transition keeps
      the UI responsive + shows a pending indicator while the new
      server payload streams in.
   ────────────────────────────────────────────────────────────────────────── */

const chartLoader = () => (
  <Card>
    <Card.Body>
      <Skeleton variant="rectangular" className="h-72 w-full" />
    </Card.Body>
  </Card>
);

// Keep heavy chart libs (Recharts, react-simple-maps) out of the
// initial JS bundle — they only mount when their tab / section renders.
const TrafficChart = dynamic(() => import("./TrafficChart"), { loading: chartLoader });
const TopDomainsChart = dynamic(() => import("./TopDomainsChart"), { loading: chartLoader });
const ErrorCodesChart = dynamic(() => import("./ErrorCodesChart"), { loading: chartLoader });
const LatencyChart = dynamic(() => import("./LatencyChart"), { loading: chartLoader });
const MethodsChart = dynamic(() => import("./MethodsChart"), { loading: chartLoader });
const GeoTrafficMap = dynamic(() => import("./GeoTrafficMap"), {
  loading: () => (
    <Card>
      <Card.Body>
        <Skeleton variant="rectangular" className="h-[400px] w-full" />
      </Card.Body>
    </Card>
  ),
  // react-simple-maps depends on window/DOM — server-render would crash.
  ssr: false,
});
const BackendHealth = dynamic(() => import("./BackendHealth"), { loading: chartLoader });
const SslOverview = dynamic(() => import("./SslOverview"), { loading: chartLoader });
const CacheStats = dynamic(() => import("./CacheStats"), { loading: chartLoader });
const WafOverview = dynamic(() => import("./WafOverview"), { loading: chartLoader });

interface TrafficOverviewClientProps {
  data: TrafficData;
}

export default function TrafficOverviewClient({ data }: TrafficOverviewClientProps) {
  const [activeTab, setActiveTab] = useState(0);
  const [errorDialogCode, setErrorDialogCode] = useState<number | null>(null);
  const [refreshing, startRefresh] = useTransition();

  const handleTabChange = useCallback((tab: number) => setActiveTab(tab), []);
  const handleErrorCodeClick = useCallback(
    (code: number) => setErrorDialogCode(code),
    [],
  );
  const handleErrorDialogClose = useCallback(() => setErrorDialogCode(null), []);

  const handleRefreshTraffic = useCallback(() => {
    startRefresh(async () => {
      await refreshTraffic();
    });
  }, []);

  // Destructure once — these are stable references since `data` only
  // updates via revalidation (which replaces the prop).
  const topDomains = useMemo(() => data?.top_domains ?? null, [data]);
  // Enrich summary with the unique-domain count derived from
  // `top_domains.length` (legacy did exactly this — no dedicated
  // backend field for it).  The card definition reads this field.
  const summary = useMemo(() => {
    if (!data?.summary) return null;
    return {
      ...data.summary,
      total_domains:
        data.summary.total_domains ?? (topDomains ? topDomains.length : 0),
    };
  }, [data, topDomains]);
  const chartData = useMemo(() => data?.chart_data ?? null, [data]);
  const errorCodes = useMemo(() => data?.error_codes ?? null, [data]);
  const latency = useMemo(() => data?.latency ?? null, [data]);
  const methods = useMemo(() => data?.methods ?? null, [data]);
  const geoData = useMemo(() => data?.geo_data ?? null, [data]);

  return (
    <div className="space-y-6">
      {/* Refresh affordance — only on the main Traffic section since
          all overview widgets share one fetch.  Tab-specific refresh
          buttons live on their own cards (BackendHealth, CacheStats,
          WafOverview, SslOverview) so ops can re-pull just what
          they're looking at. */}
      <div className="flex items-center justify-between">
        <div />
        <button
          type="button"
          onClick={handleRefreshTraffic}
          disabled={refreshing}
          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-wait disabled:opacity-60 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
          aria-label="Refresh traffic data"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            aria-hidden="true"
          />
          {refreshing ? "Refreshing…" : "Refresh"}
        </button>
      </div>

      <TrafficStatsCards summary={summary} loading={false} />

      <DashboardTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {activeTab === 0 && (
        <div className="space-y-6">
          <ErrorBoundary label="Traffic map">
            <GeoTrafficMap geoData={geoData} loading={false} />
          </ErrorBoundary>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ErrorBoundary label="Top domains">
              <TopDomainsChart domains={topDomains} loading={false} />
            </ErrorBoundary>
            <ErrorBoundary label="Error codes">
              <ErrorCodesChart
                errorCodes={errorCodes}
                loading={false}
                onCodeClick={handleErrorCodeClick}
              />
            </ErrorBoundary>
            <ErrorBoundary label="Latency">
              <LatencyChart latency={latency} loading={false} />
            </ErrorBoundary>
            <ErrorBoundary label="HTTP methods">
              <MethodsChart methods={methods} loading={false} />
            </ErrorBoundary>
          </div>

          <ErrorBoundary label="Traffic chart">
            <TrafficChart chartData={chartData} loading={false} />
          </ErrorBoundary>
        </div>
      )}

      {activeTab === 1 && (
        <ErrorBoundary label="Backend health">
          <BackendHealth />
        </ErrorBoundary>
      )}
      {activeTab === 2 && (
        <ErrorBoundary label="SSL overview">
          <SslOverview />
        </ErrorBoundary>
      )}
      {activeTab === 3 && (
        <ErrorBoundary label="Cache stats">
          <CacheStats />
        </ErrorBoundary>
      )}
      {activeTab === 4 && (
        <ErrorBoundary label="WAF overview">
          <WafOverview />
        </ErrorBoundary>
      )}

      <ErrorDetailsDialog
        open={errorDialogCode !== null}
        onClose={handleErrorDialogClose}
        statusCode={errorDialogCode}
      />
    </div>
  );
}

// Re-export lazy section so the page can still include bottom-of-page
// widgets (EntityStats, RecentBookmarks, etc.) alongside this shell.
export { LazySection };
