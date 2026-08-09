"use client";

import { useMemo } from "react";
import Link from "next/link";
import type { Route } from "next";
import { Globe2, AlertCircle, ExternalLink } from "lucide-react";
import Card from "@/components/ui/Card";
import Badge from "@/components/ui/Badge";
import { cn } from "@/lib/utils/cn";
import type { Pop } from "@/types";

interface PopMultiSelectProps {
  /** All available POPs, fetched by the parent via `useList`.
   *  Display ordering: active first, then by region/id. */
  pops: Pop[];
  /** Currently selected pop ids. */
  value: string[];
  onChange: (next: string[]) => void;
  /** Show a small inline loading hint when the parent is fetching. */
  isLoading?: boolean;
  /** Disable the whole control (e.g. while the parent form is
   *  submitting). */
  disabled?: boolean;
}

/**
 * Multi-select POP picker for the server form.
 *
 * Renders a checkbox grid grouped by region.  Each row shows the
 * POP's display name, public IPv4, and a status badge — operators
 * need to see those at a glance when deciding whether to attach a
 * POP (you don't want to assign a server to a POP that's `down`).
 *
 * Why a custom component rather than a generic multi-select widget:
 *  - The decision is domain-specific: status, region, IP matter.
 *  - A bare `TagInput` of pop ids hides exactly the data the
 *    operator needs to make a good choice.
 *  - Grouping by region scales naturally as the fleet grows from 2
 *    POPs to 20.
 */
