import { Suspense } from "react";
import dynamic from "next/dynamic";
import Card, { CardBody } from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import LazySection from "@/components/ui/LazySection";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import WelcomeBannerServer from "@/components/dashboard/WelcomeBannerServer";
import WelcomeBannerSkeleton from "@/components/dashboard/WelcomeBannerSkeleton";
import TrafficOverviewServer from "@/components/dashboard/TrafficOverviewServer";

/* ──────────────────────────────────────────────────────────────────────────
   Dashboard home — Server Component.

   Architecture (Wave 9.2):
    - This file is an async Server Component.  Data fetching happens
      on the server; the initial HTML response already contains the
      welcome banner + traffic numbers, so there's no "empty shell
      hydrating" flash on first paint.
    - Each top-level section is wrapped in its own `<Suspense>`
      boundary.  React streams them independently — whichever server
      fetch resolves first renders first.  A slow `/traffic/stats`
      call won't block the welcome banner from appearing.
    - Interactive bits (tabs, charts, refresh buttons, error modal)
      live inside `TrafficOverviewClient` — a client component that
      receives resolved data as props, so it re-renders synchronously
      when `router.refresh()` invalidates the server tree.
    - Bottom-of-page widgets stay lazy (`LazySection`) — they only
      mount + fetch when the user scrolls far enough.
    - Cache-tag invalidation is the refresh mechanism.  Server Actions
      in `lib/dashboard/actions.ts` call `revalidateTag(tag, "max")`
      so the next navigation (or a bare `router.refresh()`) re-fetches
      just the section whose tag was nuked.
   ────────────────────────────────────────────────────────────────────────── */

function SectionSkeleton({ height = "h-64" }: { height?: string }) {
  return (
    <Card>
      <CardBody>
        <Skeleton variant="rectangular" className={`w-full ${height}`} />
      </CardBody>
    </Card>
  );
}

// Bottom-of-page widgets stay dynamic — they're not critical on initial
// paint, and the charts inside (Recharts) are client-only.
const EntityStats = dynamic(
  () => import("@/components/dashboard/EntityStats"),
  { loading: () => <SectionSkeleton height="h-24" /> },
);
const RecentBookmarks = dynamic(
  () => import("@/components/dashboard/RecentBookmarks"),
  { loading: () => <SectionSkeleton height="h-40" /> },
);
const AiInsightsWidget = dynamic(
  () => import("@/components/dashboard/AiInsightsWidget"),
  { loading: () => <SectionSkeleton height="h-48" /> },
);
const LogsSection = dynamic(
  () => import("@/components/dashboard/LogsSection"),
  { loading: () => <SectionSkeleton height="h-64" /> },
);

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* ── Welcome banner ──────────────────────────────────────────────
          Streams in as soon as `/instance/info` resolves.  On a slow
          upstream, the traffic section below can still render first. */}
      <ErrorBoundary label="Welcome banner">
        <Suspense fallback={<WelcomeBannerSkeleton />}>
          <WelcomeBannerServer />
        </Suspense>
      </ErrorBoundary>

      {/* ── Main traffic overview (tabs + charts) ────────────────────── */}
      <ErrorBoundary label="Traffic overview">
        <Suspense fallback={<SectionSkeleton height="h-[700px]" />}>
          <TrafficOverviewServer />
        </Suspense>
      </ErrorBoundary>

      {/* ── Bottom strip: lazy-loaded on scroll.  These use client-side
          fetches currently — migrating them to RSC is Wave 9.3+. */}
      <LazySection height="h-24">
        <ErrorBoundary label="Entity stats">
          <EntityStats />
        </ErrorBoundary>
      </LazySection>

      <LazySection height="h-40">
        <ErrorBoundary label="Recent bookmarks">
          <RecentBookmarks />
        </ErrorBoundary>
      </LazySection>

      <LazySection height="h-48">
        <ErrorBoundary label="AI insights">
          <AiInsightsWidget />
        </ErrorBoundary>
      </LazySection>

      <LazySection height="h-64">
        <ErrorBoundary label="Logs">
          <LogsSection />
        </ErrorBoundary>
      </LazySection>
    </div>
  );
}
