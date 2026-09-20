"use client";

import { useMemo, useState, useEffect } from "react";
import { Lock } from "lucide-react";
import Input from "@/components/ui/Input";
import Select from "@/components/ui/Select";
import { useList } from "@/hooks/useResource";
import { cn } from "@/lib/utils/cn";

/**
 * A field that holds either an inline plaintext secret value or a
 * `secret://<record_id>#<key>` reference to a value stored in the
 * Secrets resource.  The two modes are toggled by a segmented control
 * at the top; the rule JSON stores whichever string the user picks.
 *
 * The backend (see api/secret_resolver.lua) swaps the ref for the
 * plaintext value at request time, so downstream code paths (rule_auth,
 * S3 signer, JWT verify) see plaintext exactly as they did before.
 * The value that lives on disk / in git is a `secret://…` string —
 * no plaintext leaks to the backup.
 */

const REF_PREFIX = "secret://";
const isRef = (v: string) => v.startsWith(REF_PREFIX);

interface SecretRecord {
  id: string;
  secret_name?: string;
  secrets?: Array<{ key: string }>;
}

interface Props {
  label: string;
  hint?: string;
  type?: string;
  value: string;
  onChange: (v: string) => void;
  /** disabled inputs — passthrough */
  disabled?: boolean;
}

export default function SecretRefField({
  label,
  hint,
  type = "text",
  value,
  onChange,
  disabled,
}: Props) {
  // Mode is derived from the current value on first render, then held in
  // local state so the user can toggle even when the value is empty.
  const [mode, setMode] = useState<"inline" | "ref">(
    isRef(value) ? "ref" : "inline",
  );

  // If the value shape changes from the outside (e.g. clone, reset), the
  // mode should follow.  Keep the invariant: value looks like a ref → mode
  // is ref.  User-initiated toggles are handled by handleToggle below.
  useEffect(() => {
    if (isRef(value) && mode !== "ref") setMode("ref");
    // Do NOT auto-switch inline→ref direction on empty value: the user
    // may have just toggled to "Use secret" and not yet picked one.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const { data: secrets = [], isLoading } = useList<SecretRecord>(
    mode === "ref" ? "secrets" : null,
  );

  const options = useMemo(() => {
    const opts: Array<{ value: string; label: string }> = [];
    for (const rec of secrets) {
      if (!rec.id || !Array.isArray(rec.secrets)) continue;
      const name = rec.secret_name || rec.id;
      for (const s of rec.secrets) {
        if (!s.key) continue;
        opts.push({
          value: `${REF_PREFIX}${rec.id}#${s.key}`,
          label: `${name} / ${s.key}`,
        });
      }
    }
    // Preserve the current ref even when the referenced secret has been
    // deleted, so the user sees the broken pointer instead of silently
    // reverting to blank.
    if (isRef(value) && !opts.some((o) => o.value === value)) {
      opts.push({ value, label: `${value} (missing)` });
    }
    opts.sort((a, b) => a.label.localeCompare(b.label));
    return opts;
  }, [secrets, value]);

  const handleToggle = (next: "inline" | "ref") => {
    if (next === mode) return;
    setMode(next);
    // Switching modes always clears the field.  Cross-mode carry-over
    // (an inline value that begins with `secret://` or a picked ref
    // rendered as inline text) is confusing and offers no real value.
    onChange("");
  };

  return (
    <div className="space-y-1.5">
      {label && (
        <div className="flex items-center justify-between gap-2">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {label}
          </label>
          <div
            role="tablist"
            aria-label={`${label} source`}
            className="inline-flex overflow-hidden rounded-md border border-slate-300 text-xs dark:border-slate-600"
          >
            <ToggleButton
              active={mode === "inline"}
              onClick={() => handleToggle("inline")}
            >
              Enter value
            </ToggleButton>
            <ToggleButton
              active={mode === "ref"}
              onClick={() => handleToggle("ref")}
              icon={<Lock className="h-3 w-3" />}
            >
              Use secret
            </ToggleButton>
          </div>
        </div>
      )}

      {mode === "inline" ? (
        <Input
          type={type}
          hint={hint}
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <Select
          hint={
            isLoading
              ? "Loading secrets…"
              : options.length === 0
                ? "No secrets available for this profile — create one in Secrets."
                : hint
          }
          value={value}
          disabled={disabled || isLoading}
          placeholder={
            options.length === 0 ? "No secrets to pick" : "Pick a secret…"
          }
          options={options}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function ToggleButton({
  active,
  onClick,
  icon,
  children,
}: {
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={cn(
        "flex items-center gap-1 px-2 py-1 transition-colors",
        active
          ? "bg-primary-600 text-white"
          : "bg-white text-slate-600 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700",
      )}
    >
      {icon}
      {children}
    </button>
  );
}
