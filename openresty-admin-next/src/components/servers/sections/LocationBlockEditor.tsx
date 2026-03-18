"use client";

import React, { useCallback, useMemo } from "react";
import { Plus, Trash2, MapPin } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { cn } from "@/lib/utils/cn";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface LocationEntry {
  location_path: string;
  location_opts: Record<string, string>;
  location_vals: Record<string, string>;
}

export interface LocationBlockEditorProps {
  value: LocationEntry[];
  onChange: (next: LocationEntry[]) => void;
  className?: string;
}

/* ── Constants ─────────────────────────────────────────────────────────── */

const LOCATION_OPT_CHOICES = [
  { value: "proxy_pass", label: "proxy_pass" },
  { value: "proxy_set_header", label: "proxy_set_header" },
  { value: "allow", label: "allow" },
  { value: "deny", label: "deny" },
  { value: "root", label: "root" },
  { value: "index", label: "index" },
  { value: "try_files", label: "try_files" },
  { value: "rewrite", label: "rewrite" },
  { value: "fastcgi_pass", label: "fastcgi_pass" },
  { value: "expires", label: "expires" },
  { value: "auth_basic", label: "auth_basic" },
] as const;

/* ── Component ─────────────────────────────────────────────────────────── */

const LocationBlockEditor: React.FC<LocationBlockEditorProps> = ({
  value,
  onChange,
  className,
}) => {
  const handleAddLocation = useCallback(() => {
    onChange([
      ...value,
      { location_path: "/", location_opts: {}, location_vals: {} },
    ]);
  }, [value, onChange]);

  const handleRemoveLocation = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange],
  );

  const handlePathChange = useCallback(
    (index: number, path: string) => {
      const next = value.map((loc, i) =>
        i === index ? { ...loc, location_path: path } : loc,
      );
      onChange(next);
    },
    [value, onChange],
  );

  const handleAddDirective = useCallback(
    (locIndex: number) => {
      const loc = value[locIndex];
      const nextKey = String(Object.keys(loc.location_opts).length);
      const next = value.map((l, i) =>
        i === locIndex
          ? {
              ...l,
              location_opts: { ...l.location_opts, [nextKey]: "" },
              location_vals: { ...l.location_vals },
            }
          : l,
      );
      onChange(next);
    },
    [value, onChange],
  );

  const handleRemoveDirective = useCallback(
    (locIndex: number, directiveKey: string) => {
      const loc = value[locIndex];
      const newOpts = { ...loc.location_opts };
      const newVals = { ...loc.location_vals };
      const directive = newOpts[directiveKey];
      delete newOpts[directiveKey];
      if (directive) delete newVals[directive];
      const next = value.map((l, i) =>
        i === locIndex ? { ...l, location_opts: newOpts, location_vals: newVals } : l,
      );
      onChange(next);
    },
    [value, onChange],
  );

  const handleOptChange = useCallback(
    (locIndex: number, directiveKey: string, newOpt: string) => {
      const loc = value[locIndex];
      const oldOpt = loc.location_opts[directiveKey];
      const newOpts = { ...loc.location_opts, [directiveKey]: newOpt };
      const newVals = { ...loc.location_vals };
      if (oldOpt && oldOpt !== newOpt) {
        newVals[newOpt] = newVals[oldOpt] ?? "";
        delete newVals[oldOpt];
      }
      if (!newVals[newOpt]) newVals[newOpt] = "";
      const next = value.map((l, i) =>
        i === locIndex ? { ...l, location_opts: newOpts, location_vals: newVals } : l,
      );
      onChange(next);
    },
    [value, onChange],
  );

  const handleValChange = useCallback(
    (locIndex: number, directive: string, val: string) => {
      const newVals = { ...value[locIndex].location_vals, [directive]: val };
      const next = value.map((l, i) =>
        i === locIndex ? { ...l, location_vals: newVals } : l,
      );
      onChange(next);
    },
    [value, onChange],
  );

  const optionsList = useMemo(() => [...LOCATION_OPT_CHOICES], []);

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          Location Blocks
        </span>
        <Button
          variant="ghost"
          size="sm"
          onClick={handleAddLocation}
          icon={<Plus className="h-3.5 w-3.5" />}
        >
          Add Location
        </Button>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">
          No location blocks configured.
        </p>
      )}

      {value.map((loc, locIdx) => {
        const directiveKeys = Object.keys(loc.location_opts);
        return (
          <div
            key={locIdx}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3"
          >
            <div className="flex items-start gap-2">
              <MapPin className="mt-2 h-4 w-4 shrink-0 text-slate-400" />
              <div className="flex-1">
                <Input
                  label="Location Path"
                  placeholder="/"
                  value={loc.location_path}
                  onChange={(e) => handlePathChange(locIdx, e.target.value)}
                />
              </div>
              <button
                type="button"
                onClick={() => handleRemoveLocation(locIdx)}
                className="mt-7 shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                aria-label="Remove location block"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            {/* Directives */}
            <div className="space-y-2 pl-6">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                  Directives
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleAddDirective(locIdx)}
                  icon={<Plus className="h-3 w-3" />}
                >
                  Add Directive
                </Button>
              </div>

              {directiveKeys.length === 0 && (
                <p className="text-xs text-slate-400 italic">
                  No directives. Add one above.
                </p>
              )}

              {directiveKeys.map((dk) => {
                const directive = loc.location_opts[dk];
                return (
                  <div key={dk} className="flex items-start gap-2">
                    <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2">
                      <Select
                        label="Directive"
                        value={directive}
                        onChange={(e) => handleOptChange(locIdx, dk, e.target.value)}
                        options={optionsList}
                        placeholder="Select directive"
                      />
                      <Input
                        label="Value"
                        placeholder="e.g. http://127.0.0.1:8080"
                        value={directive ? (loc.location_vals[directive] ?? "") : ""}
                        onChange={(e) =>
                          directive && handleValChange(locIdx, directive, e.target.value)
                        }
                        disabled={!directive}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveDirective(locIdx, dk)}
                      className="mt-7 shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                      aria-label="Remove directive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
};

LocationBlockEditor.displayName = "LocationBlockEditor";

export default React.memo(LocationBlockEditor);
