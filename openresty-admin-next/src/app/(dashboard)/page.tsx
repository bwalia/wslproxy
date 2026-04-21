"use client";

import {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import dynamic from "next/dynamic";
import { useDataProvider } from "@/hooks/useResource";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import LazySection from "@/components/ui/LazySection";

// ── Section skeleton ────────────────────────────────────────────────────

function SectionSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <Card>
      <Card.Body>
        <Skeleton variant="rectangular" className={`w-full ${height}`} />
      </Card.Body>
    </Card>
  );
}

// ── Dashboard sections ──────────────────────────────────────────────────
// Static (small, always visible): TrafficStatsCards, WelcomeBanner, DashboardTabs, ErrorDetailsDialog
// Dynamic (heavy, chart-based): deferred via next/dynamic so Recharts + react-simple-maps
// stay out of the initial bundle and load only when rendered.

import TrafficStatsCards from "@/components/dashboard/TrafficStatsCards";
import DashboardTabs from "@/components/dashboard/DashboardTabs";
import ErrorDetailsDialog from "@/components/dashboard/ErrorDetailsDialog";
import WelcomeBanner from "@/components/dashboard/WelcomeBanner";

const chartLoader = () => <SectionSkeleton height="h-72" />;

const TrafficChart = dynamic(
  () => import("@/components/dashboard/TrafficChart"),
  { loading: chartLoader },
);
const TopDomainsChart = dynamic(
  () => import("@/components/dashboard/TopDomainsChart"),
  { loading: chartLoader },
);
const ErrorCodesChart = dynamic(
  () => import("@/components/dashboard/ErrorCodesChart"),
  { loading: chartLoader },
);
const LatencyChart = dynamic(
  () => import("@/components/dashboard/LatencyChart"),
  { loading: chartLoader },
);
const MethodsChart = dynamic(
  () => import("@/components/dashboard/MethodsChart"),
  { loading: chartLoader },
);
const GeoTrafficMap = dynamic(
  () => import("@/components/dashboard/GeoTrafficMap"),
  { loading: () => <SectionSkeleton height="h-[400px]" />, ssr: false },
);
const EntityStats = dynamic(
  () => import("@/components/dashboard/EntityStats"),
  { loading: chartLoader },
);
const RecentBookmarks = dynamic(
  () => import("@/components/dashboard/RecentBookmarks"),
  { loading: chartLoader },
);
const LogsSection = dynamic(
  () => import("@/components/dashboard/LogsSection"),
  { loading: chartLoader },
);
const BackendHealth = dynamic(
  () => import("@/components/dashboard/BackendHealth"),
  { loading: chartLoader },
);
const SslOverview = dynamic(
  () => import("@/components/dashboard/SslOverview"),
  { loading: chartLoader },
);
const CacheStats = dynamic(
  () => import("@/components/dashboard/CacheStats"),
  { loading: chartLoader },
);
const WafOverview = dynamic(
  () => import("@/components/dashboard/WafOverview"),
  { loading: chartLoader },
);

// ── Traffic data hook ───────────────────────────────────────────────────

interface TrafficData {
  chart_data?: { name: string; requests: number; success?: number; errors: number }[];
  summary?: Record<string, number>;
  top_domains?: { domain: string; requests: number }[];
  error_codes?: { code: number; count: number }[];
  latency?: { fast?: number; normal?: number; slow?: number; very_slow?: number };
  methods?: Record<string, number>;
  geo_data?: { country_code: string; requests: number }[];
}

function useTrafficData() {
  const api = useDataProvider();
  const [data, setData] = useState<TrafficData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .getTrafficStats()
      .then((r) => {
        if (!cancelled) setData((r?.data as TrafficData) ?? null);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [api]);

  return { data, loading };
}

// ── Main dashboard page ─────────────────────────────────────────────────

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [errorDialogCode, setErrorDialogCode] = useState<number | null>(null);

  const { data: traffic, loading: trafficLoading } = useTrafficData();

  const handleTabChange = useCallback((tab: number) => setActiveTab(tab), []);
  const handleErrorCodeClick = useCallback((code: number) => setErrorDialogCode(code), []);
  const handleErrorDialogClose = useCallback(() => setErrorDialogCode(null), []);

  const summary = useMemo(() => traffic?.summary ?? null, [traffic]);
  const chartData = useMemo(() => traffic?.chart_data ?? null, [traffic]);
  const topDomains = useMemo(() => traffic?.top_domains ?? null, [traffic]);
  const errorCodes = useMemo(() => traffic?.error_codes ?? null, [traffic]);
  const latency = useMemo(() => traffic?.latency ?? null, [traffic]);
  const methods = useMemo(() => traffic?.methods ?? null, [traffic]);
  const geoData = useMemo(() => traffic?.geo_data ?? null, [traffic]);

  return (
    <div className="space-y-6">
      {/* ── Welcome banner with instance info ──────────────────────── */}
      <Suspense fallback={<SectionSkeleton height="h-48" />}>
        <WelcomeBanner />
      </Suspense>

      {/* ── Traffic stats (6 cards) ─────────────────────────────────── */}
      <TrafficStatsCards summary={summary} loading={trafficLoading} />

      {/* ── Tabs ────────────────────────────────────────────────────── */}
      <DashboardTabs activeTab={activeTab} onTabChange={handleTabChange} />

      {/* ── Tab content ─────────────────────────────────────────────── */}
      {/* Only the active tab renders — inactive tabs unmount completely,
          so their API calls don't fire until the user clicks the tab. */}

      {activeTab === 0 && (
        <div className="space-y-6">
          <GeoTrafficMap geoData={geoData} loading={trafficLoading} />

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <TopDomainsChart domains={topDomains} loading={trafficLoading} />
            <ErrorCodesChart
              errorCodes={errorCodes}
              loading={trafficLoading}
              onCodeClick={handleErrorCodeClick}
            />
            <LatencyChart latency={latency} loading={trafficLoading} />
            <MethodsChart methods={methods} loading={trafficLoading} />
          </div>

          <TrafficChart chartData={chartData} loading={trafficLoading} />
        </div>
      )}

      {activeTab === 1 && <BackendHealth />}
      {activeTab === 2 && <SslOverview />}
      {activeTab === 3 && <CacheStats />}
      {activeTab === 4 && <WafOverview />}

      {/* ── Bottom sections — lazy-loaded on scroll ────────────────── */}
      {/* These only render + fetch their data when scrolled into view,
          so the initial page load doesn't fire unnecessary API calls. */}

      <LazySection height="h-24">
        <EntityStats />
      </LazySection>

      <LazySection height="h-40">
        <RecentBookmarks />
      </LazySection>

      <LazySection height="h-64">
        <LogsSection />
      </LazySection>

      {/* ── Error details modal ─────────────────────────────────────── */}
      <ErrorDetailsDialog
        open={errorDialogCode !== null}
        onClose={handleErrorDialogClose}
        statusCode={errorDialogCode}
      />
    </div>
  );
}
