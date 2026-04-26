"use client";

import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import {
  ShieldAlert,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  FileWarning,
  MessageSquareWarning,
  Info,
  RefreshCw,
  Fingerprint,
  Lock,
  BanIcon,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import { useDataProvider } from "@/hooks/useResource";
import { refreshSslMetrics } from "@/lib/dashboard/actions";
import { formatNumber } from "@/lib/utils/formatters";

// ── Types ───────────────────────────────────────────────────────────────

interface LogMetricsData {
  available: boolean;
  metrics: Record<string, number>;
  message?: string;
}

// ── Sub-components ──────────────────────────────────────────────────────

/**
 * Large SSL-error metric card — one per category in the three-column
 * grid.  Matches the legacy dashboard's layout but with per-category
 * icons + a "healthy / issues detected" pill so at a glance the user
 * can spot which buckets have nonzero counts.
 */
const SslErrorCard = React.memo(function SslErrorCard({
  icon: Icon,
  label,
  hint,
  count,
}: {
  icon: LucideIcon;
  label: string;
  hint: string;
  count: number;
}) {
  const isZero = count === 0;
  return (
    <Card
      className={cn(
        "border-l-4 transition-colors",
        isZero
          ? "border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20"
          : "border-l-red-500 bg-red-50/40 dark:bg-red-950/20",
      )}
    >
      <Card.Body>
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
              isZero
                ? "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400"
                : "bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400",
            )}
          >
            <Icon className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                {label}
              </p>
              <Badge
                variant={isZero ? "success" : "danger"}
                size="sm"
              >
                {isZero ? "Healthy" : "Issues"}
              </Badge>
            </div>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              {hint}
            </p>
            <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900 dark:text-slate-100">
              {formatNumber(count)}
            </p>
          </div>
        </div>
      </Card.Body>
    </Card>
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
            "flex h-10 w-10 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800",
            iconColors[variant],
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500 dark:text-slate-400">{label}</p>
          <div className="flex items-center gap-2">
            <span className="text-xl font-bold text-slate-900 dark:text-slate-100">
              {formatNumber(count)}
            </span>
            <Badge
              variant={variant === "default" ? "default" : variant}
              size="sm"
            >
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
  const [refreshing, startRefresh] = useTransition();

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

  const handleRefresh = useCallback(() => {
    // Kick the server tag + re-pull the client-side data.  The Server
    // Action revalidates for the next navigation; the client-side
    // re-fetch makes the user see fresh data right now.
    startRefresh(async () => {
      await refreshSslMetrics();
      await fetchData();
    });
  }, [fetchData]);

  const metrics = useMemo(() => metricsData?.metrics ?? {}, [metricsData]);

  const sslErrors = useMemo(
    () => [
      {
        icon: Fingerprint,
        label: "SNI Detection Failures",
        hint: "TLS handshakes where the client did not advertise a hostname",
        count: metrics.nginx_ssl_sni_failures ?? metrics.ssl_sni_failures ?? 0,
      },
      {
        icon: Lock,
        label: "OCSP Stapling Failures",
        hint: "Failed certificate revocation-status lookups",
        count:
          metrics.nginx_ssl_ocsp_failures ?? metrics.ssl_ocsp_failures ?? 0,
      },
      {
        icon: BanIcon,
        label: "Domain Not Allowed",
        hint: "Cert issued but domain not in the allow-list",
        count:
          metrics.nginx_ssl_domain_not_allowed ??
          metrics.ssl_domain_not_allowed ??
          0,
      },
    ],
    [metrics],
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
    [metrics],
  );

  const isAvailable = metricsData?.available ?? false;

  if (loading) {
    return (
      <div className="space-y-6">
        <Card>
          <Card.Header>
            <Skeleton className="h-5 w-40" />
          </Card.Header>
          <Card.Body>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} variant="rectangular" className="h-28" />
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
          <div className="flex items-center justify-center gap-3 py-8 text-slate-500 dark:text-slate-400">
            <Info className="h-5 w-5" />
            <p>{metricsData?.message ?? "Prometheus metrics not available"}</p>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* ── SSL Error Tracking (3-column grid, one card per category) ── */}
      <Card>
        <Card.Header>
          <div className="flex min-w-0 items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-slate-500 dark:text-slate-400" />
            <div>
              <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
                SSL Error Tracking
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                TLS-handshake and certificate issues seen in the last 24h
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleRefresh}
            disabled={refreshing}
            aria-label="Refresh SSL metrics"
            className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 disabled:cursor-wait disabled:opacity-60 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <RefreshCw
              className={cn("h-4 w-4", refreshing && "animate-spin")}
              aria-hidden="true"
            />
          </button>
        </Card.Header>
        <Card.Body>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {sslErrors.map((item) => (
              <SslErrorCard
                key={item.label}
                icon={item.icon}
                label={item.label}
                hint={item.hint}
                count={item.count}
              />
            ))}
          </div>
        </Card.Body>
      </Card>

      {/* ── Nginx Log Level Tracking ─────────────────────────────────── */}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
