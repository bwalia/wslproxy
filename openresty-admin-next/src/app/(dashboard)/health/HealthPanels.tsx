import { CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
// Server components must use the NAMED Card* exports — attached
// `Card.Header` properties don't cross the server/client module boundary.
import Card, { CardHeader, CardBody } from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { serverFetch, CACHE_TAGS } from "@/lib/api/server-client";
import type { HealthData, SingleResult } from "@/types";

/**
 * Server component.  Runs on the Next.js server, forwards the httpOnly
 * auth cookie to the Lua backend, and renders the full health report.
 *
 * No JavaScript for this subtree is shipped to the browser — the HTML
 * streams in as soon as the backend responds.
 */

interface OverallStatus {
  label: string;
  colorClass: string;
}

function deriveStatus(health: HealthData | null): OverallStatus {
  if (!health?.status) return { label: "Unknown", colorClass: "bg-slate-400" };
  const s = health.status.toLowerCase();
  if (s === "healthy" || s === "ok")
    return { label: "Healthy", colorClass: "bg-emerald-500" };
  if (s === "degraded")
    return { label: "Degraded", colorClass: "bg-amber-500" };
  return { label: health.status, colorClass: "bg-red-500" };
}

async function fetchHealthData(): Promise<{
  data: HealthData | null;
  error: string | null;
  latencyMs: number;
}> {
  const start = Date.now();
  try {
    const res = await serverFetch<SingleResult<HealthData>>(
      "/ping?detailed=true",
      {
        // 10-second server cache tagged with "health" — mutations in the
        // health-affecting surfaces can call revalidateTag('health').
        next: { revalidate: 10, tags: [CACHE_TAGS.health] },
      },
    );
    return {
      data: res?.data ?? null,
      error: null,
      latencyMs: Date.now() - start,
    };
  } catch (err) {
    return {
      data: null,
      error: err instanceof Error ? err.message : "Unknown error",
      latencyMs: Date.now() - start,
    };
  }
}

export default async function HealthPanels() {
  const { data: health, error, latencyMs } = await fetchHealthData();
  const overall = deriveStatus(health);

  return (
    <>
      {/* Overall Status Banner */}
      <div
        className={`mb-6 flex items-center gap-3 rounded-lg ${overall.colorClass} p-4`}
        role="status"
        aria-live="polite"
      >
        {overall.label === "Healthy" ? (
          <CheckCircle2 className="h-6 w-6 text-white" aria-hidden="true" />
        ) : overall.label === "Degraded" ? (
          <AlertTriangle className="h-6 w-6 text-white" aria-hidden="true" />
        ) : (
          <XCircle className="h-6 w-6 text-white" aria-hidden="true" />
        )}
        <span className="text-lg font-semibold text-white">
          System Status: {overall.label}
        </span>
        <span className="ml-auto text-sm text-white/80">
          Response: {latencyMs}ms
        </span>
      </div>

      {error && !health && (
        <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
          Failed to load health data: {error}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Services
            </h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  OpenResty Version
                </dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {health?.openresty_version ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Nginx Workers
                </dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {health?.nginx_workers ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Redis Status
                </dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {health?.redis?.status ?? "-"}
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              System
            </h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Hostname
                </dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {health?.system?.hostname ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  OS
                </dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {health?.system?.os ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  CPU
                </dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {health?.system?.cpu?.model ?? "-"} (
                  {health?.system?.cpu?.cores ?? 0} cores,{" "}
                  {health?.system?.cpu?.usage_percent ?? 0}%)
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Memory
                </dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {health?.system?.memory?.used ?? "-"} /{" "}
                  {health?.system?.memory?.total ?? "-"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Disk
                </dt>
                <dd className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {health?.system?.disk?.used ?? "-"} /{" "}
                  {health?.system?.disk?.total ?? "-"} (
                  {health?.system?.disk?.percent ?? "-"})
                </dd>
              </div>
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Settings Validation
            </h2>
          </CardHeader>
          <CardBody>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Exists
                </dt>
                <dd>
                  {health?.settings_check?.exists ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-label="Yes" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" aria-label="No" />
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Valid JSON
                </dt>
                <dd>
                  {health?.settings_check?.valid_json ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" aria-label="Yes" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" aria-label="No" />
                  )}
                </dd>
              </div>
              {health?.settings_check?.missing_keys &&
                health.settings_check.missing_keys.length > 0 && (
                  <div>
                    <dt className="mb-1 text-sm text-slate-500 dark:text-slate-400">
                      Missing Keys
                    </dt>
                    <dd className="flex flex-wrap gap-1">
                      {health.settings_check.missing_keys.map((key) => (
                        <Badge key={key} variant="warning" size="sm">
                          {key}
                        </Badge>
                      ))}
                    </dd>
                  </div>
                )}
            </dl>
          </CardBody>
        </Card>

        <Card>
          <CardHeader>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Data Directories
            </h2>
          </CardHeader>
          <CardBody>
            {health?.data_directories && health.data_directories.length > 0 ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700">
                    <th className="pb-2 text-left text-xs font-semibold uppercase text-slate-500">
                      Path
                    </th>
                    <th className="pb-2 text-center text-xs font-semibold uppercase text-slate-500">
                      Exists
                    </th>
                    <th className="pb-2 text-center text-xs font-semibold uppercase text-slate-500">
                      Readable
                    </th>
                    <th className="pb-2 text-center text-xs font-semibold uppercase text-slate-500">
                      Writable
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {health.data_directories.map((dir) => (
                    <tr key={dir.path}>
                      <td className="py-2 font-mono text-xs text-slate-700 dark:text-slate-300">
                        {dir.path}
                      </td>
                      <td className="py-2 text-center">
                        {dir.exists ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" aria-label="Yes" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-red-500" aria-label="No" />
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {dir.readable ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" aria-label="Yes" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-red-500" aria-label="No" />
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {dir.writable ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" aria-label="Yes" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-red-500" aria-label="No" />
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">
                No directory data available.
              </p>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}
