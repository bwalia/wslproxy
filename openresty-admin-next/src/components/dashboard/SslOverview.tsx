"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  FileWarning,
  MessageSquareWarning,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { useDataProvider } from "@/hooks/useResource";

// ── Types ───────────────────────────────────────────────────────────────

interface LogMetricsData {
  available: boolean;
  metrics: Record<string, number>;
  message?: string;
}

// ── Sub-components ──────────────────────────────────────────────────────

const SslMetricItem = React.memo(function SslMetricItem({
  label,
  count,
}: {
  label: string;
  count: number;
}) {
  const isZero = count === 0;
  return (
    <div
      className={cn(
        "flex items-center justify-between py-3 px-4 rounded-lg border",
        isZero
          ? "border-green-200 bg-green-50 dark:border-green-900 dark:bg-green-950/30"
          : "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950/30"
      )}
    >
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full",
            isZero ? "bg-green-500" : "bg-red-500"
          )}
        />
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </span>
      </div>
      <span
        className={cn(
          "text-lg font-bold",
          isZero
            ? "text-green-600 dark:text-green-400"
            : "text-red-600 dark:text-red-400"
        )}
      >
        {count.toLocaleString()}
      </span>
    </div>
  );
});

const LogLevelCard = React.memo(function LogLevelCard({
  icon: Icon,
  label,
  count,
  variant,
}: {
  icon: React.ElementType;
  label: string;
  count: number;
  variant: "danger" | "warning" | "info" | "default";
}) {
  const iconColors: Record<string, string> = {
    danger: "text-red-500",
    warning: "text-amber-500",
    info: "text-blue-500",
    default: "text-slate-500 dark:text-slate-400",
  };

  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex items-center justify-center h-10 w-10 rounded-lg bg-slate-100 dark:bg-slate-800",
            iconColors[variant]
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {count.toLocaleString()}
            </span>
            <Badge variant={variant === "default" ? "default" : variant} size="sm">
              {variant === "danger"
                ? "Error"
                : variant === "warning"
                  ? "Warning"
                  : variant === "info"
                    ? "Notice"
                    : "All"}
            </Badge>
          </div>
        </div>
      </div>
    </Card>
  );
});

// ── Main component ──────────────────────────────────────────────────────

const SslOverview: React.FC = () => {
  const dp = useDataProvider();
  const [loading, setLoading] = useState(true);
  const [metricsData, setMetricsData] = useState<LogMetricsData | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await dp.getLogMetrics()) as any;
      setMetricsData(res?.data ?? null);
    } catch {
      setMetricsData(null);
    } finally {
      setLoading(false);
    }
  }, [dp]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const metrics = useMemo(
    () => metricsData?.metrics ?? {},
    [metricsData]
  );

  const sslErrors = useMemo(
    () => [
      {
        label: "SNI Detection Failures",
        count: metrics.nginx_ssl_sni_failures ?? metrics.ssl_sni_failures ?? 0,
      },
      {
        label: "OCSP Stapling Failures",
        count:
          metrics.nginx_ssl_ocsp_failures ?? metrics.ssl_ocsp_failures ?? 0,
      },
      {
        label: "Domain Not Allowed",
        count:
          metrics.nginx_ssl_domain_not_allowed ??
          metrics.ssl_domain_not_allowed ??
          0,
      },
    ],
    [metrics]
  );

  const logLevels = useMemo(
    () => [
      {
        icon: AlertOctagon,
        label: "Error Logs",
        count: metrics.nginx_log_errors_total ?? 0,
        variant: "danger" as const,
      },
      {
        icon: AlertTriangle,
        label: "Warning Logs",
        count: metrics.nginx_log_warnings_total ?? 0,
        variant: "warning" as const,
      },
      {
        icon: MessageSquareWarning,
        label: "Notice Logs",
        count: metrics.nginx_log_notices_total ?? 0,
        variant: "info" as const,
      },
      {
        icon: FileWarning,
        label: "All Levels",
        count: metrics.nginx_log_messages_total ?? 0,
        variant: "default" as const,
      },
    ],
    [metrics]
  );

  const isAvailable = metricsData?.available ?? false;

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <Card.Header>
            <Skeleton className="h-5 w-40" />
          </Card.Header>
          <Card.Body className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} variant="rectangular" className="h-12" />
            ))}
          </Card.Body>
        </Card>
        <Card>
          <Card.Header>
            <Skeleton className="h-5 w-48" />
          </Card.Header>
          <Card.Body>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" className="h-20" />
              ))}
            </div>
          </Card.Body>
        </Card>
      </div>
    );
  }

  if (!isAvailable) {
    return (
      <Card>
        <Card.Body>
          <div className="flex items-center gap-3 py-8 justify-center text-slate-500 dark:text-slate-400">
            <Info className="h-5 w-5" />
            <p>{metricsData?.message ?? "Prometheus metrics not available"}</p>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* SSL Error Tracking */}
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              SSL Error Tracking
            </h3>
          </div>
        </Card.Header>
        <Card.Body className="space-y-3">
          {sslErrors.map((item) => (
            <SslMetricItem
              key={item.label}
              label={item.label}
              count={item.count}
            />
          ))}
        </Card.Body>
      </Card>

      {/* Nginx Log Level Tracking */}
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              Nginx Log Level Tracking
            </h3>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {logLevels.map((item) => (
              <LogLevelCard
                key={item.label}
                icon={item.icon}
                label={item.label}
                count={item.count}
                variant={item.variant}
              />
            ))}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

SslOverview.displayName = "SslOverview";

export default React.memo(SslOverview);
