"use client";

import dynamic from "next/dynamic";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import ErrorBoundary from "@/components/ui/ErrorBoundary";
import { Network } from "lucide-react";

const TopologyCanvas = dynamic(
  () =>
    import("@/components/topology/TopologyCanvas").then(
      (mod) => mod.TopologyCanvas,
    ),
  {
    loading: () => (
      <Card>
        <Card.Body>
          <Skeleton variant="rectangular" className="h-[70vh] w-full" />
        </Card.Body>
      </Card>
    ),
    ssr: false,
  },
);

export default function TopologyPage() {
  return (
    // `flex-1` fills the dashboard <main>'s flex column.  Hard-coding
    // `h-[calc(100vh-Xrem)]` is fragile — it ignores AppBar + Footer
    // + main padding, so the resulting under-tall wrapper let
    // long-topology content scroll past the footer and the footer
    // appeared stuck mid-page.  `min-h-0` on the inner flex child is
    // the standard fix for nested overflow inside a flex column.
    <div className="flex flex-1 flex-col">
      <PageHeader
        title="Service Topology"
        icon={Network}
        subtitle="Virtual Servers, Rules, and Backend Origins"
      />
      <div className="flex min-h-0 flex-1 flex-col px-6 pb-6">
        <ErrorBoundary label="Topology" minHeightClass="min-h-[60vh]">
          <TopologyCanvas />
        </ErrorBoundary>
      </div>
    </div>
  );
}
