"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
} from "react";
import { HardDrive, Database, Cylinder, Check } from "lucide-react";
import { useDataProvider } from "@/hooks/useResource";
import { useSettings } from "@/contexts/SettingsContext";
import { useNotification } from "@/contexts/NotificationContext";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Card, { CardHeader, CardBody, CardFooter } from "@/components/ui/Card";
import { cn } from "@/lib/utils/cn";
import type { AppSettings } from "@/types";

/**
 * Storage-type selector for the Next.js dashboard.
 *
 * `variant="chip"` — AppBar control that opens a dialog.
 * `variant="panel"` — Settings page card with PostgreSQL destination fields.
 */

type StorageType = "redis" | "disk" | "pgsql";

interface PgsqlDestination {
  pg_host: string;
  pg_port: string;
  pg_database: string;
  pg_user: string;
  pg_password: string;
}

const OPTIONS: {
  value: StorageType;
  label: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}[] = [
  {
    value: "disk",
    label: "Disk",
    description: "Plain JSON files on the host — simpler, single-node",
    icon: HardDrive,
  },
  {
    value: "redis",
    label: "Redis",
    description: "Centralized, low-latency store — dual-writes JSON to disk",
    icon: Database,
  },
  {
    value: "pgsql",
    label: "PostgreSQL",
    description: "Typed tables + JSON document — dual-writes JSON to disk",
    icon: Cylinder,
  },
];

function pgsqlFromSettings(settings: AppSettings | null): PgsqlDestination {
  const raw = (settings?.pgsql ?? {}) as Record<string, unknown>;
  return {
    pg_host: String(raw.pg_host ?? raw.host ?? ""),
    pg_port: String(raw.pg_port ?? raw.port ?? "5432"),
    pg_database: String(raw.pg_database ?? raw.database ?? "wslproxy"),
    pg_user: String(raw.pg_user ?? raw.user ?? "wslproxy"),
    pg_password: "",
  };
}

function StorageIcon({
  value,
  className,
}: {
  value: StorageType;
  className?: string;
}) {
  if (value === "redis") return <Database className={className} aria-hidden="true" />;
  if (value === "pgsql") return <Cylinder className={className} aria-hidden="true" />;
  return <HardDrive className={className} aria-hidden="true" />;
}

function StorageOptions({
  pending,
  saving,
  onSelect,
}: {
  pending: StorageType;
  saving: boolean;
  onSelect: (next: StorageType) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2">
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const selected = opt.value === pending;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onSelect(opt.value)}
            disabled={saving}
            aria-pressed={selected}
            className={cn(
              "flex items-start gap-3 rounded-lg border p-3 text-left transition-colors",
              "disabled:cursor-wait disabled:opacity-60",
              selected
                ? "border-primary-500 bg-primary-50/40 dark:border-primary-400 dark:bg-primary-900/20"
                : "border-slate-200 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:bg-slate-800",
            )}
          >
            <Icon
              className={cn(
                "h-5 w-5 shrink-0",
                selected
                  ? "text-primary-600 dark:text-primary-400"
                  : "text-slate-400",
              )}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                  {opt.label}
                </span>
                {selected && (
                  <Check
                    className="h-4 w-4 text-primary-600 dark:text-primary-400"
                    aria-hidden="true"
                  />
                )}
              </div>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                {opt.description}
              </p>
            </div>
          </button>
        );
      })}
    </div>
  );
}

function PgsqlDestinationFields({
  pgsql,
  errors,
  onChange,
}: {
  pgsql: PgsqlDestination;
  errors: Partial<Record<keyof PgsqlDestination, string>>;
  onChange: (next: PgsqlDestination) => void;
}) {
  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
      <p className="text-sm font-medium text-slate-800 dark:text-slate-100">
        PostgreSQL destination
      </p>
      <p className="text-xs text-slate-500 dark:text-slate-400">
        Leave password blank to keep the value already stored in settings.json.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Input
          label="Host"
          autoComplete="off"
          value={pgsql.pg_host}
          error={errors.pg_host}
          onChange={(e) => onChange({ ...pgsql, pg_host: e.target.value })}
        />
        <Input
          label="Port"
          inputMode="numeric"
          value={pgsql.pg_port}
          error={errors.pg_port}
          onChange={(e) => onChange({ ...pgsql, pg_port: e.target.value })}
        />
        <Input
          label="Database"
          value={pgsql.pg_database}
          error={errors.pg_database}
          onChange={(e) => onChange({ ...pgsql, pg_database: e.target.value })}
        />
        <Input
          label="User"
          autoComplete="off"
          value={pgsql.pg_user}
          error={errors.pg_user}
          onChange={(e) => onChange({ ...pgsql, pg_user: e.target.value })}
        />
        <div className="sm:col-span-2">
          <Input
            label="Password"
            type="password"
            autoComplete="new-password"
            value={pgsql.pg_password}
            hint="Required on first switch if settings.json has no password."
            onChange={(e) =>
              onChange({ ...pgsql, pg_password: e.target.value })
            }
          />
        </div>
      </div>
    </div>
  );
}

