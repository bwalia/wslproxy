"use client";

import PageHeader from "@/components/ui/PageHeader";
import { TopologyCanvas } from "@/components/topology/TopologyCanvas";
import { Network } from "lucide-react";

export default function TopologyPage() {
  return (
    <div className="flex flex-col h-[calc(100vh-4rem)]">
      <PageHeader
        title="Service Topology"
        icon={Network}
        subtitle="Virtual Servers, Rules, and Backend Origins"
      />
      <div className="flex-1 px-6 pb-6">
        <TopologyCanvas />
      </div>
    </div>
  );
}
