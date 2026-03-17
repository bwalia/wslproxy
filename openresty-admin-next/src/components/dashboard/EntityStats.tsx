"use client";

import React, { Suspense } from "react";
import { Server, GitBranch, Users, Layers } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useList } from "@/hooks/useResource";
import Card from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { cn } from "@/lib/utils/cn";

// ── Types ────────────────────────────────────────────────────────────────

interface EntityDef {
  resource: string;
  label: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}

const ENTITIES: EntityDef[] = [
  {
    resource: "servers",
    label: "Servers",
    icon: Server,
    iconBg: "bg-blue-50 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  {
    resource: "rules",
    label: "Rules",
    icon: GitBranch,
    iconBg: "bg-purple-50 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  {
    resource: "users",
    label: "Users",
    icon: Users,
    iconBg: "bg-amber-50 dark:bg-amber-900/30",
    iconColor: "text-amber-600 dark:text-amber-400",
  },
  {
    resource: "profiles",
    label: "Profiles",
    icon: Layers,
    iconBg: "bg-emerald-50 dark:bg-emerald-900/30",
    iconColor: "text-emerald-600 dark:text-emerald-400",
  },
];

// ── Single entity card ───────────────────────────────────────────────────

interface EntityCardInnerProps {
  entity: EntityDef;
}

const EntityCardInner = React.memo(function EntityCardInner({
  entity,
}: EntityCardInnerProps) {
  const { total, isLoading } = useList(entity.resource, {
    pagination: { page: 1, perPage: 1 },
  });

  const Icon = entity.icon;

  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div
          className={cn(
            "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
            entity.iconBg,
            entity.iconColor,
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
        <div>
          {isLoading ? (
            <Skeleton className="mb-1 h-7 w-10" />
          ) : (
            <p className="text-2xl font-bold text-slate-900 dark:text-slate-100">
              {total}
            </p>
          )}
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {entity.label}
          </p>
        </div>
      </div>
    </Card>
  );
});

// ── Skeleton fallback ────────────────────────────────────────────────────

function EntityCardSkeleton() {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <Skeleton variant="rectangular" className="h-10 w-10 rounded-lg" />
        <div>
          <Skeleton className="mb-1 h-7 w-10" />
          <Skeleton className="h-4 w-16" />
        </div>
      </div>
    </Card>
  );
}

// ── Main component ───────────────────────────────────────────────────────

export default function EntityStats() {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
      {ENTITIES.map((entity) => (
        <Suspense key={entity.resource} fallback={<EntityCardSkeleton />}>
          <EntityCardInner entity={entity} />
        </Suspense>
      ))}
    </div>
  );
}
