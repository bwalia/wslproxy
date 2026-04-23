"use client";

import React, { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2, ListFilter } from "lucide-react";
import Card from "@/components/ui/Card";
import Select from "@/components/ui/Select";
import Combobox from "@/components/ui/Combobox";
import Button from "@/components/ui/Button";
import type { ServerFormState } from "./types";

/**
 * Server → Rules tab.
 *
 * Layout mirrors the legacy react-admin form
 * (openresty-admin/src/Servers/Form.jsx:996-1060):
 *
 *  - "Select Rules": a single searchable rule picker.  This is the
 *    primary rule assigned to the server (empty = none).
 *
 *  - "Match Conditions": only rendered once a primary rule is picked.
 *    Each row = `{condition: AND/OR/N/A, statement: rule_id}`.  The
 *    Lua gateway (api/rule_loader.lua:parse_match_cases) reads
 *    `statement` as a single rule_id and folds it into the rule
 *    pipeline with the chosen boolean condition.  Rules already in
 *    use (either as the primary rule or in an earlier match case)
 *    are excluded from each row's picker so the same rule can't be
 *    combined with itself.
 */

const CONDITION_OPTIONS = [
  { value: "none", label: "N/A" },
  { value: "or", label: "OR" },
  { value: "and", label: "AND" },
];

export interface ServerRulesTabProps {
  form: ServerFormState;
  setForm: Dispatch<SetStateAction<ServerFormState>>;
  ruleOptions: { value: string; label: string }[];
}

const ServerRulesTab: React.FC<ServerRulesTabProps> = ({
  form,
  setForm,
  ruleOptions,
}) => {
  /* ── Primary rule picker ─────────────────────────────────────────── */

  const handleRuleChange = useCallback(
    (next: string) => {
      setForm((prev) => ({ ...prev, rules: next }));
    },
    [setForm],
  );

  /* ── Match cases ─────────────────────────────────────────────────── */

  const handleAddMatchCase = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      match_cases: [...prev.match_cases, { condition: "none", statement: "" }],
    }));
  }, [setForm]);

  const handleRemoveMatchCase = useCallback(
    (index: number) => {
      setForm((prev) => ({
        ...prev,
        match_cases: prev.match_cases.filter((_, i) => i !== index),
      }));
    },
    [setForm],
  );

  const handleMatchCaseChange = useCallback(
    (index: number, patch: Partial<ServerFormState["match_cases"][number]>) => {
      setForm((prev) => ({
        ...prev,
        match_cases: prev.match_cases.map((mc, i) =>
          i === index ? { ...mc, ...patch } : mc,
        ),
      }));
    },
    [setForm],
  );

  /**
   * Per-row available options for match_case rule pickers.
   *
   *   - Exclude the primary rule (it's already "in the pipeline").
   *   - Exclude rules selected in *other* match cases — keeps the user
   *     from combining the same rule with itself.  Don't exclude THIS
   *     row's own current pick, so the label stays visible in the
   *     trigger (Combobox would otherwise render as empty because the
   *     selected value isn't in the options array).
   */
  const matchCaseOptionsFor = useCallback(
    (rowIndex: number) => {
      const taken = new Set<string>();
      if (form.rules) taken.add(form.rules);
      form.match_cases.forEach((mc, i) => {
        if (i !== rowIndex && mc.statement) taken.add(mc.statement);
      });
      return ruleOptions.filter((o) => !taken.has(o.value));
    },
    [form.rules, form.match_cases, ruleOptions],
  );

  const showMatchCases = Boolean(form.rules) && ruleOptions.length > 1;

  return (
    <div className="space-y-6">
      {/* ── Assigned Rule ────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <div>
            <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
              Server Rules
            </h2>
            <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
              Select and configure rules for this server
            </p>
          </div>
        </Card.Header>
        <Card.Body>
          {ruleOptions.length === 0 ? (
            <p className="py-4 text-center text-sm italic text-slate-400 dark:text-slate-500">
              No rules available. Create rules first to assign them to this
              server.
            </p>
          ) : (
            <Combobox
              label="Select Rules"
              placeholder="Pick a rule…"
              searchPlaceholder="Search rules…"
              value={form.rules}
              options={ruleOptions}
              onChange={handleRuleChange}
            />
          )}
        </Card.Body>
      </Card>

      {/* ── Match Conditions ─────────────────────────────────────────── */}
      {showMatchCases && (
        <Card>
          <Card.Header>
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
                Match Conditions
              </h2>
              <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">
                Combine additional rules with the assigned rule using AND / OR.
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleAddMatchCase}
              icon={<Plus className="h-3.5 w-3.5" />}
            >
              Add Condition
            </Button>
          </Card.Header>
          <Card.Body>
            {form.match_cases.length === 0 ? (
              <p className="py-4 text-center text-sm italic text-slate-400 dark:text-slate-500">
                No match conditions configured.
              </p>
            ) : (
              <div className="space-y-3">
                {form.match_cases.map((mc, idx) => (
                  <div
                    key={idx}
                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-800/50"
                  >
                    <div className="w-32 shrink-0">
                      <Select
                        label={idx === 0 ? "Condition" : undefined}
                        value={mc.condition || "none"}
                        onChange={(e) =>
                          handleMatchCaseChange(idx, {
                            condition: e.target.value,
                          })
                        }
                        options={CONDITION_OPTIONS}
                      />
                    </div>
                    <div className="min-w-0 flex-1">
                      <Combobox
                        label={idx === 0 ? "Rule" : undefined}
                        placeholder="Pick a rule…"
                        searchPlaceholder="Search rules…"
                        value={mc.statement}
                        options={matchCaseOptionsFor(idx)}
                        onChange={(next) =>
                          handleMatchCaseChange(idx, { statement: next })
                        }
                      />
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveMatchCase(idx)}
                      className={`shrink-0 rounded p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 ${
                        idx === 0 ? "mt-7" : "mt-1"
                      }`}
                      aria-label="Remove match condition"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </Card.Body>
        </Card>
      )}

      {/* Hint shown when a rule is assigned but no other rules exist
          to combine with — avoids rendering an empty card with no
          useful state. */}
      {form.rules && ruleOptions.length === 1 && (
        <div className="flex items-start gap-2 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3 text-xs text-slate-500 dark:border-slate-700 dark:bg-slate-800/30 dark:text-slate-400">
          <ListFilter className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          <span>
            Create at least one more rule to unlock <em>Match Conditions</em>.
          </span>
        </div>
      )}
    </div>
  );
};

ServerRulesTab.displayName = "ServerRulesTab";

export default React.memo(ServerRulesTab);