export default function PopMultiSelect({
  pops,
  value,
  onChange,
  isLoading,
  disabled,
}: PopMultiSelectProps) {
  // Memoise the grouping + sorting so we don't rebuild on every
  // keystroke in the parent form.  Group by region, with an
  // "Unassigned" bucket for POPs that have no region set; sort each
  // bucket alphabetically by id; sort active POPs above
  // draining/down/maintenance so they're the natural pick.
  const grouped = useMemo(() => {
    const byRegion = new Map<string, Pop[]>();
    for (const p of pops) {
      const key = p.region || "Unassigned";
      if (!byRegion.has(key)) byRegion.set(key, []);
      byRegion.get(key)!.push(p);
    }
    const statusOrder: Record<NonNullable<Pop["status"]>, number> = {
      active: 0,
      draining: 1,
      maintenance: 2,
      down: 3,
    };
    for (const arr of byRegion.values()) {
      arr.sort((a, b) => {
        const sa = statusOrder[a.status ?? "active"];
        const sb = statusOrder[b.status ?? "active"];
        if (sa !== sb) return sa - sb;
        return a.id.localeCompare(b.id);
      });
    }
    return Array.from(byRegion.entries()).sort(([a], [b]) =>
      a.localeCompare(b),
    );
  }, [pops]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const toggle = (popId: string) => {
    if (disabled) return;
    const next = selectedSet.has(popId)
      ? value.filter((id) => id !== popId)
      : [...value, popId];
    onChange(next);
  };

  // ── Empty / loading states ─────────────────────────────────────────
  if (isLoading) {
    return (
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              POPs (Points of Presence)
            </h3>
          </div>
        </Card.Header>
        <Card.Body>
          <p className="text-sm text-slate-500">Loading POPs…</p>
        </Card.Body>
      </Card>
    );
  }

  if (pops.length === 0) {
    return (
      <Card>
        <Card.Header>
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              POPs (Points of Presence)
            </h3>
          </div>
        </Card.Header>
        <Card.Body>
          <div className="flex items-start gap-3 rounded-md bg-amber-50 p-3 dark:bg-amber-900/20">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <div className="space-y-2 text-sm">
              <p className="text-amber-900 dark:text-amber-200">
                No POPs are defined yet.  This server will fall back to the
                profile default when DNS is provisioned — fine for now, but
                you&apos;ll want to define your edge locations explicitly
                before enabling multi-POP routing.
              </p>
              <Link
                href={"/pops/create" as Route}
                className="inline-flex items-center gap-1 text-sm font-medium text-primary-600 hover:text-primary-700 dark:text-primary-400"
              >
                Create your first POP{" "}
                <ExternalLink className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </div>
        </Card.Body>
      </Card>
    );
  }

  return (
    <Card>
      <Card.Header>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Globe2 className="h-5 w-5 text-slate-500" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">
              POPs (Points of Presence)
            </h3>
            {value.length > 0 && (
              <Badge variant="info" size="sm">
                {value.length} selected
              </Badge>
            )}
          </div>
          <Link
            href={"/pops" as Route}
            className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-primary-600 dark:hover:text-primary-400"
          >
            Manage POPs <ExternalLink className="h-3 w-3" aria-hidden="true" />
          </Link>
        </div>
      </Card.Header>
      <Card.Body>
        <p className="mb-4 text-sm text-slate-600 dark:text-slate-400">
          Pick which POPs should serve this domain.  The DNS provisioner uses
          this list to decide which A records to publish at Cloudflare for{" "}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs dark:bg-slate-800">
            {/* server_name displayed by caller via context — leaving placeholder generic */}
            the server&apos;s domain
          </code>
          .  Empty = fall back to profile defaults.
        </p>

        <div className="space-y-4">
          {grouped.map(([region, regionPops]) => (
            <div key={region}>
              <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-600 dark:text-slate-300">
                {region}
                <span className="text-slate-400">·</span>
                <span className="font-normal normal-case">
                  {regionPops.length} POP{regionPops.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {regionPops.map((p) => {
                  const selected = selectedSet.has(p.id);
                  const status = (p.status ?? "active") as NonNullable<
                    Pop["status"]
                  >;
                  // Down POPs are technically pickable — operators might
                  // assign during planned recovery — but we visually
                  // dim them so the eye flags the unusual choice.
                  const isInactive = status === "down";
                  return (
                    <label
                      key={p.id}
                      className={cn(
                        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
                        selected
                          ? // Selected: tinted background with primary border in both modes
                            "border-primary-500 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20"
                          : // Unselected: light mode lifts to a soft grey on hover; dark
                            // mode lifts to a slightly brighter slate.  Without
                            // `dark:hover:bg-slate-700/60`, the `hover:bg-slate-50` from the
                            // light variant leaks into dark mode and renders near-white.
                            "border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:border-slate-600 dark:hover:bg-slate-700/60",
                        isInactive && "opacity-60",
                        disabled && "cursor-not-allowed",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => toggle(p.id)}
                        disabled={disabled}
                        className="mt-0.5 h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-2 focus:ring-primary-500 dark:border-slate-600 dark:bg-slate-700"
                        aria-label={`Select POP ${p.display_name}`}
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {p.id}
                          </span>
                          <Badge
                            variant={
                              status === "active"
                                ? "success"
                                : status === "draining"
                                  ? "warning"
                                  : status === "down"
                                    ? "danger"
                                    : "info"
                            }
                            size="sm"
                          >
                            {status}
                          </Badge>
                          {p.capacity_weight !== undefined &&
                            p.capacity_weight !== null &&
                            p.capacity_weight !== 1 && (
                              <Badge variant="default" size="sm">
                                weight {Math.round(p.capacity_weight * 100)}%
                              </Badge>
                            )}
                        </div>
                        <div className="mt-0.5 truncate text-xs text-slate-600 dark:text-slate-400">
                          {p.display_name}
                        </div>
                        <div className="mt-0.5 truncate font-mono text-xs text-slate-500 dark:text-slate-500">
                          {p.public_ipv4}
                          {p.public_ipv6 && (
                            <span className="ml-2 text-slate-400">
                              · v6 {p.public_ipv6}
                            </span>
                          )}
                          {p.city && (
                            <span className="ml-2 text-slate-400">
                              · {p.city}
                            </span>
                          )}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {value.length === 0 && (
          <p className="mt-4 rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/50 dark:text-slate-400">
            No POPs selected — this server will use the profile default for DNS
            routing.  Tick at least one POP above to control DNS explicitly.
          </p>
        )}
      </Card.Body>
    </Card>
  );
}
