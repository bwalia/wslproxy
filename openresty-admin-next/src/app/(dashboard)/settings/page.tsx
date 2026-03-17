"use client";

import { useCallback, useEffect, useState } from "react";
import { Settings } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import type { AppSettings } from "@/types";

export default function SettingsPage() {
  const dataProvider = useDataProvider();
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchSettings = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dataProvider.loadSettings();
      setSettings(result);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [dataProvider]);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  if (loading) {
    return (
      <div>
        <PageHeader title="Settings" icon={Settings} />
        <div className="space-y-4">
          <Skeleton variant="rectangular" className="h-40" />
        </div>
      </div>
    );
  }

  const entries: [string, string][] = [
    ["Instance ID", settings?.instance_id ?? "-"],
    ["Instance Name", settings?.instance_name ?? "-"],
    ["Storage Type", settings?.storage_type ?? "-"],
    ["Environment Profile", settings?.env_profile ?? "-"],
  ];

  return (
    <div>
      <PageHeader
        title="Settings"
        icon={Settings}
        subtitle="Current system configuration"
      />

      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            System Settings
          </h2>
        </Card.Header>
        <Card.Body>
          <dl className="divide-y divide-slate-100 dark:divide-slate-800">
            {entries.map(([label, value]) => (
              <div key={label} className="flex justify-between py-3">
                <dt className="text-sm font-medium text-slate-500 dark:text-slate-400">
                  {label}
                </dt>
                <dd className="text-sm text-slate-900 dark:text-slate-100">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        </Card.Body>
      </Card>

      {settings?.env_vars && Object.keys(settings.env_vars).length > 0 && (
        <Card className="mt-4">
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Environment Variables
            </h2>
          </Card.Header>
          <Card.Body>
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              {Object.entries(settings.env_vars).map(([key, val]) => (
                <div key={key} className="flex justify-between py-3">
                  <dt className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {key}
                  </dt>
                  <dd className="text-sm text-slate-900 dark:text-slate-100">
                    {val}
                  </dd>
                </div>
              ))}
            </dl>
          </Card.Body>
        </Card>
      )}
    </div>
  );
}
