"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Database, HardDrive, Globe, FileType, Info } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { useDataProvider } from "@/hooks/useResource";
import CachePurgeButton from "@/components/servers/CachePurgeButton";

// ── Types ───────────────────────────────────────────────────────────────

interface HostEntry {
  host: string;
  count: number;
}

interface ExtensionEntry {
  extension: string;
  count: number;
}

interface TopUrl {
  host: string;
  url: string;
  size: number;
}

interface CacheData {
  available: boolean;
  total_entries: number;
  total_size_bytes: number;
  entries_by_host?: HostEntry[];
  entries_by_extension?: ExtensionEntry[];
  top_urls?: TopUrl[];
}

// ── Helpers ─────────────────────────────────────────────────────────────

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
}

function bytesToMB(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(2);
}

// ── Sub-components ──────────────────────────────────────────────────────

const StatCard = React.memo(function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <p className="text-xl font-bold text-slate-900 dark:text-slate-100">
            {value}
          </p>
        </div>
      </div>
    </Card>
  );
});

// ── Main component ──────────────────────────────────────────────────────

const CacheStats: React.FC = () => {
  const dp = useDataProvider();
  const [loading, setLoading] = useState(true);
  const [cacheData, setCacheData] = useState<CacheData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await dp.getCacheStats()) as any;
      setCacheData(res?.data ?? null);
    } catch {
      setCacheData(null);
    } finally {
      setLoading(false);
    }
  }, [dp]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const hostChartData = useMemo(() => {
    const raw = cacheData?.entries_by_host;
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .slice(0, 10)
      .map((e: { host: string; count: number }) => ({
        name: e.host,
        count: e.count,
      }));
  }, [cacheData]);

  const extChartData = useMemo(() => {
    const raw = cacheData?.entries_by_extension;
    const arr = Array.isArray(raw) ? raw : [];
    return arr
      .slice(0, 10)
      .map((e: { extension: string; count: number }) => ({
        name: e.extension || "(none)",
        count: e.count,
      }));
  }, [cacheData]);

  const topUrls = useMemo(() => {
    const raw = cacheData?.top_urls;
    const arr = Array.isArray(raw) ? raw : [];
    return arr.slice(0, 10);
  }, [cacheData]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <Card key={i} className="p-4">
              <Skeleton variant="rectangular" className="h-16" />
            </Card>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {Array.from({ length: 2 }).map((_, i) => (
            <Card key={i}>
              <Card.Header>
                <Skeleton className="h-5 w-48" />
              </Card.Header>
              <Card.Body>
                <Skeleton variant="rectangular" className="h-75" />
              </Card.Body>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!cacheData?.available) {
    return (
      <Card>
        <Card.Body>
          <div className="flex items-center gap-3 py-8 justify-center text-slate-500 dark:text-slate-400">
            <Info className="h-5 w-5" />
            <p>Cache statistics are not available</p>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header row: global purge action to the right of the tab title */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">
            Cache overview
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Aggregate counts across every server with caching enabled.
          </p>
        </div>
        <CachePurgeButton
          onPurged={fetchData}
          disabled={!cacheData.total_entries}
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={Database}
          label="Total Cached Items"
          value={cacheData.total_entries.toLocaleString()}
        />
        <StatCard
          icon={HardDrive}
          label="Cache Size"
          value={`${bytesToMB(cacheData.total_size_bytes)} MB`}
        />
        <StatCard
          icon={Globe}
          label="Hosts Cached"
          value={cacheData.entries_by_host?.length ?? 0}
        />
        <StatCard
          icon={FileType}
          label="File Types"
          value={cacheData.entries_by_extension?.length ?? 0}
        />
      </div>

      {/* Charts */}
      {(hostChartData.length > 0 || extChartData.length > 0) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {hostChartData.length > 0 && (
            <Card>
              <Card.Header>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Cached Entries by Host
                </h3>
              </Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={hostChartData}
                    layout="vertical"
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-slate-200 dark:stroke-slate-700"
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12 }}
                      className="fill-slate-500 dark:fill-slate-400"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      className="fill-slate-500 dark:fill-slate-400"
                      width={120}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-slate-900, #0f172a)",
                        border: "1px solid var(--color-slate-700, #334155)",
                        borderRadius: "8px",
                        color: "#e2e8f0",
                      }}
                    />
                    <Bar dataKey="count" fill="#3b82f6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          )}

          {extChartData.length > 0 && (
            <Card>
              <Card.Header>
                <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                  Cached Entries by File Type
                </h3>
              </Card.Header>
              <Card.Body>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart
                    data={extChartData}
                    layout="vertical"
                    margin={{ left: 20 }}
                  >
                    <CartesianGrid
                      strokeDasharray="3 3"
                      className="stroke-slate-200 dark:stroke-slate-700"
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 12 }}
                      className="fill-slate-500 dark:fill-slate-400"
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      className="fill-slate-500 dark:fill-slate-400"
                      width={80}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: "var(--color-slate-900, #0f172a)",
                        border: "1px solid var(--color-slate-700, #334155)",
                        borderRadius: "8px",
                        color: "#e2e8f0",
                      }}
                    />
                    <Bar dataKey="count" fill="#8b5cf6" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </Card.Body>
            </Card>
          )}
        </div>
      )}

      {/* Top Cached URLs */}
      {topUrls.length > 0 && (
        <Card>
          <Card.Header>
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Top Cached URLs
            </h3>
          </Card.Header>
          <Card.Body className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 text-left">
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400">
                      Host
                    </th>
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400">
                      URL
                    </th>
                    <th className="py-3 px-6 font-medium text-slate-500 dark:text-slate-400 text-right">
                      Size
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {topUrls.map((item, idx) => (
                    <tr
                      key={idx}
                      className="border-b border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <td className="py-2.5 px-6 text-slate-700 dark:text-slate-300">
                        {item.host}
                      </td>
                      <td className="py-2.5 px-6 font-mono text-xs text-slate-600 dark:text-slate-400 max-w-xs truncate">
                        {item.url}
                      </td>
                      <td className="py-2.5 px-6 text-right text-slate-700 dark:text-slate-300">
                        {formatBytes(item.size)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card.Body>
        </Card>
      )}
    </div>
  );
};

CacheStats.displayName = "CacheStats";

export default React.memo(CacheStats);
