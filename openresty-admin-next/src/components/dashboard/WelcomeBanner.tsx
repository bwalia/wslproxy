"use client";

import { memo, useCallback, useMemo, useState } from "react";
import {
  Server,
  Globe,
  Cpu,
  MemoryStick,
  HardDrive,
  Copy,
  Check,
  ArrowRight,
} from "lucide-react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Card from "@/components/ui/Card";
import Logo from "@/components/Logo";
import type { InstanceInfo } from "@/types";

interface WelcomeBannerProps {
  info: InstanceInfo;
}

/**
 * Client-side welcome banner.  Takes fully-resolved `info` as a prop
 * (fetched server-side in `WelcomeBannerServer`) — does NOT issue
 * any API calls itself.  All the interactive bits (Copy IP button
 * with clipboard feedback, router navigation) stay client-only since
 * they need browser APIs / React state.
 */
const WelcomeBanner = memo(function WelcomeBanner({ info }: WelcomeBannerProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const ipAddress = useMemo(() => {
    if (!info?.ip_addresses) return null;
    const ips = Array.isArray(info.ip_addresses)
      ? info.ip_addresses
      : [info.ip_addresses];
    return ips[0] ?? null;
  }, [info]);

  const handleCopyIp = useCallback(async () => {
    if (!ipAddress) return;
    try {
      await navigator.clipboard.writeText(ipAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard not available */ }
  }, [ipAddress]);

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left: Welcome text — `h-full` + `flex` so the card stretches
          to match the system-info card on the right.  Without this,
          the banner renders at its natural content height (short) and
          the right column dwarfs it. */}
      <div className="lg:col-span-2">
        <Card className="relative flex h-full flex-col overflow-hidden bg-linear-to-br from-primary-600 to-primary-800 text-white">
          <Card.Body className="flex flex-1 flex-col justify-center">
            {/* Brand mark above the welcome copy.  Forced `theme="dark"`
                because the card has a deep-purple gradient background
                regardless of the user's chosen UI theme — the wordmark
                needs to render in white for contrast. */}
            <div className="mb-4">
              <Logo variant="full" width={210} height={44} theme="dark" />
            </div>
            <span className="mb-3 inline-block rounded-md bg-white/20 px-3 py-1 text-sm font-medium backdrop-blur-sm">
              Admin portal
            </span>
            <h1 className="font-display mb-2 text-3xl font-bold tracking-tight sm:text-4xl">
              Welcome to WSLProxy
            </h1>
            <p className="mb-6 max-w-xl text-base leading-relaxed text-primary-50/95">
              Manage virtual hosts, live routing rules, WAF, and traffic from one
              place — changes take effect without reloading nginx for every rule.
            </p>
            <div className="flex flex-wrap gap-3">
              <button
                onClick={() => router.push("/servers")}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-5 py-2.5 text-sm font-semibold text-primary-700 shadow-lg transition hover:bg-primary-50"
              >
                <Server className="h-4 w-4" />
                Servers
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={() => router.push("/rules")}
                className="inline-flex items-center gap-2 rounded-lg border border-white/30 bg-white/10 px-5 py-2.5 text-sm font-semibold text-white backdrop-blur-sm transition hover:bg-white/20"
              >
                Rules
              </button>
            </div>
          </Card.Body>
          {/* Decorative circle */}
          <div className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-white/5" />
          <div className="pointer-events-none absolute -bottom-8 -right-8 h-24 w-24 rounded-full bg-white/5" />
        </Card>
      </div>

      {/* Right: Instance info */}
      <div>
        <Card className="h-full">
          <Card.Header>
            <h2 className="font-display text-base font-semibold text-slate-800 dark:text-slate-100">
              Instance info
            </h2>
          </Card.Header>
          <Card.Body>
            {info && Object.keys(info).length > 0 ? (
              <div className="space-y-4">
                <InfoRow
                  icon={<Globe className="h-4 w-4 text-blue-500" />}
                  label="Hostname"
                  value={info.hostname ?? "—"}
                />
                <InfoRow
                  icon={<Server className="h-4 w-4 text-purple-500" />}
                  label="IP Address"
                  value={
                    <span className="flex items-center gap-1.5">
                      <code className="font-mono text-sm">{ipAddress ?? "—"}</code>
                      {ipAddress && (
                        <button
                          onClick={handleCopyIp}
                          className="rounded p-0.5 text-slate-400 transition hover:text-slate-600 dark:hover:text-slate-300"
                          title="Copy IP"
                        >
                          {copied ? (
                            <Check className="h-3.5 w-3.5 text-accent-500" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      )}
                    </span>
                  }
                />
                <InfoRow
                  icon={<Cpu className="h-4 w-4 text-emerald-500" />}
                  label="CPU Cores"
                  value={info.cpu?.cores != null ? `${info.cpu.cores} cores` : "—"}
                />
                <InfoRow
                  icon={<MemoryStick className="h-4 w-4 text-amber-500" />}
                  label="Memory Available"
                  value={
                    info.memory
                      ? `${info.memory.available ?? "—"} / ${info.memory.total ?? "—"}`
                      : "—"
                  }
                />
                <InfoRow
                  icon={<HardDrive className="h-4 w-4 text-red-500" />}
                  label="Storage Available"
                  value={
                    info.disk
                      ? `${info.disk.available ?? "—"} / ${info.disk.total ?? "—"}`
                      : "—"
                  }
                />
              </div>
            ) : (
              <p className="text-sm text-slate-600 dark:text-slate-300">Instance info unavailable</p>
            )}
            <button
              // `/health` is the Lua JSON probe endpoint.  Nginx uses
              // `location /health` as a prefix match, so it swallows
              // anything starting with "health" (including
              // `/health-status`).  The admin dashboard lives at
              // `/system-status` to avoid the collision entirely.
              onClick={() => router.push("/system-status" as Route)}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary-600 transition hover:text-primary-700 dark:text-primary-400"
            >
              View Details <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </Card.Body>
        </Card>
      </div>
    </div>
  );
});

const InfoRow = memo(function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5">{icon}</div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-slate-600 dark:text-slate-300">{label}</p>
        <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">
          {value}
        </div>
      </div>
    </div>
  );
});

export default WelcomeBanner;
