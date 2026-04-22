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
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <PageHeader
        title="Service Topology"
        icon={Network}
        subtitle="Virtual Servers, Rules, and Backend Origins"
      />
      <div className="flex-1 px-6 pb-6">
        <ErrorBoundary label="Topology" minHeightClass="min-h-[60vh]">
          <TopologyCanvas />
        </ErrorBoundary>
      </div>
    </div>
  );
}
