"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HeartPulse, CheckCircle2, XCircle, AlertTriangle } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import type { HealthData } from "@/types";

export default function HealthPage() {
  const dataProvider = useDataProvider();
  const [health, setHealth] = useState<HealthData | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchHealth = useCallback(async () => {
    setLoading(true);
    try {
      const result = await dataProvider.getDetailedHealth();
      setHealth(result.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [dataProvider]);

  useEffect(() => {
    fetchHealth();
  }, [fetchHealth]);

  const overallStatus = useMemo(() => {
    if (!health?.status)
      return {
        label: "Unknown",
        color: "bg-slate-400",
        text: "text-slate-700",
      };
    const s = health.status.toLowerCase();
    if (s === "healthy" || s === "ok")
      return {
        label: "Healthy",
        color: "bg-emerald-500",
        text: "text-emerald-700",
      };
    if (s === "degraded")
      return {
        label: "Degraded",
        color: "bg-amber-500",
        text: "text-amber-700",
      };
    return { label: health.status, color: "bg-red-500", text: "text-red-700" };
  }, [health]);

  if (loading) {
    return (
      <div>
        <PageHeader
          title="Health"
          icon={HeartPulse}
          subtitle="System health diagnostics"
        />
        <div className="space-y-4">
          <Skeleton variant="rectangular" className="h-16" />
          <Skeleton variant="rectangular" className="h-40" />
          <Skeleton variant="rectangular" className="h-40" />
        </div>
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        title="Health"
        icon={HeartPulse}
        subtitle="System health diagnostics"
      />

      {/* Overall Status Banner */}
      <div
        className={`mb-6 flex items-center gap-3 rounded-lg ${overallStatus.color} p-4`}
      >
        {overallStatus.label === "Healthy" ? (
          <CheckCircle2 className="h-6 w-6 text-white" />
        ) : overallStatus.label === "Degraded" ? (
          <AlertTriangle className="h-6 w-6 text-white" />
        ) : (
          <XCircle className="h-6 w-6 text-white" />
        )}
        <span className="text-lg font-semibold text-white">
          System Status: {overallStatus.label}
        </span>
        {health?._latency != null && (
          <span className="ml-auto text-sm text-white/80">
            Response: {health._latency}ms
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Services */}
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Services
            </h2>
          </Card.Header>
          <Card.Body>
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
          </Card.Body>
        </Card>

        {/* System */}
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              System
            </h2>
          </Card.Header>
          <Card.Body>
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
          </Card.Body>
        </Card>

        {/* Settings Validation */}
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Settings Validation
            </h2>
          </Card.Header>
          <Card.Body>
            <dl className="space-y-3">
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Exists
                </dt>
                <dd>
                  {health?.settings_check?.exists ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
                  )}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-sm text-slate-500 dark:text-slate-400">
                  Valid JSON
                </dt>
                <dd>
                  {health?.settings_check?.valid_json ? (
                    <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                  ) : (
                    <XCircle className="h-5 w-5 text-red-500" />
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
          </Card.Body>
        </Card>

        {/* Data Directories */}
        <Card>
          <Card.Header>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Data Directories
            </h2>
          </Card.Header>
          <Card.Body>
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
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {dir.readable ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-red-500" />
                        )}
                      </td>
                      <td className="py-2 text-center">
                        {dir.writable ? (
                          <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-500" />
                        ) : (
                          <XCircle className="mx-auto h-4 w-4 text-red-500" />
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
          </Card.Body>
        </Card>
      </div>
    </div>
  );
}
