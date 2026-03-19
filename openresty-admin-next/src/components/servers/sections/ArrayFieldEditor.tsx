"use client";

import React, { useCallback } from "react";
import { Plus, Trash2 } from "lucide-react";
import Button from "@/components/ui/Button";
import Input from "@/components/ui/Input";
import { cn } from "@/lib/utils/cn";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface ArrayFieldColumn {
  key: string;
  label: string;
  placeholder?: string;
  type?: "text" | "textarea";
}

export interface ArrayFieldEditorProps {
  label: string;
  columns: ArrayFieldColumn[];
  /** Array of objects keyed by column.key */
  value: Record<string, string>[];
  onChange: (next: Record<string, string>[]) => void;
  addLabel?: string;
  className?: string;
  emptyMessage?: string;
}

/* ── Component ─────────────────────────────────────────────────────────── */

const ArrayFieldEditor: React.FC<ArrayFieldEditorProps> = ({
  label,
  columns,
  value,
  onChange,
  addLabel = "Add Row",
  className,
  emptyMessage = "No items added yet.",
}) => {
  const handleAdd = useCallback(() => {
    const blank: Record<string, string> = {};
    columns.forEach((c) => {
      blank[c.key] = "";
    });
    onChange([...value, blank]);
  }, [columns, value, onChange]);

  const handleRemove = useCallback(
    (index: number) => {
      onChange(value.filter((_, i) => i !== index));
    },
    [value, onChange],
  );

  const handleCellChange = useCallback(
    (index: number, key: string, cellValue: string) => {
      const next = value.map((row, i) =>
        i === index ? { ...row, [key]: cellValue } : row,
      );
      onChange(next);
    },
    [value, onChange],
  );

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
          {label}
        </span>
        <Button variant="ghost" size="sm" onClick={handleAdd} icon={<Plus className="h-3.5 w-3.5" />}>
          {addLabel}
        </Button>
      </div>

      {value.length === 0 && (
        <p className="text-sm text-slate-400 dark:text-slate-500 italic">
          {emptyMessage}
        </p>
      )}

      {value.map((row, idx) => (
        <div
          key={idx}
          className="flex items-start gap-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-3"
        >
          <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-2">
            {columns.map((col) =>
              col.type === "textarea" ? (
                <div key={col.key} className="col-span-full space-y-1.5">
                  <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
                    {col.label}
                  </label>
                  <textarea
                    className={cn(
                      "block w-full rounded-lg border px-3 py-2 text-sm",
                      "bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100",
                      "border-slate-300 dark:border-slate-600",
                      "focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500",
                      "resize-y",
                    )}
                    rows={3}
                    placeholder={col.placeholder}
                    value={row[col.key] ?? ""}
                    onChange={(e) => handleCellChange(idx, col.key, e.target.value)}
                  />
                </div>
              ) : (
                <Input
                  key={col.key}
                  label={col.label}
                  placeholder={col.placeholder}
                  value={row[col.key] ?? ""}
                  onChange={(e) => handleCellChange(idx, col.key, e.target.value)}
                />
              ),
            )}
          </div>
          <button
            type="button"
            onClick={() => handleRemove(idx)}
            className="mt-7 shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
            aria-label="Remove row"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      ))}
    </div>
  );
};

ArrayFieldEditor.displayName = "ArrayFieldEditor";

export default React.memo(ArrayFieldEditor);
