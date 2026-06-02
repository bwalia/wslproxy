// Server components must use the NAMED Card* exports — attached
// `Card.Header` properties don't cross the server/client module boundary.
import Card, { CardHeader, CardBody } from "@/components/ui/Card";
import { serverFetch } from "@/lib/api/server-client";
import type { AppSettings } from "@/types";

/**
 * Server component.  Fetches settings via the auth-forwarded server fetch
 * and renders them as static HTML — no JS shipped for this subtree.
 */
export default async function SettingsPanels() {
  let settings: AppSettings | null = null;
  let error: string | null = null;

  try {
    const res = await serverFetch<{ data?: AppSettings } | null>(
      "/global/settings",
      { cache: "no-store" },
    );
    settings = res?.data ?? null;
  } catch (err) {
    error = err instanceof Error ? err.message : "Failed to load settings";
  }

  if (error && !settings) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
        Failed to load settings: {error}
      </div>
    );
  }

  const entries: [string, string][] = [
    ["Instance ID", settings?.instance_id ?? "-"],
    ["Instance Name", settings?.instance_name ?? "-"],
    ["Storage Type", settings?.storage_type ?? "-"],
    ["Environment Profile", settings?.env_profile ?? "-"],
  ];

  const envVars = settings?.env_vars
    ? Object.entries(settings.env_vars as Record<string, unknown>)
    : [];

  return (
    <>
      <Card>
        <CardHeader>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            System Settings
          </h2>
        </CardHeader>
        <CardBody>
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
        </CardBody>
      </Card>

      {envVars.length > 0 && (
        <Card className="mt-4">
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Environment Variables
            </h2>
          </CardHeader>
          <CardBody>
            <dl className="divide-y divide-slate-100 dark:divide-slate-800">
              {envVars.map(([key, val]) => (
                <div key={key} className="flex justify-between py-3">
                  <dt className="font-mono text-xs text-slate-500 dark:text-slate-400">
                    {key}
                  </dt>
                  <dd className="text-sm text-slate-900 dark:text-slate-100">
                    {String(val)}
                  </dd>
                </div>
              ))}
            </dl>
          </CardBody>
        </Card>
      )}
    </>
  );
}
