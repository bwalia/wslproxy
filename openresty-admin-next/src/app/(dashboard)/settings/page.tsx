import { Suspense } from "react";
import { Settings } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { StorageSettingsCard } from "@/components/layout/StorageSelector";
import SettingsPanels from "./SettingsPanels";
import SettingsPanelsSkeleton from "./SettingsPanelsSkeleton";

export const dynamic = "force-dynamic";

export default function SettingsPage() {
  return (
    <div>
      <PageHeader
        title="Settings"
        // Pre-rendered element: required when a server component passes
        // the icon to the client PageHeader — component references don't
        // cross the server/client boundary.
        icon={<Settings className="h-5 w-5 text-primary-600 dark:text-primary-400" aria-hidden="true" />}
        subtitle="Current system configuration"
      />

      <StorageSettingsCard />

      <Suspense fallback={<SettingsPanelsSkeleton />}>
        <SettingsPanels />
      </Suspense>
    </div>
  );
}