function useStorageSwitch() {
  const dataProvider = useDataProvider();
  const { settings, storageType, loadSettings } = useSettings();
  const { notify } = useNotification();
  const [saving, setSaving] = useState(false);
  const current = (storageType as StorageType | undefined) ?? "disk";
  const [pending, setPending] = useState<StorageType>(current);
  const [pgsql, setPgsql] = useState<PgsqlDestination>(() =>
    pgsqlFromSettings(settings),
  );

  useEffect(() => {
    setPending(current);
    setPgsql(pgsqlFromSettings(settings));
  }, [current, settings]);

  const pgsqlErrors = useMemo(() => {
    if (pending !== "pgsql") return {};
    const errors: Partial<Record<keyof PgsqlDestination, string>> = {};
    if (!pgsql.pg_host.trim()) errors.pg_host = "Host is required";
    if (!pgsql.pg_database.trim()) errors.pg_database = "Database is required";
    if (!pgsql.pg_user.trim()) errors.pg_user = "User is required";
    const port = Number(pgsql.pg_port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      errors.pg_port = "Port must be 1–65535";
    }
    return errors;
  }, [pending, pgsql]);

  const pgsqlValid = Object.keys(pgsqlErrors).length === 0;

  const origPgsql = pgsqlFromSettings(settings);
  const destDirty =
    pending === "pgsql" &&
    (pgsql.pg_password !== "" ||
      pgsql.pg_host.trim() !== origPgsql.pg_host.trim() ||
      String(pgsql.pg_port) !== String(origPgsql.pg_port) ||
      pgsql.pg_database.trim() !== origPgsql.pg_database.trim() ||
      pgsql.pg_user.trim() !== origPgsql.pg_user.trim());
  const dirty = pending !== current || destDirty;

  const apply = useCallback(
    async (next: StorageType) => {
      if (next !== "pgsql" && next === current) return true;
      if (next === "pgsql" && !pgsqlValid) return false;
      setSaving(true);
      try {
        const body: Record<string, unknown> = { storage: next };
        if (next === "pgsql") {
          body.pgsql = {
            pg_host: pgsql.pg_host.trim(),
            pg_port: Number(pgsql.pg_port) || 5432,
            pg_database: pgsql.pg_database.trim(),
            pg_user: pgsql.pg_user.trim(),
            pg_password: pgsql.pg_password,
          };
        }
        await dataProvider.saveStorageFlag("storage/management", body);
        notify(`Storage switched to ${next === "pgsql" ? "PostgreSQL" : next}`, {
          type: "success",
        });
        await loadSettings();
        window.location.reload();
        return true;
      } catch (err) {
        notify(
          "Failed to switch storage: " +
            ((err as Error).message || String(err)),
          { type: "error" },
        );
        return false;
      } finally {
        setSaving(false);
      }
    },
    [current, dataProvider, loadSettings, notify, pgsql, pgsqlValid],
  );

  return {
    current,
    pending,
    setPending,
    pgsql,
    setPgsql,
    pgsqlErrors,
    pgsqlValid,
    dirty,
    saving,
    apply,
  };
}

export default function StorageSelector() {
  const state = useStorageSwitch();
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    state.setPending(state.current);
    setOpen(true);
  }, [state]);

  const handleSelect = useCallback(
    (next: StorageType) => {
      state.setPending(next);
      if (next !== "pgsql") {
        void state.apply(next).then((ok) => {
          if (ok) setOpen(false);
        });
      }
    },
    [state],
  );

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Storage: ${state.current}. Click to change.`}
        title={`Storage: ${state.current}`}
        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-slate-700"
      >
        <StorageIcon
          value={state.current}
          className="h-3.5 w-3.5 text-slate-400"
        />
        <span className="font-mono uppercase tracking-wide">
          {state.current === "pgsql" ? "pgsql" : state.current}
        </span>
      </button>

      <Dialog
        open={open}
        onClose={() => !state.saving && setOpen(false)}
        title="Select Storage Type"
        footer={
          state.pending === "pgsql" ? (
            <div className="flex w-full justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={state.saving}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={() => void state.apply("pgsql")}
                disabled={state.saving || !state.pgsqlValid}
              >
                {state.saving ? "Connecting…" : "Switch to PostgreSQL"}
              </Button>
            </div>
          ) : (
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
          )
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Choose how the API persists servers, rules, and other resources.
            Redis and PostgreSQL still write JSON to disk. The page will reload
            after switching.
          </p>
          <StorageOptions
            pending={state.pending}
            saving={state.saving}
            onSelect={handleSelect}
          />
          {state.pending === "pgsql" && (
            <PgsqlDestinationFields
              pgsql={state.pgsql}
              errors={state.pgsqlErrors}
              onChange={state.setPgsql}
            />
          )}
        </div>
      </Dialog>
    </>
  );
}

/** Settings page card — Disk / Redis / PostgreSQL plus destination fields. */
export function StorageSettingsCard() {
  const state = useStorageSwitch();

  const handleSelect = useCallback(
    (next: StorageType) => {
      state.setPending(next);
    },
    [state],
  );

  return (
    <Card className="mb-4">
      <CardHeader>
        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Storage type
          </h2>
          <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">
            Where the admin API writes servers, rules, and other resources.
            Redis and PostgreSQL still dual-write JSON to disk.
          </p>
        </div>
      </CardHeader>
      <CardBody className="space-y-3">
        <StorageOptions
          pending={state.pending}
          saving={state.saving}
          onSelect={handleSelect}
        />
        {state.pending === "pgsql" && (
          <PgsqlDestinationFields
            pgsql={state.pgsql}
            errors={state.pgsqlErrors}
            onChange={state.setPgsql}
          />
        )}
      </CardBody>
      <CardFooter className="flex justify-end">
        <Button
          type="button"
          onClick={() => void state.apply(state.pending)}
          disabled={
            state.saving ||
            !state.dirty ||
            (state.pending === "pgsql" && !state.pgsqlValid)
          }
        >
          {state.saving
            ? "Connecting…"
            : state.pending === "pgsql"
              ? "Switch to PostgreSQL"
              : `Switch to ${state.pending === "disk" ? "Disk" : "Redis"}`}
        </Button>
      </CardFooter>
    </Card>
  );
}
