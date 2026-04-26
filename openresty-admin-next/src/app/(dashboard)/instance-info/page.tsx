"use client";

import { useCallback, useEffect, useState } from "react";
import useSWR from "swr";
import {
  ArrowLeft,
  Cpu,
  HardDrive,
  Network,
  RefreshCw,
  Server as ServerIcon,
  Wifi,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { dataProvider } from "@/lib/api/data-provider";
import PageHeader from "@/components/ui/PageHeader";
import Card from "@/components/ui/Card";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import type { InstanceInfo } from "@/types";

/**
 * Read-only diagnostic page mirroring the legacy
 * openresty-admin/src/Instances/InstanceInfo.jsx.  Pulls host /
 * network / CPU / memory / disk metadata from `GET /api/instance/info`
 * so operators can verify the live environment without shelling into
 * the box.
 *
 * Refetches on demand (Refresh button) and every 30s automatically —
 * the data is cheap for the backend (no DB hits) and useful to see
 * uptime / load tick forward while debugging.
 */

export default function InstanceInfoPage() {
  const router = useRouter();

  const { data, error, isLoading, mutate } = useSWR(
    "instance-info",
    () => dataProvider.getInstanceInfo(),
    {
      revalidateOnFocus: false,
      refreshInterval: 30_000,
    },
  );

  // Surface the last-refreshed timestamp so the user knows how stale
  // the numbers are — important for uptime / load-average readings.
  const [refreshedAt, setRefreshedAt] = useState<Date | null>(null);
  useEffect(() => {
    if (data) setRefreshedAt(new Date());
  }, [data]);

  const handleRefresh = useCallback(() => {
    mutate();
  }, [mutate]);

  const info: InstanceInfo = data?.data ?? {};

  return (
    <div>
      <PageHeader
        title="Instance Info"
        subtitle="Host, CPU, memory, disk, and network details for this node"
        icon={ServerIcon}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              onClick={() => router.back()}
              icon={<ArrowLeft className="h-4 w-4" />}
            >
              Back
            </Button>
            <Button
              variant="ghost"
              onClick={handleRefresh}
              icon={<RefreshCw className="h-4 w-4" />}
            >
              Refresh
            </Button>
          </div>
        }
      />

      {refreshedAt && (
        <p className="mb-4 text-xs text-slate-500 dark:text-slate-400">
          Last refreshed {refreshedAt.toLocaleTimeString()}
        </p>
      )}

      {error && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300"
        >
          Failed to load instance info: {(error as Error).message}
        </div>
      )}

      {isLoading && !data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Skeleton variant="rectangular" />
          <Skeleton variant="rectangular" />
          <Skeleton variant="rectangular" />
          <Skeleton variant="rectangular" />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <InfoCard title="Server Details" icon={ServerIcon}>
            <DefRow label="Hostname" value={info.hostname} mono />
            <DefRow label="FQDN" value={info.fqdn} mono />
            <DefRow label="Environment" value={info.environment} />
            <DefRow label="Uptime" value={info.uptime} />
            <DefRow label="Load Average" value={info.load_average} mono />
          </InfoCard>

          <InfoCard title="CPU & Memory" icon={Cpu}>
            <DefRow label="OS" value={info.os} />
            <DefRow label="Kernel" value={info.kernel} mono />
            <DefRow label="CPU Model" value={info.cpu?.model} />
            <DefRow label="CPU Cores" value={info.cpu?.cores?.toString()} />
            <DefRow
              label="CPU Usage"
              value={
                typeof info.cpu?.usage_percent === "number"
                  ? `${info.cpu.usage_percent}%`
                  : undefined
              }
            />
            <DefRow label="Memory Total" value={info.memory?.total} />
            <DefRow label="Memory Used" value={info.memory?.used} />
            <DefRow label="Memory Available" value={info.memory?.available} />
            <DefRow label="Memory Free" value={info.memory?.free} />
          </InfoCard>

          <InfoCard title="Storage" icon={HardDrive}>
            <DefRow label="Disk Total" value={info.disk?.total} />
            <DefRow label="Disk Used" value={info.disk?.used} />
            <DefRow label="Disk Available" value={info.disk?.available} />
            <DefRow label="Disk Usage" value={info.disk?.percent} />
          </InfoCard>

          <InfoCard title="IP Addresses" icon={Wifi}>
            {info.ip_addresses && info.ip_addresses.length > 0 ? (
              <div className="flex flex-wrap gap-2">
                {info.ip_addresses.map((ip) => (
                  <span
                    key={ip}
                    className="inline-flex rounded-md bg-primary-50 px-2 py-1 font-mono text-xs font-semibold text-primary-700 dark:bg-primary-900/30 dark:text-primary-300"
                  >
                    {ip}
                  </span>
                ))}
              </div>
            ) : (
              <EmptyHint>No IP addresses available</EmptyHint>
            )}
          </InfoCard>

          {/* Network interfaces + routes span the full width — the
              values are long multi-line strings. */}
          <div className="md:col-span-2">
            <InfoCard title="Network Interfaces" icon={Network}>
              <LogBlock
                lines={info.network?.interfaces}
                emptyText="No network interfaces available"
              />
            </InfoCard>
          </div>

          <div className="md:col-span-2">
            <InfoCard title="Network Routes" icon={Network}>
              <LogBlock
                lines={info.network?.routes}
                emptyText="No routes available"
              />
            </InfoCard>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── small presentational helpers ───────────────────────────────────────

function InfoCard({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <Card.Header>
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary-500" />
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {title}
          </h2>
        </div>
      </Card.Header>
      <Card.Body>{children}</Card.Body>
    </Card>
  );
}

function DefRow({
  label,
  value,
  mono,
}: {
  label: string;
  value?: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-slate-100 py-1.5 text-sm last:border-b-0 dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">{label}</span>
      <span
        className={`truncate text-right font-medium text-slate-800 dark:text-slate-200 ${
          mono ? "font-mono text-xs" : ""
        }`}
        title={value}
      >
        {value || <span className="text-slate-300 dark:text-slate-600">N/A</span>}
      </span>
    </div>
  );
}

function LogBlock({
  lines,
  emptyText,
}: {
  lines?: string[];
  emptyText: string;
}) {
  if (!lines || lines.length === 0) return <EmptyHint>{emptyText}</EmptyHint>;
  return (
    <pre className="max-h-64 overflow-auto rounded bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 dark:bg-slate-900/60 dark:text-slate-300">
      {lines.join("\n")}
    </pre>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs italic text-slate-400 dark:text-slate-500">
      {children}
    </p>
  );
}
