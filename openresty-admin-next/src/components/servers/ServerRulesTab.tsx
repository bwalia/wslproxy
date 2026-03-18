"use client";

import React, { useCallback, useMemo } from "react";
import type { Dispatch, SetStateAction } from "react";
import { Plus, Trash2, ListFilter } from "lucide-react";
import Card from "@/components/ui/Card";
import Input from "@/components/ui/Input";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import type { ServerFormState } from "./types";
import { cn } from "@/lib/utils/cn";

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface ServerRulesTabProps {
  form: ServerFormState;
  setForm: Dispatch<SetStateAction<ServerFormState>>;
  ruleOptions: { value: string; label: string }[];
}

/* ── Component ─────────────────────────────────────────────────────────── */

const ServerRulesTab: React.FC<ServerRulesTabProps> = ({
  form,
  setForm,
  ruleOptions,
}) => {
  /* ── Rule assignment ─────────────────────────────────────────────── */

  const assignedSet = useMemo(() => new Set(form.rules), [form.rules]);

  const handleToggleRule = useCallback(
    (ruleId: string) => {
      setForm((prev) => {
        const current = new Set(prev.rules);
        if (current.has(ruleId)) {
          current.delete(ruleId);
        } else {
          current.add(ruleId);
        }
        return { ...prev, rules: Array.from(current) };
      });
    },
    [setForm],
  );

  /* ── Match cases ─────────────────────────────────────────────────── */

  const handleAddMatchCase = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      match_cases: [...prev.match_cases, { condition: "", statement: [] }],
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

  const handleMatchCaseConditionChange = useCallback(
    (index: number, condition: string) => {
      setForm((prev) => ({
        ...prev,
        match_cases: prev.match_cases.map((mc, i) =>
          i === index ? { ...mc, condition } : mc,
        ),
      }));
    },
    [setForm],
  );

  /* -- Statements within a match case -- */
  const handleAddStatement = useCallback(
    (mcIndex: number) => {
      setForm((prev) => ({
        ...prev,
        match_cases: prev.match_cases.map((mc, i) =>
          i === mcIndex ? { ...mc, statement: [...mc.statement, ""] } : mc,
        ),
      }));
    },
    [setForm],
  );

  const handleRemoveStatement = useCallback(
    (mcIndex: number, stmtIndex: number) => {
      setForm((prev) => ({
        ...prev,
        match_cases: prev.match_cases.map((mc, i) =>
          i === mcIndex
            ? { ...mc, statement: mc.statement.filter((_, si) => si !== stmtIndex) }
            : mc,
        ),
      }));
    },
    [setForm],
  );

  const handleStatementChange = useCallback(
    (mcIndex: number, stmtIndex: number, value: string) => {
      setForm((prev) => ({
        ...prev,
        match_cases: prev.match_cases.map((mc, i) =>
          i === mcIndex
            ? {
                ...mc,
                statement: mc.statement.map((s, si) =>
                  si === stmtIndex ? value : s,
                ),
              }
            : mc,
        ),
      }));
    },
    [setForm],
  );

  return (
    <div className="space-y-6">
      {/* ── Rule Assignment ──────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Assigned Rules
          </h2>
          <Badge variant="info" size="sm">
            {form.rules.length} assigned
          </Badge>
        </Card.Header>
        <Card.Body>
          {ruleOptions.length === 0 ? (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic py-4 text-center">
              No rules available. Create rules first to assign them to this server.
            </p>
          ) : (
            <div className="space-y-2">
              {ruleOptions.map((rule) => {
                const selected = assignedSet.has(rule.value);
                return (
                  <label
                    key={rule.value}
                    className={cn(
                      "flex items-center gap-3 rounded-lg border p-3 cursor-pointer transition-colors",
                      selected
                        ? "border-primary-300 bg-primary-50 dark:border-primary-600 dark:bg-primary-900/20"
                        : "border-slate-200 bg-white hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 dark:hover:bg-slate-800",
                    )}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => handleToggleRule(rule.value)}
                      className="h-4 w-4 rounded border-slate-300 text-primary-600 focus:ring-primary-500"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">
                        {rule.label}
                      </span>
                      <span className="ml-2 text-xs text-slate-400 dark:text-slate-500">
                        ({rule.value})
                      </span>
                    </div>
                    {selected && (
                      <Badge variant="primary" size="sm">
                        Assigned
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>
          )}
        </Card.Body>
      </Card>

      {/* ── Match Cases ──────────────────────────────────────────────── */}
      <Card>
        <Card.Header>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            Match Cases
          </h2>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleAddMatchCase}
            icon={<Plus className="h-3.5 w-3.5" />}
          >
            Add Match Case
          </Button>
        </Card.Header>
        <Card.Body>
          {form.match_cases.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500 italic py-4 text-center">
              No match cases configured. Add one to define conditional rule matching.
            </p>
          )}

          <div className="space-y-4">
            {form.match_cases.map((mc, mcIdx) => (
              <div
                key={mcIdx}
                className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ListFilter className="h-4 w-4 text-slate-400" />
                    <span className="text-sm font-medium text-slate-700 dark:text-slate-300">
                      Match Case {mcIdx + 1}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMatchCase(mcIdx)}
                    className="shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                    aria-label="Remove match case"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <Input
                  label="Condition"
                  placeholder='e.g. $uri ~ "^/api/"'
                  value={mc.condition}
                  onChange={(e) => handleMatchCaseConditionChange(mcIdx, e.target.value)}
                />

                {/* Statements */}
                <div className="space-y-2 pl-4 border-l-2 border-slate-200 dark:border-slate-700">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wide">
                      Statements
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleAddStatement(mcIdx)}
                      icon={<Plus className="h-3 w-3" />}
                    >
                      Add Statement
                    </Button>
                  </div>

                  {mc.statement.length === 0 && (
                    <p className="text-xs text-slate-400 italic">
                      No statements defined.
                    </p>
                  )}

                  {mc.statement.map((stmt, stmtIdx) => (
                    <div key={stmtIdx} className="flex items-end gap-2">
                      <div className="flex-1">
                        <Input
                          placeholder="e.g. proxy_pass http://backend"
                          value={stmt}
                          onChange={(e) =>
                            handleStatementChange(mcIdx, stmtIdx, e.target.value)
                          }
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemoveStatement(mcIdx, stmtIdx)}
                        className="mb-1 shrink-0 rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-900/20 dark:hover:text-red-400 transition-colors"
                        aria-label="Remove statement"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card.Body>
      </Card>
    </div>
  );
};

ServerRulesTab.displayName = "ServerRulesTab";

export default React.memo(ServerRulesTab);
